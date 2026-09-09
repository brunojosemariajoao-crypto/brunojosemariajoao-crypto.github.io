import type { Context, Config } from "@netlify/functions";
import { appendAiSignature } from "./ai-core.mts";
import { appendActivity } from "./ai-store.mts";
import { sendVitalVegMail } from "./mail-send-core.mts";
import { authorizedRequest } from "./request-auth.mts";

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST")return Response.json({error:"Método não permitido"},{status:405});
  const auth=await authorizedRequest(req);
  if(!auth.authorized)return Response.json({error:"Acesso VitalVeg não autorizado"},{status:401});

  let body:any={};try{body=await req.json();}catch{return Response.json({error:"Pedido inválido"},{status:400});}
  const to=String(body?.to||"").trim();
  const subject=String(body?.subject||"").trim();
  const draft=String(body?.text||"").trim();
  const inReplyTo=String(body?.inReplyTo||"").trim();
  const references=Array.isArray(body?.references)?body.references.filter(Boolean).map(String):[];
  if(!to||!subject||!draft)return Response.json({error:"Faltam dados obrigatórios"},{status:400});

  try{
    const finalText=appendAiSignature(draft);
    const sent=await sendVitalVegMail({to,subject,text:finalText,inReplyTo,references});
    await appendActivity("manual_message_sent",{
      authMode:auth.mode,to,subject,inReplyTo,messageId:sent.messageId,
      savedToSent:sent.savedToSent,sentWarning:sent.sentWarning,finalText
    });
    return Response.json({...sent,managedByAi:true});
  }catch(error:any){return Response.json({error:String(error?.message||"Não foi possível enviar o email")},{status:400});}
};

export const config:Config={path:"/api/send"};
