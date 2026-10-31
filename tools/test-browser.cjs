// Bounded real WebGL smoke test. One small tab; stop if available RAM drops below 1 GiB.
const { createRequire } = require('node:module');
const { chromium } = createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const mode = ['abyss', 'fly', 'reference'].includes(process.argv[2]) ? 'abyss' : 'range';
const artifacts = path.join(__dirname, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  assert.ok(os.freemem() > 1.5 * 1024 ** 3, 'Need at least 1.5 GiB available RAM before starting');
  let browser, server, guard, deadline, stopped;
  let minFree = os.freemem();
  const shutdown = async reason => {
    stopped = reason;
    console.error(reason);
    await server?.close();
  };
  try {
    server = await chromium.launchServer({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true, timeout: 12000, args: ['--no-first-run', '--disable-extensions', '--js-flags=--max-old-space-size=192'] });
    deadline = setTimeout(() => shutdown('60 second browser deadline reached'), 60000);
    guard = setInterval(() => {
      minFree = Math.min(minFree, os.freemem());
      if (minFree < 1024 ** 3) shutdown('RAM guard: less than 1 GiB available');
    }, 1000);
    browser = await chromium.connect(server.wsEndpoint());
    const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', error.message); });
    page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error('CONSOLE ERROR', message.text()); } });
    if (mode === 'abyss') {
      for (const event of ['request', 'requestfinished', 'requestfailed']) page.on(event, request => {
        if (/manifest\.json|collision\.glb|palette\.png/.test(request.url())) console.log(event, new Date().toISOString(), request.url());
      });
    }
    if (process.argv[2] === 'fly') {
      await page.goto('http://127.0.0.1:8455/game/test.html?map=abyss', { waitUntil: 'load', timeout: 15000 });
      await page.waitForFunction(() => !document.getElementById('initialize-viewer').disabled);
      assert.equal(await page.evaluate(() => BABYLON.Engine.Instances.length), 0);
      await page.locator('#initialize-viewer').click();
      await page.waitForFunction(() => scene?.activeCamera?.name === 'fly');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => scene.getFrameId()), 1);
      assert.equal(errors.length, 0, errors.join('\n'));
      await page.screenshot({ path: path.join(artifacts, 'fly-ready.png') });
      console.log('PASS fly viewer explicitly loads streamed low-poly map and stays paused; no JavaScript errors');
      return;
    }
    await page.goto('http://127.0.0.1:8455/game/game.html?map=' + mode, { waitUntil: 'load', timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById('initialize-game').disabled);
    assert.equal(await page.evaluate(() => BABYLON.Engine.Instances.length), 0);
    await page.locator('#initialize-game').click();
    await page.waitForFunction(() => !document.getElementById('play-unlocked').disabled, undefined, { timeout: 45000 });
    await page.locator('#play-unlocked').click();
    await page.waitForFunction(() => window.__viewmodelStatus?.state === 'ready', { timeout: 10000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifacts, mode + '-spawn.png') });
    if (process.argv[2] === 'reference') {
      const referenceStats = await page.evaluate(async () => {
        BABYLON.DracoDecoder.DefaultConfiguration = { numWorkers: 0, wasmUrl: '/game/draco/draco_wasm_wrapper.js',
          wasmBinaryUrl: '/game/draco/draco_decoder.wasm', fallbackUrl: '/game/draco/draco_decoder.js' };
        window.mapStreamer.dispose();
        playerController.pause();
        document.getElementById('loading-overlay').style.display = 'none';
        const source = await BABYLON.SceneLoader.ImportMeshAsync('', '/assets/maps/optimized/', 'abyss_lowpoly.glb', scene);
        for (const mesh of source.meshes.filter(mesh => mesh.parent === source.meshes[0] && !/sky|dome/i.test(mesh.name))) mesh.scaling.scaleInPlace(window.__mapTransform.scale);
        source.meshes.forEach(mesh => { if (/sky|dome/i.test(mesh.name)) mesh.setEnabled(false); });
        scene.render();
        return { camera: camera.position.asArray(), rotation: camera.rotation.asArray(), meshes: source.meshes.slice(0, 3).map(mesh => ({ name: mesh.name,
          vertices: mesh.getTotalVertices(), enabled: mesh.isEnabled(), visible: mesh.isVisible,
          matrix: mesh.computeWorldMatrix(true).asArray(),
          positions: mesh.getVerticesData('position')?.slice(0, 12), normals: mesh.getVerticesData('normal')?.slice(0, 9),
          indices: mesh.getIndices()?.slice(0, 12),
          material: mesh.material && {color:mesh.material.albedoColor.asArray(), texture:mesh.material.albedoTexture?.isReady(), metallic:mesh.material.metallic, roughness:mesh.material.roughness},
          min: mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(), max: mesh.getBoundingInfo().boundingBox.maximumWorld.asArray() })) };
      });
      console.log('reference geometry', JSON.stringify(referenceStats));
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(artifacts, 'reference-lowpoly.png') });
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS direct original GLB reference captured at corresponding camera pose');
      return;
    }
    const before = await page.evaluate(() => playerController.getState());
    await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => playerController.getState());
    if (mode === 'range') assert.ok(after.feet[0] - before.feet[0] > 1, 'D must move right in actual rendering');
    await page.mouse.click(320, 200);
    assert.equal(await page.evaluate(() => weaponState.ammo.Classic.clip), 11, 'Real pointer click must consume a round');
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(2400);
    assert.equal(await page.evaluate(() => weaponState.reloading), false);
    assert.equal(await page.evaluate(() => weaponState.ammo.Classic.clip), 12);
    assert.equal(await page.evaluate(() => weaponState.ammo.Classic.reserve), 35);
    await page.screenshot({ path: path.join(artifacts, mode + '-classic.png') });
    await page.mouse.down({ button: 'right' });
    assert.equal(await page.evaluate(() => weaponState.ammo.Classic.clip), 9, 'Classic alternate fire must spend three rounds');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => weaponState.ammo.Classic.clip), 9, 'Holding Classic alternate fire must not repeat');
    await page.mouse.up({ button: 'right' });
    await page.keyboard.press('Digit1');
    await page.waitForFunction(() => window.__viewmodelStatus?.weapon === 'Vandal' && window.__viewmodelStatus.state === 'ready');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifacts, mode + '-vandal.png') });
    await page.mouse.down({ button: 'right' });
    assert.equal(await page.evaluate(() => weaponState.ads), true);
    await page.mouse.down(); await page.waitForTimeout(320); await page.mouse.up();
    const adsClip = await page.evaluate(() => weaponState.ammo.Vandal.clip);
    assert.ok(adsClip < 25, 'Vandal must fire when primary is pressed while ADS is held');
    assert.equal(await page.evaluate(() => weaponState.ads), true, 'Releasing primary must keep ADS active');
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => weaponState.ammo.Vandal.clip), adsClip, 'Primary release while holding ADS must stop fire');
    await page.mouse.up({ button: 'right' });
    assert.equal(await page.evaluate(() => weaponState.ads), false);
    const hipClip = await page.evaluate(() => weaponState.ammo.Vandal.clip);
    await page.mouse.down(); await page.waitForTimeout(320); await page.mouse.up();
    const stoppedClip = await page.evaluate(() => weaponState.ammo.Vandal.clip);
    assert.ok(hipClip - stoppedClip >= 3 && hipClip - stoppedClip <= 5, 'Holding fire must shoot repeatedly');
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => weaponState.ammo.Vandal.clip), stoppedClip, 'Releasing pointer must stop firing');
    await page.evaluate(() => weaponSwitch('Odin'));
    await page.waitForFunction(() => window.__viewmodelStatus?.weapon === 'Odin' && window.__viewmodelStatus.state === 'ready' && weaponNow() >= weaponState.equipUntil);
    const odinClip = await page.evaluate(() => weaponState.ammo.Odin.clip);
    await page.mouse.down({ button: 'right' }); await page.mouse.down(); await page.waitForTimeout(320); await page.mouse.up();
    assert.ok(await page.evaluate(() => weaponState.ammo.Odin.clip) < odinClip - 1, 'Odin must fire while ADS is held');
    assert.equal(await page.evaluate(() => weaponState.ads), true);
    const stoppedOdin = await page.evaluate(() => weaponState.ammo.Odin.clip);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => weaponState.ammo.Odin.clip), stoppedOdin);
    await page.mouse.up({ button: 'right' });
    console.log('PASS real Classic ammo/hold behavior and Vandal/Odin mouse button chords');
    if (process.argv[2] === 'guns') {
      const names = await page.evaluate(() => Object.entries(weaponDefs()).filter(([, def]) => def.model).map(([name]) => name));
      for (const name of names) {
        await page.evaluate(name => weaponSwitch(name), name);
        await page.waitForFunction(name => window.__viewmodelStatus?.weapon === name && window.__viewmodelStatus.state === 'ready' && weaponNow() >= weaponState.equipUntil, name);
        await page.screenshot({ path: path.join(artifacts, 'gun-' + name.toLowerCase() + '.png') });
        const initialClip = await page.evaluate(() => weaponState.ammo[weaponState.current]?.clip);
        await page.mouse.click(320, 200); await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => weaponState.ammo[weaponState.current]?.clip), initialClip === undefined ? undefined : initialClip - 1,
          name + ' ' + JSON.stringify(await page.evaluate(() => ({ playing: window.__gamePlaying, now: weaponNow(), equip: weaponState.equipUntil, reload: weaponState.reloading, hit: document.elementFromPoint(320, 200)?.outerHTML.slice(0, 150) }))));
        assert.equal(await page.evaluate(() => scene.skeletons.length), 1);
        assert.ok(await page.evaluate(() => scene.textures.length <= 10)); // four S0 maps + optional four skin maps + map palette
        console.log('PASS real rendered gun', name);
      }
    }
    if (mode === 'abyss') {
      const first = await page.evaluate(() => [...mapStreamer.resident.keys()]);
      await page.evaluate(() => { camera.rotation.y += Math.PI; mapStreamer.update(camera, true); });
      await page.waitForFunction(() => window.__mapStreamStats.missingChunks === 0, undefined, { timeout: 15000 });
      await page.waitForTimeout(6500);
      const rotated = await page.evaluate(() => ({ files: [...mapStreamer.resident.keys()], stats: window.__mapStreamStats, grounded: playerController.getState().grounded }));
      assert.ok(first.some(file => !rotated.files.includes(file)), 'Real camera turn must evict old off-screen geometry');
      assert.ok(rotated.files.some(file => !first.includes(file)), 'Real camera turn must load new geometry');
      assert.ok(rotated.stats.residentMB <= rotated.stats.maxResidentMB);
      assert.equal(rotated.grounded, true, 'Visual streaming must not unload the floor collision');
      await page.screenshot({ path: path.join(artifacts, 'abyss-rotated.png') });
      console.log('PASS actual camera turn, chunk loading/eviction, budget and persistent floor collision');
    }
    const frame = await page.evaluate(() => scene.getFrameId());
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => ({ frames: scene.getFrameId(), width: engine.getRenderWidth(), height: engine.getRenderHeight(),
      meshes: scene.meshes.length, textures: scene.textures.length, triangles: scene.meshes.reduce((n, mesh) => n + mesh.getTotalIndices() / 3, 0),
      player: playerController.getState(), viewmodel: window.__viewmodelStatus, errors: window.__errs,
      fallback: !!window.__mapFallback, renderer: engine.getGlInfo(), streaming: window.__mapStreamStats,
      activeTriangles: scene.getActiveIndices() / 3 }));
    stats.fps = stats.frames - frame; stats.minAvailableMB = Math.round(minFree / 1024 ** 2);
    assert.equal(stopped, undefined); assert.equal(errors.length, 0, errors.join('\n')); assert.equal(stats.errors.length, 0);
    assert.equal(stats.fallback, false); assert.ok(stats.fps > 0 && stats.fps <= 32);
    assert.ok(stats.width <= 960 && stats.height <= 600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const paused = await page.evaluate(() => scene.getFrameId());
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => scene.getFrameId()), paused, 'Pause must stop rendering');
    fs.writeFileSync(path.join(artifacts, (process.argv[2] === 'guns' ? 'guns' : mode) + '-stats.json'), JSON.stringify(stats, null, 2));
    console.log('PASS real browser', JSON.stringify(stats));
  } finally {
    clearTimeout(deadline); clearInterval(guard);
    await browser?.close(); await server?.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
