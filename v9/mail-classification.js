(()=>{
  const ANALYSIS_START=Date.parse('2026-09-12T23:00:00.000Z');

  function prettyType(value){
    const raw=String(value||'').trim();
    const map={
      ENCOMENDA:'Encomenda',
      ALTERACAO_ENCOMENDA:'Alteração de encomenda',
      CANCELAMENTO_ENCOMENDA:'Cancelamento de encomenda',
      PEDIDO_CONFIRMACAO:'Pedido de confirmação',
      SEM_ACAO:'Sem ação',
      AUTOMATICO_SISTEMA:'Automático / sistema',
      PUBLICIDADE_MARKETING:'Publicidade / marketing',
      DOCUMENTO_FATURA:'Documento / fatura'
    };
    if(map[raw])return map[raw];
    return raw?raw.toLowerCase().replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()):'Classificado';
  }

  function classificationFor(message){
    if(message?.direction==='out')return {label:'Enviado',state:'sent'};
    const ids=new Set([message?.id,message?.messageId].filter(Boolean).map(String));
    const activity=(state.ops?.recentActivity||[]).find(a=>
      a?.type==='ai_processed' && ids.has(String(a?.data?.sourceMessageId||''))
    );
    if(activity)return {label:`IA · ${prettyType(activity?.data?.messageType)}`,state:'done'};
    const at=Date.parse(message?.date||'');
    if(Number.isFinite(at)&&at<ANALYSIS_START)return {label:'Histórico encerrado',state:'historical'};
    return {label:'IA · a aguardar análise',state:'pending'};
  }

  renderEmails=function(){
    const messages=state.mail?.messages||[];
    const warning=state.mail?.syncWarning?`<div class="warning-box" style="margin-bottom:14px">${esc(state.mail.syncWarning)}</div>`:'';
    return `${pageHead('Emails / Classificados','Todos os emails ficam visíveis aqui. Os recebidos mostram também a classificação da IA, mesmo quando não são encomendas.')}${warning}<div class="secondary-note"><strong>Registo completo.</strong> “Sem ação”, publicidade, faturas e mensagens automáticas continuam visíveis e auditáveis; só não entram em “Precisa de mim” quando não exigem decisão.</div><div class="email-list">${messages.length?messages.map(m=>{
      const cls=classificationFor(m);
      return `<button class="email-row" data-mail-id="${esc(m.id)}" style="width:100%;text-align:left"><div><strong>${esc(m.direction==='out'?'VitalVeg':m.from||'')}</strong><br><small>${esc(fmtWhen(m.date))}</small></div><div class="subject">${esc(m.subject||'(sem assunto)')}</div><div class="preview">${esc(compactText(m.text,180))}</div><span class="email-direction" title="Estado da mensagem na Central">${esc(cls.label)}</span></button>`;
    }).join(''):empty('Não existem mensagens disponíveis no servidor.')}</div>`;
  };
  window.renderEmails=renderEmails;
})();
