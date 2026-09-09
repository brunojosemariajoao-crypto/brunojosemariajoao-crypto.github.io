self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={title:'Central VitalVeg',body:event.data?.text()||''};}
  const title=data.title||'Central VitalVeg';
  const options={
    body:data.body||'O funcionário digital precisa da tua atenção.',
    tag:data.tag||'vitalveg',
    renotify:true,
    data:{url:data.url||'/v9/'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/v9/',self.location.origin).href;
  event.waitUntil((async()=>{
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){
      if(new URL(client.url).origin===self.location.origin){await client.navigate(target);return client.focus();}
    }
    return self.clients.openWindow(target);
  })());
});
