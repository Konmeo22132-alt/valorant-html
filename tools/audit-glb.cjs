// Inspect geometry and embedded texture memory without loading a renderer.
const fs = require('node:fs');
for (const file of process.argv.slice(2)) {
  const data = fs.readFileSync(file);
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  const binaryStart = 20 + data.readUInt32LE(12) + 8;
  let vertices = 0, triangles = 0;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) {
    vertices += json.accessors[primitive.attributes.POSITION].count;
    triangles += (primitive.indices === undefined ? json.accessors[primitive.attributes.POSITION].count : json.accessors[primitive.indices].count) / 3;
  }
  let textureBytes = 0;
  const images = (json.images || []).map(image => {
    const view = json.bufferViews[image.bufferView];
    if (!view) return { name: image.name, uri: image.uri };
    const offset = binaryStart + (view.byteOffset || 0);
    let width, height;
    if (data.toString('ascii', offset + 1, offset + 4) === 'PNG') {
      width = data.readUInt32BE(offset + 16); height = data.readUInt32BE(offset + 20);
    } else if (image.mimeType === 'image/webp') {
      const kind = data.toString('ascii', offset + 12, offset + 16);
      if (kind === 'VP8X') {
        width = data.readUIntLE(offset + 24, 3) + 1; height = data.readUIntLE(offset + 27, 3) + 1;
      } else if (kind === 'VP8 ') {
        width = data.readUInt16LE(offset + 26) & 0x3fff; height = data.readUInt16LE(offset + 28) & 0x3fff;
      } else if (kind === 'VP8L') {
        const bits = data.readUInt32LE(offset + 21);
        width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      }
    }
    if (width && height) {
      textureBytes += width * height * 4 * 4 / 3;
      return { name: image.name, width, height, bytes: view.byteLength };
    }
    return { name: image.name, mimeType: image.mimeType, bytes: view.byteLength };
  });
  console.log(JSON.stringify({ file, fileMB: +(data.length / 1048576).toFixed(1), meshes: json.meshes?.length,
    primitives: (json.meshes || []).reduce((n, m) => n + m.primitives.length, 0), vertices, triangles,
    meshStats: (json.meshes || []).map(m => ({ name: m.name, triangles: m.primitives.reduce((n, p) => n + (p.indices === undefined ? json.accessors[p.attributes.POSITION].count : json.accessors[p.indices].count) / 3, 0) })),
    materials: json.materials?.length, images: images.length, decodedTextureMB: +(textureBytes / 1048576).toFixed(1),
    largestTextures: images.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)).slice(0, 8),
    animations: json.animations?.map(a => a.name) || [] }, null, 2));
}
