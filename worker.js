import { importSheet } from "./api/sheet-import.js";
import { SafetyGate, digest, limit } from "./safety.js";
export { SafetyGate };
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/sheet-import") return env.ASSETS.fetch(request);
    const respond = (body, status) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
    if (request.method !== "POST") return respond({error:"Use POST to import a sheet."},405);
    if (request.headers.get("Origin") !== url.origin) return respond({error:"Origin not allowed."},403);
    const allowed=await limit(request,env,"sheet",5,100,600000);
    if(!allowed.ok)return respond({error:"Too many imports. Please wait before trying again."},429);
    const reader=request.body?.getReader();
    if (!reader) return respond({error:"Missing connection settings."},400);
    let text="", size=0; const decoder=new TextDecoder();
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();return respond({error:"Connection settings are too large."},413);}text+=decoder.decode(value,{stream:true});}
    try{
      const options=JSON.parse(text+decoder.decode());
      const key=new Request("https://afkservice.sparrowtools.net/__sheet-cache/"+await digest(JSON.stringify(options)));
      const cache=caches.default;
      const existing=await cache.match(key);
      if(existing)return respond(await existing.json(),200);
      const result=await importSheet(options);
      await cache.put(key,Response.json(result,{headers:{"Cache-Control":"max-age=60"}}));
      return respond(result,200);
    }
    catch(error){return respond({error:error.message||"Import failed."},400);}
  }
};
