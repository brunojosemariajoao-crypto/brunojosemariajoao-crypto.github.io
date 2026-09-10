export const AI_SIGNATURE_TITLE="VitalVeg · Central Inteligente de Comunicações";
export const AI_SIGNATURE_HUMAN_COPY="Esta mensagem foi analisada e preparada pelo nosso sistema autónomo com recurso a Inteligência Artificial e validada antes do envio.";
export const AI_SIGNATURE_AUTONOMOUS_COPY="Esta mensagem foi analisada, preparada e enviada automaticamente pelo nosso sistema autónomo com recurso a Inteligência Artificial, de acordo com as regras operacionais da VitalVeg.";
export const AI_SIGNATURE_SYSTEM_COPY="Esta mensagem foi gerida pela Central Inteligente VitalVeg com recurso a Inteligência Artificial e enviada através do nosso sistema digital.";

export type ManagedMailActor="human"|"autonomy"|"system";

function escapeHtml(value:any){
  return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]||ch));
}
function signatureCopy(actor:ManagedMailActor){
  if(actor==="autonomy")return AI_SIGNATURE_AUTONOMOUS_COPY;
  if(actor==="human")return AI_SIGNATURE_HUMAN_COPY;
  return AI_SIGNATURE_SYSTEM_COPY;
}

export function stripManagedSignature(text:any){
  const value=String(text||"").trim();
  const marker=AI_SIGNATURE_TITLE;
  const index=value.indexOf(marker);
  if(index<0)return value;
  return value.slice(0,index).replace(/[\s—-]+$/g,"").trim();
}

export function managedText(text:any,actor:ManagedMailActor="system"){
  const clean=stripManagedSignature(text);
  const body=clean?`${clean}\n\n—\n`:"";
  return `${body}${AI_SIGNATURE_TITLE}\n${signatureCopy(actor)}`;
}

export function managedHtml(text:any,actor:ManagedMailActor="system"){
  const clean=stripManagedSignature(text);
  const body=escapeHtml(clean).replace(/\n/g,"<br>");
  const separator=body?'<div style="height:20px"></div>':'';
  return `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#17251f;font-size:15px;line-height:1.55"><div style="max-width:680px">${body}${separator}<div style="border-top:1px solid #d9e6df;padding-top:12px;margin-top:4px"><div style="font-size:13px;font-weight:700;color:#16643f">${escapeHtml(AI_SIGNATURE_TITLE)}</div><div style="margin-top:4px;font-size:11px;line-height:1.45;color:#6a7a72">${escapeHtml(signatureCopy(actor))}</div></div></div></body></html>`;
}

export function formatManagedEmail(text:any,actor:ManagedMailActor="system"){
  return {text:managedText(text,actor),html:managedHtml(text,actor)};
}
