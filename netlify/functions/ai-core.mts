import { createHash } from "node:crypto";

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

const schema:any = {
  type:"object",
  additionalProperties:false,
  required:["messageType","confidence","needsHumanReview","reviewReasons","customerName","customerEmail","storeName","threadIntent","orderAction","deliveryDateExplicit","items","availabilityMentions","complaintSummary","requestedAnswer","suggestedReply","sourceMessageIds"],
  properties:{
    messageType:{type:"string",enum:["ENCOMENDA","ALTERACAO_ENCOMENDA","PEDIDO_CONFIRMACAO","PROBLEMA_RECLAMACAO","DOCUMENTO_FATURA","PEDIDO_INFORMACAO","PUBLICIDADE_MARKETING","AUTOMATICO_SISTEMA","SEM_ACAO","CONVERSA_REVER","OUTRO_REVER"]},
    confidence:{type:"number",minimum:0,maximum:1},
    needsHumanReview:{type:"boolean"},
    reviewReasons:{type:"array",items:{type:"string"}},
    customerName:{type:["string","null"]},
    customerEmail:{type:["string","null"]},
    storeName:{type:["string","null"]},
    threadIntent:{type:"string"},
    orderAction:{type:"string",enum:["none","create","amend","cancel","confirm"]},
    deliveryDateExplicit:{type:["string","null"]},
    items:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        required:["quantity","unit","product","notes","confidence","rawLine"],
        properties:{
          quantity:{type:["number","string","null"]},
          unit:{type:["string","null"]},
          product:{type:"string"},
          notes:{type:["string","null"]},
          confidence:{type:"number",minimum:0,maximum:1},
          rawLine:{type:"string"}
        }
      }
    },
    availabilityMentions:{type:"array",items:{type:"string"}},
    complaintSummary:{type:["string","null"]},
    requestedAnswer:{type:["string","null"]},
    suggestedReply:{type:["string","null"]},
    sourceMessageIds:{type:"array",items:{type:"string"}}
  }
};

function compactMessages(messages:MailInput[]){
  return messages.slice(-12).map(m=>({
    id:m.id||m.messageId||"",
    date:m.date||"",
    direction:m.direction||"in",
    from:m.from||"",
    to:m.to||"",
    subject:m.subject||"",
    text:String(m.text||"").slice(0,7000)
  }));
}

export function appendAiSignature(text:string){
  const clean=String(text||"").trim();
  if(!clean)return AI_SIGNATURE;
  if(clean.includes("Central Inteligente de Comunicações"))return clean;
  return `${clean}\n\n—\n${AI_SIGNATURE}`;
}

export function requestFingerprint(input:AnalysisRequest){
  return createHash("sha256").update(JSON.stringify(compactMessages(input.messages||[]))).digest("hex");
}

export async function analyzeConversation(input:AnalysisRequest){
  const apiKey=Netlify.env.get("OPENAI_API_KEY");
  const model=Netlify.env.get("OPENAI_MODEL");
  if(!apiKey)throw new Error("OPENAI_API_KEY não configurada");
  if(!model)throw new Error("OPENAI_MODEL não configurado");

  const messages=compactMessages(input.messages||[]);
  if(!messages.length)throw new Error("Sem mensagens para analisar");

  const instructions=`És o funcionário digital da VitalVeg. Analisa a conversa comercial completa em português de Portugal e devolve apenas dados estruturados.\n\nREGRAS CRÍTICAS:\n- Nunca inventes artigos, quantidades, unidades, datas ou decisões.\n- Não uses uma lista fechada de produtos. Qualquer artigo pedido pelo cliente deve ser preservado.\n- Se uma expressão parecer estranha (ex.: \"4 olhos de nabiças\"), conserva a linha exatamente como foi escrita em rawLine, tenta interpretar sem apagar informação e baixa a confidence dessa linha.\n- Usa a mensagem mais recente apenas no contexto da conversa; alterações RE: devem atualizar a encomenda original quando isso for claro.\n- Distingue confirmação, alteração, reclamação e simples conversa.\n- Se houver ambiguidade comercial ou confiança baixa, needsHumanReview=true.\n- A resposta sugerida deve ser curta, profissional e natural. Não prometas disponibilidade que não esteja confirmada.\n- Não acrescentes a assinatura de IA; o servidor acrescenta-a no momento de envio.\n- Dias habituais de entrega: terça, quinta e sábado. Corte do próprio dia: 14:00. Datas explícitas do cliente têm prioridade quando inequívocas.\n- Mensagens históricas não devem ser reinterpretadas como novas encomendas.`;

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
    text:{format:{type:"json_schema",name:"vitalveg_mail_analysis",strict:true,schema}}
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
  return {analysis:parsed,model:data.model||model,responseId:data.id||null,usage:data.usage||null,fingerprint:requestFingerprint(input)};
}
