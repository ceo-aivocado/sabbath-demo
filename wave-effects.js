'use strict';
// Stateless ground-wave art. Its clock is the projectile's remaining life,
// so pause, hitstop, removal and chapter changes need no extra VFX state.
const SabbathWaves=(()=>{
 const LIFE=1.15,HEIGHT=35,SPACING=14,WAKE_LIFE=.25;
 const palettes={
  riverside:['#251f1c','#594434','#836449','#bd9368','#edc695'],
  sich:     ['#28201b','#624836','#916849','#c29664','#edc695'],
  villages: ['#242223','#514640','#7b6955','#b09774','#e7c79d'],
  skit:     ['#252328','#514a4a','#80716b','#b59b7d','#edc695'],
  fortress: ['#24282e','#50535a','#7f7b77','#b3a08a','#ecd1aa']
 };
 const heights=[[5,10,16,23,29,35,14],[7,9,19,21,31,35,12],[4,12,15,25,28,35,17],[6,9,18,22,30,35,15]];
 // Visitor coordinates: world x, height of rectangle top above the ground.
 // Decorative stamps are tied to the world, not to the current camera/crest.
 function visit(shot,scene,emit){
  if(shot.dead||shot.kind!=='wave'||shot.life<=0)return;
  const dir=shot.vx<0?-1:1,speed=Math.abs(shot.vx),age=Math.max(0,LIFE-shot.life),travel=speed*age;
  const origin=shot.x-shot.vx*age,palette=palettes[scene]||palettes.riverside;
  const phase=Math.floor(travel/9+(shot.id||0))%4;
  function local(u,z,w,h,color,alpha=1,role='core'){
   emit(shot.x+(dir>0?u:-u-w),z,w,h,color,alpha,role,-1);
  }
  if(speed>0){
   const last=Math.floor((travel-10)/SPACING);
   // At most five world stamps, including a little margin for the leading gap.
   for(let j=Math.max(0,last-4);j<=last;j++){
    const t=(travel-j*SPACING)/speed;if(t<=0||t>=WAKE_LIFE)continue;
    const fade=1-t/WAKE_LIFE,x=origin+dir*j*SPACING;
    emit(x-5,1,10,2,palette[0],fade*.28,'wake',j);
    emit(x-3,3,5,2,palette[2],fade*.30,'wake',j);
    const z=3+210*t-950*t*t;
    if(z>2){
     const px=x-dir*t*28,side=j%2?1:-1;
     emit(px,Math.min(22,z),3,3,palette[2],fade*.62,'debris',j);
     emit(px+side*5,Math.min(22,z*.7+2),2,2,palette[3],fade*.52,'debris',j);
    }
   }
  }
  local(-25,0,34,3,palette[0],.30,'shadow');
  // Uneven connected columns form a solid, rooted crest. The fixed leading
  // peak matches the engine's 35-unit foot clearance in every animation frame.
  for(let i=0;i<7;i++){
   const u=-22+i*4,h=heights[phase][i];
   local(u,h,4,h,palette[0]);
  }
  // Fill across column seams. Per-column borders looked like metal teeth;
  // broad broken facets keep this a single moving clod of earth/stone.
  for(let i=0;i<7;i++){
   const u=-22+i*4,h=heights[phase][i];
   local(u,h-2,4,h-3,palette[1]);
   if(h>8)local(u+1,h-2,3,2,palette[3]);
  }
  local(-18,7,13,3,palette[2]);local(-10,18,8,4,palette[2]);
  local(-5,26,6,4,palette[2]);local(-1,31,3,5,palette[2]);
  local(-15,4,5,2,palette[0]);local(-7,11,4,3,palette[0]);
  local(-3,20,2,2,palette[0]);local(2,8,3,4,palette[2]);
  local(-1,HEIGHT,2,3,palette[4]);
  local(1,HEIGHT-3,1,9,palette[3]);
 }
 function draw(ctx,shot,scene,cam,ground){
  ctx.save();
  visit(shot,scene,(x,z,w,h,color,alpha)=>{
   ctx.globalAlpha=alpha;ctx.fillStyle=color;
   ctx.fillRect(Math.round(x-cam),Math.round(ground-z),w,h);
  });
  ctx.restore();
 }
 return {visit,draw,HEIGHT,LIFE};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SabbathWaves;
