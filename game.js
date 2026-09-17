'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),game=new SabbathGame();
let W=960;
const H=540,G=440,keys=new Set(),art={},particles=[],ghosts=[];
const TRAIL_SPACING=24,TRAIL_LIFE=.22;let trailDistance=0;
let crouchToggle=false,pausedMode='playing',transition=0,storyUntil=0,savedCheckpoint=null;
const CHECKPOINT_KEY='sabbath-journey-v1';
try{const data=JSON.parse(localStorage.getItem(CHECKPOINT_KEY));if(data&&new SabbathGame().restoreCheckpoint(data))savedCheckpoint=data;}catch{}
function saveCheckpoint(){savedCheckpoint=game.checkpoint();try{localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(savedCheckpoint))}catch{}}
let last=0,clock=0,captionUntil=0,toastUntil=0,soundOn=true,audio=null,soundscape=null,audioSleep=null,footstep=0,footstepCrouched=false,ready=false;
try{soundOn=localStorage.getItem('sabbath-sound')!=='off'}catch{}
// All imagery is local; this game makes no network requests except loading its own files.
const assets={hit:'assets/yaromir-hit.png',gunnerMelee:'assets/gunner-melee.png',dodge:'assets/yaromir-dodge.png',demonDodge:'assets/yaromir-demon-dodge.png',enemyWalk:'assets/enemies-walk.png',enemyCombat:'assets/enemies-combat.png',crouchWalk:'assets/yaromir-crouch-walk.png',air:'assets/yaromir-air.png',guardWalk:'assets/guards-walk.png',guardReady:'assets/guards-ready.png',villages:'assets/villages-panorama.png',skit:'assets/skit-panorama.png',fortress:'assets/fortress-panorama.png',guards:'assets/guards-atlas-v2.png',house:'assets/house-interior.png',sich:'assets/sich-panorama.png',gunner:'assets/gunner-atlas.png',throw:'assets/yaromir-throw.png',crouch:'assets/yaromir-crouch.png',demonWalk:'assets/yaromir-demon-walk.png',walk:'assets/yaromir-walk.png',hero:'assets/yaromir-atlas.png',demon:'assets/yaromir-demon-atlas.png',special:'assets/enemies-special.png',powder:'assets/powder-barrel.png',bg:'assets/background-panorama.png',props:'assets/props-atlas.png'};
// The web builder fills this with immutable URLs, byte counts and SHA-256 hashes.
// Standalone/file builds keep native Image loading and need no Fetch/CacheStorage.
const assetInfo={};
const received={};
const loading={phase:'idle',loaded:0,total:Object.keys(assets).length,failed:[],bytes:0,totalBytes:Object.values(assetInfo).reduce((n,item)=>n+item.bytes,0)};
let loadGeneration=0;
function loadingProgress(){
 loading.loaded=Object.keys(art).length;loading.bytes=Object.values(received).reduce((n,bytes)=>n+bytes,0);
 const percent=loading.totalBytes?Math.min(99,Math.floor(100*loading.bytes/loading.totalBytes)):Math.round(100*loading.loaded/loading.total);
 $('start').textContent='ЗАГРУЗКА · '+percent+'%';$('load-fill').style.width=percent+'%';$('load-meter').setAttribute('aria-valuenow',String(percent));
}
async function loadAssets(){
 if(loading.phase==='loading'||ready)return;const generation=++loadGeneration,restoreFocus=document.activeElement===$('start'),retry=new Set(loading.failed);let timedOut=false;
 function restoreButtonFocus(){if(restoreFocus&&[document.body,$('start')].includes(document.activeElement))$('start').focus();}
 loading.phase='loading';loading.failed=[];ready=false;$('start').disabled=true;$('fresh-start').hidden=true;$('load-status').hidden=false;$('load-status').classList.remove('failed');$('load-copy').textContent='Готовим сцену…';loadingProgress();
 const priority=['bg','hero','demon'],queue=Object.entries(assets).filter(([key])=>!art[key]).sort(([a],[b])=>(priority.includes(a)?priority.indexOf(a):3)-(priority.includes(b)?priority.indexOf(b):3)),active=new Set();let next=0;
 let deadline;
 function progress(){if(timedOut||generation!==loadGeneration)return;clearTimeout(deadline);deadline=setTimeout(()=>{timedOut=true;for(const cancel of [...active])cancel();},20000);loadingProgress();}
 for(const [key] of queue)received[key]=0;
 progress();
 function one(key,url){return new Promise(resolve=>{
  const image=new Image(),abort=new AbortController(),info=assetInfo[key];let settled=false,objectUrl=null;
  function finish(ok){
   if(settled)return;settled=true;active.delete(cancel);image.onload=image.onerror=null;
   if(ok&&!timedOut&&generation===loadGeneration){art[key]=image;if(key==='bg')document.documentElement.style.setProperty('--scene-background',`url("${image.src}")`);progress();}
   else{abort.abort();image.removeAttribute('src');received[key]=0;}
   // The background URL also backs the portrait splash; other decoded images
   // retain their bitmap without retaining an extra compressed Blob allocation.
   if(objectUrl&&(!ok||key!=='bg'))URL.revokeObjectURL(objectUrl);resolve();
  }
  const cancel=()=>finish(false);active.add(cancel);image.onload=()=>finish(image.naturalWidth>0);image.onerror=()=>finish(false);
  if(!info){try{image.src=url}catch{finish(false)}return;}
  (async()=>{
   const response=await fetch(url,{signal:abort.signal,cache:retry.has(key)?'reload':'force-cache'});
   if(!response.ok)throw new Error('Image unavailable');
   const chunks=[];let size=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>info.bytes)throw new Error('Image size mismatch');chunks.push(value);received[key]=size;progress();}}finally{reader.releaseLock();}}
   else{const data=await response.arrayBuffer();size=data.byteLength;chunks.push(data);received[key]=size;progress();}
   if(size!==info.bytes)throw new Error('Image size mismatch');
   const blob=new Blob(chunks,{type:info.mime});chunks.length=0;
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==info.sha256)throw new Error('Image checksum mismatch');
   if(settled||timedOut||generation!==loadGeneration)return;
   // On first visit the subsequent worker install can reuse these verified bytes.
   // Cache failure must never block an otherwise playable online session.
   if(window.SABBATH_BUILD&&'caches' in window){try{const cache=await caches.open('sabbath-mobile@'+new URL('./',location.href).pathname+':'+window.SABBATH_BUILD.release);if(retry.has(key)||!await cache.match(url))await cache.put(url,new Response(blob,{headers:{'Content-Type':info.mime,'Content-Length':String(size)}}));}catch{}}
   if(settled||timedOut||generation!==loadGeneration)return;
   objectUrl=URL.createObjectURL(blob);image.src=objectUrl;
  })().catch(()=>finish(false));
 });}
 async function worker(){while(!timedOut&&next<queue.length&&generation===loadGeneration){const [key,url]=queue[next++];await one(key,url);}}
 await Promise.all([worker(),worker()]);clearTimeout(deadline);if(generation!==loadGeneration)return;
 loading.failed=Object.keys(assets).filter(key=>!art[key]);loading.loaded=Object.keys(art).length;
 if(loading.failed.length){loading.phase='failed';$('start').disabled=false;$('start').textContent='ПОВТОРИТЬ ЗАГРУЗКУ';$('load-status').classList.add('failed');$('load-copy').textContent=timedOut?'Загрузка остановилась. Нажми «Повторить загрузку».':'Не удалось подготовить сцену. Нажми «Повторить загрузку».';restoreButtonFocus();window.dispatchEvent(new Event('sabbath:loadsettled'));return;}
 loading.phase='ready';ready=true;$('load-status').hidden=true;$('start').disabled=false;$('start').textContent=savedCheckpoint?'ПРОДОЛЖИТЬ ПУТЬ':'ВОЙТИ В СЛОБОДУ';$('fresh-start').hidden=!savedCheckpoint;restoreButtonFocus();
 window.dispatchEvent(new Event('sabbath:loadsettled'));
}
const rand=(n)=>{let a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a)},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
function path(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill()}
function tone(freq,dur,vol,type='sine',slide=1,pan=0){if(soundOn&&soundscape)soundscape.tone(freq,dur,vol,type,slide,pan)}
function noise(dur,vol,cutoff,pan=0){if(soundOn&&soundscape)soundscape.noise(dur,vol,cutoff,{pan})}
function worldPan(x){return clamp((x-game.player.x)/Math.max(320,W*.55),-.75,.75)}
function resetFootsteps(){const p=game.player;footstep=Math.floor(p.stride/(p.crouching?28:56));footstepCrouched=p.crouching;}
function soundLabel(){$('sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ');$('sound').setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук');$('sound').setAttribute('aria-pressed',String(soundOn))}
function syncAudio(allowResume=true){clearTimeout(audioSleep);if(!audio||!soundscape)return;soundscape.setEnabled(soundOn&&!document.hidden);soundscape.setScene(game.scene);soundscape.setMode(game.mode);if(!soundOn||document.hidden){audioSleep=setTimeout(()=>{if(!soundOn||document.hidden)audio.suspend().catch(()=>{})},60);}else if(allowResume)audio.resume().catch(()=>{});}
function initAudio(){if(!soundOn||document.hidden)return;try{if(!audio){const Context=window.AudioContext||window.webkitAudioContext;audio=new Context();soundscape=new SabbathSound(audio);}syncAudio();}catch{audio?.close().catch(()=>{});audio=null;soundscape=null;soundOn=false;soundLabel();}}
function soundToggle(){soundOn=!soundOn;try{localStorage.setItem('sabbath-sound',soundOn?'on':'off')}catch{}if(soundOn)initAudio();syncAudio();soundLabel();}
soundLabel();
$('sound').onclick=soundToggle;
function continueJourney(){if(game.advanceChapter()){clearTouch();keys.clear();$('menu').hidden=true;canvas.focus();}}
$('continue-level').onclick=continueJourney;
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('stage').requestFullscreen?.()};
function start(fresh=false){if(!ready||phonePortrait())return;clearTouch();if(fresh){savedCheckpoint=null;try{localStorage.removeItem(CHECKPOINT_KEY)}catch{}}
 if(!savedCheckpoint||!game.restoreCheckpoint(savedCheckpoint)){game.reset();game.start();}
 particles.length=0;clearDodgeTrail();keys.clear();captionUntil=toastUntil=0;$('caption').textContent='';$('toast').textContent='';$('intro').hidden=true;$('menu').hidden=true;$('story-copy').hidden=true;$('hud').hidden=false;storyUntil=0;transition=.45;canvas.focus();resetFootsteps();if(soundOn)initAudio();syncAudio();soundLabel();}
$('start').onclick=()=>loading.phase==='failed'?loadAssets():start();$('restart').onclick=()=>start();$('fresh-start').onclick=()=>start(true);$('new-run').onclick=()=>start(true);
$('interact-hint').onclick=()=>game.interact();
function pause(){clearTouch();if(['playing','house'].includes(game.mode)){pausedMode=game.mode;game.mode='paused';showMenu('ПАУЗА','Тишина между ударами','Путь дождётся тебя.',true)}else if(game.mode==='paused'){game.mode=pausedMode;$('menu').hidden=true;canvas.focus()}keys.clear();syncAudio()}
$('pause').onclick=pause;$('resume').onclick=pause;
function showMenu(label,title,copy,resume=false){$('continue-level').hidden=true;$('restart').hidden=false;$('endlabel').textContent=label;$('endtitle').textContent=title;$('endcopy').textContent=copy;$('resume').hidden=!resume;$('restart').textContent=savedCheckpoint?'С КОНТРОЛЬНОЙ ТОЧКИ':resume?'НАЧАТЬ ЗАНОВО':'ПРОЙТИ ЕЩЁ РАЗ';$('new-run').hidden=!savedCheckpoint;$('menu').hidden=false}
// Physical keys are independent of the selected keyboard language.
const keyboardActions={KeyA:'v',KeyS:'j',KeyD:'e',KeyH:'h',KeyQ:'q',KeyF:'f',Enter:'Enter',Space:' ',ArrowLeft:'a',ArrowRight:'d',ArrowUp:' ',ArrowDown:'x',ShiftLeft:'Shift',ShiftRight:'Shift',Escape:'Escape'};
const keyboardTaps=new Map();
const TEST_HEAL_ENABLED=true;
function healForTest(){
 const p=game.player;
 if(!TEST_HEAL_ENABLED||!['playing','house'].includes(game.mode)||p.hp<=0||p.hp>=p.maxHp)return false;
 p.hp=p.maxHp;game.emit('toast','ЗДОРОВЬЕ ВОССТАНОВЛЕНО · ТЕСТ');return true;
}
$('test-heal').hidden=!TEST_HEAL_ENABLED;
$('test-heal').onclick=()=>{healForTest();canvas.focus()};
function keyName(e){return keyboardActions[e.code]||null}
function press(key,repeat,hold=true){if(key==='h'){if(!repeat)healForTest();return;}if(game.mode==='won'&&game.chapter>=2&&game.chapter<5&&!repeat&&['Enter',' ','j'].includes(key)){continueJourney();return;}if(key==='Escape'&&!repeat){pause();return}if(game.mode==='house'){if(hold)keys.add(key);if(!repeat&&['j','q','f','Enter'].includes(key))game.interact();return;}if(game.mode!=='playing')return;if(hold)keys.add(key);if(!repeat){if(key==='x')game.player.crouching=game.player.z===0&&game.player.vz<=0&&game.player.evade===0;if(key==='j')game.attack();if(key===' '){crouchToggle=false;game.jump();}if(key==='q'){crouchToggle=false;game.dodge('back');}if(key==='Shift'){const back=inputHeld('x')||crouchToggle;crouchToggle=false;game.dodge(back?'back':'forward');}if(key==='v')game.knife();if(key==='e')game.power()}}
window.addEventListener('keydown',e=>{
 const k=keyName(e);if(!k)return;
 if(['Enter',' '].includes(k)&&e.target.closest?.('button:not([data-key]),a'))return;
 e.preventDefault();
 if(!e.repeat&&['a','d'].includes(k))keyboardTaps.set(e.code,beginBackTap(k==='d'?1:-1));
 press(k,e.repeat);
});
window.addEventListener('keyup',e=>{keys.delete(keyName(e));finishBackTap(keyboardTaps.get(e.code));keyboardTaps.delete(e.code)});
window.addEventListener('blur',()=>{keys.clear();if(['playing','house'].includes(game.mode))pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','house'].includes(game.mode))pause();syncAudio(false)});
// iOS may synthesize zoom gestures independently of pointer events.
for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
$('stage').addEventListener('dblclick',e=>e.preventDefault());
$('touch').addEventListener('touchend',e=>e.preventDefault(),{passive:false});
// Keep keyboard, action-button fingers, and the eight-way movement pad separate.
const touchPointers=new Map(),padPointers=new Map(),movePad=$('move-pad');
let lastBackTap=null,mouseAttack=false;
function beginBackTap(direction){
 const now=performance.now(),p=game.player,previous=lastBackTap;lastBackTap=null;
 if(game.mode!=='playing'||p.z>0||p.vz>0||p.evade>0)return null;
 if(previous&&previous.direction===direction&&now-previous.releasedAt<=280){
  const face=p.face;p.face=previous.face;
  if(game.dodge('back')){crouchToggle=false;return null;}
  p.face=face;return null;
 }
 return direction===-p.face?{direction,face:p.face,startedAt:now}:null;
}
function finishBackTap(tap){if(tap&&performance.now()-tap.startedAt<=200)lastBackTap={...tap,releasedAt:performance.now()}}
function inputHeld(key){return (key==='j'&&mouseAttack)||keys.has(key)||[...touchPointers.values()].includes(key)||[...padPointers.values()].some(p=>p.keys.includes(key))}
function paintHeld(){for(const b of document.querySelectorAll('[data-key]'))b.classList.toggle('held',inputHeld(b.dataset.key));movePad.classList.toggle('active',padPointers.size>0)}
function releasePointer(id,completed=false){const state=padPointers.get(id);if(completed&&!state?.sliding)finishBackTap(state?.backTap);touchPointers.delete(id);padPointers.delete(id);paintHeld()}
function clearTouch(){mouseAttack=false;keyboardTaps.clear();lastBackTap=null;crouchToggle=false;touchPointers.clear();padPointers.clear();paintHeld()}
const padSectors=[['d'],['d','x'],['x'],['a','x'],['a'],['a',' '],[' '],['d',' ']];
function padSectorAt(x,y,previous=null){
 // A visible circle always owns its full circular contact area. The gaps
 // belong to the eight-way pad, so corner presses on UP cannot steer sideways.
 for(const [key,sector] of [['a',4],[' ',6],['d',0],['x',2]]){
  const b=movePad.querySelector('[data-key="'+key+'"]'),r=b.getBoundingClientRect();
  if(r.width&&Math.hypot(x-r.x-r.width/2,y-r.y-r.height/2)<=r.width/2)return sector;
 }
 const r=movePad.getBoundingClientRect(),dx=x-r.x-r.width/2,dy=y-r.y-r.height/2;
 if(Math.hypot(dx,dy)<14||Math.abs(dx)>r.width/2+20||Math.abs(dy)>r.height/2+20)return null;
 const angle=Math.atan2(dy,dx),step=Math.PI/4;
 if(previous!==null){const difference=Math.atan2(Math.sin(angle-previous*step),Math.cos(angle-previous*step));if(Math.abs(difference)<Math.PI/8+.10)return previous;}
 return (Math.round(angle/step)+8)%8;
}
function updatePad(e,initial=false){
 const state=padPointers.get(e.pointerId);if(!state)return;
 const wasUp=inputHeld(' '),sector=padSectorAt(e.clientX,e.clientY,initial?null:state.sector),next=sector===null?[]:padSectors[sector].filter(k=>game.mode!=='house'||k==='a'||k==='d');
 if(!initial&&next.join()!==state.keys.join()){state.sliding=true;state.backTap=null;lastBackTap=null;}
 state.sector=sector;state.keys=next;
 if(initial){state.backTap=next.length===1&&['a','d'].includes(next[0])?beginBackTap(next[0]==='d'?1:-1):null;if(!state.backTap&&next.length!==1)lastBackTap=null;}
 if(initial&&next.length===1&&next[0]==='x')crouchToggle=!crouchToggle;
 else if(next.includes('x')&&(next.length>1||state.sliding))crouchToggle=false;
 if(!wasUp&&inputHeld(' '))press(' ',false,false);
 game.player.crouching=(inputHeld('x')||crouchToggle)&&game.player.z===0&&game.player.vz<=0&&game.player.evade===0;
 paintHeld();
}
movePad.addEventListener('contextmenu',e=>e.preventDefault());
movePad.addEventListener('pointerdown',e=>{e.preventDefault();if(!['playing','house'].includes(game.mode)||e.pointerType==='mouse'&&e.button!==0)return;movePad.setPointerCapture(e.pointerId);padPointers.set(e.pointerId,{keys:[],sector:null,sliding:false});updatePad(e,true)});
movePad.addEventListener('pointermove',e=>{if(!padPointers.has(e.pointerId))return;e.preventDefault();updatePad(e)});
movePad.addEventListener('lostpointercapture',e=>{if(padPointers.has(e.pointerId)){crouchToggle=false;lastBackTap=null;}releasePointer(e.pointerId)});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){mouseAttack=true;canvas.setPointerCapture(e.pointerId);press('j',false,false);canvas.focus()}});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===0)mouseAttack=false;releasePointer(e.pointerId,true)});
canvas.addEventListener('lostpointercapture',e=>{if(e.pointerType==='mouse')mouseAttack=false});
window.addEventListener('pointercancel',e=>{if(e.pointerType==='mouse')mouseAttack=false;if(padPointers.has(e.pointerId)){crouchToggle=false;lastBackTap=null;}releasePointer(e.pointerId)});
window.addEventListener('blur',clearTouch);
for(const b of document.querySelectorAll('#touch > button')){b.addEventListener('contextmenu',e=>e.preventDefault());b.addEventListener('pointerdown',e=>{e.preventDefault();if(!['playing','house'].includes(game.mode))return;b.setPointerCapture(e.pointerId);touchPointers.set(e.pointerId,b.dataset.key);paintHeld();press(b.dataset.key,false,false)});b.addEventListener('lostpointercapture',e=>releasePointer(e.pointerId))}
const propBoxes=[[0,0,510,550],[520,210,555,340],[1045,55,490,490],[0,742,535,270],[540,565,535,437],[1105,600,430,412]],propBounds=[];
function prop(index,x,y,width,alpha=1,flip=false){
 if(!art.props)return;const box=propBoxes[index];
 if(!propBounds[index]){const c=document.createElement('canvas');c.width=box[2];c.height=box[3];const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(art.props,...box,0,0,c.width,c.height);const pixels=q.getImageData(0,0,c.width,c.height).data;let bottom=0;for(let row=0;row<c.height;row++){let solid=0;for(let col=0;col<c.width;col++)if(pixels[(row*c.width+col)*4+3]>128)solid++;if(solid>=4)bottom=row+1;}propBounds[index]={bottom};}
 const scale=width/box[2],h=box[3]*scale;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);ctx.drawImage(art.props,...box,-width/2,-propBounds[index].bottom*scale,width,h);ctx.restore();
}
// Each atlas frame is aligned on its feet. Frames have individual anchors to avoid sliding in attacks.
const heroFrames=[[0,0,443,443,216,430],[443,0,443,443,216,430],[886,0,444,443,216,430],[1330,0,444,443,220,430],[0,443,440,444,220,416],[440,443,516,444,204,414],[910,443,490,444,209,414],[1394,443,380,444,160,414]];
const demonFrames=heroFrames.map(f=>f.slice());demonFrames[4]=[0,443,395,444,220,421];demonFrames[5]=[395,443,575,444,249,421];demonFrames[6]=[886,443,529,444,233,421];demonFrames[7]=[1370,443,404,444,184,421];
const humanClips={5:[[0,0],[516,0],[516,220],[400,220],[400,444],[0,444]],6:[[60,0],[490,0],[490,444],[0,444],[0,205],[60,205]]};
const demonClips={5:[[0,0],[575,0],[575,180],[498,180],[498,444],[0,444]],6:[[88,0],[529,0],[529,170],[492,170],[492,444],[0,444],[0,190],[88,190]],7:[[0,0],[404,0],[404,444],[44,444],[44,300],[0,300]]};
function walkingHero(x,y,alpha=1){
 const p=game.player,index=Math.floor(p.stride/14)%8;if(!art.walk)return false;
 const blend=formBlend(),base=alpha*(p.inv>0&&Math.floor(clock*18)%2===0?.5:1);
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);
 for(const [img,weight,feet] of [[art.walk,1-blend,[431,432,432,429,417,416,416,414]],[art.demonWalk,blend,[434,434,435,432,421,421,421,419]]]){if(!img||weight<=0)continue;const col=index%4,row=Math.floor(index/4),sx=Math.floor(col*img.width/4),sy=Math.floor(row*img.height/2),fw=Math.floor((col+1)*img.width/4)-sx,fh=Math.floor((row+1)*img.height/2)-sy;ctx.globalAlpha=base*weight;ctx.drawImage(img,sx,sy,fw,fh,-66,-feet[index]*133/fh,133,133);}
 ctx.restore();return true;
}

function formBlend(){const p=game.player;return p.transform>0?clamp(1-p.transform/.65,0,1):clamp(p.power/.45,0,1)}
function throwingHero(x,y,alpha){
 const p=game.player,img=art.throw;if(!img)return false;
 const col=p.throwTime>.25?0:p.throwTime>.20?1:p.throwTime>.08?2:3,blend=formBlend();
 const frames=[[0,450,210],[465,436,185],[915,448,211],[1385,389,205]];
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.throwFacing,1);
 for(const row of [0,1]){const weight=row?blend:1-blend;if(!weight)continue;const f=frames[col],sx=row&&col===1?450:f[0],sw=row&&col<2?468:f[1],anchor=f[2]+(row&&col===1?15:0),baseline=row?429:432;
  ctx.save();ctx.globalAlpha=alpha*weight*(p.inv>0&&Math.floor(clock*18)%2===0?.65:1);
  if(row&&col<2){ctx.beginPath();const points=col===0?[[0,0],[443,0],[443,305],[468,305],[468,444],[0,444]]:[[0,0],[443,0],[443,305],[468,305],[468,444],[20,444],[20,310],[0,310]];points.forEach(([u,v],i)=>i?ctx.lineTo((u-anchor)*.30,(v-baseline)*.30):ctx.moveTo((u-anchor)*.30,(v-baseline)*.30));ctx.closePath();ctx.clip();}
  ctx.drawImage(img,sx,row*443,sw,444,-anchor*.30,-baseline*.30,sw*.30,444*.30);ctx.restore();
 }ctx.restore();return true;
}
function crouchingHero(x,y,alpha){
 const p=game.player,img=art.crouch;if(!img)return false;
 const col=p.attack>.25?1:p.attack>.13?2:p.attack>0?3:0,blend=formBlend();
 const frames=[[0,440,216],[440,440,222],[880,520,220],[1400,374,170]],f=frames[col],scale=.24;
 for(const demonic of [false,true]){const weight=demonic?blend:1-blend;if(!weight)continue;const sy=demonic?480:150,bottom=demonic?367:304,sh=demonic?407:320;
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);ctx.globalAlpha=alpha*weight*(p.inv>0&&Math.floor(clock*18)%2===0?.65:1);
 if(demonic&&col===2){ctx.beginPath();ctx.moveTo(-f[2]*scale,-bottom*scale);ctx.lineTo((1320-f[0]-f[2])*scale,-bottom*scale);ctx.lineTo((1320-f[0]-f[2])*scale,(750-sy-bottom)*scale);ctx.lineTo((f[1]-f[2])*scale,(750-sy-bottom)*scale);ctx.lineTo((f[1]-f[2])*scale,40);ctx.lineTo(-f[2]*scale,40);ctx.closePath();ctx.clip();}
 ctx.drawImage(img,f[0],sy,f[1],sh,-f[2]*scale,-bottom*scale,f[1]*scale,sh*scale);ctx.restore();}return true;
}
// Locomotion follows distance/vertical velocity; actions always override these poses.
function heroMotion(){
 const p=game.player;if(p.attack>0||p.evade>0||p.throwTime>0)return null;
 if(p.crouching)return p.moving?{kind:'crouchWalk',index:Math.floor(p.stride/14)%4}:null;
 if(p.z>0||p.vz>0)return {kind:'air',index:p.vz>120?0:p.vz>-120?1:2};
 return p.landTime>0&&!p.moving?{kind:'air',index:3}:null;
}
function motionFrame(kind,row,index){
 const img=art[kind];if(!img)return null;
 const crouch=kind==='crouchWalk',split=crouch?500:443,sx=Math.floor(index*img.width/4),sy=row?split:0,sw=Math.floor((index+1)*img.width/4)-sx,sh=row?img.height-split:split;
 const anchors=crouch?[[216,222,235,253],[225,233,247,267]]:[[220,225,244,238],[220,225,244,238]];
 const feet=crouch?[[466,465,465,465],[349,349,349,349]]:[[429,429,436,432],[429,429,437,433]];
 return {img,f:[sx,sy,sw,sh,anchors[row][index],feet[row][index]],scale:crouch?.24:.30};
}
function motionHero(motion,x,y,alpha=1){
 if(!art[motion.kind])return false;const p=game.player,blend=formBlend();
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);
 for(const row of [0,1]){const weight=row?blend:1-blend;if(weight<=0)continue;const {img,f,scale}=motionFrame(motion.kind,row,motion.index);ctx.globalAlpha=alpha*weight*(p.inv>0&&Math.floor(clock*18)%2===0?.65:1);ctx.drawImage(img,...f.slice(0,4),-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);}
 ctx.restore();return true;
}
function makeDodgePose(kind,progress,face,blend){
 progress=clamp(progress,0,1);return {kind,progress,index:Math.min(3,Math.floor(progress*4)),face,blend,lift:kind==='back'?Math.sin(progress*Math.PI)*7:0};
}
function dodgePose(){const p=game.player;return p.evade>0?makeDodgePose(p.evadeKind,1-p.evade/(p.evadeKind==='back'?.18:.23),p.face,formBlend()):null;}
function dodgeFrame(form,kind,index){
 const img=form?art.demonDodge:art.dodge;if(!img)return null;const row=kind==='back'?1:0;
 const anchors=form?[[217,253,263,276],[172,207,167,181]]:[[214,229,266,256],[160,177,185,204]],feet=form?[[417,428,422,419],[397,398,400,397]]:[[419,419,419,419],[397,397,397,397]];
 // The demon's guarded blade crosses the equal-cell gutter; keep the whole blade.
 const cuts=form&&row?[0,444,930,1370,1774]:[0,444,887,1330,1774],sx=cuts[index],sy=row?444:0,sw=cuts[index+1]-sx,sh=row?443:444;
 return {img,f:[sx,sy,sw,sh,anchors[row][index],feet[row][index]],scale:.30};
}
// This renderer deliberately reads no live player state: a trail is a past pose.
function drawDodgePose(pose,x,y,alpha=1,shade=1){
 if(!art.dodge||!art.demonDodge)return false;
 ctx.save();ctx.translate(Math.round(x),Math.round(y-pose.lift));ctx.scale(pose.face,1);
 for(const form of [0,1]){const weight=form?pose.blend:1-pose.blend;if(weight<=0)continue;const {img,f,scale}=dodgeFrame(form,pose.kind,pose.index);ctx.globalAlpha=alpha*weight*shade;ctx.drawImage(img,...f.slice(0,4),-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);}
 ctx.restore();return true;
}
function clearDodgeTrail(){ghosts.length=0;trailDistance=0;}
function updateDodgeTrail(dt,start){
 for(let i=ghosts.length-1;i>=0;i--){ghosts[i].life-=dt;if(ghosts[i].life<=0)ghosts.splice(i,1);}
 if(!start||game.mode!=='playing'){trailDistance=0;return;}
 const p=game.player,dx=p.x-start.x,dz=p.z-start.z,distance=Math.hypot(dx,dz);if(distance===0)return;
 const end=dodgePose()||makeDodgePose(start.pose.kind,1,start.pose.face,formBlend());
 for(let offset=TRAIL_SPACING-trailDistance;offset<=distance;offset+=TRAIL_SPACING){
  const t=offset/distance,pose=makeDodgePose(start.pose.kind,start.pose.progress+(end.progress-start.pose.progress)*t,start.pose.face,start.pose.blend+(end.blend-start.pose.blend)*t);
  ghosts.push({x:start.x+dx*t,z:start.z+dz*t,life:TRAIL_LIFE-dt*(1-t),pose:Object.freeze(pose)});
 }
 trailDistance=(trailDistance+distance)%TRAIL_SPACING;if(ghosts.length>8)ghosts.splice(0,ghosts.length-8);
}
function renderDodgeTrail(cam){for(const ghost of ghosts)drawDodgePose(ghost.pose,ghost.x-cam,G-ghost.z,clamp(ghost.life/TRAIL_LIFE,0,1)*.22);}
function heroHitPose(){
 const p=game.player,h=game.lastDamage;if(!h||p.hurtTime<=0||p.attack>0||p.evade>0||p.throwTime>0||game.scene==='house')return null;
 const elapsed=.18-p.hurtTime,weight=clamp((h.poseUntil-elapsed)/.06,0,1);if(weight<=0)return null;
 return {index:p.crouching?3:p.z>0||p.vz>0?2:h.side*p.face>=0?0:1,face:p.face,blend:formBlend(),weight};
}
function hitFrame(form,index){
 const cuts=form?[0,443,936,1330,1774]:[0,443,887,1330,1774],sx=cuts[index],sy=form?443:0;
 const anchors=[[234,240,246,262],[239,260,204,274]],feet=[[434,434,380,434],[419,419,364,418]];
 return {img:art.hit,f:[sx,sy,cuts[index+1]-sx,form?444:443,anchors[form][index],feet[form][index]],scale:.30};
}
function drawHitPose(pose,x,y,alpha=1){
 if(!art.hit)return false;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(pose.face,1);
 for(const form of [0,1]){const weight=form?pose.blend:1-pose.blend;if(weight<=0)continue;const {img,f,scale}=hitFrame(form,pose.index);ctx.globalAlpha=alpha*pose.weight*weight;ctx.drawImage(img,...f.slice(0,4),-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);}ctx.restore();return true;
}
function hitContact(){
 const h=game.lastDamage,elapsed=.18-game.player.hurtTime;if(!h||elapsed<0||elapsed>=.13||!['playing','paused'].includes(game.mode))return null;
 return {x:h.x-game.cam,y:G-h.z,side:h.side,progress:elapsed/.13,color:h.kind==='spit'?'#bea0d5':['ember','blast','wave'].includes(h.kind)?'#e7ac6a':h.kind==='lead'?'#e3cda6':'#c28c7f'};
}
function renderHitContact(){
 const hit=hitContact();if(!hit)return;ctx.save();ctx.translate(Math.round(hit.x),Math.round(hit.y));ctx.globalAlpha=(1-hit.progress)*.85;ctx.strokeStyle=hit.color;ctx.lineWidth=2;
 for(let i=0;i<6;i++){const a=i*Math.PI/3+.25,r=4+hit.progress*15,length=7*(1-hit.progress);ctx.beginPath();ctx.moveTo(Math.round(Math.cos(a)*r),Math.round(Math.sin(a)*r));ctx.lineTo(Math.round(Math.cos(a)*(r+length)),Math.round(Math.sin(a)*(r+length)));ctx.stroke();}ctx.restore();
}
function hero(frame,x,y,alpha=1){
 if(!art.hero)return;const p=game.player,dodge=dodgePose();if(dodge&&drawDodgePose(dodge,x,y,alpha,p.inv>0&&Math.floor(clock*18)%2===0?.65:1))return;const hit=heroHitPose();if(hit&&drawHitPose(hit,x,y,alpha)){alpha*=1-hit.weight;if(alpha<=.001)return;}const motion=heroMotion();if(motion&&motionHero(motion,x,y,alpha))return;if(p.throwTime>0&&!p.crouching&&throwingHero(x,y,alpha))return;if(p.crouching&&crouchingHero(x,y,alpha))return;const f=heroFrames[frame];if(frame>=1&&frame<=3&&p.moving&&p.z===0&&p.attack===0&&p.evade===0&&walkingHero(x,y,alpha))return;
 const blend=p.transform>0?clamp(1-p.transform/.65,0,1):clamp(p.power/.45,0,1);
 function layer(img,opacity,demonic){if(!img||opacity<=0)return;const f=demonic?demonFrames[frame]:heroFrames[frame],sx=img.width/1774,sy=img.height/887;ctx.save();ctx.globalAlpha=alpha*opacity;ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);const clip=(demonic?demonClips:humanClips)[frame];if(clip){ctx.beginPath();clip.forEach(([u,v],i)=>i?ctx.lineTo((u-f[4])*.30,(v-f[5])*.30):ctx.moveTo((u-f[4])*.30,(v-f[5])*.30));ctx.closePath();ctx.clip()}if(demonic){ctx.shadowColor='#986ad0';ctx.shadowBlur=9}if(p.inv>0&&Math.floor(clock*18)%2===0)ctx.globalAlpha*=.65;ctx.drawImage(img,f[0]*sx,f[1]*sy,f[2]*sx,f[3]*sy,-f[4]*.30,-f[5]*.30,f[2]*.30,f[3]*.30);ctx.restore()}
 layer(art.hero,1-blend,false);layer(art.demon,blend,true);if(p.lowAttack&&p.attack>.08&&p.attack<.25){ctx.save();ctx.translate(x,y);ctx.scale(p.attackFacing,1);ctx.strokeStyle=p.power>0?'#c7a0ef':'#e7d8b2';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(32,-23,53,9,0,-.8,2.2);ctx.stroke();ctx.restore();}
}
// Each drowned pose has a pelvis anchor and a planted foot; no whole-body wobble.
function drownedFrame(e){
 if(!['cutter','heavy'].includes(e.type)||!art.enemyWalk||!art.enemyCombat)return null;
 const heavy=e.type==='heavy',row=heavy?1:0;
 const walk=[[[0,0,443,432,252,420],[443,0,444,432,234,420],[887,0,443,432,235,420],[1330,0,444,432,257,421]],[[0,436,460,451,258,426],[465,436,422,451,250,420],[890,436,446,451,256,427],[1340,436,434,451,275,427]]];
 // The sabre reaches into the left gutter of frame 3; the raised axe starts at y=419.
 const combat=[[[0,0,443,428,267,421],[443,0,397,419,221,418],[840,0,490,430,272,422],[1330,0,444,430,284,421]],[[0,443,443,444,228,416],[465,419,370,468,176,441],[880,443,464,444,268,417],[1344,443,430,444,273,417]]];
 if(!e.dead&&e.phase==='idle'&&e.walk){const i=Math.floor((e.stride||0)/14)%4;return {img:art.enemyWalk,f:walk[row][i],scale:heavy?.36:.31,pose:'walk-'+i};}
 const early=e.phase==='windup'&&e.timer>(e.windupDuration||((heavy?.95:.60)*(e.enraged?.75:1)))*.48;
 const i=!e.dead&&e.phase==='windup'?(early?0:1):!e.dead&&e.phase==='strike'?2:3;
 return {img:art.enemyCombat,f:combat[row][i],scale:heavy?.40:.36,pose:e.phase==='windup'?(early?'windup-early':'windup-late'):e.dead?'dead':e.phase};
}
function heavySignal(e){
 if(e.dead||e.type!=='heavy'||e.phase!=='windup')return null;
 return {waves:Math.max(1,(e.waveTotal||1)-(e.waveIndex||0)),progress:clamp(1-e.timer/(e.windupDuration||.95),0,1),followup:(e.waveIndex||0)>0};
}
function enemy(e){
 if(['lancer','captain'].includes(e.type)){guard(e);return;}
 if(e.type==='gunner'){gunner(e);return;}
 if(!art.special)return;const x=e.x-game.cam,y=G+(e.dead?(1-e.death)*16:0);if(x<-180||x>W+180||e.dead&&e.death<=0)return;
 if(e.phase==='buried'||e.phase==='emerge'){const rising=e.phase==='emerge',progress=rising?clamp(1-e.timer/1.1,0,1):0;ctx.save();ctx.strokeStyle=rising?'#9b8b6677':'#56717a33';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x,G+3,14+i*10+(clock*12%12),3+i*2,0,0,Math.PI*2);ctx.stroke()}ctx.restore();if(!rising)return;ctx.save();ctx.beginPath();ctx.rect(x-150,0,300,G+5);ctx.clip();ctx.translate(0,(1-progress)*(e.heavy?165:105));}

 const crouch=e.type==='crawler',spitter=e.type==='spitter',windup=e.phase==='windup';
 const col=e.dead?3:windup?2:e.phase==='strike'?3:e.walk?Math.floor((e.stride||0)/14)%2:0,special=(crouch||spitter)&&art.special,sprite=art.special,row=spitter?1:0,sw=sprite.width/4,sh=sprite.height/2,scale=e.heavy?.36:crouch?.31:.31;
 ctx.save();ctx.globalAlpha=e.dead?e.death*.3:.3;ctx.fillStyle='#03080c';ctx.beginPath();ctx.ellipse(x,G+3,e.heavy?37:26,7,0,0,7);ctx.fill();ctx.restore();
 if(windup){const color=e.heavy?'#e4b164':crouch?'#e6a255':spitter?'#b08edc':'#e3796a';ctx.save();ctx.globalAlpha=.35+.2*Math.sin(clock*18);ctx.fillStyle=color;const range=e.heavy?210:crouch?190:76;if(spitter){ctx.strokeStyle=color;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(x,G-82);ctx.lineTo(x+e.lockedFace*200,G-82);ctx.stroke()}else ctx.fillRect(e.heavy?x-range:x+(e.lockedFace<0?-range:0),G-3,e.heavy?range*2:range,3);if(e.heavy){const signal=heavySignal(e);ctx.globalAlpha=.9;ctx.fillStyle='#f0d39b';ctx.fillRect(x-range*signal.progress,G-3,range*signal.progress*2,3);for(let i=0;i<signal.waves;i++)rect(x+(i-(signal.waves-1)/2)*12-3,G-194,6,5,'#f0d39b');}ctx.restore();}
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(-e.face,1);ctx.globalAlpha=e.dead?e.death*e.death:1;if(e.dead)ctx.rotate((1-e.death)*.75);
 if(e.flash>0)ctx.filter='brightness(2) saturate(.4)';else if(e.enraged){ctx.filter='sepia(.25) saturate(1.4)';ctx.shadowColor='#d97e54';ctx.shadowBlur=5;}
 if(windup){ctx.shadowColor=e.heavy?'#d9ab67':spitter?'#bc85dc':'#ee7952';ctx.shadowBlur=10;}
 const grounded=drownedFrame(e);if(grounded){const {img,f,scale}=grounded;ctx.drawImage(img,...f.slice(0,4),-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);}else{const wide=crouch&&col===3,sourceX=wide?sprite.width*(1240/1774):col*sw,sourceW=wide?sprite.width*(534/1774):sw,anchor=wide?300:220;ctx.drawImage(sprite,sourceX,row*sh,sourceW,sh,-anchor*scale,-(row?415:402)*scale,sourceW*scale,sh*scale);}ctx.restore();
 if(spitter&&!e.dead&&!special){glow(x-e.face*5,G-88,14,windup?'#c198fb88':'#aa8bbc33');rect(x-e.face*5,G-91,4,4,'#c4a1dd')}
 if(e.phase==='emerge')ctx.restore();
 if(e.broken>0){ctx.strokeStyle='#e8dba0';ctx.beginPath();ctx.moveTo(x-15,G-155);ctx.lineTo(x-3,G-148);ctx.lineTo(x+2,G-163);ctx.lineTo(x+15,G-155);ctx.stroke()}
 if(!e.dead&&e.phase!=='emerge'&&Math.abs(e.x-game.player.x)<340){const top=G-(e.heavy?166:crouch?103:144);rect(x-23,top,46,3,'#080c11');rect(x-23,top,46*e.hp/e.maxHp,3,e.heavy?'#c3a36c':spitter?'#a88bbd':'#b78b68');if(windup){ctx.fillStyle=e.heavy?'#e1bf7a':'#efb878';ctx.font='bold 12px Georgia';ctx.textAlign='center';ctx.fillText(crouch||e.heavy?'↑':spitter?'◆':'!',x,top-7)}}
}
// Keep locomotion separate from attack anticipation; every pose has its own foot anchor.
function guardFrame(e){
 const captain=e.type==='captain',row=captain?1:0;
 const combat=[[[0,0,435,443,280,392],[480,0,380,443,247,392],[864,0,471,443,341,392],[1336,0,438,443,287,392]],[[0,443,439,444,225,379],[469,443,415,444,212,379],[885,443,470,444,349,379],[1356,443,418,444,273,381]]];
 if(!e.dead&&e.phase==='windup'&&art.guardReady){
  // The raised captain axe extends above its nominal row; the cell above is cropped clear of it.
  const poses=[[[0,0,443,419,285,410],[443,0,444,419,320,411]],[[0,443,443,444,283,383],[443,419,444,468,277,407],[887,443,443,444,290,383]]];
  const i=captain?(e.move==='slam'?1:e.move==='wave'?2:0):(e.move==='sweep'?1:0);
  return {img:art.guardReady,f:poses[row][i],scale:captain?.41:.39,pose:'windup-'+e.move};
 }
 if(!e.dead&&e.phase==='idle'&&e.walk&&art.guardWalk){const i=Math.floor((e.stride||0)/14)%4,sx=Math.floor(i*art.guardWalk.width/4),sy=Math.floor(row*art.guardWalk.height/2),sw=Math.floor((i+1)*art.guardWalk.width/4)-sx,sh=Math.floor((row+1)*art.guardWalk.height/2)-sy;
  const anchors=[[259,240,224,234],[200,199,204,194]],feet=[[412,412,412,411],[380,381,383,382]];
  return {img:art.guardWalk,f:[sx,sy,sw,sh,anchors[row][i],feet[row][i]],scale:.39,pose:'walk-'+i};
 }
 if(!e.dead&&e.phase==='recover'&&art.guardReady)return {img:art.guardReady,f:captain?[1330,443,444,444,284,384]:[887,0,443,419,263,411],scale:captain?.41:.39,pose:'recover'};
 const col=e.phase==='strike'?(e.move==='thrust'?2:3):0;return {img:art.guards,f:combat[row][col],scale:captain?.38:.43,pose:e.phase};
}
function guardSignal(e){
 if(e.dead||e.phase!=='windup')return null;
 const low=['sweep','wave'].includes(e.move),slam=e.move==='slam',wave=e.type==='captain'&&e.move==='wave';
 return {low,slam,wave,z:low?15:slam?3:83,progress:clamp(1-e.timer/(e.windupDuration||1),0,1),waves:wave?Math.max(1,(e.waveTotal||1)-(e.waveIndex||0)):0};
}
function guard(e){
 const x=e.x-game.cam,captain=e.type==='captain';if(!art.guards||x<-190||x>W+190||e.dead&&e.death<=0)return;
 const windup=!e.dead&&e.phase==='windup',strike=!e.dead&&e.phase==='strike',{img,f,scale}=guardFrame(e);
 ctx.save();ctx.fillStyle='#03080c66';ctx.beginPath();ctx.ellipse(x,G+3,captain?37:29,6,0,0,7);ctx.fill();ctx.translate(Math.round(x),G);ctx.scale(-e.face,1);ctx.globalAlpha=e.dead?e.death*e.death:1;if(e.dead)ctx.rotate((1-e.death)*.9);if(e.flash>0)ctx.filter='brightness(1.8)';if(windup){ctx.shadowColor=e.move==='thrust'?'#e49b74':'#e6c687';ctx.shadowBlur=10;}ctx.drawImage(img,...f.slice(0,4),-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);ctx.restore();
 if(windup){const {low,slam,wave,z,progress,waves}=guardSignal(e);ctx.save();ctx.strokeStyle=low?'#eecb83a0':'#e6a592a0';ctx.lineWidth=2;ctx.setLineDash(slam?[]:[5,7]);ctx.beginPath();ctx.moveTo(wave?x-210:x,G-z);ctx.lineTo(wave?x+210:x+e.lockedFace*(slam?125:185),G-z);ctx.stroke();ctx.font='bold 17px Arial';ctx.fillStyle='#efd6a4';ctx.textAlign='center';ctx.fillText(low?'↑':slam?'↔':'↓',x,G-(captain?168:145));if(wave){ctx.setLineDash([]);ctx.strokeStyle='#f0d39b';ctx.beginPath();ctx.moveTo(x-progress*210,G-z);ctx.lineTo(x+progress*210,G-z);ctx.stroke();for(let i=0;i<waves;i++)rect(x+(i-(waves-1)/2)*12-3,G-188,6,5,'#f0d39b');}ctx.restore();}
 if(strike&&e.move!=='wave'){ctx.save();ctx.globalAlpha=.65;ctx.strokeStyle='#edcf97';ctx.lineWidth=2;ctx.beginPath();if(e.move==='thrust'){ctx.moveTo(x+e.face*40,G-83);ctx.lineTo(x+e.face*148,G-83);}else if(e.move==='sweep'){ctx.ellipse(x+e.face*55,G-18,95,14,0,0,Math.PI*2);}else{ctx.moveTo(x,G-125);ctx.quadraticCurveTo(x+e.face*115,G-110,x+e.face*110,G);glow(x+e.face*100,G-3,40,'#d9ad6344');}ctx.stroke();ctx.restore();}
 if(!e.dead&&!captain&&Math.abs(e.x-game.player.x)<400){rect(x-23,G-140,46,3,'#080c11');rect(x-23,G-140,46*e.hp/e.maxHp,3,'#b2a178');}
}
function renderCampaignBackground(cam,t){
 const scene=game.scene,bg=backgroundLayout(cam),img=art[scene];rect(0,0,W,H,scene==='villages'?'#252f38':'#1b2032');if(img)ctx.drawImage(img,Math.round(bg.x),Math.round(bg.y),bg.width,bg.height);
 const floor=ctx.createLinearGradient(0,432,0,H);floor.addColorStop(0,scene==='skit'?'#211e2400':'#1b242900');floor.addColorStop(.3,scene==='skit'?'#191920c9':'#1c242acf');floor.addColorStop(1,'#0b1119');ctx.fillStyle=floor;ctx.fillRect(0,432,W,108);
 for(let i=0;i<380;i++){const x=rand(i+534)*4300-cam;if(x<-40||x>W+40)continue;const y=445+rand(i+983)*92;rect(x,y,3+rand(i+62)*(scene==='fortress'?23:17),1+rand(i+199)*2,scene==='skit'?['#41343a','#292a32','#4c3b33'][i%3]:['#343b42','#3c4246','#525044'][i%3]);}
 if(scene==='villages'){
  for(let i=0;i<15;i++){const x=rand(i+812)*3900-cam;ctx.save();ctx.globalAlpha=.11;ctx.fillStyle='#afbac2';ctx.beginPath();ctx.ellipse(x,450+rand(i+554)*60,20+rand(i+37)*35,2,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.strokeStyle='#a7bbcb38';ctx.lineWidth=1;for(let i=0;i<100;i++){const x=((rand(i+502)*1500+t*74-cam*.12)%(W+100)+W+100)%(W+100)-50,y=(rand(i+816)*H+t*(240+rand(i)*80))%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y-14);ctx.stroke();}
 }else{
  const sources=scene==='skit'?[[.111,.628],[.432,.574],[.530,.593],[.574,.615]]:[[.026,.594],[.199,.606],[.792,.600],[.920,.600]];
  for(const [i,[u,v]] of sources.entries()){const x=bg.x+bg.width*u,y=bg.y+bg.height*v;glow(x,y,scene==='skit'?28:36,'#e8963838');for(let j=0;j<4;j++){const h=5+Math.sin(t*8+j+i)*3;rect(x+j*2-4,y-h,2,h+3,'#de934baa');}for(let j=0;j<9;j++){const a=(t*.13+j/9+i*.17)%1,size=5+a*18;ctx.save();ctx.globalAlpha=Math.sin(a*Math.PI)*.15;rect(x-a*23+Math.sin(a*7)*8-size/2,y-a*98,size,size*.8,'#92919c');ctx.restore();}}
 }
 renderGates(cam,t);
}
function barrelFrame(b){return {img:art.powder,f:['burst','spent'].includes(b.phase)?[887,0,887,887,420,810]:[0,0,887,887,467,794],scale:.104};}
function renderBarrels(cam,t){
 if(!art.powder)return;for(const b of game.barrels){const x=b.x-cam;if(x<-190||x>W+190)continue;const {img,f,scale}=barrelFrame(b);
  ctx.save();ctx.fillStyle='#02070966';ctx.beginPath();ctx.ellipse(x,G+2,30,5,0,0,Math.PI*2);ctx.fill();ctx.drawImage(img,...f.slice(0,4),Math.round(x-f[4]*scale),G-f[5]*scale,f[2]*scale,f[3]*scale);ctx.restore();
  if(b.phase==='fuse'){
   const remaining=clamp(b.timer/b.duration,0,1),hot=b.timer<.35,color=hot?'#f1a17c':'#edcc90',fx=x+10,fy=G-74;
   ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.globalAlpha=.4;ctx.beginPath();ctx.ellipse(x,G+2,b.radius,9,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,G+2,b.radius,9,0,-Math.PI/2,-Math.PI/2+Math.PI*2*remaining);ctx.stroke();ctx.restore();
   glow(x,G-30,53,'#d8803730');glow(fx,fy,12+(1-remaining)*8,'#ffb65288');rect(fx-1,fy-1,3,3,'#ffe5a5');
   for(let i=0;i<5;i++){const life=(t*(hot?5:3)+i*.2)%1;rect(fx+(rand(i+10)-.5)*life*20,fy-life*18,1,2,i%2?'#e78f4b':'#ffde93');}
  }
  if(b.phase==='burst'){
   const age=1-b.timer/.34;ctx.save();ctx.globalAlpha=1-age;glow(x,G-26,b.radius,'#dc985b66');ctx.strokeStyle='#eac994';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,G+1,Math.max(1,b.radius*Math.min(1,age*2)),12,0,0,Math.PI*2);ctx.stroke();
   for(let i=0;i<17;i++){const angle=i*Math.PI*2/17,xx=x+Math.cos(angle)*age*b.radius*.85,yy=G-6-Math.sin(Math.abs(angle%Math.PI))*age*61;rect(xx-4,yy-5,7+rand(i)*6,5+rand(i+40)*8,i%3?'#d89653':'#efce89');}ctx.restore();
  }
  if(b.smoke>0){const age=3-b.smoke;for(let i=0;i<12;i++){const a=clamp((age-i*.045)/2.6,0,1),size=12+a*32;ctx.save();ctx.globalAlpha=(1-a)*Math.min(1,age*5)*.26;rect(x+(rand(i+90)-.5)*(25+a*75)+a*13,G-25-a*(80+rand(i+150)*45),size,size*.75,i%2?'#494950':'#79706a');ctx.restore();}}
 }
}
function renderEmbers(){for(const h of game.hazards){const x=h.x-game.cam;if(x<-90||x>W+90)continue;const warning=h.phase==='warning',active=h.phase==='active';for(let i=0;i<9;i++)rect(x-h.width+i*h.width/4+Math.sin(i)*5,G+3,3,2,warning||active?'#efb95c':'#684436');if(warning){ctx.save();ctx.strokeStyle='#ebbe78';ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(x,G,h.width,7,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.3+.25*Math.sin(clock*14);glow(x,G-3,58,'#e8b96a88');ctx.font='bold 17px Arial';ctx.fillStyle='#edca86';ctx.textAlign='center';ctx.fillText('↑',x,G-28);ctx.restore();}if(active){for(let i=0;i<14;i++){const xx=x-h.width+i*h.width/6.5,height=14+Math.sin(clock*15+i*2)*8;rect(xx,G-height,5,height+2,'#b96e38aa');rect(xx+1,G-height+3,2,height-2,'#edb966');}glow(x,G-8,72,'#e4a45144');}}}

function gunnerMeleeFrame(e){
 if(e.move!=='butt'||!['windup','strike','recover'].includes(e.phase))return null;
 const index=e.phase==='windup'?(e.timer>(e.windupDuration||.70)*.48?0:1):e.phase==='strike'?2:3;
 return {index,img:art.gunnerMelee,f:[[0,0,627,627,380,617],[627,0,627,627,329,618],[0,627,627,627,417,549],[627,627,627,627,386,549]][index],scale:.225};
}
function gunner(e){
 let img=art.gunner,x=e.x-game.cam;if(!img||x<-160||x>W+160||e.dead&&e.death<=0)return;
 let row=0,col=e.walk?Math.floor((e.stride||0)/14)%2:0;if(e.phase==='windup'){row=e.shotLow?1:0;col=e.shotLow?1:2;}else if(e.phase==='strike'){row=e.shotLow?1:0;col=e.shotLow?2:3;}else if(e.phase==='recover'){row=1;col=0;}else if(e.phase==='hurt'||e.dead){row=1;col=3;}
 const frames=[[[0,0,410,443,250,418],[436,0,403,443,251,418],[872,0,455,443,293,418],[1335,0,439,443,325,418]],[[0,443,410,444,231,404],[420,443,450,444,310,404],[875,443,465,444,295,404],[1410,443,364,444,240,404]]];const melee=gunnerMeleeFrame(e),f=melee?.f||frames[row][col],scale=melee?.scale||.30;img=melee?.img||img;
 ctx.save();ctx.fillStyle='#03080c66';ctx.beginPath();ctx.ellipse(x,G+3,27,6,0,0,7);ctx.fill();ctx.translate(Math.round(x),G);ctx.scale(-e.face,1);ctx.globalAlpha=e.dead?e.death*e.death:1;if(e.dead)ctx.rotate((1-e.death)*.75);if(e.flash>0)ctx.filter='brightness(1.7)';ctx.drawImage(img,f[0],f[1],f[2],f[3],-f[4]*scale,-f[5]*scale,f[2]*scale,f[3]*scale);ctx.restore();
 if(e.phase==='windup'&&e.move==='butt'){ctx.save();ctx.strokeStyle='#e9b482';ctx.lineWidth=2;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(x,G+2);ctx.lineTo(x+e.lockedFace*105,G+2);ctx.stroke();ctx.fillStyle='#efc7a2';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText('↔',x,G-145);ctx.restore();}
 else if(e.phase==='windup'){const z=e.shotLow?48:88;ctx.save();ctx.strokeStyle=e.shotLow?'#d9ae69a0':'#e6928699';ctx.setLineDash([4,8]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+e.lockedFace*85,G-z);ctx.lineTo(x+e.lockedFace*430,G-z);ctx.stroke();ctx.fillStyle=e.shotLow?'#f3ce84':'#eab9a4';ctx.font='bold 15px Arial';ctx.textAlign='center';ctx.fillText(e.shotLow?'↑':'↓',x,G-145);ctx.restore();}
 if(!e.dead&&Math.abs(e.x-game.player.x)<470){rect(x-23,G-137,46,3,'#080c11');rect(x-23,G-137,46*e.hp/e.maxHp,3,'#ae8c72');}
}
function renderShots(){for(const shot of game.projectiles){const x=shot.x-game.cam;if(x<-100||x>W+100)continue;
 if(shot.kind==='dagger'){ctx.save();ctx.translate(x,G-shot.z);ctx.rotate(Math.atan2(-shot.vz,shot.vx));rect(-14,-1,22,2,'#d9dee0');path([[8,-3],[17,0],[8,3]],'#edf0e5');rect(-13,-4,2,8,'#c19b56');rect(-21,-2,8,4,'#735138');ctx.restore();}
 else if(shot.kind==='lead'){const y=G-shot.z;rect(x-9*Math.sign(shot.vx),y-1,13,2,'#f4d7a1');glow(x,y,9,'#e9a45255');}
 else if(shot.kind==='wave'){SabbathWaves.draw(ctx,shot,game.scene,game.cam,G);}
 else{for(let i=4;i>=0;i--)glow(x-i*Math.sign(shot.vx)*9,G-shot.z,11-i,shot.friendly?'#e8c67f55':'#ac83d944');rect(x-4,G-shot.z-4,8,8,shot.friendly?'#e9c681':'#bda0e5');rect(x-1,G-shot.z-2,3,3,'#f1dfff')}
}}
// One continuous painting: no tiles, mirrored copies, or screen-space seams.
function backgroundLayout(cam){
 const ratio=art.bg?art.bg.width/art.bg.height:3,width=Math.max(1950,W+440),height=width/ratio;
 const travel=Math.max(0,width-W),offset=clamp(cam,0,game.exit-830)*Math.min(.32,travel/(game.exit-830));
 return {width,height,x:-offset,y:432-height*.81};
}
function atmosphere(cam,t,bg,isSich=false){
 const at=(u,v)=>[bg.x+u*bg.width,bg.y+v*bg.height];
 // Fire, rising smoke, embers and reflected light use the same painted roof anchors.
 for(const [i,source] of (isSich?[[.052,.349],[.14,.41],[.279,.48],[.362,.508],[.595,.504]]:[[.056,.427],[.142,.472],[.177,.501],[.268,.507],[.598,.509],[.785,.500]]).entries()){
  const [x,y]=at(...source);if(x<-130||x>W+130)continue;
  glow(x,y,31+Math.sin(t*7+i)*4,'#e99b3830');
  for(let j=0;j<5;j++){const q=t*(1.4+j*.13)+j*2.2+i,h=7+(Math.sin(q*3)+1)*6;rect(x+j*3-7,y-h*.5,3,h*.5+4,'#d4753288');rect(x+j*3-6+Math.round(Math.sin(q)*2),y-h,2,h*.7,'#e6a341b0')}
  for(let j=0;j<13;j++){
   const life=((t*.18+j/13+i*.137)%1),size=5+life*24;
   const sx=x-life*39+Math.sin(life*6+i)*life*14,sy=y-8-life*146;
   ctx.save();ctx.globalAlpha=Math.sin(life*Math.PI)*.28;
   path([[sx-size,sy-size*.25],[sx-size*.7,sy-size*.8],[sx-size*.2,sy-size*.8],[sx-size*.2,sy-size],[sx+size*.55,sy-size],[sx+size,sy-size*.4],[sx+size,sy+size*.45],[sx+size*.6,sy+size*.7],[sx-size*.65,sy+size*.7],[sx-size,sy+size*.3]],j%2?'#242a38':'#45434a');ctx.restore();
  }
  for(let j=0;j<4;j++){const life=(t*.55+j*.25+i*.17)%1;rect(x-life*15+Math.sin(life*8+j)*5,y-life*51,1,2,`rgba(224,151,77,${(1-life)*.7})`)}
  if(!isSich){const water=at(source[0],.707);for(let j=0;j<5;j++){const xx=water[0]+Math.sin(t*2+j)*9;rect(xx-7-j,water[1]+j*6,14+j*3,1,'#da95561a')}}
 }
 for(let i=0;i<5;i++){const x=((t*17+i*73-cam*.06)%(W+240)+W+240)%(W+240)-120,y=35+i*9+Math.sin(t*.6+i)*10,flap=Math.sin(t*7+i)*4;ctx.strokeStyle='#101b29aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y-flap);ctx.lineTo(x,y);ctx.lineTo(x+6,y-flap);ctx.stroke()}
 if(isSich)return;
 // Brief, distant river life. Its reflection/ripples stay below the waterline.
 for(const [i,source] of [[.43,.731],[.70,.746]].entries()){
  const age=(t+i*11)%27,[x,y]=at(...source);if(x<-90||x>W+90)continue;
  if(age<2.1){ctx.save();ctx.globalAlpha=Math.sin(age/2.1*Math.PI)*.6;ctx.strokeStyle='#a9ac9a';ctx.lineWidth=1;for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(x,y,5+age*18+j*5,1+age*2+j,0,0,Math.PI*2);ctx.stroke()}ctx.restore();}
  if(age>.27&&age<1.02){const f=(age-.27)/.75,xx=x-17+f*34,yy=y-Math.sin(f*Math.PI)*24;ctx.save();ctx.translate(xx,yy);ctx.rotate((f-.5)*2);path([[-8,0],[-3,-4],[5,-3],[9,0],[3,3],[-3,2]],'#1e2933');path([[-6,0],[-13,-4],[-12,4]],'#27343d');rect(5,-1,1,1,'#b4ad8b');ctx.restore();}
  const swimming=(age-12)/4;if(swimming>0&&swimming<1){const xx=x-48+swimming*96;ctx.save();ctx.globalAlpha=Math.sin(swimming*Math.PI)*.5;path([[xx-10,y],[xx-3,y-3],[xx+5,y-2],[xx+10,y]],'#182932');ctx.strokeStyle='#92a4a56b';ctx.beginPath();ctx.ellipse(xx-7,y+2,17,2,0,0,Math.PI);ctx.stroke();ctx.restore();}
 }
}
function renderBackground(cam,t){
 if(game.scene==='house'){renderHouse(cam,t);return;}if(game.chapter>=3){renderCampaignBackground(cam,t);return;}if(game.scene==='sich'){renderSich(cam,t);return;}
 rect(0,0,W,H,'#202b3c');const bg=backgroundLayout(cam);if(art.bg)ctx.drawImage(art.bg,Math.round(bg.x),Math.round(bg.y),bg.width,bg.height);
 atmosphere(cam,t,bg);
 // Water highlights stay in the river painted into this same panorama.
 ctx.save();ctx.globalAlpha=.12;for(let i=0;i<85;i++){const u=.18+rand(i)*.66,v=.67+rand(i+300)*.11;const x=bg.x+u*bg.width+Math.sin(t*.8+i)*7,y=bg.y+v*bg.height;rect(x,y,8+rand(i+7)*35,1,rand(i+1)>.85?'#d7aa78':'#8199ab')}ctx.restore();
 for(let i=0;i<9;i++){const x=bg.x+i*bg.width/8+Math.sin(t*.08+i)*17;glow(x,bg.y+bg.height*.60+Math.sin(i)*10,130,'#9fa9b00b')}
 rect(0,432,W,108,'#182126');
 // Solid props share the bank and camera plane; none drift across the water.
 for(const p of [[1,820,454,180],[2,1640,454,185],[1,2450,454,195],[1,3030,454,180]]){const x=p[1]-cam;ctx.save();ctx.fillStyle='#05090b55';ctx.beginPath();ctx.ellipse(x,447,p[3]*.44,5,0,0,7);ctx.fill();ctx.restore();prop(p[0],x,p[2],p[3],.85);}
 // Broad quiet fighting strip with broken pixel highlights and footprints.
 const ground=ctx.createLinearGradient(0,430,0,540);ground.addColorStop(0,'#1b222390');ground.addColorStop(.4,'#151c22');ground.addColorStop(1,'#090e14');ctx.fillStyle=ground;ctx.fillRect(0,431,W,109);
 for(let i=0;i<440;i++){let x=((rand(i+910)*5000-cam)%5000+5000)%5000;if(x>W)continue;let y=443+rand(i+391)*100;rect(x,y,2+rand(i+321)*15,1+rand(i+999)*2,['#303636','#3d3c36','#4b4640','#1c2630'][i%4])}
 prop(3,120-cam,462,260);prop(5,400-cam,451,180,.9);prop(4,3780-cam,452,315);
 // The warm flowers at home are the surviving human detail.
 if(cam>2500){glow(3750-cam,397,95,'#c9a25018');if(game.kills===10){ctx.fillStyle='#e3c992';ctx.font='12px Georgia';ctx.textAlign='center';ctx.fillText('ДОМ →',Math.min(895,game.exit-cam),265)}}
 renderGates(cam,t);
}
function renderGates(cam,t){for(const [gate,ids] of game.gates){const locked=ids.some(id=>game.enemies.some(e=>e.id===id&&!e.dead));if(!locked)continue;const x=gate-cam;if(x<-60||x>W+60)continue;for(let i=0;i<8;i++)glow(x+Math.sin(t*2+i)*8,G-i*13,30,'#7b689c09');ctx.strokeStyle='#776f8c40';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<25;i++){const y=G-i*5,xx=x+Math.sin(i*1.8+t*2)*4;i?ctx.lineTo(xx,y):ctx.moveTo(xx,y)}ctx.stroke();}}
function renderSich(cam,t){
 rect(0,0,W,H,'#202b3c');const bg=backgroundLayout(cam);if(art.sich)ctx.drawImage(art.sich,Math.round(bg.x),Math.round(bg.y),bg.width,bg.height);atmosphere(cam,t,bg,true);
 const floor=ctx.createLinearGradient(0,430,0,H);floor.addColorStop(0,'#24252b88');floor.addColorStop(.25,'#24272b');floor.addColorStop(1,'#11171d');ctx.fillStyle=floor;ctx.fillRect(0,432,W,108);
 for(let i=0;i<460;i++){const x=rand(i+734)*4200-cam;if(x<-50||x>W+50)continue;const y=443+rand(i+118)*96;rect(x,y,3+rand(i+42)*26,1+rand(i+953)*3,['#4c4741','#333c45','#5a5143','#1d252c'][i%4]);}
 // A ripped banner attached to a fixed, grounded pole at the edge of the maidan.
 const pole=1760-cam;if(pole>-150&&pole<W+150){rect(pole,G-164,4,168,'#514637');for(let row=0;row<63;row+=3){const wave=Math.round(Math.sin(t*2+row*.065)*4);rect(pole+4+wave,G-160+row,40-Math.floor(row/14)*3,3,row%9===0?'#63403c':'#482b34');}rect(pole-9,G+2,25,4,'#171d21');}
 const lampX=bg.x+bg.width*.741,lampY=bg.y+bg.height*.608;glow(lampX,lampY,12+Math.sin(t*4), '#efb75b35');renderGates(cam,t);
}
function renderHouse(cam,t){
 rect(0,0,W,H,'#171820');const width=game.houseWidth(),height=width/(art.house.width/art.house.height),y=G-height*.80;ctx.drawImage(art.house,-cam,y,width,height);
 for(let i=0;i<22;i++){const x=rand(i+17)*width-cam+Math.sin(t*.12+i)*13,yy=90+(rand(i+51)*340+t*(1+rand(i)*2))%340;rect(x,yy,1,1,'#d5bb8844');}
 const focus=game.houseFocus();if(focus){const x=focus.x-cam;ctx.strokeStyle='#e9c78199';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,G-151);ctx.lineTo(x+4,G-146);ctx.lineTo(x,G-141);ctx.lineTo(x-4,G-146);ctx.closePath();ctx.stroke();}
}

function phonePortrait(){return !document.body.classList.contains('desktop')&&innerHeight>innerWidth}
function fitViewport(){
 document.body.classList.toggle('phone-portrait',phonePortrait());
 if(phonePortrait()&&['playing','house'].includes(game.mode))pause();
 const immersive=innerWidth>=innerHeight;
 const bounds=canvas.getBoundingClientRect();
 const width=immersive&&bounds.height>0?Math.max(1,Math.round(H*bounds.width/bounds.height)):960;
 const oldHouseWidth=game.houseWidth();if(width!==W){W=width;canvas.width=W;}game.viewWidth=W;
 if(game.scene==='house'&&game.houseWidth()!==oldHouseWidth){game.player.x*=game.houseWidth()/oldHouseWidth;game.cam=clamp(game.player.x-W*.45,0,game.houseWidth()-W);}
}
window.addEventListener('resize',fitViewport);
window.visualViewport?.addEventListener('resize',fitViewport);
// Orientation CSS settles after the resize event on WebKit. Observe actual canvas layout.
new ResizeObserver(fitViewport).observe(canvas);
fitViewport();
function render(){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;if(!ready){rect(0,0,W,H,'#0c141f');if(art.bg){const bg=backgroundLayout(100);ctx.drawImage(art.bg,Math.round(bg.x),Math.round(bg.y),bg.width,bg.height);}return;}ctx.save();const intro=game.mode==='intro',cam=intro?Math.sin(clock*.035)*60+100:game.cam;let shake=game.mode==='playing'?game.shake:0;ctx.translate((rand(clock)*2-1)*shake,(rand(clock+2)*2-1)*shake*.4);renderBackground(cam,clock);renderBarrels(cam,clock);
 if(intro){let prev=game.player.face;game.player.face=-1;hero(0,745,442);game.player.face=prev}else{renderDodgeTrail(game.cam);for(const e of game.enemies)enemy(e);let p=game.player;ctx.save();ctx.globalAlpha=.38;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(p.x-game.cam,G+3,28*(game.scene==='house'?2.4*game.houseScale():1),5*(game.scene==='house'?2.4*game.houseScale():1),0,0,7);ctx.fill();ctx.restore();let frame=p.evade>0?(p.evadeKind==='back'?0:7):p.attack>0?(p.airAttack?(p.attack>.25?4:6):(p.counterAttack||game.combo===2)?(p.attack>.25?0:5):game.combo===3?(p.attack>.25?7:6):(p.attack>.25?4:6)):p.z>0?2:p.moving?1+Math.floor(p.stride/14)%3:0;if(game.scene==='house'){
  // Match adult height to the doorway, with the bench at knee height.
  // Indoor staging has its own scale; combat sprites and hitboxes stay unchanged.
  const scale=2.4*game.houseScale();ctx.save();ctx.translate(Math.round(p.x-game.cam),G);ctx.scale(scale,scale);hero(frame,0,0);ctx.restore();
 }else hero(frame,p.x-game.cam,G-p.z);
 if(p.attack>0&&p.attack<.25){ctx.save();ctx.translate(p.x-game.cam,G-p.z-(p.lowAttack?23:64));ctx.scale(p.face,1);ctx.strokeStyle=p.power>0?'#b9a0e8':'#f0cf83';ctx.globalAlpha=Math.sin((.25-p.attack)/.25*Math.PI)*.85;ctx.lineWidth=3;ctx.beginPath();if((p.counterAttack||game.combo===2)&&!p.lowAttack&&!p.airAttack){ctx.moveTo(15,-12);ctx.lineTo(p.counterAttack?132:112,-16);}else{ctx.ellipse(23,-9,p.lowAttack?58:game.combo===3?100:86,p.lowAttack?12:p.airAttack?72:56,p.airAttack?.65:.2,-1.1,1.05);}ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#fff0ce';ctx.stroke();ctx.restore()}
 if(p.transform>0){const t=.65-p.transform,x=p.x-game.cam;ctx.fillStyle='rgba(15,7,31,'+(.24*Math.sin(t/.65*Math.PI))+')';ctx.fillRect(0,0,W,H);glow(x,G-72,150,'#a770d94a');ctx.save();ctx.translate(x,G-58);ctx.strokeStyle='#c5a3ee';ctx.globalAlpha=Math.sin(t/.65*Math.PI)*.8;ctx.lineWidth=2;for(let i=0;i<3;i++){const r=25+t*70+i*17;ctx.beginPath();ctx.ellipse(0,30,r,r*.3,0,0,Math.PI*2);ctx.stroke()}for(let i=0;i<16;i++){let yy=40-((t*160+i*15)%190);rect(Math.sin(i*2.4+t*4)*45,yy,2,7,'#c2a0f6')}ctx.restore()}
 if(p.counter>0){glow(p.x-game.cam,G-60,65,'#e9c17a22');ctx.strokeStyle='#e2c58c99';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x-game.cam,G+1,31,7,0,0,7);ctx.stroke()}
 if(p.power>0){ctx.fillStyle='#39275113';ctx.fillRect(0,0,W,H);for(let i=0;i<10;i++)glow(p.x-game.cam+Math.sin(clock*5+i)*30,G-p.z-i*8,20,'#9b83c311')}
 }
 renderShots();renderEmbers();renderHitContact();
 for(const s of particles){rect(s.x-game.cam,s.y,s.size,s.size,s.color)}
 // Foreground framing passes faster than the actor, never covering the central combat area continuously.
 if(game.scene==='riverside')for(const [x,idx,w] of [[-140,0,270],[1190,5,115],[2250,5,110],[3330,5,120],[5100,0,270]])prop(idx,x-cam*1.15,548,w,.55);
 if(game.scene!=='house')for(let i=0;i<44;i++){let x=((rand(i+55)*1200-clock*(7+rand(i)*10)-cam*.36)%1150+1150)%1150-90,y=(rand(i+35)*560+clock*(3+rand(i+9)*9))%560;rect(x,y,i%7===0?2:1,i%7===0?2:1,i%5===0?'#bc996b85':'#95958a40')}
 ctx.restore();const vignette=ctx.createRadialGradient(W/2,H*.5,H*.18,W/2,H*.5,W*.65);vignette.addColorStop(0,'#050c1300');vignette.addColorStop(1,game.player.inv>.48?'#711e32a8':'#04090fd1');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);if(transition>0){ctx.fillStyle=`rgba(4,8,13,${clamp(transition/.65,0,1)})`;ctx.fillRect(0,0,W,H);}
}
function events(){for(const e of game.events.splice(0)){if(e.type==='barrelFuse'){noise(.65,.05,3600,worldPan(e.data.x));tone(620,.09,.03,'triangle',.7,worldPan(e.data.x));}else if(e.type==='barrelBlast'){noise(.34,.20,1400,worldPan(e.data.x));tone(70,.28,.09,'triangle',.35,worldPan(e.data.x));for(let i=0;i<25;i++)particles.push({x:e.data.x+(Math.random()-.5)*20,y:G-25,vx:(Math.random()-.5)*240,vy:-40-Math.random()*175,life:.35+Math.random()*.45,size:2+Math.random()*3,color:['#a7845f','#e4bd79','#5d4a3c'][i%3]});}else if(e.type==='emberWarning'){tone(180,.25,.025,'triangle',1.2);}else if(e.type==='emberBurst'){noise(.3,.15,1600);for(let i=0;i<20;i++)particles.push({x:e.data+(Math.random()-.5)*100,y:G,vx:(Math.random()-.5)*60,vy:-40-Math.random()*60,life:.3+Math.random()*.4,size:2,color:'#e9ad6977'});}else if(e.type==='checkpoint'){saveCheckpoint();}else if(e.type==='house'||e.type==='chapter'){clearTouch();keys.clear();particles.length=0;clearDodgeTrail();transition=.65;soundscape?.setScene(game.scene);resetFootsteps();$('story-copy').hidden=true;storyUntil=0;captionUntil=0;toastUntil=0;tone(e.type==='house'?98:110,.8,.035,'sine',.8);}else if(e.type==='inspect'){captionUntil=0;tone(e.data.id==='drawing'?220:147,.45,.016,'sine',.97);$('story-title').textContent=e.data.title;$('story-text').textContent=e.data.text;$('story-copy').hidden=false;storyUntil=clock+7;}else if(e.type==='gunshot'){noise(.16,.22,2300,worldPan(e.data.x));tone(75,.12,.1,'triangle',.4,worldPan(e.data.x));for(let i=0;i<9;i++)particles.push({x:e.data.x,y:G-e.data.z,vx:e.data.face*(10+Math.random()*45),vy:-8-Math.random()*18,life:.3+Math.random()*.4,size:3+Math.random()*3,color:'#a1988666'});}else if(e.type==='throw'){noise(.1,.1,3000);tone(460,.08,.04,'triangle',.65)}else if(e.type==='rise'){noise(.35,e.data.heavy?.1:.05,300);for(let i=0;i<16;i++)particles.push({x:e.data.x+(Math.random()-.5)*40,y:G,vx:(Math.random()-.5)*60,vy:-Math.random()*70,life:.5+Math.random()*.4,size:2,color:'#6d756177'})}else if(e.type==='warning'){soundscape?.cueEnemy({...e.data,pan:worldPan(e.data.x)})}else if(e.type==='jump'){noise(.08,.04,1300)}else if(e.type==='perfect'){tone(520,.12,.09,'sine',1.5);$('toast').textContent='ТОЧНЫЙ РЫВОК · КОНТРУДАР ГОТОВ';toastUntil=clock+1.4}else if(e.type==='parry'){tone(780,.15,.08,'triangle',1.4)}else if(e.type==='reflectedHit'){noise(.08,.12,1800);tone(320,.12,.06,'triangle',.7)}else if(e.type==='break'){noise(.16,.18,1300);$('toast').textContent='СТОЙКА СЛОМАНА';toastUntil=clock+1.1}else if(e.type==='land'){soundscape?.land(game.scene);for(let i=0;i<5;i++)particles.push({x:e.data+(Math.random()-.5)*22,y:G,vx:(Math.random()-.5)*50,vy:-Math.random()*30,life:.2+Math.random()*.2,size:2,color:'#aa967055'})}else if(e.type==='caption'){$('caption').textContent=e.data;captionUntil=clock+5.5}else if(e.type==='toast'){$('toast').textContent=matchMedia('(pointer: coarse)').matches?e.data.replace('НАЖМИ D','НАЖМИ «НАВЬ»'):e.data;toastUntil=clock+5}else if(e.type==='sparks'){for(let i=0;i<14;i++)particles.push({x:e.data.x,y:G-60,vx:(Math.random()-.5)*180,vy:-50-Math.random()*130,life:.25+Math.random()*.5,size:i%3?2:3,color:['#ead9ac','#c38863','#a56153','#867794'][i%4]})}else if(e.type==='swing'){noise(.12,.15,3400);tone(160,.13,.05,'triangle',.4)}else if(e.type==='hit'){noise(.12,.3,1000);tone(70,.14,.2,'sine',.45)}else if(e.type==='kill'){tone(180,.5,.06,'triangle',.5)}else if(e.type==='hurt'){noise(.18,.22,450);tone(90,.2,.13,'sawtooth',.4)}else if(e.type==='dodge'){noise(.2,.08,1800)}else if(e.type==='power'){$('toast').textContent='';toastUntil=0;tone(110,1.5,.15,'sawtooth',2);tone(82,2,.08)}else if(e.type==='enemyStrike'){if(e.data.heavy){noise(.18,.16,200);game.shake=Math.max(game.shake,2)}}else if(e.type==='dead'){showMenu('ПУТЬ ОБОРВАЛСЯ','Река помнит твоё имя',game.deathAdvice());tone(55,2,.1)}else if(e.type==='won'){if(game.chapter===1){game.enterHouse();}else if(game.chapter<5){saveCheckpoint();showMenu(`ЭПИЗОД ${game.chapter} / 5 ПРОЙДЕН`,game.level.name,game.level.outro);$('continue-level').hidden=false;$('restart').hidden=true;tone(164.81,1,.04);}else{const m=Math.floor(game.time/60),sec=Math.floor(game.time%60).toString().padStart(2,'0');showMenu('ПЯТЬ ДОРОГ ПРОЙДЕНО','Перед дверью Палия',`${game.totalKills+game.kills} теней · ${m}:${sec} · Точных уклонений: ${game.stats.perfectDodges}. Семья не найдена. Внешний двор взят. За дубовой дверью ещё ждёт Палий.`);tone(164.81,2,.06);setTimeout(()=>tone(196,2,.06),300);setTimeout(()=>tone(220,3,.05),700);}}}}

function loop(now){if(phonePortrait()!==document.body.classList.contains('phone-portrait'))fitViewport();const dt=Math.min(.05,(now-last)/1000||0);last=now;if(game.mode!=='paused'){clock+=dt;transition=Math.max(0,transition-dt);}const previousDodge=dodgePose(),trailStart=previousDodge?{x:game.player.x,z:game.player.z,pose:previousDodge}:null;game.tick(dt,{left:inputHeld('a'),right:inputHeld('d'),attack:inputHeld('j'),crouch:inputHeld('x')||crouchToggle});events();if(['playing','house'].includes(game.mode)){for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=330*dt;if(p.life<=0)particles.splice(i,1)}updateDodgeTrail(dt,trailStart);const p=game.player,step=Math.floor(p.stride/(p.crouching?28:56));if(p.crouching!==footstepCrouched){footstep=step;footstepCrouched=p.crouching;}if(p.moving&&p.z===0&&p.evade===0&&step!==footstep){soundscape?.step(game.scene,p.power>0);for(let j=0;j<2;j++)particles.push({x:p.x-p.face*9,y:G-1,vx:-p.face*(12+Math.random()*15),vy:-12-Math.random()*16,life:.22,size:2,color:'#9a897044'})}footstep=step;}
 if(soundscape){const boss=game.enemies.find(e=>e.type==='captain'&&!e.dead&&Math.abs(e.x-game.player.x)<520);soundscape.update(dt,{scene:game.scene,mode:game.mode,boss:!!boss,enraged:!!boss?.enraged});}
 const inHouse=game.scene==='house';if(document.body.dataset.scene!==game.scene)document.body.dataset.scene=game.scene;const focus=inHouse&&game.mode==='house'?game.houseFocus():null;$('interact-hint').hidden=!focus||!$('intro').hidden;$('interact-hint').textContent=focus?(focus.id==='door'?'К СЕЧИ →':(matchMedia('(pointer: coarse)').matches?'':'S · ')+focus.title):'';if(clock>storyUntil||!inHouse)$('story-copy').hidden=true;document.querySelector('[data-key="j"]').textContent=inHouse?'ОСМОТР':'САБЛЯ';
 document.querySelector('[data-key="x"]').classList.toggle('ready',game.player.crouching);document.querySelector('[data-key="x"]').setAttribute('aria-pressed',String(game.player.crouching));const knifeButton=document.querySelector('[data-key="v"]');knifeButton.textContent='КОРТИК '+game.player.knives;knifeButton.style.opacity=game.player.throwCd>0||game.player.knives===0?'.4':'1';document.querySelector('[data-key="Shift"]').style.opacity=game.player.evadeCd>0?'.45':'1';document.querySelector('[data-key="e"]').classList.toggle('ready',game.player.nav>=100||game.player.power>0);
 $('test-heal').disabled=!['playing','house'].includes(game.mode)||game.player.hp<=0||game.player.hp>=game.player.maxHp;
 $('health').style.width=game.player.hp+'%';$('hptext').textContent=Math.ceil(game.player.hp)+(game.player.maxHp<100?'/'+game.player.maxHp:'');$('power').style.width=(game.player.power>0?game.player.power/8*100:game.player.nav)+'%';$('hud').classList.toggle('demonic',game.player.power>0);$('powertext').textContent=game.player.transform>0?'ПРЕВРАЩЕНИЕ':game.player.power>0?'ДЕМОН · '+game.player.power.toFixed(1)+' С':game.player.nav>=100?(document.body.classList.contains('desktop')?'D · НАВЬ':'НАВЬ ГОТОВА')+' / ЦЕНА: 8 МАКС. HP':'НАВЬ · '+Math.floor(game.player.nav)+' / 100';$('kills').innerHTML=game.kills+' <em>/ '+game.enemies.length+'</em>';$('area').textContent=`${game.chapter}/5 · ${game.areaName()}`;const captain=game.enemies.find(e=>e.type==='captain'&&!e.dead);$('boss-hud').hidden=!captain||Math.abs(captain.x-game.player.x)>520||game.mode==='intro';if(captain){$('boss-health').style.width=100*captain.hp/captain.maxHp+'%';$('boss-name').textContent=captain.enraged?'СОТНИК · ЯРОСТЬ':'СОТНИК СТОРОЖИ';}const noticesVisible=$('intro').hidden&&$('menu').hidden;for(const id of ['caption','toast'])$(id).style.visibility=noticesVisible?'visible':'hidden';$('caption').style.opacity=clock<captionUntil?'1':'0';if(clock>toastUntil)$('toast').textContent='';render();requestAnimationFrame(loop)}
// Read-only state export for reproducible local browser checks.
window.sabbath={game,keys,ready:()=>ready,loading:()=>({...loading,failed:[...loading.failed]}),render};loadAssets();requestAnimationFrame(loop);
