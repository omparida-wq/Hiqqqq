import test from "node:test";
import assert from "node:assert/strict";
import { binKeyFor, decide } from "../lib/dlc-rules.ts";
import { proxyRequest } from "../lib/wastewise-proxy.ts";

test("detector categories map onto the backend's five bins", () => {
  assert.equal(binKeyFor("Wet / Biodegradable Waste"), "wet");
  assert.equal(binKeyFor("Dry Recyclable Waste"), "dry");
  assert.equal(binKeyFor("Hazardous / E-Waste"), "special");
  assert.equal(binKeyFor("Glass collection"), "glass");
  assert.equal(binKeyFor("General Waste"), "general");
  assert.equal(binKeyFor("Needs confirmation"), null);
});
test("a dry bin accepts bottles and redirects e-waste and food", () => {
  assert.equal(decide("dry", { label: "Plastic bottle", category: "Dry Recyclable Waste" }).kind, "accept");
  const laptop = decide("dry", { label: "Laptop · Special E-waste desk", category: "Hazardous / E-Waste" });
  assert.equal(laptop.kind, "reject");
  assert.match(laptop.message, /special/i);
  const banana = decide("dry", { label: "Possible Banana · Wet Waste", category: "Wet / Biodegradable Waste" });
  assert.equal(banana.kind, "reject");
  assert.match(banana.message, /green bin/i);
  assert.equal(decide("dry", { label: "Thing", category: "Needs confirmation" }).kind, "check");
});
test("the bin list is public; bin sessions still need a login", async () => {
  const env = { WASTEWISE_FIREBASE_PROJECT_ID: "p", WASTEWISE_API_BASE_URL: "https://b.example" };
  const ok = async () => Response.json({ bins: [] });
  assert.equal((await proxyRequest(new Request("http://a/api/wastewise/dlc/bins"), "dlc/bins", env, ok)).status, 200);
  assert.equal((await proxyRequest(new Request("http://a/api/wastewise/dlc/sessions/x"), "dlc/sessions/x", env, ok)).status, 401);
});
