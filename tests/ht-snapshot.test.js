import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInitialState, startRun, recordBuyerDeath, getPendingDeaths, BODY_PARTS, SAFE_WINDOW, resCooldown, tlCooldown } from "../src/engine.js";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const snapshotFunction = app.slice(app.indexOf("function htSnapshot()"), app.indexOf("async function sendHt("));
function snapshot(state) {
  return runInNewContext(`${snapshotFunction}\nhtSnapshot()`, { state, getPendingDeaths, BODY_PARTS, SAFE_WINDOW, resCooldown, tlCooldown });
}

test("HT sharing omits an unconfigured buyer even with a stale deadline", () => {
  const state = startRun(createInitialState({ buyerName: "", tlUsers: [] }));
  state.run.buyerDeadlineAt = Date.now() + SAFE_WINDOW;
  const result = snapshot(state);
  assert.equal(result.rows.some(row => row.kind === "Buyer Death"), false);
  assert.equal(result.rows.filter(row => row.kind === "Resurrection").length, 2);
  assert.ok(result.rows.some(row => row.kind === "Runner Death"));
});

test("HT sharing still includes a configured buyer and its death deadline", () => {
  const state = recordBuyerDeath(startRun(createInitialState({ buyerName: "Named Buyer" })));
  const row = snapshot(state).rows.find(row => row.kind === "Buyer Death");
  assert.equal(row.name, "Named Buyer");
  assert.equal(row.endsAt, state.run.buyerDeadlineAt);
});
