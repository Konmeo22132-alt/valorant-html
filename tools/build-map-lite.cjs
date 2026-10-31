// Offline, bounded-memory conversion. No browser, texture decoding or GPU needed.
// Usage: node tools/build-map-lite.cjs [source.glb] [output.glb]
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'val-strike-html', 'assets', 'maps');
const source = process.argv[2] || path.join(root, 'raw', 'abyss_bl.glb');
const output = process.argv[3] || path.join(root, 'optimized', 'abyss_lite.glb');
(async () => {
const { MeshoptSimplifier } = await import('meshoptimizer');
await MeshoptSimplifier.ready;
const file = fs.readFileSync(source);
const doc = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
const binary = file.subarray(28 + file.readUInt32LE(12));
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(index) {
  const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const offset = (v.byteOffset || 0) + (a.byteOffset || 0);
  const read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }[a.componentType];
  if (!read || a.sparse) throw new Error('Unsupported source accessor');
  const stride = v.byteStride || bytes * components[a.type];
  return { count: a.count, get: (i, c = 0) => binary[read](offset + i * stride + c * bytes) };
}
// This source has baked transforms and top-level, translation-only mesh nodes.
const nodes = doc.nodes.filter(n => n.mesh !== undefined && !/sky|dome/i.test(n.name));
for (const n of nodes) if (n.matrix || n.rotation || n.scale) throw new Error('Bake node transforms before conversion');
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const n of nodes) for (const p of doc.meshes[n.mesh].primitives) {
  const a = doc.accessors[p.attributes.POSITION];
  for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c], a.min[c] + (n.translation?.[c] || 0));
    max[c] = Math.max(max[c], a.max[c] + (n.translation?.[c] || 0));
  }
}
const scale = 100 / Math.max(max[0] - min[0], max[2] - min[2]);
const center = [(min[0] + max[0]) / 2, min[1] - 0.5 / scale, (min[2] + max[2]) / 2];
const sourceTriangles = nodes.reduce((sum, n) => sum + doc.meshes[n.mesh].primitives.reduce((s, p) => s + doc.accessors[p.indices].count / 3, 0), 0);

function simplify(cell) {
  const tiles = new Map();
  const floorCandidates = [];
  let triangles = 0;
  for (const n of nodes) for (const p of doc.meshes[n.mesh].primitives) {
    const positions = accessor(p.attributes.POSITION), indices = accessor(p.indices);
    const color = doc.materials[p.material]?.pbrMetallicRoughness?.baseColorFactor || [0.5, 0.5, 0.5, 1];
    const remap = new Array(positions.count), coords = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      remap[i] = [0, 1, 2].map(c => (positions.get(i, c) + (n.translation?.[c] || 0) - center[c]) * scale);
      coords.set(remap[i], i * 3);
    }
    const sourceIndices = Uint32Array.from({ length: indices.count }, (_, i) => indices.get(i));
    // Keep surfaces within 6 cm; remove tiny, disconnected decorative pieces.
    const [reduced] = MeshoptSimplifier.simplify(sourceIndices, coords, 3,
      Math.max(3, Math.floor(indices.count * 0.14 / 3) * 3), 0.06, ['ErrorAbsolute', 'Permissive', 'Prune']);
    for (let i = 0; i < reduced.length; i += 3) {
      const points = [remap[reduced[i]], remap[reduced[i + 1]], remap[reduced[i + 2]]];
      const a = points[0], b = points[1], c = points[2];
      const u = b.map((v, j) => v - a[j]), v = c.map((x, j) => x - a[j]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...normal);
      if (length < 0.00001) continue;
      normal.forEach((_, j) => normal[j] /= length);
      if (/floor|ground|dirtblend|carpet|tile/i.test(doc.materials[p.material]?.name || '') && Math.abs(normal[1]) > 0.98 && length > 0.2) {
        floorCandidates.push({ position: [0, 1, 2].map(j => (a[j] + b[j] + c[j]) / 3), area: length / 2 });
      }
      const tileKey = [0, 2].map(j => Math.floor((a[j] + b[j] + c[j]) / 3 / 6)).join('_');
      if (!tiles.has(tileKey)) tiles.set(tileKey, { positions: [], normals: [], colors: [], indices: [], lookup: new Map(), faces: new Set() });
      const tile = tiles.get(tileKey);
      const keys = points.map(pt => pt.map(x => Math.round(x / cell)).join(','));
      const faceKey = p.material + ':' + keys.slice().sort().join('|');
      if (tile.faces.has(faceKey)) continue;
      tile.faces.add(faceKey);
      for (let j = 0; j < 3; j++) {
        // Keep major hard edges while welding tiny decorative triangles.
        const key = p.material + ':' + keys[j] + ':' + normal.map(x => Math.round(x * 2)).join(',');
        let vertex = tile.lookup.get(key);
        if (vertex === undefined) {
          vertex = tile.positions.length / 3;
          tile.lookup.set(key, vertex);
          tile.positions.push(...points[j]); tile.normals.push(...normal); tile.colors.push(...color.slice(0, 3));
        }
        tile.indices.push(vertex);
      }
      triangles++;
    }
  }
  return { tiles, triangles, cell, floorCandidates };
}
const result = simplify(0.001);
// A second pass can cross old material seams; vertex colors preserve the palette.
// Tile boundaries stay locked so adjacent chunks cannot open cracks.
for (const tile of result.tiles.values()) {
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(tile.indices), new Float32Array(tile.positions), 3,
    new Float32Array(tile.colors), 3, [0.1, 0.1, 0.1], null,
    Math.max(3, Math.floor(tile.indices.length * 0.38 / 3) * 3), 0.09, ['ErrorAbsolute', 'Permissive', 'LockBorder', 'Prune']);
  const used = new Set(indices);
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  for (const key of ['positions', 'normals', 'colors']) {
    const old = tile[key], values = new Float32Array(count * 3);
    for (const index of used) values.set(old.slice(index * 3, index * 3 + 3), remap[index] * 3);
    tile[key] = Array.from(values);
  }
  tile.indices = Array.from(indices);
}
result.triangles = [...result.tiles.values()].reduce((n, tile) => n + tile.indices.length / 3, 0);
console.log(JSON.stringify({ triangles: result.triangles, tiles: result.tiles.size }));
const out = { asset: { version: '2.0', generator: 'Val-Strike offline lite map' }, scene: 0,
  scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [{ name: 'lite_vertex_color', doubleSided: true,
    pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }], accessors: [], bufferViews: [], buffers: [] };
const chunks = []; let byteLength = 0;
function pack(values, type, countType, target) {
  const bytes = Buffer.from(type === 5126 ? new Float32Array(values).buffer : new Uint32Array(values).buffer);
  const view = out.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target }) - 1;
  chunks.push(bytes); byteLength += bytes.length;
  const a = { bufferView: view, componentType: type, count: values.length / components[countType], type: countType };
  if (countType === 'VEC3' && target === 34962) {
    a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i++) { const c = i % 3; a.min[c] = Math.min(a.min[c], values[i]); a.max[c] = Math.max(a.max[c], values[i]); }
  }
  return out.accessors.push(a) - 1;
}
for (const [key, tile] of result.tiles) {
  const mesh = out.meshes.push({ name: 'map_tile_' + key, primitives: [{ attributes: {
    POSITION: pack(tile.positions, 5126, 'VEC3', 34962), NORMAL: pack(tile.normals, 5126, 'VEC3', 34962),
    COLOR_0: pack(tile.colors, 5126, 'VEC3', 34962) }, indices: pack(tile.indices, 5125, 'SCALAR', 34963), material: 0 }] }) - 1;
  out.scenes[0].nodes.push(out.nodes.push({ name: 'map_tile_' + key, mesh }) - 1);
}
out.buffers.push({ byteLength });
let json = Buffer.from(JSON.stringify(out));
json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.write('JSON', 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.write('BIN\0', 4);
fs.writeFileSync(output, Buffer.concat([header, json, binHeader, bin]));
const floorCells = new Set(), spawnCandidates = [];
for (const candidate of result.floorCandidates.sort((a, b) => b.area - a.area)) {
  const key = candidate.position.map(v => Math.floor(v / 1.5)).join('_');
  if (floorCells.has(key)) continue;
  floorCells.add(key);
  // Babylon's glTF loader flips Z when importing into a left-handed scene.
  spawnCandidates.push([candidate.position[0], candidate.position[1], -candidate.position[2]]);
  if (spawnCandidates.length >= 512) break;
}
fs.writeFileSync(output.replace(/\.glb$/i, '.spawn.json'), JSON.stringify({ spawnCandidates }));
console.log(JSON.stringify({ sourceTriangles, triangles: result.triangles, reduction: 1 - result.triangles / sourceTriangles,
  cell: result.cell, output, outputMB: fs.statSync(output).size / 1048576, textures: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
