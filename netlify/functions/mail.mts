import type { Context, Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { ALLOWED_ACCOUNT, fetchMailbox, getCachedMail, getStoredCredentials, saveMailboxConfig, validateCredentials, verifyDeviceToken } from "./mail-core.mts";
import { verifyAppSession } from "./app-auth-core.mts";

function cookieToken(req:Request){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("vv_device="));
  return hit?decodeURIComponent(hit.slice("vv_device=".length)):"";
}
function deviceCookie(token:string){return `vv_device=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}

export default async (req:Request, context:Context)=>{
  if(!["GET","POST"].includes(req.method))return Response.json({error:"Método não permitido"},{status:405});

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
        return Response.json({error:"Falha de autenticação no email. Confirma a palavra-passe de geral@vitalveg.pt."},{status:401});
      }
    }
  }

  if(!authorized)return Response.json({error:"Acesso VitalVeg não autorizado"},{status:401});

  try{
    if(req.method==="GET"){
      const cached=await getCachedMail();
      const response=Response.json(cached?{...cached,cached:true}:{ok:true,cached:true,fetchedAt:null,messages:[]});
      if(freshToken)response.headers.set("Set-Cookie",deviceCookie(freshToken));
      return response;
    }
    if(!credentials)credentials=await getStoredCredentials();
    const result=await fetchMailbox(credentials.email,credentials.password);
    const response=Response.json({...result,cached:false});
    if(freshToken)response.headers.set("Set-Cookie",deviceCookie(freshToken));
    return response;
  }catch(error:any){
    const msg=String(error?.message||"Não foi possível ler o email");
    const authFailed=/auth|login|password|credentials/i.test(msg);
    return Response.json({error:authFailed?"Falha de autenticação no email. Atualiza a configuração da caixa.":`Erro IMAP: ${msg}`},{status:authFailed?401:502});
  }
};

export const config:Config={path:"/api/mail"};
