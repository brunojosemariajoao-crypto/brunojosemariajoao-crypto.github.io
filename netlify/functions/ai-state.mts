import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { listActivity, listOrders, listQueue, getAutonomyPolicy } from "./ai-store.mts";
import { getAiOperationMode } from "./ai-mode.mts";
import { listShadowEvaluations, summarizeShadow } from "./ai-shadow-core.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
function localDateKey(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async (req:Request, context:Context)=>{
  if(req.method!=="GET")return json({error:"Método não permitido"},405);
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  try{
    const [orders,queue,activity,policy,operationMode,shadow]=await Promise.all([
      listOrders(),listQueue("open"),listActivity(),getAutonomyPolicy(),getAiOperationMode(),listShadowEvaluations(100)
    ]);
    const today=localDateKey();
    const upcoming=orders.filter(o=>o.deliveryDate && o.deliveryDate>=today && !["cancelled","historical"].includes(o.status));
    const dates=[...new Set(upcoming.map(o=>o.deliveryDate).filter(Boolean))].sort();
    const nextDelivery=dates[0]||null;
    const nextOrders=nextDelivery?upcoming.filter(o=>o.deliveryDate===nextDelivery):[];
    return json({
      ok:true,
      generatedAt:new Date().toISOString(),
      operationMode,
      shadowSummary:summarizeShadow(shadow),
      recentShadow:shadow.slice(0,12),
      summary:{
        nextDelivery,
        nextDeliveryOrders:nextOrders.length,
        needsMe:queue.length,
        review:queue.filter(x=>x.kind==="review").length,
        approvals:queue.filter(x=>x.kind==="approval").length,
        activeOrders:upcoming.length
      },
      nextOrders,
      needsMe:queue,
      recentActivity:activity,
      policy
    });
  }catch(error:any){return json({error:String(error?.message||"Não foi possível obter o estado da Central")},500);}
};

export const config:Config={path:"/api/ai/state"};
