import { describe, it, expect, beforeAll } from "vitest";
import {
  decodeJwt,
  validateClaims,
  verifyAccessJwt,
  isSameOriginWrite,
  assertNoDevBypassInProd,
  type AccessJwtPayload,
  type Jwk,
} from "../src/lib/access";

// ── Test crypto helpers ───────────────────────────────────────────────────
// Generate real RSA keypairs and sign real JWTs with Node's Web Crypto so the
// RS256 verification path is exercised end-to-end (no mocking of crypto.subtle).

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
    strToBase64url(JSON.stringify(header)) +
    "." +
    strToBase64url(JSON.stringify(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign(ALG, privateKey, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${bytesToBase64url(sig)}`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────
const TEAM = "novo.cloudflareaccess.com";
const ISS = `https://${TEAM}`;
const AUD = "test-aud-tag";
const NOW = 1_700_000_000; // fixed clock (unix seconds)
const EMAIL = "info@salongnovo.se";

let kp1: Keypair;
let kp2: Keypair; // wrong key

function basePayload(over: Partial<AccessJwtPayload> = {}): AccessJwtPayload {
  return {
    aud: AUD,
    email: EMAIL,
    iss: ISS,
    iat: NOW - 60,
    exp: NOW + 3600,
    ...over,
  };
}

const fakeFetchJwks =
  (keys: Jwk[]) =>
  async (_url: string): Promise<Jwk[]> =>
    keys;

beforeAll(async () => {
  kp1 = await makeKeypair("kid-1");
  kp2 = await makeKeypair("kid-2");
});

// ── decodeJwt ─────────────────────────────────────────────────────────────
describe("decodeJwt", () => {
  it("decodes a valid JWS into header/payload/signingInput/signature", async () => {
    const token = await signJwt(kp1.privateKey, { alg: "RS256", kid: "kid-1" }, basePayload());
    const d = decodeJwt(token);
    expect(d).not.toBeNull();
    expect(d!.header).toEqual({ alg: "RS256", kid: "kid-1" });
    expect(d!.payload.email).toBe(EMAIL);
    expect(d!.payload.aud).toBe(AUD);
    expect(d!.signingInput).toBe(token.split(".").slice(0, 2).join("."));
    expect(d!.signature).toBeInstanceOf(Uint8Array);
    expect(d!.signature.length).toBeGreaterThan(0);
  });

  it("returns null when not three segments", () => {
    expect(decodeJwt("a.b")).toBeNull();
    expect(decodeJwt("a.b.c.d")).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });

  it("returns null on an empty segment", () => {
    expect(decodeJwt("a..c")).toBeNull();
  });

  it("returns null on non-base64url characters", () => {
    expect(decodeJwt("!!!.###.$$$")).toBeNull();
  });

  it("returns null when header/payload is not valid JSON", () => {
    const notJson = strToBase64url("not json{");
    const sig = strToBase64url("x");
    expect(decodeJwt(`${notJson}.${notJson}.${sig}`)).toBeNull();
  });

  it("returns null when header lacks alg/kid", () => {
    const header = strToBase64url(JSON.stringify({ typ: "JWT" }));
    const payload = strToBase64url(JSON.stringify(basePayload()));
    const sig = strToBase64url("sig");
    expect(decodeJwt(`${header}.${payload}.${sig}`)).toBeNull();
  });

  it("returns null on non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(decodeJwt(null)).toBeNull();
  });
});

// ── validateClaims ────────────────────────────────────────────────────────
describe("validateClaims", () => {
  const exp = { aud: AUD, iss: ISS, now: NOW };

  it("accepts valid claims", () => {
    expect(validateClaims(basePayload(), exp)).toEqual({ ok: true });
  });

  it("accepts aud as an array containing the expected aud", () => {
    expect(validateClaims(basePayload({ aud: ["other", AUD] }), exp)).toEqual({ ok: true });
  });

  it("rejects aud mismatch (string)", () => {
    expect(validateClaims(basePayload({ aud: "wrong" }), exp)).toEqual({
      ok: false,
      reason: "aud_mismatch",
    });
  });

  it("rejects aud mismatch (array without expected)", () => {
    expect(validateClaims(basePayload({ aud: ["a", "b"] }), exp)).toEqual({
      ok: false,
      reason: "aud_mismatch",
    });
  });

  it("rejects iss mismatch", () => {
    expect(validateClaims(basePayload({ iss: "https://evil.example" }), exp)).toEqual({
      ok: false,
      reason: "iss_mismatch",
    });
  });

  it("rejects an expired token", () => {
    expect(validateClaims(basePayload({ exp: NOW - 1 }), exp)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects exp exactly equal to now (not strictly in the future)", () => {
    expect(validateClaims(basePayload({ exp: NOW }), exp)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("accepts when nbf is in the past", () => {
    expect(validateClaims(basePayload({ nbf: NOW - 10 }), exp)).toEqual({ ok: true });
  });

  it("accepts when nbf equals now", () => {
    expect(validateClaims(basePayload({ nbf: NOW }), exp)).toEqual({ ok: true });
  });

  it("rejects when nbf is in the future", () => {
    expect(validateClaims(basePayload({ nbf: NOW + 10 }), exp)).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });
});

// ── verifyAccessJwt ───────────────────────────────────────────────────────
describe("verifyAccessJwt", () => {
  const cfg = { aud: AUD, teamDomain: TEAM };

  it("verifies a correctly-signed, valid token (happy path)", async () => {
    const token = await signJwt(kp1.privateKey, { alg: "RS256", kid: "kid-1" }, basePayload());
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.identity.email).toBe(EMAIL);
      expect(res.identity.raw).toBe(token);
    }
  });

  it("returns identity with empty email when the claim is absent", async () => {
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "kid-1" },
      basePayload({ email: undefined }),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.identity.email).toBe("");
  });

  it("rejects a malformed token", async () => {
    const res = await verifyAccessJwt("not-a-jwt", cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects when the signing kid is not in the JWKS", async () => {
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "missing-kid" },
      basePayload(),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "unknown_kid" });
  });

  it("rejects a token signed with the wrong key", async () => {
    // Header says kid-1 (present in JWKS) but it's signed with kp2's private key.
    const token = await signJwt(kp2.privateKey, { alg: "RS256", kid: "kid-1" }, basePayload());
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a valid signature with the wrong aud", async () => {
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "kid-1" },
      basePayload({ aud: "wrong-aud" }),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "aud_mismatch" });
  });

  it("rejects a valid signature on an expired token", async () => {
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "kid-1" },
      basePayload({ exp: NOW - 100 }),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when the iss does not match the configured team domain", async () => {
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "kid-1" },
      basePayload({ iss: "https://other.cloudflareaccess.com" }),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "iss_mismatch" });
  });

  it("returns jwks_unavailable when the fetcher throws", async () => {
    const token = await signJwt(kp1.privateKey, { alg: "RS256", kid: "kid-1" }, basePayload());
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: async () => {
        throw new Error("network down");
      },
      now: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "jwks_unavailable" });
  });

  it("requests the correct JWKS url from the team domain", async () => {
    const token = await signJwt(kp1.privateKey, { alg: "RS256", kid: "kid-1" }, basePayload());
    let requested = "";
    await verifyAccessJwt(token, cfg, {
      fetchJwks: async (url) => {
        requested = url;
        return [kp1.pubJwk];
      },
      now: NOW,
    });
    expect(requested).toBe(`${ISS}/cdn-cgi/access/certs`);
  });

  it("uses Date.now() when deps.now is omitted (token far in the future verifies)", async () => {
    const future = Math.floor(Date.now() / 1000) + 10_000;
    const token = await signJwt(
      kp1.privateKey,
      { alg: "RS256", kid: "kid-1" },
      basePayload({ iat: Math.floor(Date.now() / 1000), exp: future }),
    );
    const res = await verifyAccessJwt(token, cfg, {
      fetchJwks: fakeFetchJwks([kp1.pubJwk]),
    });
    expect(res.ok).toBe(true);
  });
});

// ── isSameOriginWrite ─────────────────────────────────────────────────────
describe("isSameOriginWrite", () => {
  const SITE = "https://salongnovo.se";
  const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

  it("trusts Sec-Fetch-Site: same-origin", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "same-origin" }), SITE)).toBe(true);
  });

  it("trusts Sec-Fetch-Site: same-site", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "same-site" }), SITE)).toBe(true);
  });

  it("rejects Sec-Fetch-Site: cross-site", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "cross-site" }), SITE)).toBe(false);
  });

  it("rejects Sec-Fetch-Site: none", () => {
    expect(isSameOriginWrite(req({ "Sec-Fetch-Site": "none" }), SITE)).toBe(false);
  });

  it("falls back to Origin match when Sec-Fetch-Site is absent", () => {
    expect(isSameOriginWrite(req({ Origin: "https://salongnovo.se" }), SITE)).toBe(true);
  });

  it("rejects a cross-origin Origin", () => {
    expect(isSameOriginWrite(req({ Origin: "https://evil.example" }), SITE)).toBe(false);
  });

  it("rejects a malformed Origin", () => {
    expect(isSameOriginWrite(req({ Origin: "::::not-a-url" }), SITE)).toBe(false);
  });

  it("prefers Sec-Fetch-Site over Origin when both are present", () => {
    expect(
      isSameOriginWrite(
        req({ "Sec-Fetch-Site": "same-origin", Origin: "https://evil.example" }),
        SITE,
      ),
    ).toBe(true);
  });

  it("returns true when neither header is present (non-browser context)", () => {
    expect(isSameOriginWrite(req({}), SITE)).toBe(true);
  });
});

// ── assertNoDevBypassInProd ───────────────────────────────────────────────
describe("assertNoDevBypassInProd", () => {
  const base = {
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    PUBLIC_SITE_URL: "https://salongnovo.se",
    PUBLIC_IMAGE_BASE: "",
    PUBLIC_BOOKING_URL: "https://bokning.voady.se/novo",
  } as CloudflareEnv;

  it("does not throw with only dev bypass (local)", () => {
    expect(() =>
      assertNoDevBypassInProd({ ...base, DEV_ADMIN_EMAIL: EMAIL }),
    ).not.toThrow();
  });

  it("does not throw with only prod Access vars", () => {
    expect(() =>
      assertNoDevBypassInProd({ ...base, ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM }),
    ).not.toThrow();
  });

  it("does not throw when nothing is set", () => {
    expect(() => assertNoDevBypassInProd(base)).not.toThrow();
  });

  it("throws when DEV_ADMIN_EMAIL coexists with ACCESS_AUD", () => {
    expect(() =>
      assertNoDevBypassInProd({ ...base, DEV_ADMIN_EMAIL: EMAIL, ACCESS_AUD: AUD }),
    ).toThrow(/misconfiguration/i);
  });

  it("throws when DEV_ADMIN_EMAIL coexists with ACCESS_TEAM_DOMAIN", () => {
    expect(() =>
      assertNoDevBypassInProd({ ...base, DEV_ADMIN_EMAIL: EMAIL, ACCESS_TEAM_DOMAIN: TEAM }),
    ).toThrow(/misconfiguration/i);
  });
});
