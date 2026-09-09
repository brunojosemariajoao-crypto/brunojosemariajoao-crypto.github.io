/* Central VitalVeg V8.5 — qualquer linha quantidade + unidade + artigo entra na encomenda */
(() => {
  const ORDER_UNIT_RE = /\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;

  function cleanLine(line=''){
    return String(line).replace(/^[-•*\s]+/,'').replace(/\s+/g,' ').trim();
  }

  function parseOrderLine(line=''){
    const raw=cleanLine(line);
    const m=raw.match(ORDER_UNIT_RE);
    if(!m) return null;
    const after=raw.slice((m.index||0)+m[0].length).replace(/^\s*[-:–—]?\s*/,'').trim();
    if(!after || after.length<2) return null;
    const low=after.toLowerCase();
    if(/^(dia|dias|hora|horas|minuto|minutos|vez|vezes)\b/.test(low)) return null;
    return {
      raw,
      qty:Number(m[1].replace(',','.')),
      unit:m[2],
      description:after,
      key:after.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
    };
  }

  function orderLinesFromMessage(m){
    const text=(m?.current || (typeof currentText==='function'?currentText(m?.text||''):m?.text||'')).replace(/\r/g,'');
    return text.split(/\n+/).map(parseOrderLine).filter(Boolean);
  }

  function genericFinalOrderSummary(thread){
    if(!thread?.messages?.length) return '';
    const incoming=thread.messages
      .filter(m=>m.direction==='in')
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
    const relevant=incoming.filter(m=>['ENCOMENDA','ALTERAÇÃO À ENCOMENDA'].includes(m.type) || orderLinesFromMessage(m).length);
    if(!relevant.length) return '';

    const current=new Map();
    let started=false;
    const unresolved=[];

    for(const m of relevant){
      const lines=orderLinesFromMessage(m);
      if(!lines.length) continue;
      const low=((m.current||m.text||'')+' '+(m.subject||'')).toLowerCase();
      const alteration = m.type==='ALTERAÇÃO À ENCOMENDA' || (/^re:/i.test(m.subject||'') && /\b(mais|acrescent|adicion|retir|alter|afinal|em vez|apenas|s[oó])\b/i.test(low));

      if(!alteration){
        if(lines.length>=2 || !started) current.clear();
        for(const item of lines) current.set(item.key,item);
        started=true;
        continue;
      }

      for(const item of lines){
        const lineLow=item.raw.toLowerCase();
        const old=current.get(item.key);
        if(/\b(retirar|retira|anular|anula|cancelar|cancela|sem)\b/.test(lineLow) && item.qty===0){
          current.delete(item.key);
        }else if(/\bmais\b|acrescent|adicion/.test(lineLow) && old){
          const sameUnit=String(old.unit).toLowerCase()===String(item.unit).toLowerCase();
          if(sameUnit){
            const replacement=item.raw.replace(ORDER_UNIT_RE,`${String(old.qty+item.qty).replace('.',',')} ${old.unit}`);
            current.set(item.key,{...item,qty:old.qty+item.qty,unit:old.unit,raw:replacement});
          }else current.set(item.key,item);
        }else current.set(item.key,item);
      }
    }

    const rows=[...current.values()].map(x=>x.raw);
    return rows.join(' · ')+(unresolved.length?` · A rever: ${unresolved.join(' · ')}`:'');
  }

  function install(){
    if(typeof state==='undefined'||typeof classifyMessage!=='function'||typeof realOrders!=='function'||typeof renderConversationDetail!=='function'){
      setTimeout(install,60);return;
    }

    const baseClassify=classifyMessage;
    classifyMessage=function classifyMessageGeneric(m){
      const base=baseClassify(m);
      if(m?.direction!=='in') return base;
      if(['DOCUMENTO / FATURA','PUBLICIDADE / MARKETING','AUTOMÁTICO / SISTEMA','PROBLEMA / RECLAMAÇÃO'].includes(base)) return base;
      const lines=orderLinesFromMessage(m);
      if(!lines.length) return base;
      const text=((m.current||m.text||'')+' '+(m.subject||'')).toLowerCase();
      if(/^re:/i.test(m.subject||'') && /\b(mais|acrescent|adicion|retir|alter|afinal|em vez|apenas|s[oó])\b/i.test(text)) return 'ALTERAÇÃO À ENCOMENDA';
      return 'ENCOMENDA';
    };

    const baseRealOrders=realOrders;
    realOrders=function realOrdersGeneric(){
      return baseRealOrders().map(o=>{
        const generic=genericFinalOrderSummary(o.thread);
        return generic?{...o,order:generic}:o;
      });
    };

    const baseRenderDetail=renderConversationDetail;
    renderConversationDetail=function renderConversationDetailGeneric(){
      baseRenderDetail();
      const t=state.threads.find(x=>x.key===state.selectedThread);
      if(!t) return;
      const generic=genericFinalOrderSummary(t);
      if(!generic) return;
      const summary=document.querySelector('#conversationDetail .ai-summary ul');
      if(!summary) return;
      let row=[...summary.querySelectorAll('li')].find(li=>/^Pedido (atual|final):/i.test(li.textContent||''));
      if(!row){ row=document.createElement('li'); summary.insertBefore(row,summary.children[1]||null); }
      row.textContent=`Pedido final: ${generic}`;
    };

    // Reclassifica imediatamente o que já estava carregado antes desta camada.
    if(Array.isArray(state.messages)&&state.messages.length){
      state.threads=buildThreads(state.messages);
      try{renderAllReal();}catch{}
    }

    window.VitalVegOrderParser={parseOrderLine,orderLinesFromMessage,genericFinalOrderSummary};
  }

  install();
})();
