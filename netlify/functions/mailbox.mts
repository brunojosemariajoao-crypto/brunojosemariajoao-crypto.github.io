import type { Config, Context } from "@netlify/functions";
import { ALLOWED_ACCOUNT, mailboxConfigured, saveMailboxConfig, validateCredentials, verifyDeviceToken } from "./mail-core.mts";

function bearer(req:Request){const h=req.headers.get("authorization")||"";return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():"";}

export default async (req:Request, context:Context)=>{
  if(req.method==="GET"){
    return Response.json({ok:true,configured:await mailboxConfigured(),account:ALLOWED_ACCOUNT});
  }
  if(req.method!=="POST") return Response.json({error:"Método não permitido"},{status:405});

  let body:any={}; try{body=await req.json();}catch{return Response.json({error:"Pedido inválido"},{status:400});}
  const email=String(body?.email||ALLOWED_ACCOUNT).trim().toLowerCase();
  const password=String(body?.password||"");
  const deviceToken=String(body?.deviceToken||"");
  if(email!==ALLOWED_ACCOUNT) return Response.json({error:"Conta de email não autorizada"},{status:403});
  if(!password||deviceToken.length<32) return Response.json({error:"Faltam dados para configurar o dispositivo"},{status:400});

  try{
    await validateCredentials(email,password);
    await saveMailboxConfig(email,password,deviceToken);
    return Response.json({ok:true,configured:true,account:email});
  }catch(error:any){
    return Response.json({error:/auth|login|password|credentials/i.test(String(error?.message||""))?"Falha de autenticação no email. Confirma a palavra-passe de geral@vitalveg.pt.":String(error?.message||"Não foi possível configurar a caixa")},{status:401});
  }
};

export const config:Config={path:"/api/mailbox"};
