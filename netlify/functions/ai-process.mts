import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { processConversation } from "./ai-orchestrator.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  let body:any={}; try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const messages=Array.isArray(body?.messages)?body.messages:[];
  const threadKey=String(body?.threadKey||"").trim();
  if(!threadKey||!messages.length)return json({error:"Faltam threadKey ou mensagens"},400);
  try{
    const result=await processConversation({
      threadKey,
      messages,
      knownCustomer:body.knownCustomer||null,
      force:body.force===true
    });
    return json(result);
  }catch(error:any){
    const message=String(error?.message||"Não foi possível processar a conversa");
    const configError=/OPENAI_API_KEY|OPENAI_MODEL/.test(message);
    return json({error:message,code:configError?"AI_NOT_CONFIGURED":"AI_PROCESS_FAILED"},configError?503:502);
  }
};

export const config:Config={path:"/api/ai/process"};
