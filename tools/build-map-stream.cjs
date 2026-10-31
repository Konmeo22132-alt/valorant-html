// Repackage the user's palette low-poly map. No decimation or material replacement.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const draco = require('draco3d');
const root = path.resolve(__dirname, '../val-strike-html');
function header(file) {
  const fd = fs.openSync(file, 'r'), h = Buffer.alloc(20); fs.readSync(fd, h, 0, 20, 0);
  const j = Buffer.alloc(h.readUInt32LE(12)); fs.readSync(fd, j, 0, j.length, 20); fs.closeSync(fd);
  return JSON.parse(j);
}
class List {
  constructor(Type) { this.Type = Type; this.data = new Type(1024); this.length = 0; }
  push(...values) {
    if (this.length + values.length > this.data.length) { const next = new this.Type(this.data.length * 2); next.set(this.data); this.data = next; }
    this.data.set(values, this.length); this.length += values.length;
  }
  array() { return this.data.subarray(0, this.length); }
}
function glb(packed, vertexCount, indexCount, bounds, material) {
  const positionsOnly = !material;
  const document = { asset: { version: '2.0', generator: 'Val-Strike exact low-poly streaming' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, scale: [-1, 1, 1] }],
    buffers: [{ byteLength: packed.length }],
    bufferViews: [{ buffer: 0, byteOffset: 12, byteLength: vertexCount * (positionsOnly ? 12 : 48), target: 34962,
      ...(positionsOnly ? {} : { byteStride: 48 }) }],
    accessors: [{ bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: bounds.min, max: bounds.max }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    extras: { packedFormat: positionsOnly ? 'VSB1' : 'VSC1' } };
  if (!positionsOnly) {
    document.accessors.push(...[['NORMAL', 12, 'VEC3'], ['TEXCOORD_0', 24, 'VEC2'], ['COLOR_0', 32, 'VEC4']].map(([, offset, type]) =>
      ({ bufferView: 0, byteOffset: offset, componentType: 5126, count: vertexCount, type })));
    Object.assign(document.meshes[0].primitives[0], { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 });
    document.bufferViews.push({ buffer: 0, byteOffset: 12 + vertexCount * 48, byteLength: indexCount * 4, target: 34963 });
    document.accessors.push({ bufferView: 1, componentType: 5125, count: indexCount, type: 'SCALAR' });
    document.materials = [material]; document.images = [{ uri: 'palette.png' }];
    document.textures = [{ source: 0, sampler: 0 }];
    document.samplers = [{ minFilter: 9728, magFilter: 9728, wrapS: 10497, wrapT: 10497 }];
    document.extensionsUsed = ['KHR_materials_specular'];
  }
  let json = Buffer.from(JSON.stringify(document)); json = Buffer.concat([json, Buffer.alloc(-json.length & 3, 32)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + packed.length, 8);
  header.writeUInt32LE(json.length, 12); header.write('JSON', 16);
  binHeader.writeUInt32LE(packed.length); binHeader.write('BIN\0', 4);
  return Buffer.concat([header, json, binHeader, packed]);
}
(async () => {
  if (process.argv.includes('--surfaces-only')) {
    const optimized = header(path.join(root, 'assets/maps/optimized/abyss_lowpoly.glb'));
    const raw = header(path.join(root, 'assets/maps/raw/abyss_bl.glb'));
    const source = optimized.nodes.find(n => n.mesh !== undefined && !/sky|dome/i.test(n.name));
    const filename = path.join(root, 'assets/maps/optimized/abyss-stream/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(filename)); let offset = 0;
    manifest.collisionSurfaces = optimized.meshes[source.mesh].primitives.map((primitive, index) => {
      const name = raw.materials[raw.meshes[source.mesh].primitives[index].material]?.name || '';
      const surface = /glass/i.test(name) ? 'glass' : /wood|timber|plywood/i.test(name) ? 'wood' : /metal|steel|iron/i.test(name) ? 'metal' : /concrete|plaster|brick/i.test(name) ? 'concrete' : 'solid';
      const start = offset; offset += optimized.accessors[primitive.indices].count / 3;
      return { start, end: offset, name, surface };
    });
    if (offset !== manifest.triangles) throw new Error('Surface metadata does not match packed collision');
    fs.writeFileSync(filename, JSON.stringify(manifest));
    console.log(JSON.stringify({ triangles: offset, ranges: manifest.collisionSurfaces.length, geometryRebuilt: false })); return;
  }
  const input = path.join(root, 'assets/maps/optimized/abyss_lowpoly.glb'), file = fs.readFileSync(input);
  const doc = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12))), bin = file.subarray(28 + file.readUInt32LE(12));
  const raw = header(path.join(root, 'assets/maps/raw/abyss_bl.glb'));
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'map-scale.json')));
  const scale = settings.geometryScale;
  if (!(scale > 0 && Number.isFinite(scale))) throw new Error('Invalid measured map scale');
  const output = path.join(root, 'assets/maps/optimized/abyss-stream'); fs.mkdirSync(output, { recursive: true });
  const d = await draco.createDecoderModule({}), decoder = new d.Decoder(), tiles = new Map(), candidates = [];
  const sourceNode = doc.nodes.find(n => n.mesh !== undefined && !/sky|dome/i.test(n.name));
  if (sourceNode.rotation || sourceNode.scale || sourceNode.matrix) throw new Error('Expected baked map transform');
  const sourceMesh = doc.meshes[sourceNode.mesh], translation = sourceNode.translation || [0, 0, 0];
  const triangleCount = sourceMesh.primitives.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0);
  const triangles = new Float32Array(triangleCount * 9), bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let base = 0, triangle = 0; const collisionSurfaces = [];
  for (let pi = 0; pi < sourceMesh.primitives.length; pi++) {
    const primitive = sourceMesh.primitives[pi], compressed = primitive.extensions.KHR_draco_mesh_compression;
    const view = doc.bufferViews[compressed.bufferView], bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const buffer = new d.DecoderBuffer(); buffer.Init(bytes, bytes.length);
    const mesh = new d.Mesh(), status = decoder.DecodeBufferToMesh(buffer, mesh);
    if (!status.ok()) throw new Error(status.error_msg());
    const attributes = {};
    for (const [name, id] of Object.entries(compressed.attributes)) {
      const attribute = decoder.GetAttributeByUniqueId(mesh, id), values = new d.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
      attributes[name] = { size: attribute.num_components(), values: Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i)) };
      const spec = doc.accessors[primitive.attributes[name]];
      if (spec.normalized) {
        const divisor = { 5121: 255, 5123: 65535 }[spec.componentType];
        if (!divisor) throw new Error('Unsupported normalized attribute');
        for (let i = 0; i < attributes[name].values.length; i++) attributes[name].values[i] /= divisor;
      }
      d.destroy(values);
    }
    const positions = attributes.POSITION.values, normals = attributes.NORMAL.values, uv = attributes.TEXCOORD_0.values;
    for (let i = 0; i < positions.length; i += 3) {
      // Babylon's default glTF root reflects X when converting to its left-handed scene.
      positions[i] = -(positions[i] * scale + translation[0]);
      positions[i + 1] = positions[i + 1] * scale + translation[1];
      positions[i + 2] = positions[i + 2] * scale + translation[2];
      normals[i] *= -1;
      for (let c = 0; c < 3; c++) { bounds.min[c] = Math.min(bounds.min[c], positions[i + c]); bounds.max[c] = Math.max(bounds.max[c], positions[i + c]); }
    }
    const rawPrimitive = raw.meshes[sourceNode.mesh].primitives[pi];
    const materialName = rawPrimitive && raw.materials[rawPrimitive.material]?.name || '';
    const surface = /glass/i.test(materialName) ? 'glass' : /wood|timber|plywood/i.test(materialName) ? 'wood' : /metal|steel|iron/i.test(materialName) ? 'metal' : /concrete|plaster|brick/i.test(materialName) ? 'concrete' : 'solid';
    collisionSurfaces.push({ start: triangle, end: triangle + mesh.num_faces(), name: materialName, surface });
    const floorMaterial = /floor|ground|dirtblend|carpet|tile/i.test(materialName);
    const scenery = /basalt|cliff|rock|cave|vista|terrain|mountain|beach/i.test(materialName) && !floorMaterial;
    const cellSize = scenery ? settings.sceneryCellSize : settings.cellSize;
    const face = new d.DracoInt32Array();
    for (let fi = 0; fi < mesh.num_faces(); fi++) {
      decoder.GetFaceFromMesh(mesh, fi, face);
      const ids = [face.GetValue(0), face.GetValue(2), face.GetValue(1)]; // baked X reflection
      const center = [0, 1, 2].map(c => ids.reduce((n, id) => n + positions[id * 3 + c], 0) / 3);
      const key = (scenery ? 'scenery_' : '') + center.map(c => Math.floor(c / cellSize)).join('_');
      if (!tiles.has(key)) tiles.set(key, { key, vertices: new List(Float32Array), indices: new List(Uint32Array), lookup: new Map(), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
      const tile = tiles.get(key);
      for (let v = 0; v < 3; v++) {
        const id = ids[v]; let index = tile.lookup.get(base + id);
        if (index === undefined) {
          index = tile.vertices.length / 12; tile.lookup.set(base + id, index);
          const color = attributes.COLOR_0, c = color ? Array.from(color.values.subarray(id * color.size, id * color.size + color.size)) : [1, 1, 1, 1];
          if (c.length === 3) c.push(1);
          tile.vertices.push(positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2], normals[id * 3], normals[id * 3 + 1], normals[id * 3 + 2], uv[id * 2], uv[id * 2 + 1], ...c);
          for (let axis = 0; axis < 3; axis++) { tile.min[axis] = Math.min(tile.min[axis], positions[id * 3 + axis]); tile.max[axis] = Math.max(tile.max[axis], positions[id * 3 + axis]); }
        }
        tile.indices.push(index);
        triangles.set(positions.subarray(id * 3, id * 3 + 3), triangle * 9 + v * 3);
      }
      if (floorMaterial) {
        const k = triangle * 9, ax = triangles[k + 3] - triangles[k], ay = triangles[k + 4] - triangles[k + 1], az = triangles[k + 5] - triangles[k + 2];
        const bx = triangles[k + 6] - triangles[k], by = triangles[k + 7] - triangles[k + 1], bz = triangles[k + 8] - triangles[k + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, area2 = Math.hypot(nx, ny, nz);
        if (Math.abs(ny) > area2 * 0.98 && area2 > 0.2) candidates.push({ position: center, area: area2 });
      }
      triangle++;
    }
    base += mesh.num_points(); d.destroy(face); d.destroy(mesh); d.destroy(buffer); d.destroy(status);
  }
  d.destroy(decoder);
  const image = doc.images[doc.textures[0].source], imageView = doc.bufferViews[image.bufferView];
  fs.writeFileSync(path.join(output, 'palette.png'), bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength));
  const chunks = [];
  for (const tile of tiles.values()) {
    const vertices = tile.vertices.array(), indices = tile.indices.array(), h = Buffer.alloc(12);
    h.write('VSC1'); h.writeUInt32LE(vertices.length / 12, 4); h.writeUInt32LE(indices.length, 8);
    const bytes = Buffer.concat([h, Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength), Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)]);
    const name = 'cell_' + tile.key + '.glb';
    const asset = glb(bytes, vertices.length / 12, indices.length, tile, doc.materials[sourceMesh.primitives[0].material]);
    fs.writeFileSync(path.join(output, name), asset);
    chunks.push({ file: name, min: tile.min, max: tile.max, bytes: asset.length, triangles: indices.length / 3 });
    tile.lookup.clear();
  }
  const context = vm.createContext({ console, window: {}, BABYLON: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'game/collision-world.js'), 'utf8') + '\nthis.CollisionWorld = CollisionWorld;', context);
  const world = Object.create(context.CollisionWorld.prototype);
  world.triangles = triangles; world.order = Uint32Array.from({ length: triangle }, (_, i) => i); world.nodes = []; world.build(0, triangle, 0);
  const nodeBounds = new Float32Array(world.nodes.length * 6), links = new Int32Array(world.nodes.length * 4);
  world.nodes.forEach((node, i) => { nodeBounds.set([...node.min, ...node.max], i * 6); links.set([node.start, node.end, node.left, node.right], i * 4); });
  const h = Buffer.alloc(12); h.write('VSB1'); h.writeUInt32LE(triangle, 4); h.writeUInt32LE(world.nodes.length, 8);
  const collision = glb(Buffer.concat([h, ...[triangles, world.order, nodeBounds, links].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength))]), triangle * 3, 0, bounds);
  fs.writeFileSync(path.join(output, 'collision.glb'), collision);
  const used = new Set(), spawnCandidates = [];
  for (const candidate of candidates.sort((a, b) => b.area - a.area)) {
    const key = candidate.position.map(v => Math.floor(v / 1.5)).join('_');
    if (used.has(key)) continue; used.add(key); spawnCandidates.push(candidate.position);
    if (spawnCandidates.length >= 512) break;
  }
  const manifest = { version: 1, source: 'abyss_lowpoly.glb', triangles: triangle, bounds, palette: 'palette.png',
    transform: { coordinateSpace: settings.coordinateSpace, scale, pivot: [-translation[0], translation[1], translation[2]],
      referenceObject: settings.referenceObject, originalReferenceSpan: settings.originalReferenceSpan, exportedReferenceSpan: settings.exportedReferenceSpan },
    cellSize: settings.cellSize, sceneryCellSize: settings.sceneryCellSize,
    spawnAnchor: [-translation[0], translation[1], translation[2]],
    material: doc.materials[sourceMesh.primitives[0].material], sampler: doc.samplers[doc.textures[0].sampler],
    collision: 'collision.glb', collisionSurfaces, spawnCandidates, chunks };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));
  console.log(JSON.stringify({ chunks: chunks.length, triangles: triangle, geometryMB: chunks.reduce((n, c) => n + c.bytes, 0) / 1048576,
    collisionMB: collision.length / 1048576, rssMB: process.memoryUsage().rss / 1048576 }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
