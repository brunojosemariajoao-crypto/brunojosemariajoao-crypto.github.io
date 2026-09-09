/* Central VitalVeg V8.5 — impedir pedidos repetidos de PIN no mesmo dispositivo */
(() => {
  const PIN_KEY='vitalveg-local-pin-v1';
  const TRUSTED_KEY='vitalveg-trusted-device-v2';
  const SESSION_KEY='vitalveg-session-v1';

  function unlockIfTrusted(){
    if(!localStorage.getItem(PIN_KEY)) return false;
    localStorage.setItem(TRUSTED_KEY,'1');
    sessionStorage.setItem(SESSION_KEY,'1');
    const gate=document.querySelector('#authGate');
    gate?.classList.remove('show');
    document.body.classList.remove('auth-pending');
    const confirm=document.querySelector('#authConfirmWrap');
    if(confirm) confirm.hidden=true;
    return true;
  }

  if(unlockIfTrusted()) return;

  // No primeiro acesso, basta um PIN válido. Assim que o PIN fica criado,
  // qualquer tentativa de mostrar o mesmo bloqueio outra vez é anulada.
  const submit=document.querySelector('#authSubmit');
  submit?.addEventListener('click',()=>setTimeout(unlockIfTrusted,120),true);
  document.querySelector('#authPin')?.addEventListener('keydown',e=>{
    if(e.key==='Enter') setTimeout(unlockIfTrusted,120);
  },true);

  const observer=new MutationObserver(()=>{
    if(localStorage.getItem(PIN_KEY)) unlockIfTrusted();
  });
  observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
})();
