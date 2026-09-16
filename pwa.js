const offlineStatus=document.getElementById('offline-status');
if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)){
 navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{offlineStatus.textContent='Готово к игре без интернета';}).catch(()=>{offlineStatus.textContent='Игра доступна онлайн. Для сохранения без сети перезагрузи страницу.'});
}else{offlineStatus.textContent='Для установки на iPhone открой игру по ссылке HTTPS.'}
