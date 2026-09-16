if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)){
 let hadController=!!navigator.serviceWorker.controller,pending=false,reloading=false,registration;
 function applyUpdate(){if(pending&&!reloading&&window.sabbath?.game.mode!=='playing'){reloading=true;location.reload()}}
 function checkUpdate(){if(document.hidden)return;applyUpdate();registration?.update().catch(()=>{})}
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController){pending=true;applyUpdate()}hadController=true;});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{registration=reg;checkUpdate()}).catch(()=>{});
 window.addEventListener('pageshow',checkUpdate);window.addEventListener('online',checkUpdate);
 document.addEventListener('visibilitychange',checkUpdate);
 setInterval(checkUpdate,60000);
}
