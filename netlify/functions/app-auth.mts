import type { Config, Context } from "@netlify/functions";
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { createSessionToken, clearSessionCookie, pinConfigured, registerSharedPin, sessionCookie, verifyAppSession, verifySharedPin } from "./app-auth-core.mts";
import { mailboxConfigured, verifyDeviceToken } from "./mail-core.mts";

const RATE_STORE="vitalveg-v9";
const RATE_WINDOW_MS=15*60*1000;
const RATE_LOCK_MS=15*60*1000;
const MAX_ATTEMPTS=8;

function legacyToken(req:Request){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));
  return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";
}
function json(body:any,status=200,cookie="",headers:Record<string,string>={}){
  const response=Response.json(body,{status,headers:{"Cache-Control":"no-store",...headers}});
  if(cookie)response.headers.set("Set-Cookie",cookie);
  return response;
}
function clientKey(req:Request){
  const ip=(req.headers.get("x-nf-client-connection-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const ua=String(req.headers.get("user-agent")||"").slice(0,180);
  return `auth/rate/${createHash("sha256").update(`${ip}|${ua}`).digest("hex")}.json`;
}
async function rateState(req:Request){
  const s=getStore(RATE_STORE,{consistency:"strong"});
  const key=clientKey(req);
  const now=Date.now();
  const cur:any=await s.get(key,{type:"json"});
  if(!cur || now-Number(cur.windowStartedAt||0)>RATE_WINDOW_MS){
    return {s,key,now,count:0,windowStartedAt:now,lockedUntil:0};
  }
  return {
    s,key,now,
    count:Number(cur.count||0),
    windowStartedAt:Number(cur.windowStartedAt||now),
    lockedUntil:Number(cur.lockedUntil||0)
  };
}
async function checkRate(req:Request){
  const r=await rateState(req);
  if(r.lockedUntil>r.now){
    const retrySeconds=Math.max(1,Math.ceil((r.lockedUntil-r.now)/1000));
    return {blocked:true,retrySeconds,state:r};
  }
  return {blocked:false,retrySeconds:0,state:r};
}
async function recordFailure(req:Request){
  const r=await rateState(req);
  const count=r.count+1;
  const lockedUntil=count>=MAX_ATTEMPTS?r.now+RATE_LOCK_MS:0;
  await r.s.setJSON(r.key,{count,windowStartedAt:r.windowStartedAt,lockedUntil,updatedAt:r.now});
  return {count,lockedUntil};
}
async function clearFailures(req:Request){
  const r=await rateState(req);
  try{await r.s.delete(r.key);}catch{}
}

export default async (req:Request, context:Context)=>{
  if(req.method==="GET"){
    return json({ok:true,pinConfigured:await pinConfigured(),sessionValid:verifyAppSession(req),mailboxConfigured:await mailboxConfigured()});
  }
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={}; try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const action=String(body?.action||"login");
  if(action==="logout")return json({ok:true},200,clearSessionCookie());
  const pin=String(body?.pin||"").trim();

  if(action==="register"){
    if(await pinConfigured())return json({error:"O PIN partilhado já está configurado"},409);
    const legacyAuthorized=await verifyDeviceToken(legacyToken(req));
    if(!legacyAuthorized)return json({error:"A configuração inicial do PIN deve ser feita num dispositivo VitalVeg já autorizado"},401);
    try{
      await registerSharedPin(pin);
      await clearFailures(req);
      const token=createSessionToken();
      return json({ok:true,registered:true,sessionValid:true},200,sessionCookie(token));
    }catch(error:any){return json({error:String(error?.message||"Não foi possível criar o PIN")},400);}
  }

  const rate=await checkRate(req);
  if(rate.blocked){
    return json(
      {error:"Demasiadas tentativas de PIN. O acesso está temporariamente bloqueado.",code:"rate_limited",retryAfter:rate.retrySeconds},
      429,"",{"Retry-After":String(rate.retrySeconds)}
    );
  }
  if(!(await verifySharedPin(pin))){
    const failure=await recordFailure(req);
    const remaining=Math.max(0,MAX_ATTEMPTS-failure.count);
    if(!remaining){
      return json({error:"Demasiadas tentativas de PIN. Tenta novamente dentro de 15 minutos.",code:"rate_limited",remaining:0},429,"",{"Retry-After":String(Math.ceil(RATE_LOCK_MS/1000))});
    }
    return json({error:"PIN incorreto",code:"invalid_pin",remaining},401);
  }
  await clearFailures(req);
  const token=createSessionToken();
  return json({ok:true,sessionValid:true},200,sessionCookie(token));
};

export const config:Config={path:"/api/auth"};
