const NO_REPLY_TYPES=new Set(["PUBLICIDADE_MARKETING","AUTOMATICO_SISTEMA","SEM_ACAO","DOCUMENTO_FATURA"]);

const INFORMATION_ACK=[
  "Bom dia,",
  "",
  "Agradecemos o seu contacto. Recebemos o seu pedido de informação e iremos analisar o assunto com a maior brevidade possível. Voltaremos a contactá-lo assim que tivermos uma resposta.",
  "",
  "Cumprimentos,",
  "VitalVeg"
].join("\n");

const ISSUE_ACK=[
  "Bom dia,",
  "",
  "Agradecemos o seu contacto. Recebemos a sua mensagem e vamos analisar o assunto com a maior brevidade possível. Voltaremos a contactá-lo assim que tivermos uma resposta.",
  "",
  "Cumprimentos,",
  "VitalVeg"
].join("\n");

const GENERIC_ACK=[
  "Bom dia,",
  "",
  "Recebemos a sua mensagem e estamos a tratar o pedido. Caso seja necessária alguma confirmação adicional, entraremos em contacto.",
  "",
  "Cumprimentos,",
  "VitalVeg"
].join("\n");

export function fallbackSuggestedReply(messageType:string){
  const type=String(messageType||"").trim();
  if(type==="PEDIDO_INFORMACAO")return INFORMATION_ACK;
  if(type==="PROBLEMA_RECLAMACAO")return ISSUE_ACK;
  if(NO_REPLY_TYPES.has(type))return null;
  if(["ENCOMENDA","ALTERACAO_ENCOMENDA","PEDIDO_CONFIRMACAO","CONVERSA_REVER","OUTRO_REVER"].includes(type))return GENERIC_ACK;
  return null;
}

export function ensureSuggestedReply<T extends {messageType?:string;suggestedReply?:string|null}>(analysis:T):T{
  if(!analysis)return analysis;
  const existing=String(analysis.suggestedReply||"").trim();
  if(existing){analysis.suggestedReply=existing;return analysis;}
  const fallback=fallbackSuggestedReply(String(analysis.messageType||""));
  if(fallback)analysis.suggestedReply=fallback;
  return analysis;
}
