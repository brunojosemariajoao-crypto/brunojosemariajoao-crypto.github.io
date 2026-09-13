(()=>{
  const labels={shadow:'Sombra · zero envios',assist:'Assistente · tu aprovas',autonomous:'Autónomo · regras ativas'};
  let current=null,lastState=null;

  async function api(url,options={}){
    const res=await fetch(url,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||`Erro ${res.status}`);
    return data;
  }
  function toast(message){
    const el=document.querySelector('#toast');if(!el)return;
    el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800);
  }
  function controlHtml(data){
    const mode=data?.mode||'shadow';
    return `<section id="aiModeControl" class="panel" style="margin-bottom:14px">
      <div class="panel-head"><div><h3>Modo do Funcionário Digital</h3><p>Este controlo define o que a IA está autorizada a fazer. A política de autonomia é um segundo cadeado independente.</p></div></div>
      <div class="panel-body">
        <div class="autonomy-levels">
          <div class="level-card ${mode==='shadow'?'active':''}"><strong>Sombra</strong><p>Lê e interpreta mensagens reais, mede qualidade e não altera a operação nem envia respostas.</p><button class="btn ${mode==='shadow'?'subtle':'ghost'}" data-ai-mode="shadow" ${mode==='shadow'?'disabled':''} style="margin-top:12px">${mode==='shadow'?'Ativo':'Voltar a Sombra'}</button></div>
          <div class="level-card ${mode==='assist'?'active':''}"><strong>Assistente</strong><p>A IA lê, organiza, cria/atualiza encomendas e prepara respostas. Tu confirmas antes de qualquer envio.</p><button class="btn ${mode==='assist'?'subtle':'primary'}" data-ai-mode="assist" ${mode==='assist'?'disabled':''} style="margin-top:12px">${mode==='assist'?'Ativo':'Ativar Assistente'}</button></div>
          <div class="level-card ${mode==='autonomous'?'active':''}"><strong>Autónomo</strong><p>Preparado no motor, mas bloqueado na primeira fase pública. Só será libertado depois de validarmos a qualidade real.</p><button class="btn ghost" disabled style="margin-top:12px">Aguardar validação</button></div>
          <div class="level-card"><strong>Qualidade IA</strong><p>As decisões do modo Sombra podem ser comparadas com a tua avaliação antes de subir o nível de confiança.</p><a class="btn ghost" href="./shadow.html" style="display:inline-block;text-decoration:none;margin-top:12px">Abrir validação</a></div>
        </div>
        <div class="shadow-safe-note" style="margin-top:12px"><strong>Segurança:</strong> regressar a Sombra é sempre permitido. Passar a Assistente exige confirmação explícita. O envio autónomo permanece bloqueado por modo + política + confiança + risco.</div>
      </div>
    </section>`;
  }
  function installControl(){
    const content=document.querySelector('#content');if(!content)return;
    const heading=[...content.querySelectorAll('h2')].find(x=>/Regras e autonomia/i.test(x.textContent||''));
    if(!heading){document.querySelector('#aiModeControl')?.remove();return;}
    if(document.querySelector('#aiModeControl'))return;
    const pageHead=heading.closest('.page-head');
    if(pageHead)pageHead.insertAdjacentHTML('afterend',controlHtml(current||{mode:'shadow'}));
    content.querySelectorAll('[data-ai-mode]').forEach(btn=>btn.addEventListener('click',()=>changeMode(btn.dataset.aiMode)));
  }
  function healthView(worker,mode){
    const h=worker||{};const now=Date.now();const at=h.lastRunAt?new Date(h.lastRunAt).getTime():0;
    const stale=at&&Number.isFinite(at)&&now-at>12*60*1000;
    if(stale)return {level:'error',title:'Funcionário Digital sem verificação recente',copy:'A sincronização automática devia executar de 5 em 5 minutos. É preciso verificar o serviço antes de confiar no estado apresentado.',meta:`Última execução ${Math.round((now-at)/60000)} min atrás`,icon:'!'};
    if(h.code==='mailbox_unconfigured')return {level:'error',title:'Funcionário Digital parado',copy:'A caixa de email ainda não está configurada no servidor. Nenhuma mensagem pode ser analisada.',meta:'Email por configurar',icon:'!'};
    if(h.code==='ai_not_configured')return {level:'error',title:'IA ainda não configurada',copy:'Os emails podem ser sincronizados, mas o funcionário digital não está a analisá-los enquanto faltar a configuração da IA.',meta:'OPENAI_API_KEY necessária',icon:'!'};
    if(h.code==='ai_budget_reached')return {level:'warn',title:'Limite diário da IA atingido',copy:'Novas análises estão em pausa por segurança. Os emails não são apagados e voltarão a ser processados quando houver orçamento disponível.',meta:'Consumo protegido',icon:'!'};
    if(h.status==='degraded')return {level:'error',title:'Atenção: houve erro no processamento',copy:'Pelo menos uma conversa não foi analisada corretamente. A Central irá tentar novamente e não deve considerar esta fila totalmente tratada.',meta:h.lastError?'Erro registado':'Revisão necessária',icon:'!'};
    if(h.status==='backlog'||Number(h.deferredThreads||0)>0)return {level:'warn',title:'Existem conversas em fila para a IA',copy:'O limite de processamento desta ronda foi atingido. As restantes conversas ficam guardadas para a próxima passagem automática.',meta:`${Number(h.deferredThreads||0)} pendente${Number(h.deferredThreads||0)===1?'':'s'}`,icon:'…'};
    if(h.status==='unknown'||h.code==='not_run_yet'||!h.lastRunAt)return {level:'info',title:'A aguardar a primeira verificação automática',copy:'O funcionário digital ainda não registou uma passagem completa desde esta instalação.',meta:labels[mode]||'',icon:'i'};
    return null;
  }
  function installHealthBanner(worker,mode){
    const content=document.querySelector('#content');if(!content)return;
    const existing=document.querySelector('#aiHealthBanner');
    const view=healthView(worker,mode);
    if(!view){existing?.remove();return;}
    const className=`ai-health-banner ${view.level==='warn'?'':view.level}`;
    const html=`<div class="ai-health-icon">${view.icon}</div><div class="ai-health-copy"><strong>${view.title}</strong><span>${view.copy}</span></div><div class="ai-health-meta">${view.meta||''}</div>`;
    if(existing){existing.className=className;existing.innerHTML=html;return;}
    const banner=document.createElement('div');banner.id='aiHealthBanner';banner.className=className;banner.innerHTML=html;
    content.insertAdjacentElement('afterbegin',banner);
  }
  function updateHealthStatus(worker,mode){
    const dot=document.querySelector('#aiStatusDot');const mini=document.querySelector('#miniAiDot');const text=document.querySelector('#aiStatusText');const miniText=document.querySelector('#miniAiStatus');
    const view=healthView(worker,mode);
    [dot,mini].forEach(el=>{el?.classList.remove('ok','warn','error');el?.classList.add(view?(view.level==='info'?'warn':view.level):'ok');});
    if(view){if(text)text.textContent=view.title;if(miniText)miniText.textContent=view.level==='error'?'IA precisa de atenção':'IA com aviso';}
    else{if(text)text.textContent=mode==='shadow'?'Sombra a observar':mode==='assist'?'A analisar e preparar':'Autonomia operacional';if(miniText)miniText.textContent='IA operacional';}
  }
  async function changeMode(mode){
    try{
      if(mode==='assist'){
        const ok=window.confirm('Ativar o modo Assistente?\n\nA IA passará a organizar a operação e preparar respostas, mas nada será enviado sem a tua aprovação.');
        if(!ok)return;
        await api('/api/ai/mode',{method:'POST',body:JSON.stringify({mode:'assist',confirmationText:'ATIVAR ASSISTENTE'})});
        toast('Funcionário Digital em modo Assistente. Continuas a aprovar os envios.');
      }else if(mode==='shadow'){
        await api('/api/ai/mode',{method:'POST',body:JSON.stringify({mode:'shadow'})});
        toast('Modo Sombra ativado. A IA observa sem executar ações.');
      }
      await refreshMode();
      location.reload();
    }catch(e){toast(e.message||'Não foi possível alterar o modo da IA.');}
  }
  async function refreshMode(){
    const target=document.querySelector('#autonomyStatusText');
    try{
      const data=await api('/api/ai/state');lastState=data;current={mode:data.operationMode||'shadow'};
      if(target)target.textContent=labels[current.mode]||'A verificar';
      updateHealthStatus(data.workerHealth,current.mode);
      installHealthBanner(data.workerHealth,current.mode);
      const strip=document.querySelector('.status-strip');
      if(strip){
        let link=document.querySelector('#shadowValidationLink');
        if(current.mode==='shadow'){
          if(!link){
            link=document.createElement('a');link.id='shadowValidationLink';link.href='./shadow.html';
            link.textContent='Validar decisões da IA';
            link.style.cssText='white-space:nowrap;color:#0d6a45;font-weight:800;text-decoration:none;font-size:11px';
            strip.appendChild(link);
          }
        }else if(link)link.remove();
      }
      const old=document.querySelector('#aiModeControl');if(old)old.remove();installControl();
    }catch{
      const synthetic={status:'degraded',code:'worker_error',lastRunAt:new Date().toISOString(),lastError:'Não foi possível ler o estado do funcionário digital.'};
      if(target)target.textContent='A verificar';
      updateHealthStatus(synthetic,current?.mode||'shadow');
      installHealthBanner(synthetic,current?.mode||'shadow');
    }
  }
  window.addEventListener('load',()=>{
    refreshMode();setInterval(refreshMode,30000);
    const content=document.querySelector('#content');
    if(content)new MutationObserver(()=>{
      installControl();
      if(lastState&&!document.querySelector('#aiHealthBanner'))installHealthBanner(lastState.workerHealth,current?.mode||'shadow');
    }).observe(content,{childList:true,subtree:false});
  });
})();
