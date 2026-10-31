const netMatch={client:null,active:false,starting:false,latest:null,packets:[],actors:new Map(),effects:new Map(),projectiles:new Map(),drops:new Map(),inputSeq:0,nextInput:0,version:0,lastRound:0,events:[],seenEvent:0,applying:false,history:new Map(),correction:BABYLON.Vector3.Zero(),authoritative:false,inputAccumulator:0,lastPacketTick:-1};
function multiplayerActive(){return netMatch.active;}
function netMessage(text){document.getElementById('match-status').textContent=text;if(typeof uiToast==='function')uiToast(text);}
function netCommand(op,data){if(['ability','ping'].includes(op))data={yaw:camera.rotation.y,pitch:camera.rotation.x,...data};
  if(['switch','reload'].includes(op)&&netMatch.client?.connected){const seq=netMatch.weaponSeq=(netMatch.weaponSeq||0)+1;data={...data,weaponSeq:seq};netMatch.weaponIntent={seq,weapon:weaponState.current,reloading:weaponState.reloading,reloadUntil:weaponState.reloadUntil,equipUntil:weaponState.equipUntil,at:performance.now()};}
  return netMatch.client?.command(op,data)||Promise.resolve({ok:false});}
function netOwner(id){return matchState.rules?.members.find(p=>p.id===id)?.entity;}
function netInit(){
  if(!new URLSearchParams(location.search).has('room'))return;
  document.body.classList.add('network-match');
  const client=netMatch.client=window.GameEntry?.client||new VSNetwork();
  if(!VSAccount.room){location.replace('/play');return;}
  const status=document.createElement('div');status.id='net-status';status.style.cssText='position:absolute;right:16px;bottom:36px;z-index:8;color:#d4e8e4;font:12px GameDIN,GameInter,sans-serif;pointer-events:none';document.getElementById('game-container').appendChild(status);
  document.getElementById('match-practice')?.setAttribute('disabled','');
  for(const id of ['start-unrated','start-dm','stop-match']){const button=document.getElementById(id);if(button){button.disabled=true;button.hidden=true;}}
  client.on(data=>{
    if(data.type==='error'){netMessage(data.message);if(data.op==='resume')location.replace('/play');}
    if(data.type==='connection'){if(!data.connected){netMatch.motionReset=true;netMessage('Mất kết nối · thao tác đang hiển thị trên máy bạn, chờ đồng bộ…');}else netMessage('Đã kết nối server.');}
    if(data.type==='room'){
      if(data.room.phase==='lobby'){playerController.pause();netMatch.active=false;netMessage('Phòng đã trở về sảnh.');location.assign('/play');return;}
      if(!netMatch.active&&!netMatch.starting&&['loading','playing','complete'].includes(data.room.phase))netStart(data.room);
    }
    if(data.type==='snapshot'){if(netMatch.latest&&data.tick<netMatch.latest.tick)return;netMatch.latest=data;netMatch.packets.push({...data,received:performance.now()});if(netMatch.packets.length>24)netMatch.packets.shift();window.__renderOnce=true;}
    if(data.type==='event'){if(data.event.id>netMatch.seenEvent){netMatch.seenEvent=data.event.id;netMatch.events.push(data.event);}}
  });
  if(window.GameEntry?.client===client&&window.GameEntry.room)queueMicrotask(()=>netStart(window.GameEntry.room));
  else client.restore().catch(error=>netMessage(error.message));
  netInstallAuthority();scene.onBeforeRenderObservable.add(netFrame);scene.onAfterRenderObservable.add(netNameTags);
  scene.onDisposeObservable.add(()=>{client.close();netMatch.active=false;netMatch.actors.clear();netMatch.tags?.remove();});
  window.addEventListener('pagehide',()=>client.close(),{once:true});
}
async function netStart(room){
  netMatch.starting=true;matchState.loading=true;playerController.pause();
  try{
    if(!window.__weaponsReady){weaponInit();window.__weaponsReady=true;}
    const self=room.members.find(p=>p.id===netMatch.client.session.self);if(!self)throw Error('Không có người chơi của bạn trong phòng.');
    if(VS.player.agent!==self.agent)agentSelect(self.agent);
    await matchPrepareBotAssets(room.members.filter(p=>p.team!=='observer'),(room.gameMode||room.mode)==='deathmatch'?'deathmatch':'unrated');
    for(const name of Object.keys(weaponDefs()))if(!botAssets.has('prop_'+name.toLowerCase()))botAssets.set('prop_'+name.toLowerCase(),await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/',name.toLowerCase()+'.glb?v=48',scene));
    // Wait for first-person and complete skill assets rather than enabling a
    // round with missing hands/VFX. Existing loaders report real errors.
    const deadline=performance.now()+90000;
    while(!agentState.visualReady){if(window.__agentVisualStatus?.state==='failed')throw Error('Không tải được asset đặc vụ.');if(performance.now()>deadline)throw Error('Tải đặc vụ quá lâu.');await new Promise(r=>setTimeout(r,100));}
    matchStop(false);const s=matchState;s.active=false;s.mode=(room.gameMode||room.mode)==='deathmatch'?'deathmatch':'unrated';s.roomMode=room.mode;s.network=true;s.nav=new BotNavigation(await (await fetch(VSMaps.get(MAP_MODE).root+'match-navigation.json?v=53')).json());
    s.authoredLayout=window.GAME_CONFIG['map-layout'];s.rules=new MatchRules(window.GAME_CONFIG);s.rules.phase='select';s.rules.members=[];
    s.rules.spike={state:'none',position:null,carrier:null,channel:null};
    s.rules.sell=(p,item)=>{if(item.startsWith('ability:')){netCommand('sell',{kind:'skill',slot:item.slice(8)});return false;}return false;};
    for(const item of room.members){if(item.team==='observer'&&item.id!==self.id)continue;const p={...item,hp:item.team==='observer'?0:100,armor:0,credits:800,ult:0,ultCost:window.GAME_CONFIG['playable-agents'][item.agent].ultCost,kills:0,deaths:0,assists:0,inventory:{primary:null,secondary:'Classic',melee:'Melee'},bought:[],uiDamageRows:new Map()};
      if(p.id===self.id){p.entity=VS.player;s.human=p;}else{const actor=matchCreateBot(p,s.bots.length+1);s.bots.push(actor);netMatch.actors.set(p.id,actor);actor.remote=true;matchBotAbilitiesReset(actor,true);}
      s.rules.members.push(p);
    }
    s.sites=s.mode==='deathmatch'?[]:s.authoredLayout.sites.map(site=>({...site,position:BABYLON.Vector3.FromArray(site.position)}));matchCreateMarkers();matchRefreshTargets();
    for(const bot of s.bots){bot.entity.team=bot.member.team===self.team?'ally':'enemy';bot.badge.material.emissiveColor=BABYLON.Color3.FromHexString(bot.entity.team==='ally'?'#65E8CD':'#FF647D');}
    window.__matchTargets=self.team==='observer'?[]:s.bots.filter(b=>b.member.team!==s.human.team).map(b=>b.entity);agentState.allies=self.team==='observer'?[]:s.bots.filter(b=>b.member.team===s.human.team).map(b=>b.entity);
    for(const id of ['range-weapon','playable-agent','respawn-player']){const node=document.getElementById(id);if(node)node.disabled=true;}
    for(const id of ['agent-practice','match-roster','range-panel']){const node=document.getElementById(id);if(node)node.hidden=true;}
    s.active=true;netMatch.active=true;netMatch.authoritative=false;netMatch.version=-1;netMatch.lastRound=0;netMessage('Đã tải phòng '+room.id+' · chờ snapshot máy chủ.');netMatch.client.send({op:'loaded'});
  }catch(error){netMatch.active=false;matchStop(false);recordGameError(error);netMessage(error.message);}finally{netMatch.starting=false;matchState.loading=false;}
}
function netApplyPacket(packet){
  const s=matchState,r=s.rules,now=packet.time,self=packet.members.find(p=>p.id===s.human.id);if(!self)return;
  netMatch.inputSeq=Math.max(netMatch.inputSeq,self.inputSeq||0,self.receivedInputSeq||0);
  netMatch.shotSeq=Math.max(netMatch.shotSeq||0,self.shotAck||0);netMatch.weaponSeq=Math.max(netMatch.weaponSeq||0,self.weaponAck||0);
  netMatch.applying=true;
  try{
    window.__gameTime=Math.max(window.__gameTime||0,now);
    const roundChanged=packet.version!==netMatch.version,previousPhase=r.phase;
    Object.assign(r,packet.rules);if(s.mode==='deathmatch')s.dmEnd=r.until;const byID=new Map(r.members.map(p=>[p.id,p]));
    r.spike={...packet.rules.spike,carrier:byID.get(packet.rules.spike.carrier)||null,channel:packet.rules.spike.channel?{...packet.rules.spike.channel,actor:byID.get(packet.rules.spike.channel.actor)}:null};
    for(const state of packet.members){const p=byID.get(state.id);if(!p)continue;Object.assign(p,state);p.position=state.position;p.uiScore=(p.kills||0)*150;p.uiDamageRows=p.uiDamageRows||new Map();
      if(p===s.human)continue;const bot=netMatch.actors.get(p.id);if(!bot)continue;const e=bot.entity;Object.assign(e,{hp:state.hp,armor:state.armor,armorType:state.armorType,overheal:state.overheal,revivingUntil:state.resurrectAt||0});
      bot.actor.crouching=state.crouching;bot.actor.velocity.copyFromFloats(...state.velocity);bot.clip=state.reloading?0:1;bot.reloadUntil=state.reloading?now+1000:0;
      if(bot.weapon!==state.weapon){bot.gun?.root.dispose();bot.gun=null;bot.weapon=state.weapon;if(bot.hand){bot.gun=matchProp(state.weapon,bot.hand,state.weapon==='Classic'?.24:.8);if(bot.gun&&!bot.gun.root.metadata.boneSpace){bot.hand.computeWorldMatrix(true);const scale=bot.hand.absoluteScaling;bot.gun.root.scaling.set(1/Math.abs(scale.x||1),1/Math.abs(scale.y||1),1/Math.abs(scale.z||1));}}}
      if(state.skill&&bot.lastSkill!==state.skill&&bot.ability)bot.ability.action={name:state.skill+'_equip',start:now,duration:600};bot.lastSkill=state.skill;
      bot.hitRoot.setEnabled(state.hp>0);e.meshes.forEach(m=>m.setEnabled(state.hp>0));bot.badge.setEnabled(state.hp>0);
      if(bot.ability){bot.ability.reviveAt=state.resurrectAt||0;bot.ability.intangibleUntil=state.intangibleUntil||0;bot.ability.deadline=state.reviveDeadline||0;bot.ability.deathAt=state.deathAt??-Infinity;bot.ability.deathCause=state.deathCause;bot.ability.charges={...state.charges};bot.ability.knives=state.knives||0;bot.ability.lockUntil=state.skillLock||0;}
    }
    const motionState={...self,time:now,buyPhase:r.phase==='buy',movementBlocked:['end','complete'].includes(r.phase)||r.spike.channel?.actor===s.human,dashSpeed:agentConfig().E?.speed||18};
    const wasDead=VS.player.hp<=0;Object.assign(VS.player,{hp:self.hp,armor:self.armor,armorType:self.armorType,regenPool:self.regenPool,overheal:self.overheal,credits:self.credits,dead:self.hp<=0,lastDamageAt:self.lastDamageAt??-Infinity});
    Object.assign(agentState,{charges:{...self.charges},cooldowns:{...self.cooldowns},ult:self.ult,lockUntil:self.skillLock||0,deathAt:self.deathAt??-Infinity,deathCause:self.deathCause,resurrectAt:self.resurrectAt||0,intangibleUntil:self.intangibleUntil||0,revivedUntil:self.reviveDeadline||0,dashReady:self.dashReady||0,dashExpires:self.dashExpires||0,knives:self.knives||0});
    if(s.mode==='deathmatch')agentState.intangibleUntil=0;agentState.hasteUntil=self.hasteUntil||0;agentState.lastVictim=self.lastVictim!=null?{at:self.lastVictim,position:agentPosition()}:null;
    if(self.agent==='Jett'&&agentState.equipped==='X'&&!self.knives)agentCancelEquip();
    if(self.deathAt!=null&&self.hp<=0)agentState.deathPoint=BABYLON.Vector3.FromArray(self.position);
    weaponState.ammo=JSON.parse(JSON.stringify(self.ammo||{}));weaponState.loadout={...self.inventory};
    netMatch.pendingShots=(netMatch.pendingShots||[]).filter(shot=>shot.seq>(self.shotAck||0));
    for(const shot of netMatch.pendingShots){const ammo=weaponState.ammo[shot.weapon];if(ammo)ammo.clip=Math.max(0,ammo.clip-shot.cost);}
    if(roundChanged||wasDead&&self.hp>0||netMatch.motionReset){
      const position=BABYLON.Vector3.FromArray(self.position);
      if(![position.x,position.y,position.z].every(Number.isFinite)||position.y<-30||position.y>200)throw Error('Máy chủ gửi vị trí spawn không hợp lệ.');
      playerController.networkReset(motionState);if(roundChanged||wasDead&&self.hp>0)camera.rotation.set(self.pitch,self.yaw,0);netMatch.motionReset=false;netMatch.inputAccumulator=0;netMatch.history.clear();netMatch.correction.setAll(0);netMatch.authoritative=true;matchSpectatorStop();agentSetThirdPerson(false);agentCancelEquip();
    }
    else if(self.hp>0){playerController.networkReconcile(motionState);}
    const intent=netMatch.weaponIntent,intentPending=intent&&intent.seq>(self.weaponAck||0)&&performance.now()-intent.at<5000;
    if(!intentPending){if(weaponState.current!==self.weapon)weaponSwitch(self.weapon);weaponState.equipUntil=self.equipUntil||0;weaponState.reloading=!!self.reloadUntil;weaponState.reloadUntil=self.reloadUntil||0;netMatch.weaponIntent=null;}
    VS.player.ammo=weaponState.ammo[weaponState.current]||{};
    if(!wasDead&&self.hp<=0){agentCancelEquip();playerController.stop();if(self.agent==='Clove')agentSetThirdPerson(true);}
    if(roundChanged){netMatch.version=packet.version;netMatch.renderTime=null;netMatch.packets=netMatch.packets.filter(p=>p.version===packet.version);agentClearEffects();netMatch.effects.clear();netMatch.projectiles.clear();uiRoundStart();s.spawn=agentPosition();if(s.mode!=='deathmatch'&&self.team!=='observer')matchCreateBuyBoundaries();if(self.team==='observer'){agentSetThirdPerson(false);agentState.deathAt=-Infinity;matchSpectatorStart();}}
    s.barrier?.setEnabled(r.phase==='buy');if(previousPhase==='buy'&&r.phase!=='buy')uiCloseAll();
    if(uiState.shopOpen&&self.hp<=0)uiCloseAll();const shopKey=JSON.stringify(packet.members.map(p=>[p.inventory,p.credits,p.charges,p.armor,p.uiRequest,p.bought]));
    if(r.phase==='buy'&&previousPhase!==r.phase)matchBuildShop();if(uiState.shopOpen&&shopKey!==netMatch.shopKey){netMatch.shopKey=shopKey;uiBuildShop();}
    if(s.spikeMesh){s.spikeMesh.setEnabled(['planted','dropped'].includes(r.spike.state));if(r.spike.position)s.spikeMesh.position.copyFromFloats(...r.spike.position).y+=.18;}
    uiState.pings=packet.pings.map(p=>({...p,position:BABYLON.Vector3.FromArray(p.position)}));
    netSyncEffects(packet);netSyncDrops(packet);
    for(let i=0;i<s.orbs.length;i++){const orb=s.orbs[i],state=packet.orbs[i];orb.taken=!!state?.taken;orb.mesh.setEnabled(!orb.taken);}
    s.orbChannel=self.orbAt?{start:self.orbAt}:null;
    const rematch=document.getElementById('rematch-room');if(rematch)rematch.hidden=r.phase!=='complete'||packet.room.host!==s.human.id;
    VS.round.number=r.round;VS.round.phase=r.phase;VS.round.score=r.score;VS.round.timeLeft=Math.max(0,((r.spike.state==='planted'?r.spike.explodesAt:r.until)-now)/1000);
    matchUIUpdate();if(r.phase==='complete')netSaveResult(packet);
  }finally{netMatch.applying=false;}
}
function netSyncEffects(packet){
  for(const state of packet.effects){let effect=netMatch.effects.get(state.id);const owner=netOwner(state.owner);if(!owner)continue;
    if(!effect){const point=BABYLON.Vector3.FromArray(state.position),start=agentState.effects.length;
      if(state.type==='smoke')agentSmoke(point,state.radius,Math.max(1,state.expires-state.starts),Math.max(0,state.starts-agentNow()),owner);
      if(state.type==='slow'){const mesh=BABYLON.MeshBuilder.CreateDisc('slow_field',{radius:state.radius,tessellation:32},scene);mesh.position.copyFrom(point).y+=.03;mesh.rotation.x=Math.PI/2;mesh.isPickable=false;mesh.material=agentPatternMaterial('slow_floor','#387F85','#9CEAD2','sage-flow',.75);const e={type:'slow',mesh,owner,position:point,radius:state.radius,created:state.created,expires:state.expires};agentState.effects.push(e);agentSlowLayers(e);}
      if(state.type==='wall'){
        const cfg=agentConfig(owner).C,mesh=BABYLON.MeshBuilder.CreateBox('sage_barrier',{width:cfg.width,height:cfg.height,depth:cfg.depth},scene);mesh.position.copyFrom(point).y+=cfg.height/2;mesh.rotation.y=state.yaw;mesh.material=agentBarrierMaterial(cfg.height,0);mesh.metadata={abilitySolid:true,worldCollision:true,surface:'solid',skillAgent:'Sage'};
        const e={type:'wall',mesh,owner,cfg,position:point,created:state.created,expires:state.expires,hp:state.hp,fortified:state.fortified};agentState.effects.push(e);agentAttachEffectModel(mesh,'wall',cfg.width,{fit:[cfg.width,cfg.height,cfg.depth],material:mesh.material});agentWallLayers(e);agentState.solidsDirty=true;
      }
      effect=agentState.effects.slice(start).find(e=>e.type===state.type);if(effect){effect.netID=state.id;netMatch.effects.set(state.id,effect);}
    }
    if(effect){effect.created=state.created;effect.starts=state.starts;effect.expires=state.expires;if(state.type==='wall'){effect.hp=state.hp;effect.fortified=state.fortified;}}
  }
  const alive=new Set(packet.effects.map(e=>e.id));for(const [id,e] of netMatch.effects)if(!alive.has(id)){if(agentState.effects.includes(e))agentRemoveEffect(e);netMatch.effects.delete(id);}
  for(const state of packet.projectiles){let p=netMatch.projectiles.get(state.id);const owner=netOwner(state.owner);if(!owner)continue;
    if(!p){agentProjectile(state.type,0,0,100000,owner,BABYLON.Vector3.FromArray(state.position),BABYLON.Vector3.Zero());p=agentState.projectiles.at(-1);p.network=true;p.netID=state.id;netMatch.projectiles.set(state.id,p);}
    p.mesh.position.copyFromFloats(...state.position);p.mesh.setEnabled(packet.time>=state.release);p.stuck=state.stuck;p.fuseStarted=state.stuck?state.expires-agentConfig(owner).Q.windup:0;p.expires=state.expires;
    p.releaseAt=state.release;p.created=state.created;p.velocity.copyFromFloats(...state.velocity);
    p.updateVFX?.(packet.time);
  }
  const flying=new Set(packet.projectiles.map(p=>p.id));for(const [id,p] of netMatch.projectiles)if(!flying.has(id)){agentDisposeMesh(p.mesh);const index=agentState.projectiles.indexOf(p);if(index>=0)agentState.projectiles.splice(index,1);netMatch.projectiles.delete(id);}
}
function netSyncDrops(packet){const alive=new Set(packet.drops.map(d=>d.id));
  for(const state of packet.drops){if(netMatch.drops.has(state.id))continue;const prop=matchProp(state.name,null,.45);if(!prop)continue;prop.root.position.copyFromFloats(...state.position).y+=.14;prop.root.rotation.z=Math.PI/2;netMatch.drops.set(state.id,prop);}
  for(const [id,p] of netMatch.drops)if(!alive.has(id)){p.root.dispose();netMatch.drops.delete(id);}
}
function netFrame(){
  if(!netMatch.active||!netMatch.latest)return;
  const packet=netMatch.latest;if(!['playing','complete'].includes(packet.room.phase)){netMessageStatus();return;}
  if(packet!==netMatch.applied){netApplyPacket(packet);netMatch.applied=packet;}
  if(netMatch.authoritative&&window.GameEntry?.pending)window.GameEntry.complete();
  const now=performance.now(),dt=window.__frameDT||1/30;window.__gameTime=Math.max((window.__gameTime||0)+dt*1000,packet.time);
  if(!netMatch.authoritative){playerController.pause();netMessage('Đang đồng bộ vị trí với máy chủ…');return;}
  const inputDT=1/(window.GAME_CONFIG.network.tickRate||30);
  netMatch.inputAccumulator=Math.min(inputDT*4,netMatch.inputAccumulator+dt);
  while(netMatch.inputAccumulator>=inputDT){
    netMatch.inputAccumulator-=inputDT;
    const state=playerController.getState(),keys=new Set(window.__gamePlaying&&!uiInputBlocked()&&!window.__agentCursorMode?state.keys:[]);
    const mask=(keys.has('KeyW')?1:0)|(keys.has('KeyS')?2:0)|(keys.has('KeyA')?4:0)|(keys.has('KeyD')?8:0)|(keys.has('ShiftLeft')||keys.has('ShiftRight')?16:0)|(keys.has('ControlLeft')||keys.has('ControlRight')?32:0)|(keys.has('Space')?64:0);
    const input={seq:++netMatch.inputSeq,keys:mask,yaw:camera.rotation.y,pitch:camera.rotation.x,ads:weaponState.ads,steer:agentState.steer};
    // Prediction is independent of socket readiness/backpressure. Commands
    // that could not be sent are never replayed on reconnect as stale actions.
    playerController.networkPredict(input);
    if(netMatch.client.connected){
      netMatch.client.send({op:'input',...input});
      const held=!!(window.__gamePlaying&&matchState.hold&&!uiInputBlocked());
      if(held!==netMatch.lastInteract||now>=(netMatch.nextInteract||0)){if(netMatch.client.send({op:'interact',held})){netMatch.lastInteract=held;netMatch.nextInteract=now+250;}}
    }
  }
  if(VS.player.hp>0)playerController.networkRender(netMatch.inputAccumulator/inputDT,dt);
  const last=netMatch.packets.at(-1),desiredTime=(last?.time??packet.time)+Math.min(150,Math.max(0,now-(last?.received||now)))-(window.GAME_CONFIG.network.interpolationMs||100);
  if(netMatch.renderTime==null||Math.abs(desiredTime-netMatch.renderTime)>500)netMatch.renderTime=desiredTime;
  else netMatch.renderTime+=dt*1000*(1+Math.max(-.15,Math.min(.15,(desiredTime-netMatch.renderTime)/300)));
  const targetTime=netMatch.renderTime;
  let a=netMatch.packets[0],b=netMatch.packets.at(-1);
  for(let i=1;i<netMatch.packets.length;i++)if(netMatch.packets[i].time>=targetTime){a=netMatch.packets[i-1];b=netMatch.packets[i];break;}
  const alpha=a&&b?Math.max(0,Math.min(1,(targetTime-a.time)/Math.max(1,b.time-a.time))):1;
  for(const [id,bot] of netMatch.actors){const start=a?.members.find(p=>p.id===id),end=b?.members.find(p=>p.id===id);if(!end)continue;
    const from=BABYLON.Vector3.FromArray(start?.position||end.position),to=BABYLON.Vector3.FromArray(end.position),teleport=start&&((start.hp<=0&&end.hp>0)||BABYLON.Vector3.DistanceSquared(from,to)>25);
    bot.entity.position.copyFrom(teleport?to:BABYLON.Vector3.Lerp(from,to,alpha));
    const yaw=start?(start.yaw+Math.atan2(Math.sin(end.yaw-start.yaw),Math.cos(end.yaw-start.yaw))*alpha):end.yaw;bot.entity.forward.set(Math.sin(yaw),0,Math.cos(yaw));bot.pitch=(start?.pitch||0)+((end.pitch||0)-(start?.pitch||0))*alpha;bot.actor.velocity.copyFromFloats(...end.velocity);
    netRemoteGhost(bot,agentNow());matchBotPose(bot,agentNow());matchBotChannelProp(bot,matchState.rules.spike.channel?.actor?.id===id?matchState.rules.spike.channel:null,agentNow());
    if(bot.member.hp<=0&&!bot.ability?.reviveAt&&!bot.ability?.intangibleUntil){bot.root.setEnabled(true);const group=bot.groups.get('DeathSplat');group?.goToFrame(agentFrame(group,agentNow()-(bot.member.deathAt||0),false));}
  }
  for(const event of netMatch.events.splice(0))netEvent(event);
  for(const p of netMatch.projectiles.values())p.updateVFX?.(agentNow());
  for(const [prop,kind] of [[matchState.plantView,'plant'],[matchState.defuseView,'defuse']])if(prop)prop.root.setEnabled(matchState.rules.spike.channel?.actor===matchState.human&&matchState.rules.spike.channel.kind===kind);
  matchPlayerChannelPose(agentNow());
  if(!window.__gamePlaying){netVisualTick();agentVisualUpdate();}
  for(const t of [...matchState.tracers])if(agentNow()>=t.expires){t.mesh.dispose();matchState.tracers.splice(matchState.tracers.indexOf(t),1);}
  netMessageStatus();
}
function netMessageStatus(){const node=document.getElementById('net-status');if(node){const age=performance.now()-(netMatch.packets.at(-1)?.received||performance.now());node.textContent=netMatch.client.connected&&age<1500?'PHÒNG '+netMatch.client.session.room+' · '+netMatch.client.rtt+' ms':'CHỜ ĐỒNG BỘ · THAO TÁC CỤC BỘ';}}
function netNameTags(){
  if(!netMatch.active||!matchState.human||!scene.activeCamera)return;
  const activeCamera=scene.activeCamera,rect=document.getElementById('renderCanvas').getBoundingClientRect();if(!rect.width||!rect.height)return;
  if(!netMatch.tags){const wrap=netMatch.tags=document.createElement('div');wrap.id='net-nametags';wrap.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5';document.getElementById('game-container').appendChild(wrap);}
  const transform=activeCamera.getViewMatrix().multiply(activeCamera.getProjectionMatrix()),viewport=activeCamera.viewport.toGlobal(rect.width,rect.height),eye=activeCamera.globalPosition||activeCamera.position;
  const alive=new Set();for(const [id,bot] of netMatch.actors){if(bot.member.team!==matchState.human.team)continue;alive.add(id);
    let node=netMatch.tags.querySelector('[data-player="'+id+'"]');if(!node){node=document.createElement('div');node.dataset.player=id;node.style.cssText='position:absolute;transform:translate(-50%,-100%);color:#b8fff0;text-shadow:0 1px 3px #000;font:12px GameDIN,GameInter,sans-serif;white-space:nowrap';netMatch.tags.appendChild(node);}
    const point=bot.entity.position.add(new BABYLON.Vector3(0,bot.actor.crouching?1.65:2.05,0)),projected=BABYLON.Vector3.Project(point,BABYLON.Matrix.Identity(),transform,viewport);
    node.textContent=bot.member.name;node.hidden=bot.member.hp<=0||BABYLON.Vector3.Distance(eye,bot.entity.position)<.7||BABYLON.Vector3.Dot(point.subtract(eye),activeCamera.getDirection(BABYLON.Axis.Z))<=0||projected.z<0||projected.z>1;
    node.style.left=projected.x+'px';node.style.top=projected.y+'px';
  }
  for(const node of [...netMatch.tags.children])if(!alive.has(node.dataset.player))node.remove();
}
function netEvent(e){const owner=netOwner(e.owner),member=matchState.rules.members.find(p=>p.id===e.owner),self=owner===VS.player;
  if(e.type==='shot'){
    const bot=member?.entity.bot;if(bot){bot.lastShotAt=agentNow();if(!self&&owner.hp>0){
      const melee=e.weapon==='Melee',variant=e.alternate?'firealt':['fire','fire2','fire3'][(bot.meleeCombo=(bot.meleeCombo||0)+1)%3];
      const def=weaponDef(e.weapon),duration=melee?(e.alternate?def.altFire?.fireDelay:def.fireDelay)||500:130;
      matchBotAction(bot,'gun_'+e.weapon+'_'+(melee?variant:'fire'),duration);
    }}
    if(e.weapon!=='Melee'&&!self){const from=BABYLON.Vector3.FromArray(e.from),to=BABYLON.Vector3.FromArray(e.to),line=BABYLON.MeshBuilder.CreateLines('network_shot',{points:[from,to]},scene);line.color=BABYLON.Color3.FromHexString('#F8EBC3');matchState.tracers.push({mesh:line,expires:agentNow()+100});}
  }
  if(e.type==='reload'&&owner?.bot){owner.bot.reloadStarted=e.started??agentNow();owner.bot.reloadUntil=e.until??(owner.bot.reloadStarted+900);}
  if(e.type==='death'){const victim=matchState.rules.members.find(p=>p.id===e.victim),killer=matchState.rules.members.find(p=>p.id===e.killer);if(victim){victim.entity.uiLastHit={zone:e.zone,weapon:e.weapon,source:killer?.entity};uiElimination(victim,killer);uiKillFeed(killer?.name||'Môi trường',victim.name,{killer,victim,weapon:e.weapon,headshot:e.zone==='head'});}}
  if(e.type==='damage'){const victim=netOwner(e.victim),killer=netOwner(e.killer);if(victim)uiCombatDamage(victim,killer,e.amount,e.amount,{weapon:e.weapon,zone:e.zone});if(victim===VS.player)playerController.tag();}
  if(e.type==='knife'&&owner){const from=BABYLON.Vector3.FromArray(e.from),to=BABYLON.Vector3.FromArray(e.to);agentKnifeFlight(new BABYLON.Ray(from,to.subtract(from).normalize(),BABYLON.Vector3.Distance(from,to)),to,e.id,!!e.alternate,owner);if(self)agentVisualAction(e.alternate?'X_firealt':'X_fire');else if(owner.bot?.ability&&owner.hp>0)matchBotAction(owner.bot,e.alternate?'X_firealt':'X_fire',e.alternate?260:167);}
  if(e.type==='meddleImpact')agentMeddleImpact(BABYLON.Vector3.FromArray(e.position),e.radius);
  if(e.type==='cue'&&owner){const target=netOwner(e.target);if(target)agentEffectCue(target,agentConfig(owner).color,e.duration,e.kind,owner);const action=member.agent==='Clove'?'C_cast':e.kind==='heal'?'E_cast':'X_cast';if(self)agentVisualAction(action);else if(owner.bot?.ability&&owner.hp>0)matchBotAction(owner.bot,action,e.duration);}
  if(e.type==='cast'&&owner){const action=e.slot+(member.agent==='Jett'&&e.slot==='X'?'_equip':'_cast');if(self){if(VS.player.hp>0)agentVisualAction(action);if(member.agent==='Jett'&&e.slot==='X')agentState.equipped='X';}else if(owner.bot?.ability&&owner.hp>0)matchBotAction(owner.bot,action,700);}
  if(e.type==='wall'&&owner){if(self)agentVisualAction('C_cast');else if(owner.bot?.ability)matchBotAction(owner.bot,'C_cast',700);}
  if(['updraft','dash'].includes(e.type)&&owner&&!self){matchBotAction(owner.bot,e.type==='dash'?'E_cast':'Q_cast',700);agentWind(e.type,e.type==='dash'?610:650,owner);}
  if(e.type==='updraft'&&self){agentVisualAction('Q_cast');agentWind('updraft',650);}
  if(e.type==='dash'&&self){agentVisualAction('E_cast');agentWind('dash',agentConfig().E.duration+160);}
  if(e.type==='reviveCast'&&owner){if(self){agentState.resurrectionCastAt=e.time;agentState.resurrectionWindupEnds=e.at;agentVisualAction('X_cast');agentCancelEquip();}else if(owner.bot?.ability&&owner.hp>0)matchBotAction(owner.bot,'X_cast',Math.max(700,(e.at??e.time)-e.time));agentCastLayers('clove-revive',owner,e.intangibleUntil-e.time);}
  if(e.type==='revived'&&self){agentState.reviveNoticeUntil=agentNow()+2500;netMessage('ĐÃ HỒI SINH');}
  if(e.type==='notice')netMessage(e.message);
}
function netSaveResult(packet){if(netMatch.saved)return;netMatch.saved=true;VSAccount.refresh().catch(error=>netMessage(error.message));}
function netRemoteGhost(bot,now){
  const a=bot.ability,spectral=matchState.mode!=='deathmatch'&&bot.member.agent==='Clove'&&(a.reviveAt>now||a.intangibleUntil>now);
  bot.root.setEnabled(!spectral);bot.gun?.root.setEnabled(!spectral&&bot.entity.hp>0&&!bot.member.skill);if(!spectral){bot.ghost?.root.setEnabled(false);return;}
  const ghost=matchBotGhost(bot);ghost.root.setEnabled(true);ghost.root.position.copyFrom(bot.entity.position).y+=ghost.offset;ghost.root.rotation.y=Math.atan2(bot.entity.forward.x,bot.entity.forward.z);
  const group=ghost.groups.get(a.reviveAt>now?'intro':'idle');group?.goToFrame(agentFrame(group,a.reviveAt>now?now-(a.reviveAt-agentConfig(bot.entity).X.revive):now,a.reviveAt<=now));
}
function netVisualTick(){
  const now=agentNow();for(const e of [...agentState.effects]){
    if(!e.netID&&now>=e.expires){agentRemoveEffect(e);continue;}
    if(e.type==='smoke'){const clove=!!e.mesh.material?.metadata?.ruseSmoke,t=Math.max(0,Math.min(1,(now-e.starts)/(clove?650:320))),out=Math.max(0,Math.min(1,(e.expires-now)/380));
      e.actualRadius=e.radius*(clove?.3+.7*cloveEase(t*3):1-Math.pow(1-t,3))*out;e.mesh.setEnabled(now>=e.starts);e.mesh.scaling.setAll(Math.max(.001,e.actualRadius/e.radius));
      if(clove)for(const mat of [e.mesh.material,...(e.ruseShellMaterials||[])]){mat.setFloat('formation',cloveEase(t));mat.setFloat('opacity',cloveEase(t*6)*out);mat.setFloat('clock',now/1000);}
    }
    if(e.type==='wall'){const cfg=e.cfg,t=Math.max(.05,Math.min(1,(now-e.created)/cfg.rise));e.mesh.scaling.y=t;e.mesh.position.y=e.position.y+cfg.height*t/2;e.mesh.computeWorldMatrix(true);agentState.solidsDirty=true;}
  }
  if(agentState.solidsDirty)agentRebuildSolids();agentEffectsTick();agentWallPreviewUpdate();agentHUD();uiHUDUpdate();
  if(VS.player.agent==='Jett'&&agentState.equipped==='X'&&agentState.knifeHeld&&now>=agentState.lockUntil&&now>=(netMatch.nextKnife||0)){netMatch.nextKnife=now+agentConfig().X.interval;netCommand('ability',{slot:'X'});}
}
function netInstallAuthority(){
  const original={weaponShoot,weaponReload,weaponSwitch,agentEquip,agentCast,agentCancelEquip,agentBuy,combatDamage,agentBeforeDamage};
  weaponShoot=function(alternate,continuation){if(!netMatch.active)return original.weaponShoot(alternate,continuation);
    const aim={yaw:camera.rotation.y,pitch:camera.rotation.x},weapon=weaponState.current,before=weaponState.ammo[weapon]?.clip||0,ok=original.weaponShoot(alternate,continuation);
    if(ok&&netMatch.client.connected){const seq=netMatch.shotSeq=(netMatch.shotSeq||0)+1;(netMatch.pendingShots??=[]).push({seq,weapon,cost:Math.max(0,before-(weaponState.ammo[weapon]?.clip||0))});if(netMatch.pendingShots.length>256)netMatch.pendingShots.shift();netCommand('shoot',{...aim,alternate:!!alternate,shotSeq:seq});}return ok;};
  const resolveHit=weaponResolveHit;weaponResolveHit=function(ray,def){if(!netMatch.active)return resolveHit(ray,def);const hit=abilityWorldPick(ray);if(hit&&!hit.wall)weaponSpawnBulletHole(hit.pickedPoint,hit.getNormal());
    if(def.slot!=='melee'){const to=hit?.pickedPoint||ray.origin.add(ray.direction.scale(Math.min(ray.length,70))),line=BABYLON.MeshBuilder.CreateLines('predicted_shot',{points:[ray.origin,to]},scene);line.color=BABYLON.Color3.FromHexString('#F8EBC3');matchState.tracers.push({mesh:line,expires:agentNow()+75});}};
  weaponReload=function(){if(!netMatch.active)return original.weaponReload();const before=weaponState.reloading;original.weaponReload();if(!before&&weaponState.reloading)netCommand('reload');};
  weaponSwitch=function(name){if(!netMatch.active||netMatch.applying)return original.weaponSwitch(name);const target=weaponState.loadout[name]||name;original.weaponSwitch(name);if(weaponState.current===target)netCommand('switch',{name:target});};
  combatDamage=function(entity,damage,source,ctx){if(!netMatch.active)return original.combatDamage(entity,damage,source,ctx);return {healthDamage:0,armorDamage:0,hp:entity.hp,armor:entity.armor};};
  agentBeforeDamage=function(entity,damage){return netMatch.active?0:original.agentBeforeDamage(entity,damage);};
  agentCancelEquip=function(){const equipped=agentState.equipped;original.agentCancelEquip();if(netMatch.active&&!netMatch.applying&&equipped)netCommand('cancelSkill');};
  agentBuy=function(slot){if(!netMatch.active)return original.agentBuy(slot);netCommand('buy',{kind:'skill',slot});};
  agentEquip=function(slot){if(!netMatch.active)return original.agentEquip(slot);if(!netMatch.client.connected||matchState.mode==='deathmatch'||matchState.human.team==='observer'||matchState.rules.phase!=='live')return false;const name=VS.player.agent,instant=name==='Clove'&&['C','X'].includes(slot)||name==='Jett'&&['C','Q','E','X'].includes(slot)||name==='Sage'&&slot==='X';
    if(instant){const previous=agentState.equipped;netCommand('ability',{slot,equip:true}).then(reply=>{if(reply.ok&&name!=='Jett'&&agentState.equipped===previous){netMatch.applying=true;try{original.agentCancelEquip();}finally{netMatch.applying=false;}}});if(name==='Jett'&&slot==='C')agentState.steer=true;return true;}const old=agentState.equipped,ok=original.agentEquip(slot);if(ok&&agentState.equipped===slot&&old!==slot&&VS.player.hp>0)netCommand('equipSkill',{slot});return ok;};
  agentCast=function(alternate=false){if(!netMatch.active)return original.agentCast(alternate);const slot=agentState.equipped;if(!slot||agentNow()<agentState.lockUntil||!netMatch.client.connected)return false;
    if(VS.player.agent==='Clove'&&slot==='E'&&!alternate){agentState.addSmokeMark?.();return true;}
    if(VS.player.agent==='Sage'&&slot==='C'&&alternate){agentState.rotation+=Math.PI/2;return true;}
    const data={slot,alternate};if(VS.player.agent==='Clove'&&slot==='E'){if(!agentState.smokeMarks.length)return agentNotice('Chọn ít nhất một vị trí smoke.');data.points=agentState.smokeMarks.map(p=>p.asArray());}
    const knives=VS.player.agent==='Jett'&&slot==='X';if(knives)netMatch.nextKnife=agentNow()+(alternate?agentConfig().X.burstInterval:agentConfig().X.interval);
    if(VS.player.agent==='Sage'&&slot==='C'){const point=agentAimGround(agentConfig().C.range);if(!point)return false;data.point=point.asArray();data.yaw=camera.rotation.y+agentState.rotation;}
    netCommand('ability',data).then(reply=>{if(reply.ok&&!knives){netMatch.applying=true;try{original.agentCancelEquip();}finally{netMatch.applying=false;}}});return true;
  };
  const buyWeapon=uiBuyWeapon,sellWeapon=uiSellWeapon,buyArmor=uiBuyArmor,sellArmor=uiSellArmor,requestWeapon=uiRequestWeapon,sendPing=uiSendPing;
  uiBuyWeapon=function(name,recipient=matchState.human,payer=matchState.human){if(!netMatch.active)return buyWeapon(name,recipient,payer);if(payer!==matchState.human)return uiToast('Người mua hộ phải tự xác nhận trên máy của họ.');netCommand('buy',{kind:'weapon',name,recipient:recipient.id});};
  uiSellWeapon=function(name){if(!netMatch.active)return sellWeapon(name);netCommand('sell',{kind:'weapon',name});};
  uiBuyArmor=function(name){if(!netMatch.active)return buyArmor(name);netCommand('buy',{kind:'armor',name});};
  uiSellArmor=function(name){if(!netMatch.active)return sellArmor(name);netCommand('sell',{kind:'armor',name});};
  uiRequestWeapon=function(name){if(!netMatch.active)return requestWeapon(name);netCommand('request',{name});};
  uiSendPing=function(type,point){if(!netMatch.active)return sendPing(type,point);netCommand('ping',{kind:type,point:point?.asArray(),map:!!point});};
  const damageWall=agentDamageWall;agentDamageWall=function(mesh,damage){if(!netMatch.active)return damageWall(mesh,damage);};
  document.addEventListener('keydown',e=>{if(!netMatch.active||!window.__gamePlaying||e.target.matches?.('input,select,textarea'))return;if(e.code==='KeyH'){e.preventDefault();e.stopImmediatePropagation();netCommand('drop');}if(e.code==='KeyF'){e.preventDefault();netCommand('pickup');}},true);
}
