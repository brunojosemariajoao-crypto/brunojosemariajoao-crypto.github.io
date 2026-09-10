(()=>{
  const labels={shadow:'Sombra · zero envios',assist:'Assistente · tu aprovas',autonomous:'Autónomo · regras ativas'};
  async function refreshMode(){
    const target=document.querySelector('#autonomyStatusText');
    if(!target)return;
    try{
      const res=await fetch('/api/ai/mode',{credentials:'include'});
      if(!res.ok)return;
      const data=await res.json();
      target.textContent=labels[data.mode]||'A verificar';
      const strip=document.querySelector('.status-strip');
      if(!strip)return;
      let link=document.querySelector('#shadowValidationLink');
      if(data.mode==='shadow'){
        if(!link){
          link=document.createElement('a');link.id='shadowValidationLink';link.href='./shadow.html';
          link.textContent='Validar decisões da IA';
          link.style.cssText='white-space:nowrap;color:#0d6a45;font-weight:800;text-decoration:none;font-size:11px';
          strip.appendChild(link);
        }
      }else if(link)link.remove();
    }catch{}
  }
  window.addEventListener('load',()=>{refreshMode();setInterval(refreshMode,30000);});
})();
