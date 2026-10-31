const { harness } = require('./test-ingame.cjs');
const assert = require('node:assert/strict');
let passed = 0;
function check(name, callback) {
  const h = harness(); try { callback(h); console.log('PASS', name); passed++; } finally { h.close(); }
}
const near = (a, b, tolerance = 0.001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
check('armor splits damage, depletes and carries excess to health', h => {
  h.read("window.target = {hp:100}; combatEquipArmor(target,'heavy'); combatDamage(target,40)");
  near(h.read('target.armor'),23.6); near(h.read('target.hp'),86.4);
  h.read('combatDamage(target,100)'); near(h.read('target.hp'),10); near(h.read('target.armor'),0);
  h.read('combatDamage(target,50)'); assert.equal(h.read('target.hp'),0);
  h.read("target={hp:100};combatEquipArmor(target,'light');combatDamage(target,40)"); near(h.read('target.hp'),85);
});
check('regen absorbs fully, waits 3s, restores over 3s, pauses and spends its finite pool', h => {
  h.read("window.target={hp:100};combatEquipArmor(target,'regen');combatDamage(target,20)");
  near(h.read('target.hp'),100); near(h.read('target.armor'),5);
  h.frame(120); near(h.read('target.armor'),5);
  h.w.playerController.pause(); h.frame(600); near(h.read('target.armor'),5);
  h.w.playerController.resume(); h.frame(120); h.read('combatUpdateArmor(target,weaponNow())');
  near(h.read('target.armor'),13.3333333,0.2); near(h.read('target.regenPool'),41.6666667,0.2);
  h.read('combatDamage(target,40)'); assert.ok(h.read('target.hp') < 100);
  h.frame(400); h.read('combatUpdateArmor(target,weaponNow())'); near(h.read('target.armor'),25);
  h.read('combatDamage(target,25)'); h.frame(400); h.read('combatUpdateArmor(target,weaponNow())');
  assert.ok(h.read('target.regenPool') < 4); assert.ok(h.read('target.armor') < 25);
});
function setupLane(h, material='wood', thickness=0.15) {
  h.read(`rangeInit(true);rangeState.distance=20;rangeState.material='${material}';rangeState.thickness=${thickness};rangeConfigure();camera.position.set(0,1.125,-14);camera.rotation.set(0,0,0);camera.computeWorldMatrix(true);`);
}
check('wood/glass penetration measures entry/exit thickness and tier loss', h => {
  setupLane(h);
  for (const tier of ['low','medium','high']) h.read(`window.pen_${tier}=combatPenetration(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),30),20,{penetration:'${tier}'})`);
  assert.ok(h.read('pen_low.factor>0 && pen_low.factor<pen_medium.factor && pen_medium.factor<pen_high.factor'));
  h.read("rangeState.material='glass';rangeConfigure();window.glass=combatPenetration(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),30),20,{penetration:'low'})");
  assert.ok(h.read('glass.factor>pen_low.factor'));
  h.read("rangeState.material='metal';rangeConfigure();window.metal=combatPenetration(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),30),20,{penetration:'low'})");
  assert.equal(h.read('metal.factor'),0);
});
check('penetrating shot damages armor behind wall; thick wall and melee block', h => {
  setupLane(h); h.read("rangeState.armor='heavy';rangeReset(false);weaponResolveHit(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),50),weaponDef('Vandal'))");
  assert.equal(h.w.__lastHit.penetrated,true); assert.ok(h.w.__lastHit.damage < 40); assert.ok(h.w.__lastHit.armorDamage > 0);
  h.read("rangeState.material='concrete';rangeState.thickness=1;rangeConfigure();weaponResolveHit(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),50),weaponDef('Odin'))");
  assert.equal(h.read('rangeTargets()[1].hp'),100);
  h.read("rangeState.material='wood';rangeState.thickness=.15;rangeConfigure();weaponResolveHit(new BABYLON.Ray(camera.position,BABYLON.Vector3.Forward(),50),weaponDef('Melee'))");
  assert.equal(h.read('rangeTargets()[1].hp'),100);
});
check('range controls relocate targets, rebuild collision, refill and reset counters', h => {
  setupLane(h); const picker=h.w.document.getElementById('practice-distance'); picker.value='50'; picker.dispatchEvent(new h.w.Event('change'));
  near(h.read('rangeTargets()[0].meshes[0].position.z'),36);
  h.read('weaponState.ammo.Classic.clip=1;rangeState.shots=99;rangeReset()');
  assert.equal(h.read('weaponState.ammo.Classic.clip'),12); assert.equal(h.read('rangeState.shots'),0);
  h.read('rangeState.unlimited=true'); h.mouse(0); h.mouse(0,false); assert.equal(h.read('weaponState.ammo.Classic.clip'),12);
});
check('shell reload inserts incrementally; interruption keeps inserted ammo and reserve', h => {
  h.read("weaponSwitch('Bucky')");h.frame(65);h.read('weaponState.ammo.Bucky.clip=0;weaponReload()');h.frame(31);
  assert.equal(h.read('weaponState.ammo.Bucky.clip'),1); assert.equal(h.read('weaponState.ammo.Bucky.reserve'),9);
  h.mouse(0);h.mouse(0,false);assert.equal(h.read('weaponState.reloading'),false);assert.equal(h.read('weaponState.ammo.Bucky.clip'),0);
  h.read("weaponSwitch('Marshal')");h.frame(80);h.read('weaponState.ammo.Marshal.clip=2;weaponReload()');h.frame(95);
  assert.equal(h.read('weaponState.ammo.Marshal.clip'),5); assert.equal(h.read('weaponState.ammo.Marshal.reserve'),12);
});
check('Outlaw single/double reload duration and pause preserve exact ammo accounting', h => {
  h.read("weaponSwitch('Outlaw')");h.frame(80);h.read('weaponState.ammo.Outlaw.clip=0;weaponReload()');
  assert.equal(h.read('weaponState.reloadDuration'),3800);h.frame(150);assert.equal(h.read('weaponState.ammo.Outlaw.clip'),0);
  h.w.playerController.pause();h.frame(300);assert.equal(h.read('weaponState.ammo.Outlaw.clip'),0);h.w.playerController.resume();h.frame(85);
  assert.equal(h.read('weaponState.ammo.Outlaw.clip'),2);h.read('weaponState.ammo.Outlaw.clip=1;weaponReload()');assert.equal(h.read('weaponState.reloadDuration'),2300);
});
check('Spectre ADS, Odin max ADS rate and Operator secondary zoom', h => {
  h.read("weaponSwitch('Spectre')");h.frame(50);h.mouse(2);assert.equal(h.read('weaponState.ads'),true);near(h.read('weaponFireDelay()'),1000/12);h.mouse(2,false);
  h.read("weaponSwitch('Odin')");h.frame(80);h.mouse(2);near(h.read('weaponFireDelay()'),1000/15.6);h.mouse(2,false);
  h.read("weaponSwitch('Operator')");h.frame(95);h.mouse(2);const first=h.read('camera.fov');h.key('KeyZ');assert.ok(h.read('camera.fov')<first);h.mouse(2,false);near(h.read('camera.fov'),h.w.GAME_CONFIG.movement.baseFov);
});
check('burst cadence and holding hip fire then ADS cannot continue auto fire', h => {
  h.read("weaponSwitch('Bulldog')");h.frame(65);h.mouse(2);h.mouse(0);h.frame(12);h.mouse(0,false);
  assert.equal(h.read('weaponState.ammo.Bulldog.clip'),21);h.mouse(0);h.mouse(0,false);assert.equal(h.read('weaponState.ammo.Bulldog.clip'),21);
  h.frame(20);h.mouse(0);h.frame(12);h.mouse(0,false);assert.equal(h.read('weaponState.ammo.Bulldog.clip'),18);h.mouse(2,false);
  h.frame(60);h.mouse(0);h.frame(6);h.mouse(2);const clip=h.read('weaponState.ammo.Bulldog.clip');h.frame(60);assert.equal(h.read('weaponState.ammo.Bulldog.clip'),clip);
});
check('automatic fire rate is independent of 30/60/120 FPS', h => {
  const counts=[30,60,120].map(fps=>{
    const other=harness();try{other.read("weaponSwitch('Vandal')");other.frame(130);other.mouse(0);other.frame(fps-1,1/fps);other.mouse(0,false);return 25-other.read('weaponState.ammo.Vandal.clip');}finally{other.close();}
  });
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1); assert.ok(counts.every(n=>n>=9&&n<=10));
});
check('holding fire during reload cannot replay a backlog of missed shots', h => {
  h.read("weaponSwitch('Vandal')");h.frame(65);h.mouse(0);h.mouse(0,false);h.key('KeyR');h.mouse(0);h.frame(151);
  assert.ok(h.read('weaponState.ammo.Vandal.clip')>=24);
  h.frame(12);assert.ok(h.read('weaponState.ammo.Vandal.clip')>=22);h.mouse(0,false);
});
check('Bucky airburst is one close canister or five far pellets, costing one shell', h => {
  h.read("weaponSwitch('Bucky')");h.frame(65);
  h.read('window.rays=[];window.oldResolve=weaponResolveHit;weaponResolveHit=(ray,def)=>rays.push({origin:ray.origin.asArray(),damage:def.damage});');
  h.mouse(2);h.mouse(2,false);assert.equal(h.read('rays.length'),5);assert.equal(h.read('weaponState.ammo.Bucky.clip'),4);
  h.frame(60);h.read('rays=[];camera.position.set(0,1.1,4);camera.rotation.set(0,0,0)');h.mouse(2);h.mouse(2,false);
  assert.equal(h.read('rays.length'),1);assert.equal(h.read('rays[0].damage[0][2]'),20);
});
check('recoil returns after recovery and stays frozen during pause', h => {
  h.frame();const initial=h.read('camera.rotation.x');h.mouse(0);h.mouse(0,false);assert.ok(h.read('camera.rotation.x')<initial);
  h.w.playerController.pause();const kicked=h.read('camera.rotation.x');h.frame(120);near(h.read('camera.rotation.x'),kicked);h.w.playerController.resume();h.frame(150);near(h.read('camera.rotation.x'),initial,0.001);
});
check('knife prioritizes centered targets, handles armor/backstabs and never hits through walls', h => {
  h.read("weaponSwitch('Melee')");h.frame(40);
  h.read("camera.position.set(0,1.1,6.1);camera.rotation.set(0,0,0);rangeTargets()[1].forward=new BABYLON.Vector3(0,0,-1);combatEquipArmor(rangeTargets()[1],'heavy');weaponResolveHit(weaponMeleeRay(false),weaponDef())");
  near(h.read('rangeTargets()[1].hp'),83);near(h.read('rangeTargets()[1].armor'),17);
  h.read("rangeTargets()[1].hp=100;combatEquipArmor(rangeTargets()[1],'heavy');rangeTargets()[1].forward=BABYLON.Vector3.Forward();weaponResolveHit(weaponMeleeRay(true),{...weaponDef(),damage:weaponDef().altFire.damage})");
  assert.equal(h.read('rangeTargets()[1].hp'),0);
  h.read("rangeTargets()[1].hp=100;rangeTargets()[1].meshes.forEach(mesh=>mesh.setEnabled(true));flatBox('knife_block',2,2,.15,0,1,7,MAP_CONFIG.palette.walls);window.collisionWorld=new CollisionWorld(scene.meshes);weaponResolveHit(weaponMeleeRay(false),weaponDef())");
  assert.equal(h.read('rangeTargets()[1].hp'),100);
});
console.log(JSON.stringify({passed,peakRSS_MB:Math.round(process.memoryUsage().rss/1048576)}));
