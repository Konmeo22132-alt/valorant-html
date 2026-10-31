// Local gameplay authority. All deadlines use __gameTime, which stops on ESC.
const agentState = { ready: false, equipped: null, charges: {}, cooldowns: {}, ult: 0,
  effects: [], projectiles: [], heals: [], deaths: [], kills: 0, knives: 0, knifeAt: 0,
  dashReady: 0, dashExpires: 0, lockUntil: 0, intangibleUntil: 0, revivedUntil: 0,
  lastVictim: null, deathAt: -Infinity, deathPoint: null, deathCause: null,
  overhealUntil: 0, overhealRemaining: 0, resurrectAt: 0, resurrectionCastAt: 0, resurrectionWindupEnds: 0,
  reviveNoticeUntil: 0, hasteUntil: 0, rotation: 0, smokeMarks: [], allies: [], message: '', messageUntil: 0 };
function agentNow() { return window.__gameTime || 0; }
function agentConfig(entity=VS.player) { return window.GAME_CONFIG['playable-agents']?.[entity.member?.agent||entity.agent||VS.player.agent]; }
function agentCombatEntities(){return typeof matchActive==='function'&&matchActive()?matchState.rules.members.map(p=>p.entity):[VS.player,...rangeTargets(),...agentState.allies];}
function agentNotice(message) { agentState.message = message; agentState.messageUntil = agentNow() + 3000; agentHUD(); return false; }
function agentPosition(entity = VS.player) {
  if (entity === VS.player) return BABYLON.Vector3.FromArray(playerController.getState().feet);
  return entity.position?.clone() || entity.meshes?.[0]?.getAbsolutePosition().clone() || BABYLON.Vector3.Zero();
}
function abilitySolidPick(ray, floorOnly = false) {
  return agentState.ready ? agentState.solidWorld?.pick(ray, floorOnly) || null : null;
}
function agentRebuildSolids() {
  const walls=agentState.effects.filter(effect=>effect.type==='wall').map(effect=>effect.mesh);
  agentState.solidWorld=walls.length?new CollisionWorld(walls,true):null;
  agentState.solidsDirty=false;
}
function abilityWorldPick(ray, floorOnly = false) {
  const world = window.collisionWorld?.pick(ray, floorOnly), solid = abilitySolidPick(ray, floorOnly);
  return solid && (!world || solid.distance < world.distance) ? solid : world || null;
}
function agentLOS(from, to, smoke = true) {
  const direction = to.subtract(from), distance = direction.length();
  if (distance < .01) return true;
  const ray = new BABYLON.Ray(from, direction.scale(1/distance), Math.max(0, distance-.06));
  if (abilityWorldPick(ray)) return false;
  if (!smoke) return true;
  return !agentState.effects.some(effect => {
    if (effect.type !== 'smoke' || agentNow() < effect.starts) return false;
    const radius=effect.actualRadius??effect.radius;
    const offset = effect.position.subtract(from), t = Math.max(0, Math.min(distance, BABYLON.Vector3.Dot(offset, ray.direction)));
    // A smoke blocks sight across its surface. Both inside may see one another.
    if (BABYLON.Vector3.Distance(from,effect.position)<radius && BABYLON.Vector3.Distance(to,effect.position)<radius) return false;
    return BABYLON.Vector3.Distance(from.add(ray.direction.scale(t)),effect.position)<radius;
  });
}
function agentAimGround(range) {
  const direction = camera.getDirection(BABYLON.Axis.Z), ray = new BABYLON.Ray(camera.position.clone(),direction,range);
  const hit=abilityWorldPick(ray);
  const point = hit?.pickedPoint || camera.position.add(direction.scale(range));
  const floor = worldPick(point.add(new BABYLON.Vector3(0,2,0)),BABYLON.Vector3.Down(),6,true);
  if (!floor || BABYLON.Vector3.Distance(agentPosition(),floor.pickedPoint)>range+1) return null;
  return floor.pickedPoint.clone();
}
function agentTarget(entities, range, dead = false) {
  const aim=camera.getDirection(BABYLON.Axis.Z);let best=null,score=-Infinity;
  for (const entity of entities) {
    if ((entity.hp<=0)!==dead || entity.revivingUntil) continue;
    const point=agentPosition(entity).add(new BABYLON.Vector3(0,dead ? .25 : 1.1,0)), vector=point.subtract(camera.position), distance=vector.length();
    if (!distance || distance>range || !agentLOS(camera.position,point)) continue;
    const alignment=BABYLON.Vector3.Dot(aim,vector.scale(1/distance));
    if (alignment>Math.cos(.14) && alignment>score) { score=alignment;best=entity; }
  }
  return best;
}
function agentInit() {
  const legacyAbilities=document.getElementById('hud-abilities');
  if (legacyAbilities) {legacyAbilities.hidden=true;legacyAbilities.style.display='none';}
  const picker=document.getElementById('playable-agent');
  const saved=VSProfile.load().agent;
  const requested=new URLSearchParams(location.search).get('agent') || saved || VS.player.agent || 'Clove';
  picker.value=window.GAME_CONFIG['playable-agents'][requested]?requested:'Clove';
  agentState.ready=true;agentSelect(picker.value);
  picker.addEventListener('change',()=>agentSelect(picker.value));
  const practice=document.getElementById('agent-practice');
  practice.innerHTML='<div id="agent-buy"></div><button id="agent-refill">Nạp kỹ năng + ult (luyện tập)</button> <button id="agent-hurt">Mất 60 HP</button> <button id="agent-kill">Chết thử</button> <button id="agent-ally">Tạo đồng đội</button> <button id="agent-ally-kill">Hạ đồng đội thử</button>';
  agentHUD();
  document.getElementById('agent-refill').onclick=()=>agentReset(true);
  document.getElementById('agent-hurt').onclick=()=>{combatDamage(VS.player,60);uiHUDUpdate();};
  document.getElementById('agent-kill').onclick=()=>agentDie('practice');
  document.getElementById('agent-ally').onclick=agentPracticeAlly;
  document.getElementById('agent-ally-kill').onclick=()=>{
    const ally=agentState.allies[0];if (!ally) return agentNotice('Tạo đồng đội trước.');
    ally.hp=0;ally.revivingUntil=0;ally.meshes.forEach(mesh=>{mesh.scaling.y=.15;mesh.position.y=ally.position.y+.15;});
  };
  document.addEventListener('keydown',event=>{
    if (!window.__gamePlaying || event.repeat || event.target.matches?.('input,select,textarea,[contenteditable="true"]')) return;
    if(typeof matchSpectatorKey==='function'&&matchSpectatorKey(event))return;
    const slot=VS.player.hp<=0&&VS.player.agent==='Clove'&&event.code==='KeyC'?'E':Object.keys(window.GAME_CONFIG['playable-agents'].bindings).find(slot=>window.GAME_CONFIG['playable-agents'].bindings[slot]===event.code);
    if (slot) {event.preventDefault();agentEquip(slot);}
    if (event.code==='KeyV') {event.preventDefault();agentToggleThirdPerson();}
  });
  document.addEventListener('keyup',event=>{if (event.code==='KeyC') agentState.steer=false;});
  scene.onBeforeRenderObservable.add(()=>{
    if (!window.__gamePlaying) return;
    agentUpdate(window.__frameDT || 1/30);
    if (!window.__weaponsReady) agentVisualUpdate();
  });
  scene.onDisposeObservable.add(()=>{agentClearEffects();agentVisualDispose();});
}
function agentSelect(name) {
  if(typeof matchActive==='function'&&matchActive())return agentNotice('Đội hình đã khóa trong trận.');
  if (!window.GAME_CONFIG['playable-agents'][name]) return;
  agentClearEffects();VS.player.agent=name;
  if(!new URLSearchParams(location.search).has('room'))VSProfile.save({agent:name});
  agentRespawn();agentReset(false);agentVisualSelect(name);agentHUD();
}
function agentReset(practice = false) {
  if(practice&&typeof matchActive==='function'&&matchActive())return;
  const cfg=agentConfig();if (!cfg) return;
  agentCancelEquip();agentClearEffects();
  agentState.charges={C:practice?cfg.C.charges:0,Q:practice?cfg.Q.charges:0,E:practice?cfg.E.charges:(cfg.E.free||1)};
  agentState.cooldowns={};agentState.ult=practice?cfg.ultCost:Math.min(agentState.ult,cfg.ultCost);
  agentState.kills=0;agentState.knives=0;agentState.dashReady=agentState.dashExpires=0;
  agentState.lastVictim=null;agentState.revivedUntil=0;agentState.lockUntil=0;agentState.intangibleUntil=0;
  agentState.resurrectAt=0;agentState.resurrectionCastAt=agentState.resurrectionWindupEnds=agentState.reviveNoticeUntil=0;agentState.overhealRemaining=0;agentState.windUntil=0;
  agentState.overhealUntil=agentState.hasteUntil=0;VS.player.overheal=0;
  if (practice) agentNotice('Luyện tập: đã nạp kỹ năng và ult.');agentHUD();
}
function agentBuy(slot) {
  const cfg=agentConfig(),def=cfg?.[slot];
  if (!def || slot==='X' || VS.player.hp<=0 || VS.round.phase!=='buy') return false;
  if (agentState.charges[slot]>=def.charges || VS.player.credits<def.price) return false;
  if(typeof matchActive==='function'&&matchActive())return matchState.rules.buy(matchState.human,'ability:'+slot,def.price||0,()=>{agentState.charges[slot]++;agentHUD();return true;});
  VS.player.credits-=def.price;agentState.charges[slot]++;agentHUD();uiHUDUpdate();return true;
}
function agentSpend(slot) {
  if (slot==='X') {agentState.ult=0;return;}
  agentState.charges[slot]--;const def=agentConfig()[slot];
  if (def.cooldown && !agentState.cooldowns[slot]) agentState.cooldowns[slot]=agentNow()+def.cooldown;
}
function agentLock(duration) {
  agentState.lockUntil=Math.max(agentState.lockUntil,agentNow()+duration);
  if (typeof weaponClearInput==='function') weaponClearInput();
  // Equipping/casting an ability interrupts the weapon reload; it must not
  // finish invisibly while the hands are playing an ability animation.
  if (typeof weaponState!=='undefined') {weaponState.reloading=false;weaponState.reloadUntil=0;}
}
function agentEquip(slot) {
  if(typeof matchActive==='function'&&matchActive()&&(matchState.mode==='deathmatch'||matchState.rules.phase!=='live'))return agentNotice('Kỹ năng chỉ dùng trong round Unrated đang chơi.');
  const cfg=agentConfig(),now=agentNow();if (!cfg) return false;
  if(!agentState.visualReady)return agentNotice(window.__agentVisualStatus?.state==='failed'?'Asset kỹ năng tải lỗi. Chọn lại agent để thử tải lại.':'Đang chuẩn bị đầy đủ asset kỹ năng…');
  if (VS.player.agent==='Clove' && slot==='X' && VS.player.hp>0 && now<agentState.intangibleUntil && !agentState.resurrectAt) {
    agentState.intangibleUntil=now;agentState.lockUntil=now+cfg.X.reequip;agentState.revivedUntil=now+cfg.X.reequip+cfg.X.deadline;return true;
  }
  const dead=VS.player.hp<=0;
  if (now<(VS.player.suppressedUntil||0) || now<agentState.lockUntil) return agentNotice('Chưa thể dùng kỹ năng.');
  if (dead && !(VS.player.agent==='Clove' && ['E','X'].includes(slot))) return agentNotice('Bạn đã chết. Dùng nút về điểm xuất phát.');
  if (slot==='X' && VS.player.agent==='Jett' && agentState.knives>0) {agentState.equipped='X';agentLock(0);return true;}
  const primedDash=VS.player.agent==='Jett' && slot==='E' && agentState.dashExpires>now;
  if (slot==='X' ? agentState.ult<cfg.ultCost : !agentState.charges[slot] && !primedDash) return agentNotice(slot==='X'?'Chưa đủ điểm ult.':'Hết lượt kỹ năng. Mua hoặc nạp ở menu ESC.');
  if (VS.player.agent==='Clove' && slot==='C') {
    const victim=agentState.lastVictim;
    if (!victim || now-victim.at>cfg.C.activationWindow) return agentNotice('Cần hạ hoặc hỗ trợ gây sát thương lên địch gần đây.');
    agentSpend('C');agentState.overhealRemaining=cfg.C.overheal;agentState.overhealUntil=now+cfg.C.duration;agentState.hasteUntil=now+cfg.C.hasteDuration;
    agentState.lastVictim=null;agentLock(500);agentVisualAction('C_cast');agentEffectCue(VS.player,'#BB81E8',cfg.C.hasteDuration,'pickup');return true;
  }
  if (VS.player.agent==='Clove' && slot==='X') {
    if (!dead || agentState.deathCause==='fall' || now-agentState.deathAt>cfg.X.window) return agentNotice('Chỉ hồi sinh trong 3 giây sau khi chết, không dùng khi rơi khỏi map.');
    if (!agentReviveSpace({position:agentState.deathPoint,hp:0})) return agentNotice('Vị trí hồi sinh bị chặn.');
    agentCancelEquip();
    agentSpend('X');agentState.resurrectAt=now+cfg.X.revive;agentState.resurrectionCastAt=now;agentState.resurrectionWindupEnds=agentState.resurrectAt;agentState.reviveNoticeUntil=0;
    agentState.intangibleUntil=agentState.resurrectAt+cfg.X.intangible;
    agentState.revivedUntil=agentState.intangibleUntil+cfg.X.reequip+cfg.X.deadline;agentState.deathAt=-Infinity;
    agentState.equipped=null;agentLock(cfg.X.revive+cfg.X.intangible+cfg.X.reequip);agentVisualAction('X_cast');agentCastLayers('clove-revive',VS.player,cfg.X.revive+cfg.X.intangible);return true;
  }
  if (VS.player.agent==='Jett' && slot==='Q') {
    agentSpend('Q');playerController.impulse(cfg.Q.verticalSpeed);agentLock(cfg.Q.reequip);agentVisualAction('Q_cast');agentWind('updraft',650);agentState.windUntil=now+650;return true;
  }
  if (VS.player.agent==='Jett' && slot==='E') {
    if (!agentState.dashExpires) {
      agentSpend('E');agentState.kills=0;
      agentState.dashReady=now+cfg.E.windup;agentState.dashExpires=agentState.dashReady+cfg.E.window;
      agentNotice('Tailwind: nhấn E lần nữa sau 1 giây để dash.');return true;
    }
    if (now<agentState.dashReady) return agentNotice('Tailwind đang chuẩn bị.');
    const state=playerController.getState(),keys=state.keys,yaw=camera.rotation.y;
    let x=Number(keys.includes('KeyD'))-Number(keys.includes('KeyA')),z=Number(keys.includes('KeyW'))-Number(keys.includes('KeyS'));
    if (!x&&!z) z=1;
    const direction=new BABYLON.Vector3(Math.cos(yaw)*x+Math.sin(yaw)*z,0,Math.cos(yaw)*z-Math.sin(yaw)*x).normalize();
    agentState.dashReady=agentState.dashExpires=0;
    playerController.dash(direction,cfg.E.speed*agentSpeedMultiplier(agentPosition()),cfg.E.duration);agentLock(cfg.E.reequip);agentVisualAction('E_cast');agentWind('dash',cfg.E.duration+160,direction);agentState.windUntil=now+cfg.E.duration;return true;
  }
  if (VS.player.agent==='Jett' && slot==='C') {
    agentSpend('C');agentState.steer=true;
    agentProjectile('cloud',cfg.C.speed,0,cfg.C.flight);agentVisualAction('C_cast');agentLock(350);return true;
  }
  if (VS.player.agent==='Jett' && slot==='X') {
    agentSpend('X');agentState.knives=cfg.X.knives;agentState.equipped='X';agentLock(cfg.X.equip);agentVisualAction('X_equip');return true;
  }
  if (agentState.equipped===slot) {agentCancelEquip();return true;}
  agentCancelEquip();agentState.equipped=slot;agentState.rotation=0;
  const deadRuse=dead&&VS.player.agent==='Clove'&&slot==='E';
  if (VS.player.agent==='Clove' && slot==='E') {if(!dead)agentSetThirdPerson(false);agentState.smokeMarks=[];agentSmokeMap(true);}
  agentLock(deadRuse?0:VS.player.agent==='Clove'?(slot==='E'?1000:slot==='Q'?800:600):600);
  if(!deadRuse)agentVisualAction(slot+'_equip');agentHUD();return true;
}
function agentCancelEquip() {
  agentState.equipped=null;agentState.smokeMarks=[];agentState.steer=false;agentState.knifeHeld=false;agentSmokeMap(false);
  agentState.wallPreview?.root.setEnabled(false);
}
function agentClearInput() {agentState.steer=false;agentState.knifeHeld=false;}
function agentBlocksWeapon() {return (typeof matchBlocksCombat==='function'&&matchBlocksCombat()) || agentState.ready && (VS.player.hp<=0 || !!agentState.equipped || agentNow()<agentState.lockUntil);}
function agentPointer(pressed, released) {
  if (!agentState.ready) return false;
  if (window.__agentCursorMode) return true;
  if (released&1) agentState.knifeHeld=false;
  if (released&1) agentState.steer=false;
  if (VS.player.hp<=0 && !(VS.player.agent==='Clove' && agentState.equipped==='E')) return true;
  if (!agentState.equipped) return agentNow()<agentState.lockUntil;
  if (agentNow()<agentState.lockUntil) return true;
  if (pressed&1 && VS.player.agent==='Jett' && agentState.equipped==='X') agentState.knifeHeld=true;
  if (pressed&2) agentCast(true);
  else if (pressed&1) agentCast(false);
  return true;
}
function agentCast(alternate = false) {
  const slot=agentState.equipped,cfg=agentConfig(),now=agentNow();if (!slot||!cfg) return false;
  if (now<agentState.lockUntil || now<(VS.player.suppressedUntil||0)) return false;
  if (VS.player.agent==='Jett' && slot==='X') return agentKnife(alternate);
  if (!agentState.charges[slot] && slot!=='X') return false;
  if (VS.player.agent==='Clove' && slot==='E') {
    if (!alternate) {agentState.addSmokeMark?.();return true;}
    if (!agentState.smokeMarks.length) return agentNotice('Chọn ít nhất một vị trí smoke.');
    const dead=VS.player.hp<=0;
    for (const point of agentState.smokeMarks) {
      if (!agentState.charges.E) break;
      agentSpend('E');agentSmoke(point,cfg.E.radius,dead?cfg.E.deadDuration:cfg.E.duration,cfg.E.windup);
    }
    if(!dead)agentVisualAction('E_cast');agentCancelEquip();agentLock(dead?0:700);return true;
  }
  if (VS.player.agent==='Clove' && slot==='Q') {
    agentSpend('Q');agentProjectile('meddle',18,9.8,10000,VS.player,null,null,240);agentVisualAction('Q_cast');agentCancelEquip();agentLock(700);return true;
  }
  if (VS.player.agent==='Sage') {
    if (slot==='C') {
      if (alternate) {agentState.rotation+=Math.PI/2;return true;}
      const point=agentAimGround(cfg.C.range);
      if (!point || !agentPlaceWall(point,camera.rotation.y+agentState.rotation)) return agentNotice('Không đủ khoảng trống để dựng tường.');
      agentSpend('C');
    } else if (slot==='Q') {
      agentSpend('Q');agentProjectile('slow',18,9.8,6000);
    } else if (slot==='E') {
      const target=alternate?VS.player:agentTarget(agentState.allies,cfg.E.range);
      if (!target || target.hp<=0 || target.hp>=100) return agentNotice('Ngắm vào đồng đội bị thương, hoặc chuột phải để tự hồi máu.');
      agentSpend('E');agentState.heals.push({entity:target,remaining:alternate?cfg.E.selfHP:cfg.E.allyHP,rate:(alternate?cfg.E.selfHP:cfg.E.allyHP)/cfg.E.duration,damageDelay:cfg.E.damageDelay});
      agentEffectCue(target,'#70FFE3',cfg.E.duration,'heal');
    } else if (slot==='X') {
      const target=agentTarget(agentState.allies,cfg.X.range,true);
      if (!target || !agentReviveSpace(target)) return agentNotice('Cần đồng đội đã chết trong tầm 12 m, vị trí không bị chặn.');
      agentSpend('X');target.revivingUntil=now+cfg.X.channel;target.reviveCaster=VS.player;agentLock(cfg.X.channel);
      agentEffectCue(target,'#8EFFEC',cfg.X.channel,'revive');
    }
    agentVisualAction(slot==='E' && alternate?'E_self':slot+'_cast');agentCancelEquip();agentLock(700);return true;
  }
  return false;
}
function agentKnife(alternate) {
  const cfg=agentConfig().X,now=agentNow();if (now<agentState.knifeAt || !agentState.knives) return false;
  const count=alternate?agentState.knives:1;agentState.knives-=count;
  agentState.knifeAt=now+(alternate?cfg.burstInterval:cfg.interval);
  for (let i=0;i<count;i++) {
    const ray=weaponRay(alternate?cfg.burstSpread:0);ray.length=1000;
    const world=abilityWorldPick(ray),hit=scene.pickWithRay(ray,mesh=>!!mesh.metadata?.target && mesh.isEnabled());
    const distance=Math.min(world?.distance??ray.length,hit?.hit?hit.distance:ray.length);
    agentKnifeFlight(ray,ray.origin.add(ray.direction.scale(distance)),i,alternate);
    if (world?.pickedMesh.metadata?.abilitySolid && (!hit?.hit||world.distance<hit.distance)) agentDamageWall(world.pickedMesh,50);
    else if (hit?.hit && (!world||hit.distance<world.distance)) {
      const target=hit.pickedMesh.metadata.target,zone=hit.pickedMesh.metadata.zone;
      const alive=target.hp>0;
      combatDamage(target,cfg.damage[{head:0,body:1,leg:2}[zone]??1],VS.player,{zone,weapon:'Melee'});uiHitMarker(zone==='head');agentOnHit(target,50,{knife:!alternate});
      if (alive && target.hp<=0 && !target.matchBot) {uiKillFeed(VS.player.name,'Target '+(target.id+1));if (rangeState.active) rangeState.kills++;}
      if (rangeState.active) {rangeState.hits++;rangeState.damage+=cfg.damage[{head:0,body:1,leg:2}[zone]??1];}
    }
  }
  agentState.knifeVariant=(agentState.knifeVariant||0)%5+1;
  agentVisualAction(alternate?'X_alt':'X_fire'+agentState.knifeVariant,alternate?cfg.burstInterval:cfg.interval);
  if (!agentState.knives) {agentState.equipped=null;agentLock(alternate?450:167);}
  agentHUD();return true;
}
function agentOnHit(target, damage, source = {}) {
  if(target.matchBot&&typeof matchActive==='function'&&matchActive()){target.lastPlayerDamageAt=agentNow();if(target.hp<=0)matchEntityDied(target,VS.player,source);return;}
  if (!agentState.ready || target.team==='ally') return;
  target.lastPlayerDamageAt=agentNow();
  if (target.hp>0 || target.agentKillReported) return;
  target.agentKillReported=true;target.meshes.forEach(mesh=>mesh.setEnabled(false));
  target.respawnAt=agentNow()+window.GAME_CONFIG.weapons.range.respawnDelay;
  agentOnElimination(target,{...source,damagingAssist:false});
}
function agentOnElimination(target, source = {}) {
  // Match/bot controllers may call this for a damaging assist as well as a kill.
  if (!agentState.ready || target.team==='ally') return;
  if (source.damagingAssist && agentNow()-(target.lastPlayerDamageAt??-Infinity)>(VS.player.agent==='Clove'?agentConfig().C.assistWindow:8000)) return;
  agentState.lastVictim={at:agentNow(),position:agentPosition(target)};
  if (agentNow()>=agentState.lockUntil) agentState.revivedUntil=0;
  if (!source.damagingAssist) {
    agentState.ult=Math.min(agentConfig().ultCost,agentState.ult+1);
    if (VS.player.agent==='Jett') {
      agentState.kills++;
      if (agentState.kills>=agentConfig().E.kills) {agentState.charges.E=1;agentState.kills=0;}
      if (source.knife) agentState.knives=agentConfig().X.knives;
    }
  }
  agentHUD();
}
function agentBeforeDamage(entity, damage) {
  if (entity===VS.player && agentState.ready && agentNow()<agentState.intangibleUntil) return 0;
  if(entity.matchBot&&agentNow()<(entity.bot.ability?.intangibleUntil||0))return 0;
  return damage;
}
function agentAfterDamage(entity, hpBefore, source = null) {
  if (entity===VS.player && entity.hp<=0 && hpBefore>0) agentDie('combat',source);
}
function agentDie(cause = 'combat', source = null) {
  if(typeof multiplayerActive==='function'&&multiplayerActive())return;
  if (!agentState.ready || VS.player.dead) return;
  VS.player.hp=0;VS.player.dead=true;VS.player.overheal=0;
  agentState.deathAt=agentNow();agentState.deathPoint=agentPosition();agentState.deathCause=cause;
  agentState.revivedUntil=agentState.intangibleUntil=agentState.hasteUntil=0;agentState.knives=0;
  agentState.resurrectAt=agentState.resurrectionCastAt=agentState.resurrectionWindupEnds=agentState.reviveNoticeUntil=0;agentState.lockUntil=0;
  agentLock(0);
  agentCancelEquip();playerController.stop();
  if(typeof matchSpectatorStop==='function')matchSpectatorStop();
  const cloveThirdDeath=VS.player.agent==='Clove'&&!(typeof matchActive==='function'&&matchActive()&&matchState.mode==='deathmatch');
  if(cloveThirdDeath)agentSetThirdPerson(true);
  if (VS.player.agent==='Clove') agentState.charges.E=Math.min(1,agentState.charges.E);
  if (VS.player.agent!=='Clove'&&!(typeof matchActive==='function'&&matchActive())) agentState.ult=Math.min(agentConfig().ultCost,agentState.ult+1);
  if(typeof matchActive==='function'&&matchActive())matchEntityDied(VS.player,source);
  const inMatch=typeof matchActive==='function'&&matchActive();
  agentNotice(inMatch&&matchState.mode==='deathmatch'?'Đã chết. Free cam; tự hồi sinh sau 2.5 giây.':VS.player.agent==='Clove'?'Đã chết · X hồi sinh trong 3 giây · E/Q xem đồng đội · V free cam':inMatch?'Đã chết: E/Q xem đồng đội · V free cam. Chờ round tiếp theo hoặc Sage hồi sinh.':'Đã chết. Free cam · ESC → Về điểm xuất phát.');uiHUDUpdate();
}
function agentRespawn() {
  if (!agentState.ready) return;
  if (VS.player.dead && VS.player.agent==='Clove'&&!(typeof matchActive==='function'&&matchActive())) agentState.ult=Math.min(agentConfig().ultCost,agentState.ult+1);
  agentCancelEquip();agentClearEffects();VS.player.hp=100;VS.player.dead=false;VS.player.overheal=0;
  agentState.revivedUntil=agentState.intangibleUntil=agentState.lockUntil=agentState.hasteUntil=0;
  agentState.resurrectAt=0;agentState.overhealRemaining=0;agentState.windUntil=0;
  agentState.resurrectionCastAt=agentState.resurrectionWindupEnds=agentState.reviveNoticeUntil=0;
  agentState.deathAt=-Infinity;agentState.knives=0;agentState.dashReady=agentState.dashExpires=0;
  if(typeof matchSpectatorStop==='function')matchSpectatorStop();
  agentSetThirdPerson(false);
  agentHUD();
}
function agentSpeedMultiplier(point,entity=VS.player) {
  if (!agentState.ready) return 1;
  const haste=entity===VS.player?agentState.hasteUntil:entity.bot?.ability?.hasteUntil;
  let value=agentNow()<haste?agentConfig(entity).C.haste||1:1;
  if (agentState.effects.some(effect=>effect.type==='slow' && agentInField(point,effect))) value*=.5;
  return value;
}
function agentInField(point, effect) {return Math.abs(point.y-effect.position.y)<1.2 && Math.hypot(point.x-effect.position.x,point.z-effect.position.z)<effect.radius;}
function agentMaterial(name,color,alpha = 1) {
  const material=new BABYLON.StandardMaterial(name,scene);material.diffuseColor=BABYLON.Color3.FromHexString(color);
  material.emissiveColor=material.diffuseColor.scale(.15);material.specularColor=BABYLON.Color3.Black();material.alpha=alpha;return material;
}
function agentSmoke(point,radius,duration,windup=0,owner=VS.player) {
  const name=owner.member?.agent||owner.agent||VS.player.agent;
  const mesh=BABYLON.MeshBuilder.CreateSphere('ability_smoke',{diameter:radius*2,segments:name==='Clove'?24:12},scene);
  mesh.position.copyFrom(point);if(name!=='Clove')mesh.position.y+=radius*.35;
  mesh.metadata={skillAgent:name};mesh.material=name==='Clove'
    ?agentRuseSmokeMaterial()
    :agentPatternMaterial('cloudburst_smoke','#A9C9DA','#E4F4FB','smoke-noise');
  mesh.material.backFaceCulling=false;mesh.isPickable=false;mesh.setEnabled(!windup);
  const effect={type:'smoke',mesh,owner,position:mesh.position.clone(),floorPosition:point.clone(),radius,actualRadius:0,created:agentNow(),starts:agentNow()+windup,expires:agentNow()+windup+duration};
  if(name!=='Clove')mesh.material.setFloat('billow',1);mesh.scaling.setAll(.001);
  agentState.effects.push(effect);
  if (name==='Clove') agentSmokeButterflies(effect);
  agentSmokeLayers(effect,name==='Clove');
  // Keep a closed opaque shell: the source VFX mesh alone does not contain
  // Riot's shader and can leave holes or replace the colored sphere with white.
}
function agentProjectile(type,speed,gravity,lifetime,owner=VS.player,from=null,direction=null,releaseDelay=0) {
  const mesh=BABYLON.MeshBuilder.CreateSphere('ability_projectile',{diameter:.18,segments:8},scene);
  mesh.position.copyFrom(from||camera.position);mesh.metadata={skillAgent:owner.member?.agent||owner.agent||VS.player.agent};
  mesh.material=type==='meddle'?agentMeddleMaterial('meddle_essence'):
    type==='slow'?agentPatternMaterial('slow_orb','#38A492','#A5FFF2','sage-noise'):agentMaterial('projectile_mat',agentConfig(owner).color);
  mesh.isPickable=false;
  agentAttachEffectModel(mesh,type==='meddle'?'meddle':type==='slow'?'orb':null,.18);
  const projectile={type,mesh,owner,cfg:agentConfig(owner),created:agentNow(),releaseAt:agentNow()+releaseDelay,released:!releaseDelay,
    velocity:(direction||camera.getDirection(BABYLON.Axis.Z)).scale(speed),gravity,expires:agentNow()+releaseDelay+lifetime,speed};
  if(releaseDelay)mesh.setEnabled(false);
  agentState.projectiles.push(projectile);agentProjectileLayers(projectile);
}
function agentExplode(projectile) {
  const point=projectile.mesh.position.clone(),cfg=projectile.cfg||agentConfig(),owner=projectile.owner||VS.player;
  if (projectile.type==='cloud') agentSmoke(point,cfg.C.radius,cfg.C.duration,0,owner);
  if (projectile.type==='slow') {
    const floor=worldPick(point.add(new BABYLON.Vector3(0,.2,0)),BABYLON.Vector3.Down(),3,true);
    if (floor) {
      const mesh=BABYLON.MeshBuilder.CreateDisc('slow_field',{radius:cfg.Q.radius,tessellation:32},scene);
      mesh.rotation.x=Math.PI/2;mesh.position.copyFrom(floor.pickedPoint).y+=.025;mesh.isPickable=false;
      mesh.material=agentPatternMaterial('slow_mat','#328C91','#A9F5E6','sage-crystal',.82);
      const effect={type:'slow',mesh,position:floor.pickedPoint.clone(),radius:cfg.Q.radius,created:agentNow(),expires:agentNow()+cfg.Q.duration};
      agentState.effects.push(effect);agentSlowLayers(effect);
    }
  }
  if (projectile.type==='meddle') {
    agentMeddleImpact(point,cfg.Q.radius,owner);
    for (const entity of agentCombatEntities()) {
      const p=agentPosition(entity).add(new BABYLON.Vector3(0,1,0));
      if (entity.hp>0 && agentBeforeDamage(entity,1)>0 && BABYLON.Vector3.Distance(p,point)<cfg.Q.radius && agentLOS(point,p,false)) agentDecay(entity,cfg.Q.decay,cfg.Q.duration,owner);
    }
  }
  agentDisposeMesh(projectile.mesh);agentState.projectiles.splice(agentState.projectiles.indexOf(projectile),1);
}
function agentDecay(entity, amount, duration,source=VS.player) {
  if (entity.decay) entity.hp=Math.min(100,entity.hp+entity.decay.amount);
  const def=agentConfig(source).Q;
  entity.decay={amount:0,maximum:amount,started:agentNow(),expires:agentNow()+duration,source,rate:def.decayRate,restoreRate:def.restoreRate};
}
function agentWallPositions(point,yaw,owner=VS.player) {
  const cfg=agentConfig(owner).C,positions=[];
  for (let i=0;i<cfg.segments;i++) {
    const offset=(i-(cfg.segments-1)/2)*cfg.width;
    const p=point.add(new BABYLON.Vector3(Math.cos(yaw)*offset,0,-Math.sin(yaw)*offset));
    const floor=worldPick(p.add(new BABYLON.Vector3(0,.5,0)),BABYLON.Vector3.Down(),1,true);
    if (!floor || Math.abs(floor.pickedPoint.y-point.y)>.45 || worldPick(p.add(new BABYLON.Vector3(0,.05,0)),BABYLON.Vector3.Up(),cfg.height)) return null;
    // Reject map obstructions through the wall footprint before spending a charge.
    for (const side of [-.65,0,.65]) {
      const origin=p.add(new BABYLON.Vector3(-Math.cos(yaw)*cfg.width*.49+Math.sin(yaw)*side,1.1,Math.sin(yaw)*cfg.width*.49+Math.cos(yaw)*side));
      if (worldPick(origin,new BABYLON.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),cfg.width*.98)) return null;
    }
    p.y=floor.pickedPoint.y;positions.push(p);
  }
  return positions;
}
function agentPlaceWall(point,yaw,owner=VS.player) {
  const cfg=agentConfig(owner).C,positions=agentWallPositions(point,yaw,owner);if (!positions) return false;
  for (const p of positions) {
    const mesh=BABYLON.MeshBuilder.CreateBox('sage_barrier',{width:cfg.width,height:cfg.height,depth:cfg.depth},scene);
    mesh.position.copyFrom(p).y+=cfg.height/2;mesh.rotation.y=yaw;
    mesh.material=agentBarrierMaterial(cfg.height,positions.indexOf(p));mesh.metadata={abilitySolid:true,worldCollision:true,surface:'solid',skillAgent:'Sage'};
    mesh.scaling.y=.05;mesh.position.y=p.y+cfg.height*.05/2;mesh.computeWorldMatrix(true);
    const effect={type:'wall',mesh,owner,cfg,position:p,created:agentNow(),expires:agentNow()+cfg.duration,hp:cfg.hp,damaged:false,fortified:false};
    // The collision shell stays stable; the correct intact source mesh replaces
    // its visual only after loading. Wall_Chunk is reserved for broken debris.
    mesh.material.setMatrix('barrierInverse',BABYLON.Matrix.Invert(mesh.getWorldMatrix()));
    agentAttachEffectModel(mesh,'wall',cfg.width,{fit:[cfg.width,cfg.height,cfg.depth],material:mesh.material});
    agentState.effects.push(effect);agentWallLayers(effect);
  }
  agentRebuildSolids();
  return true;
}
function agentDamageWall(mesh, damage) {
  const effect=agentState.effects.find(effect=>effect.mesh===mesh);if (!effect) return;
  effect.hp-=damage;effect.damaged=true;if (effect.hp<=0) agentRemoveEffect(effect);
}
function agentReviveSpace(target) {
  const point=agentPosition(target);return !worldPick(point.add(new BABYLON.Vector3(0,.05,0)),BABYLON.Vector3.Up(),1.8);
}
function agentPracticeAlly() {
  if(typeof matchActive==='function'&&matchActive())return;
  agentState.allies.splice(0).forEach(ally=>ally.meshes.forEach(mesh=>mesh.dispose(false,true)));
  const yaw=camera.rotation.y,point=agentPosition().add(new BABYLON.Vector3(Math.sin(yaw)*4,0,Math.cos(yaw)*4));
  const floor=worldPick(point.add(new BABYLON.Vector3(0,2,0)),BABYLON.Vector3.Down(),5,true);
  if (!floor) return agentNotice('Không có sàn để đặt đồng đội.');
  const ally={hp:40,armor:0,team:'ally',position:floor.pickedPoint.clone(),meshes:[]};
  const mesh=BABYLON.MeshBuilder.CreateCapsule('practice_ally',{height:1.8,radius:.3,tessellation:8},scene);
  mesh.position.copyFrom(ally.position).y+=.9;mesh.material=agentMaterial('ally_mat','#63DDAA');mesh.isPickable=false;
  ally.meshes.push(mesh);agentState.allies.push(ally);agentNotice('Đồng đội màu xanh: 40 HP. Sage E + trái để heal, X khi đã chết.');
}
function agentRemoveEffect(effect) {
  const index=agentState.effects.indexOf(effect);if (index>=0) agentState.effects.splice(index,1);
  agentDisposeMesh(effect.mesh);
  if (effect.type==='wall') agentRebuildSolids();
}
function agentDisposeMesh(mesh) {
  const primary=mesh.material,materials=new Set([primary,...mesh.getChildMeshes().map(m=>m.material)].filter(Boolean));
  mesh.dispose(false,false);materials.forEach(m=>{if(m===primary||m.metadata?.skillLayer||m.metadata?.ownedSkill)m.dispose(false,false);});
}
function agentClearEffects() {
  agentState.effects.splice(0).forEach(effect=>agentDisposeMesh(effect.mesh));
  agentState.projectiles.splice(0).forEach(p=>agentDisposeMesh(p.mesh));agentState.heals=[];
  agentState.solidWorld=null;
  if (agentState.wallPreview) {agentState.wallPreview.dispose();agentState.wallPreview=null;}
  if (typeof rangeTargets==='function') for (const entity of agentCombatEntities()) {
    if (entity.decay && entity.hp>0) entity.hp=Math.min(100,entity.hp+entity.decay.amount);entity.decay=null;
  }
}
function agentUpdate(dt) {
  if(typeof multiplayerActive==='function'&&multiplayerActive()){netVisualTick();return;}
  const now=agentNow(),cfg=agentConfig();if (!cfg) return;
  if (VS.player.agent==='Jett' && agentState.equipped==='X' && agentState.knifeHeld && now>=agentState.lockUntil) agentKnife(false);
  for (const slot of ['C','Q','E']) {
    const due=agentState.cooldowns[slot];if (!due || now<due) continue;
    const max=VS.player.agent==='Clove'&&VS.player.hp<=0&&slot==='E'?1:cfg[slot].charges;
    agentState.charges[slot]=Math.min(max,agentState.charges[slot]+1);
    agentState.cooldowns[slot]=agentState.charges[slot]<max?due+cfg[slot].cooldown:0;
  }
  if (agentState.dashExpires && now>=agentState.dashExpires) agentState.dashReady=agentState.dashExpires=0;
  if (agentState.resurrectAt && now>=agentState.resurrectAt) {
    agentState.resurrectAt=0;VS.player.hp=100;VS.player.armor=0;VS.player.dead=false;playerController.teleport(agentState.deathPoint);
    if(VS.player.agent==='Clove'){
      if(typeof matchSpectatorStop==='function')matchSpectatorStop();agentSetThirdPerson(false);
      agentState.reviveNoticeUntil=now+3500;agentState.message='HỒI SINH · Hạ gục hoặc hỗ trợ trước khi hết hiệu ứng.';agentState.messageUntil=agentState.reviveNoticeUntil;
    }
    for (const name of [weaponState.loadout.primary,weaponState.loadout.secondary]) {
      const ammo=weaponState.ammo[name],def=weaponDef(name);if (!ammo||!def) continue;
      const refill=Math.min(def.mag-ammo.clip,ammo.reserve);ammo.clip+=refill;ammo.reserve-=refill;
    }
  }
  if (VS.round.phase==='end') agentState.revivedUntil=0;
  if (agentState.revivedUntil && now>=agentState.revivedUntil) agentDie('ult-expired');
  if (agentState.overhealUntil) {
    if (now<agentState.overhealUntil && agentState.overhealRemaining>0 && VS.player.hp>0) {
      const add=Math.min(agentState.overhealRemaining,cfg.C.healRate*dt,Math.max(0,150-VS.player.hp-VS.player.armor-(VS.player.overheal||0)));
      VS.player.overheal=(VS.player.overheal||0)+add;agentState.overhealRemaining-=add;
    } else if (now>=agentState.overhealUntil) {
      VS.player.overheal=Math.max(0,(VS.player.overheal||0)-cfg.C.decayRate*dt);
      if (!VS.player.overheal) agentState.overhealUntil=0;
    }
    VS.player.overheal=Math.min(VS.player.overheal||0,Math.max(0,150-VS.player.hp-VS.player.armor));
  }
  for (const p of [...agentState.projectiles]) {
    if(now<(p.releaseAt||0))continue;
    let elapsed=dt;
    if(!p.released){p.released=true;elapsed=Math.min(dt,(now-p.releaseAt)/1000);p.mesh.setEnabled(true);
      const hand=agentVisual.fpNodes.get('R_Hand')||agentVisual.fpNodes.get('R_WeaponMaster');hand?.computeWorldMatrix(true);
      const origin=hand?.getAbsolutePosition();
      p.mesh.position.copyFrom(origin&&BABYLON.Vector3.Distance(origin,camera.position)<1.5?origin:camera.position.add(camera.getDirection(BABYLON.Axis.Z).scale(.35)));}
    const substeps=Math.max(1,Math.ceil(elapsed*120)),step=elapsed/substeps;
    for (let i=0;i<substeps;i++) {
      if (p.stuck) break;
      if (p.type==='cloud' && (!p.owner||p.owner===VS.player) && agentState.steer) p.velocity.copyFrom(camera.getDirection(BABYLON.Axis.Z)).scaleInPlace(p.speed);
      p.velocity.y-=p.gravity*step;const displacement=p.velocity.scale(step),distance=displacement.length();
      const hit=distance?abilityWorldPick(new BABYLON.Ray(p.mesh.position.clone(),displacement.scale(1/distance),distance+.07)):null;
      if (hit) {
        p.mesh.position.copyFrom(hit.pickedPoint).addInPlace(hit.getNormal(true).scale(.08));
        if (['meddle','slow'].includes(p.type) && hit.getNormal(true).y<.7) {
          const normal=hit.getNormal(true),dot=BABYLON.Vector3.Dot(p.velocity,normal);p.velocity.subtractInPlace(normal.scale(2*dot)).scaleInPlace(.5);
        } else if (p.type==='meddle') {p.stuck=true;p.velocity.setAll(0);p.expires=now+(p.cfg||cfg).Q.windup;break;}
        else {agentExplode(p);break;}
      } else p.mesh.position.addInPlace(displacement);
    }
    if (agentState.projectiles.includes(p) && now>=p.expires) {
      if (p.type==='meddle' && !p.stuck) {agentDisposeMesh(p.mesh);agentState.projectiles.splice(agentState.projectiles.indexOf(p),1);}
      else agentExplode(p);
    }
  }
  for (const effect of [...agentState.effects]) {
    if (now>=effect.expires) {agentRemoveEffect(effect);continue;}
    if (effect.type==='smoke') {
      const clove=!!effect.mesh.material?.metadata?.ruseSmoke;
      const t=Math.max(0,Math.min(1,(now-effect.starts)/(clove?650:320))),out=Math.max(0,Math.min(1,(effect.expires-now)/380));
      const scale=(clove ? .3+.7*cloveEase(t*3) : 1-Math.pow(1-t,3))*out;effect.actualRadius=effect.radius*scale;
      effect.mesh.setEnabled(now>=effect.starts);effect.mesh.scaling.setAll(Math.max(.001,scale));
      if(clove){
        for(const mat of [effect.mesh.material,...(effect.ruseShellMaterials||[])]){
          mat.setFloat('formation',cloveEase(t));mat.setFloat('opacity',cloveEase(t*6)*out);mat.setFloat('clock',now/1000);
        }
      }
    }
    if (effect.type==='wall') {
      const age=now-effect.created,def=effect.cfg||cfg.C,previousTop=effect.mesh.position.y+def.height*effect.mesh.scaling.y/2;
      const scale=Math.max(.05,Math.min(1,age/def.rise));effect.mesh.scaling.y=scale;effect.mesh.position.y=effect.position.y+def.height*scale/2;
      effect.mesh.computeWorldMatrix(true);
      if (age<def.rise+dt*1000) agentState.solidsDirty=true;
      const player=agentPosition(),inverse=BABYLON.Matrix.Invert(effect.mesh.getWorldMatrix()),local=BABYLON.Vector3.TransformCoordinates(player,inverse);
      if (VS.player.hp>0 && age<def.rise && Math.abs(local.x)<def.width/2 && Math.abs(local.z)<def.depth/2 && Math.abs(player.y-previousTop)<.3) {
        const top=effect.position.y+def.height*scale;
        if (!worldPick(player.add(new BABYLON.Vector3(0,1.8,0)),BABYLON.Vector3.Up(),Math.max(0,top-player.y))) playerController.teleport(new BABYLON.Vector3(player.x,top,player.z));
      }
      if (!effect.fortified && age>=def.fortify) {effect.fortified=true;if (!effect.damaged) effect.hp=def.fortifiedHP;}
      if (age>=def.decayStart) effect.hp=Math.min(effect.hp,def.fortifiedHP*(def.duration-age)/(def.duration-def.decayStart));
    }
  }
  if (agentState.solidsDirty) agentRebuildSolids();
  for (const heal of [...agentState.heals]) {
    if (heal.entity.hp<=0 || heal.entity.hp>=100 || heal.remaining<=0) {agentState.heals.splice(agentState.heals.indexOf(heal),1);continue;}
    if (now-(heal.entity.lastDamageAt??-Infinity)<heal.damageDelay) continue;
    const amount=Math.min(heal.remaining,heal.rate*dt*1000,100-heal.entity.hp);heal.remaining-=amount;heal.entity.hp+=amount;
  }
  for (const entity of agentCombatEntities()) {
    if (entity.hp>0 && entity.decay) {
      const decay=entity.decay,age=now-decay.started;
      if (age<decay.maximum/decay.rate*1000) {const remove=Math.min(decay.rate*dt,decay.maximum-decay.amount,Math.max(0,entity.hp-1));entity.hp-=remove;decay.amount+=remove;if (remove>0 && typeof matchRecordDamage==='function')matchRecordDamage(entity,decay.source,remove);if (remove>0 && decay.source===VS.player && entity!==VS.player && entity.team!=='ally') entity.lastPlayerDamageAt=now;}
      if (now>=decay.expires-decay.maximum/decay.restoreRate*1000) {const restore=Math.min(decay.amount,decay.restoreRate*dt);entity.hp=Math.min(100,entity.hp+restore);decay.amount-=restore;}
      if (now>=decay.expires) {entity.hp=Math.min(100,entity.hp+decay.amount);entity.decay=null;}
    }
    if (entity.hp>0 && entity.agentKillReported) entity.agentKillReported=false;
    if (entity.revivingUntil && now>=entity.revivingUntil) {
      if(typeof matchActive==='function'&&matchActive()) {
        const caster=entity.reviveCaster;entity.revivingUntil=0;entity.reviveCaster=null;
        if(caster?.hp<=0)continue;
        matchReviveEntity(entity);continue;
      }
      entity.revivingUntil=0;if (!agentReviveSpace(entity)) continue;
      entity.hp=100;entity.armor=0;if(!entity.matchBot)entity.meshes.forEach(mesh=>{mesh.scaling.y=1;mesh.position.y=entity.position.y+.9;});
    }
  }
  // The two-sided opaque smoke shell blocks its boundary from both sides;
  // its interior stays clear and first-person hands remain visible.
  agentEffectsTick();agentWallPreviewUpdate();agentHUD();uiHUDUpdate();
}
function agentSmokeMap(open) {
  const wasOpen=cloveRuseMap.open;
  const map=document.getElementById('agent-smoke-map');if (map) map.hidden=!open;
  if(open||wasOpen)playerController.cursorMode?.(open);
  cloveRuseMap.open=!!open;
  if(open){cloveRuseMap.openedAt=agentNow();cloveRuseMap.yaw=(scene.activeCamera||camera).rotation.y;cloveRuseMap.afterDeath=VS.player.hp<=0;cloveRuseMap.closing=false;}
  else if(wasOpen){cloveRuseMap.closedAt=agentNow();cloveRuseMap.closeOpacity=cloveRuseMap.opacity;cloveRuseMap.closing=cloveRuseMap.closeOpacity>0;}
  if (open) {agentState.smokeMarks=[];agentState.smokeHover=null;agentState.mapBackdrop=null;agentDrawSmokeMap();}
}
function agentMapGround(u,v) {
  if (VS.player.agent!=='Clove' || agentState.equipped!=='E') return null;
  if (u*u+v*v>1) return null;
  const cfg=agentConfig().E,dead=VS.player.hp<=0,range=dead?cfg.deadRange:cfg.range,center=dead?agentState.deathPoint:agentPosition();
  const point=agentRuseMapWorld(u,v,center,range);
  return worldPick(point,BABYLON.Vector3.Down(),15,true)?.pickedPoint.clone() || null;
}
function agentDrawSmokeMap() {
  if (VS.player.agent!=='Clove' || agentState.equipped!=='E') return;
  const canvas=document.getElementById('agent-map-canvas');if (!canvas) return;
  const ctx=canvas.getContext('2d');if (!ctx) return;
  if(!cloveRuseMap.view)agentRuseViewCreate(canvas);
  const cfg=agentConfig().E,range=VS.player.hp<=0?cfg.deadRange:cfg.range,center=VS.player.hp<=0?agentState.deathPoint:agentPosition(),scale=canvas.width/(range*2);
  const key=[range,center.x.toFixed(1),center.y.toFixed(1),center.z.toFixed(1),cloveRuseMap.yaw.toFixed(3)].join(':');
  if (agentState.mapBackdrop?.key===key) ctx.putImageData(agentState.mapBackdrop.image,0,0);
  else {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const nav=cloveRuseMap.nav||(typeof matchState!=='undefined'&&matchState.nav?{nodes:matchState.nav.nodes,step:.6}:null),size=nav?128:64;
  let cells;
  if(nav)cells=agentRuseRaster(center,range,nav.nodes,nav.step||.6,size);
  else{cells=new Uint8Array(size*size);
    for(let row=0;row<size;row++)for(let col=0;col<size;col++){
      const p=agentRuseMapWorld((col+.5)/size*2-1,(row+.5)/size*2-1,center,range);
      if(worldPick(p,BABYLON.Vector3.Down(),15,true))cells[row*size+col]=1;
    }
  }
  const gradient=ctx.createLinearGradient(0,0,canvas.width*.3,canvas.height);
  gradient.addColorStop(0,'#F0B5E6');gradient.addColorStop(.55,'#C0A0EF');gradient.addColorStop(1,'#A5BAF8');
  ctx.fillStyle=gradient;ctx.globalAlpha=.88;
  const cell=canvas.width/size;
  for(let row=0;row<size;row++)for(let col=0;col<size;col++)if(cells[row*size+col]){
    const start=col;while(col+1<size&&cells[row*size+col+1])col++;
    ctx.fillRect(start*cell,row*cell,(col-start+1)*cell,cell);
  }
  ctx.globalAlpha=.65;ctx.strokeStyle='#E2D8FF';ctx.lineWidth=.75;ctx.beginPath();
  for(let row=0;row<size;row++)for(let col=0;col<size;col++)if(cells[row*size+col]){
    const x=col*cell,y=row*cell;
    if(row===0||!cells[(row-1)*size+col]){ctx.moveTo(x,y);ctx.lineTo(x+cell,y);}
    if(row===size-1||!cells[(row+1)*size+col]){ctx.moveTo(x,y+cell);ctx.lineTo(x+cell,y+cell);}
    if(col===0||!cells[row*size+col-1]){ctx.moveTo(x,y);ctx.lineTo(x,y+cell);}
    if(col===size-1||!cells[row*size+col+1]){ctx.moveTo(x+cell,y);ctx.lineTo(x+cell,y+cell);}
  }ctx.stroke();ctx.globalAlpha=1;
  agentState.mapBackdrop={key,image:ctx.getImageData(0,0,canvas.width,canvas.height)};
  }
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(canvas.width/2,canvas.height/2,4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(canvas.width/2,canvas.height/2-5);ctx.lineTo(canvas.width/2,canvas.height/2-16);ctx.stroke();
  ctx.lineWidth=2;
  for (const point of agentState.smokeMarks) {const {u,v}=agentRuseMapUV(point,center,range);ctx.beginPath();ctx.arc((u+1)*canvas.width/2,(v+1)*canvas.height/2,cfg.radius*scale,0,Math.PI*2);ctx.stroke();}
  if (agentState.smokeHover) {
    const {u,v}=agentRuseMapUV(agentState.smokeHover,center,range);ctx.fillStyle='#DDC6FF66';ctx.beginPath();ctx.arc((u+1)*canvas.width/2,(v+1)*canvas.height/2,cfg.radius*scale,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  cloveRuseMap.view.texture.update(true);
  const status=document.getElementById('agent-map-status');if (status) status.textContent=agentState.smokeMarks.length+' vị trí · '+agentState.charges.E+' smoke · Tầm '+range+' m'+(VS.player.hp<=0?' · Sau khi chết':'');
}
function agentHUD() {
  if (!agentState.ready) return;
  let hud=document.getElementById('agent-hud');
  if (!hud) {
    hud=document.createElement('div');hud.id='agent-hud';document.getElementById('game-container').appendChild(hud);
    const cue=document.createElement('div');cue.id='agent-screen-effect';document.getElementById('game-container').appendChild(cue);
    const death=document.createElement('section');death.id='clove-death-prompt';death.hidden=true;
    death.innerHTML='<div class="clove-prompt-ring"><img src="/assets/playable/vfx/smonk-X.png?v=21" alt=""><span id="clove-prompt-key">X</span></div><div class="clove-prompt-title" id="clove-prompt-title"></div><div class="clove-prompt-detail" id="clove-prompt-detail"></div>';
    document.getElementById('game-container').appendChild(death);
    const map=document.createElement('div');map.id='agent-smoke-map';map.hidden=true;
    map.innerHTML='<canvas width="512" height="512" id="agent-map-canvas"></canvas><div class="ruse-controls"><p>Chuột trái: chọn vị trí · Chuột phải: xác nhận · E: hủy</p><div id="agent-map-status"></div></div>';
    document.getElementById('game-container').appendChild(map);
    const canvas=map.querySelector('canvas');
    const addMark=(u,v)=>{
      const cfg=agentConfig().E,dead=VS.player.hp<=0,range=dead?cfg.deadRange:cfg.range,center=dead?agentState.deathPoint:agentPosition();
      if (u*u+v*v>1) return;
      const point=agentMapGround(u,v);if (!point) return agentNotice('Vị trí này không có sàn.');
      const previous=agentState.smokeMarks.findIndex(mark=>BABYLON.Vector3.Distance(mark,point)<cfg.radius*.5);
      if (previous>=0) {agentState.smokeMarks.splice(previous,1);agentDrawSmokeMap();return;}
      const max=Math.min(dead?1:2,agentState.charges.E);
      if (agentState.smokeMarks.length>=max) agentState.smokeMarks.shift();
      agentState.smokeMarks.push(point);if(!dead)agentVisualAction('E_set');agentDrawSmokeMap();
    };
    canvas.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();if (!window.__gamePlaying || agentNow()<agentState.lockUntil) return;if (event.button===2) {agentCast(true);return;}if (event.button!==0) return;const uv=agentRusePick(event);if(uv)addMark(uv.u,uv.v);});
    canvas.addEventListener('pointermove',event=>{const uv=agentRusePick(event);agentState.smokeHover=uv?agentMapGround(uv.u,uv.v):null;agentDrawSmokeMap();});
    canvas.addEventListener('pointerleave',()=>{agentState.smokeHover=null;agentDrawSmokeMap();});
    map.addEventListener('pointerdown',event=>{if (event.button===2 && window.__gamePlaying) {event.preventDefault();event.stopPropagation();agentCast(true);}});
    map.addEventListener('contextmenu',event=>event.preventDefault());
    // Pointer lock has no UI cursor: screen centre + aim projects onto the map.
    agentState.addSmokeMark=()=>{const rect=document.getElementById('renderCanvas').getBoundingClientRect(),uv=agentRusePick({clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});if(uv)addMark(uv.u,uv.v);};
  }
  const cfg=agentConfig(),now=agentNow();
  const buy=document.getElementById('agent-buy');
  if (buy) {
    const buyHTML='Tiền '+VS.player.credits+' · '+['C','Q','E'].map(slot=>'<button data-buy="'+slot+'">Mua '+(typeof uiAbilityLabel==='function'?uiAbilityLabel(slot):cfg[slot].name)+' '+(cfg[slot].price||0)+'</button>').join('');
    if (buy.innerHTML!==buyHTML) {buy.innerHTML=buyHTML;buy.querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>agentBuy(button.dataset.buy));}
  }
  const slots=[];
  for (const [slot,key] of [['C','C'],['Q','Q'],['E','E'],['X','X']]) {
    if(VS.player.hp<=0&&slot!=='X'&&!(VS.player.agent==='Clove'&&slot==='E'))continue;
    const displayKey=VS.player.hp<=0&&VS.player.agent==='Clove'&&slot==='E'?'C':key;
    const charge=slot==='X'?agentState.ult+'/'+cfg.ultCost:agentState.charges[slot];
    const cooldown=agentState.cooldowns[slot]>now?Math.ceil((agentState.cooldowns[slot]-now)/1000)+'s':'';
    const hasCharge=slot==='X'?(agentState.ult>=cfg.ultCost || (VS.player.agent==='Jett' && agentState.knives>0)):agentState.charges[slot]>0;
    const max=slot==='X'?cfg.ultCost:cfg[slot].charges,current=slot==='X'?agentState.ult:agentState.charges[slot];
    const pips=Array.from({length:max},(_,i)=>'<img alt="" src="/assets/ui/charge-'+(i<current?'full':'empty')+'.png?v=31">').join('');
    const label=typeof uiAbilityLabel==='function'?uiAbilityLabel(slot):cfg[slot].name;
    slots.push('<div class="agent-slot '+(hasCharge?'ready':'empty')+(agentState.equipped===slot?' active':'')+'" title="'+label+'"><span class="agent-charge">'+charge+'</span><img alt="'+label+'" src="/assets/playable/vfx/'+cfg.code+'-'+slot+'.png?v=21"><div class="agent-charge-pips">'+pips+'</div><span class="agent-key">'+displayKey+'</span><div class="agent-slot-name">'+label+'</div><div class="agent-slot-cooldown">'+cooldown+'</div></div>');
  }
  let detail=agentState.messageUntil>now?agentState.message:'';
  if (agentState.equipped) detail+=' · '+(typeof uiAbilityLabel==='function'?uiAbilityLabel(agentState.equipped):cfg[agentState.equipped].name)+' · Trái dùng / Phải chế độ phụ / 1 về súng';
  if (agentState.dashExpires>now) detail+=' · Thuận Phong '+Math.max(0,(agentState.dashExpires-now)/1000).toFixed(1)+'s';
  if (agentState.knives) detail+=' · Dao '+agentState.knives;
  if (agentState.resurrectAt>now) detail+=' · Đang hồi sinh';
  else if (agentState.intangibleUntil>now) detail+=' · Bất tử '+((agentState.intangibleUntil-now)/1000).toFixed(1)+'s · X kết thúc sớm';
  else if (agentState.revivedUntil) detail+=' · Hạ/hỗ trợ địch trước '+Math.max(0,(agentState.revivedUntil-now)/1000).toFixed(1)+'s';
  if (agentState.hasteUntil>now) detail+=' · Tăng tốc '+Math.ceil((agentState.hasteUntil-now)/1000)+'s';
  if (VS.player.overheal) detail+=' · +'+Math.ceil(VS.player.overheal)+' HP tạm';
  if (agentState.heals.some(heal=>heal.entity===VS.player)) detail+=' · Đang hồi máu';
  const html='<div class="agent-hud-name">'+VS.player.agent+(VS.player.hp<=0?' · ĐÃ CHẾT':'')+'</div><div class="agent-slots">'+slots.join('')+'</div><div class="agent-hud-detail">'+detail+'</div>';
  if (hud.innerHTML!==html) hud.innerHTML=html;
  const prompt=document.getElementById('clove-death-prompt');
  if(prompt){
    const clove=VS.player.agent==='Clove',deathWindow=clove&&VS.player.hp<=0&&agentState.deathCause!=='fall'&&now-agentState.deathAt<cfg.X.window;
    const canRevive=deathWindow&&agentState.ult>=cfg.ultCost&&!(typeof matchActive==='function'&&matchActive()&&matchState.mode==='deathmatch');
    const casting=clove&&agentState.resurrectAt>now,revived=clove&&VS.player.hp>0&&agentState.reviveNoticeUntil>now;
    prompt.hidden=!(canRevive||casting||revived);prompt.classList.toggle('success',revived);prompt.classList.toggle('casting',casting);
    const title=document.getElementById('clove-prompt-title'),description=document.getElementById('clove-prompt-detail'),key=document.getElementById('clove-prompt-key');
    const angle=canRevive?Math.max(0,(cfg.X.window-(now-agentState.deathAt))/cfg.X.window)*360:casting?Math.max(0,(agentState.resurrectAt-now)/(agentState.resurrectAt-agentState.resurrectionCastAt))*360:360;
    prompt.style.setProperty('--clove-window-angle',angle+'deg');
    if(title)title.textContent=canRevive?'NHẤN X ĐỂ HỒI SINH':casting?'ĐANG HỒI SINH':revived?'HỒI SINH THÀNH CÔNG':'';
    if(description)description.textContent=canRevive?'Nhấn X để hồi sinh · '+Math.max(0,(cfg.X.window-(now-agentState.deathAt))/1000).toFixed(1)+' giây':casting?'Đang trở lại chiến trường…':revived?'Hạ gục hoặc hỗ trợ trước khi hết hiệu ứng · '+Math.max(0,(agentState.revivedUntil-now)/1000).toFixed(1)+' giây':'';
    if(key)key.textContent=canRevive?'X':casting?'…':'✓';
  }
  const cue=document.getElementById('agent-screen-effect');
  const healing=agentState.heals.some(heal=>heal.entity===VS.player),ghost=agentState.intangibleUntil>now;
  if (cue) {cue.style.opacity=ghost?'.7':healing?'.35':agentState.hasteUntil>now?'.3':agentState.windUntil>now?'.35':'0';cue.style.setProperty('--agent-cue-color',ghost?'#B98AEB':healing?'#6DF1C9':agentState.windUntil>now?'#C7EBF6':'#D49CF5');}
}
