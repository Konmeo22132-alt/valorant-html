// Load the production HTML/scripts without opening a browser or creating WebGL.
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const assert = require('node:assert/strict');
class CPUResources extends ResourceLoader {
  fetch(url,options){
    // Exercise automatic preview requests and lifecycle while replacing only
    // the GPU renderer. All routing, UI, config and transport scripts are real.
    if(new URL(url).pathname==='/js/agent-viewer.js')return Promise.resolve(Buffer.from(`window.__agentViewers=new Set();window.__previewRequests=[];window.VSAgentViewer=function(canvas,file){window.__previewRequests.push(file);const handle={load(next){window.__previewRequests.push(next);},dispose(){window.__agentViewers.delete(handle);}};window.__agentViewers.add(handle);return handle;};`));
    return super.fetch(url,options);
  }
}
async function page(url) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = await JSDOM.fromURL(url, { runScripts: 'dangerously', resources: new CPUResources(), pretendToBeVisual: true,
    virtualConsole, beforeParse(window) {
      window.fetch = (input, init) => fetch(new URL(input, window.location.href), init);
      window.scrollTo = () => {};
    } });
  const started = Date.now();
  while (dom.window.document.readyState !== 'complete') {
    if (Date.now() - started > 10000) throw new Error('Startup timeout');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { dom, errors };
}
(async () => {
  for (const suffix of ['/game/game.html', '/game/game.html?map=abyss', '/game/test.html']) {
    const { dom, errors } = await page('http://127.0.0.1:8455' + suffix);
    try {
      if (dom.window.CONFIG_READY) await dom.window.CONFIG_READY;
      assert.equal(dom.window.BABYLON.Engine.Instances.length, 0, 'Opening a page must not initialize WebGL');
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS idle startup without WebGL:', suffix);
    } finally { dom.window.close(); }
  }
  const { dom, errors } = await page('http://127.0.0.1:8455/');
  try {
    const deadline=Date.now()+10000;while (!dom.window.document.querySelector('.home-stage canvas')){if(Date.now()>deadline)throw Error('Menu startup timeout');await new Promise(resolve => setTimeout(resolve, 10));}
    assert.equal(dom.window.__previewRequests.length,1,'home requests its real default model automatically');
    for (const route of ['/agents', '/collection', '/career', '/settings', '/play', '/']) await dom.window.VS.navigate(route);
    assert.equal(dom.window.BABYLON.Engine.Instances.length, 0);
    assert.equal(dom.window.__agentViewers.size, 1);
    assert.equal(errors.length, 0, errors.join('\n'));
    const old=dom.window.VS.navigate('/agents'),latest=dom.window.VS.navigate('/settings');await Promise.all([old,latest]);assert(dom.window.document.querySelector('#settings-form'),'latest route wins');assert.equal(dom.window.__agentViewers.size,0);
    console.log('PASS six production menu routes, automatic preview requests/disposal and rapid navigation; preview renderer stubbed');
  } finally { dom.window.close(); }
  console.log('PASS production startup and route scripts; no GPU used');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
