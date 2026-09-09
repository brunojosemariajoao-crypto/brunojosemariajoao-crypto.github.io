import type { Context, Config } from "@netlify/functions";
import { createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { accessConfigured, addDeviceToken, bootstrapAccessPin, verifyAccessPinHash, verifyDeviceToken } from "./mail-core.mts";

const STORE="vitalveg-secure";
const WINDOW_MS=15*60*1000;
const MAX_ATTEMPTS=8;

function cookieToken(req:Request){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));
  return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";
}
function deviceCookie(token:string){return `vv_device=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}
function ipKey(req:Request){
  const ip=(req.headers.get("x-nf-client-connection-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  return `access-rate-${createHash("sha256").update(ip).digest("hex")}`;
}
async function rateState(req:Request){
  const s=getStore(STORE,{consistency:"strong"});
  const key=ipKey(req);
  const now=Date.now();
  const cur=await s.get(key,{type:"json"}) as any;
  if(!cur||now-Number(cur.startedAt||0)>WINDOW_MS) return {s,key,now,count:0,startedAt:now};
  return {s,key,now,count:Number(cur.count||0),startedAt:Number(cur.startedAt||now)};
}
async function recordFailure(req:Request){
  const r=await rateState(req);
  await r.s.setJSON(r.key,{count:r.count+1,startedAt:r.startedAt,updatedAt:r.now});
  return r.count+1;
}
async function clearFailures(req:Request){
  const r=await rateState(req);
  try{await r.s.delete(r.key);}catch{}
}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST") return Response.json({error:"Método não permitido"},{status:405});
  let body:any={};try{body=await req.json();}catch{}
  const action=String(body?.action||"");
  const pinHash=String(body?.pinHash||"").toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(pinHash)) return Response.json({error:"PIN inválido"},{status:400});

  if(action==="bootstrap"){
    const current=await verifyDeviceToken(cookieToken(req));
    if(!current) return Response.json({error:"É necessário um dispositivo já autorizado",code:"authorized_device_required"},{status:401});
    try{
      await bootstrapAccessPin(pinHash);
      return Response.json({ok:true,configured:true});
    }catch(error:any){
      return Response.json({error:String(error?.message||"Não foi possível configurar o PIN"),code:"pin_mismatch"},{status:409});
    }
  }

  if(action==="login"){
    if(!(await accessConfigured())) return Response.json({error:"Acesso partilhado ainda não inicializado",code:"not_configured"},{status:409});
    const rate=await rateState(req);
    if(rate.count>=MAX_ATTEMPTS) return Response.json({error:"Demasiadas tentativas. Tenta novamente mais tarde.",code:"rate_limited"},{status:429});
    if(!(await verifyAccessPinHash(pinHash))){
      const count=await recordFailure(req);
      return Response.json({error:"PIN incorreto",code:"invalid_pin",remaining:Math.max(0,MAX_ATTEMPTS-count)},{status:401});
    }
    await clearFailures(req);
    const token=randomBytes(32).toString("hex");
    await addDeviceToken(token);
    const response=Response.json({ok:true,authorized:true});
    response.headers.set("Set-Cookie",deviceCookie(token));
    return response;
  }

  return Response.json({error:"Ação inválida"},{status:400});
};

export const config:Config={path:"/api/access"};
