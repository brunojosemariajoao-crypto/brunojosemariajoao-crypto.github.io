import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { appendActivity, getQueueItem, listQueue, setQueueStatus } from "./ai-store.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  if(req.method==="GET"){
    const url=new URL(req.url);
    const id=String(url.searchParams.get("id")||"").trim();
    if(id){const item=await getQueueItem(id);return item?json({ok:true,item}):json({error:"Pedido não encontrado"},404);}
    return json({ok:true,items:await listQueue(String(url.searchParams.get("status")||"open"))});
  }
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const id=String(body?.id||body?.queueId||"").trim();
  const action=String(body?.action||"").trim();
  if(!id||!["reject","resolve"].includes(action))return json({error:"Ação inválida"},400);
  const item=await getQueueItem(id);
  if(!item)return json({error:"Pedido não encontrado"},404);
  if(item.status!=="open")return json({error:"Este pedido já foi tratado"},409);
  const status=action==="reject"?"rejected":"resolved";
  const updated=await setQueueStatus(id,status);
  await appendActivity(action==="reject"?"ai_suggestion_rejected":"queue_resolved",{
    queueId:id,threadKey:item.threadKey,orderId:item.orderId,
    reason:String(body?.reason||"").trim()||null,
    previousSuggestion:item.suggestedReply
  });
  return json({ok:true,item:updated});
};

export const config:Config={path:"/api/ai/queue"};
