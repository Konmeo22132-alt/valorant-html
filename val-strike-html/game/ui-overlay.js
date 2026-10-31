// Native PNGs are shared by DOM/canvas; UI never allocates a second 3D renderer.
const uiState={images:new Map(),seen:new Map(),pings:[],nextMap:0,nextBoard:0,shopOpen:false,mapOpen:false,pingHold:null,
  feed:[],bannerUntil:0,damageUntil:0,reportHidden:false,report:null,rosterKey:'',boardKey:'',lastPhase:'',roundsDone:0};
function uiAsset(key){return '/assets/ui/'+key+'.png?v=32';}
const uiAbilityNames={Clove:{C:'Hấp Thụ Sinh Lực',Q:'Nhúng Chàm',E:'Bịp Bợm',X:'Bất Diệt'},Jett:{C:'Vân Nộ',Q:'Tùy Phong',E:'Thuận Phong',X:'Bạo Vũ Cuồng Phong'},Sage:{C:'Tường Băng Bảo Hộ',Q:'Ngọc Làm Chậm',E:'Cầu Hồi Phục',X:'Hồi Sinh'}};
function uiAbilityLabel(slot,agent=VS.player.agent){return uiAbilityNames[agent]?.[slot]||window.GAME_CONFIG['playable-agents'][agent]?.[slot]?.name||slot;}
function uiCreditMarkup(value){return '<i class="credit-icon" aria-hidden="true"></i><span>'+Number(value).toLocaleString('en-US')+'</span>';}
function uiImage(key){if(!uiState.images.has(key)){const image=new Image();image.onload=()=>{uiState.nextMap=0;window.__renderOnce=true;};image.src=uiAsset(key);uiState.images.set(key,image);}return uiState.images.get(key);}
function uiText(id,value){const node=document.getElementById(id),text=String(value);if(node&&node.textContent!==text)node.textContent=text;}
function uiInputBlocked(){return !!window.VSChat?.isOpen||uiState.shopOpen||uiState.mapOpen||!!uiState.pingHold?.wheel;}
function uiCreateFullscreenPrompt(){
  let gate=document.getElementById('fullscreen-required');if(gate)return gate;
  gate=document.createElement('section');gate.id='fullscreen-required';gate.hidden=true;
  gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','fullscreen-title');
  gate.innerHTML='<div class="fullscreen-card"><h2 id="fullscreen-title">Sẵn sàng vào trận</h2><p id="fullscreen-message">Bật toàn màn hình để bắt đầu điều khiển nhân vật.</p><button id="fullscreen-enter" type="button">BẮT ĐẦU CHƠI</button><p class="fullscreen-note">ESC để tạm dừng.</p></div>';
  document.body.appendChild(gate);return gate;
}
function uiHUDInject() {
  if(document.getElementById('game-hud'))return;
  const hud=document.createElement('div');hud.id='game-hud';
  hud.innerHTML=`
    <div class="crosshair"><i></i></div><div id="hud-hitmarker" hidden><img alt="" src="${uiAsset('headshot')}"></div>
    <div id="hud-score"><div id="hud-team-a" class="hud-team"></div><div class="sc ally" id="hud-score-a">0</div>
      <div class="hud-clock"><span id="hud-timer">1:40</span><img id="hud-spike-timer" alt="Spike đã đặt" src="${uiAsset('spike-carrier')}" hidden></div>
      <div class="sc enemy" id="hud-score-b">0</div><div id="hud-team-b" class="hud-team"></div></div>
    <div id="hud-minimap"><canvas id="hud-map-canvas" width="256" height="256" aria-label="Minimap"></canvas><div id="hud-location">${VSMaps.get(MAP_MODE)?.name.toUpperCase()||'KHU LUYỆN TẬP'}</div></div>
    <div id="hud-credits"><i class="credit-icon" aria-hidden="true"></i><span id="hud-credits-num">800</span></div><div id="hud-killfeed"></div>
    <div id="hud-bottom"><div id="hud-hp"><div class="hud-armor-block"><img alt="Giáp" src="${uiAsset('armor')}"><span id="hud-armor">0</span></div>
      <span class="num" id="hud-hp-num">100</span><div class="hud-hp-track"><span id="hud-hp-fill"></span></div>
      <span id="hud-overheal" hidden></span><span id="hud-regen" hidden></span></div><div id="hud-abilities" hidden></div></div>
    <div id="hud-ammo"><div id="hud-reload" hidden>ĐANG NẠP</div><img id="hud-weapon-icon" alt=""><div class="wname" id="hud-wname">CLASSIC</div>
      <img class="ammo-icon" alt="" src="${uiAsset('ammo')}"><span class="clip" id="hud-clip">12</span><span class="sep"> / </span><span class="reserve" id="hud-res">36</span></div>
    <div id="hud-kill-banner" hidden><img class="kill-frame" alt="" src="${uiAsset('kill-frame')}"><img class="kill-ring" alt="" src="${uiAsset('kill-ring')}">
      <img class="kill-emblem" alt="" src="${uiAsset('kill-emblem')}"><div id="hud-kill-pips"></div><span id="hud-kill-title"></span></div>
    <div id="hud-damage" hidden><div class="damage-sides"></div><div class="damage-top"></div><img id="hud-damage-arrow" alt="Hướng nhận sát thương" src="${uiAsset('damage-direction')}"></div>
    <section id="hud-combat-report" hidden aria-label="Báo cáo giao tranh"></section><div id="hud-ping-world"></div>
    <div id="hud-toast" hidden></div>
    <div id="hud-ping-wheel" hidden><span>Thả Z để đánh dấu</span>${[['danger','Nguy hiểm'],['going','Đang tới'],['watch','Quan sát'],['help','Cần hỗ trợ']].map(([key,label])=>`<div data-ping="${key}"><img alt="" src="${uiAsset('ping-'+key)}"><span>${label}</span></div>`).join('')}</div>
    <div id="hud-full-map" hidden><button type="button">Đóng bản đồ · M</button><canvas id="hud-full-map-canvas" width="640" height="640" aria-label="Bản đồ chiến thuật"></canvas><p>Nhấp để ping · Z giữ: 4 lựa chọn</p></div>`;
  document.getElementById('game-container').appendChild(hud);
  uiInitMapInputs();uiInitShop();
  scene.onBeforeRenderObservable.add(()=>{if(window.__gamePlaying)uiPulse();});
  scene.onDisposeObservable.add(()=>{uiCloseAll(false);uiState.images.clear();uiResetMatch();});
}
function uiToast(message){
  uiText('hud-toast',message);const node=document.getElementById('hud-toast');if(node)node.hidden=false;
  uiState.toastUntil=(window.__gameTime||0)+2600;
}
function uiHitMarker(head=false) {
  const marker=document.getElementById('hud-hitmarker');if(!marker)return;
  marker.hidden=false;marker.classList.toggle('headshot',head);uiState.hitUntil=(window.__gameTime||0)+130;
}
function uiKillFeed(killer,victim,details={}) {
  const feed=document.getElementById('hud-killfeed');if(!feed)return;
  const row=document.createElement('div');row.className='kf';
  const ally=details.killer&&typeof matchActive==='function'&&matchActive()&&details.killer.team===matchState.human.team;
  row.classList.toggle('friendly',!!ally);row.classList.toggle('personal',details.killer===matchState.human);
  function text(value){const node=document.createElement('span');node.textContent=value;row.appendChild(node);}
  function icon(key,alt){const image=document.createElement('img');image.src=uiAsset(key);image.alt=alt||'';row.appendChild(image);}
  if(details.killer)icon('portrait-'+details.killer.agent);
  text(killer);if(details.weapon)icon('weapon-'+details.weapon,details.weapon);else text('→');
  if(details.headshot)icon('headshot','Headshot');text(victim);
  if(details.victim)icon('portrait-'+details.victim.agent);
  feed.appendChild(row);uiState.feed.push({row,until:(window.__gameTime||0)+5000});
  while(uiState.feed.length>5)uiState.feed.shift().row.remove();
}
function uiHUDUpdate() {
  const am=VS.player.ammo||{},over=Math.ceil(VS.player.overheal||0),regen=Math.ceil(VS.player.regenPool||0);
  uiText('hud-clip',am.clip??'—');uiText('hud-res',am.reserve??'—');uiText('hud-wname',(VS.player.weapon||'').toUpperCase());
  uiText('hud-hp-num',Math.ceil(VS.player.hp));uiText('hud-armor',Math.ceil(VS.player.armor||0));uiText('hud-credits-num',VS.player.credits);
  uiText('hud-score-a',VS.round.score.a);uiText('hud-score-b',VS.round.score.b);
  const fill=document.getElementById('hud-hp-fill');if(fill)fill.style.width=Math.max(0,Math.min(100,VS.player.hp))+'%';
  const hp=document.getElementById('hud-hp');hp?.classList.toggle('low',VS.player.hp>0&&VS.player.hp<=30);
  const bonus=document.getElementById('hud-overheal');if(bonus){bonus.hidden=!over;uiText('hud-overheal','+'+over);}
  const pool=document.getElementById('hud-regen');if(pool){pool.hidden=VS.player.armorType!=='regen'||!regen;uiText('hud-regen','↻ '+regen);}
  const reload=document.getElementById('hud-reload');if(reload)reload.hidden=typeof weaponState==='undefined'||!weaponState.reloading;
  const icon=document.getElementById('hud-weapon-icon');
  if(icon){const name=VS.player.weapon||'Melee';if(icon.dataset.weapon!==name){icon.dataset.weapon=name;icon.src=uiAsset('weapon-'+name);icon.alt=name;}}
}
function uiPulse(){
  const now=window.__gameTime||0;
  for(let i=uiState.feed.length-1;i>=0;i--)if(now>=uiState.feed[i].until){uiState.feed[i].row.remove();uiState.feed.splice(i,1);}
  for(const [id,deadline] of [['hud-hitmarker',uiState.hitUntil],['hud-kill-banner',uiState.bannerUntil],['hud-damage',uiState.damageUntil],['hud-toast',uiState.toastUntil]]) {
    const node=document.getElementById(id);if(node&&deadline&&now>=deadline)node.hidden=true;
  }
  if(uiState.pingHold&&!uiState.pingHold.wheel&&now-uiState.pingHold.at>=220)uiOpenPingWheel();
  if(now>=uiState.nextMap){uiMapUpdate(now);uiUpdateRoster();uiState.nextMap=now+100;}
  const board=document.getElementById('match-scoreboard');
  if(board&&!board.hidden&&now>=uiState.nextBoard){uiScoreboardUpdate();uiState.nextBoard=now+250;}
  if(uiState.report&&VS.player.hp>0){document.getElementById('hud-combat-report').hidden=true;}
}
function uiCloseAll(restore=true){
  uiState.shopOpen=uiState.mapOpen=false;uiState.pingHold=null;
  for(const id of ['ui-buy-menu','hud-full-map','hud-ping-wheel']){const node=document.getElementById(id);if(node)node.hidden=true;}
  if(window.__agentCursorMode)playerController?.cursorMode(false,restore);
}
function uiResetMatch(){
  uiState.seen.clear();uiState.pings=[];uiState.report=null;uiState.reportHidden=false;uiState.rosterKey=uiState.boardKey='';uiState.roundsDone=0;
  uiState.nextMap=uiState.nextBoard=0;uiState.feed.splice(0).forEach(item=>item.row.remove());
  uiState.hitUntil=uiState.bannerUntil=uiState.damageUntil=uiState.toastUntil=0;
  for(const id of ['hud-team-a','hud-team-b','hud-combat-report','hud-kill-pips','hud-ping-world'])document.getElementById(id)?.replaceChildren();
  const report=document.getElementById('hud-combat-report');if(report)delete report.dataset.key;
  for(const id of ['hud-combat-report','hud-kill-banner','hud-damage','hud-hitmarker','hud-toast']){const node=document.getElementById(id);if(node)node.hidden=true;}
}
