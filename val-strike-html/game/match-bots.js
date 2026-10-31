const botAssets=new Map();
async function matchPrepareBotAssets(roster,mode) {
  for(const name of new Set(roster.map(p=>p.agent))) {
    const code=window.GAME_CONFIG['playable-agents'][name].code;
    if(!botAssets.has(name))botAssets.set(name,await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',code+'-body.glb?v=28',scene));
    for(const view of ['body','arms']) {
      const key=name+'_'+view+'_animations';
      if(!botAssets.has(key))botAssets.set(key,await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/',code+'-'+view+'-animations.glb?v=48',scene));
    }
  }
  for(const name of ['classic','vandal','spike','defuser'])if(!botAssets.has('prop_'+name)) {
    botAssets.set('prop_'+name,await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/',name+'.glb?v=48',scene));
  }
  if(mode==='unrated')await matchPrepareAbilityAssets(roster);
}
function matchProp(name,parent,size) {
  const source=botAssets.get('prop_'+name.toLowerCase());if(!source)return null;
  const instance=source.instantiateModelsToScene(n=>'match_prop_'+n,false,{doNotInstantiate:true});
  const root=new BABYLON.TransformNode('match_prop_'+name,scene);instance.rootNodes.forEach(n=>n.parent=root);
  instance.animationGroups.forEach(g=>{g.start(false);g.pause();g.goToFrame(g.from);});
  const weapon=root.getDescendants().some(n=>n.name.endsWith('world_weapon_bind'));
  if(weapon&&parent) {
    // WeaponMaster already carries the agent coordinate conversion and scale.
    // Cancel the GLTF standalone root so the original GN socket fits the hand.
    for(const node of instance.rootNodes){node.scaling.setAll(1);node.rotation.setAll(0);if(node.rotationQuaternion)node.rotationQuaternion.copyFrom(BABYLON.Quaternion.Identity());node.position.setAll(0);}
  } else {
    if(weapon)root.scaling.setAll(.01);
    const bounds=root.getHierarchyBoundingVectors(true),extent=bounds.max.subtract(bounds.min),scale=size/Math.max(extent.x,extent.y,extent.z,.001);
    root.scaling.scaleInPlace(scale);root.position.copyFrom(bounds.min.add(bounds.max).scale(-.5*scale));
  }
  const anchor=new BABYLON.TransformNode('match_prop_anchor_'+name,scene);root.parent=anchor;anchor.parent=parent;
  anchor.metadata={sharedAsset:true,boneSpace:weapon&&!!parent};root.getChildMeshes().forEach(m=>{m.isPickable=false;m.metadata={matchProp:true};});
  anchor.onDisposeObservable.add(()=>{instance.animationGroups.forEach(g=>g.dispose());instance.skeletons.forEach(s=>s.dispose());});
  return {root:anchor,groups:instance.animationGroups,rest:new Map(root.getDescendants().map(n=>[n,{position:n.position.clone(),rotation:n.rotationQuaternion?.clone()}]))};
}
function matchCreateBot(member,index) {
  const entity={member,matchBot:true,id:index,hp:100,armor:0,team:member.team==='a'?'ally':'enemy',
    position:BABYLON.Vector3.Zero(),meshes:[],forward:BABYLON.Vector3.Forward(),agentKillReported:false};
  member.entity=entity;
  const actor={feet:entity.position,velocity:BABYLON.Vector3.Zero(),crouching:false};
  const instance=botAssets.get(member.agent).instantiateModelsToScene(n=>'bot_'+index+'_'+n,false,{doNotInstantiate:true});
  const root=new BABYLON.TransformNode('bot_'+index,scene);instance.rootNodes.forEach(n=>n.parent=root);
  const groups=new Map();
  const keep=new Set(['Idle_LB','Idle_UB','CrouchIdle_LB','Jump_LB','JumpLand_LB','DeathSplat','gun_Classic_idle_UB','gun_Classic_reload_UB','gun_Vandal_idle_UB','gun_Vandal_reload_UB']);
  for(const prefix of ['Run','Walk','CrouchWalk'])for(const direction of ['N','NE','E','SE','S','SW','W','NW'])keep.add(prefix+direction+'_LB');
  for(const slot of ['C','Q','E','X'])for(const action of ['cast','equip','fire'])keep.add(slot+'_'+action+'_UB');
  for(const name of Object.keys(weaponDefs()))for(const action of ['idle','reload','fire','firealt'])keep.add('gun_'+name+'_'+action+'_UB');
  const labels=[...keep].sort((a,b)=>b.length-a.length);
  instance.animationGroups.forEach(g=>{const label=labels.find(n=>g.name.endsWith(n));if(label){g.start(false);g.pause();groups.set(label,g);}else g.dispose();});
  groups.get('Idle_LB')?.goToFrame(0);groups.get('Idle_UB')?.goToFrame(0);
  const bounds=root.getHierarchyBoundingVectors(true),scale=1.8/(bounds.max.y-bounds.min.y||1);root.scaling.setAll(scale);
  const offset=-bounds.min.y*scale;
  root.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;mesh.metadata={matchBotVisual:true};});
  const hitRoot=new BABYLON.TransformNode('bot_hit_'+index,scene);
  for(const [zone,h,y,w] of [['head',.3,1.65,.3],['body',.75,1.125,.55],['leg',.75,.375,.4]]) {
    const m=BABYLON.MeshBuilder.CreateBox('bot_hit_'+index+'_'+zone,{width:w,height:h,depth:.4},scene);
    m.parent=hitRoot;m.position.y=y;m.isVisible=false;m.isPickable=true;m.metadata={target:entity,zone};entity.meshes.push(m);
  }
  const badge=BABYLON.MeshBuilder.CreateTorus('bot_team_'+index,{diameter:.75,thickness:.035,tessellation:16},scene);
  badge.material=agentLuminousMaterial('bot_team_mat_'+index,member.team==='a'?'#65E8CD':'#FF647D');badge.isPickable=false;
  const bot={member,entity,actor,root,hitRoot,badge,groups,instance,offset,path:[],nextThink:0,nextShot:0,clip:12,reserve:36,reloadUntil:0,goal:null,state:'patrol',seenAt:0,lastSeen:null};
  const nodes=root.getDescendants();bot.hand=nodes.find(n=>n.name.endsWith('R_WeaponPoint'))||nodes.find(n=>n.name.endsWith('R_Hand'));
  const nodeMap=new Map(nodes.map(n=>[n.name.replace('bot_'+index+'_',''),n]));
  bot.nodes=nodeMap;
  bot.extraGroups=matchRetargetAnimations(botAssets.get(member.agent+'_body_animations'),nodeMap,groups,'bot_'+index+'_');
  entity.bot=bot;return bot;
}
function matchBotSpawn(bot,point) {
  bot.channelProp?.root.dispose();bot.channelProp=null;bot.knifeRig?.dispose();bot.knifeRig=null;
  const e=bot.entity;e.position.copyFrom(point);e.hp=100;e.agentKillReported=false;e.respawnAt=0;e.revivingUntil=0;e.reviveCaster=null;e.decay=null;e.suppressedUntil=0;e.lastDamageAt=-Infinity;
  const carriedArmor=bot.member.armor||0;
  combatEquipArmor(e,bot.member.armorType||'none');e.armor=carriedArmor;
  const def=weaponDef(bot.member.inventory.primary||'Classic');bot.weapon=bot.member.inventory.primary||'Classic';
  bot.gun?.root.dispose();bot.gun=null;
  if(bot.hand) {
    bot.gun=matchProp(bot.weapon,bot.hand,bot.weapon==='Classic'?.24:.8);
    if(bot.gun&&!bot.gun.root.metadata.boneSpace){bot.hand.computeWorldMatrix(true);const scale=bot.hand.absoluteScaling;
      bot.gun.root.scaling.set(1/Math.max(.00001,Math.abs(scale.x)),1/Math.max(.00001,Math.abs(scale.y)),1/Math.max(.00001,Math.abs(scale.z)));}
  }
  bot.clip=def.mag;bot.reserve=def.reserveMax;bot.reloadUntil=0;bot.actor.velocity.setAll(0);bot.path=[];bot.goal=null;bot.state='patrol';bot.target=null;
  bot.actor.crouching=false;bot.nextThink=0;bot.nextShot=0;bot.repathAt=0;bot.plannedGoal=null;
  bot.routeSeed=Math.random()*10000;bot.blockedEdges=new Map();bot.blockedNodes=new Map();bot.history=[];bot.progressPosition=point.clone();bot.progressAt=agentNow();bot.recoveries=0;bot.recoverUntil=0;bot.routeFrom=matchState.nav.nearest(point);
  const teamBots=matchState.bots.filter(b=>b.member.team===bot.member.team),rank=teamBots.indexOf(bot);
  const siteCount=Math.max(1,matchState.sites.length);bot.siteIndex=(Math.max(0,rank)+(matchState.rules.round%siteCount))%siteCount;
  bot.patrolGoal=null;bot.repositionAt=0;bot.crouchUntil=0;bot.escapePoint=null;
  e.damageLedger=new Map();e.overheal=0;bot.poseAt=0;bot.jumpAt=0;bot.lastShotAt=-Infinity;
  bot.root.setEnabled(true);bot.hitRoot.setEnabled(true);e.meshes.forEach(m=>m.setEnabled(true));bot.badge.setEnabled(true);
  matchBotPose(bot,agentNow());
}
function matchBotPose(bot,now) {
  const e=bot.entity,moving=bot.actor.velocity.lengthSquared()>.2;
  bot.root.position.copyFrom(e.position).y+=bot.offset;bot.hitRoot.position.copyFrom(e.position);
  for(const mesh of e.meshes) {
    const zone=mesh.metadata.zone;
    mesh.position.y=zone==='head'?(bot.actor.crouching?1.15:1.65):zone==='body'?(bot.actor.crouching?.8:1.125):.375;
    mesh.scaling.y=zone==='body'&&bot.actor.crouching?2/3:1;
  }
  bot.root.rotation.y=Math.atan2(e.forward.x,e.forward.z);bot.hitRoot.rotation.y=bot.root.rotation.y;
  bot.badge.position.copyFrom(e.position).y+=.04;
  const velocity=bot.actor.velocity,yaw=bot.root.rotation.y,localX=velocity.x*Math.cos(yaw)-velocity.z*Math.sin(yaw),localZ=velocity.x*Math.sin(yaw)+velocity.z*Math.cos(yaw);
  const sector=((Math.atan2(localX,localZ)+Math.PI*2)%(Math.PI*2))/(Math.PI/4),directions=['N','NE','E','SE','S','SW','W','NW'],index=Math.floor(sector),blend=sector-index;
  const airborne=Math.abs(velocity.y)>.1,prefix=bot.actor.crouching?'CrouchWalk':'Run';
  const channel=matchState.rules.spike.channel?.actor===bot.member?matchState.rules.spike.channel:null;
  const dash=bot.ability?.dashUntil>now,lowerName=e.hp<=0?'DeathSplat':channel?channel.kind+'_LB':dash?'E_cast_LB':airborne?'Jump_LB':moving?prefix+directions[index]+'_LB':bot.actor.crouching?'CrouchIdle_LB':'Idle_LB';
  const lower=bot.groups.get(lowerName)||bot.groups.get('Idle_LB'),second=e.hp>0&&!channel&&!dash&&!airborne&&moving?bot.groups.get(prefix+directions[(index+1)%8]+'_LB'):null;
  if(channel&&lower)lower.goToFrame(channel.kind==='plant'?lower.from+(lower.to-lower.from)*Math.min(1,(now-channel.start)/window.GAME_CONFIG.rounds.plantDuration):agentFrame(lower,now-channel.start));
  else
  if(lower){if(!second)lower.goToFrame(agentFrame(lower,now-(bot.deathAt||0),e.hp>0));else{const pose=agentPoseSnapshot(lower,agentFrame(lower,now-(bot.deathAt||0),e.hp>0));
    if(second){const other=agentPoseSnapshot(second,agentFrame(second,now));for(const [node,value] of pose){const b=other.get(node);if(!b)continue;BABYLON.Vector3.LerpToRef(value.position,b.position,blend,node.position);if(value.rotation&&b.rotation)BABYLON.Quaternion.SlerpToRef(value.rotation,b.rotation,blend,node.rotationQuaternion);}}}}
  const slot=bot.remote?bot.member.skill:bot.ability?.knives?'X':null;
  const presentation={visible:e.hp>0&&!bot.ghost?.root.isEnabled(),agent:bot.member.agent,hp:e.hp,slot,knives:bot.ability?.knives,action:bot.ability?.action||bot.bodyAction,weapon:bot.weapon,reloading:bot.reloadUntil>now,reloadStarted:bot.reloadStarted,ads:bot.member.ads,crouching:bot.actor.crouching,yaw,pitch:bot.pitch||0};
  if(e.hp>0&&!channel)bodyUpperPose(bot,presentation,now);
  if(e.hp>0&&channel){const group=bodyClip(bot.groups,channel.kind);if(group)group.goToFrame(channel.kind==='plant'?group.from+(group.to-group.from)*Math.min(1,(now-channel.start)/window.GAME_CONFIG.rounds.plantDuration):agentFrame(group,now-channel.start));}
  bodySkillProps(bot,presentation,now);
  if(bot.gun)bodyWeaponPose(bot.gun,bot.reloadUntil>now,now-bot.reloadStarted,bot.ability?.action||bot.bodyAction,now);
}
function matchBotCanTraverse(from,to) {
  const mov=window.GAME_CONFIG.movement,delta=to.subtract(from),length=delta.length();
  if(length<.04)return true;
  const direction=delta.scale(1/length);
  for(const y of [mov.stepHeight+.03,1,mov.standingHeight-.03])for(const side of [-mov.playerRadius,0,mov.playerRadius]) {
    const offset=new BABYLON.Vector3(direction.z*side,y,-direction.x*side);
    if(worldPick(from.add(offset),direction,length))return false;
  }
  let floor=from.y;
  for(let i=1,count=Math.max(1,Math.ceil(length/.2));i<=count;i++) {
    const sample=BABYLON.Vector3.Lerp(from,to,i/count);sample.y=floor;
    const height=actorFloorAt(sample,mov.stepHeight+.28,worldPick,mov);
    if(height===null||Math.abs(height-floor)>mov.stepHeight+.04)return false;floor=height;
  }
  return Math.abs(floor-to.y)<.25;
}
function matchBotNearbyGoal(bot,center,radius) {
  const nav=matchState.nav,candidates=[];
  nav.nodes.forEach((n,id)=>{const d=BABYLON.Vector3.DistanceSquared(n,center);if(d>1&&d<radius*radius&&Math.abs(n.y-center.y)<.6)candidates.push(id);});
  if(!candidates.length)return center.clone();
  return nav.nodes[candidates[Math.floor(Math.random()*candidates.length)]].clone();
}
function matchBotEscape(bot) {
  const mov=window.GAME_CONFIG.movement,position=bot.entity.position,candidates=[];
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4+bot.routeSeed,point=position.add(new BABYLON.Vector3(Math.sin(angle)*.7,0,Math.cos(angle)*.7));
    const floor=worldPick(point.add(new BABYLON.Vector3(0,mov.stepHeight+.03,0)),BABYLON.Vector3.Down(),mov.stepHeight+.28,true);
    if(floor&&matchBotCanTraverse(position,floor.pickedPoint))candidates.push(floor.pickedPoint.clone());
  }
  return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
}
function matchBotPlan(bot,now) {
  const nav=matchState.nav,cfg=window.GAME_CONFIG.match.bots;
  if(!bot.goal||now<bot.repathAt)return;
  if(bot.path.length&&bot.plannedGoal&&BABYLON.Vector3.DistanceSquared(bot.plannedGoal,bot.goal)<1)return;
  for(const [edge,until] of bot.blockedEdges)if(now>=until)bot.blockedEdges.delete(edge);
  for(const [id,until] of bot.blockedNodes)if(now>=until)bot.blockedNodes.delete(id);
  // A graph node can be close but across a corner. Pick a physically reachable entry.
  const anchors=nav.nodes.map((n,id)=>({id,d:BABYLON.Vector3.DistanceSquared(n,bot.entity.position)})).filter(a=>a.d<9).sort((a,b)=>a.d-b.d).slice(0,12);
  const anchor=anchors.find(a=>matchBotCanTraverse(bot.entity.position,nav.nodes[a.id]));
  if(!anchor){bot.repathAt=now+cfg.thinkInterval;return;}
  const seed=bot.routeSeed;
  const path=nav.path(nav.nodes[anchor.id],bot.goal,(a,b)=>{
    if(bot.blockedEdges.has(a+':'+b)||bot.blockedNodes.has(b))return false;
    if(!agentState.solidWorld)return true;
    const from=nav.nodes[a].add(new BABYLON.Vector3(0,.9,0)),delta=nav.nodes[b].subtract(nav.nodes[a]);
    return !abilitySolidPick(new BABYLON.Ray(from,delta.normalizeToNew(),delta.length()+.35));
  },(_,b)=>{const n=nav.nodes[b];return 1+.8*(1+Math.sin(n.x*.12+seed)*Math.cos(n.z*.12-seed));});
  bot.path=path;bot.routeFrom=anchor.id;
  if(BABYLON.Vector3.DistanceSquared(bot.entity.position,nav.nodes[anchor.id])>.09)bot.path.unshift(anchor.id);
  bot.plannedGoal=bot.goal.clone();bot.repathAt=now+cfg.repathInterval;
  if(!bot.path.length&&BABYLON.Vector3.DistanceSquared(bot.goal,bot.entity.position)>1){bot.patrolGoal=null;bot.routeSeed=Math.random()*10000;}
}
function matchBotThink(bot,now) {
  const s=matchState,cfg=window.GAME_CONFIG.match.bots,e=bot.entity,p=bot.member;
  if(now<bot.recoverUntil){bot.target=null;bot.actor.crouching=false;bot.state='recover';return;}
  const opponents=s.rules.members.filter(m=>m!==p&&(s.mode==='deathmatch'||m.team!==p.team)&&m.hp>0);
  let target=null,nearest=cfg.sightRange;
  const eye=e.position.add(new BABYLON.Vector3(0,1.55,0));
  for(const enemy of opponents) {
    const position=matchMemberPoint(enemy).add(new BABYLON.Vector3(0,1.1,0)),distance=BABYLON.Vector3.Distance(eye,position);
    if(distance<nearest&&agentLOS(eye,position,true)){target=enemy;nearest=distance;}
  }
  if(target!==bot.target){bot.seenAt=now;bot.target=target;bot.repositionAt=now;bot.crouchUntil=now+cfg.crouchBurstDuration;}
  if(target){
    bot.state='engage';bot.lastSeen=matchMemberPoint(target).clone();
    if(now>=bot.repositionAt){bot.goal=matchBotNearbyGoal(bot,e.position,3);bot.repositionAt=now+cfg.combatReposition;bot.plannedGoal=null;bot.repathAt=0;}
    matchBotPlan(bot,now);return;
  }
  bot.actor.crouching=false;
  if(s.mode==='deathmatch') {
    bot.state='patrol';if(!bot.goal||!bot.path.length||BABYLON.Vector3.DistanceSquared(bot.goal,e.position)<2)bot.goal=s.nav.nodes[Math.floor(Math.random()*s.nav.nodes.length)];
  } else {
    const spike=s.rules.spike,attacking=p.team===s.rules.attacking;
    if(attacking) {
      bot.state=spike.state==='planted'?'defend':'push';
      const center=spike.state==='planted'?BABYLON.Vector3.FromArray(spike.position):s.sites[bot.siteIndex].position;
      if(spike.state==='dropped')bot.goal=BABYLON.Vector3.FromArray(spike.position);
      else if(spike.carrier===p)bot.goal=center;
      else {
        if(!bot.patrolGoal||BABYLON.Vector3.DistanceSquared(bot.patrolGoal,e.position)<1||bot.objectiveState!==spike.state)bot.patrolGoal=matchBotNearbyGoal(bot,center,cfg.sitePatrolRadius);
        bot.goal=bot.patrolGoal;
      }
    } else {
      bot.state=spike.state==='planted'?'defuse':'defend';
      if(spike.state==='planted')bot.goal=BABYLON.Vector3.FromArray(spike.position);
      else {if(!bot.patrolGoal||BABYLON.Vector3.DistanceSquared(bot.patrolGoal,e.position)<1||bot.objectiveState!==spike.state)bot.patrolGoal=matchBotNearbyGoal(bot,s.sites[bot.siteIndex].position,cfg.sitePatrolRadius);bot.goal=bot.patrolGoal;}
    }
    bot.objectiveState=spike.state;
  }
  matchBotPlan(bot,now);
}
function matchBotFire(bot,now) {
  if(bot.ability?.knives){matchBotKnife(bot,now);return;}
  if(now<(bot.ability?.lockUntil||0)||now<(bot.ability?.intangibleUntil||0))return;
  if(now<bot.reloadUntil)return;
  const target=bot.target;if(!target||target.hp<=0||now-bot.seenAt<window.GAME_CONFIG.match.bots.reactionTime||now<bot.nextShot)return;
  const def=weaponDef(bot.weapon);if(!bot.clip){if(bot.reserve){bot.reloadStarted=now;bot.reloadUntil=now+def.reloadTime;}return;}
  bot.clip--;bot.nextShot=now+1000/def.fireRate;bot.lastShotAt=now;
  bot.bodyAction={name:'gun_'+bot.weapon+'_fire',start:now,duration:Math.min(160,1000/def.fireRate)};
  const eye=bot.entity.position.add(new BABYLON.Vector3(0,bot.actor.crouching?1.2:1.55,0)),aim=matchMemberPoint(target).add(new BABYLON.Vector3(0,1.1,0));
  const direction=aim.subtract(eye);const distance=direction.length();direction.normalize();
  const mov=window.GAME_CONFIG.movement,max=mov.speedByWeaponClass[mov.classByWeapon[bot.weapon]||'pistol'];
  const speedPct=Math.hypot(bot.actor.velocity.x,bot.actor.velocity.z)/max;
  const degrees=window.GAME_CONFIG.match.bots.aimSpread+(def.spread?.firstShot||0)+(speedPct>mov.deadzonePct?mov.runSpread:0);
  const r=Math.tan(degrees*Math.PI/180)*Math.sqrt(Math.random()),angle=Math.random()*Math.PI*2;
  direction.addInPlace(new BABYLON.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,0)).normalize();
  const ray=new BABYLON.Ray(eye,direction,1000),hit=matchRayMember(ray,bot.member);
  if(hit) {
    const penetration=combatPenetration(ray,hit.distance,def);
    if(penetration.factor>0){const friendly=matchState.mode==='unrated'&&hit.member.team===bot.member.team;
      combatDamage(hit.member.entity,weaponDamageAt(def,hit.distance,hit.zone)*penetration.factor*(friendly?1/3:1),bot.entity,{zone:hit.zone,weapon:bot.weapon});
      if(hit.member.entity===VS.player){playerController.tag();uiHUDUpdate();}
      if(hit.member.hp<=0)matchEntityDied(hit.member.entity,bot.entity);
    }
  }
  const end=hit?eye.add(direction.scale(hit.distance)):eye.add(direction.scale(Math.min(distance,40)));
  const line=BABYLON.MeshBuilder.CreateLines('bot_tracer',{points:[eye,end]},scene);line.color=new BABYLON.Color3(1,.75,.45);line.isPickable=false;
  matchState.tracers.push({mesh:line,until:now+70});
}
function matchBotsUpdate(dt,now) {
  const s=matchState,mov=window.GAME_CONFIG.movement,cfg=window.GAME_CONFIG.match.bots;
  for(const bot of s.bots) {
    const e=bot.entity;
    if(s.mode==='unrated')matchBotAbilityUpdate(bot,dt,now);
    if(e.hp<=0) {
      if(s.mode==='deathmatch'&&now>=(e.respawnAt||Infinity))matchRespawnDM(bot.member);
      else matchBotPose(bot,now);
      continue;
    }
    // Sage revival can make a previously dead bot active without a round reset.
    if(bot.member.deathReported){bot.member.deathReported=false;bot.root.setEnabled(true);bot.badge.setEnabled(true);bot.hitRoot.setEnabled(true);e.meshes.forEach(m=>m.setEnabled(true));}
    if(bot.reloadUntil&&now>=bot.reloadUntil){const take=Math.min(weaponDef(bot.weapon).mag-bot.clip,bot.reserve);bot.clip+=take;bot.reserve-=take;bot.reloadUntil=0;}
    if(now>=bot.nextThink){matchBotThink(bot,now);bot.nextThink=now+window.GAME_CONFIG.match.bots.thinkInterval;}
    let wish=BABYLON.Vector3.Zero();
    if(bot.escapePoint&&(now>=bot.recoverUntil||BABYLON.Vector3.DistanceSquared(bot.escapePoint,e.position)<.08))bot.escapePoint=null;
    // Consume reached waypoints without inserting a stationary frame each time.
    while(bot.path.length) {
      const point=s.nav.nodes[bot.path[0]],delta=point.subtract(e.position);
      if(Math.hypot(delta.x,delta.z)>=.3||Math.abs(delta.y)>.35)break;
      bot.routeFrom=bot.path.shift();bot.history.push(bot.routeFrom);if(bot.history.length>12)bot.history.shift();
    }
    if(bot.escapePoint){wish=bot.escapePoint.subtract(e.position);wish.y=0;wish.normalize();e.forward.copyFrom(wish);}
    else if(bot.target) {
      const direction=matchMemberPoint(bot.target).subtract(e.position);direction.y=0;direction.normalize();e.forward.copyFrom(direction);
      bot.actor.crouching=now<bot.crouchUntil;
      if(!bot.actor.crouching&&bot.path.length){wish=s.nav.nodes[bot.path[0]].subtract(e.position);wish.y=0;wish.normalize();}
      matchBotFire(bot,now);
    } else if(bot.path.length) {
      const point=s.nav.nodes[bot.path[0]],direction=point.subtract(e.position);direction.y=0;
      wish=direction.normalize();e.forward.copyFrom(wish);
    }
    if(s.mode==='unrated') {
      const spike=s.rules.spike,at=spike.position&&BABYLON.Vector3.Distance(e.position,BABYLON.Vector3.FromArray(spike.position));
      if(spike.state==='dropped')s.rules.pickup(bot.member,at);
      const kind=bot.member.team===s.rules.attacking?'plant':'defuse',valid=kind==='plant'?s.sites.some(site=>matchAtSite(e.position,site)):spike.state==='planted'&&at<2.5;
      if(!bot.target&&valid&&now>=(bot.ability?.lockUntil||0)&&s.rules.beginChannel(bot.member,kind,now,true,e.position.asArray()))wish.setAll(0);
      if(spike.channel?.actor===bot.member&&(bot.target||!valid))s.rules.cancelChannel();
    }
    const ability=bot.ability;
    let speed=mov.speedByWeaponClass[mov.classByWeapon[bot.weapon]||'pistol']*(bot.actor.crouching?mov.crouchMultiplier:1)*agentSpeedMultiplier(e.position,e);
    if(ability?.dashUntil>now){wish.copyFrom(ability.dashDirection);speed=agentConfig(e).E.speed;bot.actor.velocity.x=wish.x*speed;bot.actor.velocity.z=wish.z*speed;}
    if(now<(ability?.lockUntil||0)&&ability?.resTarget){wish.setAll(0);bot.actor.velocity.x=bot.actor.velocity.z=0;}
    const edge=bot.path.length?s.nav.data.offMeshEdges?.[bot.routeFrom+':'+bot.path[0]]:null;
    if(edge?.jump&&Math.abs(bot.actor.velocity.y)<.05&&now>=bot.jumpAt&&BABYLON.Vector3.DistanceSquared(e.position,s.nav.nodes[bot.path[0]])<2.5){bot.actor.velocity.y=mov.jumpSpeed;bot.jumpAt=now+800;}
    // Probe the next center before strafing: never deliberately step into Abyss.
    const candidate=e.position.add(wish.scale(speed*dt));
    if(bot.actor.velocity.y<=0&&!edge?.drop&&actorFloorAt(candidate,mov.stepHeight+.5,worldPick,mov)===null)wish.setAll(0);
    const channeling=s.rules.spike?.channel?.actor===bot.member;
    matchBotChannelProp(bot,channeling?s.rules.spike.channel:null,now);
    if(channeling){wish.setAll(0);bot.actor.velocity.x=bot.actor.velocity.z=0;}
    actorStep(bot.actor,wish.scale(speed),dt,worldPick,mov);
    const needsProgress=bot.escapePoint||bot.path.length||bot.goal&&BABYLON.Vector3.DistanceSquared(bot.goal,e.position)>1;
    if(channeling||ability?.resTarget&&now<ability.lockUntil||!needsProgress||bot.actor.crouching||BABYLON.Vector3.DistanceSquared(bot.progressPosition,e.position)>cfg.stuckDistance**2) {
      bot.progressPosition.copyFrom(e.position);bot.progressAt=now;
    } else if(now-bot.progressAt>=cfg.stuckTimeout) {
      const blocked=bot.path[0],until=now+cfg.blockedEdgeDuration;
      if(blocked!==undefined){bot.blockedEdges.set(bot.routeFrom+':'+blocked,until);
        if(blocked!==s.nav.nearest(e.position))bot.blockedNodes.set(blocked,until);}
      bot.recoveries++;bot.routeSeed=Math.random()*10000;bot.actor.crouching=false;bot.actor.velocity.setAll(0);
      bot.path=[];bot.plannedGoal=null;bot.repathAt=0;bot.repositionAt=0;bot.progressAt=now;bot.nextThink=0;
      // Backtrack through recently traversed floor before trying a different route.
      const retreat=[...bot.history].reverse().find(id=>BABYLON.Vector3.DistanceSquared(s.nav.nodes[id],e.position)>.5&&matchBotCanTraverse(e.position,s.nav.nodes[id]));
      if(retreat!==undefined){bot.path=[retreat];bot.recoverUntil=now+700;bot.target=null;}
      else {bot.escapePoint=matchBotEscape(bot);bot.patrolGoal=null;bot.recoverUntil=now+700;bot.target=null;}
    }
    if(e.position.y<-30){e.hp=0;matchEntityDied(e,null,{cause:'fall'});}
    matchBotPose(bot,now);
  }
  for(let i=s.tracers.length-1;i>=0;i--)if(now>=s.tracers[i].until){s.tracers[i].mesh.dispose();s.tracers.splice(i,1);}
}
function matchDisposeBot(bot) {
  bodyDisposeProps(bot);
  bot.ghost?.root.dispose();if(bot.held)agentLayerDispose(bot.held);
  bot.instance.animationGroups.forEach(g=>g.dispose());bot.instance.skeletons.forEach(s=>s.dispose());
  bot.extraGroups?.forEach(g=>g.dispose());bot.channelProp?.root.dispose();bot.knifeRig?.dispose();
  bot.root.dispose();bot.hitRoot.dispose();bot.badge.dispose(false,true);
}
