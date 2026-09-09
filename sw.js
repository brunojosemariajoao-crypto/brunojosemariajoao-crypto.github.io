const CACHE='vitalveg-pwa-v8-5';
const ASSETS=['/','/index.html','/styles.css','/auth.css','/auth.js','/app.js','/v8.css','/v8.js','/v8-hotfix.css','/v8-hotfix.js','/v8-delivery-fix.js','/v8-order-intelligence.js','/v8-ops.css','/v8-ops.js','/v8-session.js','/v8-generic-order-lines.js','/v8-auth-once.js','/manifest.json','/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request).then(response=>{const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/index.html'))));
});
