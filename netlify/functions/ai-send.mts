import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { executeManagedSend } from "./managed-send-core.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  let body:any={}; try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  if(String(body?.action||"")!=="approve_and_send")return json({error:"É necessária confirmação explícita para enviar"},400);
  const queueId=String(body?.queueId||"").trim();
  const text=String(body?.text||"").trim();
  if(!queueId||!text)return json({error:"Falta a resposta ou o pedido a aprovar"},400);
  try{
    const result=await executeManagedSend(queueId,text,"human");
    return json({ok:true,...result});
  }catch(error:any){return json({error:String(error?.message||"Não foi possível enviar a resposta")},400);}
};

export const config:Config={path:"/api/ai/send"};
