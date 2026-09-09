(()=>{
  let registration=null;
  function b64ToUint8(value){
    const padding='='.repeat((4-value.length%4)%4);const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  function toastLocal(message){
    if(typeof window.toast==='function')return window.toast(message);
    const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500);
  }
  async function ensureRegistration(){
    if(!('serviceWorker' in navigator))throw new Error('Este navegador não suporta notificações em segundo plano.');
    registration=registration||await navigator.serviceWorker.register('/v9/sw.js',{scope:'/v9/'});
    return navigator.serviceWorker.ready;
  }
  async function enable(){
    if(!('Notification' in window))throw new Error('Este dispositivo não suporta notificações web.');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted')throw new Error('As notificações não foram autorizadas neste dispositivo.');
    const reg=await ensureRegistration();
    const keyRes=await fetch('/api/push',{credentials:'include'});const keyData=await keyRes.json().catch(()=>({}));
    if(!keyRes.ok)throw new Error(keyData.error||'Não foi possível preparar as notificações.');
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8(keyData.publicKey)});
    const save=await fetch('/api/push',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:sub.toJSON()})});
    const data=await save.json().catch(()=>({}));if(!save.ok)throw new Error(data.error||'Não foi possível guardar a autorização de notificações.');
    localStorage.setItem('vitalveg-v9-push','1');syncButton();toastLocal('Notificações do funcionário digital ativadas.');return true;
  }
  async function disable(){
    const reg=await ensureRegistration();const sub=await reg.pushManager.getSubscription();
    if(sub){const endpoint=sub.endpoint;await fetch('/api/push',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'unsubscribe',endpoint})}).catch(()=>{});await sub.unsubscribe();}
    localStorage.removeItem('vitalveg-v9-push');syncButton();toastLocal('Notificações desativadas neste dispositivo.');
  }
  async function toggle(){
    try{const active=await current();active?await disable():await enable();}catch(e){toastLocal(e.message||'Não foi possível alterar as notificações.');}
  }
  async function current(){
    if(!('serviceWorker' in navigator))return false;
    try{const reg=await ensureRegistration();return !!(await reg.pushManager.getSubscription());}catch{return false;}
  }
  async function syncButton(){
    const btn=document.querySelector('#pushBtn');if(!btn)return;
    const active=await current();btn.textContent=active?'Notificações ✓':'Ativar notificações';btn.title=active?'Desativar notificações neste dispositivo':'Receber avisos quando a IA precisar de ti';btn.dataset.active=active?'1':'0';
  }
  function installButton(){
    const host=document.querySelector('.topbar-actions');if(!host||document.querySelector('#pushBtn'))return;
    const btn=document.createElement('button');btn.id='pushBtn';btn.className='btn ghost';btn.type='button';btn.textContent='Ativar notificações';btn.onclick=toggle;
    const refresh=document.querySelector('#refreshBtn');host.insertBefore(btn,refresh||host.firstChild);syncButton();
  }
  async function deepLink(){
    const id=new URLSearchParams(location.search).get('open');if(!id)return;
    for(let i=0;i<40;i++){
      if(typeof window.openQueue==='function' && !document.querySelector('#app')?.hidden){window.openQueue(id);history.replaceState({},'',location.pathname);return;}
      await new Promise(r=>setTimeout(r,250));
    }
  }
  window.VitalVegPush={enable,disable,current,toggle};
  window.addEventListener('load',()=>{ensureRegistration().catch(()=>{});installButton();deepLink();});
})();
