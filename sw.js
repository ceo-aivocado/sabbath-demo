const CACHE='sabbath-mobile-v15';
// All editions contain the same atomic code/art bundle and select controls by URL.
const FILES=['./index.html','./manifest.webmanifest','./desktop.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('sabbath-mobile-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 if(event.request.mode==='navigate'){
  const route=new URL(event.request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
  if(!['','index.html','mobile.html','desktop.html','play-v3.html'].includes(route))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('./index.html'))||fetch(event.request)));return;
 }
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
