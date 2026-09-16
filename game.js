'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),game=new SabbathGame();
let W=960;
const H=540,G=440,keys=new Set(),art={},particles=[],ghosts=[];
let crouchToggle=false;
let last=0,clock=0,captionUntil=0,toastUntil=0,soundOn=false,audio=null,master=null,footstep=0,ready=false;
// All imagery is local; this game makes no network requests except loading its own files.
const assets={crouch:'assets/yaromir-crouch.png',demonWalk:'assets/yaromir-demon-walk.png',walk:'assets/yaromir-walk.png',hero:'assets/yaromir-atlas.png',demon:'assets/yaromir-demon-atlas.png',special:'assets/enemies-special.png',enemy:'assets/enemies-atlas.png',bg:'assets/background.png',props:'assets/props-atlas.png'};
Promise.all(Object.entries(assets).map(([key,url])=>new Promise((resolve,reject)=>{let i=new Image();i.onload=()=>{art[key]=i;if(key==='bg')document.documentElement.style.setProperty('--scene-background',`url("${i.src}")`);resolve()};i.onerror=()=>reject(new Error(url));i.src=url}))).then(()=>{ready=true;$('start').disabled=false;$('start').textContent='ВОЙТИ В СЛОБОДУ';}).catch(e=>{$('start').textContent='НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИЗОБРАЖЕНИЯ';$('toast').textContent='Открой index.html из полной папки игры. Не найден: '+e.message;});
const rand=(n)=>{let a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a)},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
function path(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill()}
function tone(freq,dur,vol,type='sine',slide=1){if(!soundOn||!audio)return;let o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),audio.currentTime+dur);g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(vol,audio.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(master);o.start();o.stop(audio.currentTime+dur+.02)}
function noise(dur,vol,cutoff){if(!soundOn||!audio)return;let b=audio.createBuffer(1,audio.sampleRate*dur,audio.sampleRate),v=b.getChannelData(0);for(let i=0;i<v.length;i++)v[i]=(Math.random()*2-1)*(1-i/v.length);let s=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();s.buffer=b;f.type='lowpass';f.frequency.value=cutoff;g.gain.value=vol;s.connect(f).connect(g).connect(master);s.start()}
function initAudio(){if(audio){audio.resume();return}audio=new(window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=.32;master.connect(audio.destination);for(const f of [55,82.41,110.2]){let o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;o.type='sine';g.gain.value=.022;o.connect(g).connect(master);o.start()}let size=audio.sampleRate*4,b=audio.createBuffer(1,size,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<size;i++)d[i]=Math.random()*2-1;let s=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();s.buffer=b;s.loop=true;f.type='lowpass';f.frequency.value=240;g.gain.value=.08;s.connect(f).connect(g).connect(master);s.start()}
function soundToggle(){soundOn=!soundOn;if(soundOn)initAudio();if(master)master.gain.value=soundOn?.32:0;$('sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ')}
$('sound').onclick=soundToggle;
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('stage').requestFullscreen?.()};
function start(){if(!ready||phonePortrait())return;clearTouch();game.reset();game.start();particles.length=0;ghosts.length=0;keys.clear();$('intro').hidden=true;$('menu').hidden=true;$('hud').hidden=false;canvas.focus();if(!audio&&!soundOn)soundToggle();}
$('start').onclick=start;$('restart').onclick=start;
function pause(){clearTouch();if(game.mode==='playing'){game.mode='paused';showMenu('ПАУЗА','Тишина между ударами','Путь дождётся тебя.',true)}else if(game.mode==='paused'){game.mode='playing';$('menu').hidden=true;canvas.focus()}keys.clear()}
$('pause').onclick=pause;$('resume').onclick=pause;
function showMenu(label,title,copy,resume=false){$('endlabel').textContent=label;$('endtitle').textContent=title;$('endcopy').textContent=copy;$('resume').hidden=!resume;$('restart').textContent=resume?'НАЧАТЬ ЗАНОВО':'ПРОЙТИ ЕЩЁ РАЗ';$('menu').hidden=false}
function keyName(e){return ({KeyA:'a',KeyD:'d',KeyZ:'j',KeyJ:'j',KeyK:'k',KeyC:'e',KeyE:'e',KeyW:' ',Space:' ',ArrowDown:'x',KeyX:'x',ArrowLeft:'a',ArrowRight:'d',ArrowUp:' ',ShiftLeft:'Shift',ShiftRight:'Shift',Escape:'Escape'})[e.code]||e.key}
function press(key,repeat){if(key==='Escape'&&!repeat){pause();return}if(game.mode!=='playing')return;keys.add(key);if(!repeat){if(key==='x')game.player.crouching=game.player.z===0&&game.player.evade===0;if(key==='j')game.attack();if(key===' '){crouchToggle=false;game.jump();}if(key==='Shift'||key==='k'){crouchToggle=false;if(keys.has('a')!==keys.has('d'))game.player.face=keys.has('a')?-1:1;game.dodge();}if(key==='e')game.power()}}
window.addEventListener('keydown',e=>{let k=keyName(e);if(['a','d','j','k','e','x',' ','Shift','Escape'].includes(k)){e.preventDefault();press(k,e.repeat)}});window.addEventListener('keyup',e=>keys.delete(keyName(e)));window.addEventListener('blur',()=>{keys.clear();if(game.mode==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.mode==='playing')pause()});
// iOS may synthesize zoom gestures independently of pointer events.
for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
$('stage').addEventListener('dblclick',e=>e.preventDefault());
$('touch').addEventListener('touchend',e=>e.preventDefault(),{passive:false});
// Track each finger separately: releasing movement must not interrupt an attack.
const touchPointers=new Map();
function releasePointer(id){const key=touchPointers.get(id);touchPointers.delete(id);if(key&&![...touchPointers.values()].includes(key))keys.delete(key);for(const b of document.querySelectorAll('[data-key]'))b.classList.toggle('held',[...touchPointers.values()].includes(b.dataset.key))}
function clearTouch(){crouchToggle=false;touchPointers.clear();for(const b of document.querySelectorAll('[data-key]'))b.classList.remove('held')}
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){press('j',false);canvas.focus()}});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&!touchPointers.has(e.pointerId))keys.delete('j');releasePointer(e.pointerId)});
window.addEventListener('pointercancel',e=>releasePointer(e.pointerId));
window.addEventListener('blur',clearTouch);
for(const b of document.querySelectorAll('[data-key]')){b.addEventListener('contextmenu',e=>e.preventDefault());b.addEventListener('pointerdown',e=>{e.preventDefault();if(game.mode!=='playing')return;if(b.dataset.key==='x'){crouchToggle=!crouchToggle;game.player.crouching=crouchToggle&&game.player.z===0;return;}b.setPointerCapture(e.pointerId);touchPointers.set(e.pointerId,b.dataset.key);b.classList.add('held');press(b.dataset.key,false)});b.addEventListener('lostpointercapture',e=>releasePointer(e.pointerId))}
const propBoxes=[[0,0,510,550],[520,245,510,305],[1045,55,490,490],[0,742,535,270],[540,565,535,437],[1105,600,430,412]],propBounds=[];
function prop(index,x,y,width,alpha=1,flip=false){
 if(!art.props)return;const box=propBoxes[index];
 if(!propBounds[index]){const c=document.createElement('canvas');c.width=box[2];c.height=box[3];const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(art.props,...box,0,0,c.width,c.height);const pixels=q.getImageData(0,0,c.width,c.height).data;let bottom=0;for(let row=0;row<c.height;row++){let solid=0;for(let col=0;col<c.width;col++)if(pixels[(row*c.width+col)*4+3]>128)solid++;if(solid>=4)bottom=row+1;}propBounds[index]={bottom};}
 const scale=width/box[2],h=box[3]*scale;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);ctx.drawImage(art.props,...box,-width/2,-propBounds[index].bottom*scale,width,h);ctx.restore();
}
// Each atlas frame is aligned on its feet. Frames have individual anchors to avoid sliding in attacks.
const heroFrames=[[0,0,443,443,216,430],[443,0,443,443,216,430],[886,0,444,443,216,430],[1330,0,444,443,220,430],[0,443,440,444,220,421],[440,443,516,444,204,421],[956,443,438,444,163,421],[1394,443,380,444,160,421]];
const demonFrames=heroFrames.map(f=>f.slice());demonFrames[4]=[0,443,395,444,220,421];demonFrames[5]=[395,443,575,444,249,421];demonFrames[6]=[886,443,529,444,233,421];demonFrames[7]=[1370,443,404,444,184,421];
const demonClips={5:[[0,0],[575,0],[575,180],[498,180],[498,444],[0,444]],6:[[88,0],[529,0],[529,170],[492,170],[492,444],[0,444],[0,190],[88,190]],7:[[0,0],[404,0],[404,444],[44,444],[44,300],[0,300]]};
function walkingHero(x,y,alpha=1){
 const p=game.player,index=Math.floor(p.stride/14)%8,img=p.power>0&&art.demonWalk?art.demonWalk:art.walk;
 if(!img)return false;const fw=img.width/4,fh=img.height/2;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);ctx.globalAlpha=alpha*(p.inv>0&&Math.floor(clock*18)%2===0?.5:1);
 // Fixed cell anchors: left/right contacts alternate around the same pelvis.
 ctx.drawImage(img,index%4*fw,Math.floor(index/4)*fh,fw,fh,-66,-129,133,133);ctx.restore();return true;
}
function crouchingHero(x,y,alpha){
 const p=game.player,img=art.crouch;if(!img)return false;
 const col=p.attack>.25?1:p.attack>.13?2:p.attack>0?3:0,demonic=p.power>0;
 const frames=[[0,440,216],[440,440,222],[880,520,220],[1400,374,170]],f=frames[col],sy=demonic?480:150,bottom=demonic?367:304,sh=demonic?407:320,scale=.24;
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);ctx.globalAlpha=alpha*(p.inv>0&&Math.floor(clock*18)%2===0?.65:1);
 if(demonic&&col===2){ctx.beginPath();ctx.moveTo(-f[2]*scale,-bottom*scale);ctx.lineTo((1320-f[0]-f[2])*scale,-bottom*scale);ctx.lineTo((1320-f[0]-f[2])*scale,(750-sy-bottom)*scale);ctx.lineTo((f[1]-f[2])*scale,(750-sy-bottom)*scale);ctx.lineTo((f[1]-f[2])*scale,40);ctx.lineTo(-f[2]*scale,40);ctx.closePath();ctx.clip();}
 ctx.drawImage(img,f[0],sy,f[1],sh,-f[2]*scale,-bottom*scale,f[1]*scale,sh*scale);ctx.restore();return true;
}
function hero(frame,x,y,alpha=1){
 if(!art.hero)return;const p=game.player;if(p.crouching&&p.transform===0&&crouchingHero(x,y,alpha))return;const f=heroFrames[frame];if(frame>=1&&frame<=3&&p.moving&&p.z===0&&p.attack===0&&p.evade===0&&walkingHero(x,y,alpha))return;
 const blend=p.transform>0?clamp((1.3-p.transform-.2)/.65,0,1):clamp(p.power/.45,0,1);
 function layer(img,opacity,demonic){if(!img||opacity<=0)return;const f=demonic?demonFrames[frame]:heroFrames[frame],sx=img.width/1774,sy=img.height/887;ctx.save();ctx.globalAlpha=alpha*opacity;ctx.translate(Math.round(x),Math.round(y));ctx.scale(p.face,1);if(demonic&&demonClips[frame]){ctx.beginPath();demonClips[frame].forEach(([u,v],i)=>i?ctx.lineTo((u-f[4])*.30,(v-f[5])*.30):ctx.moveTo((u-f[4])*.30,(v-f[5])*.30));ctx.closePath();ctx.clip()}if(demonic){ctx.shadowColor='#986ad0';ctx.shadowBlur=9}if(p.inv>0&&Math.floor(clock*18)%2===0)ctx.globalAlpha*=.65;ctx.drawImage(img,f[0]*sx,f[1]*sy,f[2]*sx,f[3]*sy,-f[4]*.30,-f[5]*.30,f[2]*.30,f[3]*.30);ctx.restore()}
 layer(art.hero,1-blend,false);layer(art.demon,blend,true);if(p.lowAttack&&p.attack>.08&&p.attack<.25){ctx.save();ctx.translate(x,y);ctx.scale(p.attackFacing,1);ctx.strokeStyle=p.power>0?'#c7a0ef':'#e7d8b2';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(32,-23,53,9,0,-.8,2.2);ctx.stroke();ctx.restore();}
}
function enemy(e){
 if(!art.enemy)return;const x=e.x-game.cam,y=G+(e.dead?(1-e.death)*16:0);if(x<-180||x>W+180||e.dead&&e.death<=0)return;
 const crouch=e.type==='crawler',spitter=e.type==='spitter',windup=e.phase==='windup';
 const col=e.dead?3:windup?2:e.phase==='strike'?3:e.walk?Math.floor(clock*9)%2:0,special=(crouch||spitter)&&art.special,sprite=special?art.special:art.enemy,row=special?(spitter?1:0):(e.heavy?1:0),sw=sprite.width/4,sh=sprite.height/2,scale=e.heavy?.36:crouch?.31:.31;
 ctx.save();ctx.globalAlpha=e.dead?e.death*.3:.3;ctx.fillStyle='#03080c';ctx.beginPath();ctx.ellipse(x,G+3,e.heavy?37:26,7,0,0,7);ctx.fill();ctx.restore();
 if(windup){const color=e.heavy?'#e4b164':crouch?'#e6a255':spitter?'#b08edc':'#e3796a';ctx.save();ctx.globalAlpha=.35+.2*Math.sin(clock*18);ctx.fillStyle=color;const range=e.heavy?210:crouch?190:76;if(spitter){ctx.strokeStyle=color;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(x,G-82);ctx.lineTo(x+e.lockedFace*200,G-82);ctx.stroke()}else ctx.fillRect(e.heavy?x-range:x+(e.lockedFace<0?-range:0),G-3,e.heavy?range*2:range,3);ctx.restore();}
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(-e.face,1);ctx.globalAlpha=e.dead?e.death*e.death:1;if(e.dead)ctx.rotate((1-e.death)*.75);
 if(e.flash>0)ctx.filter='brightness(2) saturate(.4)';else if(e.enraged){ctx.filter='sepia(.25) saturate(1.4)';ctx.shadowColor='#d97e54';ctx.shadowBlur=5;}
 if(windup){ctx.shadowColor=e.heavy?'#d9ab67':spitter?'#bc85dc':'#ee7952';ctx.shadowBlur=10;ctx.rotate(-e.face*Math.sin(clock*12)*.025)}
 const wide=special&&crouch&&col===3,sourceX=wide?sprite.width*(1240/1774):col*sw,sourceW=wide?sprite.width*(534/1774):sw,anchor=special?(wide?300:220):[240,230,220,300][col];ctx.drawImage(sprite,sourceX,row*sh,sourceW,sh,-anchor*scale,-(row?415:402)*scale,sourceW*scale,sh*scale);ctx.restore();
 if(spitter&&!e.dead&&!special){glow(x-e.face*5,G-88,14,windup?'#c198fb88':'#aa8bbc33');rect(x-e.face*5,G-91,4,4,'#c4a1dd')}
 if(e.broken>0){ctx.strokeStyle='#e8dba0';ctx.beginPath();ctx.moveTo(x-15,G-155);ctx.lineTo(x-3,G-148);ctx.lineTo(x+2,G-163);ctx.lineTo(x+15,G-155);ctx.stroke()}
 if(!e.dead&&Math.abs(e.x-game.player.x)<340){const top=G-(e.heavy?166:crouch?103:144);rect(x-23,top,46,3,'#080c11');rect(x-23,top,46*e.hp/e.maxHp,3,e.heavy?'#c3a36c':spitter?'#a88bbd':'#b78b68');if(windup){ctx.fillStyle=e.heavy?'#e1bf7a':'#efb878';ctx.font='bold 12px Georgia';ctx.textAlign='center';ctx.fillText(crouch||e.heavy?'↑':spitter?'◆':'!',x,top-7)}}
}
function renderShots(){for(const shot of game.projectiles){const x=shot.x-game.cam;if(x<-100||x>W+100)continue;
 if(shot.kind==='wave'){ctx.strokeStyle='#dda96e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-18,G);ctx.lineTo(x-8,G-12);ctx.lineTo(x,G-25);ctx.lineTo(x+6,G-7);ctx.lineTo(x+16,G);ctx.stroke();glow(x,G-5,26,'#d59c593a')}
 else{for(let i=4;i>=0;i--)glow(x-i*Math.sign(shot.vx)*9,G-shot.z,11-i,shot.friendly?'#e8c67f55':'#ac83d944');rect(x-4,G-shot.z-4,8,8,shot.friendly?'#e9c681':'#bda0e5');rect(x-1,G-shot.z-2,3,3,'#f1dfff')}
}}
function atmosphere(cam,t){
 // Embers and flame tongues are anchored to repeated background rooftops.
 const tile=1050,offset=(cam*.11)%tile;
 for(let k=-1;k<Math.ceil(W/tile)+1;k++){for(const [fx,fy] of [[117,174],[266,203],[326,230],[518,239],[960,236]]){const mirror=k%2!==0,x=k*tile-offset+(mirror?tile-fx:fx),y=fy;
  glow(x,y,35+Math.sin(t*7+k)*5,'#e99b3820');for(let j=0;j<5;j++){const q=t*(1.4+j*.13)+j*2.2,h=6+(Math.sin(q*3)+1)*7;rect(x+j*3-7,y-h*.5,3,h*.5+4,'#d4753255');rect(x+j*3-6+Math.round(Math.sin(q)*2),y-h,2,h*.7,'#e6a34177')}
 }}
 for(let i=0;i<5;i++){const x=((t*17+i*73-cam*.06)%(W+240)+W+240)%(W+240)-120,y=70+i*9+Math.sin(t*.6+i)*10,flap=Math.sin(t*7+i)*4;ctx.strokeStyle='#101b29aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y-flap);ctx.lineTo(x,y);ctx.lineTo(x+6,y-flap);ctx.stroke()}
}
function renderBackground(cam,t){rect(0,0,W,H,'#202b3c');if(art.bg){let width=1050,height=700,offset=(cam*.11)%width;for(let i=-1;i<Math.ceil(W/width)+1;i++){ctx.save();ctx.translate(i*width-offset,-105);if(i%2){ctx.translate(width,0);ctx.scale(-1,1)}ctx.drawImage(art.bg,0,0,width,height);ctx.restore()}}
 atmosphere(cam,t);
 // The river, fog, props, gameplay and foreground all move independently of the distant painting.
 ctx.save();ctx.globalAlpha=.14;for(let i=0;i<65;i++){let x=((rand(i)*1400-cam*.21+t*(2+rand(i+5)*3))%1250+1250)%1250-120;rect(x,355+rand(i+300)*49,8+rand(i+7)*48,1,rand(i+1)>.85?'#d7aa78':'#8199ab')}ctx.restore();
 for(let i=0;i<9;i++){let x=((i*210-cam*.26+t*4)%1700+1700)%1700-200;glow(x,315+Math.sin(i)*20,150,'#9fa9b00b')}
 rect(0,432,W,108,'#182126');
 // Solid props share the bank and camera plane; none drift across the water.
 for(const p of [[1,820,454,180],[2,1640,454,185],[1,2450,454,195],[1,3030,454,180]]){const x=p[1]-cam;ctx.save();ctx.fillStyle='#05090b55';ctx.beginPath();ctx.ellipse(x,447,p[3]*.44,5,0,0,7);ctx.fill();ctx.restore();prop(p[0],x,p[2],p[3],.85);}
 // Broad quiet fighting strip with broken pixel highlights and footprints.
 const ground=ctx.createLinearGradient(0,430,0,540);ground.addColorStop(0,'#1b222390');ground.addColorStop(.4,'#151c22');ground.addColorStop(1,'#090e14');ctx.fillStyle=ground;ctx.fillRect(0,431,W,109);
 for(let i=0;i<440;i++){let x=((rand(i+910)*5000-cam)%5000+5000)%5000;if(x>W)continue;let y=443+rand(i+391)*100;rect(x,y,2+rand(i+321)*15,1+rand(i+999)*2,['#303636','#3d3c36','#4b4640','#1c2630'][i%4])}
 prop(3,120-cam,462,260);prop(5,400-cam,451,180,.9);prop(4,3780-cam,452,315);
 // The warm flowers at home are the surviving human detail.
 if(cam>2500){glow(3750-cam,397,95,'#c9a25018');if(game.kills===10){ctx.fillStyle='#e3c992';ctx.font='12px Georgia';ctx.textAlign='center';ctx.fillText('ДОМ →',Math.min(895,game.exit-cam),265)}}
 for(const gate of [1350,2200,3530]){let locked=gate===1350?game.enemies.slice(0,3).some(e=>!e.dead):gate===2200?game.enemies.slice(3,6).some(e=>!e.dead):game.enemies.slice(6).some(e=>!e.dead);if(locked){let x=gate-cam;if(x>-60&&x<W+60){for(let i=0;i<8;i++)glow(x+Math.sin(t*2+i)*8,G-i*13,30,'#7b689c09');ctx.strokeStyle='#776f8c40';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<25;i++){let y=G-i*5,x1=x+Math.sin(i*1.8+t*2)*4;i?ctx.lineTo(x1,y):ctx.moveTo(x1,y)}ctx.stroke()}}}
}
function phonePortrait(){return innerHeight>innerWidth}
function fitViewport(){
 if(phonePortrait()&&game.mode==='playing')pause();
 const immersive=innerWidth>=innerHeight;
 const bounds=canvas.getBoundingClientRect();
 const width=immersive&&bounds.height>0?Math.max(1,Math.round(H*bounds.width/bounds.height)):960;
 if(width!==W){W=width;canvas.width=W;}
}
window.addEventListener('resize',fitViewport);
window.visualViewport?.addEventListener('resize',fitViewport);
function render(){fitViewport();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;ctx.save();const intro=game.mode==='intro',cam=intro?Math.sin(clock*.035)*60+100:game.cam;let shake=game.mode==='playing'?game.shake:0;ctx.translate((rand(clock)*2-1)*shake,(rand(clock+2)*2-1)*shake*.4);renderBackground(cam,clock);
 if(intro){let prev=game.player.face;game.player.face=-1;hero(0,745,442);game.player.face=prev}else{for(const ghost of ghosts){hero(7,ghost.x-game.cam,G-ghost.z,ghost.life*.3)}for(const e of game.enemies)enemy(e);let p=game.player;ctx.save();ctx.globalAlpha=.38;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(p.x-game.cam,G+3,28,5,0,0,7);ctx.fill();ctx.restore();let frame=p.transform>0?0:p.evade>0?7:p.attack>.25?4:p.attack>.13?5:p.attack>0?6:p.z>0?2:p.moving?1+Math.floor(p.stride/14)%3:0;hero(frame,p.x-game.cam,G-p.z+(p.moving&&p.z===0?Math.sin(p.stride/14*Math.PI)*.7:Math.sin(clock*2)*.6));
 if(p.attack>0&&p.attack<.25){ctx.save();ctx.translate(p.x-game.cam,G-p.z-(p.lowAttack?23:64));ctx.scale(p.face,1);ctx.strokeStyle=p.power>0?'#b9a0e8':'#f0cf83';ctx.globalAlpha=Math.sin((.25-p.attack)/.25*Math.PI)*.85;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(23,-9,p.lowAttack?58:86,p.lowAttack?12:56,.2,-1.1,1.05);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#fff0ce';ctx.stroke();ctx.restore()}
 if(p.transform>0){const t=1.3-p.transform,x=p.x-game.cam;ctx.fillStyle='rgba(15,7,31,'+(.24*Math.sin(t/1.3*Math.PI))+')';ctx.fillRect(0,0,W,H);glow(x,G-72,150,'#a770d94a');ctx.save();ctx.translate(x,G-58);ctx.strokeStyle='#c5a3ee';ctx.globalAlpha=Math.sin(t/1.3*Math.PI)*.8;ctx.lineWidth=2;for(let i=0;i<3;i++){const r=25+t*70+i*17;ctx.beginPath();ctx.ellipse(0,30,r,r*.3,0,0,Math.PI*2);ctx.stroke()}for(let i=0;i<16;i++){let yy=40-((t*160+i*15)%190);rect(Math.sin(i*2.4+t*4)*45,yy,2,7,'#c2a0f6')}ctx.restore()}
 if(p.counter>0){glow(p.x-game.cam,G-60,65,'#e9c17a22');ctx.strokeStyle='#e2c58c99';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x-game.cam,G+1,31,7,0,0,7);ctx.stroke()}
 if(p.power>0){ctx.fillStyle='#39275113';ctx.fillRect(0,0,W,H);for(let i=0;i<10;i++)glow(p.x-game.cam+Math.sin(clock*5+i)*30,G-p.z-i*8,20,'#9b83c311')}
 }
 renderShots();
 for(const s of particles){rect(s.x-game.cam,s.y,s.size,s.size,s.color)}
 // Foreground framing passes faster than the actor, never covering the central combat area continuously.
 for(const [x,idx,w] of [[-140,0,270],[1190,5,115],[2250,5,110],[3330,5,120],[5100,0,270]])prop(idx,x-cam*1.15,548,w,.55);
 for(let i=0;i<44;i++){let x=((rand(i+55)*1200-clock*(7+rand(i)*10)-cam*.36)%1150+1150)%1150-90,y=(rand(i+35)*560+clock*(3+rand(i+9)*9))%560;rect(x,y,i%7===0?2:1,i%7===0?2:1,i%5===0?'#bc996b85':'#95958a40')}
 ctx.restore();const vignette=ctx.createRadialGradient(W/2,H*.5,H*.18,W/2,H*.5,W*.65);vignette.addColorStop(0,'#050c1300');vignette.addColorStop(1,game.player.inv>.6?'#711e32a8':'#04090fd1');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
}
function events(){for(const e of game.events.splice(0)){if(e.type==='warning'){tone(e.data.type==='spitter'?260:e.data.type==='heavy'?100:180,.13,.035,'triangle',1.3)}else if(e.type==='jump'){noise(.08,.04,1300)}else if(e.type==='perfect'){tone(520,.12,.09,'sine',1.5);$('toast').textContent='ТОЧНЫЙ РЫВОК · КОНТРУДАР ГОТОВ';toastUntil=game.time+1.4}else if(e.type==='parry'){tone(780,.15,.08,'triangle',1.4)}else if(e.type==='reflectedHit'){noise(.08,.12,1800);tone(320,.12,.06,'triangle',.7)}else if(e.type==='break'){noise(.16,.18,1300);$('toast').textContent='СТОЙКА СЛОМАНА';toastUntil=game.time+1.1}else if(e.type==='land'){for(let i=0;i<5;i++)particles.push({x:e.data+(Math.random()-.5)*22,y:G,vx:(Math.random()-.5)*50,vy:-Math.random()*30,life:.2+Math.random()*.2,size:2,color:'#aa967055'})}else if(e.type==='caption'){$('caption').textContent=e.data;captionUntil=game.time+5.5}else if(e.type==='toast'){$('toast').textContent=matchMedia('(pointer: coarse)').matches?e.data.replace('НАЖМИ C','НАЖМИ «НАВЬ»'):e.data;toastUntil=game.time+5}else if(e.type==='sparks'){for(let i=0;i<14;i++)particles.push({x:e.data.x,y:G-60,vx:(Math.random()-.5)*180,vy:-50-Math.random()*130,life:.25+Math.random()*.5,size:i%3?2:3,color:['#ead9ac','#c38863','#a56153','#867794'][i%4]})}else if(e.type==='swing'){noise(.12,.15,3400);tone(160,.13,.05,'triangle',.4)}else if(e.type==='hit'){noise(.12,.3,1000);tone(70,.14,.2,'sine',.45)}else if(e.type==='kill'){tone(180,.5,.06,'triangle',.5)}else if(e.type==='hurt'){noise(.18,.22,450);tone(90,.2,.13,'sawtooth',.4)}else if(e.type==='dodge'){noise(.2,.08,1800)}else if(e.type==='power'){$('toast').textContent='';toastUntil=0;tone(110,1.5,.15,'sawtooth',2);tone(82,2,.08)}else if(e.type==='enemyStrike'){if(e.data.heavy){noise(.18,.16,200);game.shake=Math.max(game.shake,2)}}else if(e.type==='dead'){showMenu('ПУТЬ ОБОРВАЛСЯ','Река помнит твоё имя','Перед ударом враг вспыхивает. Уйди рывком или подпрыгни.');tone(55,2,.1)}else if(e.type==='won'){const m=Math.floor(game.time/60),s=Math.floor(game.time%60).toString().padStart(2,'0');showMenu('ПЕРЕПРАВА ОЧИЩЕНА','В доме никто не ответил.',`10 теней · ${m}:${s} · Точных рывков: ${game.stats.perfectDodges} · Отражено: ${game.stats.parries} · Ударов сверху: ${game.stats.airHits}. Семья не найдена. Путь только начался.`);tone(164.81,2,.06);setTimeout(()=>tone(196,2,.06),300);setTimeout(()=>tone(220,3,.05),700)}}}
function loop(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;if(game.mode!=='paused')clock+=dt;game.tick(dt,{left:keys.has('a'),right:keys.has('d'),attack:keys.has('j'),crouch:keys.has('x')||crouchToggle});events();if(game.mode==='playing'){for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=330*dt;if(p.life<=0)particles.splice(i,1)}for(let i=ghosts.length-1;i>=0;i--){ghosts[i].life-=dt*3;if(ghosts[i].life<=0)ghosts.splice(i,1)}if(game.player.evade>0)ghosts.push({x:game.player.x,z:game.player.z,life:1});if(game.player.moving&&game.player.z===0){footstep+=dt;if(footstep>.32){noise(.035,.06,350);footstep=0;for(let j=0;j<2;j++)particles.push({x:game.player.x-game.player.face*9,y:G-1,vx:-game.player.face*(12+Math.random()*15),vy:-12-Math.random()*16,life:.22,size:2,color:'#9a897044'})}}}
 document.querySelector('[data-key="x"]').classList.toggle('ready',game.player.crouching);document.querySelector('[data-key="x"]').setAttribute('aria-pressed',String(game.player.crouching));document.querySelector('[data-key="Shift"]').style.opacity=game.player.evadeCd>0?'.45':'1';document.querySelector('[data-key="e"]').classList.toggle('ready',game.player.nav>=100||game.player.power>0);
 $('health').style.width=game.player.hp+'%';$('hptext').textContent=Math.ceil(game.player.hp);$('power').style.width=(game.player.power>0?game.player.power/8*100:game.player.nav)+'%';$('hud').classList.toggle('demonic',game.player.power>0);$('powertext').textContent=game.player.transform>0?'ПРЕВРАЩЕНИЕ':game.player.power>0?'ДЕМОН · '+game.player.power.toFixed(1)+' С':game.player.nav>=100?'C · НАВЬ / ЦЕНА: 8 МАКС. HP':'НАВЬ · '+Math.floor(game.player.nav)+' / 100';$('kills').innerHTML=game.kills+' <em>/ 10</em>';$('area').textContent=game.player.x<1350?'ПРИСТАНЬ':game.player.x<2200?'СТАРЫЙ КОЛОДЕЦ':game.kills<10?'ДОРОГА ДОМОЙ':'ВОЗВРАЩЕНИЕ';$('caption').style.opacity=game.time<captionUntil?'1':'0';if(game.time>toastUntil)$('toast').textContent='';render();requestAnimationFrame(loop)}
// Read-only state export for reproducible local browser checks.
window.sabbath={game,keys,ready:()=>ready,render};requestAnimationFrame(loop);
