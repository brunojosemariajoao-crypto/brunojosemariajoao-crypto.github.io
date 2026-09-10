(()=>{
  const labels={shadow:'Sombra · zero envios',assist:'Assistente · tu aprovas',autonomous:'Autónomo · regras ativas'};
  let current=null;

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
      if(typeof window.loadAll==='function')await window.loadAll(true);
      else location.reload();
    }catch(e){toast(e.message||'Não foi possível alterar o modo da IA.');}
  }
  async function refreshMode(){
    const target=document.querySelector('#autonomyStatusText');
    try{
      const data=await api('/api/ai/mode');current=data;
      if(target)target.textContent=labels[data.mode]||'A verificar';
      const strip=document.querySelector('.status-strip');
      if(strip){
        let link=document.querySelector('#shadowValidationLink');
        if(data.mode==='shadow'){
          if(!link){
            link=document.createElement('a');link.id='shadowValidationLink';link.href='./shadow.html';
            link.textContent='Validar decisões da IA';
            link.style.cssText='white-space:nowrap;color:#0d6a45;font-weight:800;text-decoration:none;font-size:11px';
            strip.appendChild(link);
          }
        }else if(link)link.remove();
      }
      const old=document.querySelector('#aiModeControl');if(old)old.remove();installControl();
    }catch{if(target)target.textContent='A verificar';}
  }
  window.addEventListener('load',()=>{
    refreshMode();setInterval(refreshMode,30000);
    const content=document.querySelector('#content');if(content)new MutationObserver(()=>installControl()).observe(content,{childList:true,subtree:false});
  });
})();
