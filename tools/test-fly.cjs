// Exercise production viewer controls/marker restoration without allocating WebGL.
const { JSDOM, VirtualConsole } = require('jsdom');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const errors = [], output = new VirtualConsole();
  output.on('jsdomError', error => errors.push(error.message));
  const dom = await JSDOM.fromURL('http://127.0.0.1:8455/game/test.html?map=abyss', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: output,
    beforeParse(window) { window.fetch = input => fetch(new URL(input, window.location.href)); }
  });
  const w = dom.window, run = code => vm.runInContext(code, dom.getInternalVMContext());
  try {
    const started = Date.now();
    while (w.document.readyState !== 'complete') {
      if (Date.now() - started > 10000) throw new Error('Viewer startup timeout');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await w.CONFIG_READY;
    assert.equal(w.BABYLON.Engine.Instances.length, 0);
    w.localStorage.setItem('vs_markers', JSON.stringify([{ name: 'SPAWN_1', x: 1, y: 0, z: 1 }]));
    // Map/BVH are checked separately. Substitute only the GPU/map initialization.
    run(`initEngine = async function () {
      engine = new BABYLON.NullEngine(); scene = new BABYLON.Scene(engine);
      buildPlaceholderMap(); window.VS_SPAWN = new BABYLON.Vector3(0, 1.7, -14);
    }`);
    w.document.getElementById('renderCanvas').requestPointerLock = () => Promise.reject(new Error('No pointer lock in this test'));
    w.document.getElementById('initialize-viewer').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(run('scene.activeCamera.name'), 'fly');
    assert.equal(run('markers.length'), 1);
    assert.equal(run("scene.meshes.filter(mesh => mesh.name === 'SPAWN_1').length"), 1);
    w.document.getElementById('loading-overlay').click();
    assert.equal(w.__gamePlaying, true);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20)); run('scene.render()');
    const x = run('flyCam.position.x'); assert.ok(x > 0);
    w.dispatchEvent(new w.Event('blur'));
    assert.equal(w.__gamePlaying, false);
    w.document.getElementById('loading-overlay').click();
    await new Promise(resolve => setTimeout(resolve, 20)); run('scene.render()');
    assert.equal(run('flyCam.position.x'), x, 'Blur must clear held keys');
    w.document.getElementById('clear-markers').click();
    assert.equal(w.localStorage.getItem('vs_markers'), '[]');
    assert.equal(run('markers.length'), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS viewer config/load flow, restored markers, blur cleanup, clear persistence; NullEngine only');
  } finally {
    run('if (scene) scene.dispose(); if (engine) engine.dispose()'); w.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
