if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)){
 let hadController=!!navigator.serviceWorker.controller,pending=false,reloading=false,registration,registering=false;
 // Pauses and results still belong to this run. Only the visible title is safe
 // to reload; the new worker can prepare an entire release during play.
 function applyUpdate(){if(pending&&!reloading&&!document.hidden&&window.sabbath?.game.mode==='intro'){reloading=true;location.reload()}}
 function compareRelease(){
  const controller=navigator.serviceWorker.controller;if(!controller||!window.SABBATH_BUILD)return;
  const channel=new MessageChannel(),timeout=setTimeout(()=>channel.port1.close(),3000);
  channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();if(event.data?.release&&event.data.release!==window.SABBATH_BUILD.release){pending=true;applyUpdate()}};
  controller.postMessage({type:'SABBATH_RELEASE'},[channel.port2]);
 }
 function checkUpdate(){if(document.hidden)return;applyUpdate();registration?.update().catch(()=>{})}
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController){pending=true;applyUpdate()}hadController=true;compareRelease();});
 function register(){
  if(registering)return;registering=true;
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{registration=reg;compareRelease();checkUpdate()}).catch(()=>{registering=false});
 }
 // First visit: images are verified and cached by the loader before install.
 // A failed loader still registers so a complete newer release can recover it.
 if(!window.SABBATH_BUILD||['ready','failed'].includes(window.sabbath?.loading().phase))register();
 else window.addEventListener('sabbath:loadsettled',register,{once:true});
 window.addEventListener('pageshow',checkUpdate);window.addEventListener('online',()=>{if(window.sabbath?.loading().phase!=='loading')register();checkUpdate()});
 document.addEventListener('visibilitychange',checkUpdate);setInterval(checkUpdate,60000);
}
