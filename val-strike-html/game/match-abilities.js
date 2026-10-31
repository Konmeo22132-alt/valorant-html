// Each bot owns charges/deadlines. World effects use the same source layers as
// the player; sharing a container never substitutes another agent's skill mesh.
const matchSkillAssets=new Map();
async function matchPrepareAbilityAssets(roster) {
  const response=await fetch('/assets/playable/manifest.json?v=38');if(!response.ok)throw Error('Skill manifest '+response.status);
  const manifest=await response.json();
  const textures={Clove:['clove-ripple','clove-butterfly','clove-essence','clove-glow','clove-generic'],
    Jett:['jett-wind','jett-air','jett-swipe','jett-dome'],Sage:['sage-crystal','sage-flow','sage-noise','sage-orb','sage-energy','sage-energy-mask','sage-res-body']};
  for(const name of new Set(roster.map(p=>p.agent))) {
    await Promise.all(['alpha-scroll-b','alpha-scroll-c','smoke-noise',...textures[name]].map(n=>agentEffectTexture(n).skillReady));
    const code=window.GAME_CONFIG['playable-agents'][name].code;
    for(const label of Object.keys(manifest[name].effects)) {
      const file=code+'-'+label+'.glb';if(matchSkillAssets.has(file))continue;
      matchSkillAssets.set(file,await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',file+'?v=27',scene));
    }
    if(name==='Clove'&&!matchSkillAssets.has('clove-ghost')) {
      const container=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/','smonk-resurrection-body.glb?v=27',scene);
      agentResurrectionMaterials(container);matchSkillAssets.set('clove-ghost',container);
    }
  }
}
function matchBotAbilitiesReset(bot,pistol=false) {
  const cfg=agentConfig(bot.entity),old=bot.ability;
  bot.ghost?.root.dispose();bot.ghost=null;if(bot.held)agentLayerDispose(bot.held);bot.held=null;bot.knifeRig?.dispose();bot.knifeRig=null;
  bot.ability={charges:{C:pistol?0:old?.charges.C||0,Q:pistol?0:old?.charges.Q||0,E:pistol?cfg.E.free||1:Math.min(cfg.E.charges,Math.max(old?.charges.E||0,cfg.E.free||1))},
    cooldowns:{},lockUntil:0,nextDecision:0,kills:0,knives:0,knifeAt:0,lastVictim:null,
    deathAt:-Infinity,reviveAt:0,intangibleUntil:0,deadline:0,hasteUntil:0,overhealUntil:0,overhealRemaining:0};
  bot.entity.overheal=0;bot.entity.damageLedger=new Map();
}
function matchBotBuyAbilities(bot) {
  const a=bot.ability,cfg=agentConfig(bot.entity),rules=matchState.rules;
  for(const slot of ['C','Q','E'])while(a.charges[slot]<cfg[slot].charges&&cfg[slot].price&&bot.member.credits>=cfg[slot].price) {
    if(!rules.buy(bot.member,'ability:'+slot,cfg[slot].price,()=>{a.charges[slot]++;return true;}))break;
  }
}
function matchBotSpend(bot,slot) {
  const a=bot.ability,def=agentConfig(bot.entity)[slot];
  if(slot==='X'){if(bot.member.ult<bot.member.ultCost)return false;bot.member.ult=0;return true;}
  if(!a.charges[slot])return false;a.charges[slot]--;
  if(def.cooldown&&!a.cooldowns[slot])a.cooldowns[slot]=agentNow()+def.cooldown;return true;
}
function matchBotAction(bot,name,duration,held=null) {
  const a=bot.ability,now=agentNow();a.action={name:bodyActionName(name),start:now,duration};
  if(name.startsWith('gun_'))return;
  if(!bot.remote){a.lockUntil=now+duration;bot.actor.crouching=false;bot.crouchUntil=0;bot.reloadUntil=0;}
  if(bot.held)agentLayerDispose(bot.held);bot.held=null;
  bot.gun?.root.setEnabled(false);
  if(bot.member.agent==='Clove'&&name==='Q_cast')agentAbilityCastTrail('meddle-swipe','clove-generic','#E4B3FF',650,bot.entity);
  if(bot.member.agent==='Jett'&&name==='X_equip')agentAbilityCastTrail('knife-fan','jett-air','#C5F5FF',700,bot.entity);
  if(bot.member.agent==='Jett'&&name==='X_fire')agentAbilityCastTrail('knife-twirl','jett-swipe','#C5F5FF',duration,bot.entity);
}
function matchRecordDamage(entity,source,amount) {
  if(!matchActive()||amount<=0)return;
  source=source||VS.player;const dealer=matchMember(source),victim=matchMember(entity);
  if(!dealer||!victim||dealer.team===victim.team||dealer===victim)return;
  entity.damageLedger=entity.damageLedger||new Map();entity.damageLedger.set(dealer.id,{at:agentNow(),amount:(entity.damageLedger.get(dealer.id)?.amount||0)+amount});
  if(source===VS.player)entity.lastPlayerDamageAt=agentNow();
}
function matchBotElimination(bot,victim,source={}) {
  const a=bot.ability,cfg=agentConfig(bot.entity);if(!a)return;
  a.lastVictim={at:agentNow(),position:agentPosition(victim)};
  if(a.deadline&&agentNow()>=a.lockUntil)a.deadline=0;
  if(!source.damagingAssist&&bot.member.agent==='Jett') {
    if(++a.kills>=cfg.E.kills){a.charges.E=1;a.kills=0;}
    if(source.knife)a.knives=cfg.X.knives;
  }
}
function matchBotGhost(bot) {
  if(bot.ghost)return bot.ghost;
  const instance=matchSkillAssets.get('clove-ghost').instantiateModelsToScene(n=>'bot_ghost_'+bot.member.id+'_'+n,false,{doNotInstantiate:true});
  const root=agentLayerRoot('bot_spectral_body','Clove');instance.rootNodes.forEach(n=>n.parent=root);
  const groups=new Map();instance.animationGroups.forEach(g=>{g.start(false);g.pause();groups.set(g.name.split('_').pop(),g);});
  const bounds=root.getHierarchyBoundingVectors(true),scale=1.8/(bounds.max.y-bounds.min.y||1);root.scaling.setAll(scale);
  root.getChildMeshes().forEach(m=>m.isPickable=false);
  root.onDisposeObservable.add(()=>{instance.animationGroups.forEach(g=>g.dispose());instance.skeletons.forEach(s=>s.dispose());});
  return bot.ghost={root,groups,offset:-bounds.min.y*scale};
}
function matchBotPendingRevival(bot,now) {
  if(!bot?.ability)return false;
  const a=bot.ability,cfg=agentConfig(bot.entity);
  return !!a&&(a.reviveAt>0||bot.member.agent==='Clove'&&bot.entity.hp<=0&&bot.member.ult>=cfg.ultCost&&now-a.deathAt<cfg.X.window&&a.deathCause!=='fall');
}
function matchReviveEntity(entity) {
  if(!agentReviveSpace(entity))return false;
  entity.hp=100;entity.armor=0;entity.overheal=0;entity.decay=null;entity.revivingUntil=0;
  const member=matchMember(entity);if(member){member.deathReported=false;member.dead=false;}
  if(entity===VS.player) {
    const point=agentPosition();entity.dead=false;agentCancelEquip();
    agentState.resurrectAt=agentState.intangibleUntil=agentState.revivedUntil=agentState.lockUntil=0;
    agentState.deathAt=-Infinity;playerController.teleport(point);matchSpectatorStop();
    matchApplyLoadout(false);
  } else if(entity.bot) {
    const bot=entity.bot;bot.hitRoot.setEnabled(true);entity.meshes.forEach(m=>m.setEnabled(true));bot.badge.setEnabled(true);
    bot.path=[];bot.plannedGoal=null;bot.nextThink=0;bot.actor.velocity.setAll(0);
  }
  return true;
}
function matchBotProjectile(bot,type,point) {
  const from=bot.entity.position.add(new BABYLON.Vector3(0,1.4,0)),delta=point.subtract(from),horizontal=Math.hypot(delta.x,delta.z);
  let speed=type==='cloud'?agentConfig(bot.entity).C.speed:18;
  // Aim a ballistic arc at the floor instead of throwing horizontally past it.
  const time=Math.max(.15,horizontal/speed),velocity=new BABYLON.Vector3(delta.x/time,delta.y/time+(type==='cloud'?0:9.8*time/2),delta.z/time);
  const magnitude=velocity.length();
  agentProjectile(type,magnitude,type==='cloud'?0:9.8,type==='cloud'?agentConfig(bot.entity).C.flight:6000,bot.entity,from,velocity.scale(1/magnitude));
}
function matchBotSmoke(bot,point,dead=false) {
  const cfg=agentConfig(bot.entity).E,now=agentNow();
  if(BABYLON.Vector3.Distance(bot.entity.position,point)>(dead?cfg.deadRange:cfg.range)||!matchBotSpend(bot,'E'))return false;
  agentSmoke(point,cfg.radius,dead?cfg.deadDuration:cfg.duration,cfg.windup,bot.entity);
  if(!dead)matchBotAction(bot,'E_cast',700);
  bot.ability.nextSmoke=now+window.GAME_CONFIG.match.bots.abilities.smokeInterval;return true;
}
function matchBotSkillThink(bot,now) {
  if(matchState.mode!=='unrated'||matchState.rules.phase!=='live')return;
  const a=bot.ability,e=bot.entity,cfg=agentConfig(e),ai=window.GAME_CONFIG.match.bots.abilities;
  if(!a||now<a.nextDecision)return;a.nextDecision=now+ai.decisionInterval;
  const allies=matchState.rules.members.filter(p=>p.team===bot.member.team&&p!==bot.member);
  const target=bot.target?.hp>0?bot.target:null,enemyPoint=target&&matchMemberPoint(target),distance=enemyPoint?BABYLON.Vector3.Distance(e.position,enemyPoint):Infinity;
  const ready=slot=>a.charges[slot]>0;
  if(e.hp<=0) {
    if(bot.member.agent!=='Clove')return;
    if(matchBotPendingRevival(bot,now)&&!a.reviveAt&&agentReviveSpace(e)&&matchBotSpend(bot,'X')) {
      a.reviveStarted=now;a.reviveAt=now+cfg.X.revive;a.intangibleUntil=a.reviveAt+cfg.X.intangible;
      a.lockUntil=a.intangibleUntil+cfg.X.reequip;a.deadline=a.lockUntil+cfg.X.deadline;
      matchBotGhost(bot);agentCastLayers('clove-revive',e,cfg.X.revive+cfg.X.intangible,e);agentAbilityCastTrail('res-swipe','clove-generic','#D9B2FF',650,e);return;
    }
    if(ready('E')&&now>=(a.nextSmoke||0)) {
      // Dead Clove uses an ally's visible threat, never an omniscient enemy list.
      const observer=allies.find(p=>p.hp>0&&p.entity.bot?.target?.hp>0),threat=observer?.entity.bot.target;
      if(threat)matchBotSmoke(bot,matchMemberPoint(threat),true);
    }return;
  }
  if(now<a.lockUntil||now<(e.suppressedUntil||0)||matchState.rules.spike.channel?.actor===bot.member)return;
  if(bot.member.agent==='Clove') {
    if(ready('C')&&a.lastVictim&&now-a.lastVictim.at<=cfg.C.activationWindow&&(e.hp<ai.pickupHealth||target)) {
      matchBotSpend(bot,'C');a.overhealRemaining=cfg.C.overheal;a.overhealUntil=now+cfg.C.duration;a.hasteUntil=now+cfg.C.hasteDuration;a.lastVictim=null;
      matchBotAction(bot,'C_cast',500);agentEffectCue(e,'#BB81E8',cfg.C.hasteDuration,'pickup',e);return;
    }
    if(ready('Q')&&target&&distance<ai.projectileRange&&distance>cfg.Q.radius+1&&!allies.some(p=>p.hp>0&&BABYLON.Vector3.Distance(matchMemberPoint(p),enemyPoint)<cfg.Q.radius+1)) {
      matchBotSpend(bot,'Q');matchBotAction(bot,'Q_cast',700,'butterfly');matchBotProjectile(bot,'meddle',enemyPoint);return;
    }
    if(ready('E')&&target&&now>=(a.nextSmoke||0)&&distance>cfg.E.radius*2&&
      !agentState.effects.some(f=>f.type==='smoke'&&BABYLON.Vector3.Distance(f.position,enemyPoint)<cfg.E.radius*2))matchBotSmoke(bot,enemyPoint);
  } else if(bot.member.agent==='Sage') {
    const injured=[bot.member,...allies].filter(p=>p.hp>0&&p.hp<ai.healHealth&&BABYLON.Vector3.Distance(e.position,matchMemberPoint(p))<=cfg.E.range&&agentLOS(e.position.add(new BABYLON.Vector3(0,1.4,0)),matchMemberPoint(p).add(new BABYLON.Vector3(0,1.1,0)),false)).sort((p,q)=>p.hp-q.hp)[0];
    if(ready('E')&&injured) {
      matchBotSpend(bot,'E');matchBotAction(bot,'E_cast',700,'orb');
      agentState.heals.push({entity:injured.entity,owner:e,remaining:cfg.E.allyHP,rate:cfg.E.allyHP/cfg.E.duration,damageDelay:cfg.E.damageDelay});
      agentEffectCue(injured.entity,'#70FFE3',cfg.E.duration,'heal',e);return;
    }
    const corpse=allies.find(p=>p.hp<=0&&!p.entity.revivingUntil&&!(p===matchState.human&&agentState.resurrectAt>now)&&!matchBotPendingRevival(p.entity.bot,now)&&BABYLON.Vector3.Distance(e.position,matchMemberPoint(p))<=cfg.X.range&&agentReviveSpace(p.entity)&&agentLOS(e.position.add(new BABYLON.Vector3(0,1.4,0)),matchMemberPoint(p).add(new BABYLON.Vector3(0,1,0)),false));
    if(bot.member.ult>=cfg.ultCost&&corpse&&!target) {
      matchBotSpend(bot,'X');matchBotAction(bot,'X_cast',cfg.X.channel,'orb');
      a.resTarget=corpse.entity;corpse.entity.revivingUntil=now+cfg.X.channel;corpse.entity.reviveCaster=e;
      agentEffectCue(corpse.entity,'#8EFFEC',cfg.X.channel,'revive',e);return;
    }
    if(ready('Q')&&target&&distance<ai.projectileRange&&distance>cfg.Q.radius*1.5&&
      !allies.some(p=>p.hp>0&&BABYLON.Vector3.Distance(matchMemberPoint(p),enemyPoint)<cfg.Q.radius+2)) {
      matchBotSpend(bot,'Q');matchBotAction(bot,'Q_cast',700,'orb');matchBotProjectile(bot,'slow',enemyPoint);return;
    }
    const spike=matchState.rules.spike,channel=spike.channel;
    if(ready('C')&&channel?.actor.team===bot.member.team&&channel.actor!==bot.member&&target&&distance<cfg.C.range) {
      const objective=BABYLON.Vector3.FromArray(channel.position),direction=enemyPoint.subtract(objective);direction.y=0;direction.normalize();
      const point=objective.add(direction.scale(3.5)),yaw=Math.atan2(direction.x,direction.z);
      if(BABYLON.Vector3.Distance(e.position,point)<cfg.C.range&&matchBotWallClear(bot,point,yaw)&&agentPlaceWall(point,yaw,e)) {
        matchBotSpend(bot,'C');matchBotAction(bot,'C_cast',700,'orb');return;
      }
    }
  } else if(bot.member.agent==='Jett') {
    if(bot.member.ult>=cfg.ultCost&&target&&!a.knives) {matchBotSpend(bot,'X');a.knives=cfg.X.knives;matchBotAction(bot,'X_equip',cfg.X.equip);return;}
    if(ready('C')&&target&&distance>cfg.C.radius*2&&distance<ai.projectileRange&&e.hp<ai.smokeHealth) {
      matchBotSpend(bot,'C');matchBotAction(bot,'C_cast',500);matchBotProjectile(bot,'cloud',enemyPoint);return;
    }
    if(ready('E')&&target&&!a.dashExpires&&e.hp<ai.dashHealth) {
      matchBotSpend(bot,'E');a.dashReady=now+cfg.E.windup;a.dashExpires=a.dashReady+cfg.E.window;
    }
    if(a.dashExpires>now&&now>=a.dashReady) {
      const destination=bot.path[0]!==undefined?matchState.nav.nodes[bot.path[Math.min(bot.path.length-1,8)]]:matchBotEscape(bot);
      if(destination) {
        const direction=destination.subtract(e.position);direction.y=0;direction.normalize();
        // Limit the dash to a continuous floor segment instead of jumping a void.
        let safe=0;for(let d=.3;d<=cfg.E.speed*cfg.E.duration/1000;d+=.3) {
          const point=e.position.add(direction.scale(d));if(!matchBotCanTraverse(e.position,point))break;safe=d;
        }
        if(safe>1){a.dashDirection=direction;a.dashUntil=now+Math.min(cfg.E.duration,safe/cfg.E.speed*1000);a.dashReady=a.dashExpires=0;
          matchBotAction(bot,'E_cast',cfg.E.reequip);agentWind('dash',cfg.E.duration+160,e);return;}
      }
    }
    const next=bot.path.length&&matchState.nav.nodes[bot.path[0]];
    if(ready('Q')&&next&&next.y-e.position.y>ai.updraftRise&&Math.abs(bot.actor.velocity.y)<.05&&
      !worldPick(e.position.add(new BABYLON.Vector3(0,1.8,0)),BABYLON.Vector3.Up(),cfg.Q.verticalSpeed**2/-window.GAME_CONFIG.movement.gravity/2)) {
      matchBotSpend(bot,'Q');bot.actor.velocity.y=cfg.Q.verticalSpeed;matchBotAction(bot,'Q_cast',cfg.Q.reequip);agentWind('updraft',650,e);
    }
  }
}
function matchBotWallClear(bot,point,yaw) {
  const cfg=agentConfig(bot.entity).C,positions=agentWallPositions(point,yaw,bot.entity);if(!positions)return false;
  const inside=p=>{const d=p.subtract(point);return Math.abs(d.x*Math.cos(yaw)-d.z*Math.sin(yaw))<cfg.width*cfg.segments/2+.4&&Math.abs(d.x*Math.sin(yaw)+d.z*Math.cos(yaw))<cfg.depth/2+.6&&Math.abs(d.y-point.y)<cfg.height;};
  for(const member of matchState.rules.members.filter(p=>p.team===bot.member.team&&p.hp>0)) {
    if(inside(matchMemberPoint(member)))return false;
    if(member.entity.bot?.path.some(id=>inside(matchState.nav.nodes[id])))return false;
  }return true;
}
function matchBotAbilityUpdate(bot,dt,now) {
  const a=bot.ability,e=bot.entity,cfg=agentConfig(e);if(!a)return;
  for(const slot of ['C','Q','E'])if(a.cooldowns[slot]&&now>=a.cooldowns[slot]) {
    const max=e.hp<=0&&bot.member.agent==='Clove'&&slot==='E'?1:cfg[slot].charges;
    a.charges[slot]=Math.min(max,a.charges[slot]+1);a.cooldowns[slot]=a.charges[slot]<max?a.cooldowns[slot]+cfg[slot].cooldown:0;
  }
  if(a.dashExpires&&now>=a.dashExpires)a.dashReady=a.dashExpires=0;
  if(a.reviveAt&&now>=a.reviveAt) {
    a.reviveAt=0;if(matchReviveEntity(e)){const refill=Math.min(weaponDef(bot.weapon).mag-bot.clip,bot.reserve);bot.clip+=refill;bot.reserve-=refill;}
    else {a.intangibleUntil=a.deadline=a.lockUntil=0;}
  }
  if(a.resTarget&&(e.hp<=0||e.suppressedUntil>now)) {a.resTarget.revivingUntil=0;a.resTarget.reviveCaster=null;a.resTarget=null;}
  if(a.resTarget&&!a.resTarget.revivingUntil)a.resTarget=null;
  if(a.deadline&&now>=a.deadline&&e.hp>0){e.hp=0;a.deadline=0;a.deathCause='ult-expired';matchEntityDied(e,null,{cause:'ult-expired'});}
  if(bot.ghost) {
    const ghost=bot.ghost,active=a.reviveAt>0||a.intangibleUntil>0&&now<a.intangibleUntil+cfg.X.reequip;
    ghost.root.setEnabled(active);bot.root.setEnabled(!active);
    if(active){ghost.root.position.copyFrom(e.position).y+=ghost.offset;ghost.root.rotation.y=bot.root.rotation.y;
      const phase=a.reviveAt>now?'intro':now<a.intangibleUntil?'idle':'outro',group=ghost.groups.get(phase);group?.goToFrame(agentFrame(group,phase==='outro'?now-a.intangibleUntil:now-a.reviveStarted,phase==='idle'));}
  }
  if(e.hp>0&&a.overhealUntil) {
    if(now<a.overhealUntil){const add=Math.min(a.overhealRemaining,cfg.C.healRate*dt,Math.max(0,150-e.hp-e.armor-e.overheal));e.overheal+=add;a.overhealRemaining-=add;}
    else {e.overheal=Math.max(0,e.overheal-cfg.C.decayRate*dt);if(!e.overheal)a.overhealUntil=0;}
    e.overheal=Math.min(e.overheal,Math.max(0,150-e.hp-e.armor));
  }
  if(a.action&&now>=a.action.start+a.action.duration){a.action=null;if(bot.held){agentLayerDispose(bot.held);bot.held=null;}}
  bot.gun?.root.setEnabled(e.hp>0&&now>=a.lockUntil&&!a.knives);
  matchBotKnifePose(bot,now);
  matchBotSkillThink(bot,now);
}
function matchBotKnifePose(bot,now) {
  // Shared bodySkillProps updates the world knives after posing the hands.
  bot.knifeRig?.setEnabled(false);
}
function matchBotKnife(bot,now) {
  const a=bot.ability,cfg=agentConfig(bot.entity).X,target=bot.target;
  if(!a.knives||!target||target.hp<=0||now<a.lockUntil||now<a.knifeAt||now-bot.seenAt<window.GAME_CONFIG.match.bots.reactionTime)return;
  a.knives--;a.knifeAt=now+cfg.interval;matchBotAction(bot,'X_fire',cfg.interval);
  const from=bot.entity.position.add(new BABYLON.Vector3(0,1.55,0)),aim=matchMemberPoint(target).add(new BABYLON.Vector3(0,1.1,0));
  const direction=aim.subtract(from).normalize(),spread=Math.tan(window.GAME_CONFIG.match.bots.aimSpread*Math.PI/180);
  direction.addInPlace(new BABYLON.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread,0)).normalize();
  const ray=new BABYLON.Ray(from,direction,1000),world=abilityWorldPick(ray),hit=matchRayMember(ray,bot.member),length=Math.min(world?.distance??1000,hit?.distance??1000);
  agentKnifeFlight(ray,from.add(direction.scale(length)),a.knives,false,bot.entity);
  if(world?.pickedMesh.metadata?.abilitySolid&&world.distance<=(hit?.distance??Infinity))agentDamageWall(world.pickedMesh,50);
  else if(hit&&(!world||hit.distance<world.distance)) {
    const friendly=hit.member.team===bot.member.team;bot.pendingKillSource={knife:true};combatDamage(hit.member.entity,cfg.damage[{head:0,body:1,leg:2}[hit.zone]]*(friendly?1/3:1),bot.entity,{zone:hit.zone,weapon:'Melee'});
    if(hit.member.hp<=0)matchEntityDied(hit.member.entity,bot.entity,{knife:true});
    bot.pendingKillSource=null;
  }
}
