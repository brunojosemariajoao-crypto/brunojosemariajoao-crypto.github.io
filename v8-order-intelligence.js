/* Central VitalVeg V8.3 — inteligência temporal das encomendas */
(() => {
  const DELIVERY_DAYS=[2,4,6]; // terça, quinta, sábado
  const PRODUCT_ALIASES=[
    ['tomate coração de boi','tomate coração de boi'],['tomate coracao de boi','tomate coração de boi'],
    ['tomate cherry','tomate cherry'],['couve portuguesa','couve portuguesa'],['couve coração','couve coração'],['couve coracao','couve coração'],
    ['pimento vermelho','pimento vermelho'],['pimento verde','pimento verde'],['alface frisada','alface frisada'],
    ['salada gourmet','salada gourmet'],['salada ibérica','salada ibérica'],['salada iberica','salada ibérica'],['salada aromática','salada aromática'],['salada aromatica','salada aromática'],
    ['alho francês','alho francês'],['alho frances','alho francês'],['tomate','tomate'],['cherry','tomate cherry'],['courgette','courgette'],['corgete','courgette'],
    ['espinafres','espinafres'],['espinafre','espinafres'],['coentros','coentros'],['hortelã','hortelã'],['hortela','hortelã'],
    ['rúcula','rúcula'],['rucula','rúcula'],['canónigos','canónigos'],['canonigos','canónigos'],['salsa','salsa'],['cebola','cebola'],['fava','fava'],['alface','alface frisada']
  ];
  const QTY_RE=/\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const UNIT_MAP={cx:'cx',cxs:'cx',caixa:'cx',caixas:'cx',kg:'kg',kgs:'kg',quilo:'kg',quilos:'kg',covete:'covete',covetes:'covete',un:'un',unid:'un',unidade:'un',unidades:'un',molho:'molho',molhos:'molho',tabuleiro:'tabuleiro',tabuleiros:'tabuleiro',saco:'saco',sacos:'saco'};

  const pad=n=>String(n).padStart(2,'0');
  function isoDate(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function startOfDay(value){const d=value instanceof Date?new Date(value):new Date(value);d.setHours(0,0,0,0);return d;}
  function weekday(d){const x=d.getDay();return x===0?7:x;}
  function current(m){try{return m.current||currentText(m.text||'');}catch{return m.text||'';}}
  function nextDeliveryAfter(value,includeSame=false){const base=new Date(value);base.setSeconds(0,0);for(let i=includeSame?0:1;i<15;i++){const d=new Date(base);d.setDate(base.getDate()+i);if(DELIVERY_DAYS.includes(weekday(d)))return d;}return null;}
  function dateForWeekday(base,target){for(let i=0;i<8;i++){const d=new Date(base);d.setDate(base.getDate()+i);if(weekday(d)===target)return d;}return null;}

  function explicitDelivery(m){
    const base=new Date(m.date);const text=`${m.subject||''}\n${current(m)}`.toLowerCase();
    if(/\bamanh[ãa]\b/.test(text)){const d=new Date(base);d.setDate(d.getDate()+1);return d;}
    if(/\bhoje\b/.test(text))return new Date(base);

    const dm=text.match(/(?:\bdia\s*)?\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if(dm){
      let year=dm[3]?Number(dm[3]):base.getFullYear();if(year<100)year+=2000;
      const d=new Date(year,Number(dm[2])-1,Number(dm[1]),12,0,0,0);
      if(!dm[3]&&d.getTime()<startOfDay(base).getTime()-86400000)d.setFullYear(d.getFullYear()+1);
      if(!Number.isNaN(d.getTime()))return d;
    }

    const dayOnly=text.match(/\b(?:entrega|entregar|para|dia)\s+(\d{1,2})\b/);
    if(dayOnly){
      const n=Number(dayOnly[1]);if(n>=1&&n<=31){let d=new Date(base.getFullYear(),base.getMonth(),n,12,0,0,0);if(d.getTime()<startOfDay(base).getTime()-86400000)d=new Date(base.getFullYear(),base.getMonth()+1,n,12,0,0,0);return d;}
    }

    const wm=text.match(/\b(ter[cç]a(?:-feira)?|quinta(?:-feira)?|s[aá]bado)\b/);
    if(wm){const word=wm[1];const target=word.startsWith('ter')?2:word.startsWith('quinta')?4:6;return dateForWeekday(base,target);}
    return null;
  }

  function inferredDelivery(m){
    const explicit=explicitDelivery(m);if(explicit)return explicit;
    const d=new Date(m.date);const wd=weekday(d);const [h,mi]=String(state?.settings?.cutoff||'14:00').split(':').map(Number);
    const after=d.getHours()>h||(d.getHours()===h&&d.getMinutes()>=mi);
    if(DELIVERY_DAYS.includes(wd)&&!after)return new Date(d);
    return nextDeliveryAfter(d,false);
  }

  function productFor(line=''){const low=line.toLowerCase();const hit=PRODUCT_ALIASES.find(([a])=>low.includes(a));return hit?.[1]||'';}
  function qtyFor(line=''){const m=line.match(QTY_RE);if(!m)return null;return{value:Number(m[1].replace(',','.')),unit:UNIT_MAP[m[2].toLowerCase()]||m[2].toLowerCase()};}
  function usefulLines(m){return current(m).replace(/\r/g,'').split(/\n+/).map(x=>x.trim()).filter(Boolean).filter(x=>productFor(x)||QTY_RE.test(x));}
  function fmt(n){return Number.isInteger(n)?String(n):String(n).replace('.',',');}

  function cycleSummary(base,changes){
    const items=new Map();const notes=[];
    for(const line of usefulLines(base)){
      const product=productFor(line),q=qtyFor(line);if(product&&q)items.set(product,{product,...q});
    }
    for(const m of changes){
      const lines=usefulLines(m);if(!lines.length){const note=current(m).replace(/\s+/g,' ').trim();if(note)notes.push(note.slice(0,140));continue;}
      for(const line of lines){
        const low=line.toLowerCase(),product=productFor(line),q=qtyFor(line);if(!product){continue;}
        const old=items.get(product);
        if(/\b(anul|retir|sem)\w*/.test(low)&&!q){items.delete(product);continue;}
        if(!q){notes.push(line.slice(0,140));continue;}
        if(/\bmais\b|acrescent|adicion/.test(low)&&old&&old.unit===q.unit){items.set(product,{product,value:old.value+q.value,unit:q.unit});}
        else if(/\bmenos\b|retir|tira/.test(low)&&old&&old.unit===q.unit){const value=Math.max(0,old.value-q.value);if(value===0)items.delete(product);else items.set(product,{product,value,unit:q.unit});}
        else items.set(product,{product,value:q.value,unit:q.unit});
      }
    }
    const parsed=[...items.values()].map(x=>`${fmt(x.value)} ${x.unit} ${x.product}`);
    if(parsed.length)return parsed.join(' · ')+(notes.length?` · A rever: ${notes.join(' · ')}`:'');
    try{return orderSummary(base);}catch{return current(base).slice(0,180)||base.subject||'Pedido por rever';}
  }

  function install(){
    if(window.__VITALVEG_ORDER_INTELLIGENCE__)return;
    if(typeof state==='undefined'||typeof realOrders!=='function'||typeof buildThreads!=='function'){setTimeout(install,80);return;}
    window.__VITALVEG_ORDER_INTELLIGENCE__='8.3';

    // Garante a regra real antes de qualquer cálculo.
    state.settings={...state.settings,deliveryDays:[2,4,6]};
    try{localStorage.setItem('vitalveg-settings',JSON.stringify(state.settings));}catch{}

    realOrders=function realOrdersTemporal(){
      const today=startOfDay(new Date());const out=[];
      for(const t of state.threads){
        const inbound=(t.messages||[]).filter(m=>m.direction==='in').sort((a,b)=>new Date(a.date)-new Date(b.date));
        const baseIndexes=[];inbound.forEach((m,i)=>{if(m.type==='ENCOMENDA')baseIndexes.push(i);});
        if(!baseIndexes.length)continue;
        const baseIndex=baseIndexes[baseIndexes.length-1];const base=inbound[baseIndex];
        const delivery=inferredDelivery(base);if(!delivery)continue;
        const deliveryDay=startOfDay(delivery);

        // Uma encomenda cuja entrega já passou é histórico. Nunca é empurrada para a próxima rota.
        if(deliveryDay.getTime()<today.getTime())continue;

        const after=inbound.slice(baseIndex+1);
        const changes=after.filter(m=>m.type==='ALTERAÇÃO À ENCOMENDA'&&(!explicitDelivery(m)||isoDate(explicitDelivery(m))===isoDate(delivery)));
        const unresolved=changes.some(m=>usefulLines(m).length===0);
        const latestCycleMsg=changes[changes.length-1]||base;
        let status=t.statusLabel||'Registada';let statusClass=t.status==='review'?'review':'confirmed';
        if(unresolved){status='Alteração a rever';statusClass='review';}
        const pseudo={...t,latestOrder:base,cycleMessages:[base,...changes]};
        out.push({
          thread:pseudo,
          orderKey:`${t.key}|${isoDate(delivery)}|${base.id||base.date}`,
          client:typeof displayName==='function'?displayName(base.from||t.counterpart):t.name,
          order:cycleSummary(base,changes),
          delivery:`Entrega ${isoDate(delivery)}`,
          deliveryDate:delivery,
          state:status,
          classification:latestCycleMsg.type||'ENCOMENDA',
          stateClass:statusClass,
          sourceDate:new Date(base.date),
          historical:false
        });
      }
      return out.sort((a,b)=>new Date(a.deliveryDate)-new Date(b.deliveryDate)||String(a.client).localeCompare(String(b.client),'pt'));
    };

    try{if(typeof renderAllReal==='function')renderAllReal();}catch{}
  }
  install();
})();
