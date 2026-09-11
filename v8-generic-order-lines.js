/* Central VitalVeg V8.5.1 — qualquer artigo pedido entra no resumo, sem confundir conversa com pedido */
(() => {
  const ORDER_UNIT_RE = /\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const DIRECT_UNIT_LINE_RE = /^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const ACTION_UNIT_LINE_RE = /^(?:por\s+favor[,;:]?\s*)?(?:mais|afinal|quero|queria|acrescent(?:ar|e|em)?|adicion(?:ar|e|em)?|retir(?:ar|e|em)?|menos|preciso\s+de|pode\s+(?:acrescentar|adicionar|retirar)|podem\s+(?:acrescentar|adicionar|retirar))\s+(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const CONVERSATION_TAIL_RE = /^(?:para|por|se|ser[aá]\s+que|consegue|conseguem|pode|podem|cliente|obrigad|favor|tenho|temos|preciso|queria|quero)\b/i;
  const QUESTIONISH_RE = /\?|\bser[aá]\s+que\b|\bconsegue[m]?\b|\b[eé]\s+poss[ií]vel\b|\bdispon[ií]vel\b|\bdisponibilidade\b|\bpodem?\s+(?:informar|confirmar|fornecer|arranjar)\b/i;

  function cleanLine(line=''){
    return String(line).replace(/^[-•*\s]+/,'').replace(/\s+/g,' ').trim();
  }

  function normalKey(text=''){
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function conversationalTail(text=''){
    const value=String(text).trim();
    if(!value) return true;
    if(CONVERSATION_TAIL_RE.test(value)) return true;
    return /\b(?:para\s+(?:a|o|uma|um)\s+cliente|ser[aá]\s+que|consegue[m]?)\b/i.test(value);
  }

  function unitMatchAtStart(raw=''){
    return raw.match(DIRECT_UNIT_LINE_RE) || raw.match(ACTION_UNIT_LINE_RE);
  }

  function parseOrderLine(line=''){
    const raw=cleanLine(line);
    if(!raw || raw.length<3) return null;

    // Uma linha de encomenda tem de começar como pedido. Não basta existir "2 molhos"
    // perdido dentro de uma frase de conversa.
    const withUnit=unitMatchAtStart(raw);
    if(withUnit){
      const after=raw.slice((withUnit.index||0)+withUnit[0].length).replace(/^\s*[-:–—]?\s*/,'').trim();
      if(!after || after.length<2 || conversationalTail(after)) return null;
      const low=after.toLowerCase();
      if(/^(dia|dias|hora|horas|minuto|minutos|vez|vezes)\b/.test(low)) return null;
      return {
        raw,
        qty:Number(withUnit[1].replace(',','.')),
        unit:withUnit[2],
        description:after,
        key:normalKey(after.replace(/^(?:de|do|da|dos|das)\s+/i,'')),
        matched:withUnit[0]
      };
    }

    // Também aceita pedidos como "4 alfaces" ou "mais 2 agriões", sem unidade explícita.
    // Mantém-se ancorado ao início para não apanhar números de uma frase normal.
    const simple=raw.match(/^(?:por\s+favor[,;:]?\s*)?(?:(?:mais|afinal|quero|queria|acrescent(?:ar|e|em)?|adicion(?:ar|e|em)?|retir(?:ar|e|em)?|menos)\s+)?(\d+(?:[.,]\d+)?)\s+([\p{L}][\p{L}\d ./%ºª_-]{1,})$/iu);
    if(!simple) return null;
    const description=simple[2].trim();
    const low=description.toLowerCase();
    if(conversationalTail(description)) return null;
    if(/^(dia|dias|hora|horas|minuto|minutos|vez|vezes|euros?|€)\b/.test(low)) return null;
    if(/^\d{1,2}[\/-]\d{1,2}/.test(description)) return null;
    return {raw,qty:Number(simple[1].replace(',','.')),unit:'un',description,key:normalKey(description),matched:simple[0]};
  }

  function orderLinesFromMessage(m){
    const text=(m?.current || (typeof currentText==='function'?currentText(m?.text||''):m?.text||'')).replace(/\r/g,'');
    return text.split(/\n+/).map(parseOrderLine).filter(Boolean);
  }

  function genericFinalOrderSummary(thread){
    if(!thread?.messages?.length) return '';
    const incoming=thread.messages.filter(m=>m.direction==='in').sort((a,b)=>new Date(a.date)-new Date(b.date));
    const relevant=incoming.filter(m=>['ENCOMENDA','ALTERAÇÃO À ENCOMENDA'].includes(m.type) || orderLinesFromMessage(m).length);
    if(!relevant.length) return '';

    const current=new Map();
    let started=false;

    for(const m of relevant){
      const parsed=orderLinesFromMessage(m);
      if(!parsed.length) continue;
      const low=((m.current||m.text||'')+' '+(m.subject||'')).toLowerCase();
      const alteration = m.type==='ALTERAÇÃO À ENCOMENDA' || (/^re:/i.test(m.subject||'') && /\b(mais|acrescent|adicion|retir|alter|afinal|em vez|apenas|s[oó])\b/i.test(low));

      if(!alteration){
        if(parsed.length>=2 || !started) current.clear();
        parsed.forEach(item=>current.set(item.key,item));
        started=true;
        continue;
      }

      for(const item of parsed){
        const lineLow=item.raw.toLowerCase();
        const old=current.get(item.key);
        if(/\b(retirar|retira|anular|anula|cancelar|cancela|sem)\b/.test(lineLow) && item.qty===0){
          current.delete(item.key);
        }else if(/\bmais\b|acrescent|adicion/.test(lineLow) && old && String(old.unit).toLowerCase()===String(item.unit).toLowerCase()){
          const newQty=old.qty+item.qty;
          const replacement=old.raw.replace(/^\s*\d+(?:[.,]\d+)?/,String(newQty).replace('.',','));
          current.set(item.key,{...old,qty:newQty,raw:replacement});
        }else current.set(item.key,item);
      }
    }

    return [...current.values()].map(x=>x.raw).join(' · ');
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

      const parsed=orderLinesFromMessage(m);
      const text=((m.current||m.text||'')+' '+(m.subject||'')).toLowerCase();
      if(parsed.length){
        if(/^re:/i.test(m.subject||'') && /\b(mais|acrescent|adicion|retir|alter|afinal|em vez|apenas|s[oó])\b/i.test(text)) return 'ALTERAÇÃO À ENCOMENDA';
        return 'ENCOMENDA';
      }

      // Um RE: de uma encomenda não passa a ser outra encomenda só por manter o assunto.
      // Se não contém uma linha de pedido real, é conversa/pedido de informação.
      if(base==='ENCOMENDA' && /^re:/i.test(m.subject||'')){
        return QUESTIONISH_RE.test(m.current||m.text||'') ? 'PEDIDO DE INFORMAÇÃO' : 'CONVERSA / REVER';
      }
      return base;
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
      if(!row){row=document.createElement('li');summary.insertBefore(row,summary.children[1]||null);}
      row.textContent=`Pedido final: ${generic}`;
    };

    if(Array.isArray(state.messages)&&state.messages.length){
      state.threads=buildThreads(state.messages);
      try{renderAllReal();}catch{}
    }

    window.VitalVegOrderParser={parseOrderLine,orderLinesFromMessage,genericFinalOrderSummary};
  }

  install();
})();