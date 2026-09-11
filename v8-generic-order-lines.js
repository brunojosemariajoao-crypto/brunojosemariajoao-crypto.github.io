/* Central VitalVeg V8.5.3 — pedido final resulta do acordo completo cliente + VitalVeg */
(() => {
  const ORDER_UNIT_RE = /\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const ORDER_UNIT_RE_GLOBAL = /\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/ig;
  const DIRECT_UNIT_LINE_RE = /^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const ACTION_UNIT_LINE_RE = /^(?:por\s+favor[,;:]?\s*)?(?:mais|afinal|quero|queria|acrescent(?:ar|e|em)?|adicion(?:ar|e|em)?|retir(?:ar|e|em)?|menos|preciso\s+de|pode\s+(?:acrescentar|adicionar|retirar)|podem\s+(?:acrescentar|adicionar|retirar))\s+(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;
  const CONVERSATION_TAIL_RE = /^(?:para|por|se|ser[aá]\s+que|consegue|conseguem|pode|podem|cliente|obrigad|favor|tenho|temos|preciso|queria|quero)\b/i;
  const QUESTIONISH_RE = /\?|\bser[aá]\s+que\b|\bconsegue[m]?\b|\b[eé]\s+poss[ií]vel\b|\bdispon[ií]vel\b|\bdisponibilidade\b|\bpodem?\s+(?:informar|confirmar|fornecer|arranjar)\b/i;
  const REQUESTISH_RE = /\b(?:encomenda|preciso|queria|quero|consegue[m]?|arranjar|fornecer|mandar|enviar|mais|tamb[eé]m|acrescent|adicion)\b/i;
  const ACCEPT_RE = /\b(?:consigo|conseguimos|arranjo|arranjamos|vou\s+arranjar|vamos\s+arranjar|vou\s+conseguir|vamos\s+conseguir|incluo|inclu[ií]mos|podemos\s+(?:arranjar|fornecer|incluir)|fica\s+inclu[ií]do|confirmo\s+que\s+(?:sim|consigo))\b/i;
  const ACCEPT_CONTEXT_RE = /\b(?:para\s+(?:a|o)\s+cliente|fica\s+para\s+(?:a|o)\s+cliente)\b/i;
  const REJECT_RE = /\b(?:n[aã]o\s+(?:consigo|conseguimos|temos|h[aá]|vou\s+conseguir|vamos\s+conseguir|[eé]\s+poss[ií]vel|est[aá]\s+dispon[ií]vel|estar[aá]\s+dispon[ií]vel)|sem\s+stock|indispon[ií]vel|n[aã]o\s+dispon[ií]vel)\b/i;
  const DEFER_RE = /\b(?:pr[oó]xima\s+entrega|pr[oó]ximo\s+dia|fica\s+para\s+(?:ter[cç]a|quinta|s[aá]bado)|n[aã]o\s+nesta\s+entrega)\b/i;
  const ADDITIVE_CONTEXT_RE = /\b(?:mais|acrescent(?:ar|e|em)?|adicion(?:ar|e|em)?|tamb[eé]m)\s*$/i;
  const ITEM_STOPWORDS = new Set(['de','do','da','dos','das','um','uma','uns','umas','o','a','os','as','e','para','cliente','cx','cxs','caixa','caixas','kg','kgs','quilo','quilos','covete','covetes','un','unid','unidade','unidades','molho','molhos','tabuleiro','tabuleiros','saco','sacos']);

  function cleanLine(line=''){
    return String(line).replace(/^[-•*\s]+/,'').replace(/\s+/g,' ').trim();
  }

  function normalKey(text=''){
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function singularToken(token=''){
    const t=normalKey(token);
    return t.length>4 && t.endsWith('s') ? t.slice(0,-1) : t;
  }

  function itemTokens(text=''){
    return normalKey(text).split(/\s+/).map(singularToken).filter(t=>t.length>=3&&!ITEM_STOPWORDS.has(t));
  }

  function unitFamily(unit=''){
    const u=normalKey(unit);
    if(['cx','cxs','caixa','caixas'].includes(u)) return 'cx';
    if(['kg','kgs','quilo','quilos'].includes(u)) return 'kg';
    if(['covete','covetes'].includes(u)) return 'covete';
    if(['un','unid','unidade','unidades'].includes(u)) return 'un';
    if(['molho','molhos'].includes(u)) return 'molho';
    if(['tabuleiro','tabuleiros'].includes(u)) return 'tabuleiro';
    if(['saco','sacos'].includes(u)) return 'saco';
    return u;
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

    const simple=raw.match(/^(?:por\s+favor[,;:]?\s*)?(?:(?:mais|afinal|quero|queria|acrescent(?:ar|e|em)?|adicion(?:ar|e|em)?|retir(?:ar|e|em)?|menos)\s+)?(\d+(?:[.,]\d+)?)\s+([\p{L}][\p{L}\d ./%ºª_-]{1,})$/iu);
    if(!simple) return null;
    const description=simple[2].trim();
    const low=description.toLowerCase();
    if(conversationalTail(description)) return null;
    if(/^(dia|dias|hora|horas|minuto|minutos|vez|vezes|euros?|€)\b/.test(low)) return null;
    if(/^\d{1,2}[\/-]\d{1,2}/.test(description)) return null;
    return {raw,qty:Number(simple[1].replace(',','.')),unit:'un',description,key:normalKey(description),matched:simple[0]};
  }

  function messageText(m){
    return (m?.current || (typeof currentText==='function'?currentText(m?.text||''):m?.text||'')).replace(/\r/g,'');
  }

  function orderLinesFromMessage(m){
    return messageText(m).split(/\n+/).map(parseOrderLine).filter(Boolean);
  }

  function descriptionAfterMention(text,match){
    const after=String(text).slice((match.index||0)+match[0].length)
      .replace(/^\s*[-:–—]?\s*/,'')
      .split(/[?!.;,\n]/)[0]
      .trim();
    if(!after || conversationalTail(after)) return '';
    const cleaned=after.replace(/^(?:de|do|da|dos|das)\s+/i,'').trim();
    if(!cleaned || cleaned.length>80 || QUESTIONISH_RE.test(cleaned)) return '';
    return cleaned;
  }

  function quantityMentions(m){
    const text=messageText(m);
    const out=[];
    ORDER_UNIT_RE_GLOBAL.lastIndex=0;
    let hit;
    while((hit=ORDER_UNIT_RE_GLOBAL.exec(text))){
      const description=descriptionAfterMention(text,hit);
      out.push({
        raw:cleanLine(hit[0]+(description?` ${description}`:'')),
        qty:Number(hit[1].replace(',','.')),
        unit:hit[2],
        description,
        key:description?normalKey(description):'',
        index:hit.index||0
      });
      if(hit.index===ORDER_UNIT_RE_GLOBAL.lastIndex) ORDER_UNIT_RE_GLOBAL.lastIndex++;
    }
    return out;
  }

  function conversationalRequests(m){
    if(m?.direction!=='in') return [];
    const text=messageText(m);
    if(!REQUESTISH_RE.test(text) && !QUESTIONISH_RE.test(text)) return [];
    const explicit=orderLinesFromMessage(m);
    const explicitSignatures=new Set(explicit.map(x=>`${x.qty}|${unitFamily(x.unit)}|${x.key}`));
    return quantityMentions(m)
      .filter(x=>!explicitSignatures.has(`${x.qty}|${unitFamily(x.unit)}|${x.key}`))
      .map(x=>{
        const before=text.slice(Math.max(0,x.index-45),x.index).trim();
        return {...x,operation:ADDITIVE_CONTEXT_RE.test(before)?'add':'set'};
      });
  }

  function isAcceptedOutbound(m,mentions){
    if(m?.direction!=='out') return false;
    const text=messageText(m);
    if(REJECT_RE.test(text) || DEFER_RE.test(text)) return false;
    if(ACCEPT_RE.test(text)) return true;
    return mentions.length>0 && ACCEPT_CONTEXT_RE.test(text);
  }

  function isRejectedOutbound(m){
    return m?.direction==='out' && REJECT_RE.test(messageText(m));
  }

  function pendingMatch(pending,mention){
    const sameQty=Math.abs(Number(pending.qty)-Number(mention.qty))<0.0001;
    if(!sameQty) return false;
    const a=unitFamily(pending.unit), b=unitFamily(mention.unit);
    return a===b || ((a==='un'||b==='un') && (a==='molho'||b==='molho'));
  }

  function itemReferencedByText(item,text=''){
    const hay=new Set(itemTokens(text));
    const needles=itemTokens(`${item?.description||''} ${item?.raw||''}`);
    return needles.some(t=>hay.has(t));
  }

  function removeUnavailableItems(current,known,m){
    if(!isRejectedOutbound(m)) return [];
    const text=messageText(m);
    const removed=[];
    for(const [key,item] of current.entries()){
      if(itemReferencedByText(item,text)){
        known.set(key,{...item});
        current.delete(key);
        removed.push(key);
      }
    }
    return removed;
  }

  function resolvePendingKey(candidate,current,known,outboundMention){
    const pools=new Map([...known.entries(),...current.entries()]);
    if(candidate.key && pools.has(candidate.key)) return candidate.key;
    if(outboundMention?.key && pools.has(outboundMention.key)) return outboundMention.key;

    const family=unitFamily(candidate.unit);
    const entries=[...pools.entries()];
    const byUnit=entries.filter(([,item])=>unitFamily(item.unit)===family);
    if(byUnit.length===1) return byUnit[0][0];

    const token=family==='molho'?'molho':family==='covete'?'covete':family==='saco'?'saco':family==='tabuleiro'?'tabuleiro':'';
    if(token){
      const byDescription=entries.filter(([,item])=>normalKey(item.description||item.raw).includes(token));
      if(byDescription.length===1) return byDescription[0][0];
    }

    if(candidate.key) return candidate.key;
    if(outboundMention?.key) return outboundMention.key;
    return '';
  }

  function setAcceptedCandidate(current,known,candidate,mention,unresolved){
    const key=resolvePendingKey(candidate,current,known,mention);
    if(!key){
      unresolved.push(`${candidate.qty} ${candidate.unit} confirmados na conversa, artigo por identificar`);
      return;
    }

    const active=current.get(key);
    const remembered=known.get(key);
    const old=active||remembered;
    const additive=candidate.operation==='add' && !!active;
    const finalQty=additive ? Number(active.qty)+Number(candidate.qty) : Number(candidate.qty);

    if(old){
      const replacement=String(old.raw||'').replace(/^\s*\d+(?:[.,]\d+)?/,String(finalQty).replace('.',','));
      const next={...old,qty:finalQty,raw:replacement||`${String(finalQty).replace('.',',')} ${old.unit} ${old.description||key}`};
      current.set(key,next);
      known.set(key,{...next});
      return;
    }

    const description=candidate.description||mention?.description||key;
    const next={
      raw:`${String(finalQty).replace('.',',')} ${candidate.unit} ${description}`.trim(),
      qty:finalQty,
      unit:candidate.unit,
      description,
      key
    };
    current.set(key,next);
    known.set(key,{...next});
  }

  function genericFinalOrderSummary(thread){
    if(!thread?.messages?.length) return '';
    const messages=[...thread.messages].sort((a,b)=>new Date(a.date)-new Date(b.date));
    const current=new Map();
    const known=new Map();
    const pending=[];
    const unresolved=[];
    let started=false;

    for(const m of messages){
      if(m.direction==='in'){
        const parsed=orderLinesFromMessage(m);
        if(parsed.length){
          const low=((m.current||m.text||'')+' '+(m.subject||'')).toLowerCase();
          const alteration = m.type==='ALTERAÇÃO À ENCOMENDA' || (/^re:/i.test(m.subject||'') && /\b(mais|acrescent|adicion|retir|alter|afinal|em vez|apenas|s[oó])\b/i.test(low));

          if(!alteration){
            if(parsed.length>=2 || !started) current.clear();
            parsed.forEach(item=>{ current.set(item.key,item); known.set(item.key,{...item}); });
            started=true;
          }else{
            for(const item of parsed){
              const lineLow=item.raw.toLowerCase();
              const old=current.get(item.key);
              if(/\b(retirar|retira|anular|anula|cancelar|cancela|sem)\b/.test(lineLow) && item.qty===0){
                if(old) known.set(item.key,{...old});
                current.delete(item.key);
              }else if(/\bmais\b|acrescent|adicion/.test(lineLow) && old){
                const newQty=old.qty+item.qty;
                const replacement=old.raw.replace(/^\s*\d+(?:[.,]\d+)?/,String(newQty).replace('.',','));
                const next={...old,qty:newQty,raw:replacement};
                current.set(item.key,next); known.set(item.key,{...next});
              }else{
                current.set(item.key,item); known.set(item.key,{...item});
              }
            }
          }
        }

        for(const request of conversationalRequests(m)){
          pending.push({...request,messageId:m.id||'',date:m.date});
        }
        continue;
      }

      if(m.direction!=='out') continue;
      const mentions=quantityMentions(m);

      if(isRejectedOutbound(m)){
        removeUnavailableItems(current,known,m);
        if(pending.length){
          if(mentions.length){
            for(const mention of mentions){
              const i=[...pending].map((p,idx)=>({p,idx})).reverse().find(x=>pendingMatch(x.p,mention))?.idx;
              if(i!==undefined) pending.splice(i,1);
            }
          }else if(pending.length===1){
            pending.pop();
          }
        }
        continue;
      }

      if(!pending.length || !isAcceptedOutbound(m,mentions)) continue;

      if(mentions.length){
        for(const mention of mentions){
          const found=[...pending].map((p,idx)=>({p,idx})).reverse().find(x=>pendingMatch(x.p,mention));
          if(!found) continue;
          setAcceptedCandidate(current,known,found.p,mention,unresolved);
          pending.splice(found.idx,1);
        }
      }else if(pending.length===1 && ACCEPT_RE.test(messageText(m))){
        const candidate=pending.pop();
        setAcceptedCandidate(current,known,candidate,null,unresolved);
      }
    }

    const rows=[...current.values()].map(x=>x.raw);
    if(unresolved.length) rows.push(`A rever: ${unresolved.join(' · ')}`);
    return rows.join(' · ');
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

      if(conversationalRequests(m).length){
        return 'PEDIDO DE INFORMAÇÃO';
      }

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

    window.VitalVegOrderParser={
      parseOrderLine,
      orderLinesFromMessage,
      conversationalRequests,
      quantityMentions,
      genericFinalOrderSummary
    };
  }

  install();
})();