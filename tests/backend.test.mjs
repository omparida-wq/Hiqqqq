import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../lib/wastewise-proxy.ts";
import {
  BINS,
  binForRule,
  resultFromItem,
  safeColor,
} from "../lib/wastewise.ts";

const req = (endpoint, data, method = data ? "POST" : "GET") =>
  new Request(`http://localhost/api/wastewise/${endpoint}`, {
    method,
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
const jsonFetch =
  (body, status = 200) =>
  async () =>
    Response.json(body, { status });

test("proxy forwards the documented JSON payload and required headers", async () => {
  let called = false;
  const response = await proxyRequest(
    req("classify", { text: "banana peel" }),
    "classify",
    {},
    async (url, init) => {
      called = true;
      assert.equal(
        String(url),
        "https://harness-action-entail.ngrok-free.dev/api/classify",
      );
      assert.equal(init.method, "POST");
      assert.equal(init.headers.get("x-api-client"), "wastewise");
      assert.equal(init.headers.get("ngrok-skip-browser-warning"), "true");
      assert.equal(init.headers.get("content-type"), "application/json");
      assert.deepEqual(JSON.parse(init.body), { text: "banana peel" });
      return Response.json({ recognized: true, item: "Banana peel" });
    },
  );
  assert(called);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).item, "Banana peel");
});
test("key stays server-side and uses the explicitly configured header", async () => {
  const env = {
    WASTEWISE_API_KEY: "test-only-key",
    WASTEWISE_API_KEY_HEADER: "Authorization",
    WASTEWISE_API_KEY_PREFIX: "Bearer ",
  };
  const response = await proxyRequest(
    req("config"),
    "config",
    env,
    async (url, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer test-only-key");
      return Response.json({ configured: true });
    },
  );
  assert.equal(response.status, 200);
  assert(!(await response.text()).includes("test-only-key"));
});
test("key without a confirmed header fails clearly instead of guessing auth", async () => {
  let called = false;
  const r = await proxyRequest(
    req("config"),
    "config",
    { WASTEWISE_API_KEY: "test" },
    async () => {
      called = true;
      return Response.json({});
    },
  );
  assert.equal(r.status, 503);
  assert.equal(called, false);
});
test("proxy refuses unsupported paths, wrong methods, and invalid payloads", async () => {
  const never = () => {
    throw new Error("Should not fetch");
  };
  assert.equal(
    (await proxyRequest(req("admin"), "admin", {}, never)).status,
    404,
  );
  assert.equal(
    (await proxyRequest(req("rules", {}), "rules", {}, never)).status,
    405,
  );
  assert.equal(
    (await proxyRequest(req("classify", { text: "" }), "classify", {}, never))
      .status,
    400,
  );
  assert.equal(
    (
      await proxyRequest(
        req("analyze", { photo: { data: "javascript:alert(1)" } }),
        "analyze",
        {},
        never,
      )
    ).status,
    400,
  );
});
test("catalog allows only documented query parameters", async () => {
  const r = await proxyRequest(
    req("catalog?q=glass%20bottle&family=Metal&key=secret"),
    "catalog",
    {},
    async (url) => {
      assert.equal(url.searchParams.get("q"), "glass bottle");
      assert.equal(url.searchParams.get("family"), "Metal");
      assert.equal(url.searchParams.has("key"), false);
      return Response.json({ items: [] });
    },
  );
  assert.equal(r.status, 200);
});
test("upstream token exhaustion is an honest error, never a fake result", async () => {
  const r = await proxyRequest(
    req("analyze", { description: "bottle" }),
    "analyze",
    {},
    jsonFetch(
      { error: "Apinex (402): Free 3M tokens used. Buy a subscription" },
      502,
    ),
  );
  const body = await r.json();
  assert.equal(r.status, 502);
  assert.equal(body.code, "AI_QUOTA_EXHAUSTED");
  assert.equal(body.items, undefined);
});
test("HTML tunnel page and connection failures become actionable JSON errors", async () => {
  const r = await proxyRequest(
    req("config"),
    "config",
    {},
    async () =>
      new Response("<html>offline</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /unexpected response/);
  const offline = await proxyRequest(req("config"), "config", {}, async () => {
    throw new Error("network failed");
  });
  assert.equal(offline.status, 502);
  assert.match((await offline.json()).error, /Cannot reach/);
});
test("all eight rules map to the documented five bin colors", () => {
  assert.equal(BINS.length, 5);
  assert.equal(binForRule("R1").color, "#3b82f6");
  assert.equal(binForRule("R2").color, "#3b82f6");
  assert.equal(binForRule("R3").color, "#3b82f6");
  assert.equal(binForRule("R4").color, "#a78bfa");
  assert.equal(binForRule("R5").color, "#22c55e");
  assert.equal(binForRule("R6").color, "#eab308");
  assert.equal(binForRule("R7").color, "#eab308");
  assert.equal(binForRule("R8").color, "#ef4444");
});
test("unmapped and uncertain AI detections retain uncertainty", () => {
  const unknown = resultFromItem(
    { item: "unidentified material", certain: false, ruleId: "R999" },
    [],
  );
  assert.equal(unknown.recognized, false);
  assert.equal(unknown.certain, false);
  assert.equal(unknown.color, "#94a3b8");
  assert.equal(unknown.rule, undefined);
  assert.equal(safeColor("red; background: url(x)"), "#94a3b8");
});
test("image payload and live mode are preserved without exposing photos in output", async () => {
  const data = {
    mode: "live-frame",
    photo: { data: "data:image/jpeg;base64,AA==", mime: "image/jpeg" },
    observations: [],
  };
  const r = await proxyRequest(
    req("analyze", data),
    "analyze",
    {},
    async (url, init) => {
      assert.deepEqual(JSON.parse(init.body), data);
      return Response.json({ items: [], tagObjects: [] });
    },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { items: [], tagObjects: [] });
});
