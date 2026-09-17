'use strict';
// One bounded queue for both the current scene and background preparation.
class SabbathAssets {
 constructor({assets,info={},art={},onProgress=()=>{},cacheName=null}){
  this.assets=assets;this.info=info;this.art=art;this.onProgress=onProgress;this.cacheName=cacheName;
  this.entries=new Map(Object.keys(assets).map(key=>[key,{key,status:'idle',bytes:0,priority:1,order:0,retry:false}]));
  this.active=0;this.order=0;this.waiters=[];
 }
 has(keys){return keys.every(key=>!!this.art[key])}
 snapshot(keys=Object.keys(this.assets)){
  const entries=keys.map(key=>this.entries.get(key));
  return {loaded:entries.filter(e=>!!this.art[e.key]).length,total:entries.length,
   bytes:entries.reduce((n,e)=>n+e.bytes,0),totalBytes:entries.reduce((n,e)=>n+(this.info[e.key]?.bytes||0),0),
   failed:entries.filter(e=>e.status==='failed').map(e=>e.key),complete:this.has(keys)};
 }
 require(keys,{priority=0,retry=false}={}){
  keys=[...new Set(keys)];for(const key of keys){
   const entry=this.entries.get(key);if(!entry)throw new Error('Unknown image: '+key);
   if(this.art[key])continue;
   if(entry.status==='idle'||entry.status==='failed'&&retry){entry.retry=entry.status==='failed';entry.status='queued';entry.priority=priority;entry.order=this.order++;entry.bytes=0;}
   else if(['queued','loading'].includes(entry.status))entry.priority=Math.min(priority,entry.priority);
  }
  const promise=new Promise(resolve=>this.waiters.push({keys,resolve}));
  // An unrelated stalled prefetch must not occupy both slots while the player
  // explicitly waits for a scene. Deferred files return to the background queue.
  if(priority===0)for(const entry of this.entries.values()){
   if(this.active<2||!keys.some(key=>this.entries.get(key).status==='queued'))break;
   if(entry.status==='loading'&&entry.priority>0&&entry.networkPending)entry.cancel?.(true);
  }
  this.pump();this.changed();return promise;
 }
 changed(){
  this.onProgress();
  const waiting=[];for(const group of this.waiters){
   if(group.keys.every(key=>['ready','failed'].includes(this.entries.get(key).status)))group.resolve(this.snapshot(group.keys));else waiting.push(group);
  }this.waiters=waiting;
 }
 pump(){
  while(this.active<2){
   const entry=[...this.entries.values()].filter(e=>e.status==='queued').sort((a,b)=>a.priority-b.priority||a.order-b.order)[0];
   if(!entry)return;entry.status='loading';this.active++;this.load(entry);
  }
 }
 load(entry){
  const key=entry.key,url=this.assets[key],info=this.info[key],image=new Image(),abort=new AbortController();
  let done=false,objectUrl=null,deadline;entry.networkPending=true;
  const progress=()=>{if(done)return;clearTimeout(deadline);deadline=setTimeout(()=>finish(false),20000);this.changed()};
  const finish=(ok,deferred=false)=>{
   if(done)return;done=true;clearTimeout(deadline);image.onload=image.onerror=null;
   if(ok){this.art[key]=image;entry.status='ready';if(key==='bg')document.documentElement.style.setProperty('--scene-background',`url("${image.src}")`)}
   else{entry.status=deferred?'queued':'failed';entry.bytes=0;if(deferred)entry.order=this.order++;abort.abort();image.removeAttribute('src')}
   if(objectUrl&&(!ok||key!=='bg'))URL.revokeObjectURL(objectUrl);
   this.active--;this.changed();this.pump();
  };
  entry.cancel=deferred=>finish(false,deferred);image.onload=()=>finish(image.naturalWidth>0);image.onerror=()=>finish(false);progress();
  if(!info){try{image.src=url}catch{finish(false)}return}
  (async()=>{
   const response=await fetch(url,{signal:abort.signal,cache:entry.retry?'reload':'force-cache'});
   if(!response.ok)throw new Error('Image unavailable');
   const chunks=[];let size=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const {done:ended,value}=await reader.read();if(ended)break;size+=value.byteLength;if(size>info.bytes)throw new Error('Image size mismatch');chunks.push(value);entry.bytes=size;progress()}}finally{reader.releaseLock()}}
   else{const data=await response.arrayBuffer();size=data.byteLength;chunks.push(data);entry.bytes=size;progress()}
   entry.networkPending=false;if(size!==info.bytes)throw new Error('Image size mismatch');
   const blob=new Blob(chunks,{type:info.mime});chunks.length=0;
   const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
   const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==info.sha256)throw new Error('Image checksum mismatch');if(done)return;
   // Only verified bytes enter the release cache; storage failures are optional.
   if(this.cacheName&&'caches' in globalThis){try{const cache=await caches.open(this.cacheName);if(entry.retry||!await cache.match(url))await cache.put(url,new Response(blob,{headers:{'Content-Type':info.mime,'Content-Length':String(size)}}))}catch{}}
   if(done)return;objectUrl=URL.createObjectURL(blob);image.src=objectUrl;
  })().catch(()=>finish(false));
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={SabbathAssets};
