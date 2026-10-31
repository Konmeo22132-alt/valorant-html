// Controller/weapon regression checks without a browser, WebGL or GPU allocation.
const { JSDOM } = require('jsdom');
const BABYLON = require('babylonjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'val-strike-html');
function harness(spawn = [0, 1.7, -14], models = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'game/game.html'), 'utf8'), { url: 'http://localhost/game/game.html' + (models ? '' : '?models=0'), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.BABYLON = BABYLON; w.console = { log() {}, warn() {}, error: console.error };
  w.GAME_CONFIG = Object.fromEntries(['movement', 'weapons', 'rounds', 'performance'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'game/config', name + '.json')))]));
  const run = code => vm.runInContext(code, dom.getInternalVMContext());
  for (const name of ['js/state.js', 'game/collision-world.js', 'game/engine.js', 'game/actor-motion.js', 'game/player.js', 'game/ui-overlay.js', 'game/weapon-models.js', 'game/weapons.js', 'game/range.js']) run(fs.readFileSync(path.join(root, name), 'utf8'));
  run(`engine = new BABYLON.NullEngine({renderWidth:640,renderHeight:400}); scene = new BABYLON.Scene(engine); buildPlaceholderMap(); window.collisionWorld = new CollisionWorld(scene.meshes); window.VS_SPAWN = new BABYLON.Vector3(${spawn.join(',')}); initPlayer(); playerController.resume(); window.__gameTime=weaponState.equipUntil; weaponState.equipUntil=0;`);
  const key = (code, down = true, options = {}) => w.document.getElementById('renderCanvas').dispatchEvent(new w.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true, ...options }));
  let buttons = 0;
  const mouse = (button, down = true) => {
    const mask = [1, 4, 2][button], previous = buttons;
    buttons = down ? buttons | mask : buttons & ~mask;
    const type = down ? (previous ? 'pointermove' : 'pointerdown') : (buttons ? 'pointermove' : 'pointerup');
    const target = type === 'pointerup' ? w.document : w.document.getElementById('renderCanvas');
    target.dispatchEvent(new w.MouseEvent(type, { button, buttons, bubbles: true }));
  };
  const frame = (count = 1, dt = 1 / 60) => { for (let i = 0; i < count; i++) run(`window.__frameDT = ${dt}; scene.render();`); };
  const state = () => w.playerController.getState();
  const read = run;
  const close = () => { run('scene.dispose(); engine.dispose();'); w.close(); };
  return { w, key, mouse, frame, state, read, close };
}
function runChecks() {
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS', name); }
check('idle gravity and ground stay stable', () => {
  const h = harness(); h.frame(180); assert.equal(h.state().grounded, true); assert.ok(Math.abs(h.read('camera.position.y') - 1.7) < 0.001); h.close();
});
const distances = {};
for (const [name, codes] of [['run', ['KeyD']], ['walk', ['KeyD', 'ShiftLeft']], ['diagonal', ['KeyD', 'KeyW']]]) check(name + ' movement', () => {
  const h = harness(); codes.forEach(code => h.key(code)); h.frame(60); const p = h.state().feet;
  distances[name] = Math.hypot(p[0], p[2] + 14); h.close();
});
assert.ok(distances.run > 5.3 && distances.run < 5.74);
assert.ok(distances.walk / distances.run > 0.64 && distances.walk / distances.run < 0.71);
assert.ok(Math.abs(distances.diagonal - distances.run) < 0.03);
check('movement timing does not depend on render FPS', () => {
  const distancesByFPS = [30, 60, 120].map(fps => { const h = harness(); h.key('KeyD'); h.frame(fps, 1 / fps); const x = h.state().feet[0]; h.close(); return x; });
  assert.ok(Math.max(...distancesByFPS) - Math.min(...distancesByFPS) < 0.1);
});
check('walls block and slide', () => {
  const h = harness([-24, 1.7, -14]); h.key('KeyA'); h.key('KeyW'); h.frame(120);
  assert.ok(h.state().feet[0] >= -24.16); assert.ok(h.state().feet[2] > -8); h.close();
});
check('held jump jumps once and lands', () => {
  const h = harness(); h.frame(1); h.key('Space'); let peak = 0;
  for (let i = 0; i < 150; i++) { h.frame(); peak = Math.max(peak, h.state().feet[1]); if (i > 90) assert.ok(h.state().feet[1] < 0.001); }
  assert.ok(peak > 0.9 && peak < 1.1); assert.equal(h.state().grounded, true); h.close();
});
check('crouch preserves feet; low ceiling prevents standing', () => {
  const h = harness([-7, 1.7, -5]); h.key('KeyC'); h.frame(30);
  assert.ok(h.state().feet[1] < 0.001); assert.ok(Math.abs(h.read('camera.position.y') - 1.25) < 0.01);
  h.key('KeyC', false); h.frame(30); assert.equal(h.state().crouching, true);
  h.key('KeyW'); h.frame(90); h.key('KeyW', false); h.frame(30); assert.equal(h.state().crouching, false); h.close();
});
check('C plus W crouches and moves without requiring a browser modifier', () => {
  const h = harness(); h.key('KeyC'); h.key('KeyW'); h.frame(60);
  assert.equal(h.state().crouching, true);
  assert.ok(h.state().feet[2] > -12 && h.state().feet[2] < -10.8);
  h.key('KeyC', false); h.key('KeyW', false); h.frame(30);
  assert.equal(h.state().crouching, false); h.close();
});
check('Ctrl crouch is disabled until fullscreen keyboard lock is granted', () => {
  const h = harness(); h.key('ControlLeft'); h.frame(20);
  assert.equal(h.state().crouching, false); assert.equal(h.state().keyboardLocked, false);
  h.close();
});
check('step climbing', () => {
  const h = harness([7, 1.7, -9]); h.key('KeyW'); let peak = 0;
  for (let i = 0; i < 55; i++) { h.frame(); peak = Math.max(peak, h.state().feet[1]); }
  assert.ok(peak >= 0.7, 'must climb all four steps'); h.close();
});
check('semi-auto fires once on hold and recoil goes up', () => {
  const h = harness(); h.frame(); h.mouse(0); h.frame(60); h.mouse(0, false);
  assert.equal(h.read('weaponState.ammo.Classic.clip'), 11); assert.ok(h.read('camera.rotation.x') < 0); h.close();
});
check('reload completes with correct reserve and freezes while paused', () => {
  const h = harness(); h.mouse(0); h.mouse(0, false); h.key('KeyR'); h.frame(30);
  h.w.playerController.pause(); h.frame(180); assert.equal(h.read('weaponState.reloading'), true);
  h.w.playerController.resume(); h.frame(90); assert.equal(h.read('weaponState.reloading'), false);
  assert.equal(h.read('weaponState.ammo.Classic.clip'), 12); assert.equal(h.read('weaponState.ammo.Classic.reserve'), 35); h.close();
});
check('weapon switch cancels reload, ADS and held fire', () => {
  const h = harness(); h.mouse(0); h.mouse(0, false); h.key('KeyR'); h.key('Digit1'); h.frame(90);
  assert.equal(h.read('weaponState.current'), 'Vandal'); assert.equal(h.read('weaponState.reloading'), false);
  assert.equal(h.read('weaponState.ammo.Classic.clip'), 11);
  h.mouse(2); assert.equal(h.read('weaponState.ads'), true); h.key('Digit2'); assert.equal(h.read('weaponState.ads'), false);
  assert.equal(h.read('camera.fov'), 1.4); h.close();
});
check('auto-fire, bloom recovery and pause input cleanup', () => {
  const h = harness(); h.key('Digit1'); h.frame(65); h.mouse(0); h.frame(60); h.mouse(0, false);
  const clip = h.read('weaponState.ammo.Vandal.clip'); assert.ok(clip >= 15 && clip <= 17);
  h.frame(30); assert.equal(h.read('weaponState.bloomShots'), 0);
  h.key('KeyW'); h.mouse(0); h.w.playerController.pause(); assert.equal(h.state().keys.length, 0); assert.equal(h.read('weaponState.shooting'), false); h.close();
});
check('melee slot, attack and reload do not throw', () => {
  const h = harness(); h.key('Digit3'); h.frame(60); h.mouse(0); h.frame(60); h.mouse(0, false); h.key('KeyR');
  assert.equal(h.read('weaponState.current'), 'Melee'); assert.equal(h.read('weaponState.reloading'), false); assert.equal(h.read('window.__errs.length'), 0); h.close();
});
check('ADS burst fires exact round count', () => {
  const h = harness(); h.read("weaponSwitch('Bulldog')"); h.frame(65); h.mouse(2); h.mouse(0); h.frame(60); h.mouse(0, false); h.mouse(2, false);
  assert.equal(h.read('weaponState.ammo.Bulldog.clip'), 21); h.close();
});
check('Classic alternate fire and hitzone damage', () => {
  const h = harness(); h.mouse(2); h.mouse(2, false); assert.equal(h.read('weaponState.ammo.Classic.clip'), 9);
  assert.equal(h.read("weaponDamageAt(weaponDef('Vandal'), 40, 'body')"), 40);
  assert.equal(h.read("weaponDamageAt(weaponDef('Classic'), 40, 'head')"), 66); h.close();
});
check('Classic alt fire consumes one round per projectile and does not repeat on hold', () => {
  const h = harness(); h.read('window.__projectiles = 0; weaponResolveHit = () => window.__projectiles++');
  h.mouse(2); h.frame(90);
  assert.equal(h.read('window.__projectiles'), 3); assert.equal(h.read('weaponState.ammo.Classic.clip'), 9);
  h.mouse(2, false); h.mouse(2);
  assert.equal(h.read('window.__projectiles'), 6); assert.equal(h.read('weaponState.ammo.Classic.clip'), 6);
  h.mouse(2, false); h.frame(10); h.mouse(2); h.mouse(2, false);
  assert.equal(h.read('window.__projectiles'), 6, 'Alt-fire cooldown must block rapid presses');
  h.frame(20); h.mouse(2); h.mouse(2, false);
  assert.equal(h.read('window.__projectiles'), 9); assert.equal(h.read('weaponState.ammo.Classic.clip'), 3);
  h.close();
});
check('Classic alt fire never creates more projectiles than remaining rounds', () => {
  const h = harness(); h.read('window.__projectiles = 0; weaponResolveHit = () => window.__projectiles++');
  for (const remaining of [1, 2]) {
    h.read('weaponState.ammo.Classic.clip = ' + remaining); h.frame(30);
    const before = h.read('window.__projectiles'); h.mouse(2); h.mouse(2, false);
    assert.equal(h.read('weaponState.ammo.Classic.clip'), 0);
    assert.equal(h.read('window.__projectiles') - before, remaining);
  }
  h.close();
});
check('Classic alt fire creates exactly three wall marks for three rounds', () => {
  const h = harness([-15, 1.7, 0]); h.frame(); h.mouse(2); h.frame(90);
  assert.equal(h.read('bulletHoles.length'), 3); assert.equal(h.read('weaponState.ammo.Classic.clip'), 9);
  h.mouse(2, false); h.close();
});
for (const name of ['Vandal', 'Odin']) check(name + ' fires while holding ADS and releases each button independently', () => {
  const h = harness(); h.read("weaponSwitch('" + name + "')"); h.frame(100);
  const initial = h.read('weaponState.ammo[weaponState.current].clip');
  h.mouse(2); assert.equal(h.read('weaponState.ads'), true);
  h.mouse(0); h.frame(20);
  assert.ok(h.read('weaponState.ammo[weaponState.current].clip') < initial - 1);
  h.mouse(0, false);
  const stopped = h.read('weaponState.ammo[weaponState.current].clip');
  assert.equal(h.read('weaponState.ads'), true); h.frame(20);
  assert.equal(h.read('weaponState.ammo[weaponState.current].clip'), stopped);
  h.mouse(0); assert.ok(h.read('weaponState.ammo[weaponState.current].clip') < stopped);
  h.mouse(2, false); assert.equal(h.read('weaponState.ads'), false);
  const hip = h.read('weaponState.ammo[weaponState.current].clip'); h.frame(20);
  assert.ok(h.read('weaponState.ammo[weaponState.current].clip') < hip, 'Releasing ADS must keep held primary fire active');
  h.mouse(0, false); h.close();
});
check('Shotgun pellets still consume one shell', () => {
  const h = harness(); h.read("weaponSwitch('Shorty'); window.__projectiles = 0; weaponResolveHit = () => window.__projectiles++"); h.frame(100);
  h.mouse(0); h.mouse(0, false);
  assert.equal(h.read('weaponState.ammo.Shorty.clip'), 1); assert.equal(h.read('window.__projectiles'), 15); h.close();
});
check('ADS chords stop firing when primary is released outside the canvas', () => {
  const h = harness(); h.read("weaponSwitch('Vandal')"); h.frame(100); h.mouse(2); h.mouse(0); h.frame(20);
  h.w.document.dispatchEvent(new h.w.MouseEvent('pointermove', { button: 0, buttons: 2, bubbles: true }));
  const clip = h.read('weaponState.ammo.Vandal.clip'); h.frame(20);
  assert.equal(h.read('weaponState.ammo.Vandal.clip'), clip); assert.equal(h.read('weaponState.ads'), true);
  h.w.document.dispatchEvent(new h.w.MouseEvent('pointerup', { button: 2, buttons: 0, bubbles: true }));
  assert.equal(h.read('weaponState.ads'), false); h.close();
});
check('Pause clears chorded fire and ADS without restarting held buttons on resume', () => {
  const h = harness(); h.read("weaponSwitch('Vandal')"); h.frame(100); h.mouse(2); h.mouse(0); h.frame(10);
  h.w.playerController.pause(); const clip = h.read('weaponState.ammo.Vandal.clip');
  h.w.playerController.resume();
  h.w.document.getElementById('renderCanvas').dispatchEvent(new h.w.MouseEvent('pointermove', { button: -1, buttons: 3, bubbles: true }));
  h.frame(20); assert.equal(h.read('weaponState.ammo.Vandal.clip'), clip); assert.equal(h.read('weaponState.ads'), false);
  h.mouse(0, false); h.mouse(2, false); h.close();
});
check('target hits use relative hitboxes, kill and respawn', () => {
  const h = harness([4, 1.7, 0]); h.frame(); h.mouse(0); h.mouse(0, false);
  assert.equal(h.read('window.__lastHit.zone'), 'head'); assert.equal(h.read('window.__lastHit.damage'), 78);
  h.frame(30); h.read('camera.rotation.setAll(0)'); h.mouse(0); h.mouse(0, false);
  assert.equal(h.read("scene.getMeshByName('target_2_head').metadata.target.hp"), 0);
  h.frame(130); assert.equal(h.read("scene.getMeshByName('target_2_head').isEnabled()"), true); h.close();
});
check('BVH matches Babylon triangle picking and effects stay bounded', () => {
  const h = harness();
  assert.equal(h.read(`(() => { for(let i=0;i<100;i++){ const ray=new BABYLON.Ray(new BABYLON.Vector3(i%20-10,10,Math.floor(i/20)-10),BABYLON.Vector3.Down(),30); const a=collisionWorld.pick(ray),b=scene.pickWithRay(ray,m=>!!m.metadata?.worldCollision);if(!!a!==b.hit || a&&Math.abs(a.distance-b.distance)>0.0001)return false;}return true;})()`), true);
  h.read('for(let i=0;i<100;i++) weaponSpawnBulletHole(new BABYLON.Vector3(i,1,1),BABYLON.Vector3.Up())');
  assert.equal(h.read('bulletHoles.length'), 24); h.close();
});
console.log(JSON.stringify({ passed, distances, peakProcessRSS_MB: Math.round(process.memoryUsage().rss / 1048576) }));
}
module.exports = { harness };
async function keyboardLockChecks() {
  function setup() {
    const h = harness(); let fullscreen = null, pointer = null, unlocked = 0, lockedCodes;
    const d = h.w.document;
    Object.defineProperty(d, 'fullscreenElement', { get: () => fullscreen });
    Object.defineProperty(d, 'pointerLockElement', { get: () => pointer });
    d.documentElement.requestFullscreen = async () => { fullscreen = d.documentElement; d.dispatchEvent(new h.w.Event('fullscreenchange')); };
    d.getElementById('renderCanvas').requestPointerLock = async () => { pointer = d.getElementById('renderCanvas'); d.dispatchEvent(new h.w.Event('pointerlockchange')); };
    d.exitPointerLock = () => { pointer = null; d.dispatchEvent(new h.w.Event('pointerlockchange')); };
    Object.defineProperty(h.w.navigator, 'keyboard', { value: {
      lock: async codes => { lockedCodes = [...codes]; }, unlock: () => { unlocked++; }
    } });
    return { h, d, codes: () => lockedCodes, unlocked: () => unlocked,
      exit: () => { fullscreen = null; d.dispatchEvent(new h.w.Event('fullscreenchange')); } };
  }
  {
    const s = setup(), h = s.h;
    try {
      await h.w.playerController.startFullscreen();
      assert.equal(h.state().keyboardLocked, true);
      assert.ok(['KeyW','KeyA','KeyS','KeyD','KeyR'].every(code => s.codes().includes(code)));
      assert.equal(s.codes().includes('Escape'), false, 'Escape must remain a browser exit key');
      h.key('ControlLeft'); assert.equal(h.key('KeyW', true, { ctrlKey: true }), false, 'cancel game key default when event reaches page');
      h.frame(60); assert.equal(h.state().crouching, true); assert.ok(h.state().feet[2] > -12);
      assert.equal(h.key('KeyR', true, { ctrlKey: true }), false, 'Ctrl reload must cancel browser default too');
      s.exit(); assert.equal(h.state().keyboardLocked, false); assert.equal(h.state().playing, false);
      assert.equal(h.state().keys.length, 0); assert.ok(s.unlocked() > 0);
      await h.w.playerController.startFullscreen(); h.key('Escape');
      assert.equal(h.state().keyboardLocked, false); assert.equal(h.state().playing, false);
      console.log('PASS fullscreen Ctrl movement/reload, Escape, exit and keyboard unlock lifecycle (mock APIs)');
    } finally { h.close(); }
  }
  {
    const s = setup(), h = s.h;
    try {
      h.w.navigator.keyboard.lock = async () => { throw new Error('Permission denied'); };
      h.w.playerController.pause(); await h.w.playerController.startFullscreen();
      assert.equal(h.state().keyboardLocked, false); assert.equal(h.state().playing, false);
      assert.ok(s.d.getElementById('controls-status').textContent.includes('giữ C'));
      h.w.playerController.resume(); h.key('KeyC'); h.frame(30); assert.equal(h.state().crouching, true);
      console.log('PASS denied keyboard permission keeps C fallback usable (mock APIs)');
    } finally { h.close(); }
  }
  {
    const s = setup(), h = s.h; let resolveLock;
    try {
      h.w.navigator.keyboard.lock = () => new Promise(resolve => { resolveLock = resolve; });
      const pending = h.w.playerController.startFullscreen();
      await new Promise(resolve => setImmediate(resolve));
      h.w.playerController.pause(); resolveLock(); await pending;
      assert.equal(h.state().keyboardLocked, false); assert.equal(h.state().playing, false);
      assert.ok(s.unlocked() > 0);
      console.log('PASS late keyboard permission cannot resume after pause (mock APIs)');
    } finally { h.close(); }
  }
}
if (require.main === module) {
  runChecks(); keyboardLockChecks().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
