const CACHE='skb-v3';
const SHELL=['./','index.html','style.css','app.js','manifest.json','favicon.png'];
const isShell=url=>{const file=url.pathname.split('/').pop();return file===''||SHELL.includes(file)};

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>Promise.all(SHELL.map(file=>cache.add(file).catch(()=>{})))).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||!isShell(url))return;
  event.respondWith(
    fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||caches.match('index.html')))
  );
});