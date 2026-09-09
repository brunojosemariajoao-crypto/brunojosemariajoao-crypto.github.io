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

export async function analyzeConversation(input:AnalysisRequest){
  const apiKey=Netlify.env.get("OPENAI_API_KEY");
  const model=Netlify.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  if(!apiKey)throw new Error("OPENAI_API_KEY não configurada");

  const messages=compactMessages(input.messages||[]);
  if(!messages.length)throw new Error("Sem mensagens para analisar");

  const instructions=`És o funcionário digital da VitalVeg. Analisa a conversa comercial completa em português de Portugal e devolve apenas dados estruturados.

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

  const body:any={
    model,
    store:false,
    instructions,
    input:JSON.stringify({
      knownCustomer:input.knownCustomer||null,
      deliveryDays:input.deliveryDays||[2,4,6],
      cutoff:input.cutoff||"14:00",
      messages
    }),
    text:{format:{type:"json_schema",name:"vitalveg_mail_analysis_v2",strict:true,schema}}
  };

  const res=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data:any=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||`Falha IA (${res.status})`);

  const text=String(data?.output_text||"").trim();
  if(!text)throw new Error("A IA não devolveu análise estruturada");
  const parsed=JSON.parse(text);

  if(parsed.suggestedReply)parsed.suggestedReply=String(parsed.suggestedReply).trim();
  if(!Array.isArray(parsed.reviewReasons))parsed.reviewReasons=[];
  if(!Array.isArray(parsed.items))parsed.items=[];
  if(parsed.items.some((item:any)=>Number(item?.confidence||0)<0.90 || item?.operation==="unknown")){
    parsed.needsHumanReview=true;
    if(!parsed.reviewReasons.includes("Existe pelo menos uma linha de encomenda com interpretação incerta.")){
      parsed.reviewReasons.push("Existe pelo menos uma linha de encomenda com interpretação incerta.");
    }
  }

  return {
    analysis:parsed,
    model:data.model||model,
    responseId:data.id||null,
    usage:data.usage||null,
    fingerprint:requestFingerprint(input)
  };
}
