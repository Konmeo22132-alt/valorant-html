const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const B = require('babylonjs');
const draco = require('draco3d');
const root = path.resolve(__dirname, '../val-strike-html'), dir = path.join(root, 'assets/maps/optimized/abyss-stream');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
const source = fs.readFileSync(path.join(root, 'assets/maps/optimized/abyss_lowpoly.glb'));
const doc = JSON.parse(source.subarray(20, 20 + source.readUInt32LE(12))), binary = source.subarray(28 + source.readUInt32LE(12));
assert.equal(manifest.source, 'abyss_lowpoly.glb');
assert.equal(manifest.triangles, doc.meshes[1].primitives.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0));
assert.deepEqual(manifest.material, doc.materials[1]);
const image = doc.bufferViews[doc.images[0].bufferView];
assert.ok(fs.readFileSync(path.join(dir, 'palette.png')).equals(binary.subarray(image.byteOffset || 0, (image.byteOffset || 0) + image.byteLength)));
const requests = [];
const namespace = { ...B, Texture: class extends B.Texture {
  constructor(url, scene, noMip, invertY, sampling, ready) { super(null, scene); queueMicrotask(ready); }
} };
const context = vm.createContext({ BABYLON: namespace, console, performance, setTimeout, clearTimeout, AbortController, URLSearchParams, location: new URL('http://localhost/game/game.html?map=abyss'), document: { hidden: false }, window: { __gamePlaying: true, addEventListener() {} },
  fetch: async url => { requests.push(url); const bytes = fs.readFileSync(path.join(dir, path.basename(url))); return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; } });
vm.runInContext(fs.readFileSync(path.join(root, 'game/collision-world.js'), 'utf8') + '\nthis.CollisionWorld = CollisionWorld;', context);
vm.runInContext(fs.readFileSync(path.join(root, 'game/map-streamer.js'), 'utf8') + '\nthis.MapStreamer = MapStreamer;', context);
const collisionBytes = fs.readFileSync(path.join(dir, 'collision.glb'));
const collisionBuffer = collisionBytes.buffer.slice(collisionBytes.byteOffset, collisionBytes.byteOffset + collisionBytes.byteLength);
const world = context.CollisionWorld.fromPacked(collisionBuffer, context.mapGLBOffset(collisionBuffer));
function hash(bits, offsets) { let h = 2166136261; for (const offset of offsets) h = Math.imul(h ^ bits[offset], 16777619); return h >>> 0; }
const expected = new Uint32Array(manifest.triangles), actual = new Uint32Array(manifest.triangles);
const referenceBits = new Uint32Array(world.triangles.buffer, world.triangles.byteOffset, world.triangles.length);
for (let i = 0; i < expected.length; i++) expected[i] = hash(referenceBits, Array.from({ length: 9 }, (_, c) => i * 9 + c));
let triangle = 0;
for (const entry of manifest.chunks) {
  const bytes = fs.readFileSync(path.join(dir, entry.file)), base = 28 + bytes.readUInt32LE(12), count = bytes.readUInt32LE(base + 4), indicesCount = bytes.readUInt32LE(base + 8);
  const vertices = new Float32Array(bytes.buffer, bytes.byteOffset + base + 12, count * 12), bits = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
  const indices = new Uint32Array(bytes.buffer, bytes.byteOffset + base + 12 + count * 48, indicesCount);
  for (let i = 0; i < count; i++) for (let c = 8; c < 12; c++) assert.ok(vertices[i * 12 + c] >= 0 && vertices[i * 12 + c] <= 1, 'Normalized COLOR_0 must match glTF');
  for (let i = 0; i < indices.length; i += 3) {
    assert.ok(indices[i] < count && indices[i + 1] < count && indices[i + 2] < count);
    actual[triangle++] = hash(bits, [indices[i], indices[i + 1], indices[i + 2]].flatMap(id => [id * 12, id * 12 + 1, id * 12 + 2]));
  }
}
assert.equal(triangle, manifest.triangles); assert.deepEqual(actual.sort(), expected.sort());
console.log('PASS exact triangle multiset, palette PNG and original material; normalized vertex colors');
const engine = new B.NullEngine({ renderWidth: 640, renderHeight: 360 }), scene = new B.Scene(engine);
context.__scene = scene;
context.window.collisionWorld = world; context.window.__mapBounds = manifest.bounds;
context.window.__mapSpawnCandidates = manifest.spawnCandidates; context.window.__mapSpawnAnchor = manifest.spawnAnchor;
context.window.GAME_CONFIG = { movement: JSON.parse(fs.readFileSync(path.join(root, 'game/config/movement.json'))) };
vm.runInContext(fs.readFileSync(path.join(root, 'game/engine.js'), 'utf8') + '\nscene = __scene;', context);
const spawn = context.autoFindSpawn();
assert.ok(world.pick(new B.Ray(spawn, B.Vector3.Down(), 2), true), 'Selected spawn must stand above loaded collision');
console.log('PASS original-coordinate spawn', JSON.stringify(spawn.asArray()));
const perf = { ...JSON.parse(fs.readFileSync(path.join(root, 'game/config/performance.json'))), mapRetainTime: 0 };
const stream = new context.MapStreamer(scene, '/', manifest, perf);
async function settled() {
  const started = Date.now();
  while (stream.pending || stream.entries.some(e => e.wanted && !stream.resident.has(e.file))) {
    if (Date.now() - started > 10000) throw new Error(JSON.stringify(context.window.__mapStreamStats));
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
(async () => {
  try {
    // Compare collision against independently decoded source triangles in Babylon's native X-reflected coordinates.
    const d = await draco.createDecoderModule({}), decoder = new d.Decoder();
    const node = doc.nodes.find(n => n.mesh !== undefined && !/sky|dome/i.test(n.name));
    const sourceHashes = new Uint32Array(manifest.triangles); let nextTriangle = 0;
    for (const primitive of doc.meshes[node.mesh].primitives) {
      const compressed = primitive.extensions.KHR_draco_mesh_compression, view = doc.bufferViews[compressed.bufferView];
      const input = new d.DecoderBuffer(), decoded = new d.Mesh();
      const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      input.Init(bytes, bytes.length); const status = decoder.DecodeBufferToMesh(input, decoded); assert.ok(status.ok());
      const values = new d.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(decoded, decoder.GetAttributeByUniqueId(decoded, compressed.attributes.POSITION), values);
      const positions = new Float32Array(values.size());
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = -(values.GetValue(i) * manifest.transform.scale + node.translation[0]);
        positions[i + 1] = values.GetValue(i + 1) * manifest.transform.scale + node.translation[1];
        positions[i + 2] = values.GetValue(i + 2) * manifest.transform.scale + node.translation[2];
      }
      const bits = new Uint32Array(positions.buffer), face = new d.DracoInt32Array();
      for (let i = 0; i < decoded.num_faces(); i++) {
        decoder.GetFaceFromMesh(decoded, i, face);
        sourceHashes[nextTriangle++] = hash(bits, [face.GetValue(0), face.GetValue(2), face.GetValue(1)].flatMap(id => [id * 3, id * 3 + 1, id * 3 + 2]));
      }
      for (const object of [face, values, status, decoded, input]) d.destroy(object);
    }
    d.destroy(decoder); assert.equal(nextTriangle, manifest.triangles);
    assert.deepEqual(sourceHashes.sort(), expected);
    assert.ok(Math.abs(manifest.transform.exportedReferenceSpan * manifest.transform.scale - manifest.transform.originalReferenceSpan) < 1e-6);
    context.window.__mapTransform = manifest.transform;
    const legacy = { x: -40, y: 8, z: 25 }, migrated = context.mapSavedMarker(legacy);
    assert.equal(migrated.coordinateSpace, manifest.transform.coordinateSpace);
    assert.deepEqual(context.mapSavedMarker(migrated), migrated, 'Marker migration must only apply once');
    for (const [i, axis] of ['x', 'y', 'z'].entries()) assert.ok(Math.abs((migrated[axis] - manifest.transform.pivot[i]) / manifest.transform.scale + manifest.transform.pivot[i] - legacy[axis]) < 1e-8);
    console.log('PASS source triangles, measured world scale, Babylon coordinates and marker migration');
    const position = B.Vector3.FromArray(manifest.spawnAnchor).add(new B.Vector3(0, 1.7, 0));
    await stream.prime(position, 0, 1.4);
    assert.ok(context.window.__mapStreamStats.missingChunks > 0, 'Startup must defer distant visible geometry');
    const view = new B.FreeCamera('view', position, scene); view.fov = 1.4;
    stream.update(view, true); await settled(); view.dispose();
    const first = new Set(stream.resident.keys()), camera = new B.FreeCamera('test', position, scene);
    const [file, mesh] = stream.resident.entries().next().value;
    const bytes = fs.readFileSync(path.join(dir, file)), base = 28 + bytes.readUInt32LE(12);
    const count = bytes.readUInt32LE(base + 4), packed = new Float32Array(bytes.buffer, bytes.byteOffset + base + 12, count * 12);
    for (const [kind, offset, size] of [['position', 0, 3], ['normal', 3, 3], ['uv', 6, 2], ['color', 8, 4]]) {
      const values = mesh.getVerticesData(kind);
      assert.equal(values.length, count * size);
      for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) assert.equal(values[i * size + c], packed[i * 12 + offset + c], kind + ' buffer layout');
    }
    console.log('PASS runtime interleaved positions, normals, UVs and colors match packed attributes');
    camera.fov = 1.4;
    assert.ok(first.size > 0 && first.size < manifest.chunks.length);
    const ray = new B.Ray(position.add(new B.Vector3(0, 20, 0)), B.Vector3.Down(), 100);
    const before = world.pick(ray, true); assert.ok(before);
    camera.rotation.y = Math.PI; stream.update(camera, true); await settled();
    const second = new Set(stream.resident.keys());
    assert.ok([...first].some(file => !second.has(file)), 'Looking back must evict chunks outside the new view');
    assert.ok([...second].some(file => !first.has(file)), 'Looking back must load different geometry');
    assert.ok(stream.residentBytes <= perf.mapResidentMB * 1048576);
    assert.equal(world.pick(ray, true).distance, before.distance, 'Collision must survive visual eviction');
    assert.equal(scene.materials.filter(mat => mat.name === 'original_lowpoly_palette').length, 1);
    stream.dispose(); assert.equal(stream.resident.size, 0); assert.equal(stream.residentBytes, 0);
    console.log(JSON.stringify({ totalChunks: manifest.chunks.length, forwardChunks: first.size, backwardChunks: second.size,
      collisionMB: collisionBytes.length / 1048576, fetches: requests.length, rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
    console.log('PASS view-driven loading, eviction, memory budget, shared palette, independent collision and disposal; no GPU');
  } finally { stream.dispose(); scene.dispose(); engine.dispose(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
