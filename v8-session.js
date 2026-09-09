/* Central VitalVeg V8.4 — uma só autenticação e sessão persistente do email */
(() => {
  const ACCOUNT='geral@vitalveg.pt';
  let installed=false;

  function applyMail(data){
    if(!data||!Array.isArray(data.messages))return;
    state.messages=data.messages;
    state.threads=buildThreads(state.messages);
    state.lastFetchedAt=data.fetchedAt||state.lastFetchedAt;
    try{renderAllReal();}catch{}
  }

  function install(){
    if(installed)return;
    if(typeof state==='undefined'||typeof fetchRealMail!=='function'||typeof openConnectGate!=='function'||typeof sendReply!=='function'){setTimeout(install,80);return;}
    installed=true;

    const baseOpenConnectGate=openConnectGate;
    openConnectGate=function(message=''){
      baseOpenConnectGate(message);
      const card=document.querySelector('#connectGate .connect-card');
      const p=card?.querySelector('p');
      if(p)p.innerHTML=`Introduz a palavra-passe do <strong>${ACCOUNT}</strong> apenas para autorizar este dispositivo. Depois deixa de ser pedida em cada abertura.`;
      const note=card?.querySelector('.connect-note');
      if(note)note.textContent='A ligação fica guardada de forma segura no servidor. As respostas continuam sempre sujeitas a confirmação humana.';
      const btn=document.querySelector('#connectNow');if(btn)btn.textContent='Autorizar este dispositivo';
    };

    fetchRealMail=async function(first=false){
      if(state.loading)return;state.loading=true;
      try{
        const payload=state.credentials?.password?state.credentials:{};
        const res=await fetch('/api/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data=await res.json().catch(()=>({}));
        if(res.status===401&&!state.credentials?.password){state.credentials=null;openConnectGate('Autoriza este dispositivo uma única vez.');return;}
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
        const res=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:extractAddress(latest.from),subject,text,inReplyTo:latest.messageId||'',references:latest.references||[]})});
        const data=await res.json().catch(()=>({}));
        if(res.status===401){state.credentials=null;openConnectGate('Autoriza novamente este dispositivo para enviar.');return;}
        if(!res.ok)throw new Error(data.error||'Falha no envio');
        showToast('Email enviado.');await new Promise(r=>setTimeout(r,900));await fetchRealMail(false);
      }catch(e){alert(e?.message||'Não foi possível enviar.');}
      finally{if(btn){btn.disabled=false;btn.textContent='Rever e enviar resposta';}}
    };

    (async()=>{
      try{
        const res=await fetch('/api/mail',{method:'GET'});
        if(res.ok){
          state.credentials={email:ACCOUNT};
          document.querySelector('#connectGate')?.remove();
          applyMail(await res.json());
          await fetchRealMail(true);
          if(typeof startPolling==='function')startPolling();
        }else if(res.status===401){
          document.querySelector('#connectGate')?.remove();
          openConnectGate('');
        }
      }catch{}
    })();
  }
  install();
})();
