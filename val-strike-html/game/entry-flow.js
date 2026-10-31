// Production match entry: agent selection -> rosters -> map loading -> game.
window.GameEntry=(()=>{
  const params=new URLSearchParams(location.search),network=!!params.get('room');
  let mode=params.get('mode')||'unrated';const range=params.get('map')==='range'&&!network;
  const mapName=()=>VSMaps.get(MAP_MODE)?.name.toUpperCase()||'KHU LUYỆN TẬP';
  function mapBackdrop(){root?.style.setProperty('--entry-map-image','url("'+(VSMaps.get(MAP_MODE)?.background||VSMaps.get('abyss').background)+'")');}
  const roleNames={controller:'KIỂM SOÁT',duelist:'ĐỐI ĐẦU',sentinel:'HỘ VỆ',initiator:'KHỞI TRANH'};
  const roleText={controller:'Chia cắt tầm nhìn. Kiểm soát nhịp giao tranh.',duelist:'Tạo khoảng trống. Dẫn đầu những pha giao tranh.',sentinel:'Bảo vệ đồng đội. Giữ vững khu vực.',initiator:'Tìm thông tin. Mở đường cho đồng đội.'};
  const skillText={Clove:['Hấp thụ sinh lực từ kẻ địch vừa hạ gục hoặc hỗ trợ.','Ném tinh thể gây suy yếu trong vùng tác động.','Đặt khói qua bản đồ chiến thuật, kể cả sau khi đã chết.','Tự hồi sinh; hạ gục hoặc hỗ trợ để tiếp tục sống.'],Jett:['Ném một vùng khói che khuất tầm nhìn.','Phóng lên cao để đổi góc tiếp cận.','Chuẩn bị rồi lướt nhanh theo hướng di chuyển.','Trang bị phi tiêu chính xác; hạ gục để bổ sung lại.'],Sage:['Dựng tường băng để chặn đường và tạo vị trí mới.','Ném ngọc tạo vùng băng làm chậm.','Hồi phục cho đồng đội hoặc bản thân.','Hồi sinh một đồng đội đã ngã xuống.']};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const thumb=n=>'/assets/menu/thumb-'+encodeURIComponent(n)+'.png';
  const agents=()=>VS_AGENTS.filter(a=>a.available),playable=()=>agents().filter(a=>a.playable);
  const agentByName=n=>agents().find(a=>a.name===n)||playable()[0];
  let phase='boot',root,viewer,client,room,preview,chosen,locked=false,role='all',ability='E',roster=[],deadline=0,startAt=0,timer,loading=false,completing=false,errorNode,progressValue=0,rosterKey='',agentKey='',gridKey='';
  const $=selector=>root?.querySelector(selector);
  function setPhase(next){phase=next;document.body.dataset.entry=next;}
  function notice(text){const node=$('#entry-notice');if(node)node.textContent=text;}
  function badge(){return `<header class="entry-header"><a class="entry-back" href="/play" aria-label="Trở về sảnh">〈 <span>TRỞ VỀ</span></a><div class="entry-map"><i></i><div><strong>${range?'KHU LUYỆN TẬP':mapName()}</strong><span>${network?(room?.mode==='custom'?'CUSTOM · '+mode.toUpperCase():mode.toUpperCase()):range?'LUYỆN TẬP':mode.toUpperCase()+' · BOT'}</span></div></div><span class="entry-step">${phase==='selection'?'CHỌN ĐẶC VỤ':phase==='reveal'?'ĐỘI HÌNH TRẬN ĐẤU':''}</span></header>`;}
  function playerCard(p,index,enemy=false){
    const known=!!p.agent,name=p.human?VSProfile.load().name:p.name||'Đồng đội '+(index+1);
    return `<article class="entry-player ${p.human?'you':''} ${p.locked&&known?'is-locked':''} ${enemy?'enemy':''}"><div class="entry-player-image">${known?`<img src="${thumb(p.agent)}" alt="${esc(p.agent)}">`:'<span>◇</span>'}</div><div><strong>${esc(name)}${p.human?' <small>(BẠN)</small>':''}</strong><span>${known?esc(p.agent):'Đang chọn đặc vụ'}${known&&p.locked?' <b>✓</b>':''}</span></div></article>`;
  }
  function self(){return room?.members.find(p=>p.id===client?.session?.self);}
  function allies(){if(!network)return roster.filter(p=>p.team==='a');const player=self();return room?.members.filter(p=>player?.team==='observer'?p.team!=='observer':p.team===player?.team).map(p=>({...p,human:p.id===player?.id}))||[];}
  function count(name){return allies().filter(p=>p.locked&&p.agent===name&&!p.human&&p.id!==client?.session?.self).length;}
  function selection(){
    setPhase('selection');rosterKey=agentKey=gridKey='';root.innerHTML=badge()+`<div class="entry-select-layout"><aside class="entry-team"><div class="entry-count"><span>CHỌN ĐẶC VỤ</span><strong id="entry-clock">90</strong></div><div id="entry-allies"></div></aside><section class="entry-model"><canvas id="entry-model-canvas" aria-label="Xem model đặc vụ"></canvas><div class="entry-agent-heading"><span id="entry-role"></span><h1 id="entry-agent-name"></h1></div></section><aside class="entry-picks"><div class="entry-filters" role="group" aria-label="Vai trò đặc vụ">${[['all','TẤT CẢ'],...Object.entries(roleNames)].map(([r,label])=>`<button data-entry-role="${r}" title="${label}" aria-label="${label}" class="${role===r?'active':''}"><img src="/assets/menu/role-${r}.png" alt=""></button>`).join('')}</div><div id="entry-agent-grid" class="entry-agent-grid"></div><div class="entry-lock-area"><div class="entry-lock-rule">Tối đa 2 lần mỗi đặc vụ / đội</div><button id="entry-lock" class="entry-lock">KHÓA ĐẶC VỤ <span>↗</span></button><p id="entry-notice" aria-live="polite">Chọn đặc vụ của bạn.</p></div></aside><section class="entry-info"><div id="entry-skills" class="entry-skills"></div><h2 id="entry-skill-name"></h2><p id="entry-skill-description"></p></section></div>`;
    $('.entry-back').onclick=leave;
    $('.entry-picks').prepend($('.entry-agent-heading'));
    root.querySelectorAll('[data-entry-role]').forEach(button=>button.onclick=()=>{role=button.dataset.entryRole;root.querySelectorAll('[data-entry-role]').forEach(b=>b.classList.toggle('active',b===button));grid();});
    $('#entry-lock').onclick=lock;
    viewer=VSAgentViewer($('#entry-model-canvas'),agentByName(preview).file,{locked:!agentByName(preview).playable,maxFPS:60,maxResolution:900,radius:3.05,targetY:1.01});
    drawAgent();grid();drawTeam();tick();
  }
  function grid(){
    const list=agents().filter(a=>role==='all'||a.role===role),node=$('#entry-agent-grid');if(!node)return;
    const key=JSON.stringify([role,preview,playable().map(a=>count(a.name))]);if(key===gridKey)return;gridKey=key;
    node.innerHTML=list.map(a=>`<button class="entry-agent ${preview===a.name?'active':''} ${!a.playable?'locked':''} ${count(a.name)>=2?'full':''}" data-entry-agent="${esc(a.name)}" title="${esc(a.name)}${a.playable?'':' · Đã khóa'}" aria-label="${esc(a.name)}${a.playable?'':' · Đã khóa'}" aria-pressed="${preview===a.name}"><img src="${thumb(a.name)}" alt="">${a.playable?'':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0110 0v3M5 10h14v11H5zM12 14v3"/></svg>'}${count(a.name)>=2?'<span class="entry-agent-full">2/2</span>':''}</button>`).join('');
    node.querySelectorAll('button').forEach(button=>button.onclick=()=>pick(button.dataset.entryAgent));
  }
  function drawAgent(){
    const key=JSON.stringify([preview,ability,locked,self()?.team,playable().map(a=>count(a.name))]);if(key===agentKey)return;agentKey=key;
    const agent=agentByName(preview),cfg=window.GAME_CONFIG['playable-agents'][agent.name];
    $('#entry-role').textContent=roleNames[agent.role];$('#entry-agent-name').textContent=agent.name.toUpperCase();root.style.setProperty('--agent-accent',cfg?.color||'#e9e9e4');
    const button=$('#entry-lock'),observer=self()?.team==='observer';button.hidden=!agent.playable||observer;
    button.disabled=locked||count(agent.name)>=2;button.innerHTML=locked?'ĐÃ KHÓA <span>✓</span>':'KHÓA ĐẶC VỤ <span>↗</span>';
    const skills=$('#entry-skills');skills.innerHTML=cfg?['C','Q','E','X'].map(slot=>`<button data-entry-skill="${slot}" class="${ability===slot?'active':''}" aria-label="${esc(uiAbilityLabel(slot,agent.name))}"><kbd>${slot}</kbd><img alt="" src="/assets/playable/vfx/${cfg.code}-${slot}.png"></button>`).join(''):'';
    skills.querySelectorAll('button').forEach(b=>b.onclick=()=>{ability=b.dataset.entrySkill;drawAgent();});
    $('#entry-skill-name').textContent=cfg?uiAbilityLabel(ability,agent.name):'ĐẶC VỤ ĐÃ KHÓA';
    $('#entry-skill-description').textContent=cfg?skillText[agent.name]?.[['C','Q','E','X'].indexOf(ability)]||roleText[agent.role]:'Đặc vụ này chưa được mở để chơi.';
    if(observer)notice('Bạn đang quan sát. Chờ những người chơi khóa đặc vụ.');
    else if(!agent.playable)notice('Đặc vụ này chưa được mở để chơi.');
    else if(count(agent.name)>=2)notice('Đội đã có hai '+agent.name+'. Hãy chọn đặc vụ khác.');
    else if(locked)notice('Đã khóa đặc vụ. Chờ hết thời gian chọn.');
    else notice('Chọn đặc vụ, sau đó khóa lựa chọn của bạn.');
  }
  function drawTeam(){
    const list=allies(),key=JSON.stringify(list.map(p=>[p.id,p.agent,p.locked,locked]));if(key===rosterKey)return;rosterKey=key;
    $('#entry-allies').innerHTML=list.map((p,i)=>playerCard(p,i)).join('');
  }
  async function pick(name){
    if(phase!=='selection'||locked||self()?.team==='observer')return;
    const agent=agentByName(name);preview=agent.name;viewer.load(agent.file,{locked:!agent.playable});
    if(agent.playable&&count(name)<2){chosen=name;if(!network)roster[0].agent=name;else{const result=await client.command('pickAgent',{agent:name});if(!result.ok)notice(result.message);}}
    grid();drawAgent();drawTeam();
  }
  async function lock(){
    const agent=agentByName(preview);if(locked||!agent.playable||count(agent.name)>=2)return;
    if(network){$('#entry-lock').disabled=true;const result=await client.command('lockAgent',{agent:agent.name});if(!result.ok){drawAgent();notice(result.message);return;}locked=true;chosen=agent.name;}
    else{locked=true;chosen=agent.name;Object.assign(roster[0],{agent:chosen,locked:true});}
    VSProfile.save({agent:chosen});drawAgent();drawTeam();
  }
  function botPick(p){
    if(p.locked)return;
    const cfg=window.GAME_CONFIG.match,candidates=cfg.playableRoster.filter(name=>roster.filter(q=>q!==p&&q.team===p.team&&q.locked&&q.agent===name).length<cfg.maxAgentCopiesPerTeam);
    p.agent=candidates[Math.floor(Math.random()*candidates.length)];p.locked=true;
  }
  function tick(){
    if(phase!=='selection')return;
    if(!network){
      roster.filter(p=>p.bot&&!p.locked).forEach(p=>{if(performance.now()-startAt>=p.pickAt)botPick(p);});drawTeam();gridState();
      if(roster.every(p=>p.locked))deadline=Math.min(deadline,performance.now()+10000);
    }
    const remaining=Math.max(0,deadline-performance.now()),node=$('#entry-clock');if(node)node.textContent=Math.ceil(remaining/1000);
    if(!network){
      if(!remaining){
        if(!locked){const choices=playable().filter(a=>count(a.name)<2);chosen=choices.find(a=>a.name===chosen)?.name||choices[0]?.name;Object.assign(roster[0],{agent:chosen,locked:true});locked=true;}
        roster.filter(p=>p.bot).forEach(botPick);reveal(roster);setTimeout(()=>loadGame(),4000);
      }
    }
  }
  function gridState(){if(phase==='selection'){grid();drawAgent();}}
  function reveal(members){
    if(phase==='reveal')return;viewer?.dispose();viewer=null;setPhase('reveal');
    const player=network?self():{team:'a'},friendly=members.filter(p=>p.team===player.team).map(p=>({...p,human:p.human||p.id===player.id})),enemy=members.filter(p=>p.team!==player.team&&p.team!=='observer');
    const column=(list,title,cls)=>`<section class="entry-lineup ${cls}"><h2>${title}</h2>${list.map((p,i)=>playerCard({...p,locked:true},i,cls==='enemy')).join('')}</section>`;
    root.innerHTML=badge()+`<div class="entry-versus"><div class="entry-versus-title"><span>${network?(room?.mode==='custom'?'CUSTOM · '+mode.toUpperCase():mode.toUpperCase()):mode.toUpperCase()}</span><h1>${mapName()}</h1><p>ĐỘI HÌNH ĐÃ SẴN SÀNG</p></div><div class="entry-versus-teams">${column(friendly,'ĐỘI CỦA BẠN','ally')}<strong class="entry-vs">VS</strong>${column(enemy,'ĐỘI ĐỐI PHƯƠNG','enemy')}</div></div>`;
    $('.entry-back').onclick=leave;
  }
  function loadingScreen(){
    if(phase==='loading')return;viewer?.dispose();viewer=null;setPhase('loading');progressValue=0;
    root.innerHTML=`<section class="entry-loading"><div class="entry-loading-lines"></div><div class="entry-loading-map"><span>${range?'LUYỆN TẬP':'ĐẤU TRƯỜNG'}</span><h1>${range?'KHU LUYỆN TẬP':mapName()}</h1></div><div class="entry-loading-bottom"><span id="entry-loading-label">Đang chuẩn bị bản đồ…</span><strong id="entry-loading-percent">0%</strong><div class="entry-loading-track" role="progressbar" aria-label="Đang tải trận đấu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="entry-loading-fill"></i></div><p id="entry-load-error" hidden></p><button id="entry-retry" hidden>TẢI LẠI</button><a href="/play" id="entry-load-back" hidden>TRỞ VỀ SẢNH</a></div></section>`;
    $('#entry-retry').onclick=()=>location.reload();errorNode=$('#entry-load-error');
  }
  function progress(value,label){if(phase!=='loading')return;progressValue=Math.max(progressValue,Math.min(1,value));const percent=Math.floor(progressValue*100);$('#entry-loading-label').textContent=label;$('#entry-loading-percent').textContent=percent+'%';$('#entry-loading-fill').style.width=percent+'%';$('.entry-loading-track').setAttribute('aria-valuenow',percent);}
  async function waitForAgent(){
    const end=performance.now()+120000;
    while(!agentState.visualReady){if(window.__agentVisualStatus?.state==='failed')throw Error(window.__agentVisualStatus.error);if(performance.now()>end)throw Error('Không tải được đặc vụ. Hãy thử tải lại.');await new Promise(resolve=>setTimeout(resolve,80));}
  }
  async function loadGame(){
    if(loading||phase==='playing')return;loading=true;loadingScreen();
    try{
      if(!network){const url=new URL(location.href);url.searchParams.set('agent',chosen);history.replaceState(null,'',url);}
      await initEngine();progress(.62,'Đang chuẩn bị đặc vụ…');initPlayer();
      const refill=document.getElementById('practice-refill');if(refill){refill.hidden=!range;refill.onclick=()=>{agentReset(true);uiHUDUpdate();};}
      await waitForAgent();progress(.76,'Đang chuẩn bị đội hình…');
      const weapon=params.get('weapon');if(range&&weaponDefs()[weapon])weaponSwitch(weapon);
      if(network){progress(.94,'Chờ những người chơi khác…');return;}
      if(!range){await matchStart(mode,roster);if(!matchState.active)throw Error(document.getElementById('match-status')?.textContent||'Không thể tải trận đấu.');}
      progress(.9,'Đang hoàn thiện trận đấu…');await scene.whenReadyAsync();complete();
    }catch(error){fail(error);}
  }
  async function complete(){
    if(phase==='playing'||phase==='ready'||completing)return;completing=true;
    try{
      // Team B may spawn on the opposite side of the map from the initial
      // preload camera. Prepare its actual view before removing map loading.
      if(window.mapStreamer)await window.mapStreamer.prime(camera.position,camera.rotation.y,window.GAME_CONFIG.movement.baseFov,p=>progress(.94+.05*p.loaded/Math.max(1,p.total),'Đang tải khu vực xuất phát…'),{all:mode==='deathmatch'});
      await scene.whenReadyAsync();progress(1,'Sẵn sàng');clearInterval(timer);
      document.getElementById('loading-overlay').style.display='none';
      if(document.fullscreenElement){enterGame();return;}
      setPhase('ready');
      $('#entry-loading-label').textContent='Đã tải xong trận đấu';
      const enter=document.createElement('button');enter.type='button';enter.className='entry-enter';
      enter.innerHTML='<span>NHẤP BẤT KỲ ĐỂ VÀO TOÀN MÀN HÌNH</span><small>Trận đấu đã sẵn sàng</small>';
      enter.onclick=async()=>{
        if(enter.disabled)return;enter.disabled=true;setPhase('playing');
        const started=await playerController.startFullscreen();
        if(started){enterGame();return;}
        setPhase('ready');document.getElementById('loading-overlay').style.display='none';enter.disabled=false;
        enter.querySelector('small').textContent='Chưa mở được toàn màn hình. Nhấp để thử lại.';enter.focus();
      };
      $('.entry-loading').appendChild(enter);enter.focus();
    }catch(error){fail(error);}finally{completing=false;}
  }
  function enterGame(){setPhase('playing');root.hidden=true;root.setAttribute('aria-hidden','true');document.getElementById('loading-overlay').style.display='none';playerController.presentGame();window.__renderOnce=true;}
  function fail(error){console.error('[match entry]',error);if(!root){root=document.createElement('main');root.id='entry-shell';document.body.appendChild(root);}loadingScreen();progress(progressValue,'Không thể vào trận');errorNode.textContent=String(error?.message||error);errorNode.hidden=false;$('#entry-retry').hidden=false;$('#entry-load-back').hidden=false;}
  function leave(event){event?.preventDefault();clearInterval(timer);client?.leave();location.assign('/play');}
  function roomUpdate(next){
    room=next;selectGameMap(next.map||'abyss');mode=next.gameMode||(next.mode==='deathmatch'?'deathmatch':'unrated');mapBackdrop();const player=self();if(!player)return;
    if(next.phase==='lobby'){leave();return;}
    if(next.phase==='selecting'){
      if(phase!=='selection'){chosen=player.agent||chosen;preview=chosen;locked=!!player.locked;selection();}
      deadline=performance.now()+Math.max(0,next.selectionRemaining||0);locked=!!player.locked;if(player.agent&&player.locked)chosen=player.agent;
      drawTeam();drawAgent();grid();
    }else if(next.phase==='revealing'){chosen=player.agent||chosen;locked=true;reveal(next.members);}
    else if(['loading','playing','complete'].includes(next.phase))loadGame();
  }
  async function start(){
    selectGameMap(MAP_MODE);
    chosen=playable().some(a=>a.name===params.get('agent'))?params.get('agent'):VSProfile.load().agent;chosen=playable().some(a=>a.name===chosen)?chosen:'Clove';preview=chosen;
    root=document.createElement('main');root.id='entry-shell';document.body.appendChild(root);document.body.dataset.production='true';mapBackdrop();
    if(network){
      loadingScreen();progress(.02,'Đang kết nối phòng…');client=new VSNetwork();
      client.on(data=>{if(data.type==='room')roomUpdate(data.room);if(data.type==='snapshot'&&['boot','selection','reveal'].includes(phase))roomUpdate(data.room);if(data.type==='error'&&phase!=='playing'){if(phase==='selection')notice(data.message);else fail(Error(data.message));}});
      if(!VSAccount.room)throw Error('Phiên phòng đã hết hạn. Hãy trở về sảnh.');await client.restore();
    }else{
      const cfg=window.GAME_CONFIG.match;roster=[{id:'self',team:'a',human:true,agent:chosen,locked:false}];
      for(const team of ['a','b'])for(let i=team==='a'?1:0;i<cfg.teamSize;i++)roster.push({id:team+i,team,bot:true,name:'Bot '+(i+1),agent:null,locked:false,pickAt:2500+i*2600+Math.random()*1400});
      startAt=performance.now();deadline=startAt+(range?20000:cfg.selectionDuration);selection();
    }
    timer=setInterval(tick,200);window.addEventListener('pagehide',()=>{clearInterval(timer);viewer?.dispose();client?.close();},{once:true});
  }
  return {start,progress,complete,fail,get phase(){return phase;},get pending(){return phase!=='playing';},get client(){return client;},get room(){return room;}};
})();
window.CONFIG_READY.then(()=>GameEntry.start()).catch(error=>GameEntry.fail(error));
