import test from "node:test";
import assert from "node:assert/strict";
import { verifyFirebaseIdToken, resetFirebaseKeyCache } from "../lib/firebase-auth-server.ts";
import { proxyRequest } from "../lib/wastewise-proxy.ts";

const PROJECT = "wastewise-test";
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
async function token(claims = {}, kid = "k1", key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid, typ: "JWT" })}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "user-1", email: "om@example.com", iat: now, auth_time: now, exp: now + 3600, ...claims })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(sig).toString("base64url")}`;
}
const keyServer = async (url) => {
  if (String(url).includes("securetoken@system.gserviceaccount.com"))
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } });
  return new Response(JSON.stringify({ provider: "apinex", configured: true }), { headers: { "content-type": "application/json" } });
};

test("valid Firebase tokens are accepted", async () => {
  resetFirebaseKeyCache();
  const user = await verifyFirebaseIdToken(await token(), PROJECT, { fetcher: keyServer });
  assert.deepEqual(user, { uid: "user-1", email: "om@example.com", name: null });
});
test("forged, expired, wrong-project and malformed tokens are rejected", async () => {
  resetFirebaseKeyCache();
  const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const v = async (t) => verifyFirebaseIdToken(t, PROJECT, { fetcher: keyServer });
  assert.equal(await v(await token({}, "k1", other.privateKey)), null, "signed by someone else");
  assert.equal(await v(await token({ exp: Math.floor(Date.now() / 1000) - 3600 })), null, "expired");
  assert.equal(await v(await token({ aud: "another-project" })), null, "other project");
  assert.equal(await v(await token({ iss: "https://evil.example" })), null, "wrong issuer");
  assert.equal(await v(await token({ sub: "" })), null, "no user id");
  assert.equal(await v(await token({}, "unknown-kid")), null, "unknown key");
  assert.equal(await v("not.a.token"), null);
  assert.equal(await v(""), null);
});
test("sorting works signed out; rewards need sign-in once Firebase is configured", async () => {
  resetFirebaseKeyCache();
  const env = { WASTEWISE_FIREBASE_PROJECT_ID: PROJECT, WASTEWISE_API_BASE_URL: "https://backend.example" };
  const open = await proxyRequest(new Request("http://app/api/wastewise/config"), "config", env, keyServer);
  assert.equal(open.status, 200, "config/classify/analyze stay open without login");
  const call = (headers = {}) => proxyRequest(new Request("http://app/api/wastewise/rewards/me", { headers }), "rewards/me", env, keyServer);
  const anon = await call();
  assert.equal(anon.status, 401);
  assert.equal((await anon.json()).code, "AUTH_REQUIRED");
  assert.equal((await call({ authorization: "Bearer forged.token.value" })).status, 401);
  const ok = await call({ authorization: `Bearer ${await token()}` });
  // Signed in, but no member-account store is bound here: a clear setup error, never a shared token.
  assert.equal(ok.status, 503);
  assert.equal((await ok.json()).code, "MEMBER_STORE_UNAVAILABLE");
});
test("without Firebase settings the proxy behaves as before", async () => {
  const res = await proxyRequest(new Request("http://app/api/wastewise/config"), "config", { WASTEWISE_API_BASE_URL: "https://backend.example" }, keyServer);
  assert.equal(res.status, 200);
});
