import { cp, mkdir } from "node:fs/promises";
await mkdir("cloudflare-assets",{recursive:true});
for(const name of ["index.html","styles.css","src","assets","sw.js","manifest.webmanifest","_headers"]){
  await cp(name,"cloudflare-assets/"+name,{recursive:true});
}
