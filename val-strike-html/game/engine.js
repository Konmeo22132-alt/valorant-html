// The user's palette low-poly map, streamed by view. One bounded render loop.
const requestedMap=new URLSearchParams(location.search).get('map');
let MAP_MODE=requestedMap==='range'?'range':VSMaps.valid(requestedMap)?requestedMap:VSMaps.random();
function selectGameMap(id){
  if(!VSMaps.valid(id)&&id!=='range')throw Error('Bản đồ không hợp lệ.');
  if(engine&&MAP_MODE!==id)throw Error('Bản đồ của phòng đã thay đổi. Hãy trở về sảnh.');
  MAP_MODE=id;window.GAME_CONFIG['map-layout']=window.GAME_CONFIG[VSMaps.get(id)?.layout]||null;
}
const MAP_CONFIG = {
  fallbackSpawn: { x: 0, y: 1.7, z: -14 }, sites: {},
  palette: {
    walls: BABYLON.Color3.FromHexString('#C9B99A'), floor: BABYLON.Color3.FromHexString('#8B7355'),
    accent: BABYLON.Color3.FromHexString('#D4A853'), siteA: BABYLON.Color3.FromHexString('#FF4655'),
    siteB: BABYLON.Color3.FromHexString('#3AA8FF')
  }
};
window.__errs = [];
function recordGameError(error) {
  const text = String(error?.message || error).slice(0, 240);
  if (!window.__errs.includes(text) && window.__errs.length < 20) window.__errs.push(text);
  console.error(error);
}
window.addEventListener('error', e => recordGameError(e.message));
window.addEventListener('unhandledrejection', e => recordGameError(e.reason));
let engine, scene;

function setLoadingText(text) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
  if(window.GameEntry?.phase==='loading')window.GameEntry.progress(0,text);
}

async function initEngine() {
  selectGameMap(MAP_MODE);
  const canvas = document.getElementById('renderCanvas');
  const perf = window.GAME_CONFIG?.performance || { maxFPS: 240, maxRenderWidth: 1920, maxRenderHeight: 1080 };
  engine = new BABYLON.Engine(canvas, false, { stencil: false, antialias: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false }, false);
  let graphicsController;
  function resize() {
    engine.setHardwareScalingLevel(Math.max(1, canvas.clientWidth / perf.maxRenderWidth, canvas.clientHeight / perf.maxRenderHeight)/(graphicsController?.scale()||1));
    engine.resize(); window.__renderOnce = true;
  }
  resize(); window.addEventListener('resize', resize);
  scene = new BABYLON.Scene(engine);
  graphicsController=VSRenderPerformance.create(engine,scene,perf,resize);resize();
  scene.clearColor = new BABYLON.Color4(0.059, 0.098, 0.137, 1);
  scene.skipPointerMovePicking = true;
  const ambient = new BABYLON.HemisphericLight('amb', BABYLON.Vector3.Up(), scene);
  ambient.intensity = 0.9;
  ambient.groundColor = new BABYLON.Color3(0.35, 0.38, 0.42);
  scene.pointerDownPredicate = () => false;
  scene.pointerUpPredicate = () => false;

  if (VSMaps.valid(MAP_MODE)) {
    const label='Đang tải bản đồ '+VSMaps.get(MAP_MODE).name+'…';setLoadingText(label);window.GameEntry?.progress(.04,label);
    try { await loadStreamedMap(scene); }
    catch (error) {
      if(new URLSearchParams(location.search).has('room')||window.GameEntry)throw error;
      window.mapStreamer?.dispose(); window.mapStreamer = null; window.collisionWorld = null;
      window.__mapBounds = null; window.__mapSpawnCandidates = null;
      window.__mapTransform = null;
      recordGameError(error); buildPlaceholderMap(); window.__mapFallback = true;
    }
  } else buildPlaceholderMap();
  setLoadingText('Đang chuẩn bị bản đồ…');window.GameEntry?.progress(.18,'Đang chuẩn bị bản đồ…');
  if (!window.collisionWorld) window.collisionWorld = new CollisionWorld(scene.meshes);
  VSMapPresentation.cameras(scene, MAP_MODE, perf);
  window.VS_SPAWN = MAP_MODE === 'range' || window.__mapFallback
    ? new BABYLON.Vector3(0, 1.7, -14) : autoFindSpawn();
  console.log('[engine]', MAP_MODE, 'spawn', window.VS_SPAWN.asArray());
  if (window.mapStreamer) {
    setLoadingText('Đang tải khu vực xuất phát…');
    await window.mapStreamer.prime(window.VS_SPAWN, window.VS_SPAWN_YAW || 0, window.GAME_CONFIG.movement.baseFov,
      progress => {setLoadingText(progress.hidden ? 'Hãy trở lại trang để tiếp tục tải trận đấu.'
        : 'Đang tải khu vực xuất phát…');window.GameEntry?.progress(.18+.42*progress.loaded/Math.max(1,progress.total),'Đang tải khu vực xuất phát…');});
  }

  let last = performance.now(), nextFrameAt = last, previousCap = 0, failed = false;
  engine.runRenderLoop(() => {
    const now = performance.now();
    if (failed || document.hidden || !scene.activeCamera) { last = nextFrameAt = now; return; }
    if (!window.__gamePlaying && !window.__renderOnce && !window.GameEntry?.pending) { last = nextFrameAt = now; return; }
    const cap = Math.min(window.GameEntry?.pending?60:240,Math.max(20,Number(perf.maxFPS)||240)), interval = 1000 / cap;
    if (cap !== previousCap) { nextFrameAt = now; previousCap = cap; }
    if (now + 0.5 < nextFrameAt && (window.__gamePlaying || !window.__renderOnce)) return;
    // Advance the deadline rather than resetting it to the last RAF time.
    // This preserves the selected average rate on 144/165/240 Hz displays.
    nextFrameAt += interval;
    if (nextFrameAt < now - interval) nextFrameAt = now + interval;
    window.__frameDT = Math.min(0.05, (now - last) / 1000);
    last = now; window.__renderOnce = false;
    graphicsController.begin(now);
    const renderStarted=performance.now();
    try { scene.render();graphicsController.end(performance.now()-renderStarted); }
    catch (error) {
      failed = true; recordGameError(error);
      window.playerController?.pause(); setLoadingText('RENDER ERROR — RELOAD TO RETRY');
    }
  });
  window.addEventListener('pagehide', () => { window.mapStreamer?.dispose(); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); }, { once: true });
  canvas.addEventListener('webglcontextlost', () => {
    window.playerController?.pause(); setLoadingText('GPU CONTEXT LOST — RELOAD TO RETRY');
  });
  window.__renderOnce = true;
}

function flatMaterial(name, color) {
  const mat = new BABYLON.StandardMaterial(name, scene);
  mat.diffuseColor = color; mat.specularColor = BABYLON.Color3.Black();
  return mat;
}
function flatBox(name, w, h, d, x, y, z, color) {
  const box = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  box.position.set(x, y, z); box.material = flatMaterial(name + '_mat', color);
  box.metadata = { worldCollision: true }; box.freezeWorldMatrix();
  return box;
}
function buildPlaceholderMap() {
  const p = MAP_CONFIG.palette;
  const ground = BABYLON.MeshBuilder.CreateGround('floor', { width: 50, height: 150 }, scene);
  ground.material = flatMaterial('floor_mat', p.floor); ground.metadata = { worldCollision: true };
  ground.freezeWorldMatrix();
  flatBox('wall_n', 50, 4, 1, 0, 2, 75, p.walls);
  flatBox('wall_s', 50, 4, 1, 0, 2, -25, p.walls);
  flatBox('wall_w', 1, 4, 100, -25, 2, 25, p.walls);
  flatBox('wall_e', 1, 4, 100, 25, 2, 25, p.walls);
  flatBox('crate_mid', 2, 0.8, 2, 0, 0.4, -4, p.accent);
  flatBox('test_ceiling', 3, 0.2, 4, -7, 1.6, -5, p.walls);
  for (let i = 0; i < 4; i++) flatBox('step_' + i, 3, (i + 1) * 0.18, 1, 7, (i + 1) * 0.09, -7 + i, p.accent);
  window.__rangeTargets = [];
  [-4, 0, 4].forEach((x, index) => {
    const target = { hp: 100, id: index, meshes: [], forward: new BABYLON.Vector3(0, 0, -1) };
    window.__rangeTargets.push(target);
    for (const [zone, height, y, width] of [['head', 0.3, 1.65, 0.3], ['body', 0.75, 1.125, 0.55], ['leg', 0.75, 0.375, 0.4]]) {
      const mesh = flatBox('target_' + index + '_' + zone, width, height, 0.35, x, y, 8, p.siteA);
      mesh.metadata = { target, zone }; target.meshes.push(mesh);
    }
  });
}

function autoFindSpawn() {
  const bounds = window.__mapBounds ? { min: BABYLON.Vector3.FromArray(window.__mapBounds.min), max: BABYLON.Vector3.FromArray(window.__mapBounds.max) }
    : scene.meshes.filter(m => m.metadata?.worldCollision).reduce((b, m) => {
    const box = m.getBoundingInfo().boundingBox;
    b.min.minimizeInPlace(box.minimumWorld); b.max.maximizeInPlace(box.maximumWorld); return b;
  }, { min: new BABYLON.Vector3(Infinity, Infinity, Infinity), max: new BABYLON.Vector3(-Infinity, -Infinity, -Infinity) });
  const mov = window.GAME_CONFIG.movement;
  let best, bestScore = -Infinity, bestYaw = 0;
  function considerFloor(hit) {
    const floor = hit.pickedPoint, eye = floor.add(new BABYLON.Vector3(0, mov.eyeHeight, 0));
    if (worldPick(floor.add(new BABYLON.Vector3(0, 0.05, 0)), BABYLON.Vector3.Up(), mov.standingHeight)) return;
    let openness = 0, longest = 0, yaw = 0;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, direction = new BABYLON.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const support = worldPick(floor.add(direction.scale(mov.playerRadius)).add(new BABYLON.Vector3(0, 0.15, 0)), BABYLON.Vector3.Down(), 0.3, true);
      if (!support || worldPick(floor.add(new BABYLON.Vector3(0, 0.5, 0)), direction, 1.25)) return;
      const obstruction = worldPick(eye, direction, 20), distance = obstruction?.distance ?? 20;
      if (distance < 1.25) return;
      openness += distance;
      if (distance > longest) { longest = distance; yaw = angle; }
    }
    if (longest < 8) return;
    const anchor = window.__mapSpawnAnchor;
    const score = anchor
      ? openness - Math.hypot(eye.x - anchor[0], eye.z - anchor[2]) - Math.abs(floor.y - anchor[1]) * 4
      : openness - eye.y * 2;
    if (score > bestScore) { best = eye; bestScore = score; bestYaw = yaw; }
  }
  for (const point of window.__mapSpawnCandidates || []) {
    const hit = worldPick(BABYLON.Vector3.FromArray(point).add(new BABYLON.Vector3(0, 0.3, 0)), BABYLON.Vector3.Down(), 0.7, true);
    if (hit) considerFloor(hit);
  }
  if (best) { window.VS_SPAWN_YAW = bestYaw; return best; }
  for (let x = 1; x < 20; x++) for (let z = 1; z < 20; z++) {
    const origin = new BABYLON.Vector3(bounds.min.x + (bounds.max.x - bounds.min.x) * x / 20,
      bounds.max.y + 2, bounds.min.z + (bounds.max.z - bounds.min.z) * z / 20);
    // Search below roofs too; a top-down first hit often lands on scenery.
    for (let layer = 0; layer < 24 && origin.y > bounds.min.y; layer++) {
      const hit = worldPick(origin, BABYLON.Vector3.Down(), origin.y - bounds.min.y + 1, true);
      if (!hit) break;
      considerFloor(hit); origin.y = hit.pickedPoint.y - 0.08;
    }
  }
  window.VS_SPAWN_YAW = bestYaw;
  return best || new BABYLON.Vector3(0, bounds.max.y + 2, 0);
}

