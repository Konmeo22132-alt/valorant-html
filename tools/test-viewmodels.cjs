const { harness } = require('./test-ingame.cjs');
const BABYLON = require('babylonjs');
require('babylonjs-loaders');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
BABYLON.SceneLoader.OnPluginActivatedObservable.add(plugin => { plugin.skipMaterials = true; });
const originalLoader = BABYLON.SceneLoader.LoadAssetContainerAsync;
BABYLON.SceneLoader.LoadAssetContainerAsync = async (root, file, scene) => {
  const bytes = fs.readFileSync(path.join(__dirname, '../val-strike-html/assets/weapons', file));
  return originalLoader.call(BABYLON.SceneLoader, '', 'data:;base64,' + bytes.toString('base64'), scene, undefined, '.glb');
};
async function ready(h, weapon) {
  const start = Date.now();
  while (h.w.__viewmodelStatus?.state !== 'ready' || h.w.__viewmodelStatus?.weapon !== weapon) {
    if (Date.now() - start > 5000) throw new Error(JSON.stringify(h.w.__viewmodelStatus));
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
(async () => {
  const h = harness(undefined, true);
  try {
    await ready(h, 'Classic');
    h.frame(); h.w.Math.random = () => 0.5;
    const baseline = h.read('({meshes:scene.meshes.length,nodes:scene.transformNodes.length,skeletons:scene.skeletons.length,materials:scene.materials.length})');
    h.mouse(0); h.mouse(0, false); h.key('KeyR');
    let poseChanged = false;
    for (let i = 0; i < 60; i++) {
      h.frame();
      poseChanged ||= h.read('weaponRigRest.some(rest => BABYLON.Vector3.Distance(rest.node.position,rest.position)>0.001 || rest.rotation && Math.abs(BABYLON.Quaternion.Dot(rest.node.rotationQuaternion,rest.rotation))<0.999)');
    }
    assert.equal(h.read('weaponState.reloading'), true);
    assert.equal(h.read('weaponAnimation.group.name'), 'reload');
    assert.equal(poseChanged, true);
    const pose = h.read('weaponAnimation.group.targetedAnimations[0].target.position.asArray().join()');
    h.w.playerController.pause(); h.frame(60);
    assert.equal(h.read('weaponAnimation.group.targetedAnimations[0].target.position.asArray().join()'), pose);
    h.w.playerController.resume();
    h.read("weaponSwitch('Vandal'); weaponSwitch('Classic');");
    await ready(h, 'Classic');
    for (let i = 0; i < 4; i++) {
      h.read("weaponSwitch('Vandal')"); await ready(h, 'Vandal');
      h.read("weaponSwitch('Classic')"); await ready(h, 'Classic');
    }
    const final = h.read('({meshes:scene.meshes.length,nodes:scene.transformNodes.length,skeletons:scene.skeletons.length,materials:scene.materials.length})');
    assert.equal(JSON.stringify(final), JSON.stringify(baseline));
    h.key('Digit3'); await ready(h, 'Melee'); h.frame(60);
    assert.equal(h.read('scene.skeletons.length'), 2);
    h.key('KeyF'); h.frame(30); assert.equal(h.read('weaponAnimation.group.name'), 'inspect');
    h.frame(240);
    assert.equal(h.read('weaponAnimation'), null);
    assert.equal(h.read('weaponLoopAnimation.group.name'), 'idle');
    const idlePose = h.read('weaponRigRest.filter(rest=>rest.node.name.startsWith("arms_")).map(rest=>rest.node.position.asArray().join()+rest.node.rotationQuaternion?.asArray().join()).join()');
    h.frame(25);
    assert.notEqual(h.read('weaponRigRest.filter(rest=>rest.node.name.startsWith("arms_")).map(rest=>rest.node.position.asArray().join()+rest.node.rotationQuaternion?.asArray().join()).join()'), idlePose, 'knife holding animation moves the actual arms');
    h.key('KeyW'); h.frame(10);
    assert.equal(h.read('weaponLoopAnimation.group.name'), 'run');
    h.key('ShiftLeft'); h.frame(20);
    assert.equal(h.read('weaponLoopAnimation.group.name'), 'walk');
    h.key('KeyW', false); h.key('ShiftLeft', false); h.frame(20);
    const pausedPose = h.read('weaponRigRest.map(rest=>rest.node.position.asArray().join()+rest.node.rotationQuaternion?.asArray().join()).join()');
    h.w.playerController.pause(); h.frame(60);
    assert.equal(h.read('weaponRigRest.map(rest=>rest.node.position.asArray().join()+rest.node.rotationQuaternion?.asArray().join()).join()'), pausedPose);
    h.w.playerController.resume();
    h.read("weaponSwitch('Odin')"); await ready(h, 'Odin'); h.frame(100);
    assert.equal(h.read('weaponModel.scaling.x'), 1);
    const hip = h.read('weaponAssetContainer.transformNodes.find(node=>node.name==="fp_weapon_motion").position.y');
    h.mouse(2); h.frame(15);
    const ads = h.read('weaponAssetContainer.transformNodes.find(node=>node.name==="fp_weapon_motion").position.y');
    assert.ok(Math.abs(ads) < Math.abs(hip) / 2, 'Odin source ADS centers the weapon attachment');
    h.mouse(0); h.frame(2);
    assert.equal(h.read('weaponAnimation.group.name'), 'fireads');
    const fireADS = h.read('weaponAssetContainer.transformNodes.find(node=>node.name==="fp_weapon_motion").position.y');
    assert.ok(Math.abs(fireADS) < Math.abs(hip) / 2, 'firing while ADS must keep hands and gun centered');
    h.mouse(0, false); h.mouse(2, false); h.frame(20);
    assert.equal(h.read('weaponLoopAnimation.group.name'), 'idle');
    console.log(JSON.stringify({ baseline, final, rssMB:Math.round(process.memoryUsage().rss/1048576) }));
    console.log('PASS source holding/arms, knife idle/run/walk, Odin size/ADS fire, reload, pause and disposal');
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
