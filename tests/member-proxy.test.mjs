import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../lib/wastewise-proxy.ts";
import { resetFirebaseKeyCache } from "../lib/firebase-auth-server.ts";
import { resetMemberAccountsForTests } from "../lib/member-accounts.ts";

const PROJECT = "wastewise-test";
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256" };
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
async function idToken(uid, name) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid: "k1" })}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid, name, iat: now, auth_time: now, exp: now + 3600 })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(sig).toString("base64url")}`;
}
// In-memory stand-in for the D1 database.
function fakeD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => { args = a; return stmt; },
        run: async () => { if (/^INSERT OR IGNORE/.test(sql) && !rows.has(args[0])) rows.set(args[0], { member_id: args[1], member_token: args[2] }); return {}; },
        first: async () => (/^SELECT/.test(sql) ? rows.get(args[0]) ?? null : null),
      };
      return stmt;
    },
  };
}
function backend() {
  const calls = [];
  let n = 0;
  const fetcher = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === "www.googleapis.com") return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } });
    const auth = init.headers?.get ? init.headers.get("authorization") : init.headers?.Authorization;
    calls.push({ path: u.pathname + u.search, method: init.method || "GET", auth, body: init.body });
    if (u.pathname === "/api/rewards/accounts") {
      if (auth !== "Bearer ADMIN") return Response.json({ error: "forbidden" }, { status: 403 });
      n++;
      return Response.json({ user: { id: `member-${n}`, name: JSON.parse(init.body).name }, token: `member-token-${n}`, points: 0 });
    }
    if (u.pathname === "/api/history") return Response.json({ entries: [], nextCursor: null, userId: auth });
    return Response.json({ ok: true, auth });
  };
  return { calls, fetcher };
}
const env = (db, extra = {}) => ({ WASTEWISE_FIREBASE_PROJECT_ID: PROJECT, WASTEWISE_API_BASE_URL: "https://backend.example", WASTEWISE_REWARDS_ADMIN_KEY: "ADMIN", DB: db, ...extra });
const req = async (path, uid, init = {}) => new Request(`http://app/api/wastewise/${path}`, { ...init, headers: { authorization: `Bearer ${await idToken(uid, uid + " name")}`, "content-type": "application/json" } });

test("each user gets their own member, created once and reused on later logins", async () => {
  resetFirebaseKeyCache(); resetMemberAccountsForTests();
  const db = fakeD1(), b = backend();
  await proxyRequest(await req("history?limit=10", "alice"), "history", env(db), b.fetcher);
  await proxyRequest(await req("rewards/me", "alice"), "rewards/me", env(db), b.fetcher);
  await proxyRequest(await req("history", "bob"), "history", env(db), b.fetcher);
  const provisions = b.calls.filter((c) => c.path === "/api/rewards/accounts");
  assert.equal(provisions.length, 2, "one account per user, not per login");
  const forwarded = b.calls.filter((c) => c.path !== "/api/rewards/accounts");
  assert.deepEqual(forwarded.map((c) => c.auth), ["Bearer member-token-1", "Bearer member-token-1", "Bearer member-token-2"]);
  assert.equal(forwarded[0].path, "/api/history?limit=10");
  assert.ok(!b.calls.some((c) => c.path !== "/api/rewards/accounts" && c.auth === "Bearer ADMIN"), "admin key only used for provisioning");
});
test("no shared token fallback: missing admin key or database gives a clear configuration error", async () => {
  resetFirebaseKeyCache(); resetMemberAccountsForTests();
  const b = backend();
  const noKey = await proxyRequest(await req("rewards/me", "carol"), "rewards/me", env(fakeD1(), { WASTEWISE_REWARDS_ADMIN_KEY: undefined, WASTEWISE_REWARD_TOKEN: "shared" }), b.fetcher);
  assert.equal(noKey.status, 503);
  assert.equal((await noKey.json()).code, "MEMBER_PROVISIONING_NOT_CONFIGURED");
  const noDb = await proxyRequest(await req("history", "carol"), "history", env(undefined), b.fetcher);
  assert.equal(noDb.status, 503);
  assert.ok(!b.calls.some((c) => c.auth === "Bearer shared"));
});
test("history saves are validated and stripped before reaching the backend", async () => {
  resetFirebaseKeyCache(); resetMemberAccountsForTests();
  const db = fakeD1(), b = backend();
  const post = async (body) => proxyRequest(await req("history", "dan", { method: "POST", body: JSON.stringify(body) }), "history", env(db), b.fetcher);
  assert.equal((await post({ id: "e-1", item: "Can", source: "photo", photo: "data:image/jpeg;base64,AAA", token: "x" })).status, 200);
  const sent = JSON.parse(b.calls.find((c) => c.method === "POST" && c.path === "/api/history").body);
  assert.deepEqual(Object.keys(sent).sort(), ["id", "item", "source"]);
  assert.equal((await post({ id: "bad id!", item: "Can" })).status, 400);
  assert.equal((await post({ id: "e-2", item: "" })).status, 400);
  assert.equal((await post({ id: "e-3", item: "Can", source: "camera" })).status, 400);
  assert.equal((await post({ entries: [] })).status, 400);
  assert.equal((await post({ entries: Array.from({ length: 31 }, (_, i) => ({ id: `e${i}`, item: "x" })) })).status, 400);
  assert.equal((await post({ id: "e-4", item: "Can", notes: "x".repeat(17000) })).status, 413);
});
test("signed-out requests to account data are refused", async () => {
  const r = await proxyRequest(new Request("http://app/api/wastewise/history"), "history", env(fakeD1()), backend().fetcher);
  assert.equal(r.status, 401);
});
