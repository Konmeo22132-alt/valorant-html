const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const BABYLON = require('babylonjs');
const file = fs.readFileSync(path.join(__dirname, '../val-strike-html/assets/maps/optimized/abyss_lite.glb'));
const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)));
assert.equal(json.images?.length || 0, 0);
assert.equal(json.materials.length, 1);
const bin = file.subarray(28 + file.readUInt32LE(12));
function data(index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  const count = a.count * (a.type === 'VEC3' ? 3 : 1);
  const TypedArray = a.componentType === 5126 ? Float32Array : Uint32Array;
  return new TypedArray(bin.buffer, bin.byteOffset + (view.byteOffset || 0), count);
}
const engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
for (const source of json.meshes) {
  const p = source.primitives[0], mesh = new BABYLON.Mesh(source.name, scene);
  mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, data(p.attributes.POSITION));
  mesh.setIndices(data(p.indices)); mesh.scaling.z = -1; mesh.metadata = { worldCollision: true };
}
const context = vm.createContext({ BABYLON, console, window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../val-strike-html/game/collision-world.js'), 'utf8') + '\nthis.CollisionWorld = CollisionWorld;', context);
const start = performance.now();
const world = new context.CollisionWorld(scene.meshes);
const buildMS = performance.now() - start;
for (let i = 0; i < 80; i++) {
  const ray = new BABYLON.Ray(new BABYLON.Vector3((i % 9 - 4) * 10, 80, (Math.floor(i / 9) - 4) * 10), BABYLON.Vector3.Down(), 100);
  const indexed = world.pick(ray), reference = scene.pickWithRay(ray, mesh => !!mesh.metadata?.worldCollision);
  assert.equal(!!indexed, reference.hit);
  if (indexed) assert.ok(Math.abs(indexed.distance - reference.distance) < 0.0002);
}
const rayStart = performance.now();
for (let i = 0; i < 10000; i++) world.pick(new BABYLON.Ray(new BABYLON.Vector3(i % 90 - 45, 20, i % 83 - 41), BABYLON.Vector3.Down(), 25), true);
console.log(JSON.stringify({ triangles: world.order.length, buildMS: Math.round(buildMS),
  rayQueries: 10000, rayMS: Math.round(performance.now() - rayStart), rssMB: Math.round(process.memoryUsage().rss / 1048576), textureCount: 0 }));
console.log('PASS lite-map collision BVH matches reference picking at 80 points');
scene.dispose(); engine.dispose();
