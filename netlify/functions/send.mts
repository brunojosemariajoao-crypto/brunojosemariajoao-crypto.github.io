import type { Context, Config } from "@netlify/functions";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { ALLOWED_ACCOUNT, getStoredCredentials, verifyDeviceToken } from "./mail-core.mts";

const SMTP_HOST="smtp.securemail.pro";
const SMTP_PORT=465;
const IMAP_HOST="mail.securemail.pro";
const IMAP_PORT=993;
function cookieToken(req:Request){const raw=req.headers.get("cookie")||"";const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";}

async function findSentFolder(client:ImapFlow):Promise<string|null>{
  const list:any[]=await client.list() as any;
  const special=list.find((x:any)=>String(x.specialUse||"").toLowerCase()==="\\sent");
  if(special?.path)return special.path;
  const named=list.find((x:any)=>/(^|\/)(sent|sent items|sent messages|enviados|enviadas)$/i.test(String(x.path||x.name||"")));
  return named?.path||null;
}

async function saveCopyToSent(user:string,password:string,mailOptions:any,messageId:string){
  const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:"unix"} as any);
  const built:any=await composer.sendMail({...mailOptions,messageId});
  const raw:Buffer=Buffer.isBuffer(built.message)?built.message:Buffer.from(String(built.message||""));
  const client=new ImapFlow({host:IMAP_HOST,port:IMAP_PORT,secure:true,auth:{user,pass:password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{
    await client.connect();
    const sentFolder=await findSentFolder(client);
    if(!sentFolder) return {saved:false,folder:null,warning:"Pasta Enviados não encontrada"};
    await client.append(sentFolder,raw,["\\Seen"],new Date());
    return {saved:true,folder:sentFolder,warning:""};
  }catch(error:any){
    return {saved:false,folder:null,warning:String(error?.message||"Não foi possível guardar a cópia em Enviados")};
  }finally{try{await client.logout();}catch{}}
}

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
    const mailOptions:any={from:user,to,subject,text,...(inReplyTo?{inReplyTo}:{}),...(references.length?{references}:{})};
    const info:any=await transporter.sendMail(mailOptions);
    const accepted=Array.isArray(info.accepted)?info.accepted.map(String):[];
    const rejected=Array.isArray(info.rejected)?info.rejected.map(String):[];
    const sentCopy=await saveCopyToSent(user,password,mailOptions,String(info.messageId||""));
    return Response.json({ok:true,messageId:info.messageId,accepted,rejected,smtpResponse:String(info.response||""),savedToSent:sentCopy.saved,sentFolder:sentCopy.folder,sentWarning:sentCopy.warning});
  }catch(error:any){return Response.json({error:String(error?.message||"Não foi possível enviar o email")},{status:400});}
};

export const config:Config={path:"/api/send"};
