// ============================================================
// Val-Strike HTML — Weapon System
// Raycast bắn từ tâm màn hình, recoil, ADS, reload, damage theo
// hitzone (đầu/thân/chân). Viewmodel placeholder box chờ GLB súng.
// ============================================================

const WEAPON_DEFS = {
  Classic:  { damage: 26, headMult: 3.0, fireDelay: 150, mag: 12, reserveMax: 36,  auto: false, kick: 0.010, adsZoom: false },
  Ghost:    { damage: 30, headMult: 3.5, fireDelay: 150, mag: 15, reserveMax: 45,  auto: false, kick: 0.008, adsZoom: false },
  Sheriff:  { damage: 55, headMult: 3.9, fireDelay: 400, mag: 6,  reserveMax: 24,  auto: false, kick: 0.030, adsZoom: false },
  Spectre:  { damage: 26, headMult: 2.8, fireDelay: 90,  mag: 30, reserveMax: 90,  auto: true,  kick: 0.012, adsZoom: true },
  Vandal:   { damage: 40, headMult: 4.0, fireDelay: 100, mag: 25, reserveMax: 50,  auto: true,  kick: 0.018, adsZoom: false },
  Phantom:  { damage: 39, headMult: 3.2, fireDelay: 90,  mag: 30, reserveMax: 60,  auto: true,  kick: 0.014, adsZoom: false },
  Operator: { damage: 150, headMult: 2.5, fireDelay: 1500, mag: 5, reserveMax: 10, auto: false, kick: 0.060, adsZoom: true }
};

const weaponState = {
  current: 'Classic',
  ammo: {},          // per weapon: { clip, reserve }
  reloading: false,
  lastShot: 0,
  ads: false,
  shooting: false
};

function weaponInit() {
  Object.keys(WEAPON_DEFS).forEach((w) => {
    weaponState.ammo[w] = { clip: WEAPON_DEFS[w].mag, reserve: WEAPON_DEFS[w].reserveMax };
  });
  VS.player.weapon = weaponState.current;
  VS.player.ammo = weaponState.ammo[weaponState.current];
  weaponBuildViewmodel();
  weaponBindInput();
  uiHUDUpdate();
}

// Viewmodel placeholder — box súng gắn vào camera (thay GLB sau)
let weaponModel = null;
function weaponBuildViewmodel() {
  weaponModel = BABYLON.MeshBuilder.CreateBox('viewmodel', { width: 0.06, height: 0.08, depth: 0.45 }, scene);
  const mat = new BABYLON.StandardMaterial('vm_mat', scene);
  mat.diffuseColor = new BABYLON.Color3(0.25, 0.27, 0.3);
  mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  weaponModel.material = mat;
  weaponModel.parent = camera;
  weaponModel.position = new BABYLON.Vector3(0.18, -0.14, 0.5);
  weaponModel.isPickable = false;
  weaponModel.renderingGroupId = 1;
}

// --- Bắn ---
function weaponShoot() {
  const def = WEAPON_DEFS[weaponState.current];
  const now = performance.now();
  if (weaponState.reloading || now - weaponState.lastShot < def.fireDelay) return;
  const am = weaponState.ammo[weaponState.current];
  if (am.clip <= 0) { weaponReload(); return; }
  weaponState.lastShot = now;
  am.clip--;

  // Raycast qua tâm màn hình
  const canvas = document.getElementById('renderCanvas');
  const ray = scene.createPickingRay(canvas.clientWidth / 2, canvas.clientHeight / 2, BABYLON.Matrix.Identity(), camera);
  // spread nhỏ khi đứng yên
  const spread = weaponState.ads ? 0 : def.kick * 0.5;
  ray.direction.x += (Math.random() - 0.5) * spread;
  ray.direction.y += (Math.random() - 0.5) * spread;
  const hit = scene.pickWithRay(ray, (m) => m.isEnabled() && m.getTotalVertices() > 0
    && !/sky/i.test(m.name) && m.name !== 'viewmodel' && !m.name.startsWith('bullet_hole'));

  // Recoil — giật camera lên, tự hồi
  camera.rotation.x += def.kick * 0.5;
  camera.rotation.y += (Math.random() - 0.5) * def.kick * 0.3;
  weaponModel.position.z = 0.45; // giật súng
  setTimeout(() => { if (weaponModel) weaponModel.position.z = 0.5; }, 60);

  if (hit && hit.hit && hit.pickedPoint) {
    weaponSpawnBulletHole(hit.pickedPoint, hit.getNormal(true));
    // Damage theo độ cao điểm trúng (hitbox giả: đầu > 1.55m)
    const hitY = hit.pickedPoint.y;
    const dmg = Math.round(hitY > 1.55 ? def.damage * def.headMult
              : hitY > 0.7 ? def.damage : def.damage * 0.85);
    console.log('[weapon] hit', hit.pickedMesh.name.slice(0, 30), 'dmg', dmg);
  }
  uiHUDUpdate();
}

// --- Bullet hole: đĩa đen nhỏ dán lên bề mặt ---
function weaponSpawnBulletHole(point, normal) {
  if (!normal) return;
  const hole = BABYLON.MeshBuilder.CreateDisc('bullet_hole', { radius: 0.03 }, scene);
  hole.position.copyFrom(point.add(normal.scale(0.005)));
  const n = normal;
  hole.setDirection(new BABYLON.Vector3(n.x, n.y, n.z));
  const mat = new BABYLON.StandardMaterial('bh_mat', scene);
  mat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  mat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  hole.material = mat;
  hole.isPickable = false;
  setTimeout(() => hole.dispose(), 8000); // tự biến mất sau 8s
}

// --- Reload ---
function weaponReload() {
  const def = WEAPON_DEFS[weaponState.current];
  const am = weaponState.ammo[weaponState.current];
  if (weaponState.reloading || am.clip >= def.mag || am.reserve <= 0) return;
  weaponState.reloading = true;
  uiHUDUpdate();
  setTimeout(() => {
    const need = def.mag - am.clip;
    const take = Math.min(need, am.reserve);
    am.clip += take;
    am.reserve -= take;
    weaponState.reloading = false;
    uiHUDUpdate();
  }, 2000);
}

// --- ADS (chuột phải) ---
function weaponToggleADS(on) {
  const def = WEAPON_DEFS[weaponState.current];
  if (!def.adsZoom && on) on = false; // chỉ Operator/Spectre có zoom
  weaponState.ads = on;
  camera.fov = on ? 0.9 : 1.4;
  if (weaponModel) weaponModel.position.x = on ? 0 : 0.18;
}

// --- Input ---
function weaponBindInput() {
  const canvas = document.getElementById('renderCanvas');
  document.addEventListener('mousedown', (e) => {
    if (!window.__gamePlaying) return;
    if (e.button === 0) {
      weaponShoot();
      if (WEAPON_DEFS[weaponState.current].auto) weaponState.shooting = true;
    }
    if (e.button === 2) weaponToggleADS(!weaponState.ads);
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) weaponState.shooting = false;
    if (e.button === 2) weaponToggleADS(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') weaponReload();
    if (e.code === 'Digit1') weaponSwitch('Primary');
    if (e.code === 'Digit2') weaponSwitch('Secondary');
    if (e.code === 'Digit3') weaponSwitch('Melee');
  });
  // auto fire
  scene.onBeforeRenderObservable.add(() => {
    if (weaponState.shooting && WEAPON_DEFS[weaponState.current].auto && window.__gamePlaying) weaponShoot();
  });
}

function weaponSwitch(slot) {
  // MVP: đổi giữa Vandal/Classic — loadout thật sẽ đến từ buy menu
  const order = slot === 'Primary' ? 'Vandal' : slot === 'Secondary' ? 'Classic' : weaponState.current;
  if (WEAPON_DEFS[order]) {
    weaponState.current = order;
    VS.player.weapon = order;
    VS.player.ammo = weaponState.ammo[order];
    uiHUDUpdate();
  }
}
