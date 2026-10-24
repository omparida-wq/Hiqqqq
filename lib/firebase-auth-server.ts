// Verifies Firebase Authentication ID tokens on the server (Cloudflare Workers / Node),
// using Google's public signing keys and the Web Crypto API. No service account is needed.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type FirebaseUser = { uid: string; email: string | null; name: string | null };

let cache: { keys: Record<string, CryptoKey>; expires: number } | null = null;

function b64urlBytes(part: string) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
}

async function signingKeys(fetcher: typeof fetch, refresh = false) {
  if (!refresh && cache && Date.now() < cache.expires) return cache.keys;
  const res = await fetcher(JWKS_URL);
  if (!res.ok) throw new Error(`Could not load Firebase signing keys (${res.status}).`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const out: Record<string, CryptoKey> = {};
  for (const jwk of keys)
    out[jwk.kid] = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  cache = { keys: out, expires: Date.now() + Math.min(maxAge, 86400) * 1000 };
  return out;
}

/** Returns the signed-in user, or null if the token is missing, forged, expired or for another project. */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  { fetcher = fetch, now = Date.now() }: { fetcher?: typeof fetch; now?: number } = {},
): Promise<FirebaseUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || !projectId) return null;
  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  let keys = await signingKeys(fetcher);
  if (!keys[header.kid]) keys = await signingKeys(fetcher, true); // keys rotate
  const key = keys[header.kid];
  if (!key) return null;
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;
  const seconds = now / 1000, skew = 300;
  const num = (v: unknown) => (typeof v === "number" ? v : NaN);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!(num(payload.exp) > seconds - skew)) return null;
  if (!(num(payload.iat) <= seconds + skew)) return null;
  if (!(num(payload.auth_time) <= seconds + skew)) return null;
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return /^Bearer\s+(.+)$/i.exec(value)?.[1]?.trim() || "";
}

/** Only for tests. */
export function resetFirebaseKeyCache() {
  cache = null;
}
