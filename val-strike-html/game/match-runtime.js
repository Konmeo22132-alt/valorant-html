const matchState={active:false,mode:'practice',rules:null,bots:[],nav:null,sites:[],markers:[],tracers:[],orbs:[],drops:[],hold:false,loading:false,version:0};
// The observer camera never changes the dead player's feet or resurrection point.
const deathSpectator={active:false,camera:null,target:null};
function matchSpectatorActive(){return deathSpectator.active;}
function matchSpectatorStop() {
  deathSpectator.target=null;
  if(!deathSpectator.active)return;
  deathSpectator.active=false;
  scene.activeCamera=agentVisual.third&&agentVisual.thirdCamera?agentVisual.thirdCamera:camera;
}
function matchSpectatorStart() {
  const s=deathSpectator;if(s.active)return;
  if(!s.camera){s.camera=new BABYLON.UniversalCamera('death_observer',camera.position.clone(),scene);s.camera.inputs.clear();s.camera.minZ=.05;}
  const source=scene.activeCamera||camera;s.camera.position.copyFrom(source.position);s.camera.rotation.copyFrom(source.rotation);
  s.target=null;s.active=true;
}
function matchSpectatorUpdate(dt,keys) {
  const s=deathSpectator;
  const deadRuse=VS.player.hp<=0&&VS.player.agent==='Clove'&&agentState.equipped==='E';
  if(VS.player.hp>0||agentState.resurrectAt>0||(agentState.equipped&&!deadRuse)){matchSpectatorStop();return;}
  const cloveDeathView=VS.player.agent==='Clove'&&agentVisual.third&&!(matchActive()&&matchState.mode==='deathmatch');
  if(cloveDeathView&&!s.active){
    if(agentNow()-agentState.deathAt<agentConfig().X.window)return;
    matchSpectatorStart();
  }
  if(!s.camera){s.camera=new BABYLON.UniversalCamera('death_observer',camera.position.clone(),scene);s.camera.inputs.clear();s.camera.minZ=.05;}
  if(!s.active){s.camera.position.copyFrom(camera.position);s.camera.rotation.copyFrom(camera.rotation);s.active=true;}
  scene.activeCamera=s.camera;s.camera.fov=window.GAME_CONFIG.movement.baseFov;
  // Keep the current observer pose while choosing a smoke; map range stays
  // anchored to deathPoint without moving the observer or the player's feet.
  if(deadRuse&&window.__agentCursorMode)return;
  if(s.target&&(!matchActive()||s.target.hp<=0))matchSpectatorCycle(1);
  if(s.target) {
    const eye=matchMemberPoint(s.target).add(new BABYLON.Vector3(0,s.target.entity.bot.actor.crouching?1.15:1.6,0));
    const forward=s.target.entity.forward.clone().normalize(),offset=forward.scale(-2.8);offset.y=.5;
    const length=offset.length(),hit=abilityWorldPick(new BABYLON.Ray(eye,offset.normalizeToNew(),length));
    s.camera.position.copyFrom(eye).addInPlace(offset.normalize().scale(hit?Math.max(.08,hit.distance-.15):length));
    s.camera.setTarget(eye.add(forward.scale(5)));return;
  }
  if(window.__agentCursorMode)return;
  const direction=s.camera.getDirection(BABYLON.Axis.Z).scale((keys.KeyW?1:0)-(keys.KeyS?1:0));
  direction.addInPlace(s.camera.getDirection(BABYLON.Axis.X).scale((keys.KeyD?1:0)-(keys.KeyA?1:0)));
  direction.y+=(keys.Space?1:0)-(keys.ControlLeft||keys.ControlRight?1:0);
  if(direction.lengthSquared()>0)s.camera.position.addInPlace(direction.normalize().scale(window.GAME_CONFIG.movement.speedByWeaponClass.melee*dt*(keys.ShiftLeft||keys.ShiftRight?2:1)));
}
function matchSpectatorCycle(step) {
  const s=deathSpectator,allies=matchActive()?matchState.rules.members.filter(p=>p!==matchState.human&&(matchState.human.team==='observer'||matchState.mode==='deathmatch'||p.team===matchState.human.team)&&p.hp>0):[];
  const index=allies.indexOf(s.target);
  s.target=allies.length?allies[(index<0?(step>0?0:allies.length-1):(index+step+allies.length)%allies.length)]:null;
}
function matchSpectatorKey(event) {
  if(VS.player.hp>0||agentState.resurrectAt>0||!['KeyE','KeyQ','KeyV'].includes(event.code))return false;
  event.preventDefault();
  if(!event.repeat){agentCancelEquip();matchSpectatorStart();if(event.code==='KeyV')deathSpectator.target=null;else matchSpectatorCycle(event.code==='KeyE'?1:-1);}
  return true;
}
function matchActive(){return matchState.active;}
function matchMemberPoint(member){return member.entity===VS.player?agentPosition():member.entity.position.clone();}
function matchPolygonContains(point,polygon) {
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];if((a[1]>point.z)!==(b[1]>point.z)&&point.x<(b[0]-a[0])*(point.z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
function matchAtSite(point,site){return Math.abs(point.y-site.position.y)<(site.floorTolerance||1)&&(site.polygons?.length?site.polygons.some(poly=>matchPolygonContains(point,poly))&&!site.exclusions?.some(poly=>matchPolygonContains(point,poly)):BABYLON.Vector3.DistanceSquared(point,site.position)<window.GAME_CONFIG.match.siteRadius**2);}
function matchMovementBlocked(){return matchActive()&&(matchState.rules.phase==='select'||matchState.rules.phase==='complete'||matchState.rules.spike?.channel?.actor===matchState.human||!!matchState.orbChannel);}
function matchBlocksCombat(){return matchActive()&&(matchState.rules.phase!=='live'||matchMovementBlocked());}
function matchMember(entity){return entity===VS.player?matchState.human:entity?.member;}
function matchCreateMember(team,id,agent,human=false) {
  const p={team,id,name:human?VS.player.name:team.toUpperCase()+' Bot '+(id+1),agent,ultCost:window.GAME_CONFIG['playable-agents'][agent].ultCost,credits:800,ult:0,armor:0,inventory:{primary:null,secondary:'Classic',melee:'Melee'}};
  if(human)p.entity=VS.player;
  for(const key of ['hp','armor','credits','ult']) {
    let value=p[key]??(key==='hp'?100:0);
    Object.defineProperty(p,key,{enumerable:true,get(){if(human)return key==='ult'?agentState.ult:VS.player[key];return key==='hp'||key==='armor'?p.entity?.[key]??value:value;},set(v){value=v;if(human){if(key==='ult')agentState.ult=v;else VS.player[key]=v;}else if(p.entity&&(key==='hp'||key==='armor'))p.entity[key]=v;}});
  }
  Object.defineProperty(p,'position',{get:()=>matchMemberPoint(p).asArray()});return p;
}
function matchRulesEvent(type,value) {
  if(matchState.rules){VS.round.phase=matchState.rules.phase;VS.round.number=matchState.rules.round;VS.round.score=matchState.rules.score;}
  if(type==='round')matchRoundReset();
  if(type==='live'){matchState.barrier?.setEnabled(false);weaponClearInput();if(typeof uiCloseAll==='function')uiCloseAll();}
  if(type==='purchase'&&typeof uiRecordPurchase==='function')uiRecordPurchase(value,value.bought[value.bought.length-1]?.price||0);
  if(type==='end'){weaponClearInput();agentCancelEquip();matchSyncInventory();
    if(typeof uiState!=='undefined')uiState.roundsDone++;if(typeof uiCloseAll==='function')uiCloseAll();
    for(const bot of matchState.bots){const a=bot.ability;if(a){a.deadline=0;a.reviveAt=0;if(a.resTarget)a.resTarget.revivingUntil=0;}}
  }
  if(type==='plant'){agentState.ult=matchState.human.ult;}
  matchUIUpdate();
}
async function matchStart(mode,roster) {
  const s=matchState;if(s.loading)return;
  s.loading=true;const version=++s.version;playerController.pause();
  const status=document.getElementById('match-status');
  try {
    if(!window.__weaponsReady){weaponInit();window.__weaponsReady=true;}
    if(!s.nav) {
      status.textContent='Đang tải đường đi…';
      if(VSMaps.valid(MAP_MODE)&&!window.__mapFallback) {
        const result=await fetch(VSMaps.get(MAP_MODE).root+'match-navigation.json?v=53');
        if(!result.ok)throw Error('Thiếu navigation Abyss. Chạy tools/build-match-navigation.cjs.');s.nav=new BotNavigation(await result.json());
      } else s.nav=await BotNavigation.build(window.collisionWorld,agentPosition(),window.GAME_CONFIG.match.navigation,window.GAME_CONFIG.movement,(i,n)=>status.textContent='Dựng đường đi '+i+'/'+n);
    }
    status.textContent='Đang chuẩn bị model bot và skill…';await matchPrepareBotAssets(roster,mode);if(version!==s.version)return;
    matchStop(false);s.resultSaved=false;s.mode=mode;s.active=true;s.rules=new MatchRules(window.GAME_CONFIG,matchRulesEvent);
    const members=roster.map((r,i)=>matchCreateMember(r.team,i,r.agent,i===0));s.human=members[0];
    for(let i=1;i<members.length;i++)s.bots.push(matchCreateBot(members[i],i));
    s.rules.members=members;
    s.authoredLayout=VSMaps.valid(MAP_MODE)&&!window.__mapFallback?window.GAME_CONFIG['map-layout']:null;
    s.sites=s.nav.data.layout.sites.map((id,i)=>({...s.authoredLayout?.sites[i],name:s.authoredLayout?.sites[i]?.name||String.fromCharCode(65+i),position:s.nav.nodes[id].clone()}));
    matchCreateMarkers();matchRefreshTargets();
    if(mode==='unrated')s.rules.start(members,agentNow());
    else {
      s.rules.start(members,agentNow());s.rules.phase='live';s.rules.spike={state:'none',position:null,channel:null,carrier:null,checkpoint:0};s.dmEnd=agentNow()+window.GAME_CONFIG.match.deathmatch.duration;
      for(const p of members){p.inventory.primary='Vandal';p.credits=9000;matchRespawnDM(p);}VS.round.phase='live';
      s.markers.forEach(m=>m.setEnabled(false));
    }
    document.getElementById('range-weapon').disabled=true;
    document.getElementById('playable-agent').disabled=true;
    document.getElementById('respawn-player').disabled=true;
    document.getElementById('agent-practice').hidden=true;
    document.getElementById('match-roster').hidden=true;status.textContent=mode==='deathmatch'?'Deathmatch đã sẵn sàng. Bấm Chơi.':'Round 1 đã sẵn sàng. Mua đồ rồi bấm Chơi.';
    matchBuildShop();matchUIUpdate();
  } catch(error){recordGameError(error);matchStop(false);status.textContent='Không khởi tạo được trận: '+error.message;}
  finally{s.loading=false;}
}
function matchRefreshTargets() {
  (window.__rangeTargets||[]).forEach(t=>t.meshes.forEach(m=>m.setEnabled(false)));
  const panel=document.getElementById('range-panel');if(panel)panel.hidden=true;
  rangeState.unlimited=false;
  window.__matchTargets=matchState.bots.filter(b=>matchState.mode==='deathmatch'||b.member.team!=='a').map(b=>b.entity);
  agentState.allies=matchState.bots.filter(b=>b.member.team==='a'&&matchState.mode==='unrated').map(b=>b.entity);
}
function matchStop(release=true) {
  matchSpectatorStop();
  if(typeof uiCloseAll==='function'){uiCloseAll(false);uiResetMatch();}
  const s=matchState;if(s.active)agentClearEffects();s.active=false;
  s.bots.splice(0).forEach(matchDisposeBot);s.markers.splice(0).forEach(m=>m.dispose(false,!m.metadata?.sharedAsset));
  s.tracers.splice(0).forEach(t=>t.mesh.dispose());s.drops.splice(0).forEach(d=>d.mesh?.dispose(false,!d.mesh.metadata?.sharedAsset));
  s.orbs=[];s.sites=[];s.barrier=null;s.spikeMesh=null;s.hold=false;s.orbChannel=null;s.rules=null;s.buyDistances=null;s.buyLast=null;window.__matchTargets=[];agentState.allies=[];
  if(release){s.version++;s.mode='practice';agentRespawn();playerController.respawn();
    VS.round.phase='buy';VS.round.number=1;VS.round.score={a:0,b:0};
    weaponState.loadout={primary:'Vandal',secondary:'Classic',melee:'Melee'};
    (window.__rangeTargets||[]).forEach(t=>t.meshes.forEach(m=>m.setEnabled(true)));
    const panel=document.getElementById('range-panel');if(panel)panel.hidden=false;
    for(const id of ['range-weapon','playable-agent','respawn-player'])document.getElementById(id).disabled=false;
    document.getElementById('agent-practice').hidden=false;
    document.getElementById('match-shop').replaceChildren();document.getElementById('match-hud').hidden=true;
    document.getElementById('match-status').textContent='Luyện tập tự do';
  }
}
function matchCreateMarkers() {
  const s=matchState;
  for(const site of s.sites) {
    if(site.polygons?.length)for(const polygon of site.polygons) {
      const points=[...polygon,polygon[0]].map(([x,z])=>{const hit=worldPick(new BABYLON.Vector3(x,site.position.y+.45,z),BABYLON.Vector3.Down(),1.5,true);return new BABYLON.Vector3(x,(hit?.pickedPoint.y??site.position.y)+.045,z);});
      const mesh=BABYLON.MeshBuilder.CreateLines('plant_region_'+site.name,{points},scene);mesh.color=BABYLON.Color3.FromHexString(site.name==='A'?'#F8AD70':'#73D7F0');mesh.isPickable=false;s.markers.push(mesh);
    } else {
      const mesh=BABYLON.MeshBuilder.CreateTorus('site_'+site.name,{diameter:window.GAME_CONFIG.match.siteRadius*2,thickness:.055,tessellation:64},scene);
      mesh.position.copyFrom(site.position).y+=.06;mesh.material=agentLuminousMaterial('site_mat_'+site.name,site.name==='A'?'#F8AD70':'#73D7F0');mesh.isPickable=false;s.markers.push(mesh);
    }
  }
  s.spikeMesh=matchProp('spike',null,.35).root;s.markers.push(s.spikeMesh);
  s.plantView=matchProp('spike',camera,.32);s.defuseView=matchProp('defuser',camera,.2);
  for(const prop of [s.plantView,s.defuseView]) {
    prop.root.position.set(0,-.18,.5);prop.root.setEnabled(false);
    prop.root.getChildMeshes().forEach(m=>m.renderingGroupId=1);s.markers.push(prop.root);
  }
  s.barrier=new BABYLON.Mesh('buy_boundaries',scene);s.barrier.isPickable=false;s.markers.push(s.barrier);
  for(const id of s.mode==='deathmatch'?[]:s.nav.data.layout.orbs) {
    const mesh=BABYLON.MeshBuilder.CreateSphere('ult_orb',{diameter:.45,segments:12},scene);
    mesh.material=agentLuminousMaterial('ult_orb_mat','#D3B5F8');mesh.isPickable=false;mesh.position.copyFrom(s.nav.nodes[id]).y+=.8;
    s.orbs.push({position:s.nav.nodes[id],mesh,taken:false});s.markers.push(mesh);
  }
}
function matchSpawnPoint(p) {
  const s=matchState,index=p.team===s.rules.attacking?s.nav.data.layout.attack:s.nav.data.layout.defend;
  const distances=s.nav.distances(index),near=[];distances.forEach((d,i)=>{if(d>=1&&d<=5)near.push(i);});
  return s.nav.nodes[near[(p.id*7)%near.length]??index].clone();
}
function matchRoundReset() {
  matchSpectatorStop();
  const s=matchState,charges={...agentState.charges};agentRespawn();agentReset(false);
  if(typeof uiRoundStart==='function')uiRoundStart();
  agentState.charges.C=charges.C||0;agentState.charges.Q=charges.Q||0;
  const cfg=agentConfig();agentState.charges.E=Math.min(cfg.E.charges,Math.max(charges.E||0,cfg.E.free||1));
  if(s.rules.round===1||s.rules.round===window.GAME_CONFIG.rounds.halfRounds+1){agentState.charges.C=0;agentState.charges.Q=0;agentState.charges.E=cfg.E.free||1;combatEquipArmor(VS.player,'none');}
  for(const p of s.rules.members) {
    p.deathReported=false;p.dead=false;p.bought=[];
    if(p!==s.human) {
      const primary=p.inventory.primary;
      if(!primary&&p.credits>=weaponDef('Vandal').price+1000){p.inventory.primary='Vandal';p.credits-=weaponDef('Vandal').price;if(typeof uiRecordPurchase==='function')uiRecordPurchase(p,weaponDef('Vandal').price);}
      if(p.armor<50&&p.credits>=1000){p.credits-=1000;p.armorType='heavy';p.armor=50;if(typeof uiRecordPurchase==='function')uiRecordPurchase(p,1000);}else if(p.armor<25&&p.credits>=400){p.credits-=400;p.armorType='light';p.armor=25;if(typeof uiRecordPurchase==='function')uiRecordPurchase(p,400);}
      matchBotSpawn(p.entity.bot,matchSpawnPoint(p));
      matchBotAbilitiesReset(p.entity.bot,s.rules.round===1||s.rules.round===window.GAME_CONFIG.rounds.halfRounds+1||s.rules.round>window.GAME_CONFIG.rounds.halfRounds*2);
      matchBotBuyAbilities(p.entity.bot);
    }
  }
  VS.player.hp=100;VS.player.dead=false;VS.player.damageLedger=new Map();VS.player.revivingUntil=0;VS.player.reviveCaster=null;s.human.deathReported=false;
  playerController.teleport(matchSpawnPoint(s.human));
  s.spawn=agentPosition();matchCreateBuyBoundaries();s.barrier.setEnabled(true);
  matchApplyLoadout();s.orbs.forEach(o=>{o.taken=false;o.mesh.setEnabled(true);});
  s.drops.splice(0).forEach(d=>d.mesh?.dispose(false,!d.mesh.metadata?.sharedAsset));s.hold=false;s.orbChannel=null;
  s.rules.spike.carrier=s.human.team===s.rules.attacking?s.human:s.rules.members.find(p=>p.team===s.rules.attacking);
  matchUIUpdate();matchBuildShop();
}
function matchApplyLoadout(refill=true) {
  const p=matchState.human;weaponClearInput();weaponState.reloading=false;weaponState.fireUntil=0;
  weaponState.loadout={...p.inventory};
  for(const name of [p.inventory.primary,p.inventory.secondary])if(name&&(refill||!weaponState.ammo[name])){const def=weaponDef(name);weaponState.ammo[name]={clip:def.mag,reserve:def.reserveMax};}
  const name=p.inventory.primary||p.inventory.secondary||'Melee';weaponState.current='';weaponSwitch(name);
  VS.player.weapon=weaponState.current;VS.player.ammo=weaponState.ammo[weaponState.current]||{};uiHUDUpdate();
}
function matchSyncInventory(){if(!matchActive())return;const p=matchState.human;if(VS.player.hp>0)p.inventory={...weaponState.loadout};}
function matchCanSwitch(name){if(!matchActive())return true;return Object.values(matchState.human.inventory).includes(name)&&!matchMovementBlocked();}
function matchEntityDied(entity,killerEntity=null,source={}) {
  if(!matchActive())return;
  const s=matchState,victim=matchMember(entity),killer=matchMember(killerEntity);if(!victim||victim.deathReported)return;
  if(typeof uiElimination==='function')uiElimination(victim,killer);
  source={...killerEntity?.bot?.pendingKillSource,...source};
  for(const member of s.rules.members)if(member.entity.reviveCaster===entity){member.entity.revivingUntil=0;member.entity.reviveCaster=null;}
  if(killer&&victim.team!==killer.team) {
    if(killer===s.human){const ult=agentState.ult;agentOnElimination(entity,source);agentState.ult=ult;}
    else matchBotElimination(killer.entity.bot,entity,source);
  }
  for(const [id,entry] of entity.damageLedger||[]) {
    const helper=s.rules.members.find(p=>p.id===id),windowMs=helper?.agent==='Clove'?window.GAME_CONFIG['playable-agents'].Clove.C.assistWindow:8000;
    if(!helper||helper===killer||helper.team===victim.team||agentNow()-entry.at>windowMs)continue;
    helper.assists++;if(helper===s.human){const ult=agentState.ult;agentOnElimination(entity,{damagingAssist:true});agentState.ult=ult;}
    else matchBotElimination(helper.entity.bot,entity,{damagingAssist:true});
  }
  entity.damageLedger=new Map();
  if(s.mode==='deathmatch') {
    victim.deathReported=true;victim.deaths++;if(killer&&killer!==victim)killer.kills++;
    entity.respawnAt=agentNow()+window.GAME_CONFIG.match.deathmatch.respawnDelay;
  } else s.rules.killed(victim,killer,agentNow());
  if(victim!==s.human){entity.meshes.forEach(m=>m.setEnabled(false));entity.bot.hitRoot.setEnabled(false);entity.bot.badge.setEnabled(false);entity.bot.deathAt=agentNow();entity.overheal=0;entity.bot.channelProp?.root.setEnabled(false);
    const a=entity.bot.ability;if(a){a.deathAt=agentNow();a.deathCause=source.cause||'combat';a.deathClip=entity.bot.clip;a.reviveAt=a.intangibleUntil=a.deadline=0;a.knives=0;a.charges.E=victim.agent==='Clove'?Math.min(1,a.charges.E):a.charges.E;a.lockUntil=0;
      a.action=null;a.lastVictim=null;a.hasteUntil=a.overhealUntil=a.overhealRemaining=0;a.dashReady=a.dashExpires=a.dashUntil=0;
      if(entity.bot.held){agentLayerDispose(entity.bot.held);entity.bot.held=null;}
      entity.bot.knifeRig?.setEnabled(false);entity.bot.gun?.root.setEnabled(false);}
    matchBotPose(entity.bot,agentNow());}
  if(victim.inventory.primary&&s.mode==='unrated')matchDrop(victim.inventory.primary,matchMemberPoint(victim),victim);
  if(victim===s.human&&typeof uiState!=='undefined')uiState.report={killer,rows:victim.uiDamageRows||new Map(),round:s.rules.round};
  const hit=entity.uiLastHit?.source===killerEntity?entity.uiLastHit:null;
  uiKillFeed(killer?.name||'Abyss',victim.name,{killer,victim,weapon:hit?.weapon,headshot:hit?.zone==='head'});matchUIUpdate();
}
function matchRespawnDM(p) {
  const s=matchState,others=s.rules.members.filter(m=>m!==p&&m.hp>0);let best=s.nav.nodes[0],score=-1;
  for(let i=0;i<35;i++){const n=s.nav.nodes[Math.floor(Math.random()*s.nav.nodes.length)];const value=Math.min(...others.map(o=>BABYLON.Vector3.DistanceSquared(n,matchMemberPoint(o))),10000);if(value>score){score=value;best=n;}}
  p.deathReported=false;p.hp=100;p.inventory={primary:'Vandal',secondary:'Classic',melee:'Melee'};
  if(p===s.human){matchSpectatorStop();agentRespawn();combatEquipArmor(VS.player,'heavy');playerController.teleport(best);matchApplyLoadout();}
  else {p.armorType='heavy';p.armor=50;matchBotSpawn(p.entity.bot,best);}
}
function matchDrop(name,position,owner) {
  const prop=matchProp(name,null,name==='Classic'?.24:.8);
  const mesh=prop?.root||BABYLON.MeshBuilder.CreateBox('weapon_drop',{width:.5,height:.07,depth:.12},scene);
  mesh.position.copyFrom(position).y+=.12;mesh.rotation.z=Math.PI/2;
  if(!prop){mesh.material=agentLuminousMaterial('weapon_drop_mat','#E0D1AB');mesh.isPickable=false;}
  const ammo=owner===matchState.human?weaponState.ammo[name]:owner?.entity?.bot?{clip:owner.entity.bot.clip,reserve:owner.entity.bot.reserve}:null;
  matchState.drops.push({name,position:position.clone(),mesh,owner,ammo:ammo?{...ammo}:null});
}
function matchRayMember(ray,shooter) {
  let best=null;
  for(const p of matchState.rules.members) {
    if(p===shooter||p.hp<=0)continue;
    const feet=matchMemberPoint(p),crouch=p===matchState.human?window.__moveState?.crouching:p.entity.bot.actor.crouching;
    for(const [zone,y,h,width] of [['head',crouch?1.15:1.65,.3,.3],['body',crouch?.8:1.125,crouch?.5:.75,.55],['leg',.375,.75,.4]]) {
      const center=feet.add(new BABYLON.Vector3(0,y,0)),min=center.subtract(new BABYLON.Vector3(width/2,h/2,.2)),max=center.add(new BABYLON.Vector3(width/2,h/2,.2));
      let near=0,far=ray.length;
      for(const axis of ['x','y','z']) {
        if(Math.abs(ray.direction[axis])<1e-8){if(ray.origin[axis]<min[axis]||ray.origin[axis]>max[axis]){far=-1;break;}}
        else {let a=(min[axis]-ray.origin[axis])/ray.direction[axis],b=(max[axis]-ray.origin[axis])/ray.direction[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);}
      }
      if(near<=far&&(!best||near<best.distance))best={member:p,zone,distance:near};
    }
  }return best;
}
function matchInteract(now) {
  const s=matchState,p=s.human,position=agentPosition(),spike=s.rules.spike;
  if(!s.hold||p.hp<=0||s.rules.phase!=='live'){if(spike.channel?.actor===p)s.rules.cancelChannel();s.orbChannel=null;return;}
  if(s.mode==='unrated') {
    const kind=p.team===s.rules.attacking?'plant':'defuse';
    const valid=kind==='plant'?s.sites.some(site=>matchAtSite(position,site)):spike.state==='planted'&&BABYLON.Vector3.Distance(position,BABYLON.Vector3.FromArray(spike.position))<=window.GAME_CONFIG.match.interactionRange;
    if(s.rules.beginChannel(p,kind,now,valid,position.asArray())){weaponClearInput();return;}
    if(spike.channel?.actor===p)s.rules.cancelChannel();
    if(spike.state==='dropped'&&s.rules.pickup(p,BABYLON.Vector3.Distance(position,BABYLON.Vector3.FromArray(spike.position))))return;
    const orb=s.orbs.find(o=>!o.taken&&BABYLON.Vector3.Distance(position,o.position)<2);
    if(orb) {
      if(s.orbChannel?.orb!==orb)s.orbChannel={orb,start:now};
      if(now-s.orbChannel.start>=window.GAME_CONFIG.match.orbDuration){p.ult=Math.min(p.ultCost,p.ult+window.GAME_CONFIG.economy.ultPoints.orb);orb.taken=true;orb.mesh.setEnabled(false);s.orbChannel=null;s.hold=false;}return;
    }s.orbChannel=null;
  }
  const drop=s.drops.find(d=>BABYLON.Vector3.Distance(position,d.position)<2.5);
  if(drop){const slot=weaponDef(drop.name).slot,old=p.inventory[slot];if(old&&old!=='Classic')matchDrop(old,position,p);p.inventory[slot]=drop.name;if(drop.ammo)weaponState.ammo[drop.name]={...drop.ammo};drop.mesh.dispose(false,!drop.mesh.metadata?.sharedAsset);s.drops.splice(s.drops.indexOf(drop),1);matchApplyLoadout(false);s.hold=false;}
}
function matchUpdate(dt) {
  if(typeof multiplayerActive==='function'&&multiplayerActive())return;
  const s=matchState;if(!s.active||s.loading)return;
  const now=agentNow(),r=s.rules;
  if(r.phase==='complete'&&!s.resultSaved){s.resultSaved=true;try{const p=s.human,dm=s.mode==='deathmatch';VSProfile.record({mode:dm?'Deathmatch':'Unrated · Bot',map:VSMaps.get(MAP_MODE)?.name||'Abyss',agent:p.agent,kills:p.kills||0,deaths:p.deaths||0,assists:p.assists||0,score:dm?{a:p.kills||0,b:Math.max(...r.members.filter(a=>a!==p).map(a=>a.kills||0))}:r.score,winner:dm?p.kills>=Math.max(...r.members.map(a=>a.kills||0)):r.winner===p.team}).catch(error=>uiToast(error.message));}catch{}}
  const channel=r.spike?.channel;
  for(const [prop,kind] of [[s.plantView,'plant'],[s.defuseView,'defuse']])if(prop) {
    const active=channel?.actor===s.human&&channel.kind===kind;prop.root.setEnabled(active);
    if(active)for(const group of prop.groups)group.goToFrame(group.from+(group.to-group.from)*Math.min(1,(now-channel.start)/(kind==='plant'?window.GAME_CONFIG.rounds.plantDuration:window.GAME_CONFIG.rounds.defuseDuration)));
  }
  if(s.human.hp<=0&&!s.human.deathReported)matchEntityDied(VS.player,null);
  if(s.mode==='deathmatch') {
    if(s.human.hp<=0&&now>=(VS.player.respawnAt||Infinity))matchRespawnDM(s.human);
    if(now>=s.dmEnd||r.members.some(p=>p.kills>=window.GAME_CONFIG.match.deathmatch.killLimit)){r.phase='complete';r.reason='Deathmatch kết thúc';}
  } else {
    matchInteract(now);
    if(r.phase==='buy')matchEnforceBuyArea();
    r.tick(now,p=>p.hp>0||p!==s.human&&matchBotPendingRevival(p.entity.bot,now)||p===s.human&&(agentState.resurrectAt>now||VS.player.agent==='Clove'&&agentState.ult>=agentConfig().ultCost&&now-agentState.deathAt<agentConfig().X.window&&agentState.deathCause!=='fall'));
    if(s.human.hp>0)s.human.deathReported=false;
    const spike=r.spike;
    s.spikeMesh.setEnabled(['dropped','planted'].includes(spike.state));
    if(spike.position)s.spikeMesh.position.copyFromFloats(...spike.position).y+=.18;
    if(spike.state==='planted')s.spikeMesh.scaling.setAll(1+.1*Math.sin(now*.01));
  }
  if(r.phase==='live')matchBotsUpdate(dt,now);
  VS.round.number=r.round;VS.round.phase=r.phase;VS.round.score=r.score;VS.round.timeLeft=Math.max(0,((s.mode==='deathmatch'?s.dmEnd:r.spike?.state==='planted'?r.spike.explodesAt:r.until)-now)/1000);
  if(now>=(s.nextHUD||0)){matchUIUpdate();s.nextHUD=now+150;}
}
function matchInit() {
  matchUIInit();scene.onBeforeRenderObservable.add(()=>{if(window.__gamePlaying)matchUpdate(window.__frameDT||1/30);});
  document.addEventListener('keydown',e=>{
    if(!window.__gamePlaying||!matchActive()||e.target.matches?.('input,select,textarea'))return;
    if(e.code==='Tab'){e.preventDefault();document.getElementById('match-scoreboard').hidden=false;uiState.boardKey='';matchUIUpdate();}
    if(e.code==='KeyG'&&window.__gamePlaying)safeHold(true);
    if(e.code==='KeyH'&&window.__gamePlaying&&!e.repeat&&matchState.rules.phase==='live') {
      const p=matchState.human,name=weaponState.current,slot=weaponDef(name).slot;
      if(slot!=='melee'&&name!=='Classic'){matchDrop(name,agentPosition(),p);p.inventory[slot]=null;matchApplyLoadout(false);}
    }
  });
  function safeHold(value){matchState.hold=value;}
  document.addEventListener('keyup',e=>{if(e.code==='KeyG')safeHold(false);if(e.code==='Tab')document.getElementById('match-scoreboard').hidden=true;});
  window.addEventListener('blur',()=>{safeHold(false);document.getElementById('match-scoreboard').hidden=true;});
  scene.onDisposeObservable.add(()=>{matchStop(false);deathSpectator.camera=null;botAssets.forEach(c=>c.dispose());botAssets.clear();matchSkillAssets.forEach(c=>c.dispose());matchSkillAssets.clear();clearInterval(matchState.selectionTimer);});
  if(typeof netInit==='function'&&new URLSearchParams(location.search).has('room'))netInit();
  else if(!window.GameEntry){const mode=new URLSearchParams(location.search).get('mode');if(['unrated','deathmatch'].includes(mode))matchBeginSelection(mode);}
}
