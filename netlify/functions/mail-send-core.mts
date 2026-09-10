import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { ALLOWED_ACCOUNT, getStoredCredentials } from "./mail-core.mts";
import { formatManagedEmail } from "./ai-email-format.mts";

const SMTP_HOST="smtp.securemail.pro";
const SMTP_PORT=465;
const IMAP_HOST="mail.securemail.pro";
const IMAP_PORT=993;

export type SendMailInput={
  to:string;
  subject:string;
  text:string;
  inReplyTo?:string;
  references?:string[];
  actor?:"human"|"autonomy"|"system";
};

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
  const client=new ImapFlow({
    host:IMAP_HOST,port:IMAP_PORT,secure:true,auth:{user,pass:password},logger:false,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000
  });
  try{
    await client.connect();
    const sentFolder=await findSentFolder(client);
    if(!sentFolder)return {saved:false,folder:null,warning:"Pasta Enviados não encontrada"};
    await client.append(sentFolder,raw,["\\Seen"],new Date());
    return {saved:true,folder:sentFolder,warning:""};
  }catch(error:any){
    return {saved:false,folder:null,warning:String(error?.message||"Não foi possível guardar a cópia em Enviados")};
  }finally{try{await client.logout();}catch{}}
}

export async function sendVitalVegMail(input:SendMailInput){
  const to=String(input?.to||"").trim();
  const subject=String(input?.subject||"").trim();
  const draft=String(input?.text||"").trim();
  const inReplyTo=String(input?.inReplyTo||"").trim();
  const references=Array.isArray(input?.references)?input.references.filter(Boolean).map(String):[];
  if(!to||!subject||!draft)throw new Error("Faltam dados obrigatórios para enviar o email");

  const rendered=formatManagedEmail(draft);
  const actor=input.actor||"system";
  const {email:user,password}=await getStoredCredentials();
  if(user!==ALLOWED_ACCOUNT)throw new Error("Conta de email não autorizada");
  const transporter=nodemailer.createTransport({
    host:SMTP_HOST,port:SMTP_PORT,secure:true,auth:{user,pass:password},
    connectionTimeout:12000,greetingTimeout:12000,socketTimeout:25000
  });
  const mailOptions:any={
    from:user,to,subject,text:rendered.text,html:rendered.html,
    headers:{
      "X-VitalVeg-Managed-By":"AI-Central",
      "X-VitalVeg-AI-Mode":actor
    },
    ...(inReplyTo?{inReplyTo}:{}),
    ...(references.length?{references}:{})
  };
  const info:any=await transporter.sendMail(mailOptions);
  const accepted=Array.isArray(info.accepted)?info.accepted.map(String):[];
  const rejected=Array.isArray(info.rejected)?info.rejected.map(String):[];
  if(rejected.length && !accepted.length)throw new Error(`O servidor rejeitou o destinatário: ${rejected.join(", ")}`);
  const sentCopy=await saveCopyToSent(user,password,mailOptions,String(info.messageId||""));
  return {
    ok:true,
    messageId:String(info.messageId||""),
    accepted,
    rejected,
    smtpResponse:String(info.response||""),
    savedToSent:sentCopy.saved,
    sentFolder:sentCopy.folder,
    sentWarning:sentCopy.warning,
    finalText:rendered.text,
    finalHtml:rendered.html,
    aiManaged:true,
    actor
  };
}
