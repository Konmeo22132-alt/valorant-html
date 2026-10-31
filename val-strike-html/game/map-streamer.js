// Exact palette low-poly geometry, spatially streamed. Physics stays loaded separately.
function mapGLBOffset(data) {
  if (data.byteLength < 28) throw new Error('Empty/truncated map asset');
  const view = new DataView(data), offset = 20 + view.getUint32(12, true);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(8, true) !== data.byteLength || offset + 8 > data.byteLength || view.getUint32(offset + 4, true) !== 0x004e4942) throw new Error('Invalid map GLB');
  return offset + 8;
}
function mapSavedMarker(marker) {
  const transform = window.__mapTransform;
  if (!transform || marker.coordinateSpace === transform.coordinateSpace) return { ...marker };
  if (marker.coordinateSpace) return null; // A marker from a different map cannot be placed reliably.
  const migrated = { ...marker, coordinateSpace: transform.coordinateSpace };
  for (const [i, axis] of ['x', 'y', 'z'].entries()) migrated[axis] = transform.pivot[i] + (marker[axis] - transform.pivot[i]) * transform.scale;
  return migrated;
}
class MapStreamer {
  constructor(scene, root, manifest, config) {
    this.scene = scene; this.root = root; this.manifest = manifest; this.config = config;
    this.resident = new Map(); this.pending = null; this.residentBytes = 0;
    this.shadows=scene._mapShadows||null;this.shadowWarmFrames=0;
    this.disposed = false; this.lastUpdate = -Infinity; this.camera = null;
    this.entries = manifest.chunks.map(chunk => ({ ...chunk, bounds: new BABYLON.BoundingInfo(
      BABYLON.Vector3.FromArray(chunk.min), BABYLON.Vector3.FromArray(chunk.max)), wanted: false, lastWanted: -Infinity, failedUntil: 0 }));
    // Haven fits in the existing GPU geometry budget. Keep its static shadow
    // casters as well as visible geometry, including in Unrated/Custom.
    this.retainAll = manifest.map === 'haven' && this.entries.reduce((sum, entry) => sum + (entry.residentBytes || entry.bytes), 0) <= config.mapResidentMB * 1048576;
    const source = manifest.material.pbrMetallicRoughness || {};
    this.material = new BABYLON.PBRMaterial('original_lowpoly_palette', scene);
    this.material.metallic = source.metallicFactor ?? 1;
    this.material.roughness = source.roughnessFactor ?? 1;
    this.material.albedoColor = BABYLON.Color3.FromArray(source.baseColorFactor || [1, 1, 1]);
    this.material.backFaceCulling = !manifest.material.doubleSided;
    this.material.twoSidedLighting = !!manifest.material.doubleSided;
    this.material.metallicF0Factor = manifest.map === 'haven' ? 1 : manifest.material.extensions?.KHR_materials_specular?.specularFactor ?? 1;
    const painted = manifest.version >= 2;
    this.textureReady = new Promise((resolve, reject) => {
      // Match the standalone glTF's NEAREST + CLAMP sampler for Haven's atlas.
      // Trilinear mipmaps blend adjacent palette cells into unrelated colors.
      const haven = manifest.map === 'haven';
      this.texture = new BABYLON.Texture(root + manifest.palette, scene, haven || !painted, false, haven || !painted ? BABYLON.Texture.NEAREST_SAMPLINGMODE : BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        resolve, message => reject(new Error(message || 'Palette loading failed')));
      if (haven) this.texture.wrapU = this.texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    });
    this.material.albedoTexture = this.texture;
    this.materials = { opaque: this.material };
    if (painted) {
      this.material.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
      const leaves = this.material.clone('painted_leaf_cutouts');
      leaves.albedoTexture = this.texture; this.texture.hasAlpha = true;
      leaves.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
      leaves.useAlphaFromAlbedoTexture = true; leaves.alphaCutOff = .45;
      leaves.backFaceCulling = false; leaves.twoSidedLighting = true;
      leaves.freeze(); this.materials.cutout = leaves;
    }
    this.material.freeze();
    this.observer = scene.onBeforeRenderObservable.add(() => {
      if(this.shadows&&this.shadowWarmFrames>0){this.shadowWarmFrames--;if(!this.shadowWarmFrames)this.shadows.getShadowMap().refreshRate=BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;}
      if (scene.activeCamera) this.update(scene.activeCamera);
    });
  }

  select(camera) {
    const aspect = this.scene.getEngine().getAspectRatio(camera) || 1;
    const projection = BABYLON.Matrix.PerspectiveFovLH(Math.min(2.8, camera.fov + this.config.mapPrefetchAngle), aspect, camera.minZ, camera.maxZ);
    const planes = BABYLON.Frustum.GetPlanes(camera.getViewMatrix(true).multiply(projection));
    const point = camera.globalPosition.asArray(), near2 = this.config.mapNearRadius ** 2;
    for (const entry of this.entries) {
      let distance2 = 0;
      for (let c = 0; c < 3; c++) {
        const gap = Math.max(entry.min[c] - point[c], 0, point[c] - entry.max[c]); distance2 += gap * gap;
      }
      entry.distance2 = distance2;
      entry.initial = this.priming && (this.retainAll || distance2 <= this.config.mapInitialRadius ** 2);
      entry.wanted = this.retainAll || entry.initial || distance2 <= near2 || entry.bounds.isInFrustum(planes);
    }
  }

  update(camera, force = false) {
    if (this.disposed) return;
    const now = performance.now(); this.camera = camera;
    if (!force && now - this.lastUpdate < this.config.mapUpdateInterval) return;
    this.lastUpdate = now; this.select(camera);
    for (const entry of this.entries) {
      if (entry.wanted) entry.lastWanted = now;
      else if (this.resident.has(entry.file) && now - entry.lastWanted > this.config.mapRetainTime) this.evict(entry);
    }
    this.report(); this.pump();
  }

  evict(entry) {
    const mesh = this.resident.get(entry.file); if (!mesh) return;
    this.shadows?.removeShadowCaster(mesh,false);
    const contact = this.scene._mapContactGeometry?.renderList;
    if(contact){const index=contact.indexOf(mesh);if(index>=0)contact.splice(index,1);}
    mesh.dispose(false, false); this.resident.delete(entry.file); this.residentBytes -= (entry.residentBytes||entry.bytes);
  }

  async pump() {
    if (this.disposed || this.pending || document.hidden || (!this.priming && !window.__gamePlaying)) return;
    const now = performance.now();
    const next = this.entries.filter(entry => entry.wanted && (!this.priming || (entry.initial && (entry.failures || 0) < this.config.mapInitialRetries)) && !this.resident.has(entry.file) && entry.failedUntil <= now)
      .sort((a, b) => a.distance2 - b.distance2)[0];
    if (!next) return;
    const budget = this.config.mapResidentMB * 1048576;
    for (const old of this.entries.filter(entry => this.resident.has(entry.file) && !entry.wanted)
      .sort((a, b) => a.lastWanted - b.lastWanted)) {
      if (this.residentBytes + (next.residentBytes||next.bytes) <= budget) break;
      this.evict(old);
    }
    // Visible geometry is never dropped to make room for an off-screen request.
    if (this.residentBytes + (next.residentBytes||next.bytes) > budget) { this.report(); return; }
    const controller = new AbortController(); this.pending = { entry: next, controller };
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.config.mapRequestTimeout);
    try {
      const response = await fetch(this.root + next.file, { signal: controller.signal });
      if (!response.ok) throw new Error('Map chunk ' + response.status);
      const data = await response.arrayBuffer();
      if (this.disposed || !next.wanted) return;
      const mesh = await this.createMesh(data, next);
      if(this.disposed){mesh.dispose();return;}
      if(this.shadows){mesh.receiveShadows=true;this.shadows.addShadowCaster(mesh,false);this.shadowWarmFrames=30;this.shadows.getShadowMap().refreshRate=BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;}
      this.scene._mapContactGeometry?.renderList?.push(mesh);
      this.resident.set(next.file, mesh); this.residentBytes += next.residentBytes||next.bytes;
      next.failures = 0; next.failedUntil = 0;
    } catch (error) {
      if (!this.disposed && (timedOut || error.name !== 'AbortError')) {
        next.failures = (next.failures || 0) + 1;
        next.lastError = timedOut ? 'Request timed out' : error.message;
        next.failedUntil = performance.now() + this.config.mapRetryDelay;
        console.warn('[map stream]', next.file, next.lastError);
      }
    } finally {
      clearTimeout(timeout);
      this.pending = null; this.report();
      if (!this.disposed) setTimeout(() => this.pump(), 0);
    }
  }

  createMesh(data, entry) {
    if(this.manifest.gameFormat==='draco-glb')return this.createDracoMesh(data,entry);
    const base = mapGLBOffset(data), header = new DataView(data, base), count = header.getUint32(4, true), indexCount = header.getUint32(8, true);
    if (header.getUint32(0, true) !== 0x31435356 || data.byteLength - base !== 12 + count * 48 + indexCount * 4) throw new Error('Invalid map chunk');
    const mesh = new BABYLON.Mesh(entry.file, this.scene);
    const buffer = new BABYLON.Buffer(this.scene.getEngine(), new Float32Array(data, base + 12, count * 12), false, 12);
    for (const [kind, offset, size] of [[BABYLON.VertexBuffer.PositionKind, 0, 3], [BABYLON.VertexBuffer.NormalKind, 3, 3],
      [BABYLON.VertexBuffer.UVKind, 6, 2], [BABYLON.VertexBuffer.ColorKind, 8, 4]]) mesh.setVerticesBuffer(buffer.createVertexBuffer(kind, offset, size, 12));
    mesh.setIndices(new Uint32Array(data, base + 12 + count * 48, indexCount));
    mesh.material = this.materials[entry.material || 'opaque']; mesh.isPickable = false;
    mesh.metadata = { streamedWorld: true, triangles: entry.triangles };
    mesh.setBoundingInfo(new BABYLON.BoundingInfo(BABYLON.Vector3.FromArray(entry.min), BABYLON.Vector3.FromArray(entry.max)));
    mesh.freezeWorldMatrix();
    return mesh;
  }
  async createDracoMesh(data,entry){
    const length=new DataView(data).getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,length))),primitive=doc.meshes[0].primitives[0],compressed=primitive.extensions.KHR_draco_mesh_compression,view=doc.bufferViews[compressed.bufferView];
    const kinds={POSITION:BABYLON.VertexBuffer.PositionKind,NORMAL:BABYLON.VertexBuffer.NormalKind,TEXCOORD_0:BABYLON.VertexBuffer.UVKind};
    const attributes=Object.fromEntries(Object.entries(compressed.attributes).map(([key,value])=>[kinds[key],value]));
    const vertex=await BABYLON.DracoCompression.Default.decodeMeshAsync(new Uint8Array(data,mapGLBOffset(data)+(view.byteOffset||0),view.byteLength),attributes);
    for(let i=0;i<vertex.positions.length;i+=3)vertex.positions[i]*=-1;
    for(let i=0;i<vertex.normals.length;i+=3)vertex.normals[i]*=-1;
    // Reflecting X already converts glTF's winding to Babylon's LH convention.
    // Reversing indices again makes the visible faces back faces, so two-sided
    // PBR lighting flips their normals (sunlit floors become dark undersides).
    const mesh=new BABYLON.Mesh(entry.file,this.scene);vertex.applyToMesh(mesh);mesh.material=this.materials[entry.material||'opaque'];mesh.isPickable=false;mesh.metadata={streamedWorld:true,triangles:entry.triangles};mesh.freezeWorldMatrix();return mesh;
  }

  report() {
    window.__mapStreamStats = { source: this.manifest.source, totalChunks: this.entries.length,
      wantedChunks: this.entries.filter(e => e.wanted).length, residentChunks: this.resident.size,
      missingChunks: this.entries.filter(e => e.wanted && !this.resident.has(e.file)).length,
      residentMB: this.residentBytes / 1048576, maxResidentMB: this.config.mapResidentMB,
      pending: this.pending?.entry.file || null, totalTriangles: this.manifest.triangles,
      residentTriangles: [...this.resident.values()].reduce((n, mesh) => n + mesh.metadata.triangles, 0) };
  }

  async prime(position, yaw, fov, onProgress, options={}) {
    if(options.all&&this.entries.reduce((sum,e)=>sum+(e.residentBytes||e.bytes),0)<=this.config.mapResidentMB*1048576)this.retainAll=true;
    this.priming = true;
    const camera = new BABYLON.FreeCamera('stream_prime', position.clone(), this.scene);
    camera.rotation.y = yaw; camera.fov = fov; this.update(camera, true);
    const initial = this.entries.filter(entry => entry.initial);
    let activeElapsed = 0, last = performance.now(), wasHidden = document.hidden;
    let paletteReady = false, paletteError;
    this.textureReady.then(() => { paletteReady = true; }, error => { paletteError = error; });
    try {
      while (true) {
        if (this.disposed) throw new Error('Map loading cancelled');
        const now = performance.now();
        if (!document.hidden && !wasHidden) activeElapsed += now - last;
        last = now; wasHidden = document.hidden;
        const loaded = initial.filter(entry => this.resident.has(entry.file)).length;
        onProgress?.({ loaded, total: initial.length, hidden: document.hidden });
        if (paletteError) throw paletteError;
        if (loaded === initial.length && paletteReady) break;
        const failed = initial.find(entry => entry.failures >= this.config.mapInitialRetries);
        if (failed) throw new Error('Initial map chunk failed: ' + failed.file + ' (' + failed.lastError + ')');
        if (activeElapsed > this.config.mapInitialTimeout) throw new Error('Map spawn loading timeout: ' + loaded + '/' + initial.length + ' chunks; waiting for ' + (this.pending?.entry.file || 'palette/retry'));
        // Before the first render there is no observer to restart a queue paused by tab visibility.
        this.pump();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally {
      camera.dispose(); this.camera = null; this.priming = false;
      this.entries.forEach(entry => { entry.initial = false; });
    }
  }

  dispose() {
    this.disposed = true; this.pending?.controller.abort();
    this.scene.onBeforeRenderObservable.remove(this.observer);
    for (const entry of this.entries) this.evict(entry);
    Object.values(this.materials).forEach(material => material.dispose(false, false));
    this.texture.dispose();
  }
}

async function loadStreamedMap(scene) {
  const legacy = new URLSearchParams(location.search).get('mapArt') === 'legacy';
  const root = MAP_MODE==='abyss'&&legacy?'/assets/maps/optimized/abyss-stream/':VSMaps.get(MAP_MODE).root;
  const response = await fetch(root + 'manifest.json');
  if (!response.ok) throw new Error('Low-poly map manifest ' + response.status);
  const manifest = await response.json();
  if (manifest.version >= 2) {
    scene.clearColor = BABYLON.Color4.FromHexString('#B8CFD8FF');
    const ambient = scene.getLightByName('amb');
    if (ambient) { ambient.intensity = .78; ambient.groundColor = BABYLON.Color3.FromHexString('#8E9B91'); }
    if(MAP_MODE==='haven'){
      scene._mapShadows=VSMapPresentation.haven(scene,ambient);
    }else{
      const sun = new BABYLON.DirectionalLight('abyss_soft_sun',new BABYLON.Vector3(-.45,-1,.35),scene);
      sun.intensity=.55;sun.diffuse=BABYLON.Color3.FromHexString('#FFF2DB');
    }
  }
  const collision = await fetch(root + manifest.collision);
  if (!collision.ok) throw new Error('Map collision ' + collision.status);
  const collisionData = await collision.arrayBuffer();
  window.collisionWorld = CollisionWorld.fromPacked(collisionData, mapGLBOffset(collisionData));
  window.collisionWorld.surfaceRanges = (manifest.collisionSurfaces || []).map(range => ({ ...range,
    mesh: { name: range.name, metadata: { worldCollision: true, surface: range.surface } } }));
  if(MAP_MODE==='abyss'){const stairs=await fetch('/assets/maps/optimized/abyss-art/stair-collision.json');
    if(!stairs.ok)throw Error('Stair collision '+stairs.status);window.collisionWorld.addSupplement(await stairs.json());}
  if(manifest.gameFormat==='draco-glb')BABYLON.DracoCompression.Configuration={decoder:{wasmUrl:'/game/draco/draco_wasm_wrapper.js',wasmBinaryUrl:'/game/draco/draco_decoder.wasm',fallbackUrl:'/game/draco/draco_decoder.js'}};
  window.__mapBounds = manifest.bounds; window.__mapSpawnCandidates = manifest.spawnCandidates;
  window.__mapSpawnAnchor = manifest.spawnAnchor;
  window.__mapTransform = manifest.transform;
  window.mapStreamer = new MapStreamer(scene, root, manifest, window.GAME_CONFIG.performance);
}
