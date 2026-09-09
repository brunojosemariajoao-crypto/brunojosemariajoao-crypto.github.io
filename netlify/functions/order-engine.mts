import { createHash } from "node:crypto";

export type AiOrderItem = {
  quantity:number|string|null;
  unit:string|null;
  product:string;
  normalizedProduct:string|null;
  notes:string|null;
  confidence:number;
  rawLine:string;
  operation:"set"|"add"|"subtract"|"remove"|"keep"|"unknown";
};

export type AiAnalysis = {
  messageType:string;
  confidence:number;
  needsHumanReview:boolean;
  reviewReasons:string[];
  customerName:string|null;
  customerEmail:string|null;
  storeName:string|null;
  threadIntent:string;
  orderAction:"none"|"create"|"amend"|"cancel"|"confirm";
  changeMode:"none"|"full_snapshot"|"delta"|"unknown";
  deliveryDateExplicit:string|null;
  deliveryRequestText:string|null;
  items:AiOrderItem[];
  availabilityMentions:string[];
  commercialRisk:"low"|"medium"|"high";
  complaintSummary:string|null;
  requestedAnswer:string|null;
  suggestedReply:string|null;
  threadSummary:string;
  sourceMessageIds:string[];
};

export type OrderEvent = {
  receivedAt:string;
  sourceMessageId:string;
  analysis:AiAnalysis;
};

export type OrderLine = {
  key:string;
  quantity:number|string|null;
  unit:string|null;
  product:string;
  normalizedProduct:string|null;
  notes:string|null;
  rawLine:string;
  confidence:number;
  uncertain:boolean;
  lastSourceMessageId:string;
};

export type OrderRecord = {
  id:string;
  number:string;
  customerName:string|null;
  customerEmail:string|null;
  storeName:string|null;
  deliveryDate:string|null;
  deliverySource:"explicit"|"rule"|"existing"|"unresolved";
  status:"draft"|"awaiting_approval"|"review"|"confirmed"|"cancelled"|"historical";
  items:OrderLine[];
  reviewReasons:string[];
  sourceMessageIds:string[];
  createdAt:string;
  updatedAt:string;
};

function stripAccents(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function clean(value:any){return String(value??"").trim();}
function normalizeKey(value:string){
  return stripAccents(clean(value).toLowerCase()).replace(/\s+/g," ").replace(/[^a-z0-9 -]/g,"").trim();
}
function numeric(value:number|string|null){
  if(typeof value==="number" && Number.isFinite(value))return value;
  if(typeof value!=="string")return null;
  const n=Number(value.replace(",",".").replace(/[^0-9.+-]/g,""));
  return Number.isFinite(n)?n:null;
}
function pad(n:number){return String(n).padStart(2,"0");}
function dateKey(y:number,m:number,d:number){return `${y}-${pad(m)}-${pad(d)}`;}
function parseDateKey(value:string|null|undefined){
  const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==mo||dt.getUTCDate()!==d)return null;
  return {y,m:mo,d};
}
function addDays(key:string,days:number){
  const p=parseDateKey(key); if(!p)return key;
  const d=new Date(Date.UTC(p.y,p.m-1,p.d+days));
  return dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
}
function weekdayForKey(key:string){
  const p=parseDateKey(key); if(!p)return 0;
  return new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay();
}
function lisbonParts(iso:string){
  const dt=new Date(iso);
  if(Number.isNaN(dt.getTime()))throw new Error(`Data inválida: ${iso}`);
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(dt);
  const get=(type:string)=>Number(parts.find(x=>x.type===type)?.value||0);
  return {y:get("year"),m:get("month"),d:get("day"),hour:get("hour"),minute:get("minute")};
}
function todayLisbon(now=new Date()){
  const p=lisbonParts(now.toISOString()); return dateKey(p.y,p.m,p.d);
}

export function resolveDeliveryDate(receivedAt:string, explicitDate:string|null, deliveryDays=[2,4,6], cutoff="14:00"){
  const explicit=parseDateKey(explicitDate);
  if(explicit){
    return {date:dateKey(explicit.y,explicit.m,explicit.d),source:"explicit" as const,needsReview:false,reason:""};
  }

  const p=lisbonParts(receivedAt);
  const receivedKey=dateKey(p.y,p.m,p.d);
  const weekday=weekdayForKey(receivedKey);
  const [cutH,cutM]=String(cutoff||"14:00").split(":").map(Number);
  const afterCutoff=(p.hour*60+p.minute)>=(cutH*60+cutM);

  if(deliveryDays.includes(weekday) && !afterCutoff){
    return {
      date:receivedKey,source:"rule" as const,needsReview:true,
      reason:`Mensagem recebida no próprio dia de entrega antes das ${cutoff}; confirmar se é para entrega no próprio dia.`
    };
  }

  for(let i=1;i<=14;i++){
    const candidate=addDays(receivedKey,i);
    if(deliveryDays.includes(weekdayForKey(candidate))){
      return {date:candidate,source:"rule" as const,needsReview:false,reason:""};
    }
  }
  return {date:null,source:"unresolved" as const,needsReview:true,reason:"Não foi possível resolver a data de entrega."};
}

export function itemKey(item:Pick<AiOrderItem,"product"|"normalizedProduct"|"unit">){
  const product=normalizeKey(item.normalizedProduct||item.product||"")||normalizeKey(item.product||"");
  const unit=normalizeKey(item.unit||"");
  return `${product}|${unit}`;
}

function toLine(item:AiOrderItem, sourceMessageId:string):OrderLine{
  return {
    key:itemKey(item),quantity:item.quantity,unit:item.unit,product:item.product,
    normalizedProduct:item.normalizedProduct,notes:item.notes,rawLine:item.rawLine,
    confidence:Number(item.confidence||0),uncertain:Number(item.confidence||0)<0.90 || item.operation==="unknown",
    lastSourceMessageId:sourceMessageId
  };
}

function applyDelta(map:Map<string,OrderLine>, item:AiOrderItem, sourceMessageId:string, reasons:string[]){
  const key=itemKey(item);
  const current=map.get(key);
  const op=item.operation;
  if(op==="keep")return;
  if(op==="remove"){
    if(current)map.delete(key);
    else reasons.push(`A IA pediu remoção de "${item.rawLine}" mas a linha não existia na encomenda consolidada.`);
    return;
  }
  if(op==="unknown"){
    const uncertain=toLine(item,sourceMessageId); uncertain.uncertain=true;
    map.set(key||`incerto:${sourceMessageId}:${map.size}`,uncertain);
    reasons.push(`Alteração ambígua preservada para revisão: ${item.rawLine}`);
    return;
  }
  if(op==="set"){
    map.set(key,toLine(item,sourceMessageId)); return;
  }
  const delta=numeric(item.quantity);
  const base=numeric(current?.quantity??null);
  if(delta===null || base===null){
    const uncertain=toLine(item,sourceMessageId); uncertain.uncertain=true;
    map.set(key||`incerto:${sourceMessageId}:${map.size}`,uncertain);
    reasons.push(`Não foi possível calcular automaticamente a alteração: ${item.rawLine}`);
    return;
  }
  const value=op==="add"?base+delta:base-delta;
  if(value<=0){map.delete(key);return;}
  map.set(key,{...(current||toLine(item,sourceMessageId)),quantity:value,rawLine:item.rawLine,confidence:Math.min(current?.confidence??1,item.confidence),lastSourceMessageId:sourceMessageId});
}

export function stableOrderId(customerEmail:string|null, deliveryDate:string|null, seed:string){
  const digest=createHash("sha256").update(`${customerEmail||"unknown"}|${deliveryDate||"undated"}|${seed}`).digest("hex");
  return `ord_${digest.slice(0,16)}`;
}
export function displayOrderNumber(orderId:string, deliveryDate:string|null){
  const digits=BigInt(`0x${createHash("sha256").update(orderId).digest("hex").slice(0,10)}`)%100000n;
  const date=(deliveryDate||"0000-00-00").replace(/-/g,"").slice(2);
  return `VV-${date}-${String(digits).padStart(5,"0")}`;
}

export function consolidateOrder(events:OrderEvent[], existing?:OrderRecord|null, now=new Date()):OrderRecord|null{
  const ordered=[...events].sort((a,b)=>new Date(a.receivedAt).getTime()-new Date(b.receivedAt).getTime());
  if(!ordered.length && !existing)return null;

  const map=new Map<string,OrderLine>((existing?.items||[]).map(x=>[x.key,x]));
  const reasons=[...(existing?.reviewReasons||[])];
  const sources=new Set(existing?.sourceMessageIds||[]);
  let deliveryDate=existing?.deliveryDate||null;
  let deliverySource:OrderRecord["deliverySource"]=existing?.deliverySource||"unresolved";
  let customerName=existing?.customerName||null, customerEmail=existing?.customerEmail||null, storeName=existing?.storeName||null;
  let status:OrderRecord["status"]=existing?.status||"draft";
  let createdAt=existing?.createdAt||ordered[0]?.receivedAt||now.toISOString();
  let id=existing?.id||"";

  for(const event of ordered){
    const a=event.analysis;
    if(a.customerName)customerName=a.customerName;
    if(a.customerEmail)customerEmail=a.customerEmail.toLowerCase();
    if(a.storeName)storeName=a.storeName;
    if(event.sourceMessageId)sources.add(event.sourceMessageId);
    for(const s of a.sourceMessageIds||[])if(s)sources.add(s);

    if(a.orderAction==="create"){
      const resolved=resolveDeliveryDate(event.receivedAt,a.deliveryDateExplicit);
      deliveryDate=resolved.date; deliverySource=resolved.source;
      if(resolved.needsReview && resolved.reason)reasons.push(resolved.reason);
      map.clear();
      for(const item of a.items||[])map.set(itemKey(item),toLine({...item,operation:"set"},event.sourceMessageId));
      status=a.needsHumanReview||resolved.needsReview?"review":"awaiting_approval";
      if(!id)id=stableOrderId(customerEmail,deliveryDate,event.sourceMessageId||event.receivedAt);
    }else if(a.orderAction==="amend"){
      if(a.deliveryDateExplicit){
        const resolved=resolveDeliveryDate(event.receivedAt,a.deliveryDateExplicit);
        deliveryDate=resolved.date; deliverySource=resolved.source;
      }
      if(a.changeMode==="full_snapshot"){
        map.clear();
        for(const item of a.items||[])map.set(itemKey(item),toLine({...item,operation:"set"},event.sourceMessageId));
      }else if(a.changeMode==="delta"){
        for(const item of a.items||[])applyDelta(map,item,event.sourceMessageId,reasons);
      }else{
        for(const item of a.items||[])applyDelta(map,{...item,operation:"unknown"},event.sourceMessageId,reasons);
        reasons.push("A IA não conseguiu determinar se a alteração era completa ou incremental.");
      }
      status="review";
    }else if(a.orderAction==="cancel"){
      status="cancelled";
    }else if(a.orderAction==="confirm" && status!=="cancelled"){
      status=a.needsHumanReview?"review":"confirmed";
    }

    if(a.needsHumanReview)for(const reason of a.reviewReasons||[])if(reason)reasons.push(reason);
  }

  if(!id){
    const first=ordered[0];
    id=stableOrderId(customerEmail,deliveryDate,first?.sourceMessageId||first?.receivedAt||createdAt);
  }

  const items=[...map.values()];
  if(items.some(x=>x.uncertain)){
    status=status==="cancelled"?"cancelled":"review";
    reasons.push("Existe pelo menos uma linha de encomenda que precisa de confirmação humana.");
  }
  if(deliveryDate && deliveryDate<todayLisbon(now) && status!=="cancelled")status="historical";

  const uniqueReasons=[...new Set(reasons.filter(Boolean))];
  return {
    id,number:existing?.number||displayOrderNumber(id,deliveryDate),customerName,customerEmail,storeName,
    deliveryDate,deliverySource,status,items,reviewReasons:uniqueReasons,sourceMessageIds:[...sources],
    createdAt,updatedAt:now.toISOString()
  };
}
