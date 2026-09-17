/* Original procedural soundscape. No media downloads, microphone or AudioWorklet. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PROFILES={
 silent:{wind:0,water:0,rain:0,fire:0,room:0,drone:0},
 riverside:{wind:.15,water:.09,rain:0,fire:.012,room:0,drone:.32},
 house:{wind:.01,water:0,rain:0,fire:0,room:.015,drone:.07},
 sich:{wind:.13,water:0,rain:0,fire:.009,room:0,drone:.27},
 villages:{wind:.085,water:.025,rain:.055,fire:0,room:0,drone:.20},
 skit:{wind:.13,water:0,rain:0,fire:.014,room:0,drone:.35},
 fortress:{wind:.10,water:0,rain:0,fire:.008,room:0,drone:.38}
};
class SabbathSound{
 constructor(context,{seed=73419}={}){
  this.context=context;this.seed=seed;this.scene='silent';this.enabled=false;this.mode='intro';this.time=0;this.nextAmbient=.7;this.nextBeat=0;this.beat=0;this.voices=new Set();this.maxVoices=48;this.stats={created:0,dropped:0,peakVoices:0};
  this.master=context.createGain();this.master.gain.value=0;this.compressor=context.createDynamicsCompressor();this.compressor.threshold.value=-18;this.compressor.knee.value=18;this.compressor.ratio.value=3;this.compressor.attack.value=.006;this.compressor.release.value=.18;this.compressor.connect(this.master).connect(context.destination);
  this.effects=context.createGain();this.effects.connect(this.compressor);this.ambience=context.createGain();this.ambience.gain.value=.35;this.duck=context.createGain();this.ambience.connect(this.duck).connect(this.compressor);
  this.white=this.makeNoise(false,2);this.brown=this.makeNoise(true,2);this.mono=context.createBuffer(1,this.white.length,context.sampleRate);this.mono.copyToChannel(this.white.getChannelData(0),0);
  this.beds={};this.loops=[];for(const [name,type,frequency,q,buffer] of [['wind','lowpass',240,.6,this.brown],['water','bandpass',620,.5,this.brown],['rain','highpass',850,.5,this.white],['fire','bandpass',1700,.65,this.white],['room','lowpass',140,.5,this.brown]])this.makeBed(name,type,frequency,q,buffer);
  this.drone=context.createGain();this.drone.gain.value=0;this.drone.connect(this.ambience);for(const [frequency,level] of [[73.416,.020],[110.12,.012],[146.96,.007]]){const source=context.createOscillator(),gain=context.createGain();source.type='sine';source.frequency.value=frequency;gain.gain.value=level;source.connect(gain).connect(this.drone);source.start();this.loops.push(source);}
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 makeNoise(brown,channels){const c=this.context,buffer=c.createBuffer(channels,Math.round(c.sampleRate*4),c.sampleRate);for(let ch=0;ch<channels;ch++){const data=buffer.getChannelData(ch);let value=0;for(let i=0;i<data.length;i++){const white=this.random()*2-1;value=(value+.025*white)/1.025;data[i]=brown?value*3:white;}const tail=1024;for(let i=0;i<tail;i++){const f=i/(tail-1),index=data.length-tail+i;data[index]=data[index]*(1-f)+data[0]*f;}}return buffer;}
 makeBed(name,type,frequency,q,buffer){const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.ambience);source.start(0,this.random()*2);this.beds[name]=gain;this.loops.push(source);}
 ramp(param,value,at=this.context.currentTime,seconds=.35){const t=Math.max(this.context.currentTime,at);if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(t);else{const current=param.value;param.cancelScheduledValues(t);param.setValueAtTime(current,t);}param.setTargetAtTime(value,t,seconds);}
 setEnabled(enabled,at=this.context.currentTime){this.enabled=enabled;this.ramp(this.master.gain,enabled?.32:0,at,.015);}
 setScene(scene,at=this.context.currentTime){if(this.scene===scene)return;this.scene=scene in PROFILES?scene:'silent';this.time=0;this.nextAmbient=.6;this.nextBeat=0;this.beat=0;const p=PROFILES[this.scene];for(const [name,node] of Object.entries(this.beds))this.ramp(node.gain,p[name],at,.45);this.ramp(this.drone.gain,p.drone,at,.6);}
 setMode(mode,at=this.context.currentTime){if(this.mode===mode)return;this.mode=mode;this.ramp(this.effects.gain,mode==='paused'?.15:1,at,.04);this.ramp(this.ambience.gain,mode==='paused'?.063:.35,at,.15);}
 route(source,nodes,at,duration,pan=0){const end=at+duration+.025,overlapping=[...this.voices].filter(v=>v.end>at&&v.at<end),points=[at,...overlapping.filter(v=>v.at>at).map(v=>v.at)],overlap=Math.max(0,...points.map(t=>overlapping.filter(v=>v.at<=t&&v.end>t).length));if(overlap>=this.maxVoices){this.stats.dropped++;for(const node of [source,...nodes])node.disconnect();return false;}let last=source;for(const node of nodes){last.connect(node);last=node;}let panner;if(this.context.createStereoPanner){panner=this.context.createStereoPanner();panner.pan.value=clamp(pan,-.8,.8);last.connect(panner);last=panner;}last.connect(this.effects);const voice={at,end,nodes:[source,...nodes,...(panner?[panner]:[])]};this.voices.add(voice);this.stats.created++;this.stats.peakVoices=Math.max(this.stats.peakVoices,overlap+1);source.onended=()=>{for(const node of voice.nodes)node.disconnect();this.voices.delete(voice);};return true;}
 tone(frequency,duration,volume,type='sine',slide=1,pan=0,at=this.context.currentTime){if(!this.enabled)return false;const c=this.context,t=Math.max(c.currentTime,at),dur=clamp(duration,.025,4),source=c.createOscillator(),gain=c.createGain();source.type=type;source.frequency.setValueAtTime(Math.max(20,frequency),t);source.frequency.exponentialRampToValueAtTime(Math.max(20,frequency*slide),t+dur);gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.00002,volume),t+Math.min(.012,dur*.2));gain.gain.exponentialRampToValueAtTime(.00001,t+dur);if(!this.route(source,[gain],t,dur,pan))return false;source.start(t);source.stop(t+dur+.025);return true;}
 noise(duration,volume,cutoff,{pan=0,type='lowpass',q=.7,at=this.context.currentTime}={}){if(!this.enabled)return false;const c=this.context,t=Math.max(c.currentTime,at),dur=clamp(duration,.02,3.8),source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.mono;filter.type=type;filter.frequency.value=clamp(cutoff,40,c.sampleRate*.45);filter.Q.value=q;gain.gain.setValueAtTime(.00001,t);gain.gain.linearRampToValueAtTime(volume,t+.005);gain.gain.exponentialRampToValueAtTime(.00001,t+dur);if(!this.route(source,[filter,gain],t,dur,pan))return false;source.start(t,this.random()*(4-dur),dur);source.stop(t+dur+.025);return true;}
 cueEnemy({type,move,low=false,enraged=false,pan=0},at=this.context.currentTime){
  if(!this.enabled)return;this.ramp(this.duck.gain,.28,at,.012);this.duck.gain.setTargetAtTime(1,Math.max(this.context.currentTime,at)+.3,.18);
  if(type==='captain'&&move==='wave'){for(const delay of [0,.13]){this.tone(85,.16,.075,'triangle',.65,pan,at+delay);this.noise(.06,.07,460,{pan,at:at+delay});}if(enraged)this.tone(220,.20,.035,'sine',.7,pan,at+.23);}
  else if(type==='captain'&&move==='slam'){this.noise(.24,.10,500,{pan,at});this.tone(120,.30,.06,'triangle',1.6,pan,at);}
  else if(type==='lancer'||type==='captain'){const low=move==='sweep';this.noise(low?.17:.10,.075,low?950:2400,{pan,type:'bandpass',q:.8,at});this.tone(low?190:390,.15,.055,'triangle',low?.65:1.25,pan,at);}
  else if(type==='gunner'){this.noise(.04,.13,3600,{pan,at});this.tone(low?280:520,.09,.055,'triangle',.8,pan,at+.06);}
  else if(type==='heavy'){this.noise(.22,.14,280,{pan,at});this.tone(68,.25,.075,'triangle',1.35,pan,at);}
  else if(type==='spitter'){this.noise(.18,.10,600,{pan,type:'bandpass',q:2,at});this.tone(90,.15,.055,'sine',.65,pan,at);}
  else if(type==='crawler'){this.noise(.13,.09,1100,{pan,at});this.tone(72,.17,.07,'triangle',.7,pan,at);}
  else{this.noise(.10,.08,2400,{pan,type:'bandpass',q:.7,at});this.tone(260,.09,.05,'triangle',1.3,pan,at);}
 }
 step(scene,power=false,pan=0,at=this.context.currentTime){const heavy=power?1.3:1;if(scene==='house'){this.noise(.065,.10,520,{pan,at});this.tone(135,.09,.025,'triangle',.7,pan,at);}else if(scene==='villages'){this.noise(.08,.11*heavy,1250,{pan,at});this.noise(.12,.035,2700,{pan,at:at+.015});}else if(scene==='fortress'){this.noise(.045,.12*heavy,2100,{pan,at});this.tone(100,.055,.035*heavy,'sine',.5,pan,at);}else this.noise(.07,.10*heavy,scene==='skit'?1100:750,{pan,at});}
 land(scene,pan=0,at=this.context.currentTime){this.step(scene,true,pan,at);this.tone(64,.14,.055,'sine',.5,pan,at);}
 bell(at,pan,volume=.025){for(const [ratio,gain,duration] of [[1,1,2.2],[2.01,.45,1.6],[2.7,.22,.8]])this.tone(146.83*ratio,duration,volume*gain,'sine',.997,pan,at);}
 update(dt,state,at=this.context.currentTime){this.setScene(state.scene,at);this.setMode(state.mode,at);if(!this.enabled||!['playing','house'].includes(state.mode))return;this.time+=dt;
  if(state.boss&&this.time>=this.nextBeat){const accent=this.beat++%4===0;this.nextBeat=this.time+(state.enraged?.46:.58);this.tone(accent?61.74:73.42,.23,accent?.065:.04,'sine',.6,0,at);this.noise(.028,accent?.08:.035,900,{pan:accent?-.1:.1,at});if(this.beat%2===0)this.tone(110.12,.26,.016,'triangle',1,0,at+.12);}
  if(!state.boss){this.nextBeat=this.time;this.beat=0;}if(this.time<this.nextAmbient)return;const pan=(this.random()*2-1)*.65;
  if(this.scene==='house'){this.noise(.7,.018,420,{type:'bandpass',q:2,pan,at});this.tone(155,.8,.008,'triangle',.65,pan,at);this.nextAmbient=this.time+8+this.random()*7;}
  else if(this.scene==='villages'){this.noise(.045,.034,4200,{pan,at});this.nextAmbient=this.time+.25+this.random()*.65;}
  else if(this.scene==='sich'&&this.random()<.16){this.bell(at,pan,.018);this.nextAmbient=this.time+8+this.random()*6;}
  else if(this.scene==='skit'&&this.random()<.10){this.bell(at,pan,.010);this.nextAmbient=this.time+8;}
  else{this.noise(.025+this.random()*.09,.025+this.random()*.02,1600+this.random()*1200,{pan,at});if(this.scene==='riverside'&&this.random()<.5)this.noise(.45,.045,480,{pan,at});this.nextAmbient=this.time+1.4+this.random()*3;}
 }
 dispose(){for(const node of this.loops){try{node.stop();}catch{}node.disconnect();}for(const voice of this.voices){try{voice.nodes[0].stop();}catch{}for(const node of voice.nodes)node.disconnect();}this.voices.clear();this.master.disconnect();}
}
root.SabbathSound=SabbathSound;if(typeof module!=='undefined')module.exports={SabbathSound,PROFILES};
})(typeof globalThis!=='undefined'?globalThis:window);
