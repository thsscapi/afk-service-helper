import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
const url="https://afkservice.sparrowtools.net/api/sheet-import";
const request=()=>new Request(url,{method:"POST",headers:{Origin:new URL(url).origin},body:JSON.stringify({spreadsheet:"test-spreadsheet"})});
test("rate-limited imports do not reach Google",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=()=>{throw Error("must not contact Google");};
  try {
    let rules;
    const response=await worker.fetch(request(),{SAFETY:{getByName:()=>({fetch:async(_url,options)=>{
      rules=JSON.parse(options.body).rules;
      return new Response(null,{status:429,headers:{"Retry-After":"245"}});
    }})}});
    assert.equal(response.status,429);
    assert.equal(rules[0].max,15);
    assert.equal(rules[1].max,100);
    assert.equal(response.headers.get("Retry-After"),"245");
    assert.equal((await response.json()).retryAfter,245);
  } finally { globalThis.fetch=original; }
});
test("cached imports do not reach Google and responses are not browser-cached",async()=>{
  const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
  globalThis.fetch=()=>{throw Error("must not contact Google");};
  globalThis.caches={default:{match:async()=>Response.json({settings:{buyerName:"Test"}})}};
  try {
    const response=await worker.fetch(request(),{SAFETY:{getByName:()=>({fetch:async()=>new Response(null,{status:204})})}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.equal((await response.json()).settings.buyerName,"Test");
  } finally { globalThis.fetch=originalFetch;globalThis.caches=originalCaches; }
});
