(()=>{
  document.documentElement.classList.add('assets-pending');
  let overlay,active=null,resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const labels={agents:'ĐẶC VỤ',weapons:'VŨ KHÍ',maps:'BẢN ĐỒ',playable:'NHÂN VẬT VÀ KỸ NĂNG',match:'TÀI NGUYÊN TRẬN ĐẤU',menu:'GIAO DIỆN',fonts:'PHÔNG CHỮ',ui:'GIAO DIỆN',vendor:'BỘ DỰNG HÌNH'};
  const size=value=>(value/1024**2).toLocaleString('vi-VN',{maximumFractionDigits:1})+' MB';
  async function downloadAll(manifest,report){
    if(!manifest||!Array.isArray(manifest.entries)||!manifest.entries.length)throw Error('Danh sách tài nguyên không hợp lệ.');
    const seen=new Set(),keyFor=entry=>new URL(entry.url+'?vs_asset='+entry.revision,location.origin).href;
    for(const entry of manifest.entries){const url=new URL(entry.url,location.origin),path=decodeURIComponent(url.pathname);if(url.origin!==location.origin||!/^\/(assets|js|css|screens|game)\//.test(path)||path.startsWith('/game/')&&path.endsWith('.html')||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.revision)||seen.has(path))throw Error('Danh sách tài nguyên không hợp lệ.');seen.add(path);}
    const cache=await caches.open('vs-assets-1'),expected=new Set(manifest.entries.map(keyFor));
    for(const request of await cache.keys())if(!expected.has(request.url))await cache.delete(request);
    const saved=new Set((await cache.keys()).map(request=>request.url));
    let completed=0,loaded=0,displayedLoaded=0,lastReport=0,stopped=false;const pending=[];
    for(const entry of manifest.entries){if(saved.has(keyFor(entry))){completed++;loaded+=entry.bytes;}else pending.push(entry);}
    const total=manifest.entries.reduce((sum,entry)=>sum+entry.bytes,0);
    const progress=(entry,force=false)=>{const now=Date.now();if(!force&&now-lastReport<100)return;lastReport=now;displayedLoaded=Math.max(displayedLoaded,loaded);report({type:'progress',loaded:displayedLoaded,total,completed,count:manifest.entries.length,category:entry?.url.split('/')[2]||'assets'});};progress(null,true);
    const storage=await navigator.storage?.estimate?.();if(storage?.quota&&storage.quota-storage.usage<total-loaded)throw Error('Bộ nhớ trình duyệt không đủ để lưu toàn bộ tài nguyên. Hãy giải phóng dung lượng rồi thử lại.');
    const abort=new AbortController();
    async function download(entry){for(let attempt=0;attempt<5;attempt++){let received=0;try{
      const response=await fetch(keyFor(entry),{cache:'no-store',credentials:'same-origin',signal:abort.signal});if(!response.ok||response.status!==200)throw Error('Tải tài nguyên thất bại ('+response.status+').');
      const reader=response.body.getReader(),headers=new Headers(response.headers);headers.delete('content-encoding');headers.set('content-length',String(entry.bytes));
      const stream=new ReadableStream({async pull(controller){try{const chunk=await reader.read();if(chunk.done){if(received!==entry.bytes)throw Error('Tài nguyên tải chưa đủ dung lượng.');controller.close();return;}received+=chunk.value.byteLength;loaded+=chunk.value.byteLength;progress(entry);controller.enqueue(chunk.value);}catch(error){controller.error(error);}},cancel(reason){return reader.cancel(reason);}});
      await cache.put(keyFor(entry),new Response(stream,{status:200,headers}));completed++;progress(entry,true);return;
    }catch(error){loaded-=received;await cache.delete(keyFor(entry)).catch(()=>{});progress(entry,true);if(stopped||error.name==='QuotaExceededError'||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}}}
    const results=await Promise.allSettled(Array.from({length:Math.min(3,pending.length)},async()=>{while(pending.length&&!stopped){try{await download(pending.shift());}catch(error){stopped=true;abort.abort();throw error;}}}));
    const failure=results.find(result=>result.status==='rejected');if(failure){if(failure.reason.name==='QuotaExceededError')throw Error('Bộ nhớ trình duyệt đã đầy. Hãy giải phóng dung lượng rồi thử lại.');throw failure.reason;}
    report({type:'done',loaded:total,total,completed:manifest.entries.length,count:manifest.entries.length});
  }
  function screen(){
    if(overlay)return;
    overlay=document.createElement('section');overlay.id='asset-loading';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
    overlay.innerHTML='<div class="asset-brand">VAL<span>STRIKE</span></div><div class="asset-card"><p class="asset-kicker">CHUẨN BỊ TÀI NGUYÊN</p><h1>ĐANG TẢI GAME</h1><p id="asset-phase">Đang kiểm tra tài nguyên…</p><progress id="asset-progress" max="100" value="0"></progress><div class="asset-stats"><strong id="asset-percent">0%</strong><span id="asset-bytes"></span></div><p id="asset-count"></p><p class="asset-note">Vui lòng giữ trang này mở. Tài nguyên đã tải được lưu để dùng cho lần sau.</p><p id="asset-error" role="alert"></p><button id="asset-retry" hidden>THỬ LẠI</button></div>';
    document.body.appendChild(overlay);overlay.querySelector('#asset-retry').onclick=()=>{active=null;run();};
  }
  const domReady=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
  async function prepare(){
    await domReady;screen();overlay.querySelector('#asset-error').textContent='';overlay.querySelector('#asset-retry').hidden=true;
    if(!window.isSecureContext||!navigator.serviceWorker||!window.caches)throw Error('Trình duyệt cần hỗ trợ lưu tài nguyên và kết nối HTTPS để mở game.');
    const response=await fetch('/assets/preload-manifest.json',{cache:'no-store'});if(!response.ok)throw Error('Không tải được danh sách tài nguyên ('+response.status+').');
    const manifest=await response.json();
    await navigator.serviceWorker.register('/asset-worker.js',{scope:'/',updateViaCache:'none'});
    const registration=await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>{const changed=()=>{if(navigator.serviceWorker.controller){navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};navigator.serviceWorker.addEventListener('controllerchange',changed);changed();});
    const worker=navigator.serviceWorker.controller||registration.active;
    const report=data=>{
      const percent=data.total?Math.min(100,100*data.loaded/data.total):100;
      overlay.querySelector('#asset-progress').value=percent;overlay.querySelector('#asset-percent').textContent=percent.toFixed(1)+'%';
      overlay.querySelector('#asset-bytes').textContent=size(data.loaded)+' / '+size(data.total);
      overlay.querySelector('#asset-count').textContent=data.completed.toLocaleString('vi-VN')+' / '+data.count.toLocaleString('vi-VN')+' tài nguyên';
      overlay.querySelector('#asset-phase').textContent=data.type==='done'?'Tất cả tài nguyên đã sẵn sàng.':'Đang tải '+(labels[data.category]||'TÀI NGUYÊN GAME').toLowerCase()+'…';
    };
    const transient=error=>error?.name==='TypeError'||error?.name==='NetworkError'||/network|fetch|cache\.put/i.test(error?.message||'');
    let lastError;
    for(let cycle=0;cycle<3;cycle++)try{
      if(navigator.locks)await navigator.locks.request('vs-assets-download',()=>downloadAll(manifest,report));
      else await downloadAll(manifest,report);
      lastError=null;break;
    }catch(error){lastError=error;if(!transient(error)||cycle===2)throw error;await new Promise(resolve=>setTimeout(resolve,1500*(cycle+1)));}
    if(lastError)throw lastError;
    await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>{channel.port1.close();reject(Error('Không kích hoạt được tài nguyên đã tải. Hãy thử lại.'));},15000);
      channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();event.data.type==='done'?resolve():reject(Error(event.data.message));};
      worker.postMessage({type:'manifest',manifest},[channel.port2]);
    });
    resolveReady();
    if(document.documentElement.dataset.assetBoot!=='menu'){document.documentElement.classList.remove('assets-pending');overlay.remove();overlay=null;}
  }
  function run(){if(active)return active;active=prepare().catch(error=>{screen();overlay.querySelector('#asset-error').textContent=error.message;overlay.querySelector('#asset-retry').hidden=false;throw error;});active.catch(()=>{});return active;}
  window.VSAssets={ready:()=>{run();return ready;}};
  if(document.documentElement.dataset.assetBoot==='menu')window.VSAssets.ready().then(async()=>{
    for(const src of ['/js/state.js?v=42','/js/profile.js?v=64','/assets/vendor/babylon.js?v=8.32.0','/assets/vendor/babylonjs.loaders.min.js?v=8.32.0','/js/agents.js?v=64','/js/network.js?v=56','/js/chat.js?v=57','/js/agent-viewer.js?v=50','/game/maps.js?v=53','/js/menu.js?v=64','/js/router.js?v=42'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Không mở được game. Hãy tải lại trang.'));document.body.appendChild(script);});
    await VS.navigate(location.pathname,true);
    document.documentElement.classList.remove('assets-pending');overlay?.remove();overlay=null;
  }).catch(error=>{document.documentElement.classList.add('assets-pending');screen();overlay.querySelector('#asset-error').textContent=error.message;overlay.querySelector('#asset-retry').hidden=false;overlay.querySelector('#asset-retry').onclick=()=>location.reload();});
})();
