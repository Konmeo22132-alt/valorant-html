function matchUIInit() {
  const panel=document.createElement('section');panel.id='match-controls';panel.hidden=!!window.GameEntry;
  panel.innerHTML=`<h3>Chế độ luyện tập</h3><div class="match-buttons"><button id="start-unrated">Unrated · 5v5 bot</button><button id="start-dm">Deathmatch</button><button id="stop-match">Luyện tập tự do</button></div>
    <p id="match-status">Mỗi đặc vụ tối đa 2 lần/team. G: Spike / orb / nhặt súng · H: thả súng · B: mua đồ · Tab: bảng điểm.</p>
    <div id="match-roster" hidden></div><div id="match-shop"></div>`;
  document.getElementById('loading-overlay').appendChild(panel);
  const hud=document.createElement('div');hud.id='match-hud';hud.hidden=true;
  hud.innerHTML='<div id="match-phase"></div><div id="match-objective"></div><progress id="match-progress" max="1" value="0" hidden></progress><div id="match-scoreboard" hidden></div>';
  document.getElementById('game-container').appendChild(hud);
  document.getElementById('start-unrated').onclick=()=>matchBeginSelection('unrated');
  document.getElementById('start-dm').onclick=()=>matchBeginSelection('deathmatch');
  document.getElementById('stop-match').onclick=()=>{clearInterval(matchState.selectionTimer);matchStop();document.getElementById('match-roster').hidden=true;};
}
function matchBeginSelection(mode) {
  const s=matchState;if(s.loading)return;
  playerController.pause();matchStop();s.mode=mode;
  clearInterval(s.selectionTimer);
  const rules=new MatchRules(window.GAME_CONFIG);rules.phase='select';
  const roster=[],cfg=window.GAME_CONFIG.match;
  for(const team of ['a','b'])for(let i=0;i<cfg.teamSize;i++) {
    const preferred=team==='a'&&i===0?VS.player.agent:cfg.playableRoster[i%cfg.playableRoster.length];
    const agent=cfg.playableRoster.find(n=>n===preferred&&roster.filter(p=>p.team===team&&p.agent===n).length<cfg.maxAgentCopiesPerTeam)||cfg.playableRoster.find(n=>roster.filter(p=>p.team===team&&p.agent===n).length<cfg.maxAgentCopiesPerTeam);
    roster.push({team,agent});
  }
  rules.members=roster;s.selectionRules=rules;
  document.getElementById('playable-agent').disabled=true;
  const wrap=document.getElementById('match-roster');wrap.hidden=false;wrap.replaceChildren();
  const timer=document.createElement('p');wrap.appendChild(timer);
  roster.forEach((p,index)=>{
    const label=document.createElement('label');label.textContent=(p.team==='a'?'Team A':'Team B')+' · '+(index===0?'Bạn':'Bot '+(index%5+1))+' ';
    const select=document.createElement('select');
    for(const name of cfg.playableRoster){const option=document.createElement('option');option.value=name;option.textContent=name;select.appendChild(option);}select.value=p.agent;
    select.onchange=()=>{if(!rules.choose(p,select.value)){select.value=p.agent;document.getElementById('match-status').textContent='Đội '+p.team.toUpperCase()+' đã có 2 '+select.options[select.selectedIndex].text+'.';}refresh();};
    label.appendChild(select);wrap.appendChild(label);p.select=select;
  });
  function refresh(){for(const p of roster)for(const o of p.select.options)o.disabled=o.value!==p.agent&&roster.filter(other=>other!==p&&other.team===p.team&&other.agent===o.value).length>=cfg.maxAgentCopiesPerTeam;}
  refresh();
  const button=document.createElement('button');button.textContent='Khóa đội hình và tải trận';wrap.appendChild(button);
  let remaining=cfg.selectionDuration,last=performance.now();
  function lock(){clearInterval(s.selectionTimer);button.disabled=true;roster.forEach(p=>p.select.disabled=true);agentSelect(roster[0].agent);matchStart(mode,roster);}
  button.onclick=lock;
  s.selectionTimer=setInterval(()=>{const now=performance.now();if(!document.hidden&&document.fullscreenElement)remaining-=now-last;last=now;timer.textContent='Chọn đội hình: '+Math.max(0,Math.ceil(remaining/1000))+'s · tối đa 2 bản sao/team';if(remaining<=0)lock();},200);
  document.getElementById('match-status').textContent='Chọn đặc vụ cho hai team, sau đó khóa đội hình.';
}
function matchBuildShop() {
  const wrap=document.getElementById('match-shop');if(!wrap)return;wrap.replaceChildren();if(!matchActive())return;
  const button=document.createElement('button');button.textContent=matchState.rules.phase==='buy'?'Mở cửa hàng · B':'Đã hết giai đoạn mua đồ';
  button.disabled=matchState.mode!=='unrated'||matchState.rules.phase!=='buy';button.onclick=uiShopToggle;wrap.appendChild(button);
  if(uiState.shopOpen)uiBuildShop();
}
function matchUIUpdate() {
  const s=matchState;if(!s.active||!s.rules)return;
  const r=s.rules,now=agentNow(),hud=document.getElementById('match-hud');if(!hud)return;hud.hidden=false;
  const phase=document.getElementById('match-phase'),spike=r.spike;
  const side=s.human.team===r.attacking?'TẤN CÔNG':'PHÒNG THỦ';
  phase.dataset.phase=r.phase;
  phase.textContent=r.phase==='buy'?'GIAI ĐOẠN MUA ĐỒ':r.phase==='end'?(r.winner===s.human.team?'CHIẾN THẮNG':'THẤT BẠI'):r.phase==='complete'?(r.winner===s.human.team?'CHIẾN THẮNG':'THẤT BẠI'):'';
  let objective='';
  if(s.mode==='unrated'){
    if(r.phase==='buy')objective=side+' · NHẤN [B] ĐỂ MUA ĐỒ';
    else if(r.phase==='end'||r.phase==='complete')objective=r.reason;
    else if(spike.state==='planted')objective='SPIKE ĐÃ ĐẶT · G để gỡ';
    else if(spike.state==='dropped')objective='SPIKE RƠI';
    else if(spike.carrier===s.human)objective='BẠN CẦM SPIKE · Giữ G trong site A/B';
  }else objective='DEATHMATCH · '+s.human.kills+' / 40';
  if(s.human.team==='observer'){phase.textContent=['end','complete'].includes(r.phase)?r.reason||'VÒNG ĐẤU KẾT THÚC':'';}
  if(s.human.hp<=0&&!agentState.resurrectAt){
    const target=deathSpectator.target;
    const cloveDeathView=s.mode!=='deathmatch'&&s.human.team!=='observer'&&VS.player.agent==='Clove'&&agentVisual.third&&!deathSpectator.active&&agentNow()-agentState.deathAt<agentConfig().X.window;
    objective=target?'ĐANG XEM '+target.name:cloveDeathView?'GÓC NHÌN TỬ VONG · X hồi sinh · E/Q đồng đội · V free cam':'CAMERA TỰ DO · WASD / Space / Ctrl · E/Q '+(s.human.team==='observer'||s.mode==='deathmatch'?'người chơi':'đồng đội');
  }
  uiText('match-objective',objective);document.getElementById('match-objective').hidden=!objective;
  const channel=spike.channel,progress=document.getElementById('match-progress');progress.hidden=!channel&&!s.orbChannel;
  if(channel)progress.value=Math.min(1,(now-channel.start+channel.progress)/(channel.kind==='plant'?window.GAME_CONFIG.rounds.plantDuration:window.GAME_CONFIG.rounds.defuseDuration));
  else if(s.orbChannel)progress.value=(now-s.orbChannel.start)/window.GAME_CONFIG.match.orbDuration;
  const time=s.mode==='deathmatch'?s.dmEnd:spike.state==='planted'?spike.explodesAt:r.until,secs=Math.max(0,Math.ceil((time-now)/1000));
  uiText('hud-timer',Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0'));
  uiHUDUpdate();agentHUD();uiUpdateRoster();uiScoreboardUpdate();uiCombatReportUpdate();
}
