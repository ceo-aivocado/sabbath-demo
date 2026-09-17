/* Deterministic combat simulation: world coordinates, no renderer or network. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// The first shared horizontal/vertical contact, including entry through a roof.
function segmentEntry(x0,z0,x1,z1,left,right,bottom,top){
 let enter=0,exit=1;
 for(const [start,end,min,max] of [[x0,x1,left,right],[z0,z1,bottom,top]]){
  const delta=end-start;if(delta===0){if(start<min||start>max)return null;continue;}
  const a=(min-start)/delta,b=(max-start)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(enter>exit)return null;
 }
 return enter;
}
const CHAPTERS=typeof module!=='undefined'?require('./chapters.js'):root.SabbathChapters;
const killsBefore=chapter=>CHAPTERS.slice(1,chapter).reduce((sum,c)=>sum+c.types.length,0);
const BUTT={trigger:115,reach:105,height:120,windup:.70,active:.18,recover:1.10,damage:20};
const TYPES={
 cutter:{hp:144,speed:75,reach:76,windup:.60,recover:.80,damage:20},
 crawler:{hp:112,speed:91,reach:205,windup:.70,recover:1.05,damage:23},
 spitter:{hp:128,speed:52,reach:365,windup:.85,recover:1.5,damage:18},
 gunner:{hp:150,speed:58,reach:420,windup:1.05,recover:1.75,damage:22},
 heavy:{hp:300,speed:42,reach:112,windup:.95,recover:1.40,damage:34},
 lancer:{hp:180,speed:68,reach:165,windup:.85,recover:1.10,damage:25},
 captain:{hp:880,speed:62,reach:175,windup:1.05,recover:1.30,damage:29}
};
class SabbathGame{
 constructor(){this.reset()}
 reset(chapter=1,carry={}){
  this.chapter=Number.isInteger(chapter)&&CHAPTERS[chapter]?chapter:1;this.level=CHAPTERS[this.chapter];this.scene=this.level.scene;this.totalKills=carry.totalKills||0;
  this.viewWidth=this.viewWidth||960;this.cameraHeading=1;this.cameraTurn=0;this.cameraReady=false;this.mode='intro';this.time=carry.time||0;this.kills=0;this.cam=0;this.events=[];this.powerUses=0;this.combo=0;this.comboAge=0;this.shake=0;this.hitstop=0;this.projectiles=[];this.looseKnives=[];this.lastDamage=null;this.nextProjectile=0;this.attackTargets=new Set();this.attackBuffer=0;this.jumpBuffer=0;this.stats={hits:0,perfectDodges:0,parries:0,airHits:0,knifeHits:0,damageTaken:0};
  this.player={x:130,z:0,vz:0,hp:100,maxHp:100,nav:0,face:1,attack:0,cooldown:0,evade:0,evadeCd:0,evadeKind:'forward',evadeDir:1,evadeSpeed:590,inv:0,hurtTime:0,moving:false,power:0,transform:0,stride:0,landTime:0,counter:0,knives:3,throwCd:0,throwTime:0,throwPending:0,throwFacing:1,airAttack:false,lowAttack:false,crouching:false,attackHit:false};
  const cfg=this.level;this.gates=cfg.gates.map(([x,ids])=>[x,[...ids]]);
  this.enemies=cfg.types.map((type,i)=>({id:i,type,x:cfg.xs[i],z:0,hp:TYPES[type].hp,maxHp:TYPES[type].hp,heavy:['heavy','captain'].includes(type),bounds:[...cfg.bounds[this.gates.findIndex(g=>g[1].includes(i))]],phase:cfg.buried.includes(i)?'buried':'idle',timer:0,flash:0,face:-1,dead:false,death:0,spawnX:cfg.xs[i],attackNo:0,shotNo:0,staggerGuard:0,broken:0,walk:false,stride:0,hitPlayer:false,lockedFace:-1,move:'thrust',knives:[]}));
  if(cfg.elite){const elite=this.enemies[cfg.elite[0]];elite.hp=elite.maxHp=cfg.elite[1];elite.elite=true;}
  this.barrels=(cfg.barrels||[]).map((x,id)=>({id,x,height:62,halfWidth:24,radius:132,phase:'idle',timer:0,duration:0,smoke:0}));
  this.exit=cfg.exit;this.markers=new Set();this.hazards=(cfg.embers||[]).map((x,i)=>({x,width:58,phase:'cooldown',timer:1.8+i*.75,hitPlayer:false,hitIds:new Set()}));
  if(carry.maxHp){this.player.maxHp=carry.maxHp;this.player.hp=clamp(carry.hp,1,carry.maxHp);this.powerUses=carry.powerUses||0;for(const key of Object.keys(this.stats))this.stats[key]=carry.stats?.[key]||0;}
 }
 start(){this.mode='playing';if(this.cameraInsets)this.tickCamera(0,true);this.emit('caption',this.level.intro);}
 cameraFrame(){
  if(!this.cameraInsets)return null;
  const {left,right}=this.cameraInsets,w=this.viewWidth;
  let low=left+52,high=w-right-52;
  if(high-low<72){const center=clamp((low+high)/2,72,w-72);low=center-36;high=center+36;}
  return {left:low,right:high};
 }
 setCameraInsets(insets){
  this.cameraInsets=insets;
  if(insets&&this.scene!=='house'&&this.mode!=='intro')this.tickCamera(0,true);
 }
 tickCamera(dt,snap=false){
  const p=this.player,frame=this.cameraFrame();
  if(!frame){this.cam+=(clamp(p.x-355,0,this.exit-830)-this.cam)*Math.min(1,dt*4);return;}
  // Follow actual travel/facing, never the sprite's stride or vertical arc.
  if(snap||!this.cameraReady){this.cameraHeading=p.face;this.cameraTurn=0;}
  else if(p.moving&&p.evade===0&&p.face!==this.cameraHeading){this.cameraTurn+=dt;if(this.cameraTurn>=.12){this.cameraHeading=p.face;this.cameraTurn=0;}}
  else this.cameraTurn=0;
  const screenX=frame.left+(frame.right-frame.left)*(this.cameraHeading===1?.2:.8),target=p.x-screenX;
  this.cam=snap||!this.cameraReady?target:this.cam+(target-this.cam)*(1-Math.exp(-8*dt));
  // Even a fast evade cannot carry the body underneath the touch controls.
  this.cam=clamp(this.cam,p.x-frame.right,p.x-frame.left);this.cameraReady=true;
 }
 areaName(){const i=this.gates.findIndex(([x])=>this.player.x<=x);return this.level.areas[i<0?this.level.areas.length-1:i];}
 houseWidth(){return Math.max(1280,this.viewWidth)}
 houseScale(){return this.houseWidth()/1280}
 houseFocus(){
  const p=this.player,w=this.houseWidth(),items=[{id:'cradle',u:.13,title:'ОПРОКИНУТАЯ КОЛЫБЕЛЬ',text:'Пустая. Ни голоса, ни следа. Только рушник на полу.'},{id:'drawing',u:.25,title:'РИСУНОК НА СТЕНЕ',text:'Солнышко. Маленькая фигурка с косой. Здесь её рука ещё ничего не боялась.'},{id:'hearth',u:.47,title:'ОСТЫВШИЙ ОЧАГ',text:'Угли давно почернели. Никто не ждал его у огня.'},{id:'door',u:.89,title:'К СЕЧИ',text:''}];
  return items.map(item=>({...item,x:item.u*w})).filter(item=>Math.abs(item.x-p.x)<90*this.houseScale()).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0]||null;
 }
 openHouse(){
  this.scene='house';this.mode='house';this.kills=0;this.enemies=[];this.projectiles=[];this.looseKnives=[];this.barrels=[];this.hazards=[];this.hitstop=0;this.shake=0;this.attackBuffer=0;this.jumpBuffer=0;this.inspected=new Set();this.lastDamage=null;
  const p=this.player;for(const key of ['z','vz','attack','cooldown','evade','evadeCd','inv','hurtTime','power','transform','nav','counter','throwCd','throwTime','throwPending','landTime'])p[key]=0;p.crouching=false;p.moving=false;p.face=-1;p.x=this.houseWidth()*.82;this.cam=Math.max(0,this.houseWidth()-this.viewWidth);
  this.emit('house');this.emit('caption','Дверь открыта. В доме никто не ответил.');
 }
 enterHouse(){if(this.chapter!==1||this.mode!=='won')return false;this.totalKills+=this.kills;this.player.hp=this.player.maxHp;this.player.knives=3;this.openHouse();this.emit('checkpoint');return true}
 interact(){if(this.mode!=='house')return false;const item=this.houseFocus();if(!item)return false;if(item.id==='door'){const carry=this.checkpoint();this.reset(2,carry);this.emit('chapter');this.start();this.emit('checkpoint');}else{this.inspected.add(item.id);this.emit('inspect',item);}return true}
 tickHouse(dt,input){const p=this.player,axis=Number(!!input.right)-Number(!!input.left),before=p.x,scale=this.houseScale();p.moving=!!axis;if(axis)p.face=axis;p.x=clamp(p.x+axis*185*scale*dt,85*scale,this.houseWidth()-85*scale);p.moving=Math.abs(p.x-before)>.01;p.stride+=Math.abs(p.x-before)/(2.4*scale);this.cam+=(clamp(p.x-this.viewWidth*.45,0,this.houseWidth()-this.viewWidth)-this.cam)*Math.min(1,dt*4);}
 checkpoint(){const next=this.mode==='won'&&this.chapter>=2&&this.chapter<5;return{version:2,scene:this.scene==='house'?'house':CHAPTERS[this.chapter+(next?1:0)].scene,maxHp:this.player.maxHp,hp:next?this.player.maxHp:this.player.hp,totalKills:this.totalKills+(next?this.kills:0),time:this.time,powerUses:this.powerUses,stats:{...this.stats}}}
 advanceChapter(){if(this.mode!=='won'||this.chapter<2||this.chapter>=5)return false;const carry=this.checkpoint();this.reset(this.chapter+1,carry);this.emit('chapter');this.start();this.emit('checkpoint');return true}
 restoreCheckpoint(data){
  if(!data||![1,2].includes(data.version))return false;const chapter=data.scene==='house'?1:CHAPTERS.findIndex(c=>c?.scene===data.scene);
  if(chapter<1||data.scene==='riverside'||data.version===1&&!['house','sich'].includes(data.scene)||!Number.isFinite(data.maxHp)||data.maxHp<60||data.maxHp>100||!Number.isFinite(data.hp)||data.hp<=0||data.hp>data.maxHp||data.totalKills!==(data.scene==='house'?10:killsBefore(chapter))||!Number.isFinite(data.time)||data.time<0||data.time>1e7||!Number.isInteger(data.powerUses)||data.powerUses<0||data.powerUses>1000)return false;
  const stats={};for(const key of ['hits','perfectDodges','parries','airHits','knifeHits','damageTaken']){const n=data.stats?.[key];if(!Number.isFinite(n)||n<0||n>1e7)return false;stats[key]=n;}
  this.reset(chapter,{...data,stats});if(data.scene==='house')this.openHouse();else this.start();return true;
 }

 emit(type,data){this.events.push({type,data})}
 charge(amount){const p=this.player,was=p.nav>=100;p.nav=clamp(p.nav+amount,0,100);if(!was&&p.nav===100&&p.power===0)this.emit('toast','НАВЬ ПРОСНУЛАСЬ. НАЖМИ D — ПРЕВРАТИТЬСЯ.')}
 attack(){
  const p=this.player;if(this.mode!=='playing')return false;
  if(p.cooldown>0||p.evade>0||p.throwPending>0){this.attackBuffer=Math.max(.14,Math.min(.24,p.evade+.03));return false}
  p.throwTime=0;this.combo=this.comboAge<.95?this.combo%3+1:1;this.comboAge=0;
  p.counterAttack=p.counter>0;p.airAttack=p.z>0||p.vz>0;p.lowAttack=p.crouching&&!p.airAttack;p.attack=p.airAttack?.38:.34;p.cooldown=p.airAttack?.48:([0,.34,.39,.58][this.combo]);p.attackHit=false;p.attackFacing=p.face;this.attackTargets.clear();
  if(p.airAttack&&p.vz<=0)p.vz=Math.min(p.vz,-190);this.attackBuffer=0;this.emit('swing',p.airAttack?'air':this.combo);return true;
 }
 syncAttackStance(){
  const p=this.player;if(p.attack<=0)return;
  const airborne=p.z>0||p.vz>0,low=p.crouching&&!airborne;
  // A landing keeps an aerial cleave intact. A deliberate duck changes stance.
  if(p.airAttack&&!low)return;
  if(!p.airAttack&&p.lowAttack===low&&!airborne)return;
  // Redirect an uncommitted windup, never restart its timing or hit history.
  // Once active, defensive movement cancels the remaining blade instead.
  if(p.attack>.22){p.airAttack=airborne;p.lowAttack=low;}else p.attack=0;
 }
 resolveAttack(){
  const p=this.player;p.attackHit=true;const finisher=this.combo===3,reach=p.lowAttack?82:p.counterAttack?132:p.airAttack?104:finisher?120:104;let hits=0;
  for(const shot of this.projectiles){if(shot.dead||shot.friendly||shot.kind!=='spit'||Math.abs(shot.x-p.x)>reach||(shot.x-p.x)*p.attackFacing<-15||Math.abs(shot.z-(p.z+(p.lowAttack?24:55)))>(p.lowAttack?25:65))continue;shot.friendly=true;shot.vx=p.attackFacing*420;shot.life=1.4;shot.damage=40;shot.x=p.x+p.attackFacing*30;this.charge(10);this.stats.parries++;this.emit('parry',{x:shot.x,z:shot.z})}
  for(const e of this.enemies){if(e.dead||e.phase==='buried'||e.phase==='emerge'&&e.timer>.65||this.attackTargets.has(e.id)||Math.abs(e.x-p.x)>reach||(e.x-p.x)*p.attackFacing<-20||p.z>(p.airAttack?140:75))continue;
   const backBreak=e.heavy&&e.phase==='windup'&&e.broken===0&&(p.x-e.x)*e.lockedFace<-20;
   const armored=e.heavy&&e.phase==='windup'&&e.broken===0&&(p.x-e.x)*e.face>0;
   let damage=p.lowAttack?(e.type==='crawler'?46:23):p.airAttack?42:[0,25,31,48][this.combo];const breaking=p.airAttack||(!p.lowAttack&&finisher)||p.counter>0||backBreak;
   if(armored&&!breaking){damage*=.3;this.emit('armor',e.x)}
   if(e.phase==='recover'||e.broken>0)damage*=1.25;if(p.counter>0)damage*=1.7;if(p.power>0)damage*=1.5;
   if(armored&&breaking||backBreak){e.broken=1.4;this.emit('break',e.x)}
   this.attackTargets.add(e.id);if(!armored||breaking)this.dislodgeKnives(e,breaking?Infinity:1,Math.sign(p.x-e.x)||-p.attackFacing);this.damageEnemy(e,damage,{stagger:!armored||breaking,finisher:breaking});this.moveEnemy(e,p.attackFacing*(e.heavy?5:finisher?23:10),false);hits++;if(p.airAttack)this.stats.airHits++;
  }
  for(const b of this.barrels)if(b.phase==='idle'&&Math.abs(b.x-p.x)<=reach+b.halfWidth&&(b.x-p.x)*p.attackFacing>=-b.halfWidth&&p.z<=(p.airAttack?68:48))this.armBarrel(b,'sabre');
  if(hits){p.counter=0;this.stats.hits+=hits;this.charge(20*hits);this.hitstop=finisher?.065:.035;this.shake=finisher?3:1.5;this.emit('hit',hits)}
 }
 damageEnemy(e,d,options={}){
  if(e.dead)return;e.hp=Math.max(0,e.hp-d);e.flash=.14;this.emit('sparks',{x:e.x,heavy:e.heavy});
  if(e.hp<=0){this.dislodgeKnives(e,Infinity);e.dead=true;e.death=1;e.phase='dead';e.waveTotal=0;e.waveIndex=0;this.kills++;if(this.kills%3===0)this.player.knives=Math.min(3,this.player.knives+1);if(this.player.hp>0)this.player.hp=clamp(this.player.hp+2,0,this.player.maxHp);this.emit('kill',e.x)}
  else if(options.stagger!==false&&e.phase!=='strike'&&(!e.heavy||options.finisher)&&(e.staggerGuard<=0||options.finisher)){e.phase='hurt';e.volley=0;e.waveTotal=0;e.waveIndex=0;e.timer=options.finisher?.42:.18;e.staggerGuard=1.1}
 }
 dodge(kind='forward'){
  const p=this.player;if(this.mode!=='playing'||p.evadeCd>0||p.attack>.22||(kind==='back'&&p.z>0))return false;
  const threat=this.enemies.some(e=>{
   if(e.dead||e.phase!=='windup'||e.timer>=.25)return false;
   if(e.type==='captain'&&e.move==='wave')return p.z<35&&Math.abs(e.x-p.x)<TYPES.captain.reach+35;
   if(e.type==='heavy'){const distance=Math.abs(e.x-p.x),wave=p.z<35&&distance<TYPES.heavy.reach+35,axe=(e.waveIndex||0)===0&&p.z<70&&distance<TYPES.heavy.reach&&(p.x-e.x)*e.lockedFace>=-24;return wave||axe;}
   if(['lancer','captain'].includes(e.type)&&e.move==='thrust'&&p.crouching)return false;
   return (p.x-e.x)*e.lockedFace>=-24&&(e.type==='gunner'&&e.move==='butt'?p.z<BUTT.height&&Math.abs(e.x-p.x)<BUTT.reach:Math.abs(e.x-p.x)<TYPES[e.type].reach+35);
  })||this.projectiles.some(s=>!s.dead&&!s.friendly&&Math.abs(s.x-p.x)<95&&s.vx*(p.x-s.x)>0&&(s.kind==='wave'?p.z<35:Math.abs(s.z-(p.z+(p.crouching?26:52)))<(p.crouching?26:39)))||this.barrels.some(b=>b.phase==='fuse'&&b.timer<.20&&Math.abs(b.x-p.x)<=b.radius&&p.z<68);
  this.cancelThrow();p.crouching=false;p.landTime=0;p.evadeKind=kind;p.evadeDir=p.face*(kind==='back'?-1:1);p.evadeSpeed=kind==='back'?360:590;p.evade=kind==='back'?.18:.23;p.evadeCd=kind==='back'?.48:.70;p.inv=kind==='back'?.13:.26;p.attack=0;p.cooldown=Math.min(p.cooldown,.14);
  if(threat){p.counter=1.6;this.charge(25);this.stats.perfectDodges++;this.emit('perfect',p.x)}this.emit('dodge',kind);return true;
 }
 jump(){const p=this.player;if(this.mode!=='playing')return false;if(p.z===0&&p.vz<=0){p.crouching=false;p.landTime=0;p.vz=450;this.syncAttackStance();this.jumpBuffer=0;this.emit('jump');return true}this.jumpBuffer=.12;return false}
 knife(){const p=this.player;if(this.mode!=='playing'||p.throwCd>0||p.knives<=0||p.evade>0||p.attack>.22)return false;p.knives--;p.throwCd=.65;p.throwTime=.30;p.throwPending=.10;p.throwFacing=p.face;return true}
 releaseKnife(){const p=this.player;this.projectiles.push({id:this.nextProjectile++,kind:'dagger',friendly:true,recoverable:true,x:p.x+p.throwFacing*34,z:p.z+(p.crouching?30:83),vx:p.throwFacing*700,vz:30,life:.8,damage:55,dead:false});this.emit('throw',p.x)}
 dropKnife(x,z,knife,side=1,vz=65){
  const floor=6;this.looseKnives.push({id:knife.id,x:clamp(x,40,this.exit+60),z:Math.max(floor,z),vx:side*75,vz,age:0,settled:z<=floor});
 }
 dislodgeKnives(e,count=Infinity,side=0){
  const knives=(e.knives||[]).splice(0,count);
  for(const [i,k] of knives.entries()){const direction=side||k.side*e.face;this.dropKnife(e.x+direction*18,k.z,k,direction,55+i*15);}
  if(knives.length)this.emit('knifeLoose',{x:e.x,count:knives.length});
 }
 recoverProjectile(s,x,z,side=Math.sign(s.vx),vz=35){
  if(!s.recoverable||s.recovered)return;s.recovered=true;this.dropKnife(x,z,s,side,vz);
 }
 tickKnives(dt,beforeX=this.player.x,beforeZ=this.player.z){
  if(dt<=0||this.mode!=='playing'||this.player.hp<=0)return;
  const p=this.player;let picked=0;
  for(const k of this.looseKnives){
   k.age+=dt;
   if(!k.settled){
    const nextZ=k.z+k.vz*dt-190*dt*dt;
    const step=nextZ<6?dt*(k.z-6)/(k.z-nextZ):dt;
    k.x=clamp(k.x+k.vx*step,40,this.exit+60);k.z=Math.max(6,nextZ);k.vz-=380*dt;
    if(nextZ<=6){k.settled=true;k.vx=0;k.vz=0;}continue;
   }
   if(p.knives<3&&k.age>=.12&&segmentEntry(beforeX,beforeZ,p.x,p.z,k.x-28,k.x+28,0,24)!==null){k.picked=true;p.knives++;picked++;}
  }
  this.looseKnives=this.looseKnives.filter(k=>!k.picked);
  if(picked)this.emit('knifePickup',{x:p.x,count:picked});
 }
 cancelThrow(){const p=this.player;if(p.throwPending>0)p.knives=Math.min(3,p.knives+1);p.throwPending=0;p.throwTime=0}

 power(){const p=this.player;if(this.mode!=='playing'||p.nav<100||p.power>0)return false;p.nav=0;p.power=8;p.transform=.65;p.maxHp=Math.max(60,p.maxHp-8);p.hp=Math.min(p.hp,p.maxHp);this.powerUses++;this.shake=2;this.emit('power');this.emit('caption','Навь в крови. Не останавливайся.');return true}

 hurt(d,source={}){
  const p=this.player;if(p.inv>0||this.mode!=='playing')return false;const before=p.hp;p.hp=Math.max(0,p.hp-d);
  const side=source.direction?-Math.sign(source.direction):Math.sign((source.x??p.x+p.face)-p.x)||p.face;
  this.lastDamage={poseUntil:.18,kind:source.kind||'melee',enemyType:source.enemyType||null,move:source.move||null,low:!!source.low,side,x:p.x+side*14,z:source.z??p.z+(p.crouching?26:60),damage:before-p.hp};
  p.hurtTime=.18;p.inv=.62;p.attack=0;this.cancelThrow();this.attackBuffer=0;this.shake=4;this.combo=0;this.stats.damageTaken+=d;this.emit('hurt',{...this.lastDamage});if(p.hp===0){this.mode='dead';this.emit('dead')}return true;
 }
 deathAdvice(){
  const h=this.lastDamage;if(!h)return 'Перед ударом враг готовит замах. Уйди рывком и ответь, пока он восстанавливается.';
  if(h.kind==='ember')return 'Угли под ногами. Свет предупреждает о вспышке: перепрыгни огонь или выйди из него.';
  if(h.kind==='blast')return 'Пороховой взрыв. Выйди за светлый круг или прыгни перед взрывом. Приседание не защищает.';
  if(h.kind==='wave')return 'Волна по земле. Перепрыгни её; приседание от волны не защищает.';
  if(h.kind==='lead')return h.low?'Низкий выстрел. Перепрыгни линию прицела или пройди её рывком.':'Высокий выстрел. Присядь под линией прицела; кортик прерывает подготовку.';
  if(h.kind==='spit')return 'Сгусток Нави. Присядь под ним или отбей его саблей.';
  if(h.enemyType==='gunner'&&h.move==='butt')return 'Удар прикладом. Отскочи или проскочи за спину во время замаха. Приседание не спасает.';
  if(['lancer','captain'].includes(h.enemyType))return h.move==='thrust'?'Высокий укол. Присядь под остриём и ответь низким ударом.':h.move==='sweep'?'Подсечка копьём. Перепрыгни остриё и ударь сверху.':'Тяжёлый удар сверху. Пройди рывком за спину, пока оружие поднято.';
  if(h.enemyType==='crawler')return 'Бросок ползуна. Перепрыгни его и ударь сверху.';
  if(h.enemyType==='heavy')return 'Удар утопленника. Отскочи от топора; следующую волну перепрыгни.';
  return 'Рубящий удар. Уйди рывком на замахе и бей во время восстановления.';
 }
 spawnShot(e,kind,direction){if(kind==='lead'){this.projectiles.push({id:this.nextProjectile++,kind,x:e.x+direction*85,z:e.shotLow?48:88,vx:direction*510,life:1.25,damage:22,dead:false});this.emit('gunshot',{x:e.x+direction*85,z:e.shotLow?48:88,face:direction});return;}this.projectiles.push({id:this.nextProjectile++,kind,x:e.x+direction*30,z:kind==='wave'?8:82,vx:direction*(kind==='wave'?240:210),life:kind==='wave'?1.15:2.8,damage:kind==='wave'?25:18,dead:false});}
 beginEnemy(e){if(['lancer','captain'].includes(e.type)){this.beginGuard(e);return;}const cfg=TYPES[e.type];
  if(e.type==='gunner'){e.move=Math.abs(this.player.x-e.x)<BUTT.trigger?'butt':'shot';e.volley=0;if(e.move==='shot')e.shotNo=(e.shotNo||0)+1;}
  // Fix the complete heavy sequence before the first visible windup.
  e.waveTotal=e.type==='heavy'?(e.enraged?2:1):0;e.waveIndex=0;
  const butt=e.type==='gunner'&&e.move==='butt';e.phase='windup';e.timer=(butt?BUTT.windup:cfg.windup)*(e.enraged?.75:1);e.windupDuration=e.timer;e.lockedFace=e.face;e.attackNo++;e.shotLow=e.type==='gunner'&&!butt&&e.shotNo%2===0;e.walk=false;e.hitPlayer=false;this.emit('warning',{x:e.x,type:e.type,move:e.move,low:!!e.shotLow,enraged:!!e.enraged});
  const marker=butt?'gunner-butt':e.type;if(!this.markers.has(marker)){this.markers.add(marker);const tips={'gunner-butt':'ПРИКЛАД: отскочи или зайди за спину.',gunner:'СТРЕЛОК: высокий выстрел — присядь; низкий — прыгни. Кортик сбивает прицел.',cutter:'Вспышка перед ударом. Рывок в последний момент усиливает ответ.',crawler:'ПОЛЗУН: низкий бросок. Перепрыгни и ударь сверху.',spitter:'ПЛЕВУН: присядь под сгустком или отбей его саблей.',heavy:'УТОПЛЕННИК: перепрыгни волну. После удара он уязвим.'};this.emit('caption',tips[marker])}
 }
 beginGuard(e){
  const captain=e.type==='captain';e.move=captain?(e.enraged?['wave','thrust','slam','wave']:['thrust','slam','wave'])[e.attackNo%(e.enraged?4:3)]:(e.attackNo%2?'sweep':'thrust');e.attackNo++;e.lockedFace=e.face;e.phase='windup';e.hitPlayer=false;e.walk=false;
  // Commit the whole sequence before its first tell. Crossing half health can
  // affect the next attack, never add an unannounced wave to this one.
  e.waveTotal=captain&&e.move==='wave'?(e.enraged?2:1):0;e.waveIndex=0;
  e.timer=(captain?(e.move==='slam'?1.1:e.move==='wave'?1.05:.85):.85)*(e.enraged?.88:1);e.windupDuration=e.timer;this.emit('warning',{x:e.x,type:e.type,move:e.move,low:!!e.shotLow,enraged:!!e.enraged});
  if(!this.markers.has(e.type)){this.markers.add(e.type);this.emit('caption',captain?'СОТНИК: укол — вниз; волна — прыжок; замах сверху — рывок за спину.':'КОПЕЙЩИК: под высоким уколом присядь. Низкий подсек — перепрыгни.');}
 }
 bodyRadius(e){return e.heavy?80:e.type==='crawler'?48:e.type==='gunner'?42:40;}
 enemyBody(e){return !e.dead&&!['buried','emerge'].includes(e.phase)&&!(e.phase==='strike'&&(e.type==='crawler'||['lancer','captain'].includes(e.type)&&e.move==='thrust'));}
 moveEnemy(e,delta,walking=true){
  const before=e.x,dir=Math.sign(delta);let next=clamp(before+delta,...e.bounds);
  // A voluntary step (or blade recoil) moves this body only. Committed attacks
  // and recovery poses are never passively pushed by somebody else's feet.
  const block=(x,gap,side)=>{if(side!==dir)return;const limit=x-dir*gap;
   next=dir>0?Math.min(next,Math.max(before,limit)):Math.max(next,Math.min(before,limit));};
  if(dir){
   for(const other of this.enemies)if(other!==e&&this.enemyBody(other))block(other.x,this.bodyRadius(e)+this.bodyRadius(other),Math.sign(other.x-before)||(other.id>e.id?1:-1));
   const p=this.player;if(p.z<35&&p.evade<=0)block(p.x,e.heavy?42:28,Math.sign(p.x-before)||-e.face);
  }
  e.x=clamp(next,...e.bounds);if(walking)e.walk=Math.abs(e.x-before)>.001;return e.x-before;
 }
 yieldEnemy(e,dt){
  let penetration=.25,direction=0;
  for(const other of this.enemies)if(other!==e&&this.enemyBody(other)){
   const depth=this.bodyRadius(e)+this.bodyRadius(other)-Math.abs(other.x-e.x);
   if(depth>penetration){penetration=depth;direction=-(Math.sign(other.x-e.x)||(other.id>e.id?1:-1));}
  }
  const p=this.player,depth=(e.heavy?42:28)-Math.abs(p.x-e.x);
  if(p.z<35&&p.evade<=0&&depth>penetration){penetration=depth;direction=Math.sign(e.x-p.x)||-e.face;}
  if(!direction)return false;
  this.moveEnemy(e,direction*Math.min(penetration+.5,TYPES[e.type].speed*.8*dt));return true;
 }
 tickGuard(e,dt){
  const p=this.player,cfg=TYPES[e.type],captain=e.type==='captain';e.flash=Math.max(0,e.flash-dt);e.broken=Math.max(0,e.broken-dt);e.staggerGuard=Math.max(0,e.staggerGuard-dt);e.walk=false;
  if(e.dead){e.death=Math.max(0,e.death-dt*.8);e.waveTotal=0;e.waveIndex=0;return;}
  if(captain&&!e.enraged&&e.hp<e.maxHp*.5){e.enraged=true;this.emit('caption','СОТНИК В ЯРОСТИ. Берегись двойных волн.');}
  e.timer-=dt;
  if(e.phase==='hurt'){if(e.timer<=0){e.phase='recover';e.timer=.4;}return;}
  if(e.phase==='windup'&&e.timer<=0){e.phase='strike';e.timer=e.move==='thrust'?.30:.20;e.face=e.lockedFace;
   if(e.move==='wave'){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);e.waveIndex=(e.waveIndex||0)+1;}
   if(e.move==='slam'||e.move==='sweep')this.strikeBarrels(e,e.move==='slam'?125:145);
   this.emit('enemyStrike',{x:e.x,heavy:captain,type:e.type});
  }
  if(e.phase==='strike'){
   if(e.move==='thrust')e.x+=e.lockedFace*(captain?225:210)*dt;
   const front=(p.x-e.x)*e.lockedFace>=-20,range=e.move==='slam'?125:145;
   const vertical=e.move==='thrust'?Math.abs(83-(p.z+(p.crouching?26:52)))<(p.crouching?26:39):e.move==='sweep'?p.z<38:p.z<145;
   if(e.move!=='wave'&&!e.hitPlayer&&front&&Math.abs(p.x-e.x)<range&&vertical){this.hurt(cfg.damage+(e.move==='slam'?5:0),{x:e.x,enemyType:e.type,move:e.move});e.hitPlayer=true;}
   if(e.timer<=0){
    if(captain&&e.move==='wave'&&e.waveIndex<e.waveTotal){e.phase='windup';e.timer=e.windupDuration=.30;this.emit('warning',{x:e.x,type:e.type,move:e.move,low:true,enraged:true,followup:true});}
    else{e.phase='recover';e.timer=captain?(e.move==='slam'?1.55:e.move==='wave'?1.35:1.25):1.10;}
   }return;
  }
  if(e.phase==='recover'){if(e.timer<=0)e.phase='idle';else return;}
  const distance=Math.abs(p.x-e.x);if(e.phase!=='idle'||distance>470)return;e.face=e.x>p.x?-1:1;
  if(this.yieldEnemy(e,dt))return;
  const onScreen=e.x>=this.cam+24&&e.x<=this.cam+this.viewWidth-24;
  if(distance>cfg.reach-14||!onScreen){this.moveEnemy(e,e.face*cfg.speed*dt);}else if(this.enemies.filter(n=>!n.dead&&['windup','strike'].includes(n.phase)).length<2)this.beginGuard(e);
 }
 tickHazards(dt){
  const p=this.player;for(const h of this.hazards){const visible=h.x>=this.cam-60&&h.x<=this.cam+this.viewWidth+60&&Math.abs(h.x-p.x)<420;
   if(!visible){h.phase='cooldown';h.timer=Math.max(h.timer,1.5);continue;}
   h.timer-=dt;
   if(h.phase==='cooldown'&&h.timer<=0){h.phase='warning';h.timer=1.15;h.hitPlayer=false;h.hitIds.clear();this.emit('emberWarning',h.x);}
   else if(h.phase==='warning'&&h.timer<=0){h.phase='active';h.timer=.55;this.emit('emberBurst',h.x);}
   else if(h.phase==='active'){
    if(!h.hitPlayer&&Math.abs(p.x-h.x)<h.width&&p.z<38){this.hurt(23,{kind:'ember',x:h.x,z:12});h.hitPlayer=true;}
    if(this.mode!=='playing')return;
    for(const e of this.enemies)if(!e.dead&&!['buried','emerge'].includes(e.phase)&&!h.hitIds.has(e.id)&&Math.abs(e.x-h.x)<h.width+16){h.hitIds.add(e.id);this.damageEnemy(e,65,{stagger:false});}
    if(h.timer<=0){h.phase='cooldown';h.timer=4.2;}
   }
  }
 }
 armBarrel(b,source='sabre',duration=1.15){
  if(this.mode!=='playing'||b.phase!=='idle')return false;
  b.phase='fuse';b.timer=b.duration=duration;b.source=source;this.emit('barrelFuse',{x:b.x,duration});
  if(!this.markers.has('powderFuse')){this.markers.add('powderFuse');this.emit('caption','ПОРОХ! За круг — или прыгай.');}return true;
 }
 strikeBarrels(e,reach){for(const b of this.barrels)if(b.phase==='idle'&&Math.abs(b.x-e.x)<=reach+b.halfWidth&&(b.x-e.x)*e.lockedFace>=-b.halfWidth)this.armBarrel(b,'enemy');}
 detonateBarrel(b){
  if(b.phase!=='fuse')return;b.phase='burst';b.timer=.34;b.smoke=3;const p=this.player;
  // Both sides take the same blast. A dead player cannot be revived by its kills.
  if(Math.abs(p.x-b.x)<=b.radius&&p.z<68)this.hurt(30,{kind:'blast',x:b.x,z:35});
  for(const e of this.enemies)if(!e.dead&&!['buried','emerge'].includes(e.phase)&&Math.abs(e.x-b.x)<=b.radius){e.broken=1.4;this.damageEnemy(e,165,{stagger:true,finisher:true});}
  for(const other of this.barrels)if(other!==b&&Math.abs(other.x-b.x)<=b.radius+other.halfWidth)this.armBarrel(other,'chain',.70);
  if(b.x>=this.cam-80&&b.x<=this.cam+this.viewWidth+80){this.shake=Math.max(this.shake,5);this.hitstop=Math.max(this.hitstop,.045);}this.emit('barrelBlast',{x:b.x,radius:b.radius});
 }
 tickBarrels(dt){
  const due=[];for(const b of this.barrels){b.smoke=Math.max(0,b.smoke-dt);if(b.phase==='fuse'){b.timer-=dt;if(b.timer<=0)due.push(b);}else if(b.phase==='burst'){b.timer-=dt;if(b.timer<=0)b.phase='spent';}}
  for(const b of due)this.detonateBarrel(b);
  if(!this.markers.has('powder')&&this.barrels.some(b=>b.phase==='idle'&&Math.abs(b.x-this.player.x)<260)&&!this.enemies.some(e=>!e.dead&&Math.abs(e.x-this.player.x)<160)){this.markers.add('powder');this.emit('caption','ПОРОХ: ударь и отойди. Присед + кортик — поджечь издали.');}
 }
 tickProjectiles(dt){
  if(dt<=0)return;
  const p=this.player;for(const s of this.projectiles){if(s.dead)continue;const step=Math.min(dt,Math.max(0,s.life));if(step===0||s.kind==='dagger'&&s.z<6){s.dead=true;if(s.kind==='dagger')this.recoverProjectile(s,s.x,s.z,Math.sign(s.vx),Math.min(s.vz||0,0));continue;}const old=s.x,oldZ=s.z;s.x+=s.vx*step;s.life-=dt;if(s.kind==='dagger'){s.z+=s.vz*step-190*step*step;s.vz-=380*step;}
   const targets=[];
   const add=(kind,target,radius,bottom,top)=>{const t=segmentEntry(old,oldZ,s.x,s.z,target.x-radius,target.x+radius,Math.max(bottom,s.kind==='dagger'?6:-Infinity),top);if(t!==null)targets.push({kind,target,t});};
   if(s.friendly){for(const e of this.enemies)if(!e.dead&&e.phase!=='buried'&&!(e.phase==='emerge'&&e.timer>.65))add('enemy',e,20,0,e.heavy?160:e.type==='crawler'?82:140);}
   else if(s.kind==='wave'){if(p.z<35)add('player',p,19,-Infinity,Infinity);}
   else{const center=p.z+(p.crouching?26:52),half=p.crouching?26:39;add('player',p,19,center-half,center+half);}
   if(s.kind!=='wave')for(const b of this.barrels)if(b.phase==='idle'||b.phase==='fuse')add('barrel',b,b.halfWidth,0,b.height);
   targets.sort((a,b)=>a.t-b.t||Number(a.kind!=='barrel')-Number(b.kind!=='barrel'));const hit=targets[0];
   if(hit){
    if(s.kind==='dagger'&&s.recoverable&&!s.recovered){
     const x=old+(s.x-old)*hit.t,z=oldZ+(s.z-oldZ)*hit.t;
     if(hit.kind==='enemy'){
      const e=hit.target;s.recovered=true;(e.knives||(e.knives=[])).push({id:s.id,side:-Math.sign(s.vx)*e.face,z:e.type==='crawler'?34:e.type==='spitter'?60:e.heavy?83:72});
      if(e.hp>s.damage&&!this.markers.has('knife-recovery')){this.markers.add('knife-recovery');this.emit('caption','КОРТИК ЗАСТРЯЛ. Удар саблей выбьет клинок. Подбери его с земли.');}
     }else this.recoverProjectile(s,x,z,-Math.sign(s.vx));
    }
    s.dead=true;if(hit.kind==='barrel')this.armBarrel(hit.target,'shot');else if(hit.kind==='player')this.hurt(s.damage,{kind:s.kind,direction:s.vx,low:s.z<70,z:oldZ+(s.z-oldZ)*hit.t});else{if(s.kind==='dagger')this.stats.knifeHits++;this.damageEnemy(hit.target,s.damage,{stagger:true});this.emit('reflectedHit',hit.target.x);}}
   if(s.life<=0||s.kind==='dagger'&&s.z<6){
    if(s.kind==='dagger'&&!s.dead){const t=s.z<6?clamp((oldZ-6)/(oldZ-s.z),0,1):1;this.recoverProjectile(s,old+(s.x-old)*t,oldZ+(s.z-oldZ)*t,Math.sign(s.vx),Math.min(s.vz,0));}s.dead=true;
   }
  }this.projectiles=this.projectiles.filter(s=>!s.dead);
 }
 tickEnemy(e,dt){
  if(['lancer','captain'].includes(e.type)){this.tickGuard(e,dt);return;}
  const p=this.player,cfg=TYPES[e.type];if(e.phase==='buried'){if(Math.abs(e.x-p.x)<430){e.phase='emerge';e.timer=1.1;this.emit('rise',{x:e.x,heavy:e.heavy})}return}if(e.phase==='emerge'){e.timer-=dt;if(e.timer<=0){e.phase='idle';e.timer=0}return}e.flash=Math.max(0,e.flash-dt);e.broken=Math.max(0,e.broken-dt);e.staggerGuard=Math.max(0,(e.staggerGuard||0)-dt);if(e.elite&&!e.enraged&&e.hp<e.maxHp*.5){e.enraged=true;this.emit('caption','СТРАЖ В ЯРОСТИ. Следующая серия — две волны.');}e.walk=false;if(e.dead){e.death=Math.max(0,e.death-dt*.8);return}
  const dist=Math.abs(e.x-p.x);e.timer-=dt;if(!e.heavy&&e.phase!=='windup'&&e.phase!=='strike')e.face=e.x>p.x?-1:1;
  if(e.volley>0){e.volley-=dt;if(e.volley<=0)this.spawnShot(e,'lead',e.lockedFace);}
  if(e.phase==='hurt'){if(e.timer<=0){e.phase='recover';e.timer=.3}return}
  if(e.phase==='windup'&&e.timer<=0){e.phase='strike';e.timer=e.type==='crawler'?.40:e.type==='gunner'&&e.move==='butt'?BUTT.active:.18;e.face=e.lockedFace;
   if(e.type==='gunner'&&e.move!=='butt'){this.spawnShot(e,'lead',e.face);e.volley=.18;e.timer=.32;}
   if(e.type==='spitter')this.spawnShot(e,'spit',e.face);
   if(e.heavy){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);e.waveIndex=(e.waveIndex||0)+1;}
   if(e.heavy&&e.waveIndex===1||e.type==='cutter')this.strikeBarrels(e,cfg.reach);
   this.emit('enemyStrike',{x:e.x,heavy:e.heavy,type:e.type});
  }
  if(e.phase==='strike'){
   if(e.type==='crawler')e.x+=e.lockedFace*395*dt;
   const butt=e.type==='gunner'&&e.move==='butt',front=(p.x-e.x)*e.lockedFace>=-24,range=butt?BUTT.reach:e.type==='crawler'?57:cfg.reach;
   if((butt||!['spitter','gunner'].includes(e.type))&&!(e.heavy&&e.waveIndex>1)&&!e.hitPlayer&&Math.abs(p.x-e.x)<range&&front&&p.z<(butt?BUTT.height:e.type==='crawler'?42:70)){this.hurt(butt?BUTT.damage:cfg.damage,{x:e.x,enemyType:e.type,move:e.move});e.hitPlayer=true}
   if(e.timer<=0){
    if(e.heavy&&e.waveIndex<e.waveTotal){e.phase='windup';e.timer=e.windupDuration=.30;this.emit('warning',{x:e.x,type:e.type,move:'wave',low:true,enraged:true,followup:true});}
    else{e.phase='recover';e.timer=butt?BUTT.recover:cfg.recover;}
   }return;
  }
  if(e.phase==='recover'){if(e.timer<=0)e.phase='idle';else return}
  if(e.phase!=='idle'||dist>470)return;e.face=e.x>p.x?-1:1;
  if(this.yieldEnemy(e,dt))return;
  const onScreen=e.x>=this.cam+24&&e.x<=this.cam+this.viewWidth-24;
  const active=this.enemies.filter(n=>!n.dead&&(n.phase==='windup'||n.phase==='strike')).length;
  if(e.type==='gunner'&&dist<BUTT.trigger&&onScreen){if(active<2)this.beginEnemy(e);return;}
  if(['spitter','gunner'].includes(e.type)&&dist<180&&onScreen&&Math.abs(this.moveEnemy(e,-e.face*cfg.speed*.8*dt))>.001)return;
  if(dist>cfg.reach-14||!onScreen){this.moveEnemy(e,e.face*cfg.speed*dt)}else if(active<2)this.beginEnemy(e);
 }
 tick(dt,input={}){
  dt=clamp(dt,0,.05);if(this.mode==='house'){this.tickHouse(dt,input);return;}if(this.mode!=='playing')return;const p=this.player;
  p.crouching=!!input.crouch&&p.z===0&&p.vz<=0&&p.evade===0;this.syncAttackStance();
  if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);return}
  this.time+=dt;this.comboAge+=dt;if(p.transform>0){p.transform=Math.max(0,p.transform-dt);if(p.transform===0)this.emit('transformed');}
  this.shake=Math.max(0,this.shake-dt*15);for(const k of ['attack','cooldown','evade','evadeCd','inv','hurtTime','power','counter','throwCd','throwTime','landTime'])p[k]=Math.max(0,p[k]-dt);
  if(p.throwPending>0){p.throwPending=Math.max(0,p.throwPending-dt);if(p.throwPending===0)this.releaseKnife();}
  if(p.attack>.08&&p.attack<=.22)this.resolveAttack();
  const axis=(input.right?1:0)-(input.left?1:0),beforeX=p.x,beforeZ=p.z;p.moving=!!axis&&p.attack<.12;
  if(axis&&p.evade<=0&&p.attack<=0&&p.throwTime===0)p.face=axis;
  if(p.evade>0){p.x+=p.evadeDir*p.evadeSpeed*dt;if(p.evadeKind==='back'){for(const e of this.enemies){if(e.dead||e.phase==='buried'||e.phase==='emerge')continue;const side=Math.sign(e.x-beforeX),radius=e.heavy?42:28;if(side===p.evadeDir&&(e.x-p.x)*side<radius&&Math.abs(e.x-beforeX)<radius+p.evadeSpeed*dt+1)p.x=e.x-side*radius;}}}else if(p.moving)p.x+=axis*(p.crouching?62:p.power>0?190:158)*dt;
  if(axis&&p.evade===0&&p.z<35){for(const e of this.enemies){if(e.dead||e.phase==='strike'||e.phase==='buried'||e.phase==='emerge')continue;const side=Math.sign(e.x-beforeX),radius=e.heavy?42:28;if(side===axis&&(e.x-p.x)*side<radius&&Math.abs(e.x-beforeX)<radius+20)p.x=e.x-side*radius;}}
  p.x=clamp(p.x,40,this.exit+60);
  const airborne=p.z>0;p.vz-=1100*dt;p.z=Math.max(0,p.z+p.vz*dt);if(p.z===0){p.vz=0;if(airborne){p.landTime=.12;this.emit('land',p.x);if(this.jumpBuffer>0)this.jump()}}this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  if(input.attack||(this.attackBuffer>0&&p.cooldown===0))this.attack();this.attackBuffer=Math.max(0,this.attackBuffer-dt);
  for(const e of this.enemies){const before=e.x;this.tickEnemy(e,dt);if(!e.dead){e.x=clamp(e.x,...e.bounds);}if(e.walk){const distance=Math.abs(e.x-before);e.stride=(e.stride||0)+distance;e.walk=distance>.001;}}
  this.tickHazards(dt);this.tickBarrels(dt);
  this.tickProjectiles(dt);
  for(const [gate,ids] of this.gates)if(p.x>gate&&ids.some(i=>this.enemies.some(e=>e.id===i&&!e.dead))){p.x=gate;if(!this.markers.has('gate'+gate)){this.markers.add('gate'+gate);this.emit('toast','ТЕНИ НЕ ВЫПУСКАЮТ. ОЧИСТИ ПУТЬ.')}}
  this.tickKnives(dt,beforeX,beforeZ);
  const travelled=Math.abs(p.x-beforeX);p.moving=p.moving&&travelled>.01;if(p.moving&&p.hurtTime>0&&this.lastDamage)this.lastDamage.poseUntil=Math.min(this.lastDamage.poseUntil,.18-p.hurtTime+.09);if(p.moving&&p.z===0&&p.vz===0&&p.evade===0)p.stride+=travelled;
  this.tickCamera(dt);
  for(const [x,msg] of this.level.captions)if(p.x>x&&!this.markers.has(x)){this.markers.add(x);this.emit('caption',msg)}
  if(this.mode==='playing'&&this.enemies.length>0&&this.enemies.every(e=>e.dead)&&p.x>=this.exit){this.mode='won';this.emit('won')}
 }
}
root.SabbathGame=SabbathGame;if(typeof module!=='undefined')module.exports={SabbathGame,TYPES};
})(typeof globalThis!=='undefined'?globalThis:window);
