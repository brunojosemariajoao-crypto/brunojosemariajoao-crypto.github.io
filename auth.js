(() => {
  const PIN_KEY = 'vitalveg-local-pin-v1';
  const SESSION_KEY = 'vitalveg-session-v1';
  let deferredPrompt = null;

  const qs = (s, r=document) => r.querySelector(s);
  const body = document.body;
  const gate = qs('#authGate');
  const title = qs('#authTitle');
  const subtitle = qs('#authSubtitle');
  const pin = qs('#authPin');
  const confirmWrap = qs('#authConfirmWrap');
  const confirmPin = qs('#authConfirmPin');
  const submit = qs('#authSubmit');
  const reset = qs('#authReset');
  const error = qs('#authError');
  const installBtn = qs('#installAppBtn');

  async function hashPin(value){
    const bytes = new TextEncoder().encode(`vitalveg-local-v1:${value}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function unlock(){
    sessionStorage.setItem(SESSION_KEY,'1');
    gate?.classList.remove('show');
    body.classList.remove('auth-pending');
  }

  function showGate(){
    gate?.classList.add('show');
    body.classList.add('auth-pending');
    setTimeout(() => pin?.focus(), 100);
  }

  function setMode(){
    const exists = !!localStorage.getItem(PIN_KEY);
    if(confirmWrap) confirmWrap.hidden = true;
    if(exists){
      title.textContent = 'Entrar na Central VitalVeg';
      subtitle.textContent = 'Introduz o teu PIN uma única vez para entrar.';
      submit.textContent = 'Entrar';
      reset.hidden = false;
    }else{
      title.textContent = 'Criar acesso';
      subtitle.textContent = 'Escolhe um PIN de 4 dígitos. Não é necessário confirmá-lo uma segunda vez.';
      submit.textContent = 'Criar PIN e entrar';
      reset.hidden = true;
    }
  }

  async function handleSubmit(){
    error.textContent = '';
    const value = (pin.value || '').trim();
    if(!/^\d{4}$/.test(value)){
      error.textContent = 'O PIN deve ter exatamente 4 dígitos.';
      return;
    }

    const stored = localStorage.getItem(PIN_KEY);
    if(!stored){
      localStorage.setItem(PIN_KEY, await hashPin(value));
      unlock();
      return;
    }

    const candidate = await hashPin(value);
    if(candidate !== stored){
      error.textContent = 'PIN incorreto.';
      pin.select();
      return;
    }
    unlock();
  }

  submit?.addEventListener('click', handleSubmit);
  pin?.addEventListener('keydown', e => { if(e.key === 'Enter') handleSubmit(); });

  reset?.addEventListener('click', () => {
    if(confirm('Repor o acesso local deste dispositivo? Isto não apaga encomendas; remove apenas o PIN local.')){
      localStorage.removeItem(PIN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      pin.value = '';
      if(confirmPin) confirmPin.value = '';
      setMode();
      showGate();
    }
  });

  function installHelp(){
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const chrome = /chrome/i.test(navigator.userAgent) && /android/i.test(navigator.userAgent);
    const wrapper = document.createElement('div');
    wrapper.className = 'install-help';
    wrapper.innerHTML = `<div class="install-help-card"><h2>Instalar a Central VitalVeg</h2>${ios ? '<p>No iPhone/iPad:</p><ol><li>Toca em Partilhar.</li><li>Escolhe “Adicionar ao ecrã principal”.</li><li>Confirma em Adicionar.</li></ol>' : chrome ? '<p>No Android/Chrome:</p><ol><li>Toca no menu ⋮ do Chrome.</li><li>Escolhe “Instalar aplicação” ou “Adicionar ao ecrã principal”.</li><li>Confirma a instalação.</li></ol>' : '<p>Abre o menu do navegador e procura “Instalar aplicação” ou “Adicionar ao ecrã principal”.</p>'}<button>Fechar</button></div>`;
    wrapper.querySelector('button').addEventListener('click', () => wrapper.remove());
    wrapper.addEventListener('click', e => { if(e.target === wrapper) wrapper.remove(); });
    document.body.appendChild(wrapper);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn?.setAttribute('hidden','');
  });

  installBtn?.addEventListener('click', async () => {
    if(window.matchMedia('(display-mode: standalone)').matches){
      alert('A Central VitalVeg já está instalada neste dispositivo.');
      return;
    }
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }else{
      installHelp();
    }
  });

  function addCss(href, marker){
    if(document.querySelector(`link[${marker}]`)) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.setAttribute(marker,'1');
    document.head.appendChild(link);
  }

  function loadScript(src, marker, onload){
    const existing=document.querySelector(`script[${marker}]`);
    if(existing){
      if(onload){
        if(existing.dataset.loaded==='1') onload();
        else existing.addEventListener('load', onload, {once:true});
      }
      return existing;
    }
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.setAttribute(marker,'1');
    script.addEventListener('load',()=>{script.dataset.loaded='1';});
    if(onload) script.addEventListener('load', onload, {once:true});
    document.body.appendChild(script);
    return script;
  }

  function loadOpsLayer(){
    addCss('v8-ops.css?v=8.5','data-v8-ops-css');
    const loadSession=()=>loadScript('v8-session.js?v=8.5','data-v8-session-js');
    const loadOps=()=>loadScript('v8-ops.js?v=8.5','data-v8-ops-js',loadSession);
    const loadIntelligence=()=>loadScript('v8-order-intelligence.js?v=8.5','data-v8-order-intelligence-js',loadOps);
    const existing=document.querySelector('script[data-v8-delivery-js]');
    if(existing){ loadIntelligence(); return; }
    loadScript('v8-delivery-fix.js?v=8.5','data-v8-delivery-js',loadIntelligence);
  }

  function loadHotfix(){
    addCss('v8-hotfix.css?v=8.5','data-v8-hotfix-css');
    const existing=document.querySelector('script[data-v8-hotfix-js]');
    if(existing){ loadOpsLayer(); return; }
    loadScript('v8-hotfix.js?v=8.5','data-v8-hotfix-js',loadOpsLayer);
  }

  function loadV8Layer(){
    addCss('v8.css?v=8.5','data-v8-css');
    const existing=document.querySelector('script[data-v8-js]');
    if(existing){
      if(window.VITALVEG_VERSION) loadHotfix();
      else existing.addEventListener('load', loadHotfix, {once:true});
      return;
    }
    loadScript('v8.js?v=8.5','data-v8-js',loadHotfix);
  }

  window.addEventListener('load', loadV8Layer, { once:true });

  setMode();
  if(sessionStorage.getItem(SESSION_KEY) === '1') unlock();
  else showGate();
})();