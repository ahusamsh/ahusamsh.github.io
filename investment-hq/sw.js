const CACHE='investment-hq-v26';
const ASSETS=['./','./index.html','./styles-v23.css?v=26','./mobile-fix-v24.css?v=26','./app-v23.js?v=26','./relay-v17.js?v=26','./manifest.webmanifest?v=26','./icon.svg','./data/snapshot.enc.json?v=10'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
