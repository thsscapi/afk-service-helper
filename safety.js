export class SafetyGate {
  constructor(ctx){this.sql=ctx.storage.sql;this.sql.exec("CREATE TABLE IF NOT EXISTS gates (key TEXT PRIMARY KEY,n INTEGER NOT NULL,until INTEGER NOT NULL)");}
  async fetch(request){
    const data=await request.json(), now=Date.now();
    this.sql.exec("DELETE FROM gates WHERE until<=?",now);
    if(data.dedupe){
      const key="dedupe:"+data.dedupe;
      if([...this.sql.exec("SELECT n FROM gates WHERE key=?",key)].length)return new Response(null,{status:409});
      this.sql.exec("INSERT INTO gates VALUES(?,1,?)",key,now+86400000);
      return new Response(null,{status:204});
    }
    const rules=data.rules;
    for(const rule of rules){
      const row=[...this.sql.exec("SELECT n FROM gates WHERE key=?",rule.key)][0];
      if((row?.n??0)>=rule.max)return new Response(null,{status:429,headers:{"Retry-After":"60"}});
    }
    for(const rule of rules)this.sql.exec("INSERT INTO gates VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1",rule.key,now+rule.ms);
    return new Response(null,{status:204});
  }
}
export async function digest(value){
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function limit(request,env,kind,perIp,globalMax,ms){
  const ip=await digest(request.headers.get("CF-Connecting-IP")??"unknown");
  return env.SAFETY.getByName("limits").fetch("https://internal/check",{method:"POST",body:JSON.stringify({rules:[{key:kind+":"+ip,max:perIp,ms},{key:kind+":global",max:globalMax,ms}]})});
}
