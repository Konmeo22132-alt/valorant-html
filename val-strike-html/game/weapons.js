// One gameplay clock drives fire, equip and reload; pausing freezes all three.
const weaponState = {
  current: 'Classic', ammo: {}, reloading: false, lastShot: -Infinity,
  ads: false, shooting: false, bloomShots: 0, odinRampShots: 0,
  equipUntil: 0, reloadUntil: 0, burstRemaining: 0, burstStarted: 0, fireUntil: 0, buttons: 0, scopeLevel: 1, meleeCombo: 0,
  loadout: { primary: 'Vandal', secondary: 'Classic', melee: 'Melee' }
};
let weaponModel = null, weaponKick = 0, inspectUntil = 0;
const weaponRecoil = { pitch: 0, yaw: 0 };
const bulletHoles = [];
function weaponNow() { return window.__gameTime || 0; }
function weaponDefs() { return window.GAME_CONFIG.weapons.weapons; }
function weaponDef(name = weaponState.current) { return weaponDefs()[name]; }
function weaponFireDelay(name = weaponState.current, alternate = false) {
  const def = weaponDef(name);
  if (alternate && def.altFire?.fireDelay) return def.altFire.fireDelay;
  if (alternate && def.altFire?.fireRate) return 1000 / def.altFire.fireRate;
  if ((weaponState.ads || weaponState.burstRemaining > 0) && def.altFire?.type === 'burst') return 1000 / def.altFire.shotRate;
  let rate = weaponState.ads && def.adsFireRate ? def.adsFireRate : def.fireRate;
  if (name === 'Odin' && weaponState.odinRampShots >= def.fireRateRamp.afterShots) rate = def.fireRateRamp.to;
  return def.fireDelay || 1000 / rate;
}
function weaponInit() {
  Object.entries(weaponDefs()).forEach(([name, def]) => {
    if (def.slot !== 'melee') weaponState.ammo[name] = { clip: def.mag, reserve: def.reserveMax };
  });
  VS.player.weapon = weaponState.current;
  VS.player.ammo = weaponState.ammo[weaponState.current];
  weaponState.equipUntil = weaponNow() + weaponDef().equipTime;
  weaponBuildViewmodel(); weaponBindInput(); uiHUDUpdate();
  if (typeof rangeInit === 'function') rangeInit();
  if (typeof weaponExtrasInit === 'function') weaponExtrasInit();
  const scope = document.createElement('div'); scope.id = 'hud-scope'; document.getElementById('game-hud')?.appendChild(scope);
  const picker = document.getElementById('range-weapon');
  if (picker) {
    Object.keys(weaponDefs()).forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; picker.appendChild(option); });
    picker.value = weaponState.current;
    picker.addEventListener('change', () => weaponSwitch(picker.value));
  }
}

function weaponBuildViewmodel() {
  if (typeof weaponDisposeAsset === 'function') weaponDisposeAsset();
  if (weaponModel) weaponModel.dispose(false, true);
  const melee = weaponDef().slot === 'melee';
  weaponModel = BABYLON.MeshBuilder.CreateBox('viewmodel', { width: melee ? 0.025 : 0.06, height: 0.08, depth: melee ? 0.3 : 0.45 }, scene);
  const material = new BABYLON.StandardMaterial('viewmodel_mat', scene);
  material.diffuseColor = new BABYLON.Color3(0.25, 0.27, 0.3); material.specularColor = BABYLON.Color3.Black();
  weaponModel.material = material; weaponModel.parent = camera;
  weaponModel.position.set(0.18, -0.14, 0.5); weaponModel.isPickable = false;
  weaponModel.metadata = { viewmodel: true }; weaponModel.renderingGroupId = 1;
  // Clear only depth before the viewmodel; it cannot disappear inside walls.
  scene.setRenderingAutoClearDepthStencil(1, true, true, false);
  if (typeof weaponRequestAsset === 'function') weaponRequestAsset();
}

function weaponCurrentSpread() {
  if (typeof agentState !== 'undefined' && VS.player.agent === 'Jett' && agentState.equipped === 'X') return 0;
  const def = weaponDef(); if (def.slot === 'melee') return 0;
  const spread = def.spread, move = window.__moveState || { grounded: true, speedPct: 0 };
  const mov = window.GAME_CONFIG.movement;
  const first = weaponState.ads ? (def.adsZeroError ? 0 : def.adsSpread ?? spread.firstShot * 0.6) : spread.firstShot;
  let value = first + (spread.max - spread.firstShot) * Math.min(1, weaponState.bloomShots / window.GAME_CONFIG.weapons.recoilModel.bloomShots);
  if (weaponState.ads && def.adsZeroError) value = 0;
  // ADS removes weapon error, never the penalty for moving or jumping.
  if (!move.grounded) value += mov.airborneSpread;
  else {
    if (move.speedPct > mov.deadzonePct) value += move.speedPct > 0.85 ? mov.runSpread : mov.walkSpread;
    if (move.landing) value += mov.landSpread.deg;
  }
  return move.crouching ? value * mov.crouchSpreadMult : value;
}
function weaponDamageAt(def, distance, zone = 'body') {
  const bracket = def.damage.find(row => distance <= row[0]) || def.damage[def.damage.length - 1];
  return bracket[{ head: 1, body: 2, leg: 3 }[zone] || 2];
}
function weaponRay(spreadDeg) {
  camera.computeWorldMatrix(true);
  const direction = camera.getDirection(BABYLON.Axis.Z);
  const right = camera.getDirection(BABYLON.Axis.X), up = camera.getDirection(BABYLON.Axis.Y);
  const angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * Math.tan(spreadDeg * Math.PI / 180);
  direction.addInPlace(right.scale(Math.cos(angle) * radius)).addInPlace(up.scale(Math.sin(angle) * radius)).normalize();
  return new BABYLON.Ray(camera.position.clone(), direction, weaponDef().range || (weaponDef().pellets ? 50 : 1000));
}
function weaponResolveHit(ray, def) {
  const world = typeof abilityWorldPick === 'function' ? abilityWorldPick(ray) : window.collisionWorld.pick(ray);
  const targetHit = scene.pickWithRay(ray, mesh => !!mesh.metadata?.target && mesh.isEnabled());
  const penetration = targetHit?.hit ? combatPenetration(ray, targetHit.distance, def) : { factor: 0 };
  const hit = targetHit?.hit && penetration.factor > 0 ? targetHit : world;
  if (!hit) return;
  if (hit.pickedMesh.metadata?.abilitySolid) {
    agentDamageWall(hit.pickedMesh, weaponDamageAt(def, hit.distance, 'body')); return;
  }
  const target = hit.pickedMesh.metadata?.target;
  const zone = hit.pickedMesh.metadata?.zone || 'body';
  let damage = weaponDamageAt(def, hit.distance, zone) * (target ? penetration.factor : 1);
  if (target && def.slot === 'melee') {
    const forward = target.forward || BABYLON.Vector3.Forward();
    if (BABYLON.Vector3.Dot(ray.direction, forward) > 0.5) damage *= def.backstabMultiplier || 2;
  }
  window.__lastHit = { mesh: hit.pickedMesh.name, distance: hit.distance, damage, zone, target: !!target, penetrated: penetration.surfaces > 0 };
  if (target) {
    if(target.matchBot&&typeof matchActive==='function'&&matchActive()&&matchState.mode==='unrated'&&target.member.team===matchState.human.team)damage/=3;
    Object.assign(window.__lastHit, combatDamage(target, damage,VS.player,{zone,weapon:weaponState.current}));
    if (typeof agentOnHit === 'function') agentOnHit(target, damage, { knife: false });
    if (rangeState.active) { rangeState.hits++; if (zone === 'head') rangeState.headshots++; rangeState.damage += damage; }
    if (penetration.surfaces) for (const entry of penetration.hits) weaponSpawnBulletHole(entry.pickedPoint, entry.getNormal(true));
    uiHitMarker?.(zone==='head');
    if (!target.hp) {
      if(target.matchBot){matchEntityDied(target,VS.player);if(rangeState.active)rangeUpdateUI();return;}
      uiKillFeed(VS.player.name, 'Target ' + (target.id + 1));
      target.meshes.forEach(mesh => mesh.setEnabled(false));
      target.respawnAt = weaponNow() + window.GAME_CONFIG.weapons.range.respawnDelay;
      if (rangeState.active) rangeState.kills++;
    }
  } else weaponSpawnBulletHole(hit.pickedPoint, hit.getNormal(true));
  if (rangeState.active) rangeUpdateUI();
}
function weaponMeleeRay(alternate) {
  const def = weaponDef(), mode = alternate ? def.altFire : def, ray = weaponRay(0);
  ray.length = mode.range; let best, bestScore = Infinity;
  for (const target of rangeTargets()) {
    const body = target.meshes.find(mesh => mesh.metadata?.zone === 'body');
    if (!body?.isEnabled()) continue;
    const direction = body.getAbsolutePosition().subtract(ray.origin), distance = direction.length();
    if (distance > ray.length) continue;
    direction.normalize(); const alignment = BABYLON.Vector3.Dot(ray.direction, direction);
    if (alignment < Math.cos(mode.sweepAngle * Math.PI / 180)) continue;
    const obstruction = window.collisionWorld.pick(new BABYLON.Ray(ray.origin, direction, distance));
    if (obstruction) continue;
    const score = 1 - alignment + distance * 0.0001;
    if (score < bestScore) { best = direction; bestScore = score; }
  }
  if (best) ray.direction = best;
  return ray;
}
function weaponShoot(alternate = false, continuation = false) {
  if(typeof matchBlocksCombat==='function'&&matchBlocksCombat())return false;
  if (typeof agentBlocksWeapon === 'function' && agentBlocksWeapon()) return false;
  const def = weaponDef(), now = weaponNow();
  if (weaponState.reloading && def.reloadPerShell && weaponState.ammo[weaponState.current].clip) {
    weaponState.reloading = false; weaponResetRig(); weaponAnimation = null;
  }
  if (!window.__gamePlaying || weaponState.reloading || now < weaponState.equipUntil || now + 0.01 < weaponState.fireUntil) return false;
  const melee = def.slot === 'melee', ammo = weaponState.ammo[weaponState.current];
  if (!melee && !ammo.clip) { weaponReload(); return false; }
  const alternateDef = alternate && ['shotgun', 'airburst', 'melee'].includes(def.altFire?.type) ? def.altFire : null;
  const ammoUsed = melee ? 0 : Math.min(ammo.clip, alternateDef?.ammoCost || 1);
  if (now - weaponState.lastShot > (def.spread?.recovery || 0) * 1000) weaponState.bloomShots = 0;
  const spread = weaponCurrentSpread(); // first shot uses first-shot accuracy
  if (melee && now - weaponState.lastShot > def.comboReset) weaponState.meleeCombo = 0;
  weaponState.lastShot = now;
  const delay = weaponFireDelay(weaponState.current, !!alternateDef);
  // Preserve sub-frame cadence, but never replay missed shots from a reload/idle gap.
  weaponState.fireUntil = (continuation ? Math.max(weaponState.fireUntil, now - (window.__frameDT || 1 / 30) * 1000) : now) + delay;
  if (!melee) ammo.clip -= ammoUsed;
  if (rangeState.active) rangeState.shots++;
  if (weaponState.current === 'Odin') weaponState.odinRampShots++;
  // Classic alt fire consumes one round per projectile, including a partially empty magazine.
  // Ordinary shotguns still consume one shell for all their pellets.
  let pellets = alternateDef?.type === 'shotgun' ? Math.min(alternateDef.pellets, ammoUsed) : alternateDef?.pellets || def.pellets || 1;
  if (alternateDef?.type === 'airburst') {
    const canister = weaponRay(0); canister.length = alternateDef.detonationDistance;
    const world = window.collisionWorld.pick(canister), target = scene.pickWithRay(canister, mesh => !!mesh.metadata?.target && mesh.isEnabled());
    if (world || target?.hit) weaponResolveHit(canister, { ...def, damage: alternateDef.canisterDamage });
    else for (let i = 0; i < pellets; i++) {
      const ray = weaponRay(alternateDef.spreadMin);
      ray.origin.copyFrom(canister.origin.add(canister.direction.scale(alternateDef.detonationDistance))); ray.length = def.range;
      weaponResolveHit(ray, def);
    }
  } else for (let i = 0; i < pellets; i++) {
    const ray = melee ? weaponMeleeRay(!!alternateDef) : weaponRay(alternateDef?.type === 'shotgun' ? Math.max(spread, alternateDef.spreadMin) : spread);
    if (melee && alternateDef) ray.length = alternateDef.range;
    weaponResolveHit(ray, melee && alternateDef ? { ...def, damage: alternateDef.damage } : def);
  }
  if (!melee) {
    weaponState.bloomShots++;
    const movement = window.__moveState || {};
    const cfg = window.GAME_CONFIG.weapons.recoilModel;
    let kick = (cfg.pitchDeg[def.class] || 0.7) * Math.PI / 180;
    if (weaponState.ads) kick *= cfg.adsMultiplier;
    if (movement.speedPct > 0.85 && def.runVerticalRecoilMult) kick *= def.runVerticalRecoilMult;
    kick = Math.min(kick, cfg.pitchCapDeg * Math.PI / 180 - weaponRecoil.pitch);
    const yaw = weaponState.bloomShots <= cfg.protectedShots ? 0 :
      (Math.floor((weaponState.bloomShots - cfg.protectedShots) / cfg.yawSwitchShots) % 2 ? -1 : 1) * cfg.yawDeg * Math.PI / 180 * (movement.crouching ? window.GAME_CONFIG.movement.crouchYawRecoilMult : 1);
    const actualKick = Math.min(kick, camera.rotation.x + 1.55);
    camera.rotation.x -= actualKick; camera.rotation.y += yaw;
    weaponRecoil.pitch += actualKick; weaponRecoil.yaw += yaw;
  }
  weaponKick = 0.06; inspectUntil = 0;
  const clip = melee ? alternateDef ? 'firealt' : ['fire', 'fire2', 'fire3'][weaponState.meleeCombo++ % 3] : 'fire';
  if (typeof weaponPlayAnimation === 'function') weaponPlayAnimation(clip, delay);
  if (typeof agentBodyAction === 'function') agentBodyAction(melee ? 'gun_Melee_'+clip+'_UB' : 'gun_'+weaponState.current+'_fire_UB', Math.max(130, delay));
  if (!melee && rangeState.active && rangeState.unlimited) { ammo.clip = def.mag; ammo.reserve = def.reserveMax; }
  if (typeof weaponEjectShell === 'function' && !melee) weaponEjectShell();
  if (rangeState.active) rangeUpdateUI();
  uiHUDUpdate(); return true;
}
function weaponReload() {
  if (typeof agentBlocksWeapon === 'function' && agentBlocksWeapon()) return;
  const def = weaponDef(), ammo = weaponState.ammo[weaponState.current];
  if (!window.__gamePlaying || !ammo || weaponState.reloading || weaponNow() < weaponState.equipUntil || ammo.clip >= def.mag || !ammo.reserve) return;
  weaponState.shooting = false; weaponState.burstRemaining = 0;
  weaponToggleADS(false); weaponState.reloading = true;
  weaponState.reloadStarted = weaponNow();
  weaponState.reloadDuration = def.reloadPerShell || (!ammo.clip && def.reloadEmptyTime) || def.reloadTime;
  weaponState.reloadUntil = weaponNow() + weaponState.reloadDuration;
  if (typeof weaponEjectShell === 'function' && ['Sheriff', 'Shorty', 'Outlaw'].includes(weaponState.current)) {
    for (let i = 0; i < def.mag - ammo.clip; i++) weaponEjectShell(true);
  }
  inspectUntil = 0;
  weaponState.reloadClip = !ammo.clip && def.reloadEmptyTime ? 'reloadempty' : 'reload';
  if (typeof weaponPlayAnimation === 'function') weaponPlayAnimation(weaponState.reloadClip, weaponState.reloadDuration);
  uiHUDUpdate();
}
function weaponToggleADS(on) {
  const def = weaponDef();
  weaponState.ads = !!on && !!def.adsZoom && !weaponState.reloading && weaponNow() >= weaponState.equipUntil;
  if (!weaponState.ads) weaponState.scopeLevel = 1;
  if (weaponState.ads && def.altFire?.type === 'burst') weaponState.shooting = false;
  camera.fov = 2 * Math.atan(Math.tan(window.GAME_CONFIG.movement.baseFov / 2) / (weaponState.ads ? weaponState.scopeLevel === 2 ? def.adsZoomSecondary : def.adsZoom : 1));
  const scope = document.getElementById('hud-scope');
  if (scope) scope.style.display = weaponState.ads && def.class === 'sniper' ? 'block' : 'none';
  if (weaponModel) weaponModel.setEnabled(!(weaponState.ads && def.class === 'sniper') &&
    !(typeof agentWeaponHidden==='function' && agentWeaponHidden()));
}
function weaponClearInput() {
  weaponState.shooting = false; weaponState.burstRemaining = 0; weaponState.odinRampShots = 0;
  weaponToggleADS(false);
}
function weaponSwitch(nameOrSlot) {
  if (typeof agentCancelEquip === 'function') agentCancelEquip();
  const target = weaponState.loadout[nameOrSlot] || nameOrSlot;
  if(typeof matchCanSwitch==='function'&&!matchCanSwitch(target))return;
  const def = weaponDef(target);
  if (!def || target === weaponState.current) return;
  weaponClearInput(); weaponState.reloading = false; weaponState.reloadUntil = 0;
  weaponState.current = target; weaponState.loadout[def.slot] = target;
  if(typeof agentBodyAction==='function')agentBodyAction('gun_'+target+'_equip',def.equipTime);
  weaponState.equipUntil = weaponNow() + def.equipTime;
  weaponState.bloomShots = 0; weaponState.lastShot = -Infinity; inspectUntil = 0;
  weaponState.fireUntil = 0;
  camera.rotation.x += weaponRecoil.pitch; camera.rotation.y -= weaponRecoil.yaw; weaponRecoil.pitch = weaponRecoil.yaw = 0;
  VS.player.weapon = target; VS.player.ammo = weaponState.ammo[target] || {};
  weaponBuildViewmodel();
  if (typeof weaponSkinPicker === 'function') weaponSkinPicker();
  if (document.getElementById('range-weapon')) document.getElementById('range-weapon').value = target;
  uiHUDUpdate(); window.__renderOnce = true;
}
function weaponSpawnBulletHole(point, normal) {
  if (!normal) return;
  const hole = BABYLON.MeshBuilder.CreateDisc('bullet_hole', { radius: 0.03 }, scene);
  hole.position.copyFrom(point.add(normal.scale(0.005))); hole.setDirection(normal);
  if (!window.__bulletMaterial) {
    window.__bulletMaterial = new BABYLON.StandardMaterial('bullet_hole_mat', scene);
    window.__bulletMaterial.diffuseColor = new BABYLON.Color3(0.04, 0.04, 0.04);
    window.__bulletMaterial.backFaceCulling = false;
  }
  hole.material = window.__bulletMaterial; hole.isPickable = false;
  bulletHoles.push({ hole, expires: weaponNow() + window.GAME_CONFIG.performance.bulletHoleLifetime });
  while (bulletHoles.length > window.GAME_CONFIG.performance.maxBulletHoles) bulletHoles.shift().hole.dispose();
}
function weaponBindInput() {
  const canvas = document.getElementById('renderCanvas');
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  // Additional mouse buttons arrive as pointermove, not a second pointerdown.
  // Compare the buttons mask so firing and ADS can be pressed/released independently.
  function updateButtons(event, allowPress) {
    if (event.isPrimary === false) return;
    if(typeof uiInputBlocked==='function'&&uiInputBlocked()){weaponClearInput();return;}
    const buttons = event.buttons & 3, previous = weaponState.buttons;
    weaponState.buttons = buttons;
    if (!window.__gamePlaying) return;
    const pressed = allowPress ? buttons & ~previous : 0, released = previous & ~buttons;
    if (typeof agentPointer === 'function' && agentPointer(pressed, released)) { weaponState.shooting = false; return; }
    if (released & 1) { weaponState.shooting = false; weaponState.odinRampShots = 0; }
    if (released & 2) weaponToggleADS(false);
    if (pressed & 2) {
      if (['shotgun', 'airburst', 'melee'].includes(weaponDef().altFire?.type)) weaponShoot(true); else weaponToggleADS(true);
    }
    if (pressed & 1) {
      const def = weaponDef();
      if (weaponState.ads && def.altFire?.type === 'burst') {
        if (weaponShoot()) {
          weaponState.burstRemaining = Math.min(def.altFire.count - 1, weaponState.ammo[weaponState.current].clip); weaponState.burstStarted = weaponNow();
          if (!weaponState.burstRemaining) weaponState.fireUntil = Math.max(weaponState.fireUntil, weaponState.burstStarted + def.altFire.interval);
        }
      } else { weaponState.shooting = !!def.auto; weaponShoot(); }
    }
  }
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault(); updateButtons(event, true);
  });
  document.addEventListener('pointermove', event => {
    updateButtons(event, event.target === canvas || document.pointerLockElement === canvas);
  });
  document.addEventListener('pointerup', event => updateButtons(event, false));
  document.addEventListener('pointercancel', () => { weaponState.buttons = 0; weaponClearInput(); });
  document.addEventListener('keydown', event => {
    if (!window.__gamePlaying || (typeof uiInputBlocked==='function'&&uiInputBlocked()) || event.repeat || event.target.matches('input,select,textarea')) return;
    if (event.code === 'KeyR') weaponReload();
    if (event.code === 'Digit1') weaponSwitch('primary');
    if (event.code === 'Digit2') weaponSwitch('secondary');
    if (event.code === 'Digit3') weaponSwitch('melee');
    if (event.code === 'KeyZ' && weaponState.ads && weaponDef().adsZoomSecondary) {
      weaponState.scopeLevel = weaponState.scopeLevel === 1 ? 2 : 1; weaponToggleADS(true);
    }
    if (event.code === 'KeyF' && !weaponState.reloading && weaponNow() >= weaponState.equipUntil) {
      inspectUntil = 0;
      if (typeof weaponPlayAnimation === 'function') weaponPlayAnimation('inspect');
    }
  });
  scene.onBeforeRenderObservable.add(() => {
    if (typeof rangeUpdate === 'function') rangeUpdate(weaponNow());
    if (!window.__gamePlaying) return;
    const now = weaponNow(), def = weaponDef();
    if (typeof weaponUpdateAnimation === 'function') weaponUpdateAnimation();
    if (weaponState.reloading && now >= weaponState.reloadUntil) {
      const ammo = weaponState.ammo[weaponState.current], take = Math.min(def.reloadPerShell ? 1 : def.mag - ammo.clip, ammo.reserve);
      ammo.clip += take; ammo.reserve -= take;
      if (def.reloadPerShell && ammo.clip < def.mag && ammo.reserve) {
        weaponState.reloadStarted = now; weaponState.reloadUntil = now + def.reloadPerShell;
        weaponPlayAnimation('reload', def.reloadPerShell);
      } else weaponState.reloading = false;
      uiHUDUpdate();
    }
    for (let shot = 0; shot < 4; shot++) {
      if (weaponState.burstRemaining > 0) {
        if (!weaponShoot(false, true)) break;
        weaponState.burstRemaining--;
        if (!weaponState.burstRemaining) weaponState.fireUntil = Math.max(weaponState.fireUntil, weaponState.burstStarted + def.altFire.interval);
      } else if (weaponState.shooting && def.auto) { if (!weaponShoot(false, true)) break; }
      else break;
    }
    if (now - weaponState.lastShot >= (def.spread?.recovery || 0) * 1000) weaponState.bloomShots = 0;
    weaponKick *= Math.exp(-(window.__frameDT || 1 / 30) * 18);
    if (now - weaponState.lastShot > (def.spread?.recovery || 0) * 1000) {
      const factor = 1 - Math.exp(-(window.__frameDT || 1 / 30) * window.GAME_CONFIG.weapons.recoilModel.returnSpeed);
      camera.rotation.x += weaponRecoil.pitch * factor; camera.rotation.y -= weaponRecoil.yaw * factor;
      weaponRecoil.pitch *= 1 - factor; weaponRecoil.yaw *= 1 - factor;
    }
    const crosshair = document.querySelector('#game-hud .crosshair');
    if (crosshair) { crosshair.style.setProperty('--gap', Math.min(40, 4 + weaponCurrentSpread() * 5) + 'px'); crosshair.style.visibility = window.__agentCursorMode || (weaponState.ads && def.class === 'sniper') ? 'hidden' : 'visible'; }
    if (weaponModel) {
      const movement = window.__moveState || {}, bob = movement.grounded && movement.hSpeed > 0.1 ? Math.sin(now * 0.012) * 0.004 : 0;
      // Loaded assets carry their source camera-relative holding/ADS poses.
      // Only the inexpensive loading placeholder needs a manual offset/bob.
      if (weaponAssetContainer) {
        const hasADSPose = weaponAnimationGroups.some(group => group.name === 'ads');
        const attachment = weaponRigRest.find(rest => rest.node.name === 'fp_weapon_motion');
        const adsOffset = weaponState.ads && !hasADSPose && attachment ? attachment.position.y * 0.01 : 0;
        weaponModel.position.set(adsOffset, 0, -weaponKick);
      }
      else weaponModel.position.set(weaponState.ads ? 0 : 0.18, -0.14 + bob, 0.5 - weaponKick);
      weaponModel.rotation.z = inspectUntil > now ? Math.sin((inspectUntil - now) / 2000 * Math.PI) * 0.8 : 0;
    }
    while (bulletHoles.length && bulletHoles[0].expires <= now) bulletHoles.shift().hole.dispose();
    if (typeof weaponUpdateShells === 'function') weaponUpdateShells();
    if (typeof agentVisualUpdate === 'function') agentVisualUpdate();
  });
}
