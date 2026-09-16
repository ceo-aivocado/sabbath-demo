/* Deterministic combat simulation: world coordinates, no renderer or network. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TYPES={
 cutter:{hp:108,speed:75,reach:76,windup:.60,recover:.80,damage:14},
 crawler:{hp:88,speed:91,reach:205,windup:.70,recover:1.05,damage:16},
 spitter:{hp:96,speed:52,reach:365,windup:.85,recover:1.5,damage:13},
 heavy:{hp:220,speed:42,reach:112,windup:.95,recover:1.40,damage:24}
};
class SabbathGame{
 constructor(){this.reset()}
 reset(){
  this.mode='intro';this.time=0;this.kills=0;this.cam=0;this.events=[];this.powerUses=0;this.combo=0;this.comboAge=0;this.shake=0;this.hitstop=0;this.projectiles=[];this.nextProjectile=0;this.attackBuffer=0;this.jumpBuffer=0;this.stats={hits:0,perfectDodges:0,parries:0,airHits:0,damageTaken:0};
  this.player={x:130,z:0,vz:0,hp:100,maxHp:100,nav:0,face:1,attack:0,cooldown:0,evade:0,evadeCd:0,inv:0,moving:false,power:0,transform:0,stride:0,counter:0,airAttack:false,attackHit:false};
  const xs=[570,850,1160,1550,1750,2020,2480,2720,3060,3390],types=['cutter','crawler','spitter','cutter','heavy','spitter','crawler','spitter','cutter','heavy'];
  this.enemies=types.map((type,i)=>({id:i,type,x:xs[i],z:0,hp:TYPES[type].hp,maxHp:TYPES[type].hp,heavy:type==='heavy',phase:'idle',timer:0,flash:0,face:-1,dead:false,death:0,spawnX:xs[i],attackNo:0,staggerGuard:0,broken:0,walk:false,hitPlayer:false,lockedFace:-1}));this.enemies[9].hp=this.enemies[9].maxHp=360;this.enemies[9].elite=true;this.exit=3750;this.markers=new Set();
 }
 start(){this.mode='playing';this.emit('caption','Переправа занята. Следи за замахами — и бей в ответ.');}
 emit(type,data){this.events.push({type,data})}
 charge(amount){const p=this.player,was=p.nav>=100;p.nav=clamp(p.nav+amount,0,100);if(!was&&p.nav===100&&p.power===0)this.emit('toast','НАВЬ ПРОСНУЛАСЬ. НАЖМИ C — ПРЕВРАТИТЬСЯ.')}
 attack(){
  const p=this.player;if(this.mode!=='playing'||p.transform>0)return false;
  if(p.cooldown>0||p.evade>0){this.attackBuffer=.14;return false}
  this.combo=this.comboAge<.95?this.combo%3+1:1;this.comboAge=0;
  p.airAttack=p.z>16;p.attack=p.airAttack?.38:.34;p.cooldown=p.airAttack?.48:([0,.34,.39,.58][this.combo]);p.attackHit=false;p.attackFacing=p.face;
  if(p.airAttack)p.vz=Math.min(p.vz,-190);this.attackBuffer=0;this.emit('swing',p.airAttack?'air':this.combo);return true;
 }
 resolveAttack(){
  const p=this.player;p.attackHit=true;const finisher=this.combo===3,reach=p.airAttack?104:finisher?120:104;let hits=0;
  for(const shot of this.projectiles){if(shot.dead||shot.kind!=='spit'||Math.abs(shot.x-p.x)>reach||(shot.x-p.x)*p.attackFacing<-15||Math.abs(shot.z-(p.z+55))>65)continue;shot.dead=true;this.charge(10);this.stats.parries++;this.emit('parry',{x:shot.x,z:shot.z})}
  for(const e of this.enemies){if(e.dead||Math.abs(e.x-p.x)>reach||(e.x-p.x)*p.attackFacing<-20||p.z>(p.airAttack?140:75))continue;
   const armored=e.heavy&&e.phase==='windup'&&e.broken===0&&(p.x-e.x)*e.face>0;
   let damage=p.airAttack?42:[0,25,31,48][this.combo];const breaking=p.airAttack||finisher||p.counter>0;
   if(armored&&!breaking){damage*=.3;this.emit('armor',e.x)}
   if(e.phase==='recover'||e.broken>0)damage*=1.25;if(p.counter>0)damage*=1.7;if(p.power>0)damage*=1.5;
   if(armored&&breaking){e.broken=1.4;this.emit('break',e.x)}
   this.damageEnemy(e,damage,{stagger:!armored||breaking,finisher:breaking});e.x+=p.attackFacing*(e.heavy?5:finisher?23:10);hits++;if(p.airAttack)this.stats.airHits++;
  }
  if(hits){p.counter=0;this.stats.hits+=hits;this.charge(20*hits);this.hitstop=finisher?.065:.035;this.shake=finisher?3:1.5;this.emit('hit',hits)}
 }
 damageEnemy(e,d,options={}){
  if(e.dead)return;e.hp=Math.max(0,e.hp-d);e.flash=.14;this.emit('sparks',{x:e.x,heavy:e.heavy});
  if(e.hp<=0){e.dead=true;e.death=1;e.phase='dead';this.kills++;this.player.hp=clamp(this.player.hp+4,0,this.player.maxHp);this.emit('kill',e.x)}
  else if(options.stagger!==false&&e.phase!=='strike'&&(!e.heavy||options.finisher)&&(e.staggerGuard<=0||options.finisher)){e.phase='hurt';e.timer=options.finisher?.42:.18;e.staggerGuard=1.1}
 }
 dodge(){
  const p=this.player;if(this.mode!=='playing'||p.evadeCd>0||p.transform>0||p.attack>.22)return false;
  const threat=this.enemies.some(e=>!e.dead&&e.phase==='windup'&&e.timer<.25&&Math.abs(e.x-p.x)<TYPES[e.type].reach+35)||this.projectiles.some(s=>!s.dead&&Math.abs(s.x-p.x)<95&&s.vx*(p.x-s.x)>0);
  p.evade=.23;p.evadeCd=.70;p.inv=.26;p.attack=0;p.cooldown=Math.min(p.cooldown,.14);
  if(threat){p.counter=1.6;this.charge(25);this.stats.perfectDodges++;this.emit('perfect',p.x)}this.emit('dodge');return true;
 }
 jump(){const p=this.player;if(this.mode!=='playing'||p.transform>0)return false;if(p.z===0){p.vz=450;this.jumpBuffer=0;this.emit('jump');return true}this.jumpBuffer=.12;return false}
 power(){const p=this.player;if(this.mode!=='playing'||p.nav<100||p.power>0)return false;p.nav=0;p.power=8;p.transform=1.3;p.attack=0;p.evade=0;p.z=0;p.vz=0;p.moving=false;p.maxHp=Math.max(60,p.maxHp-8);p.hp=Math.min(p.hp,p.maxHp);this.powerUses++;this.shake=5;this.emit('power');this.emit('caption','Ещё немного силы. Ещё немного чужого внутри.');return true}
 hurt(d){const p=this.player;if(p.inv>0||p.evade>0||p.transform>0||this.mode!=='playing')return false;p.hp=Math.max(0,p.hp-d);p.inv=.75;p.attack=0;this.attackBuffer=0;this.shake=4;this.combo=0;this.stats.damageTaken+=d;this.emit('hurt');if(p.hp===0){this.mode='dead';this.emit('dead')}return true}
 spawnShot(e,kind,direction){this.projectiles.push({id:this.nextProjectile++,kind,x:e.x+direction*30,z:kind==='wave'?8:82,vx:direction*(kind==='wave'?240:210),life:kind==='wave'?1.15:2.8,damage:kind==='wave'?18:13,dead:false});}
 beginEnemy(e){const cfg=TYPES[e.type];e.phase='windup';e.timer=cfg.windup*(e.enraged?.75:1);e.lockedFace=e.face;e.attackNo++;e.walk=false;e.hitPlayer=false;this.emit('warning',{x:e.x,type:e.type});
  if(!this.markers.has(e.type)){this.markers.add(e.type);const tips={cutter:'Вспышка перед ударом. Рывок в последний момент усиливает ответ.',crawler:'ПОЛЗУН: низкий бросок. Перепрыгни и ударь сверху.',spitter:'ПЛЕВУН: сгусток можно отбить саблей.',heavy:'УТОПЛЕННИК: перепрыгни волну. После удара он уязвим.'};this.emit('caption',tips[e.type])}
 }
 tickEnemy(e,dt){
  const p=this.player,cfg=TYPES[e.type];e.flash=Math.max(0,e.flash-dt);e.broken=Math.max(0,e.broken-dt);e.staggerGuard=Math.max(0,(e.staggerGuard||0)-dt);if(e.elite&&!e.enraged&&e.hp<e.maxHp*.5){e.enraged=true;this.emit('caption','СТРАЖ ПЕРЕПРАВЫ ЯРОСТЕН. Второй удар следует сразу.');}e.walk=false;if(e.dead){e.death=Math.max(0,e.death-dt*.8);return}
  const dist=Math.abs(e.x-p.x);e.timer-=dt;if(e.echo>0){e.echo-=dt;if(e.echo<=0){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);this.emit('enemyStrike',{x:e.x,heavy:true,type:'heavy'})}}if(e.phase!=='windup'&&e.phase!=='strike')e.face=e.x>p.x?-1:1;
  if(e.phase==='hurt'){if(e.timer<=0){e.phase='recover';e.timer=.3}return}
  if(e.phase==='windup'&&e.timer<=0){e.phase='strike';e.timer=e.type==='crawler'?.40:.18;e.face=e.lockedFace;
   if(e.type==='spitter')this.spawnShot(e,'spit',e.face);
   if(e.heavy){this.spawnShot(e,'wave',-1);this.spawnShot(e,'wave',1);if(e.enraged)e.echo=.38}
   this.emit('enemyStrike',{x:e.x,heavy:e.heavy,type:e.type});
  }
  if(e.phase==='strike'){
   if(e.type==='crawler')e.x+=e.lockedFace*395*dt;
   const front=(p.x-e.x)*e.lockedFace>=-24,range=e.type==='crawler'?57:cfg.reach;
   if(e.type!=='spitter'&&!e.hitPlayer&&Math.abs(p.x-e.x)<range&&front&&p.z<(e.type==='crawler'?42:70)){this.hurt(cfg.damage);e.hitPlayer=true}
   if(e.timer<=0){e.phase='recover';e.timer=cfg.recover}return;
  }
  if(e.phase==='recover'){if(e.timer<=0)e.phase='idle';else return}
  if(e.phase!=='idle'||dist>470)return;
  const active=this.enemies.filter(n=>!n.dead&&(n.phase==='windup'||n.phase==='strike')).length;
  if(e.type==='spitter'&&dist<180){e.x-=e.face*cfg.speed*.8*dt;e.walk=true;return}
  if(dist>cfg.reach-14){e.x+=e.face*cfg.speed*dt;e.walk=true}else if(active<2)this.beginEnemy(e);
 }
 tick(dt,input={}){
  if(this.mode!=='playing')return;dt=clamp(dt,0,.05);if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);return}
  this.time+=dt;this.comboAge+=dt;const p=this.player;if(p.transform>0){p.transform=Math.max(0,p.transform-dt);if(p.transform===0)this.emit('transformed');return}
  this.shake=Math.max(0,this.shake-dt*15);for(const k of ['attack','cooldown','evade','evadeCd','inv','power','counter'])p[k]=Math.max(0,p[k]-dt);
  if(p.attack>0&&!p.attackHit&&p.attack<=.22)this.resolveAttack();
  const axis=(input.right?1:0)-(input.left?1:0),beforeX=p.x;p.moving=!!axis&&p.attack<.12;
  if(axis&&p.evade<=0&&p.attack<=0)p.face=axis;
  if(p.evade>0)p.x+=p.face*590*dt;else if(p.moving)p.x+=axis*(p.power>0?190:158)*dt;
  if(axis&&p.evade===0&&p.z<35){for(const e of this.enemies){if(e.dead||e.phase==='strike')continue;const side=Math.sign(e.x-beforeX),radius=e.heavy?42:28;if(side===axis&&(e.x-p.x)*side<radius&&Math.abs(e.x-beforeX)<radius+20)p.x=e.x-side*radius;}}
  p.x=clamp(p.x,40,this.exit+60);p.stride+=Math.abs(p.x-beforeX);
  const airborne=p.z>0;p.vz-=1100*dt;p.z=Math.max(0,p.z+p.vz*dt);if(p.z===0){p.vz=0;if(airborne){this.emit('land',p.x);if(this.jumpBuffer>0)this.jump()}}this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  if(input.attack||(this.attackBuffer>0&&p.cooldown===0))this.attack();this.attackBuffer=Math.max(0,this.attackBuffer-dt);
  for(const e of this.enemies){this.tickEnemy(e,dt);if(!e.dead){const bounds=e.id<3?[250,1280]:e.id<6?[1430,2130]:[2330,3460];e.x=clamp(e.x,...bounds);}}
  // Keep silhouettes separate, except during a committed lunge.
  for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){const a=this.enemies[i],b=this.enemies[j];if(a.dead||b.dead||a.phase==='strike'||b.phase==='strike')continue;const d=b.x-a.x;if(Math.abs(d)<38){const push=(38-Math.abs(d))*dt*3,sign=d<0?-1:1;a.x-=push*sign;b.x+=push*sign}}
  for(const s of this.projectiles){if(s.dead)continue;const old=s.x;s.x+=s.vx*dt;s.life-=dt;const near=p.x>=Math.min(old,s.x)-19&&p.x<=Math.max(old,s.x)+19;const vertical=s.kind==='wave'?p.z<35:Math.abs(s.z-(p.z+52))<39;if(near&&vertical){this.hurt(s.damage);s.dead=true}if(s.life<=0)s.dead=true}
  this.projectiles=this.projectiles.filter(s=>!s.dead);
  for(const [gate,ids] of [[1350,[0,1,2]],[2200,[3,4,5]],[3530,[6,7,8,9]]])if(p.x>gate&&ids.some(i=>!this.enemies[i].dead)){p.x=gate;if(!this.markers.has('gate'+gate)){this.markers.add('gate'+gate);this.emit('toast','ТЕНИ НЕ ВЫПУСКАЮТ. ОЧИСТИ ПУТЬ.')}}
  this.cam+=(clamp(p.x-355,0,this.exit-830)-this.cam)*Math.min(1,dt*4);
  for(const [x,msg] of [[1380,'У колодца шевелится что-то тяжёлое.'],[2270,'Дом рядом. Здесь тени охотятся вместе.'],[3570,'Десять теней пали. За дверью — тишина.']])if(p.x>x&&!this.markers.has(x)){this.markers.add(x);this.emit('caption',msg)}
  if(this.mode==='playing'&&this.kills===10&&p.x>=this.exit){this.mode='won';this.emit('won')}
 }
}
root.SabbathGame=SabbathGame;if(typeof module!=='undefined')module.exports={SabbathGame,TYPES};
})(typeof globalThis!=='undefined'?globalThis:window);
