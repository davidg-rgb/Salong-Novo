/**
 * Cloudflare Access — JWT verification core (pure, Web-Crypto, no `jose`).
 *
 * Every request reaching the origin for `/admin*` or `/api/admin*` has already
 * passed an Access policy at the edge; this module is the belt-and-suspenders
 * origin-side verification of the `Cf-Access-Jwt-Assertion` token plus the CSRF
 * same-origin guard and the dev-bypass misconfig tripwire.
 *
 * RS256 verification uses the Workers-native Web Crypto API (`crypto.subtle`).
 * The JWKS fetch is INJECTED (`deps.fetchJwks`) so the whole verify path is
 * testable with a local RSA keypair and a fake JWKS. See ARCHITECTURE §10.3.
 *
 * Pure: no `fetch`, no env, no I/O except through injected deps. JWT time
 * claims (`exp`/`nbf`/`iat`) are unix SECONDS — `now` is therefore in seconds.
 */

export interface AccessIdentity {
  email: string;
  raw: string;
}

export interface AccessJwtPayload {
  aud: string | string[];
  email?: string;
  iss: string;
  exp: number;
  iat: number;
  nbf?: number;
}

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg: string;
}

interface DecodedJwt {
  header: { alg: string; kid: string };
  payload: AccessJwtPayload;
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

/** base64url → Uint8Array (RFC 7515). Returns null on invalid input. */
function base64urlToBytes(input: string): Uint8Array<ArrayBuffer> | null {
  // Reject anything outside the base64url alphabet up front.
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null;
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 1) return null; // never a valid base64 length
  if (pad) b64 += "=".repeat(4 - pad);
  try {
    const bin = atob(b64);
    // Allocate over a concrete ArrayBuffer so the result is a valid BufferSource
    // for crypto.subtle (a generic Uint8Array<ArrayBufferLike> is not assignable).
    const bytes = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** base64url → UTF-8 string (for the header/payload JSON). null on invalid. */
function base64urlToString(input: string): string | null {
  const bytes = base64urlToBytes(input);
  if (!bytes) return null;
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Split + decode a compact JWS into its parts without verifying the signature.
 * `signingInput` is the raw `header.payload` (the bytes the signature covers).
 * Returns null on any structurally-malformed token.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  if (!h || !p || !s) return null;

  const headerJson = base64urlToString(h);
  const payloadJson = base64urlToString(p);
  if (headerJson === null || payloadJson === null) return null;

  let header: { alg: string; kid: string };
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(headerJson) as { alg: string; kid: string };
    payload = JSON.parse(payloadJson) as AccessJwtPayload;
  } catch {
    return null;
  }
  if (
    typeof header !== "object" ||
    header === null ||
    typeof header.alg !== "string" ||
    typeof header.kid !== "string"
  ) {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const signature = base64urlToBytes(s);
  if (!signature) return null;

  return { header, payload, signingInput: `${h}.${p}`, signature };
}

/**
 * Validate the registered claims against expectations. `now` is unix seconds.
 * `expected.iss` is the fully-qualified issuer (caller normalizes to
 * `https://<teamDomain>`). Returns the first failing reason.
 */
export function validateClaims(
  p: AccessJwtPayload,
  expected: { aud: string; iss: string; now: number },
): { ok: true } | { ok: false; reason: string } {
  const audOk = Array.isArray(p.aud)
    ? p.aud.includes(expected.aud)
    : p.aud === expected.aud;
  if (!audOk) return { ok: false, reason: "aud_mismatch" };

  if (p.iss !== expected.iss) return { ok: false, reason: "iss_mismatch" };

  if (typeof p.exp !== "number" || !(expected.now < p.exp)) {
    return { ok: false, reason: "expired" };
  }

  if (p.nbf !== undefined) {
    if (typeof p.nbf !== "number" || !(expected.now >= p.nbf)) {
      return { ok: false, reason: "not_yet_valid" };
    }
  }

  return { ok: true };
}

/**
 * Full Access JWT verification: decode → resolve JWKS → import RSA key →
 * cryptographically verify the RS256 signature → validate claims.
 *
 * `deps.fetchJwks(url)` is injected (the middleware supplies a caching fetcher;
 * tests supply a fake). `deps.now` overrides the clock (unix seconds).
 */
export async function verifyAccessJwt(
  token: string,
  cfg: { aud: string; teamDomain: string },
  deps: { fetchJwks: (url: string) => Promise<Jwk[]>; now?: number },
): Promise<{ ok: true; identity: AccessIdentity } | { ok: false; reason: string }> {
  const decoded = decodeJwt(token);
  if (!decoded) return { ok: false, reason: "malformed" };

  const iss = `https://${cfg.teamDomain}`;

  let jwks: Jwk[];
  try {
    jwks = await deps.fetchJwks(`${iss}/cdn-cgi/access/certs`);
  } catch {
    return { ok: false, reason: "jwks_unavailable" };
  }

  const jwk = jwks.find((k) => k.kid === decoded.header.kid);
  if (!jwk) return { ok: false, reason: "unknown_kid" };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "bad_key" };
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      decoded.signature,
      new TextEncoder().encode(decoded.signingInput),
    );
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const claims = validateClaims(decoded.payload, { aud: cfg.aud, iss, now });
  if (!claims.ok) return claims;

  return {
    ok: true,
    identity: { email: decoded.payload.email ?? "", raw: token },
  };
}

/**
 * CSRF same-origin guard for admin writes (§10.8). Prefers the `Sec-Fetch-Site`
 * fetch-metadata header; falls back to comparing the `Origin` header's origin to
 * the site origin. If neither header is present (non-browser / no-CORS context —
 * Access has already gated the request), returns true.
 */
export function isSameOriginWrite(
  req: { headers: Headers },
  siteUrl: string,
): boolean {
  const secFetchSite = req.headers.get("Sec-Fetch-Site");
  if (secFetchSite) {
    return secFetchSite === "same-origin" || secFetchSite === "same-site";
  }

  const origin = req.headers.get("Origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(siteUrl).origin;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Misconfig tripwire: the prod Access vars and the local dev-bypass var must
 * NEVER coexist (a dev bypass on a prod deploy would be an auth hole). Throws if
 * `DEV_ADMIN_EMAIL` is set alongside either `ACCESS_AUD` or `ACCESS_TEAM_DOMAIN`.
 */
export function assertNoDevBypassInProd(env: CloudflareEnv): void {
  if (env.DEV_ADMIN_EMAIL && (env.ACCESS_AUD || env.ACCESS_TEAM_DOMAIN)) {
    throw new Error(
      "Auth misconfiguration: DEV_ADMIN_EMAIL must not be set when ACCESS_AUD/ACCESS_TEAM_DOMAIN are configured (dev bypass + prod Access must never coexist).",
    );
  }
}
