import type { Context, Config } from "@netlify/functions";
import nodemailer from "nodemailer";
import { ALLOWED_ACCOUNT, getStoredCredentials, verifyDeviceToken } from "./mail-core.mts";

const SMTP_HOST="smtp.securemail.pro";
const SMTP_PORT=465;
function cookieToken(req:Request){const raw=req.headers.get("cookie")||"";const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST") return Response.json({error:"Método não permitido"},{status:405});
  if(!(await verifyDeviceToken(cookieToken(req)))) return Response.json({error:"Dispositivo não autorizado"},{status:401});

  let body:any={};try{body=await req.json();}catch{return Response.json({error:"Pedido inválido"},{status:400});}
  const to=String(body?.to||"").trim(); const subject=String(body?.subject||"").trim(); const text=String(body?.text||"").trim();
  const inReplyTo=String(body?.inReplyTo||"").trim(); const references=Array.isArray(body?.references)?body.references.filter(Boolean).map(String):[];
  if(!to||!subject||!text) return Response.json({error:"Faltam dados obrigatórios"},{status:400});

  try{
    const {email:user,password}=await getStoredCredentials();
    if(user!==ALLOWED_ACCOUNT) return Response.json({error:"Conta de email não autorizada"},{status:403});
    const transporter=nodemailer.createTransport({host:SMTP_HOST,port:SMTP_PORT,secure:true,auth:{user,pass:password},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:25000});
    const info=await transporter.sendMail({from:user,to,subject,text,...(inReplyTo?{inReplyTo}:{}),...(references.length?{references}:{})});
    return Response.json({ok:true,messageId:info.messageId});
  }catch(error:any){return Response.json({error:String(error?.message||"Não foi possível enviar o email")},{status:400});}
};

export const config:Config={path:"/api/send"};
