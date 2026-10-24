import test from "node:test";
import assert from "node:assert/strict";

// Browser-like globals: localStorage and fetch, with a fake backend that keeps history per member.
const storage = new Map();
globalThis.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
const backend = { byToken: { "tok-A": new Map(), "tok-B": new Map() }, posts: [], down: false, delayGetMs: 0 };
globalThis.fetch = async (url, init = {}) => {
  const token = (init.headers?.Authorization || "").replace("Bearer ", "");
  const u = new URL(url, "http://app");
  if (backend.down) throw new TypeError("fetch failed");
  const store = backend.byToken[token];
  if (!store) return Response.json({ error: "Please sign in to continue.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (u.pathname === "/api/wastewise/history" && (init.method || "GET") === "GET") {
    if (backend.delayGetMs) await new Promise((r) => setTimeout(r, backend.delayGetMs));
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return Response.json({ entries: [...store.values()].reverse(), nextCursor: null });
  }
  if (u.pathname === "/api/wastewise/history" && init.method === "POST") {
    const body = JSON.parse(init.body);
    const list = body.entries || [body];
    backend.posts.push({ token, ids: list.map((e) => e.id) });
    for (const e of list) store.set(e.id, { ...store.get(e.id), ...e, createdAt: store.get(e.id)?.createdAt || Date.now() });
    return Response.json({ saved: true, ids: list.map((e) => e.id) });
  }
  return Response.json({ error: "not found" }, { status: 404 });
};
const userA = { uid: "uid-A", getIdToken: async () => "tok-A" };
const userB = { uid: "uid-B", getIdToken: async () => "tok-B" };
const userX = { uid: "uid-X", getIdToken: async () => "tok-unknown" };
const h = await import("../lib/account-history.ts");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ids = () => h.historySnapshot().entries.map((e) => e.id).sort();

test("1–2. user A saves an entry, sees it, and it is still there after reloading", async () => {
  h.historySetUser(userA); await tick(5);
  assert.equal(h.historySnapshot().status, "ready");
  assert.equal(await h.saveHistory([{ id: "a-1", item: "Plastic bottle", source: "photo", ruleId: "R1" }]), true);
  assert.deepEqual(ids(), ["a-1"]);
  h.__historyTestHooks().reset(); h.historySetUser(userA); await tick(5); // like a page reload
  assert.deepEqual(ids(), ["a-1"]);
});
test("8–9. retrying the same save does not duplicate it; a correction updates the same ID", async () => {
  await h.saveHistory([{ id: "a-1", item: "Plastic bottle", source: "photo", ruleId: "R1" }]);
  await h.saveHistory([{ id: "a-1", item: "Pizza box", source: "photo", ruleId: "R7", condition: "greasy" }]);
  assert.deepEqual(ids(), ["a-1"]);
  assert.equal(backend.byToken["tok-A"].size, 1);
  assert.equal(backend.byToken["tok-A"].get("a-1").condition, "greasy");
});
test("4–5. logout clears the screen at once and a late answer for A cannot repopulate it", async () => {
  backend.delayGetMs = 30;
  h.historySetUser({ ...userA, uid: "uid-A" }); // same user: no reload
  void h.loadHistory(false); // a slow request for A is in flight…
  h.historySignedOut(); // …when A logs out
  assert.equal(h.historySnapshot().status, "signed-out");
  assert.deepEqual(h.historySnapshot().entries, []);
  await tick(60);
  assert.deepEqual(h.historySnapshot().entries, [], "late response ignored");
  backend.delayGetMs = 0;
});
test("6–7. user B sees only B's entries, never A's, and switching back restores A's", async () => {
  h.historySetUser(userB);
  assert.deepEqual(h.historySnapshot().entries, [], "nothing from A while B loads");
  await tick(5);
  assert.deepEqual(ids(), []);
  await h.saveHistory([{ id: "b-1", item: "Banana peel", source: "text", ruleId: "R5" }]);
  assert.deepEqual(ids(), ["b-1"]);
  h.historySetUser(userA); await tick(5);
  assert.deepEqual(ids(), ["a-1"]);
});
test("10. A's pending save is never submitted as B, and is sent when A signs in again", async () => {
  backend.down = true;
  await h.saveHistory([{ id: "a-2", item: "Battery", source: "live", ruleId: "R8" }]);
  assert.equal(h.historySnapshot().pending["a-2"].status, "failed");
  backend.down = false;
  const before = backend.posts.length;
  h.historySignedOut();
  h.historySetUser(userB); await tick(5);
  await h.saveHistory([{ id: "b-2", item: "Glass jar", source: "photo", ruleId: "R4" }]);
  const asB = backend.posts.slice(before).filter((p) => p.token === "tok-B").flatMap((p) => p.ids);
  assert.ok(!asB.includes("a-2"), "A's entry never sent with B's token");
  assert.equal(h.historySnapshot().pending["a-2"], undefined, "B never sees A's queue");
  h.historySetUser(userA); await tick(20);
  assert.ok(backend.byToken["tok-A"].has("a-2"), "A's queued entry saved under A");
  assert.ok(!backend.byToken["tok-B"].has("a-2"));
  assert.deepEqual(ids(), ["a-1", "a-2"]);
});
test("11. a missing or invalid account token shows a useful state", async () => {
  h.historySetUser(userX); await tick(5);
  const s = h.historySnapshot();
  assert.equal(s.status, "error");
  assert.match(s.error, /sign in/i);
});
test("saved entries keep only allowed fields (no photos or tokens)", () => {
  const clean = h.cleanEntry({ id: "x", item: "Can", photo: "data:image/jpeg;base64,AAAA", token: "secret", ruleId: "R3" });
  assert.deepEqual(Object.keys(clean).sort(), ["id", "item", "ruleId"]);
});
