function uiMapPoint(point,size=256) {
  const r=VSMaps.valid(MAP_MODE)&&!window.__mapFallback?window.GAME_CONFIG['map-layout']?.registration:null;
  if(r)return [(r.offset[0]+r.scale*(r.basis[0][0]*point.x+r.basis[0][1]*point.z))*size/1024,
    (r.offset[1]+r.scale*(r.basis[1][0]*point.x+r.basis[1][1]*point.z))*size/1024];
  return [(point.x+25)/50*size,(75-point.z)/100*size];
}
function uiMapWorld(u,v) {
  const r=VSMaps.valid(MAP_MODE)&&!window.__mapFallback?window.GAME_CONFIG['map-layout']?.registration:null;
  let x,z;
  if(r){const a=(u*1024-r.offset[0])/r.scale,b=(v*1024-r.offset[1])/r.scale;x=r.basis[0][0]*a+r.basis[1][0]*b;z=r.basis[0][1]*a+r.basis[1][1]*b;}
  else{x=u*50-25;z=75-v*100;}
  return worldPick(new BABYLON.Vector3(x,100,z),BABYLON.Vector3.Down(),200,true)?.pickedPoint.clone()||null;
}
function uiPlayerSees(member) {
  if(VS.player.hp<=0)return false;
  const point=matchMemberPoint(member).add(new BABYLON.Vector3(0,1.3,0)),eye=camera.globalPosition||camera.position,delta=point.subtract(eye);
  const distance=delta.length();if(distance>window.GAME_CONFIG.match.bots.sightRange)return false;
  return BABYLON.Vector3.Dot(delta.normalize(),camera.getDirection(BABYLON.Axis.Z))>Math.cos(camera.fov/2)&&agentLOS(eye,point,true);
}
function uiMapUpdate(now) {
  uiState.pings=uiState.pings.filter(p=>p.until>now);
  const active=typeof matchActive==='function'&&matchActive()&&!!matchState.rules?.spike&&!!matchState.human;
  if(active){
    const team=matchState.human.team,dm=matchState.mode==='deathmatch';
    for(const member of matchState.rules.members.filter(p=>p!==matchState.human&&(dm||p.team!==team)&&p.hp>0)) {
      const observed=uiPlayerSees(member)||!dm&&matchState.bots.some(bot=>bot.member.team===team&&bot.entity.hp>0&&bot.target===member&&agentLOS(bot.entity.position.add(new BABYLON.Vector3(0,1.55,0)),matchMemberPoint(member).add(new BABYLON.Vector3(0,1.1,0)),true));
      // Store a snapshot; a hidden enemy never updates its last known position.
      if(observed)uiState.seen.set(member.id,{position:matchMemberPoint(member).clone(),until:now+1500,liveAt:now});
    }
    for(const [id,entry] of uiState.seen)if(now>=entry.until)uiState.seen.delete(id);
    const spike=matchState.rules.spike;
    if(spike.state!=='dropped')uiState.spikeSeen=false;
    else if(!uiState.spikeSeen&&VS.player.hp>0){
      const point=BABYLON.Vector3.FromArray(spike.position).add(new BABYLON.Vector3(0,.15,0)),delta=point.subtract(camera.position);
      uiState.spikeSeen=delta.length()<45&&BABYLON.Vector3.Dot(delta.normalize(),camera.getDirection(BABYLON.Axis.Z))>Math.cos(camera.fov/2)&&agentLOS(camera.position,point,true);
    }
  }
  uiDrawMap(document.getElementById('hud-map-canvas'),now);
  if(uiState.mapOpen)uiDrawMap(document.getElementById('hud-full-map-canvas'),now);
  let location=VSMaps.get(MAP_MODE)?.name.toUpperCase()||'KHU LUYỆN TẬP';
  if(active){const site=matchState.sites.find(s=>BABYLON.Vector3.DistanceSquared(agentPosition(),s.position)<100);if(site)location='KHU '+site.name;}
  uiText('hud-location',location);
}
function uiDrawMap(canvas,now) {
  if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const size=canvas.width;ctx.clearRect(0,0,size,size);
  if(canvas.id==='hud-full-map-canvas'){ctx.fillStyle='#0b171dcc';ctx.fillRect(0,0,size,size);}
  const map=uiImage(VSMaps.get(MAP_MODE)?.minimap||'abyss');
  if(VSMaps.valid(MAP_MODE)&&!window.__mapFallback&&map.complete&&map.naturalWidth)ctx.drawImage(map,0,0,size,size);
  else {ctx.strokeStyle='#7e9290';ctx.lineWidth=1;ctx.strokeRect(size*.1,size*.1,size*.8,size*.8);}
  const active=typeof matchActive==='function'&&matchActive()&&!!matchState.rules?.spike&&!!matchState.human,scale=size/256;
  function circle(point,r,color,outline=false){const [x,y]=uiMapPoint(point,size);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.strokeStyle=color;outline?ctx.stroke():ctx.fill();}
  function image(key,point,width){const img=uiImage(key),[x,y]=uiMapPoint(point,size);if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-width/2,y-width/2,width,width);}
  if(active&&matchState.mode==='unrated') {
    for(const orb of matchState.orbs)if(!orb.taken)circle(orb.position,2*scale,'#f0efe5');
    for(const site of matchState.sites){const [x,y]=uiMapPoint(site.position,size);ctx.fillStyle='#f8e8b7';ctx.font='700 '+(13*scale)+'px GameDIN, GameInter, sans-serif';ctx.textAlign='center';ctx.fillText(site.name,x,y);}
    for(const member of matchState.rules.members.filter(p=>p!==matchState.human&&p.team===matchState.human.team&&p.hp>0)) {
      circle(matchMemberPoint(member),5.2*scale,'#54b9a1');image('portrait-'+member.agent,matchMemberPoint(member),8*scale);
    }
    const spike=matchState.rules.spike;
    if(spike.state==='planted'||spike.state==='dropped'&&(matchState.human.team===matchState.rules.attacking||uiState.spikeSeen))image(spike.state==='planted'?'spike-planted':'spike',BABYLON.Vector3.FromArray(spike.position),12*scale);
    // Enemy carried Spike stays unknown; only friendly carriers receive the icon.
    if(spike.state==='carried'&&spike.carrier?.team===matchState.human.team)image('spike',matchMemberPoint(spike.carrier),9*scale);
  }
  if(active)for(const [id,entry] of uiState.seen) {
    const member=matchState.rules.members.find(p=>p.id===id);if(!member||member.hp<=0)continue;
    ctx.globalAlpha=now-entry.liveAt<150?1:.45;circle(entry.position,3.5*scale,'#f65d6d');ctx.globalAlpha=1;
  }
  if(VS.player.hp>0) {
    const point=agentPosition(),[x,y]=uiMapPoint(point,size),move=playerController.getState();
    const noisy=move.grounded&&!move.crouching&&!move.keys.some(k=>k==='ShiftLeft'||k==='ShiftRight')&&Math.hypot(move.velocity[0],move.velocity[2])>2.2;
    // Visual attenuation reference; actual audio playback is a later milestone.
    if(noisy){const r=VSMaps.valid(MAP_MODE)?window.GAME_CONFIG['map-layout'].registration.scale/1024*size*40:size*.2;ctx.lineWidth=1;circle(point,r,'#f6f8f466',true);}
    const forward=camera.getDirection(BABYLON.Axis.Z),[fx,fy]=uiMapPoint(point.add(forward),size),angle=Math.atan2(fy-y,fx-x);
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#fff';ctx.strokeStyle='#102027';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(7*scale,0);ctx.lineTo(-4*scale,-4*scale);ctx.lineTo(-2*scale,0);ctx.lineTo(-4*scale,4*scale);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  for(const ping of uiState.pings)image('ping-'+ping.type,ping.position,13*scale);
}
function uiMapToggle() {
  if(uiState.shopOpen)return;
  uiState.mapOpen=!uiState.mapOpen;document.getElementById('hud-full-map').hidden=!uiState.mapOpen;
  if(uiState.mapOpen){agentCancelEquip();weaponClearInput();}
  playerController.cursorMode(uiState.mapOpen);uiMapUpdate(agentNow());
}
function uiSendPing(type,point) {
  const now=agentNow();if(now<(uiState.pingAt||0))return;
  point=point||abilityWorldPick((scene.activeCamera||camera).getForwardRay(100))?.pickedPoint;
  if(!point)return;uiState.pingAt=now+700;
  uiState.pings.push({type,position:point.clone(),until:now+6000});if(uiState.pings.length>4)uiState.pings.shift();
  uiToast(({danger:'Nguy hiểm',going:'Đang tới',watch:'Đang quan sát',help:'Cần hỗ trợ'})[type]);uiMapUpdate(now);
}
function uiOpenPingWheel(){
  const hold=uiState.pingHold;if(!hold)return;hold.wheel=true;hold.type='danger';hold.dx=hold.dy=0;
  weaponClearInput();playerController.stop();document.getElementById('hud-ping-wheel').hidden=false;uiPingSelection();
}
function uiPingSelection(){for(const cell of document.querySelectorAll('[data-ping]'))cell.classList.toggle('selected',cell.dataset.ping===uiState.pingHold?.type);}
function uiWorldPings(now) {
  const wrap=document.getElementById('hud-ping-world');if(!wrap)return;
  while(wrap.children.length>uiState.pings.length)wrap.lastChild.remove();
  while(wrap.children.length<uiState.pings.length){const marker=document.createElement('div');marker.innerHTML='<img alt=""><span></span>';wrap.appendChild(marker);}
  const activeCamera=scene.activeCamera||camera,rect=document.getElementById('renderCanvas').getBoundingClientRect(),eye=activeCamera.globalPosition;
  const transform=activeCamera.getViewMatrix().multiply(activeCamera.getProjectionMatrix()),viewport=activeCamera.viewport.toGlobal(rect.width,rect.height);
  uiState.pings.forEach((ping,i)=>{
    const node=wrap.children[i],point=ping.position.add(new BABYLON.Vector3(0,.4,0));
    const inFront=BABYLON.Vector3.Dot(point.subtract(eye),activeCamera.getDirection(BABYLON.Axis.Z))>0;
    const projected=BABYLON.Vector3.Project(point,BABYLON.Matrix.Identity(),transform,viewport);
    node.hidden=!inFront||projected.z<0||projected.z>1;node.style.left=projected.x+'px';node.style.top=projected.y+'px';
    const img=node.querySelector('img');if(img.dataset.type!==ping.type){img.dataset.type=ping.type;img.src=uiAsset('ping-'+ping.type);}
    node.querySelector('span').textContent=Math.round(BABYLON.Vector3.Distance(ping.position,agentPosition()))+' m';
  });
}
function uiInitMapInputs(){
  const abort=new AbortController(),options={signal:abort.signal};scene.onDisposeObservable.add(()=>abort.abort());
  // World markers follow the exact rendered camera every frame; map content
  // can retain its slower refresh without dragging the markers during a turn.
  scene.onAfterRenderObservable.add(()=>uiWorldPings(agentNow()));
  document.getElementById('hud-full-map').querySelector('button').onclick=uiMapToggle;
  document.getElementById('hud-full-map-canvas').addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const r=event.target.getBoundingClientRect(),point=uiMapWorld((event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);if(point)uiSendPing('danger',point);
  },options);
  document.addEventListener('pointermove',event=>{
    const hold=uiState.pingHold;if(!hold?.wheel)return;
    if(document.pointerLockElement){hold.dx+=event.movementX||0;hold.dy+=event.movementY||0;}
    else{hold.dx=event.clientX-innerWidth/2;hold.dy=event.clientY-innerHeight/2;}
    hold.type=Math.abs(hold.dx)>Math.abs(hold.dy)?hold.dx>0?'going':'help':hold.dy>0?'watch':'danger';uiPingSelection();
  },options);
  document.addEventListener('keydown',event=>{
    if(event.target.matches?.('input,select,textarea,[contenteditable="true"]'))return;
    if(!window.__gamePlaying)return;
    if(event.code==='KeyN'&&uiState.report){event.preventDefault();uiState.reportHidden=!uiState.reportHidden;uiCombatReportUpdate();return;}
    if(event.code==='KeyB'&&typeof matchActive==='function'&&matchActive()) {event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)uiShopToggle();return;}
    if(event.code==='KeyM'&&!uiState.shopOpen){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)uiMapToggle();return;}
    // Preserve the existing second zoom level shortcut while scoped.
    if(event.code==='KeyZ'&&!uiState.shopOpen&&!agentState.equipped&&!(weaponState.ads&&weaponDef().adsZoomSecondary)) {
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)uiState.pingHold={at:agentNow(),wheel:false,type:'danger'};return;
    }
    if(uiInputBlocked()&&event.code!=='Escape'&&event.code!=='Tab'){event.preventDefault();event.stopImmediatePropagation();}
  },{...options,capture:true});
  document.addEventListener('keyup',event=>{
    if(event.code!=='KeyZ'||!uiState.pingHold)return;const hold=uiState.pingHold;uiState.pingHold=null;document.getElementById('hud-ping-wheel').hidden=true;
    if(window.__gamePlaying)uiSendPing(hold.type);event.preventDefault();
  },options);
  window.addEventListener('blur',()=>uiCloseAll(false),options);
}
