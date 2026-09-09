import type { Config, Context } from "@netlify/functions";
import { analyzeConversation } from "./ai-core.mts";

function json(body:any,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};
  try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  if(!Array.isArray(body?.messages)||!body.messages.length)return json({error:"Sem mensagens para analisar"},400);
  try{
    const result=await analyzeConversation({
      messages:body.messages,
      knownCustomer:body.knownCustomer||null,
      deliveryDays:Array.isArray(body.deliveryDays)?body.deliveryDays:[2,4,6],
      cutoff:String(body.cutoff||"14:00")
    });
    return json({ok:true,...result});
  }catch(error:any){
    const message=String(error?.message||"Não foi possível analisar a conversa");
    const configError=/OPENAI_API_KEY|OPENAI_MODEL/.test(message);
    return json({error:message,code:configError?"AI_NOT_CONFIGURED":"AI_ANALYSIS_FAILED"},configError?503:502);
  }
};

export const config:Config={path:"/api/ai/analyze"};
