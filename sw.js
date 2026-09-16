const CACHE='sabbath-mobile-v6';
const FILES=['./index.html','./pwa.js?v=3','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('sabbath-mobile-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Page unavailable');return response}).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))));return}
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
