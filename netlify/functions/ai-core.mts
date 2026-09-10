import { createHash } from "node:crypto";
import { cleanCurrentMailText } from "./mail-text.mts";

declare const Netlify: any;

export const AI_SIGNATURE = [
  "VitalVeg · Central Inteligente de Comunicações",
  "Esta mensagem foi analisada e preparada pelo nosso sistema autónomo com recurso a Inteligência Artificial e validada antes do envio."
].join("\n");

export type MailInput = {
  id?: string;
  messageId?: string;
  date?: string;
  direction?: "in"|"out";
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
};

export type AnalysisRequest = {
  messages: MailInput[];
  knownCustomer?: { name?: string; store?: string; email?: string } | null;
  deliveryDays?: number[];
  cutoff?: string;
};

const itemSchema:any = {
  type:"object",
  additionalProperties:false,
  required:["quantity","unit","product","normalizedProduct","notes","confidence","rawLine","operation"],
  properties:{
    quantity:{type:["number","string","null"]},
    unit:{type:["string","null"]},
    product:{type:"string"},
    normalizedProduct:{type:["string","null"]},
    notes:{type:["string","null"]},
    confidence:{type:"number",minimum:0,maximum:1},
    rawLine:{type:"string"},
    operation:{type:"string",enum:["set","add","subtract","remove","keep","unknown"]}
  }
};

const schema:any = {
  type:"object",
  additionalProperties:false,
  required:[
    "messageType","confidence","needsHumanReview","reviewReasons",
    "customerName","customerEmail","storeName","threadIntent",
    "orderAction","changeMode","deliveryDateExplicit","deliveryRequestText",
    "items","availabilityMentions","commercialRisk","complaintSummary",
    "requestedAnswer","suggestedReply","threadSummary","sourceMessageIds"
  ],
  properties:{
    messageType:{type:"string",enum:[
      "ENCOMENDA","ALTERACAO_ENCOMENDA","PEDIDO_CONFIRMACAO",
      "PROBLEMA_RECLAMACAO","DOCUMENTO_FATURA","PEDIDO_INFORMACAO",
      "PUBLICIDADE_MARKETING","AUTOMATICO_SISTEMA","SEM_ACAO",
      "CONVERSA_REVER","OUTRO_REVER"
    ]},
    confidence:{type:"number",minimum:0,maximum:1},
    needsHumanReview:{type:"boolean"},
    reviewReasons:{type:"array",items:{type:"string"}},
    customerName:{type:["string","null"]},
    customerEmail:{type:["string","null"]},
    storeName:{type:["string","null"]},
    threadIntent:{type:"string"},
    orderAction:{type:"string",enum:["none","create","amend","cancel","confirm"]},
    changeMode:{type:"string",enum:["none","full_snapshot","delta","unknown"]},
    deliveryDateExplicit:{type:["string","null"]},
    deliveryRequestText:{type:["string","null"]},
    items:{type:"array",items:itemSchema},
    availabilityMentions:{type:"array",items:{type:"string"}},
    commercialRisk:{type:"string",enum:["low","medium","high"]},
    complaintSummary:{type:["string","null"]},
    requestedAnswer:{type:["string","null"]},
    suggestedReply:{type:["string","null"]},
    threadSummary:{type:"string"},
    sourceMessageIds:{type:"array",items:{type:"string"}}
  }
};

function compactMessages(messages:MailInput[]){
  return messages.slice(-16).map(m=>({
    id:m.id||m.messageId||"",
    messageId:m.messageId||"",
    date:m.date||"",
    direction:m.direction||"in",
    from:m.from||"",
    to:m.to||"",
    subject:m.subject||"",
    text:cleanCurrentMailText(m.text||"")
  }));
}

export function appendAiSignature(text:string){
  const clean=String(text||"").trim();
  if(!clean)return AI_SIGNATURE;
  if(clean.includes("Central Inteligente de Comunicações"))return clean;
  return `${clean}\n\n—\n${AI_SIGNATURE}`;
}

export function requestFingerprint(input:AnalysisRequest){
  return createHash("sha256")
    .update(JSON.stringify(compactMessages(input.messages||[])))
    .digest("hex");
}

const BASE_INSTRUCTIONS=`És o funcionário digital da VitalVeg. Analisa a conversa comercial completa em português de Portugal e devolve apenas dados estruturados.

OBJETIVO
Transformar mensagens em ações operacionais sem perder informação. O email é a fonte; a encomenda consolidada é o resultado.

REGRAS CRÍTICAS
- Nunca inventes artigos, quantidades, unidades, datas, disponibilidade, preços ou decisões.
- Não uses uma lista fechada de produtos. Qualquer artigo pedido pelo cliente é válido.
- Preserva SEMPRE a formulação original em rawLine.
- Se uma expressão parecer improvável ou tiver possível erro de escrita, não a apagues nem a corrijas silenciosamente. Mantém rawLine, interpreta apenas se houver contexto suficiente e baixa a confidence da linha.
- Numa nova encomenda, usa changeMode=full_snapshot e operation=set para cada linha.
- Numa alteração RE:, decide se o cliente está a repetir a encomenda completa (full_snapshot) ou apenas a mudar linhas (delta).
- Em delta: "mais 2" => add; "menos/retirar 2" => subtract; "passa para/só 1" => set; "sem/cancelar este artigo" => remove. Se não for inequívoco => unknown e needsHumanReview=true.
- Não transformes um simples agradecimento ou confirmação numa nova encomenda.
- Uma mensagem histórica não pode criar uma encomenda futura só porque está a ser analisada hoje.
- Extrai a data solicitada pelo cliente apenas quando explícita. deliveryDateExplicit deve ser YYYY-MM-DD ou null. Se o cliente disser apenas "quinta", guarda a expressão em deliveryRequestText e não inventes a data se o contexto não for inequívoco.
- Dias habituais de entrega são terça, quinta e sábado. O motor de regras do servidor resolverá a data final e o corte das 14:00.
- suggestedReply deve ser curta, profissional e natural. Não prometas disponibilidade não confirmada.
- Não acrescentes a assinatura de IA; o servidor acrescenta-a no envio.
- Se confidence global < 0.90, qualquer item < 0.90, changeMode=unknown, operation=unknown, reclamação, indisponibilidade, pedido comercial fora da rotina ou contradição no histórico: needsHumanReview=true.
- commercialRisk=high para reclamações sensíveis, descontos/preços fora do normal, cancelamentos ambíguos ou decisões que possam causar prejuízo; medium para indisponibilidade/alteração ambígua; low para confirmações normais e encomendas claras.
- sourceMessageIds deve referenciar apenas mensagens que suportam a decisão atual.
- threadSummary deve explicar em 1-3 frases o estado atual da conversa para um operador humano.`;

function outputText(data:any){
  if(typeof data?.output_text==="string" && data.output_text.trim())return data.output_text.trim();
  const parts:any[]=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    if(item?.type!=="message")continue;
    for(const part of Array.isArray(item?.content)?item.content:[]){
      if(part?.type==="output_text" && typeof part?.text==="string")parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function normalizeAnalysis(parsed:any){
  if(parsed.suggestedReply)parsed.suggestedReply=String(parsed.suggestedReply).trim();
  if(!Array.isArray(parsed.reviewReasons))parsed.reviewReasons=[];
  if(!Array.isArray(parsed.items))parsed.items=[];
  if(parsed.items.some((item:any)=>Number(item?.confidence||0)<0.90 || item?.operation==="unknown")){
    parsed.needsHumanReview=true;
    if(!parsed.reviewReasons.includes("Existe pelo menos uma linha de encomenda com interpretação incerta.")){
      parsed.reviewReasons.push("Existe pelo menos uma linha de encomenda com interpretação incerta.");
    }
  }
  return parsed;
}

async function runModel(apiKey:string,model:string,input:any,reviewOf:any=null){
  const reviewer=reviewOf?`\n\nSEGUNDA LEITURA\nRecebeste também a análise preliminar de outro modelo. Revê-a contra as mensagens originais. Não a aceites por autoridade. Corrige apenas quando o texto do cliente sustentar a correção. Se continuar ambíguo, mantém a ambiguidade e exige revisão humana.`:"";
  const body:any={
    model,
    store:false,
    reasoning:{effort:reviewOf?"medium":"low"},
    max_output_tokens:5000,
    instructions:BASE_INSTRUCTIONS+reviewer,
    input:JSON.stringify({...input,...(reviewOf?{preliminaryAnalysis:reviewOf}:{})}),
    text:{verbosity:"low",format:{type:"json_schema",name:"vitalveg_mail_analysis_v3",strict:true,schema}}
  };
  const res=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||`Falha IA (${res.status})`);
  const text=outputText(data);
  if(!text)throw new Error("A IA não devolveu análise estruturada");
  return {analysis:normalizeAnalysis(JSON.parse(text)),model:data.model||model,responseId:data.id||null,usage:data.usage||null};
}

function norm(value:any){return String(value??"").trim().toLowerCase().replace(/\s+/g," ");}
function qty(value:any){return value===null||value===undefined?"":String(value).replace(",",".").trim();}
function itemCritical(item:any){
  return {
    raw: norm(item?.rawLine),
    product:norm(item?.normalizedProduct||item?.product),
    unit:norm(item?.unit),
    quantity:qty(item?.quantity),
    operation:String(item?.operation||"")
  };
}
export function criticalSignature(analysis:any){
  return JSON.stringify({
    messageType:analysis?.messageType||"",
    orderAction:analysis?.orderAction||"",
    changeMode:analysis?.changeMode||"",
    deliveryDateExplicit:analysis?.deliveryDateExplicit||null,
    items:(analysis?.items||[]).map(itemCritical).sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  });
}

export function shouldEscalateAnalysis(analysis:any){
  if(!analysis)return true;
  if(["PROBLEMA_RECLAMACAO"].includes(analysis.messageType))return false;
  if(Number(analysis.confidence||0)<0.95)return true;
  if(["CONVERSA_REVER","OUTRO_REVER"].includes(analysis.messageType))return true;
  if(analysis.changeMode==="unknown")return true;
  if((analysis.items||[]).some((x:any)=>Number(x?.confidence||0)<0.92 || x?.operation==="unknown"))return true;
  if(analysis.orderAction!=="none" && Number(analysis.confidence||0)<0.97)return true;
  return false;
}

function markModelDisagreement(primary:any,secondary:any){
  if(criticalSignature(primary)===criticalSignature(secondary))return {analysis:secondary,disagreement:false};
  const reason="Duas leituras de IA discordaram em dados operacionais da mensagem. Confirma a interpretação antes de executar.";
  secondary.needsHumanReview=true;
  secondary.reviewReasons=[...new Set([...(secondary.reviewReasons||[]),reason])];
  secondary.confidence=Math.min(Number(secondary.confidence||0),0.79);

  // Nenhuma linha identificada na primeira leitura pode desaparecer silenciosamente na segunda.
  const secondaryKeys=new Set((secondary.items||[]).map((x:any)=>`${norm(x?.rawLine)}|${norm(x?.product)}|${norm(x?.unit)}`));
  for(const item of primary.items||[]){
    const key=`${norm(item?.rawLine)}|${norm(item?.product)}|${norm(item?.unit)}`;
    if(!secondaryKeys.has(key)){
      secondary.items.push({...item,confidence:Math.min(Number(item?.confidence||0),0.55),operation:"unknown",notes:[item?.notes,"Linha preservada devido a divergência entre modelos."].filter(Boolean).join(" · ")});
    }
  }
  for(const item of secondary.items||[]){
    item.confidence=Math.min(Number(item?.confidence||0),0.79);
  }
  return {analysis:secondary,disagreement:true};
}

export async function analyzeConversation(input:AnalysisRequest){
  const apiKey=Netlify.env.get("OPENAI_API_KEY");
  if(!apiKey)throw new Error("OPENAI_API_KEY não configurada");

  const primaryModel=Netlify.env.get("OPENAI_PRIMARY_MODEL")||Netlify.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  const escalationModel=Netlify.env.get("OPENAI_ESCALATION_MODEL")||"gpt-5.6-terra";
  const messages=compactMessages(input.messages||[]);
  if(!messages.length)throw new Error("Sem mensagens para analisar");

  const modelInput={
    knownCustomer:input.knownCustomer||null,
    deliveryDays:input.deliveryDays||[2,4,6],
    cutoff:input.cutoff||"14:00",
    messages
  };

  const primary=await runModel(apiKey,primaryModel,modelInput);
  const calls:any[]=[{model:primary.model,responseId:primary.responseId,usage:primary.usage,role:"primary"}];
  let chosen=primary.analysis;
  let escalated=false;
  let disagreement=false;

  if(escalationModel && escalationModel!==primaryModel && shouldEscalateAnalysis(primary.analysis)){
    const secondary=await runModel(apiKey,escalationModel,modelInput,primary.analysis);
    calls.push({model:secondary.model,responseId:secondary.responseId,usage:secondary.usage,role:"reviewer"});
    const compared=markModelDisagreement(primary.analysis,secondary.analysis);
    chosen=compared.analysis;
    escalated=true;
    disagreement=compared.disagreement;
  }

  return {
    analysis:chosen,
    model:calls.at(-1)?.model||primaryModel,
    responseId:calls.at(-1)?.responseId||null,
    usage:calls.at(-1)?.usage||null,
    calls,
    escalated,
    disagreement,
    fingerprint:requestFingerprint(input)
  };
}
