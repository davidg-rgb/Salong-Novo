import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  decodeJwt,
  validateClaims,
  verifyAccessJwt,
  isSameOriginWrite,
  isSet,
  assertNoDevBypassInProd,
  resolveAdminIdentity,
  type AccessEnv,
  type AccessJwtPayload,
  type Jwk,
} from "~/lib/cms/access";

// ── Test crypto helpers ───────────────────────────────────────────────────
// Real RSA keypairs signing real JWTs with Node's Web Crypto, so the RS256 path
// is exercised end-to-end. Nothing about crypto.subtle is mocked — a fake
// verifier would pass while the shipped one rejects every token.

const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBase64url(s: string): string {
  return bytesToBase64url(new TextEncoder().encode(s));
}

interface Keypair {
  privateKey: CryptoKey;
  pubJwk: Jwk;
}

async function makeKeypair(kid: string): Promise<Keypair> {
  const pair = await crypto.subtle.generateKey(
    { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
  const exported = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as {
    kty: string;
    n: string;
    e: string;
  };
  return {
    privateKey: pair.privateKey,
    pubJwk: { kid, kty: exported.kty, n: exported.n, e: exported.e, alg: "RS256" },
  };
}

async function signJwt(
  privateKey: CryptoKey,
  header: { alg: string; kid: string },
  payload: AccessJwtPayload | Record<string, unknown>,
): Promise<string> {
  const signingInput =
    strToBase64url(JSON.stringify(header)) + "." + strToBase64url(JSON.stringify(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign(ALG, privateKey, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${bytesToBase64url(sig)}`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────
const TEAM = "olmedo.cloudflareaccess.com";
const ISS = `https://${TEAM}`;
const AUD = "test-aud-tag";
const NOW = 1_800_000_000; // fixed clock (unix seconds)
const EMAIL = "hello@nicoleolmedo.com";
const KID = "kid-1";

let kp: Keypair;
let wrongKp: Keypair;

beforeAll(async () => {
  kp = await makeKeypair(KID);
  wrongKp = await makeKeypair(KID); // same kid, different key
});

function payload(over: Partial<AccessJwtPayload> = {}): AccessJwtPayload {
  return { aud: AUD, email: EMAIL, iss: ISS, iat: NOW - 60, exp: NOW + 600, ...over };
}

const jwks = (...keys: Jwk[]) => async () => keys;

/** The deps a configured resolve needs: our test JWKS and the frozen clock. */
function deps(fetchJwks: (url: string) => Promise<Jwk[]> = jwks(kp.pubJwk)) {
  return { fetchJwks, now: NOW };
}

const CONFIGURED: AccessEnv = { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM };

// ── The primitives ────────────────────────────────────────────────────────

describe("isSet — 'set' means truthy after trim", () => {
  it("treats undefined, empty and whitespace-only as UNSET", () => {
    expect(isSet(undefined)).toBe(false);
    expect(isSet("")).toBe(false);
    expect(isSet("   ")).toBe(false);
    expect(isSet("\n\t")).toBe(false);
  });
  it("treats any real value as set", () => {
    expect(isSet("x")).toBe(true);
    expect(isSet("  x  ")).toBe(true);
  });
});

describe("decodeJwt", () => {
  it("decodes a well-formed token without verifying it", async () => {
    const token = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());
    const decoded = decodeJwt(token);
    expect(decoded?.header.kid).toBe(KID);
    expect(decoded?.payload.email).toBe(EMAIL);
  });
  it("rejects structural garbage", () => {
    expect(decodeJwt("")).toBeNull();
    expect(decodeJwt("a.b")).toBeNull();
    expect(decodeJwt("a.b.c.d")).toBeNull();
    expect(decodeJwt("!!!.###.$$$")).toBeNull();
    expect(decodeJwt(`${strToBase64url("not json")}.${strToBase64url("{}")}.aa`)).toBeNull();
  });
  it("rejects a token whose header lacks alg/kid", () => {
    const bad = `${strToBase64url('{"alg":"RS256"}')}.${strToBase64url("{}")}.aa`;
    expect(decodeJwt(bad)).toBeNull();
  });
});

describe("validateClaims", () => {
  const expected = { aud: AUD, iss: ISS, now: NOW };

  it("accepts matching claims", () => {
    expect(validateClaims(payload(), expected)).toEqual({ ok: true });
  });
  it("accepts an aud ARRAY containing the expected tag", () => {
    expect(validateClaims(payload({ aud: ["other", AUD] }), expected)).toEqual({ ok: true });
  });
  it("reports the first failing reason", () => {
    expect(validateClaims(payload({ aud: "nope" }), expected)).toMatchObject({
      reason: "aud_mismatch",
    });
    expect(validateClaims(payload({ iss: "https://evil.example" }), expected)).toMatchObject({
      reason: "iss_mismatch",
    });
    expect(validateClaims(payload({ exp: NOW - 1 }), expected)).toMatchObject({
      reason: "expired",
    });
    expect(validateClaims(payload({ nbf: NOW + 60 }), expected)).toMatchObject({
      reason: "not_yet_valid",
    });
  });
});

describe("verifyAccessJwt", () => {
  it("verifies a genuinely signed token", async () => {
    const token = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM }, deps());
    expect(res).toMatchObject({ ok: true });
    if (res.ok) expect(res.identity.email).toBe(EMAIL);
  });

  it("requests the JWKS from the team domain's certs endpoint", async () => {
    const token = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());
    const seen: string[] = [];
    await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM }, {
      fetchJwks: async (url) => {
        seen.push(url);
        return [kp.pubJwk];
      },
      now: NOW,
    });
    expect(seen).toEqual([`${ISS}/cdn-cgi/access/certs`]);
  });

  it("rejects a token signed by the wrong key as bad_signature", async () => {
    const token = await signJwt(wrongKp.privateKey, { alg: "RS256", kid: KID }, payload());
    const res = await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM }, deps());
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload (signature no longer covers it)", async () => {
    const token = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());
    const [h, , s] = token.split(".");
    const forged = `${h}.${strToBase64url(JSON.stringify(payload({ email: "attacker@evil.example" })))}.${s}`;
    const res = await verifyAccessJwt(forged, { aud: AUD, teamDomain: TEAM }, deps());
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("names each distinct failure", async () => {
    const token = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());

    expect(await verifyAccessJwt("nonsense", { aud: AUD, teamDomain: TEAM }, deps())).toEqual({
      ok: false,
      reason: "malformed",
    });

    expect(
      await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM }, {
        fetchJwks: async () => {
          throw new Error("network down");
        },
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "jwks_unavailable" });

    expect(
      await verifyAccessJwt(token, { aud: AUD, teamDomain: TEAM }, deps(jwks())),
    ).toEqual({ ok: false, reason: "unknown_kid" });

    const expired = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload({ exp: NOW - 1 }));
    expect(await verifyAccessJwt(expired, { aud: AUD, teamDomain: TEAM }, deps())).toEqual({
      ok: false,
      reason: "expired",
    });

    expect(await verifyAccessJwt(token, { aud: "other-app", teamDomain: TEAM }, deps())).toEqual({
      ok: false,
      reason: "aud_mismatch",
    });
  });
});

describe("isSameOriginWrite", () => {
  const SITE = "https://nicoleolmedo.com";
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

  it("accepts same-origin and same-site fetch metadata", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "same-origin" }), SITE)).toBe(true);
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "same-site" }), SITE)).toBe(true);
  });
  it("rejects cross-site fetch metadata", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "cross-site" }), SITE)).toBe(false);
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "none" }), SITE)).toBe(false);
  });
  it("falls back to the Origin header when fetch metadata is absent", () => {
    expect(isSameOriginWrite(req({ Origin: SITE }), SITE)).toBe(true);
    expect(isSameOriginWrite(req({ Origin: "https://evil.example" }), SITE)).toBe(false);
    expect(isSameOriginWrite(req({ Origin: "not a url" }), SITE)).toBe(false);
  });
  it("fetch metadata WINS over a spoofable Origin header", () => {
    expect(
      isSameOriginWrite(req({ "Sec-Fetch-Site": "cross-site", Origin: SITE }), SITE),
    ).toBe(false);
  });
  it("accepts a request carrying neither header (non-browser, already past Access)", () => {
    expect(isSameOriginWrite(req({}), SITE)).toBe(true);
  });
});

describe("assertNoDevBypassInProd", () => {
  it("throws when the dev bypass coexists with either Access var", () => {
    expect(() =>
      assertNoDevBypassInProd({ DEV_ADMIN_EMAIL: EMAIL, ACCESS_AUD: AUD }),
    ).toThrow(/misconfiguration/i);
    expect(() =>
      assertNoDevBypassInProd({ DEV_ADMIN_EMAIL: EMAIL, ACCESS_TEAM_DOMAIN: TEAM }),
    ).toThrow(/misconfiguration/i);
  });
  it("stays silent for each var alone", () => {
    expect(() => assertNoDevBypassInProd({ DEV_ADMIN_EMAIL: EMAIL })).not.toThrow();
    expect(() => assertNoDevBypassInProd(CONFIGURED)).not.toThrow();
    expect(() => assertNoDevBypassInProd({})).not.toThrow();
  });
  it("does not fire on wrangler.toml's empty-string Access vars", () => {
    // Every environment ships ACCESS_AUD = "" — a presence check here would make
    // the local dev loop throw on every admin request.
    expect(() =>
      assertNoDevBypassInProd({ DEV_ADMIN_EMAIL: EMAIL, ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" }),
    ).not.toThrow();
  });
});

// ── The §9.7 decision table — one test per row ────────────────────────────

describe("resolveAdminIdentity — the §9.7 admin auth matrix", () => {
  async function validToken() {
    return signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload());
  }

  it("row 1 — prod, Access configured, valid JWT → authenticated via access", async () => {
    const res = await resolveAdminIdentity({
      jwt: await validToken(),
      env: CONFIGURED,
      isDevBuild: false,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "authenticated", email: EMAIL, source: "access" });
  });

  it("row 2 — prod, Access configured, JWT fails verification → rejected with the reason", async () => {
    const badSig = await signJwt(wrongKp.privateKey, { alg: "RS256", kid: KID }, payload());
    const expired = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload({ exp: NOW - 1 }));
    const wrongAud = await signJwt(kp.privateKey, { alg: "RS256", kid: KID }, payload({ aud: "other" }));
    const base = { env: CONFIGURED, isDevBuild: false, deps: deps() } as const;

    expect(await resolveAdminIdentity({ ...base, jwt: badSig })).toEqual({
      kind: "rejected",
      reason: "bad_signature",
    });
    expect(await resolveAdminIdentity({ ...base, jwt: expired })).toEqual({
      kind: "rejected",
      reason: "expired",
    });
    expect(await resolveAdminIdentity({ ...base, jwt: wrongAud })).toEqual({
      kind: "rejected",
      reason: "aud_mismatch",
    });
  });

  it("row 3 — prod, Access configured, no JWT (a direct *.workers.dev hit) → no_token", async () => {
    const res = await resolveAdminIdentity({
      jwt: null,
      env: CONFIGURED,
      isDevBuild: false,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "rejected", reason: "no_token" });
  });

  it("row 4 — exactly ONE Access var set → not_configured, never a trust downgrade", async () => {
    const audOnly = await resolveAdminIdentity({
      jwt: await validToken(),
      env: { ACCESS_AUD: AUD },
      isDevBuild: false,
      deps: deps(),
    });
    const teamOnly = await resolveAdminIdentity({
      jwt: await validToken(),
      env: { ACCESS_TEAM_DOMAIN: TEAM },
      isDevBuild: false,
      deps: deps(),
    });
    expect(audOnly).toEqual({ kind: "rejected", reason: "not_configured" });
    expect(teamOnly).toEqual({ kind: "rejected", reason: "not_configured" });
  });

  it("row 4b — a half-configured deploy never falls through to the dev bypass", async () => {
    // Half-configured + a dev email is the worst case: the deploy looks like it
    // has Access, and the bypass is sitting right there. It must not admit — the
    // coexistence tripwire fires first, which the middleware turns into a 403.
    await expect(
      resolveAdminIdentity({
        jwt: null,
        env: { ACCESS_AUD: AUD, DEV_ADMIN_EMAIL: EMAIL },
        isDevBuild: true,
        deps: deps(),
      }),
    ).rejects.toThrow(/misconfiguration/i);

    // And with no dev email in play, a dev build gets the same hard reject.
    expect(
      await resolveAdminIdentity({
        jwt: null,
        env: { ACCESS_TEAM_DOMAIN: TEAM },
        isDevBuild: true,
        deps: deps(),
      }),
    ).toEqual({ kind: "rejected", reason: "not_configured" });
  });

  it("row 5 — prod build with ACCESS unset → not_configured [FAIL CLOSED]", async () => {
    const res = await resolveAdminIdentity({
      jwt: null,
      env: {},
      isDevBuild: false,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "rejected", reason: "not_configured" });
  });

  it("row 5b — prod build with ACCESS unset REFUSES the bypass even with DEV_ADMIN_EMAIL set", async () => {
    // The inherited landmine: a bypass disarmed only by a variable being ABSENT.
    const res = await resolveAdminIdentity({
      jwt: null,
      env: { DEV_ADMIN_EMAIL: EMAIL },
      isDevBuild: false,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "rejected", reason: "not_configured" });
  });

  it("row 6 — dev bypass leaked into a configured prod env → the tripwire throws", async () => {
    await expect(
      resolveAdminIdentity({
        jwt: null,
        env: { ...CONFIGURED, DEV_ADMIN_EMAIL: EMAIL },
        isDevBuild: false,
        deps: deps(),
      }),
    ).rejects.toThrow(/misconfiguration/i);
  });

  it("row 7 — dev build with DEV_ADMIN_EMAIL → authenticated via dev", async () => {
    const res = await resolveAdminIdentity({
      jwt: null,
      env: { DEV_ADMIN_EMAIL: EMAIL, ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" },
      isDevBuild: true,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "authenticated", email: EMAIL, source: "dev" });
  });

  it("row 8 — dev build without DEV_ADMIN_EMAIL → not_configured", async () => {
    const res = await resolveAdminIdentity({
      jwt: null,
      env: { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" },
      isDevBuild: true,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "rejected", reason: "not_configured" });
  });

  it("reads empty-string and whitespace Access vars as UNSET, not as configured", async () => {
    // wrangler.toml ships both as "" in every environment; a presence check here
    // would try to verify against an empty aud and reject every real login.
    const res = await resolveAdminIdentity({
      jwt: await validToken(),
      env: { ACCESS_AUD: "   ", ACCESS_TEAM_DOMAIN: "", DEV_ADMIN_EMAIL: EMAIL },
      isDevBuild: true,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "authenticated", email: EMAIL, source: "dev" });
  });

  it("never returns an anonymous state — the outcome is authenticated or rejected", async () => {
    const cases: Array<{ env: AccessEnv; isDevBuild: boolean; jwt: string | null }> = [
      { env: {}, isDevBuild: false, jwt: null },
      { env: {}, isDevBuild: true, jwt: null },
      { env: CONFIGURED, isDevBuild: false, jwt: null },
      { env: CONFIGURED, isDevBuild: true, jwt: await validToken() },
      { env: { DEV_ADMIN_EMAIL: EMAIL }, isDevBuild: true, jwt: null },
    ];
    for (const c of cases) {
      const res = await resolveAdminIdentity({ ...c, deps: deps() });
      expect(["authenticated", "rejected"]).toContain(res.kind);
    }
  });

  it("ignores Cf-Access-Authenticated-User-Email entirely (ADR-03: header trust removed)", async () => {
    // The header is attacker-suppliable off the Access path. resolveAdminIdentity
    // takes only the JWT — there is no parameter through which a header could
    // grant identity, and an unverifiable request is rejected regardless.
    const res = await resolveAdminIdentity({
      jwt: null,
      env: CONFIGURED,
      isDevBuild: true,
      deps: deps(),
    });
    expect(res).toEqual({ kind: "rejected", reason: "no_token" });
  });

  it("does not fetch a JWKS when Access is not configured", async () => {
    const fetchJwks = vi.fn(jwks(kp.pubJwk));
    await resolveAdminIdentity({
      jwt: "whatever",
      env: { DEV_ADMIN_EMAIL: EMAIL },
      isDevBuild: true,
      deps: { fetchJwks, now: NOW },
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });
});
