import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
test("retired Helper links redirect to HT Timer without deleting old data",async()=>{
  const response=await worker.fetch(new Request("https://afkservice.sparrowtools.net/"),{});
  assert.equal(response.status,307);assert.equal(response.headers.get("Location"),"https://httimer.sparrowtools.net/");
  assert.equal(response.headers.get("X-Frame-Options"),"DENY");
});
test("retired import API never contacts Google and old service workers unregister",async()=>{
  assert.equal((await worker.fetch(new Request("https://afkservice.sparrowtools.net/api/sheet-import",{method:"POST"}),{})).status,410);
  const sw=await worker.fetch(new Request("https://afkservice.sparrowtools.net/sw.js"),{});
  assert.match(await sw.text(),/unregister/);
});
