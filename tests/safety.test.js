import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SafetyGate } from "../safety.js";

test("import windows return the remaining wait and do not extend on rejection", async () => {
  const db = new DatabaseSync(":memory:");
  const sql = { exec(query, ...args) { const stmt = db.prepare(query); return stmt.columns().length ? stmt.all(...args) : stmt.run(...args); } };
  const gate = new SafetyGate({ storage: { sql } });
  const rules = [{ key: "source", max: 15, ms: 600000 }, { key: "global", max: 100, ms: 600000 }];
  const call = () => gate.fetch(new Request("https://internal/check", { method: "POST", body: JSON.stringify({ rules }) }));
  try {
    for (let i = 0; i < 15; i++) assert.equal((await call()).status, 204);
    const until = db.prepare("SELECT until FROM gates WHERE key='source'").get().until;
    const blocked = await call();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) >= 599);
    assert.equal(db.prepare("SELECT until FROM gates WHERE key='source'").get().until, until);
    db.prepare("UPDATE gates SET until=?").run(Date.now() - 1);
    assert.equal((await call()).status, 204);
  } finally { db.close(); }
});
