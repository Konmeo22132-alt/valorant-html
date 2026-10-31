// Range combat is shared by every weapon; all timers use the paused gameplay clock.
const rangeState = { armor: 'none', distance: 20, material: 'none', thickness: 0.15,
  unlimited: false, shots: 0, hits: 0, headshots: 0, kills: 0, damage: 0, walls: [], active: false };
function combatEquipArmor(entity, type = 'none') {
  const def = window.GAME_CONFIG.weapons.armor[type];
  entity.armorType = type; entity.armor = def?.absorb || 0;
  entity.regenPool = def?.regenPool || 0; entity.lastDamageAt = -Infinity;
  entity.regenUpdatedAt = weaponNow();
}
function combatDamage(entity, damage, source = null, context = {}) {
  if (typeof agentBeforeDamage === 'function') damage = agentBeforeDamage(entity, damage);
  if (damage <= 0 || entity.hp <= 0) return { healthDamage: 0, armorDamage: 0, hp: entity.hp, armor: entity.armor || 0 };
  const cfg = window.GAME_CONFIG.weapons.armor;
  const fraction = cfg[entity.armorType]?.absorbPct ?? cfg.absorbPct;
  const absorbed = Math.min(entity.armor || 0, damage * fraction);
  const hpBefore = entity.hp;
  entity.armor = Math.max(0, (entity.armor || 0) - absorbed);
  const temporary = Math.min(entity.overheal || 0, damage - absorbed);
  entity.overheal = Math.max(0, (entity.overheal || 0) - temporary);
  entity.hp = Math.max(0, entity.hp - (damage - absorbed - temporary));
  entity.lastDamageAt = weaponNow(); entity.regenUpdatedAt = weaponNow();
  if(typeof uiCombatDamage==='function')uiCombatDamage(entity,source,damage,hpBefore-entity.hp+absorbed+temporary,context);
  if(typeof matchRecordDamage==='function')matchRecordDamage(entity,source,damage);
  if (typeof agentAfterDamage === 'function') agentAfterDamage(entity, hpBefore, source);
  return { healthDamage: hpBefore - entity.hp, armorDamage: absorbed, hp: entity.hp, armor: entity.armor };
}
function combatUpdateArmor(entity, now) {
  if (entity.hp <= 0 || entity.armorType !== 'regen' || !entity.regenPool) return;
  const def = window.GAME_CONFIG.weapons.armor.regen;
  const from = Math.max(entity.regenUpdatedAt, entity.lastDamageAt + def.delay);
  const amount = Math.min(def.absorb - entity.armor, entity.regenPool, Math.max(0, now - from) * def.absorb / def.duration);
  entity.armor += amount; entity.regenPool -= amount; entity.regenUpdatedAt = now;
}
function combatPenetration(ray, stopDistance, def) {
  const cfg = window.GAME_CONFIG.weapons.penetrationModel;
  const limitedRay = new BABYLON.Ray(ray.origin, ray.direction, stopDistance);
  if (typeof abilitySolidPick === 'function' && abilitySolidPick(limitedRay)) return { factor: 0, hits: [], surfaces: 1 };
  const hits = window.collisionWorld.pick(limitedRay, false, true);
  const energy = cfg.energy[def.penetration] || 0;
  let spent = 0, surfaces = 0;
  for (let i = 0; i < hits.length; i++) {
    const entry = hits[i], material = entry.pickedMesh.metadata?.surface || 'solid';
    const exitIndex = hits.findIndex((hit, index) => index > i && hit.pickedMesh === entry.pickedMesh);
    // Open sheets/unknown geometry are conservatively opaque; never invent a wall exit.
    if (def.slot === 'melee' || exitIndex < 0 || ++surfaces > cfg.maxSurfaces) return { factor: 0, hits, surfaces };
    const exit = hits[exitIndex], thickness = exit.distance - entry.distance;
    spent += cfg.entryCost + thickness * (cfg.surfaces[material] ?? cfg.surfaces.solid);
    if (spent >= energy) return { factor: 0, hits, surfaces };
    // Account for overlapping walls too, rather than skipping unrelated intersections.
    hits.splice(exitIndex, 1);
  }
  return { factor: surfaces ? Math.max(cfg.minimumDamageFactor, 1 - spent / energy) : 1, hits, surfaces };
}
function rangeTargets() { return typeof matchActive==='function'&&matchActive()?window.__matchTargets||[]:window.__rangeTargets||[]; }
function rangeReset(refill = true) {
  if(typeof matchActive==='function'&&matchActive())return;
  for (const target of rangeTargets()) {
    target.hp = window.GAME_CONFIG.weapons.range.targetHealth; target.respawnAt = 0;
    combatEquipArmor(target, rangeState.armor); target.meshes.forEach(mesh => mesh.setEnabled(true));
  }
  rangeState.shots = rangeState.hits = rangeState.headshots = rangeState.kills = rangeState.damage = 0;
  if (refill) {
    weaponClearInput(); weaponState.reloading = false; weaponState.reloadUntil = 0;
    Object.entries(weaponState.ammo).forEach(([name, ammo]) => Object.assign(ammo, { clip: weaponDef(name).mag, reserve: weaponDef(name).reserveMax }));
    weaponResetRig(); weaponAnimation = null; combatEquipArmor(VS.player, rangeState.armor); VS.player.hp = 100;
    if (typeof agentRespawn === 'function') agentRespawn();
  }
  bulletHoles.splice(0).forEach(({ hole }) => hole.dispose()); window.__lastHit = null;
  uiHUDUpdate(); rangeUpdateUI(); window.__renderOnce = true;
}
function rangeConfigure() {
  if(typeof matchActive==='function'&&matchActive())return;
  const cfg = window.GAME_CONFIG.weapons.range;
  rangeState.walls.forEach(mesh => { const material = mesh.material; mesh.dispose(); material.dispose(); }); rangeState.walls = [];
  rangeTargets().forEach(target => target.meshes.forEach(mesh => {
    mesh.unfreezeWorldMatrix(); mesh.position.z = -14 + rangeState.distance; mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix();
  }));
  if (rangeState.material !== 'none') for (const x of [-4, 0, 4]) {
    const color = { wood: '#91734D', glass: '#7AB8BA', metal: '#75818C', concrete: '#AAA69C' }[rangeState.material];
    const wall = flatBox('practice_' + rangeState.material, 1.8, 2.4, rangeState.thickness, x, 1.2,
      -14 + rangeState.distance - cfg.wallGap, BABYLON.Color3.FromHexString(color));
    wall.metadata.surface = rangeState.material;
    if (rangeState.material === 'glass') wall.material.alpha = 0.35;
    rangeState.walls.push(wall);
  }
  window.collisionWorld = new CollisionWorld(scene.meshes.filter(mesh => !mesh.metadata?.abilitySolid));
  rangeReset(false);
}
function rangeUpdateUI() {
  const el = document.getElementById('range-results'); if (!el) return;
  const hit = window.__lastHit;
  const line = hit?.target ? `${hit.zone.toUpperCase()} · ${hit.distance.toFixed(1)} m · ${hit.damage.toFixed(1)} damage${hit.penetrated ? ' · xuyên tường' : ''}\nHP ${Math.ceil(hit.hp)} · Giáp ${Math.ceil(hit.armor)}` : 'Ngắm vào mục tiêu và bắn';
  el.textContent = `${rangeState.shots} phát · ${rangeState.hits} trúng · ${rangeState.headshots} headshot · ${rangeState.kills} hạ\n${line}`;
}
function rangeInit(force = false) {
  if (MAP_MODE !== 'range' && !force) return;
  rangeState.active = true; const cfg = window.GAME_CONFIG.weapons.range;
  rangeState.distance = cfg.distance; rangeState.thickness = cfg.wallThickness;
  const panel = document.createElement('section'); panel.id = 'range-panel';
  panel.innerHTML = `<style>
    #range-panel{position:absolute;top:16px;left:16px;z-index:11;width:250px;padding:14px;background:#0f1923e8;color:#ece8e1;font:12px/1.6 Arial;border-left:3px solid #ff4655;pointer-events:none}
    #range-panel h2{font-size:15px;letter-spacing:2px;margin:0 0 6px}#range-panel p{margin:4px 0;color:#aab9c5}
    #range-results{white-space:pre-line;margin-top:8px}#range-options{display:grid;gap:6px;pointer-events:auto}
    #range-options select,#range-options button{background:#243642;color:#ece8e1;border:1px solid #526471;padding:5px}#range-options label{display:flex;justify-content:space-between;gap:8px}
    #range-panel.playing #range-options{display:none}#range-panel.playing{width:250px;background:#0f1923b8}
    #hud-scope{position:absolute;inset:0;display:none;border:solid black;border-width:0 max(0px,calc((100vw - 100vh) / 2));border-radius:50%;box-shadow:inset 0 0 0 3px #000,inset 0 0 55px #000;pointer-events:none}
    #hud-scope:before,#hud-scope:after{content:'';position:absolute;background:#161616;left:50%;top:0;height:100%;width:1px}#hud-scope:after{left:0;top:50%;width:100%;height:1px}
    #range-panel~*{box-sizing:border-box}
  </style><h2>SHOOTING RANGE</h2><p>ESC chỉnh khu tập · R nạp · F inspect · 1/2/3 đổi súng · Z đổi zoom Operator</p>
  <div id="range-options">
    <label>Giáp mục tiêu <select id="practice-armor"><option value="none">Không giáp</option><option value="light">Light · 25</option><option value="heavy">Heavy · 50</option><option value="regen">Regen · 25 + 50</option></select></label>
    <label>Khoảng cách <select id="practice-distance">${cfg.distances.map(n => `<option value="${n}">${n} m</option>`).join('')}</select></label>
    <label>Vật cản <select id="practice-material"><option value="none">Không</option><option value="wood">Gỗ</option><option value="glass">Kính</option><option value="metal">Kim loại</option><option value="concrete">Bê tông</option></select></label>
    <label>Độ dày <select id="practice-thickness"><option value="0.15">15 cm</option><option value="0.5">50 cm</option><option value="1">1 m</option></select></label>
    <label>Đạn vô hạn <input id="practice-unlimited" type="checkbox"></label><button id="practice-reset">Làm mới mục tiêu & đạn</button>
  </div><div id="range-results"></div>`;
  document.getElementById('game-container').appendChild(panel);
  for (const id of ['hud-score', 'hud-minimap', 'hud-credits', 'hud-abilities']) document.getElementById(id)?.setAttribute('hidden', '');
  // Existing CSS sets display explicitly, so hide placeholders with inline display.
  for (const id of ['hud-score', 'hud-minimap', 'hud-credits', 'hud-abilities']) if (document.getElementById(id)) document.getElementById(id).style.display = 'none';
  for (const key of ['armor', 'distance', 'material', 'thickness']) {
    const input = document.getElementById('practice-' + key); input.value = rangeState[key];
    input.addEventListener('change', () => { rangeState[key] = ['distance', 'thickness'].includes(key) ? Number(input.value) : input.value; rangeConfigure(); });
  }
  document.getElementById('practice-unlimited').addEventListener('change', event => { rangeState.unlimited = event.target.checked; });
  document.getElementById('practice-reset').addEventListener('click', () => rangeReset());
  rangeConfigure();
}
function rangeUpdate(now) {
  const panel = document.getElementById('range-panel'); panel?.classList.toggle('playing', !!window.__gamePlaying);
  rangeTargets().forEach(target => {
    combatUpdateArmor(target, now);
    if (!target.matchBot && target.respawnAt && now >= target.respawnAt) {
      target.hp = window.GAME_CONFIG.weapons.range.targetHealth; target.respawnAt = 0;
      combatEquipArmor(target, rangeState.armor); target.meshes.forEach(mesh => mesh.setEnabled(true));
    }
  });
  combatUpdateArmor(VS.player, now);
}
