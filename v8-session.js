/* Central VitalVeg V8.9 — sessão partilhada entre PC e telemóvel */
(() => {
  const ACCOUNT='geral@vitalveg.pt';
  const PIN_KEY='vitalveg-local-pin-v1';
  let installed=false;

  function loadOnce(src,marker){
    return new Promise(resolve=>{
      const existing=document.querySelector(`script[${marker}]`);
      if(existing){ if(existing.dataset.loaded==='1') return resolve(); existing.addEventListener('load',resolve,{once:true}); return; }
      const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(marker,'1');
      s.addEventListener('load',()=>{s.dataset.loaded='1';resolve();},{once:true});
      s.addEventListener('error',()=>resolve(),{once:true});
      document.body.appendChild(s);
    });
  }

  function applyMail(data){
    if(!data||!Array.isArray(data.messages))return;
    state.messages=data.messages;
    state.threads=buildThreads(state.messages);
    state.lastFetchedAt=data.fetchedAt||state.lastFetchedAt;
    try{renderAllReal();}catch{}
  }

  async function postAccess(action,pinHash){
    try{
      const res=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,pinHash})});
      const data=await res.json().catch(()=>({}));
      return {ok:res.ok,status:res.status,data};
    }catch{return {ok:false,status:0,data:{}};}
  }

  async function ensureServerAccess(){
    if(window.VitalVegAccess?.sync){
      try{return await window.VitalVegAccess.sync();}catch{}
    }
    const pinHash=localStorage.getItem(PIN_KEY)||'';
    if(!pinHash)return false;
    const login=await postAccess('login',pinHash);
    if(login.ok)return true;
    if(login.status===409&&login.data?.code==='not_configured'){
      const bootstrap=await postAccess('bootstrap',pinHash);
      if(bootstrap.ok){
        const retry=await postAccess('login',pinHash);
        return retry.ok;
      }
    }
    return false;
  }

  async function mailRequest(method,payload){
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(method==='POST')opts.body=JSON.stringify(payload||{});
    return fetch('/api/mail',opts);
  }

  async function install(){
    if(installed)return;
    if(typeof state==='undefined'||typeof fetchRealMail!=='function'||typeof openConnectGate!=='function'||typeof sendReply!=='function'){setTimeout(install,80);return;}
    installed=true;

    await loadOnce('v8-generic-order-lines.js?v=8.9.1','data-v8-generic-order-lines-js');
    await loadOnce('v8-print-fix.js?v=8.9','data-v8-print-fix-js');

    const baseOpenConnectGate=openConnectGate;
    openConnectGate=function(message=''){
      baseOpenConnectGate(message);
      const card=document.querySelector('#connectGate .connect-card');
      const p=card?.querySelector('p');
      if(p)p.innerHTML=`A caixa <strong>${ACCOUNT}</strong> já fica ligada à Central. A palavra-passe só é necessária na configuração inicial ou se for alterada.`;
      const note=card?.querySelector('.connect-note');
      if(note)note.textContent='Depois de ligada, PC e telemóvel usam a mesma caixa através do PIN da Central. As respostas continuam sempre sujeitas a confirmação humana.';
      const btn=document.querySelector('#connectNow');if(btn)btn.textContent='Ligar caixa de email';
    };

    fetchRealMail=async function(first=false){
      if(state.loading)return;state.loading=true;
      try{
        const payload=state.credentials?.password?state.credentials:{};
        let res=await mailRequest('POST',payload);
        if(res.status===401&&!state.credentials?.password){
          const authorized=await ensureServerAccess();
          if(authorized)res=await mailRequest('POST',{});
        }
        const data=await res.json().catch(()=>({}));
        if(res.status===401&&!state.credentials?.password){state.credentials=null;openConnectGate('Este equipamento ainda não está associado à Central.');return;}
        if(!res.ok)throw new Error(data.error||'Erro ao ler o email');
        applyMail(data);
        state.credentials={email:ACCOUNT};
        document.querySelector('#connectGate')?.remove();
        if(!first)showToast('Emails sincronizados.');
      }finally{state.loading=false;}
    };

    sendReply=async function(thread){
      const latest=thread?.latestInbound;if(!latest)return;
      const btn=document.querySelector('#sendReplyBtn');const text=document.querySelector('#replyDraft')?.value?.trim()||'';if(!text)return;
      if(!confirm(`Enviar esta resposta para ${displayName(latest.from)}?`))return;
      if(btn){btn.disabled=true;btn.textContent='A enviar…';}
      try{
        const subject=/^re:/i.test(latest.subject)?latest.subject:`Re: ${latest.subject}`;
        let res=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:extractAddress(latest.from),subject,text,inReplyTo:latest.messageId||'',references:latest.references||[]})});
        if(res.status===401&&await ensureServerAccess()){
          res=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:extractAddress(latest.from),subject,text,inReplyTo:latest.messageId||'',references:latest.references||[]})});
        }
        const data=await res.json().catch(()=>({}));
        if(res.status===401){state.credentials=null;openConnectGate('Este equipamento ainda não está associado à Central.');return;}
        if(!res.ok)throw new Error(data.error||'Falha no envio');
        if(Array.isArray(data.rejected)&&data.rejected.length){throw new Error(`O servidor rejeitou: ${data.rejected.join(', ')}`);}
        if(data.savedToSent){showToast('Email aceite pelo servidor e guardado em Enviados.');}
        else{alert(`O servidor aceitou o email, mas a cópia não ficou em Enviados.${data.sentWarning?`\n\n${data.sentWarning}`:''}`);}
        await new Promise(r=>setTimeout(r,1000));await fetchRealMail(false);
      }catch(e){alert(e?.message||'Não foi possível enviar.');}
      finally{if(btn){btn.disabled=false;btn.textContent='Rever e enviar resposta';}}
    };

    (async()=>{
      try{
        await ensureServerAccess();
        let res=await mailRequest('GET');
        if(res.status===401&&await ensureServerAccess())res=await mailRequest('GET');
        if(res.ok){
          state.credentials={email:ACCOUNT};
          document.querySelector('#connectGate')?.remove();
          applyMail(await res.json());
          await fetchRealMail(true);
          if(typeof startPolling==='function')startPolling();
        }else if(res.status===401){
          document.querySelector('#connectGate')?.remove();
          openConnectGate('Este equipamento ainda não está associado à Central.');
        }
      }catch{}
    })();
  }
  install();
})();