import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { appendActivity } from "./ai-store.mts";
import { ensureVapid, removePushSubscription, savePushSubscription } from "./push-core.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  if(req.method==="GET"){
    try{const keys=await ensureVapid();return json({ok:true,publicKey:keys.publicKey});}
    catch(error:any){return json({error:String(error?.message||"Não foi possível preparar notificações")},500);}
  }
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const action=String(body?.action||"subscribe");
  try{
    if(action==="subscribe"){
      const value=await savePushSubscription(body.subscription);
      await appendActivity("push_subscribed",{endpoint:String(value.subscription.endpoint).slice(0,80)});
      return json({ok:true});
    }
    if(action==="unsubscribe"){
      const endpoint=String(body?.endpoint||"");await removePushSubscription(endpoint);
      await appendActivity("push_unsubscribed",{endpoint:endpoint.slice(0,80)});
      return json({ok:true});
    }
    return json({error:"Ação não suportada"},400);
  }catch(error:any){return json({error:String(error?.message||"Não foi possível configurar notificações")},400);}
};

export const config:Config={path:"/api/push"};
