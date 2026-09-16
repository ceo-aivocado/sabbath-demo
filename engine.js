/* Deterministic combat simulation: world coordinates, no renderer or network. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CHAPTERS=typeof module!=='undefined'?require('./chapters.js'):root.SabbathChapters;
const killsBefore=chapter=>CHAPTERS.slice(1,chapter).reduce((sum,c)=>sum+c.types.length,0);
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
  this.viewWidth=this.viewWidth||960;this.mode='intro';this.time=carry.time||0;this.kills=0;this.cam=0;this.events=[];this.powerUses=0;this.combo=0;this.comboAge=0;this.shake=0;this.hitstop=0;this.projectiles=[];this.nextProjectile=0;this.attackTargets=new Set();this.attackBuffer=0;this.jumpBuffer=0;this.stats={hits:0,perfectDodges:0,parries:0,airHits:0,knifeHits:0,damageTaken:0};
  this.player={x:130,z:0,vz:0,hp:100,maxHp:100,nav:0,face:1,attack:0,cooldown:0,evade:0,evadeCd:0,evadeKind:'forward',evadeDir:1,evadeSpeed:590,inv:0,moving:false,power:0,transform:0,stride:0,counter:0,knives:3,throwCd:0,throwTime:0,throwPending:0,throwFacing:1,airAttack:false,lowAttack:false,crouching:false,attackHit:false};
  const cfg=this.level;this.gates=cfg.gates.map(([x,ids])=>[x,[...ids]]);
  this.enemies=cfg.types.map((type,i)=>({id:i,type,x:cfg.xs[i],z:0,hp:TYPES[type].hp,maxHp:TYPES[type].hp,heavy:['heavy','captain'].includes(type),bounds:[...cfg.bounds[this.gates.findIndex(g=>g[1].includes(i))]],phase:cfg.buried.includes(i)?'buried':'idle',timer:0,flash:0,face:-1,dead:false,death:0,spawnX:cfg.xs[i],attackNo:0,staggerGuard:0,broken:0,walk:false,stride:0,hitPlayer:false,lockedFace:-1,move:'thrust'}));
  if(cfg.elite){const elite=this.enemies[cfg.elite[0]];elite.hp=elite.maxHp=cfg.elite[1];elite.elite=true;}
  this.exit=cfg.exit;this.markers=new Set();this.hazards=(cfg.embers||[]).map((x,i)=>({x,width:58,phase:'cooldown',timer:1.8+i*.75,hitPlayer:false,hitIds:new Set()}));
  if(carry.maxHp){this.player.maxHp=carry.maxHp;this.player.hp=clamp(carry.hp,1,carry.maxHp);this.powerUses=carry.powerUses||0;for(const key of Object.keys(this.stats))this.stats[key]=carry.stats?.[key]||0;}
 }
 start(){this.mode='playing';this.emit('caption',this.level.intro);}
 areaName(){const i=this.gates.findIndex(([x])=>this.player.x<=x);return this.level.areas[i<0?this.level.areas.length-1:i];}
 houseWidth(){return Math.max(1280,this.viewWidth)}
 houseScale(){return this.houseWidth()/1280}
 houseFocus(){
  const p=this.player,w=this.houseWidth(),items=[{id:'cradle',u:.13,title:'ОПРОКИНУТАЯ КОЛЫБЕЛЬ',text:'Пустая. Ни голоса, ни следа. Только рушник на полу.'},{id:'drawing',u:.25,title:'РИСУНОК НА СТЕНЕ',text:'Солнышко. Маленькая фигурка с косой. Здесь её рука ещё ничего не боялась.'},{id:'hearth',u:.47,title:'ОСТЫВШИЙ ОЧАГ',text:'Угли давно почернели. Никто не ждал его у огня.'},{id:'door',u:.89,title:'К СЕЧИ',text:''}];
  return items.map(item=>({...item,x:item.u*w})).filter(item=>Math.abs(item.x-p.x)<90*this.houseScale()).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0]||null;
 }
 openHouse(){
  this.scene='house';this.mode='house';this.kills=0;this.enemies=[];this.projectiles=[];this.hitstop=0;this.shake=0;this.attackBuffer=0;this.jumpBuffer=0;this.inspected=new Set();
  const p=this.player;for(const key of ['z','vz','attack','cooldown','evade','evadeCd','inv','power','transform','nav','counter','throwCd','throwTime','throwPending'])p[key]=0;p.crouching=false;p.moving=false;p.face=-1;p.x=this.houseWidth()*.82;this.cam=Math.max(0,this.houseWidth()-this.viewWidth);
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
 charge(amount){const p=this.player,was=p.nav>=100;p.nav=clamp(p.nav+amount,0,100);if(!was&&p.nav===100&&p.power===0)this.emit('toast','НАВЬ ПРОСНУЛАСЬ. НАЖМИ C — ПРЕВРАТИТЬСЯ.')}
 attack(){
  const p=this.player;if(this.mode!=='playing')return false;
  if(p.cooldown>0||p.evade>0||p.throwPending>0){this.attackBuffer=Math.max(.14,Math.min(.24,p.evade+.03));return false}
  p.throwTime=0;this.combo=this.comboAge<.95?this.combo%3+1:1;this.comboAge=0;
  p.counterAttack=p.counter>0;p.airAttack=p.z>16;p.lowAttack=p.crouching&&!p.airAttack;p.attack=p.airAttack?.38:.34;p.cooldown=p.airAttack?.48:([0,.34,.39,.58][this.combo]);p.attackHit=false;p.attackFacing=p.face;this.attackTargets.clear();
  if(p.airAttack)p.vz=Math.min(p.vz,-190);this.attackBuffer=0;this.emit('swing',p.airAttack?'air':this.combo);return true;
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
   this.attackTargets.add(e.id);this.damageEnemy(e,damage,{stagger:!armored||breaking,finisher:breaking});e.x+=p.attackFacing*(e.heavy?5:finisher?23:10);hits++;if(p.airAttack)this.stats.airHits++;
  }
  if(hits){p.counter=0;this.stats.hits+=hits;this.charge(20*hits);this.hitstop=finisher?.065:.035;this.shake=finisher?3:1.5;this.emit('hit',hits)}
 }
 damageEnemy(e,d,options={}){
  if(e.dead)return;e.hp=Math.max(0,e.hp-d);e.flash=.14;this.emit('sparks',{x:e.x,heavy:e.heavy});
  if(e.hp<=0){e.dead=true;e.death=1;e.phase='dead';this.kills++;if(this.kills%3===0)this.player.knives=Math.min(3,this.player.knives+1);if(this.player.hp>0)this.player.hp=clamp(this.player.hp+2,0,this.player.maxHp);this.emit('kill',e.x)}
  else if(options.stagger!==false&&e.phase!=='strike'&&(!e.heavy||options.finisher)&&(e.staggerGuard<=0||options.finisher)){e.phase='hurt';e.volley=0;e.waveEcho=0;e.timer=options.finisher?.42:.18;e.staggerGuard=1.1}
 }
 dodge(kind='forward'){
  const p=this.player;if(this.mode!=='playing'||p.evadeCd>0||p.attack>.22||(kind==='back'&&p.z>0))return false;
  const threat=this.enemies.some(e=>!e.dead&&e.phase==='windup'&&e.timer<.25&&!(e.type==='lancer'&&e.move==='thrust'&&p.crouching)&&!(e.type==='captain'&&e.move==='thrust'&&p.crouching)&&(p.x-e.x)*e.lockedFace>=-24&&Math.abs(e.x-p.x)<TYPES[e.type].reach+35)||this.projectiles.some(s=>!s.dead&&!s.friendly&&Math.abs(s.x-p.x)<95&&s.vx*(p.x-s.x)>0&&(s.kind==='wave'?p.z<35:Math.abs(s.z-(p.z+(p.crouching?26:52)))<(p.crouching?26:39)));
  this.cancelThrow();p.crouching=false;p.evadeKind=kind;p.evadeDir=p.face*(kind==='back'?-1:1);p.evadeSpeed=kind==='back'?360:590;p.evade=kind==='back'?.18:.23;p.evadeCd=kind==='back'?.48:.70;p.inv=kind==='back'?.13:.26;p.attack=0;p.cooldown=Math.min(p.cooldown,.14);
  if(threat){p.counter=1.6;this.charge(25);this.stats.perfectDodges++;this.emit('perfect',p.x)}this.emit('dodge',kind);return true;
 }
 jump(){const p=this.player;if(this.mode!=='playing')return false;if(p.z===0){p.crouching=false;p.vz=450;this.jumpBuffer=0;this.emit('jump');return true}this.jumpBuffer=.12;return false}
 knife(){const p=this.player;if(this.mode!=='playing'||p.throwCd>0||p.knives<=0||p.evade>0||p.attack>.22)return false;p.knives--;p.throwCd=.65;p.throwTime=.30;p.throwPending=.10;p.throwFacing=p.face;return true}
 releaseKnife(){const p=this.player;this.projectiles.push({id:this.nextProjectile++,kind:'dagger',friendly:true,x:p.x+p.throwFacing*34,z:p.z+(p.crouching?30:83),vx:p.throwFacing*700,vz:30,life:.8,damage:55,dead:false});this.emit('throw',p.x)}
 cancelThrow(){const p=this.player;if(p.throwPending>0)p.knives=Math.min(3,p.knives+1);p.throwPending=0;p.throwTime=0}

 power(){const p=this.player;if(this.mode!=='playing'||p.nav<100||p.power>0)return false;p.nav=0;p.power=8;p.transform=.65;p.maxHp=Math.max(60,p.maxHp-8);p.hp=Math.min(p.hp,p.maxHp);this.powerUses++;this.shake=2;this.emit('power');this.emit('caption','Навь в крови. Не останавливайся.');return true}

 hurt(d){const p=this.player;if(p.inv>0||this.mode!=='playing')return false;p.hp=Math.max(0,p.hp-d);p.inv=.62;p.attack=0;this.cancelThrow();this.attackBuffer=0;this.shake=4;this.combo=0;this.stats.damageTaken+=d;this.emit('hurt');if(p.hp===0){this.mode='dead';this.emit('dead')}return true}
 spawnShot(e,kind,direction){if(kind==='lead'){this.projectiles.push({id:this.nextProjectile++,kind,x:e.x+direction*85,z:e.shotLow?48:88,vx:direction*510,life:1.25,damage:22,dead:false});this.emit('gunshot',{x:e.x+direction*85,z:e.shotLow?48:88,face:direction});return;}this.projectiles.push({id:this.nextProjectile++,kind,x:e.x+direction*30,z:kind==='wave'?8:82,vx:direction*(kind==='wave'?240:210),life:kind==='wave'?1.15:2.8,damage:kind==='wave'?25:18,dead:false});}
 beginEnemy(e){if(['lancer','captain'].includes(e.type)){this.beginGuard(e);return;}const cfg=TYPES[e.type];e.phase='windup';e.timer=cfg.windup*(e.enraged?.75:1);e.lockedFace=e.face;e.attackNo++;e.shotLow=e.type==='gunner'&&e.attackNo%2===0;e.walk=false;e.hitPlayer=false;this.emit('warning',{x:e.x,type:e.type});
  if(!this.markers.has(e.type)){this.markers.add(e.type);const tips={gunner:'СТРЕЛОК: высокий выстрел — присядь; низкий — прыгни. Кортик сбивает прицел.',cutter:'Вспышка перед ударом. Рывок в последний момент усиливает ответ.',crawler:'ПОЛЗУН: низкий бросок. Перепрыгни и ударь сверху.',spitter:'ПЛЕВУН: присядь под сгустком или отбей его саблей.',heavy:'УТОПЛЕННИК: перепрыгни волну. После удара он уязвим.'};this.emit('caption',tips[e.type])}
 }
 beginGuard(e){
  const captain=e.type==='captain';e.move=captain?(e.enraged?['wave','thrust','slam','wave']:['thrust','slam','wave'])[e.attackNo%(e.enraged?4:3)]:(e.attackNo%2?'sweep':'thrust');e.attackNo++;e.lockedFace=e.face;e.phase='windup';e.hitPlayer=false;e.walk=false;
  e.timer=(captain?(e.move==='slam'?1.1:e.move==='wave'?1.05:.85):.85)*(e.enraged?.88:1);this.emit('warning',{x:e.x,type:e.type});
  if(!this.markers.has(e.type)){this.markers.add(e.type);this.emit('caption',captain?'СОТНИК: укол — вниз; волна — прыжок; замах сверху — рывок за спину.':'КОПЕЙЩИК: под высоким уколом присядь. Низкий подсек — перепрыгни.');}
 }
 tickGuard(e,dt){
  const p=this.player,cfg=TYPES[e.type],captain=e.type==='captain';e.flash=Math.max(0,e.flash-dt);e.broken=Math.max(0,e.broken-dt);e.staggerGuard=Math.max(0,e.staggerGuard-dt);e.walk=false;
  if(e.dead){e.death=Math.max(0,e.death-dt*.8);e.waveEcho=0;return;}
  if(captain&&!e.enraged&&e.hp<e.maxHp*.5){e.enraged=true;this.emit('caption','СОТНИК СБРОСИЛ ОСТОРОЖНОСТЬ. После первой волны придёт вторая.');}
  if(e.waveEcho>0){e.waveEcho-=dt;if(e.waveEcho<=0){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);this.emit('enemyStrike',{x:e.x,heavy:true,type:e.type});}}
  e.timer-=dt;if(!['windup','strike'].includes(e.phase))e.face=e.x>p.x?-1:1;
  if(e.phase==='hurt'){if(e.timer<=0){e.phase='recover';e.timer=.4;}return;}
  if(e.phase==='windup'&&e.timer<=0){e.phase='strike';e.timer=e.move==='thrust'?.30:.20;e.face=e.lockedFace;
   if(e.move==='wave'){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);if(e.enraged)e.waveEcho=.5;}
   this.emit('enemyStrike',{x:e.x,heavy:captain,type:e.type});
  }
  if(e.phase==='strike'){
   if(e.move==='thrust')e.x+=e.lockedFace*(captain?225:210)*dt;
   const front=(p.x-e.x)*e.lockedFace>=-20,range=e.move==='slam'?125:145;
   const vertical=e.move==='thrust'?Math.abs(83-(p.z+(p.crouching?26:52)))<(p.crouching?26:39):e.move==='sweep'?p.z<38:p.z<145;
   if(e.move!=='wave'&&!e.hitPlayer&&front&&Math.abs(p.x-e.x)<range&&vertical){this.hurt(cfg.damage+(e.move==='slam'?5:0));e.hitPlayer=true;}
   if(e.timer<=0){e.phase='recover';e.timer=captain?(e.move==='slam'?1.55:e.move==='wave'?1.35:1.25):1.10;}return;
  }
  if(e.phase==='recover'){if(e.timer<=0)e.phase='idle';else return;}
  const distance=Math.abs(p.x-e.x);if(e.phase!=='idle'||distance>470)return;
  const onScreen=e.x>=this.cam+24&&e.x<=this.cam+this.viewWidth-24;
  if(distance>cfg.reach-14||!onScreen){e.x+=e.face*cfg.speed*dt;e.walk=true;}else if(this.enemies.filter(n=>!n.dead&&['windup','strike'].includes(n.phase)).length<2)this.beginGuard(e);
 }
 tickHazards(dt){
  const p=this.player;for(const h of this.hazards){const visible=h.x>=this.cam-60&&h.x<=this.cam+this.viewWidth+60&&Math.abs(h.x-p.x)<420;
   if(!visible){h.phase='cooldown';h.timer=Math.max(h.timer,1.5);continue;}
   h.timer-=dt;
   if(h.phase==='cooldown'&&h.timer<=0){h.phase='warning';h.timer=1.15;h.hitPlayer=false;h.hitIds.clear();this.emit('emberWarning',h.x);}
   else if(h.phase==='warning'&&h.timer<=0){h.phase='active';h.timer=.55;this.emit('emberBurst',h.x);}
   else if(h.phase==='active'){
    if(!h.hitPlayer&&Math.abs(p.x-h.x)<h.width&&p.z<38){this.hurt(23);h.hitPlayer=true;}
    if(this.mode!=='playing')return;
    for(const e of this.enemies)if(!e.dead&&!['buried','emerge'].includes(e.phase)&&!h.hitIds.has(e.id)&&Math.abs(e.x-h.x)<h.width+16){h.hitIds.add(e.id);this.damageEnemy(e,65,{stagger:false});}
    if(h.timer<=0){h.phase='cooldown';h.timer=4.2;}
   }
  }
 }
 tickEnemy(e,dt){
  if(['lancer','captain'].includes(e.type)){this.tickGuard(e,dt);return;}
  const p=this.player,cfg=TYPES[e.type];if(e.phase==='buried'){if(Math.abs(e.x-p.x)<430){e.phase='emerge';e.timer=1.1;this.emit('rise',{x:e.x,heavy:e.heavy})}return}if(e.phase==='emerge'){e.timer-=dt;if(e.timer<=0){e.phase='idle';e.timer=0}return}e.flash=Math.max(0,e.flash-dt);e.broken=Math.max(0,e.broken-dt);e.staggerGuard=Math.max(0,(e.staggerGuard||0)-dt);if(e.elite&&!e.enraged&&e.hp<e.maxHp*.5){e.enraged=true;this.emit('caption','СТРАЖ ЯРОСТЕН. Второй удар следует сразу.');}e.walk=false;if(e.dead){e.death=Math.max(0,e.death-dt*.8);return}
  const dist=Math.abs(e.x-p.x);e.timer-=dt;if(e.echo>0){e.echo-=dt;if(e.echo<=0){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);this.emit('enemyStrike',{x:e.x,heavy:true,type:'heavy'})}}if(e.phase!=='windup'&&e.phase!=='strike')e.face=e.x>p.x?-1:1;
  if(e.volley>0){e.volley-=dt;if(e.volley<=0)this.spawnShot(e,'lead',e.lockedFace);}
  if(e.phase==='hurt'){if(e.timer<=0){e.phase='recover';e.timer=.3}return}
  if(e.phase==='windup'&&e.timer<=0){e.phase='strike';e.timer=e.type==='crawler'?.40:.18;e.face=e.lockedFace;
   if(e.type==='gunner'){this.spawnShot(e,'lead',e.face);e.volley=.18;e.timer=.32;}
   if(e.type==='spitter')this.spawnShot(e,'spit',e.face);
   if(e.heavy){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);if(e.enraged)e.echo=.38}
   this.emit('enemyStrike',{x:e.x,heavy:e.heavy,type:e.type});
  }
  if(e.phase==='strike'){
   if(e.type==='crawler')e.x+=e.lockedFace*395*dt;
   const front=(p.x-e.x)*e.lockedFace>=-24,range=e.type==='crawler'?57:cfg.reach;
   if(!['spitter','gunner'].includes(e.type)&&!e.hitPlayer&&Math.abs(p.x-e.x)<range&&front&&p.z<(e.type==='crawler'?42:70)){this.hurt(cfg.damage);e.hitPlayer=true}
   if(e.timer<=0){e.phase='recover';e.timer=cfg.recover}return;
  }
  if(e.phase==='recover'){if(e.timer<=0)e.phase='idle';else return}
  if(e.phase!=='idle'||dist>470)return;
  const onScreen=e.x>=this.cam+24&&e.x<=this.cam+this.viewWidth-24;
  const active=this.enemies.filter(n=>!n.dead&&(n.phase==='windup'||n.phase==='strike')).length;
  if(['spitter','gunner'].includes(e.type)&&dist<180&&onScreen){e.x-=e.face*cfg.speed*.8*dt;e.walk=true;return}
  if(dist>cfg.reach-14||!onScreen){e.x+=e.face*cfg.speed*dt;e.walk=true}else if(active<2)this.beginEnemy(e);
 }
 tick(dt,input={}){
  dt=clamp(dt,0,.05);if(this.mode==='house'){this.tickHouse(dt,input);return;}if(this.mode!=='playing')return;if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);return}
  this.time+=dt;this.comboAge+=dt;const p=this.player;if(p.transform>0){p.transform=Math.max(0,p.transform-dt);if(p.transform===0)this.emit('transformed');}
  this.shake=Math.max(0,this.shake-dt*15);for(const k of ['attack','cooldown','evade','evadeCd','inv','power','counter','throwCd','throwTime'])p[k]=Math.max(0,p[k]-dt);
  if(p.throwPending>0){p.throwPending=Math.max(0,p.throwPending-dt);if(p.throwPending===0)this.releaseKnife();}
  p.crouching=!!input.crouch&&p.z===0&&p.vz<=0&&p.evade===0;if(p.attack>.08&&p.attack<=.22)this.resolveAttack();
  const axis=(input.right?1:0)-(input.left?1:0),beforeX=p.x;p.moving=!!axis&&p.attack<.12;
  if(axis&&p.evade<=0&&p.attack<=0&&p.throwTime===0)p.face=axis;
  if(p.evade>0){p.x+=p.evadeDir*p.evadeSpeed*dt;if(p.evadeKind==='back'){for(const e of this.enemies){if(e.dead||e.phase==='buried'||e.phase==='emerge')continue;const side=Math.sign(e.x-beforeX),radius=e.heavy?42:28;if(side===p.evadeDir&&(e.x-p.x)*side<radius&&Math.abs(e.x-beforeX)<radius+p.evadeSpeed*dt+1)p.x=e.x-side*radius;}}}else if(p.moving)p.x+=axis*(p.crouching?62:p.power>0?190:158)*dt;
  if(axis&&p.evade===0&&p.z<35){for(const e of this.enemies){if(e.dead||e.phase==='strike'||e.phase==='buried'||e.phase==='emerge')continue;const side=Math.sign(e.x-beforeX),radius=e.heavy?42:28;if(side===axis&&(e.x-p.x)*side<radius&&Math.abs(e.x-beforeX)<radius+20)p.x=e.x-side*radius;}}
  p.x=clamp(p.x,40,this.exit+60);p.stride+=Math.abs(p.x-beforeX);
  const airborne=p.z>0;p.vz-=1100*dt;p.z=Math.max(0,p.z+p.vz*dt);if(p.z===0){p.vz=0;if(airborne){this.emit('land',p.x);if(this.jumpBuffer>0)this.jump()}}this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  if(input.attack||(this.attackBuffer>0&&p.cooldown===0))this.attack();this.attackBuffer=Math.max(0,this.attackBuffer-dt);
  for(const e of this.enemies){const before=e.x;this.tickEnemy(e,dt);if(!e.dead){e.x=clamp(e.x,...e.bounds);}if(e.walk){const distance=Math.abs(e.x-before);e.stride=(e.stride||0)+distance;e.walk=distance>.001;}}
  this.tickHazards(dt);
  // Keep silhouettes separate, except during a committed lunge.
  for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){const a=this.enemies[i],b=this.enemies[j];if(a.dead||b.dead||['strike','buried','emerge'].includes(a.phase)||['strike','buried','emerge'].includes(b.phase))continue;const d=b.x-a.x;if(Math.abs(d)<38){const push=(38-Math.abs(d))*dt*3,sign=d<0?-1:1;a.x-=push*sign;b.x+=push*sign}}
  for(const s of this.projectiles){if(s.dead)continue;const old=s.x;s.x+=s.vx*dt;s.life-=dt;if(s.kind==='dagger'){s.z+=s.vz*dt;s.vz-=380*dt;if(s.z<6){s.dead=true;continue;}}const near=p.x>=Math.min(old,s.x)-19&&p.x<=Math.max(old,s.x)+19;const vertical=s.kind==='wave'?p.z<35:Math.abs(s.z-(p.z+(p.crouching?26:52)))<(p.crouching?26:39);if(s.friendly){for(const e of this.enemies){if(!e.dead&&e.phase!=='buried'&&!(e.phase==='emerge'&&e.timer>.65)&&e.x>=Math.min(old,s.x)-20&&e.x<=Math.max(old,s.x)+20&&s.z<(e.heavy?160:e.type==='crawler'?82:140)){if(s.kind==='dagger')this.stats.knifeHits++;this.damageEnemy(e,s.damage,{stagger:true});s.dead=true;this.emit('reflectedHit',e.x);break;}}}else if(near&&vertical){this.hurt(s.damage);s.dead=true}if(s.life<=0)s.dead=true}
  this.projectiles=this.projectiles.filter(s=>!s.dead);
  for(const [gate,ids] of this.gates)if(p.x>gate&&ids.some(i=>this.enemies.some(e=>e.id===i&&!e.dead))){p.x=gate;if(!this.markers.has('gate'+gate)){this.markers.add('gate'+gate);this.emit('toast','ТЕНИ НЕ ВЫПУСКАЮТ. ОЧИСТИ ПУТЬ.')}}
  this.cam+=(clamp(p.x-355,0,this.exit-830)-this.cam)*Math.min(1,dt*4);
  for(const [x,msg] of this.level.captions)if(p.x>x&&!this.markers.has(x)){this.markers.add(x);this.emit('caption',msg)}
  if(this.mode==='playing'&&this.enemies.length>0&&this.enemies.every(e=>e.dead)&&p.x>=this.exit){this.mode='won';this.emit('won')}
 }
}
root.SabbathGame=SabbathGame;if(typeof module!=='undefined')module.exports={SabbathGame,TYPES};
})(typeof globalThis!=='undefined'?globalThis:window);
