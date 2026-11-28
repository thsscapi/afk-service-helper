import { secureResponse } from "./security-headers.js";
export { SafetyGate } from "./safety.js";
// The standalone Helper is retired. Keep its source and existing browser data;
// all gameplay now lives in HT Timer and there are no public upstream proxies.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return secureResponse(Response.json({error:"AFK Service Helper is now built into HT Timer. Open httimer.sparrowtools.net."},{status:410,headers:{"Cache-Control":"no-store"}}));
    if (url.pathname === "/sw.js") return secureResponse(new Response('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.registration.unregister()));',{headers:{"Content-Type":"application/javascript","Cache-Control":"no-store"}}));
    // A temporary redirect allows a rollback while the integrated UI beds in.
    const target = new URL("https://httimer.sparrowtools.net/");
    const room = url.searchParams.get("room")?.toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(room ?? "")) target.searchParams.set("room", room);
    return secureResponse(new Response(null,{status:307,headers:{Location:target.href,"Cache-Control":"no-store"}}));
  }
};
