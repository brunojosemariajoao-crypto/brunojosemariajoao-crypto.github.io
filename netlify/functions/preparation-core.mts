import type { OrderRecord } from "./order-engine.mts";

export type PreparationRow={
  key:string;
  product:string;
  unit:string|null;
  confirmedQuantity:number|null;
  confirmedLineCount:number;
  uncertainLineCount:number;
  nonNumericLineCount:number;
  customerCount:number;
  requiresReview:boolean;
  uncertainLines:string[];
  nonNumericLines:string[];
};

export type PreparationSummary={
  deliveryDate:string|null;
  orderCount:number;
  rowCount:number;
  reviewRowCount:number;
  rows:PreparationRow[];
};

function clean(v:any){return String(v??"").trim();}
function norm(v:any){return clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");}
function numeric(v:any){
  if(typeof v==="number"&&Number.isFinite(v))return v;
  const s=clean(v).replace(",",".");
  if(!/^-?\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function lineLabel(item:any){
  return clean(item?.rawLine)||[clean(item?.quantity),clean(item?.unit),clean(item?.product)].filter(Boolean).join(" ")||"Linha sem descrição";
}
function itemKey(item:any){
  const product=norm(item?.normalizedProduct||item?.product||item?.rawLine||"artigo");
  const unit=norm(item?.unit||"");
  return `${product}|${unit}`;
}

export function buildPreparationSummary(orders:OrderRecord[]|any[],deliveryDate:string|null):PreparationSummary{
  const safe=(orders||[]).filter((o:any)=>
    o && !["cancelled","historical"].includes(String(o.status||"")) &&
    (!deliveryDate || String(o.deliveryDate||"")===deliveryDate)
  );
  const map=new Map<string,{
    key:string;product:string;unit:string|null;confirmedQuantity:number;confirmedLineCount:number;
    uncertainLineCount:number;nonNumericLineCount:number;customers:Set<string>;
    uncertainLines:string[];nonNumericLines:string[];
  }>();

  for(const [orderIndex,order] of safe.entries()){
    const customerKey=clean(order.id||order.customerEmail||order.storeName||order.customerName)||`ordem-${orderIndex+1}`;
    for(const item of Array.isArray(order.items)?order.items:[]){
      const key=itemKey(item);
      if(!map.has(key))map.set(key,{
        key,
        product:clean(item.normalizedProduct||item.product||item.rawLine||"Artigo"),
        unit:clean(item.unit)||null,
        confirmedQuantity:0,
        confirmedLineCount:0,
        uncertainLineCount:0,
        nonNumericLineCount:0,
        customers:new Set<string>(),
        uncertainLines:[],
        nonNumericLines:[]
      });
      const row=map.get(key)!;
      row.customers.add(customerKey);
      const qty=numeric(item.quantity);
      if(item.uncertain===true){
        row.uncertainLineCount++;
        row.uncertainLines.push(lineLabel(item));
        continue;
      }
      if(qty===null){
        row.nonNumericLineCount++;
        row.nonNumericLines.push(lineLabel(item));
        continue;
      }
      row.confirmedQuantity+=qty;
      row.confirmedLineCount++;
    }
  }

  const rows:PreparationRow[]=[...map.values()].map(row=>({
    key:row.key,
    product:row.product,
    unit:row.unit,
    confirmedQuantity:row.confirmedLineCount?row.confirmedQuantity:null,
    confirmedLineCount:row.confirmedLineCount,
    uncertainLineCount:row.uncertainLineCount,
    nonNumericLineCount:row.nonNumericLineCount,
    customerCount:row.customers.size,
    requiresReview:row.uncertainLineCount>0||row.nonNumericLineCount>0,
    uncertainLines:[...new Set(row.uncertainLines)],
    nonNumericLines:[...new Set(row.nonNumericLines)]
  })).sort((a,b)=>a.product.localeCompare(b.product,"pt",{sensitivity:"base"})||String(a.unit||"").localeCompare(String(b.unit||""),"pt"));

  return {
    deliveryDate:deliveryDate||null,
    orderCount:safe.length,
    rowCount:rows.length,
    reviewRowCount:rows.filter(r=>r.requiresReview).length,
    rows
  };
}
