/* Central VitalVeg V8.5.2 — pedido final resulta da conversa cliente + VitalVeg */
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
  const REJECT_RE = /\b(?:n[aã]o\s+(?:consigo|conseguimos|temos|h[aá]|vou\s+conseguir|vamos\s+conseguir|[eé]\s+poss[ií]vel)|sem\s+stock|indispon[ií]vel|n[aã]o\s+dispon[ií]vel)\b/i;
  const DEFER_RE = /\b(?:pr[oó]xima\s+entrega|pr[oó]ximo\s+dia|fica\s+para\s+(?:ter[cç]a|quinta|s[aá]bado)|n[aã]o\s+nesta\s+entrega)\b/i;

  function cleanLine(line=''){
    return String(line).replace(/^[-•*\s]+/,'').replace(/\s+/g,' ').trim();
  }

  function normalKey(text=''){
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
    return quantityMentions(m).filter(x=>!explicitSignatures.has(`${x.qty}|${unitFamily(x.unit)}|${x.key}`));
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

  function resolvePendingKey(candidate,current,outboundMention){
    if(candidate.key) return candidate.key;
    if(outboundMention?.key) return outboundMention.key;

    const family=unitFamily(candidate.unit);
    const entries=[...current.entries()];
    const byUnit=entries.filter(([,item])=>unitFamily(item.unit)===family);
    if(byUnit.length===1) return byUnit[0][0];

    // Ex.: pedido inicial "5 unid de molhos de nabiça" e depois "consegue 2 molhos?".
    // Se só existe um artigo cujo nome menciona a unidade pedida, o contexto identifica-o.
    const token=family==='molho'?'molho':family==='covete'?'covete':family==='saco'?'saco':family==='tabuleiro'?'tabuleiro':'';
    if(token){
      const byDescription=entries.filter(([,item])=>normalKey(item.description||item.raw).includes(token));
      if(byDescription.length===1) return byDescription[0][0];
    }
    return '';
  }

  function addAcceptedCandidate(current,candidate,mention,unresolved){
    const key=resolvePendingKey(candidate,current,mention);
    if(!key){
      unresolved.push(`${candidate.qty} ${candidate.unit} confirmados na conversa, artigo por identificar`);
      return;
    }

    const old=current.get(key);
    if(old){
      const newQty=Number(old.qty)+Number(candidate.qty);
      const replacement=String(old.raw||'').replace(/^\s*\d+(?:[.,]\d+)?/,String(newQty).replace('.',','));
      current.set(key,{...old,qty:newQty,raw:replacement||`${newQty} ${old.unit} ${old.description||key}`});
      return;
    }

    const description=candidate.description||mention?.description||key;
    current.set(key,{
      raw:`${String(candidate.qty).replace('.',',')} ${candidate.unit} ${description}`.trim(),
      qty:candidate.qty,
      unit:candidate.unit,
      description,
      key
    });
  }

  function genericFinalOrderSummary(thread){
    if(!thread?.messages?.length) return '';
    const messages=[...thread.messages].sort((a,b)=>new Date(a.date)-new Date(b.date));
    const current=new Map();
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
            parsed.forEach(item=>current.set(item.key,item));
            started=true;
          }else{
            for(const item of parsed){
              const lineLow=item.raw.toLowerCase();
              const old=current.get(item.key);
              if(/\b(retirar|retira|anular|anula|cancelar|cancela|sem)\b/.test(lineLow) && item.qty===0){
                current.delete(item.key);
              }else if(/\bmais\b|acrescent|adicion/.test(lineLow) && old){
                const newQty=old.qty+item.qty;
                const replacement=old.raw.replace(/^\s*\d+(?:[.,]\d+)?/,String(newQty).replace('.',','));
                current.set(item.key,{...old,qty:newQty,raw:replacement});
              }else current.set(item.key,item);
            }
          }
        }

        // Uma frase de conversa como "tenho encomenda de 2 molhos, será que consegue?"
        // fica pendente. Só altera a encomenda se uma resposta posterior da VitalVeg a aceitar.
        for(const request of conversationalRequests(m)){
          pending.push({...request,messageId:m.id||'',date:m.date});
        }
        continue;
      }

      if(m.direction!=='out' || !pending.length) continue;
      const mentions=quantityMentions(m);

      if(isRejectedOutbound(m)){
        if(mentions.length){
          for(const mention of mentions){
            const i=[...pending].map((p,idx)=>({p,idx})).reverse().find(x=>pendingMatch(x.p,mention))?.idx;
            if(i!==undefined) pending.splice(i,1);
          }
        }else if(pending.length===1){
          pending.pop();
        }
        continue;
      }

      if(!isAcceptedOutbound(m,mentions)) continue;

      if(mentions.length){
        for(const mention of mentions){
          const found=[...pending].map((p,idx)=>({p,idx})).reverse().find(x=>pendingMatch(x.p,mention));
          if(!found) continue;
          addAcceptedCandidate(current,found.p,mention,unresolved);
          pending.splice(found.idx,1);
        }
      }else if(pending.length===1 && ACCEPT_RE.test(messageText(m))){
        const candidate=pending.pop();
        addAcceptedCandidate(current,candidate,null,unresolved);
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

      // Uma pergunta sobre quantidade dentro de um RE: não é automaticamente uma nova encomenda.
      // Fica como informação/conversa até a resposta da VitalVeg definir o resultado.
      if(conversationalRequests(m).length){
        return 'PEDIDO DE INFORMAÇÃO';
      }

      // Um RE: de uma encomenda não passa a ser outra encomenda só por manter o assunto.
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