// Static triangle BVH. Build once after map loading; movement never scans
// the entire render mesh or includes decals/viewmodels in floor detection.
// Lexical intrinsics also avoid repeated VM global lookups on the Node server.
const collisionAbs=Math.abs,collisionMin=Math.min,collisionMax=Math.max,collisionHypot=Math.hypot;
class CollisionWorld {
  addSupplement(data) {
    const world=Object.create(CollisionWorld.prototype),count=data.triangles.length/9;
    world.triangles=new Float32Array(data.triangles);world.order=Uint32Array.from({length:count},(_,i)=>i);world.nodes=[];
    world.meshes=[{name:'stair_collision',metadata:{worldCollision:true,surface:'concrete',stair:true}}];
    world.surfaceRanges=data.ranges.map(r=>({...r,mesh:{name:r.name,metadata:{worldCollision:true,surface:r.surface,stair:!!r.stair}}}));
    if(count)world.build(0,count,0);this.supplement=world;
  }
  static fromPacked(buffer, base = 0) {
    const h = new DataView(buffer, base);
    if (h.getUint32(0, true) !== 0x31425356) throw new Error('Invalid collision file');
    const count = h.getUint32(4, true), nodes = h.getUint32(8, true);
    if (buffer.byteLength - base !== 12 + count * 40 + nodes * 40) throw new Error('Truncated collision file');
    const world = Object.create(CollisionWorld.prototype);
    world.triangles = new Float32Array(buffer, base + 12, count * 9);
    world.order = new Uint32Array(buffer, base + 12 + count * 36, count);
    world.nodeBounds = new Float32Array(buffer, base + 12 + count * 40, nodes * 6);
    world.nodeLinks = new Int32Array(buffer, base + 12 + count * 40 + nodes * 24, nodes * 4);
    world.nodes = [];
    world.meshes = [{ name: 'abyss_world_collision', metadata: { worldCollision: true } }];
    return world;
  }
  constructor(meshes, quiet = false) {
    const sources = meshes.filter(m => m.isEnabled() && m.getTotalVertices() > 0 && m.metadata?.worldCollision);
    const count = sources.reduce((n, m) => n + m.getTotalIndices() / 3, 0);
    this.triangles = new Float32Array(count * 9);
    this.meshes = sources;
    this.meshIds = new Uint16Array(count);
    this.order = new Uint32Array(count);
    this.nodes = [];
    let triangle = 0;
    sources.forEach((mesh, meshId) => {
      const matrix = mesh.computeWorldMatrix(true).m;
      const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      const world = new Float32Array(positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        world[i] = x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12];
        world[i + 1] = x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13];
        world[i + 2] = x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14];
      }
      for (let i = 0; i < indices.length; i += 3) {
        for (let v = 0; v < 3; v++) {
          const from = indices[i + v] * 3, to = triangle * 9 + v * 3;
          this.triangles[to] = world[from];
          this.triangles[to + 1] = world[from + 1];
          this.triangles[to + 2] = world[from + 2];
        }
        this.meshIds[triangle] = meshId; this.order[triangle] = triangle; triangle++;
      }
    });
    if (count) this.build(0, count, 0);
    if (!quiet) console.log('[collision] indexed', count, 'triangles in', this.nodes.length, 'nodes');
  }

  meshForTriangle(triangle) {
    if (this.meshIds) return this.meshes[this.meshIds[triangle]];
    const ranges = this.surfaceRanges;
    if (!ranges?.length) return this.meshes[0];
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, range = ranges[mid];
      if (triangle < range.start) hi = mid - 1;
      else if (triangle >= range.end) lo = mid + 1;
      else return range.mesh;
    }
    return this.meshes[0];
  }

  build(start, end, depth) {
    const t = this.triangles, order = this.order;
    const node = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], start, end, left: -1, right: -1 };
    const id = this.nodes.push(node) - 1;
    const centroidMin = [Infinity, Infinity, Infinity], centroidMax = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const offset = order[i] * 9;
      for (let v = 0; v < 9; v++) {
        const axis = v % 3, value = t[offset + v];
        if (value < node.min[axis]) node.min[axis] = value;
        if (value > node.max[axis]) node.max[axis] = value;
      }
      for (let c = 0; c < 3; c++) {
        const centroid = t[offset + c] + t[offset + c + 3] + t[offset + c + 6];
        if (centroid < centroidMin[c]) centroidMin[c] = centroid;
        if (centroid > centroidMax[c]) centroidMax[c] = centroid;
      }
    }
    if (end - start <= 16 || depth >= 28) return id;
    let axis = 0;
    for (let c = 1; c < 3; c++) if (centroidMax[c] - centroidMin[c] > centroidMax[axis] - centroidMin[axis]) axis = c;
    const split = (centroidMin[axis] + centroidMax[axis]) * 0.5;
    let mid = start;
    for (let i = start; i < end; i++) {
      const p = order[i] * 9 + axis;
      if (t[p] + t[p + 3] + t[p + 6] < split) {
        const value = order[mid]; order[mid++] = order[i]; order[i] = value;
      }
    }
    if (mid === start || mid === end) return id;
    node.left = this.build(start, mid, depth + 1);
    node.right = this.build(mid, end, depth + 1);
    return id;
  }

  pick(ray, floorOnly = false, collect = false) {
    const origin = [ray.origin.x, ray.origin.y, ray.origin.z];
    const dir = [ray.direction.x, ray.direction.y, ray.direction.z];
    const t = this.triangles;
    let nearest = ray.length, found = -1, hitNormal;
    const hits = [];
    const stack = this.nodes.length || this.nodeBounds?.length ? [0] : [];
    while (stack.length) {
      const id = stack.pop(), node = this.nodes[id], bounds = this.nodeBounds, links = this.nodeLinks;
      let near = 0, far = nearest, intersects = true;
      for (let c = 0; c < 3; c++) {
        const minimum = node ? node.min[c] : bounds[id * 6 + c], maximum = node ? node.max[c] : bounds[id * 6 + 3 + c];
        if (collisionAbs(dir[c]) < 1e-10) {
          if (origin[c] < minimum - 0.0001 || origin[c] > maximum + 0.0001) { intersects = false; break; }
        } else {
          let a = (minimum - origin[c]) / dir[c], b = (maximum - origin[c]) / dir[c];
          if (a > b) { const temp = a; a = b; b = temp; }
          near = collisionMax(near, a); far = collisionMin(far, b);
          if (near > far) { intersects = false; break; }
        }
      }
      if (!intersects) continue;
      const left = node ? node.left : links[id * 4 + 2], right = node ? node.right : links[id * 4 + 3];
      if (left >= 0) { stack.push(left, right); continue; }
      const start = node ? node.start : links[id * 4], end = node ? node.end : links[id * 4 + 1];
      for (let i = start; i < end; i++) {
        const triangle = this.order[i], k = triangle * 9;
        const ax = t[k], ay = t[k + 1], az = t[k + 2];
        const ux = t[k + 3] - ax, uy = t[k + 4] - ay, uz = t[k + 5] - az;
        const vx = t[k + 6] - ax, vy = t[k + 7] - ay, vz = t[k + 8] - az;
        const px = dir[1] * vz - dir[2] * vy, py = dir[2] * vx - dir[0] * vz, pz = dir[0] * vy - dir[1] * vx;
        const det = ux * px + uy * py + uz * pz;
        if (collisionAbs(det) < 1e-9) continue;
        const inverse = 1 / det, tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
        const u = (tx * px + ty * py + tz * pz) * inverse;
        if (u < -0.00001 || u > 1.00001) continue;
        const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux;
        const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inverse;
        if (v < -0.00001 || u + v > 1.00001) continue;
        const distance = (vx * qx + vy * qy + vz * qz) * inverse;
        if (distance < 0.00001 || distance > nearest) continue;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = collisionHypot(nx, ny, nz);
        if (!length) continue;
        nx /= length; ny /= length; nz /= length;
        // Ripped geometry contains inconsistent winding. Floor slope is two-sided.
        if (floorOnly && collisionAbs(ny) < 0.7) continue;
        if (nx * dir[0] + ny * dir[1] + nz * dir[2] > 0) { nx = -nx; ny = -ny; nz = -nz; }
        hitNormal = new BABYLON.Vector3(nx, ny, nz);
        if (collect) {
          const normal = hitNormal;
          hits.push({ hit: true, distance, faceId: triangle,
            pickedPoint: ray.origin.add(ray.direction.scale(distance)),
            pickedMesh: this.meshForTriangle(triangle), getNormal: () => normal });
        } else { nearest = distance; found = triangle; }
      }
    }
    const extra=this.supplement?.pick(ray,floorOnly,collect);
    if (collect) return hits.concat(extra||[]).sort((a, b) => a.distance - b.distance).filter((hit, i, sorted) => !i || hit.pickedMesh !== sorted[i - 1].pickedMesh || hit.distance - sorted[i - 1].distance > 0.001);
    const hit=found < 0 ? null : {
      hit: true, distance: nearest,
      pickedPoint: ray.origin.add(ray.direction.scale(nearest)),
      pickedMesh: this.meshForTriangle(found),
      getNormal: () => hitNormal
    };
    return extra&&(!hit||extra.distance<hit.distance)?extra:hit;
  }
}

function worldPick(origin, direction, length, floorOnly = false) {
  const ray = new BABYLON.Ray(origin, direction, length);
  return typeof abilityWorldPick === 'function' ? abilityWorldPick(ray, floorOnly) : window.collisionWorld?.pick(ray, floorOnly) || null;
}
