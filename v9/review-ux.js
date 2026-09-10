(()=>{
  function mailAddress(value){
    const s=String(value||'');
    const angled=s.match(/<([^>]+)>/);if(angled)return angled[1].trim();
    const plain=s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);return plain?plain[0]:'';
  }
  function replySubject(value){const s=String(value||'(sem assunto)').trim();return /^re\s*:/i.test(s)?s:`Re: ${s}`;}
  function cleanMessage(m){return {
    id:m?.id||'',messageId:m?.messageId||'',date:m?.date||'',direction:m?.direction==='out'?'out':'in',
    from:m?.from||'',to:m?.to||'',subject:m?.subject||'(sem assunto)',text:m?.text||'',references:Array.isArray(m?.references)?m.references:[]
  };}
  function sourceMessagesFor(q,a){
    const saved=Array.isArray(q?.sourceMessages)?q.sourceMessages.map(cleanMessage):[];
    if(saved.length)return saved;
    const ids=new Set([q?.sourceMessageId,q?.inReplyTo,...(Array.isArray(a?.sourceMessageIds)?a.sourceMessageIds:[])].filter(Boolean).map(String));
    return (state.mail?.messages||[]).filter(m=>ids.has(String(m.id||''))||ids.has(String(m.messageId||''))).map(cleanMessage);
  }
  function messageBody(m){
    return `<div style="margin-top:10px;background:#f4f7f5;border:1px solid #dfe8e3;border-radius:14px;padding:13px;white-space:pre-wrap;line-height:1.55;font-size:13px;color:#24372e;overflow-wrap:anywhere">${esc(m.text||'(sem conteúdo de texto)')}</div>`;
  }
  function messageMeta(m){
    return `<div class="analysis-grid"><div class="analysis-cell"><small>De</small><strong>${esc(m.from||'—')}</strong></div><div class="analysis-cell"><small>Para</small><strong>${esc(m.to||'—')}</strong></div><div class="analysis-cell"><small>Data</small><strong>${esc(fmtWhen(m.date))}</strong></div><div class="analysis-cell"><small>Assunto</small><strong>${esc(m.subject||'(sem assunto)')}</strong></div></div>`;
  }
  function conversationHtml(messages){
    const list=[...(messages||[])].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    if(!list.length)return '<div class="warning-box">A mensagem original já não está na janela local de histórico. A classificação e a resposta continuam disponíveis.</div>';
    return list.map((m,i)=>{
      const label=m.direction==='out'?'Enviado pela VitalVeg':'Recebido do cliente';
      if(i===0)return `<article style="border:1px solid #cfe2d8;border-radius:16px;padding:14px;background:#fff"><div style="font-size:10px;font-weight:850;color:#0d6a45;text-transform:uppercase;letter-spacing:.08em;margin-bottom:9px">${label} · mensagem atual</div>${messageMeta(m)}${messageBody(m)}</article>`;
      return `<details style="margin-top:9px;border:1px solid #dfe8e3;border-radius:14px;background:#fff;overflow:hidden"><summary style="cursor:pointer;padding:12px 14px;font-size:12px;font-weight:750">${esc(label)} · ${esc(fmtWhen(m.date))} · ${esc(m.subject||'(sem assunto)')}</summary><div style="padding:0 14px 14px">${messageMeta(m)}${messageBody(m)}</div></details>`;
    }).join('');
  }
  function showDrawer(title,html){
    openDrawer(title,html);
    const body=document.querySelector('#drawerBody');if(body)body.scrollTop=0;
    requestAnimationFrame(()=>{document.querySelector('#closeDrawer')?.focus({preventScroll:true});});
  }

  openQueue=async function(id){
    showDrawer('A carregar revisão…','<div class="loading-state"><span class="loader"></span></div>');
    try{
      const d=await api(`/api/ai/queue?id=${encodeURIComponent(id)}`);const q=d.item,a=d.analysis||{},o=d.order;
      const conf=Math.round(Number(a.confidence||0)*100);
      const source=sourceMessagesFor(q,a);
      const orderHtml=o?`<div class="order-list">${orderCard(o)}</div>`:'<div class="mini-empty">Esta decisão não criou uma encomenda.</div>';
      const reasons=(q.reasons||[]).length?`<ul class="reason-list">${q.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<p>Sem alertas adicionais.</p>';
      const hasReply=!!String(q.suggestedReply||'').trim();
      document.querySelector('#drawerTitle').textContent=q.title||'Revisão';
      document.querySelector('#drawerBody').innerHTML=`
        <section class="detail-section"><h3>Email / conversa a rever</h3>${conversationHtml(source)}</section>
        <section class="detail-section"><h3>Leitura do funcionário digital</h3><div class="analysis-grid"><div class="analysis-cell"><small>Tipo</small><strong>${esc(a.messageType||'—')}</strong></div><div class="analysis-cell"><small>Confiança</small><strong>${conf?`${conf}%`:'—'}</strong></div><div class="analysis-cell"><small>Risco comercial</small><strong>${esc(a.commercialRisk||'—')}</strong></div><div class="analysis-cell"><small>Ação</small><strong>${esc(a.orderAction||'—')}</strong></div></div><div class="ai-confidence ${conf<90?'low':''}"><span style="width:${Math.max(0,Math.min(100,conf))}%"></span></div></section>
        ${o?`<section class="detail-section"><h3>Encomenda consolidada</h3>${orderHtml}</section>`:''}
        <section class="detail-section"><h3>Porque está aqui</h3>${reasons}</section>
        <section class="detail-section"><h3>${hasReply?'Resposta sugerida':'Responder ao cliente'}</h3><textarea id="approvalDraft" class="reply-editor" placeholder="Escreve ou corrige a resposta antes de enviar.">${esc(q.suggestedReply||'')}</textarea><div class="reply-footnote"><strong>${hasReply?'A resposta já vem preparada para tua confirmação.':'Podes escrever uma resposta manual mesmo quando a IA não propôs texto.'}</strong><br>A identificação de Inteligência Artificial é acrescentada automaticamente no envio e a cópia é guardada em Enviados.</div><div class="drawer-actions"><button id="approveSendBtn" class="btn primary">${hasReply?'Aprovar e enviar':'Enviar resposta'}</button><button id="rejectSuggestionBtn" class="btn danger">Encerrar sem enviar</button></div><p id="queueActionError" class="form-error"></p></section>`;
      document.querySelector('#approveSendBtn').onclick=()=>approveQueue(id);
      document.querySelector('#rejectSuggestionBtn').onclick=()=>rejectQueue(id);
      const body=document.querySelector('#drawerBody');if(body)body.scrollTop=0;
    }catch(e){document.querySelector('#drawerBody').innerHTML=`<div class="warning-box">${esc(e.message)}</div>`;}
  };

  openMail=function(id){
    const m=(state.mail?.messages||[]).find(x=>String(x.id)===String(id));if(!m){toast('Não foi possível localizar este email no histórico atual.');return;}
    const inbound=m.direction!=='out';
    const replyTo=mailAddress(m.from);
    const reply=`${inbound?`<section class="detail-section"><h3>Responder ao cliente</h3><textarea id="manualEmailDraft" class="reply-editor" placeholder="Escreve a resposta…"></textarea><div class="reply-footnote">A resposta só é enviada quando carregares em <strong>Enviar resposta</strong>. A cópia fica guardada em Enviados.</div><div class="drawer-actions"><button id="manualEmailSend" class="btn primary">Enviar resposta</button></div><p id="manualEmailError" class="form-error"></p></section>`:''}`;
    showDrawer(m.subject||'(sem assunto)',`<section class="detail-section"><h3>${inbound?'Email recebido':'Email enviado'}</h3>${messageMeta(cleanMessage(m))}${messageBody(cleanMessage(m))}</section>${reply}`);
    if(inbound){
      document.querySelector('#manualEmailSend').onclick=async()=>{
        const text=String(document.querySelector('#manualEmailDraft')?.value||'').trim();
        const error=document.querySelector('#manualEmailError');if(error)error.textContent='';
        if(!text){if(error)error.textContent='Escreve a resposta antes de enviar.';return;}
        if(!replyTo){if(error)error.textContent='Não foi possível identificar o endereço do remetente.';return;}
        const btn=document.querySelector('#manualEmailSend');btn.disabled=true;btn.textContent='A enviar…';
        try{
          const r=await api('/api/send',{method:'POST',body:JSON.stringify({to:replyTo,subject:replySubject(m.subject),text,inReplyTo:m.messageId||'',references:[...(m.references||[]),m.messageId].filter(Boolean)})});
          toast(r.savedToSent?'Resposta enviada e guardada em Enviados.':'Resposta enviada; existe um aviso na cópia de Enviados.');
          closeDrawer();await loadAll(true);
        }catch(e){if(error)error.textContent=e.message;}
        finally{btn.disabled=false;btn.textContent='Enviar resposta';}
      };
    }
  };

  window.openQueue=openQueue;
  window.openMail=openMail;
})();
