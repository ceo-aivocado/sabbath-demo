if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)){
 const wasControlled=!!navigator.serviceWorker.controller;let refreshed=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(wasControlled&&!refreshed){refreshed=true;location.reload()}});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}
