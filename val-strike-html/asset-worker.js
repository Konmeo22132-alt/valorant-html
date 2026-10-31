'use strict';
const ASSET_CACHE='vs-assets-1', META_CACHE='vs-assets-meta-1';
const META_URL=new URL('/__vs_asset_manifest',self.location.origin).href;
let manifestPromise;
const PAGE_CACHE='vs-pages-1';
const canonical=url=>decodeURIComponent(new URL(url,self.location.origin).pathname);
const keyFor=entry=>new URL(entry.url+'?vs_asset='+entry.revision,self.location.origin).href;
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function loadManifest(){
  if(!manifestPromise)manifestPromise=(async()=>{const meta=await caches.open(META_CACHE),saved=await meta.match(META_URL);if(!saved)return null;const data=await saved.json();return {data,entries:new Map(data.entries.map(entry=>[canonical(entry.url),entry]))};})().catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('range')||url.searchParams.has('vs_asset')||url.pathname.startsWith('/api/')||['/ws','/assets/preload-manifest.json','/js/asset-preloader.js','/css/asset-preloader.css'].includes(url.pathname))return;
  if(request.mode==='navigate'||url.pathname.endsWith('.html')){event.respondWith(pageResponse(request,url));return;}
  event.respondWith((async()=>{
    const manifest=await loadManifest().catch(()=>null),entry=manifest?.entries.get(canonical(request.url));
    if(entry){const cache=await caches.open(ASSET_CACHE),saved=await cache.match(keyFor(entry));if(saved)return saved;}
    return networkResponse(request);
  })());
});
async function networkResponse(request){
  for(let attempt=0;attempt<3;attempt++){
    try{return await fetch(request);}catch(error){if(attempt<2)await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
  }
  return new Response('Mất kết nối đến máy chủ. Vui lòng thử lại.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
async function pageResponse(request,url){
  const response=await networkResponse(request),key=new URL(url.pathname,self.location.origin).href;
  if(response.ok){try{const cache=await caches.open(PAGE_CACHE);await cache.put(key,response.clone());}catch(error){}return response;}
  try{const cache=await caches.open(PAGE_CACHE),saved=await cache.match(key);if(saved)return saved;}catch(error){}
  return response;
}
function validate(manifest){
  if(!manifest||!Array.isArray(manifest.entries)||!manifest.entries.length)throw Error('Danh sách tài nguyên không hợp lệ.');
  const seen=new Set();
  for(const entry of manifest.entries){const url=new URL(entry.url,self.location.origin),path=canonical(url);
    if(url.origin!==self.location.origin||!/^\/(assets|js|css|screens|game)\//.test(path)||path.startsWith('/game/')&&path.endsWith('.html')||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.revision)||seen.has(path))throw Error('Danh sách tài nguyên không hợp lệ.');
    seen.add(path);
  }
}
self.addEventListener('message',event=>{
  if(event.data?.type!=='manifest'||!event.ports[0])return;
  const port=event.ports[0];
  event.waitUntil((async()=>{try{
    const manifest=event.data.manifest;validate(manifest);
    const meta=await caches.open(META_CACHE);
    await meta.put(META_URL,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    manifestPromise=Promise.resolve({data:manifest,entries:new Map(manifest.entries.map(entry=>[canonical(entry.url),entry]))});
    port.postMessage({type:'done'});
  }catch(error){port.postMessage({type:'error',message:error.message});}finally{port.close();}})());
});
