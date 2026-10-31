const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const definitions = JSON.parse(fs.readFileSync(path.join(__dirname, '../val-strike-html/game/config/weapons.json'))).weapons;
// Release each imported animation set at the OS boundary. A long sequence of
// loader/NullEngine runs otherwise retains garbage until it hits the heap cap.
if (!process.argv[2]) {
  const { spawnSync } = require('node:child_process');
  for (const name of Object.keys(definitions)) {
    const child = spawnSync(process.execPath, ['--max-old-space-size=192', __filename, name], { stdio: 'inherit' });
    if (child.status !== 0) process.exit(child.status || 1);
  }
  console.log('PASS all 19 weapon/arms GLB imports and source animation samples without GPU');
  process.exit(0);
}
const BABYLON = require('babylonjs');
require('babylonjs-loaders');
(async () => {
  BABYLON.SceneLoader.OnPluginActivatedObservable.add(plugin => { plugin.skipMaterials = true; });
  for (const [name, definition] of Object.entries(definitions).filter(([name, def]) => def.model && name === process.argv[2])) {
    const file = fs.readFileSync(path.join(__dirname, '../val-strike-html/assets/weapons', definition.model.file));
    const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)));
    const engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
    const container = await BABYLON.SceneLoader.LoadAssetContainerAsync('', 'data:;base64,' + file.toString('base64'), scene, undefined, '.glb');
    container.addAllToScene();
    assert.ok(container.skeletons.length > 0); assert.ok(container.meshes.some(mesh => mesh.getTotalVertices() > 100));
    const required = ['equip', 'fire', 'inspect', 'hold', 'idle', ...(name === 'Melee' ? ['fire2','fire3','firealt','walk','run'] : ['reload']), ...(name === 'Outlaw' ? ['reloadempty'] : [])];
    for (const clip of required) assert.ok(container.animationGroups.some(group => group.name === clip), name + ' needs ' + clip);
    assert.equal(container.skeletons.length, 2, name + ' keeps separate gun and arms skins');
    assert.ok(container.meshes.some(mesh => mesh.name === 'arms_mesh'));
    assert.equal(json.extras.cameraSpaceAttachment, true);
    assert.equal(definition.model.scale, 1, 'source dimensions must not shrink heavy weapons');
    assert.ok(json.extras.motionReference.endsWith('_IdlePose.psa') && !/AltIdlePose|ADSIdlePose/.test(json.extras.motionReference));
    for (const clip of Object.values(json.extras.animationSources)) assert.ok(clip.articulation || clip.viewmodel);
    assert.ok(json.images.length >= 4, name + ' needs source PBR maps');
    const camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 0, -2), scene); scene.activeCamera = camera;
    for (const group of container.animationGroups) {
      group.start(false); group.pause();
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        group.goToFrame(group.from + (group.to - group.from) * progress); scene.render();
        for (const node of container.transformNodes) {
          assert.ok(node.position.asArray().every(Number.isFinite));
          if (node.rotationQuaternion) assert.ok(Math.abs(node.rotationQuaternion.length() - 1) < 0.001);
        }
        for (const skeleton of container.skeletons) {
          const matrices = skeleton.getTransformMatrices(container.meshes.find(mesh => mesh.skeleton === skeleton));
          assert.ok(Array.from(matrices).every(Number.isFinite));
          assert.ok(Math.max(...Array.from(matrices).map(Math.abs)) < 1000, 'no exploding bone transforms');
        }
      }
      group.stop();
    }
    console.log(JSON.stringify({ weapon: name, bytes: file.length, vertices: container.meshes.reduce((sum, m) => sum + m.getTotalVertices(), 0),
      bones: container.skeletons[0].bones.length, animations: container.animationGroups.map(g => g.name), textureLimit: json.extras.textureLimit }));
    container.dispose(); scene.dispose(); engine.dispose();
  }
  console.log('PASS weapon GLB import and animation sampling without GPU');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
