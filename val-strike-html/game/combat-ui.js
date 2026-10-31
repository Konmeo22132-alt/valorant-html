// Legacy ACS requested by the plan: actual enemy damage + alive-tier kill points
// + multikill. Utility-only assists are not inferred from unobserved events.
function uiRoundStart(){
  uiState.seen.clear();uiState.pings=[];uiState.spikeSeen=false;uiState.pingAt=0;uiState.lastPhase='';uiState.boardKey='';
  for(const p of matchState.rules.members){p.uiScore=p.uiScore||0;p.uiDamage=p.uiDamage||0;p.uiSpent=p.uiSpent||0;p.uiRoundKills=0;p.uiDamageRows=new Map();p.uiRequest=null;}
  uiState.bannerUntil=0;document.getElementById('hud-kill-banner').hidden=true;
}
function uiCombatDamage(victim,source,damage,actual,context={}) {
  const active=typeof matchActive==='function'&&matchActive(),now=agentNow();
  source=source||VS.player;
  victim.uiLastHit={source,weapon:context.weapon||source.bot?.weapon||VS.player.weapon,zone:context.zone||'ability',at:now};
  if(victim===VS.player){
    uiState.damageUntil=now+450;document.getElementById('hud-damage').hidden=false;
    if(source!==victim&&source.position){
      const delta=source.position.subtract(agentPosition()),relative=Math.atan2(delta.x,delta.z)-camera.rotation.y;
      document.getElementById('hud-damage-arrow').style.transform='translate(-50%,-50%) rotate('+relative+'rad)';
    }
  }
  if(!active)return;
  const dealer=matchMember(source),target=matchMember(victim);if(!dealer||!target||dealer===target)return;
  dealer.uiDamageRows=dealer.uiDamageRows||new Map();target.uiDamageRows=target.uiDamageRows||new Map();
  function row(member,other){if(!member.uiDamageRows.has(other.id))member.uiDamageRows.set(other.id,{other,out:0,in:0,zones:{head:0,body:0,leg:0}});return member.uiDamageRows.get(other.id);}
  const outgoing=row(dealer,target),incoming=row(target,dealer);outgoing.out+=damage;incoming.in+=damage;
  if(context.zone&&context.zone in incoming.zones)incoming.zones[context.zone]++;
  if(matchState.mode==='deathmatch'||dealer.team!==target.team){dealer.uiScore=(dealer.uiScore||0)+actual;dealer.uiDamage=(dealer.uiDamage||0)+damage;}
  if(target===matchState.human&&target.hp<=0)uiState.report={killer:dealer,rows:target.uiDamageRows,round:matchState.rules.round};
}
function uiElimination(victim,killer){
  if(!killer||killer===victim||matchState.mode==='unrated'&&killer.team===victim.team)return;
  const alive=matchState.rules.members.filter(p=>p.team===victim.team&&(p.hp>0||p===victim)).length;
  killer.uiScore=(killer.uiScore||0)+(70+20*Math.max(0,Math.min(4,alive-1)))+((killer.uiRoundKills||0)>0?50:0);
  killer.uiRoundKills=(killer.uiRoundKills||0)+1;
  if(killer===matchState.human){
    const now=agentNow(),banner=document.getElementById('hud-kill-banner');banner.hidden=false;
    banner.classList.remove('pop');void banner.offsetWidth;banner.classList.add('pop');uiState.bannerUntil=now+2200;
    uiText('hud-kill-title',victim.entity.uiLastHit?.zone==='head'?'BẮN TRÚNG ĐẦU':'');
    const pips=document.getElementById('hud-kill-pips');pips.replaceChildren();
    for(let i=0;i<Math.min(5,killer.uiRoundKills);i++){const img=document.createElement('img');img.src=uiAsset('kill-pip');img.alt='';pips.appendChild(img);}
  }
}
function uiRecordPurchase(member,price){member.uiSpent=(member.uiSpent||0)+Math.max(0,price);}
function uiUpdateRoster(){
  if(!matchActive()||!matchState.rules?.spike||!matchState.human)return;
  const r=matchState.rules,key=r.spike.state+JSON.stringify(r.members.map(p=>[p.id,p.agent,p.hp>0,p.ult>=p.ultCost,p===r.spike?.carrier]));
  if(key===uiState.rosterKey)return;uiState.rosterKey=key;
  for(const team of ['a','b']){
    const node=document.getElementById('hud-team-'+team);node.replaceChildren();
    for(const p of r.members.filter(p=>p.team===team)){
      const card=document.createElement('div');card.className='hud-portrait'+(p.hp<=0?' dead':'')+(p.ult>=p.ultCost?' ult-ready':'');card.title=p.name+' · '+p.agent;
      const img=document.createElement('img');img.src=uiAsset('portrait-'+p.agent);img.alt=p.agent;card.appendChild(img);
      if(p===r.spike?.carrier&&p.team===matchState.human.team){const spike=document.createElement('img');spike.className='carrier';spike.src=uiAsset('spike-carrier');spike.alt='Spike';card.appendChild(spike);}
      node.appendChild(card);
    }
  }
  document.getElementById('hud-spike-timer').hidden=matchState.mode!=='unrated'||r.spike.state!=='planted';
}
function uiScoreboardUpdate(){
  if(!matchActive())return;const s=matchState,r=s.rules,board=document.getElementById('match-scoreboard');if(!board||board.hidden)return;
  if(s.mode==='deathmatch'){uiDeathmatchScoreboard(board,s);return;}
  const key=JSON.stringify(r.members.map(p=>[p.hp>0,p.kills,p.deaths,p.assists,p.credits,p.ult,p.inventory,p.uiScore,p.uiSpent,p.entity.bot?.ability?.charges]))+JSON.stringify(agentState.charges)+r.round+':'+r.score.a+':'+r.score.b;
  if(key===uiState.boardKey)return;uiState.boardKey=key;
  board.replaceChildren();const title=document.createElement('div');title.className='board-title';title.textContent=r.score.a+' — '+r.score.b;board.appendChild(title);
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>TÊN</th><th>CHIÊU CUỐI</th><th>HẠ GỤC</th><th>TỬ TRẬN</th><th>HỖ TRỢ</th><th title="Điểm chiến đấu trung bình">ĐIỂM CHIẾN ĐẤU</th><th>TRANG BỊ</th><th>TIỀN</th><th title="Sát thương trên mỗi 1.000 tiền đã chi">KINH TẾ</th></tr></thead>';
  for(const team of ['a','b']){
    const body=document.createElement('tbody');body.className=team===s.human.team?'board-ally':'board-enemy';
    for(const p of r.members.filter(p=>p.team===team).sort((a,b)=>(b.uiScore||0)-(a.uiScore||0))){
      const row=document.createElement('tr');row.className=(p===s.human?'you ':'')+(p.hp<=0?'dead':'');
      const cell=document.createElement('td');const portrait=document.createElement('img');portrait.src=uiAsset('portrait-'+p.agent);portrait.alt=p.agent;cell.appendChild(portrait);
      const name=document.createElement('span');name.textContent=p.name;cell.appendChild(name);row.appendChild(cell);
      const values=[p.ult+'/'+p.ultCost,p.kills,p.deaths,p.assists,Math.round((p.uiScore||0)/Math.max(1,uiState.roundsDone+(r.phase==='live'?1:0)))];
      for(const value of values){const td=document.createElement('td');td.textContent=value;row.appendChild(td);}
      const equipment=document.createElement('td');
      // Opponent weapon/credits are not queried through this UI.
      if(p.team===s.human.team||s.mode==='deathmatch'){
        const gun=p.inventory.primary||p.inventory.secondary;if(gun){const icon=document.createElement('img');icon.className='board-gun';icon.src=uiAsset('weapon-'+gun);icon.alt=gun;equipment.appendChild(icon);}
        const a=p===s.human?agentState.charges:p.entity.bot?.ability?.charges;
        equipment.title=a?'C/Q/E '+a.C+'/'+a.Q+'/'+a.E:'';
      }else equipment.textContent='—';row.appendChild(equipment);
      for(const value of [p.team===s.human.team||s.mode==='deathmatch'?p.credits:'—',p.uiSpent?Math.round((p.uiDamage||0)/p.uiSpent*1000):'—']){const td=document.createElement('td');td.textContent=value;row.appendChild(td);}
      body.appendChild(row);
    }table.appendChild(body);
  }
  board.appendChild(table);
}
function uiDeathmatchScoreboard(board,s){const players=s.rules.members.filter(p=>p.team!=='observer').sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths),key='dm:'+JSON.stringify(players.map(p=>[p.id,p.kills,p.deaths,p.assists,p.hp>0,p.weapon]));if(uiState.boardKey===key)return;uiState.boardKey=key;board.replaceChildren();const title=document.createElement('div');title.className='board-title';title.textContent='DEATHMATCH · 40 HẠ GỤC';board.appendChild(title);const table=document.createElement('table');table.innerHTML='<thead><tr><th>HẠNG</th><th>TÊN</th><th>HẠ GỤC</th><th>TỬ TRẬN</th><th>HỖ TRỢ</th><th>VŨ KHÍ</th></tr></thead>';const body=document.createElement('tbody');players.forEach((p,i)=>{const row=document.createElement('tr');row.className=(p===s.human?'you ':'')+(p.hp<=0?'dead':'');for(const value of [i+1,p.name,p.kills,p.deaths,p.assists,p.weapon||p.inventory.primary]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}body.appendChild(row);});table.appendChild(body);board.appendChild(table);}
function uiCombatReportUpdate(){
  const report=uiState.report,node=document.getElementById('hud-combat-report');if(!node)return;
  node.hidden=!report||uiState.reportHidden||VS.player.hp>0;if(node.hidden)return;
  const signature=report.round+':'+report.killer?.id+':'+JSON.stringify([...report.rows].map(([id,x])=>[id,x.out,x.in,x.zones]))+matchState.rules.phase;
  if(node.dataset.key===signature)return;node.dataset.key=signature;node.replaceChildren();
  const header=document.createElement('h3');header.textContent='BÁO CÁO GIAO TRANH';node.appendChild(header);
  const killer=document.createElement('p');killer.textContent='BỊ HẠ BỞI '+(report.killer?.name||'Abyss')+' · VÒNG '+report.round;node.appendChild(killer);
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>ĐỐI TƯỢNG</th><th>GÂY</th><th>NHẬN</th>'+['head','body','leg'].map((zone,i)=>'<th><img class="report-zone" alt="'+['Đầu','Thân','Chân'][i]+'" src="'+uiAsset('paper-'+zone)+'"></th>').join('')+'</tr></thead>';
  for(const row of report.rows.values()){
    const tr=document.createElement('tr');for(const value of [row.other.name,Math.round(row.out),Math.round(row.in),row.zones.head,row.zones.body,row.zones.leg]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}table.appendChild(tr);
  }node.appendChild(table);
  const hint=document.createElement('p');hint.textContent='[N] ẨN / HIỆN BÁO CÁO';node.appendChild(hint);
}
