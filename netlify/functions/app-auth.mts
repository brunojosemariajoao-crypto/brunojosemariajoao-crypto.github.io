import type { Config, Context } from "@netlify/functions";
import { createSessionToken, clearSessionCookie, pinConfigured, registerSharedPin, sessionCookie, verifyAppSession, verifySharedPin } from "./app-auth-core.mts";
import { mailboxConfigured, verifyDeviceToken } from "./mail-core.mts";

function legacyToken(req:Request){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));
  return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";
}
function json(body:any,status=200,cookie=""){
  const response=Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  if(cookie)response.headers.set("Set-Cookie",cookie);
  return response;
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
      const token=createSessionToken();
      return json({ok:true,registered:true,sessionValid:true},200,sessionCookie(token));
    }catch(error:any){return json({error:String(error?.message||"Não foi possível criar o PIN")},400);}
  }

  if(!(await verifySharedPin(pin)))return json({error:"PIN incorreto"},401);
  const token=createSessionToken();
  return json({ok:true,sessionValid:true},200,sessionCookie(token));
};

export const config:Config={path:"/api/auth"};
