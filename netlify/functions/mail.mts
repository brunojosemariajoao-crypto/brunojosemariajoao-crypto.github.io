import type { Context, Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { ALLOWED_ACCOUNT, fetchMailbox, getCachedMail, getStoredCredentials, saveMailboxConfig, validateCredentials, verifyDeviceToken } from "./mail-core.mts";
import { verifyAppSession } from "./app-auth-core.mts";
import { getV9MailSnapshot, syncV9Mailbox } from "./mail-v9-core.mts";

function cookieToken(req:Request){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));
  return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";
}
function deviceCookie(token:string){return `vv_device=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}
function noStore(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!["GET","POST"].includes(req.method))return noStore({error:"Método não permitido"},405);

  let token=cookieToken(req);
  let legacyAuthorized=await verifyDeviceToken(token);
  const sessionAuthorized=verifyAppSession(req);
  let authorized=legacyAuthorized||sessionAuthorized;
  let freshToken="";
  let credentials:any=null;

  if(req.method==="POST"&&!authorized){
    let body:any={};try{body=await req.json();}catch{}
    const email=String(body?.email||"").trim().toLowerCase();
    const password=String(body?.password||"");
    if(email===ALLOWED_ACCOUNT&&password){
      try{
        await validateCredentials(email,password);
        freshToken=randomBytes(32).toString("hex");
        await saveMailboxConfig(email,password,freshToken);
        credentials={email,password};authorized=true;legacyAuthorized=true;token=freshToken;
      }catch{
        return noStore({error:"Falha de autenticação no email. Confirma a palavra-passe de geral@vitalveg.pt."},401);
      }
    }
  }

  if(!authorized)return noStore({error:"Acesso VitalVeg não autorizado"},401);

  try{
    // A V9 usa uma sessão partilhada e um histórico incremental no servidor.
    // PC e telemóvel deixam de depender do cookie antigo vv_device para ler a mesma caixa.
    if(sessionAuthorized){
      if(req.method==="GET"){
        let snapshot=await getV9MailSnapshot();
        if(!snapshot){
          try{snapshot=await syncV9Mailbox();}catch{}
        }
        if(snapshot)return noStore({...snapshot,cached:true,v9:true});
      }else{
        const snapshot=await syncV9Mailbox();
        const response=noStore({...snapshot,cached:false,v9:true});
        if(freshToken)response.headers.set("Set-Cookie",deviceCookie(freshToken));
        return response;
      }
    }

    // Compatibilidade com a aplicação anterior enquanto a migração V9 não estiver concluída.
    if(req.method==="GET"){
      const cached=await getCachedMail();
      const response=noStore(cached?{...cached,cached:true}:{ok:true,cached:true,fetchedAt:null,messages:[]});
      if(freshToken)response.headers.set("Set-Cookie",deviceCookie(freshToken));
      return response;
    }
    if(!credentials)credentials=await getStoredCredentials();
    const result=await fetchMailbox(credentials.email,credentials.password);
    const response=noStore({...result,cached:false});
    if(freshToken)response.headers.set("Set-Cookie",deviceCookie(freshToken));
    return response;
  }catch(error:any){
    const msg=String(error?.message||"Não foi possível ler o email");
    const authFailed=/auth|login|password|credentials/i.test(msg);
    return noStore({error:authFailed?"Falha de autenticação no email. Atualiza a configuração da caixa.":`Erro IMAP: ${msg}`},authFailed?401:502);
  }
};

export const config:Config={path:"/api/mail"};
