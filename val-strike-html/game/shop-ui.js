const uiShopCategories=[['SÚNG PHỤ',['Classic','Shorty','Frenzy','Ghost','Sheriff']],['TIỂU LIÊN',['Stinger','Spectre']],['SÚNG SĂN',['Bucky','Judge']],
  ['SÚNG TRƯỜNG',['Bulldog','Guardian','Phantom','Vandal']],['SÚNG BẮN TỈA',['Marshal','Outlaw','Operator']],['SÚNG MÁY',['Ares','Odin']]];
function uiInitShop(){
  const menu=document.createElement('section');menu.id='ui-buy-menu';menu.hidden=true;menu.setAttribute('aria-label','Mua trang bị');
  document.getElementById('game-container').appendChild(menu);
}
function uiShopToggle(){
  if(matchActive()&&matchState.mode==='deathmatch'&&typeof multiplayerActive==='function'&&multiplayerActive()){
    if(matchState.rules.phase!=='live'||VS.player.hp<=0)return;uiState.shopOpen=!uiState.shopOpen;
    if(uiState.shopOpen){agentCancelEquip();weaponClearInput();playerController.stop();}document.getElementById('ui-buy-menu').hidden=!uiState.shopOpen;playerController.cursorMode(uiState.shopOpen);if(uiState.shopOpen)uiBuildShop();return;
  }
  if(!matchActive()||matchState.mode!=='unrated'){uiToast('Mua đồ chỉ có trong Unrated.');return;}
  if(matchState.rules.phase!=='buy'){uiToast('Đã hết thời gian mua đồ.');return;}
  uiState.shopOpen=!uiState.shopOpen;
  if(uiState.shopOpen){uiState.mapOpen=false;document.getElementById('hud-full-map').hidden=true;agentCancelEquip();weaponClearInput();playerController.stop();}
  document.getElementById('ui-buy-menu').hidden=!uiState.shopOpen;playerController.cursorMode(uiState.shopOpen);
  if(uiState.shopOpen)uiBuildShop();
}
function uiShopRefresh(){uiHUDUpdate();matchUIUpdate();if(uiState.shopOpen)uiBuildShop();}
function uiBuyWeapon(name,recipient=matchState.human,payer=matchState.human){
  const s=matchState,def=weaponDef(name),gift=recipient!==payer;
  if(!s.active||s.rules.phase!=='buy'||s.mode!=='unrated'||!def||recipient.hp<=0||recipient.team!==payer.team)return false;
  const item=gift?'gift:'+recipient.id+':'+name:'gun:'+name;
  const ok=s.rules.buy(payer,item,def.price,()=>{
    if(recipient.inventory[def.slot]===name)return false;
    const old=recipient.inventory[def.slot];if(old&&old!=='Classic')matchDrop(old,matchMemberPoint(recipient),recipient);
    recipient.inventory[def.slot]=name;recipient.uiRequest=null;return true;
  });
  if(ok){if(recipient===s.human)matchApplyLoadout();else matchBotSpawn(recipient.entity.bot,recipient.entity.position.clone());}
  else uiToast('Không đủ tiền hoặc đã sở hữu trang bị này.');
  uiShopRefresh();return ok;
}
function uiSellWeapon(name){
  const s=matchState,p=s.human,def=weaponDef(name);
  const ok=s.rules.sell(p,'gun:'+name,()=>{if(p.inventory[def.slot]!==name)return false;p.inventory[def.slot]=def.slot==='secondary'?'Classic':null;return true;});
  if(ok){p.uiSpent=Math.max(0,(p.uiSpent||0)-def.price);matchApplyLoadout();}uiShopRefresh();
}
function uiRequestWeapon(name){
  if(!matchActive()||matchState.rules.phase!=='buy')return;
  const p=matchState.human,def=weaponDef(name);if(p.inventory[def.slot]===name)return;
  p.uiRequest=name;uiToast('Đã xin '+name+' · chọn đồng đội đủ tiền ở cột trái.');uiBuildShop();
}
function uiBuyArmor(name){
  const s=matchState,p=s.human,def=window.GAME_CONFIG.weapons.armor[name];
  if(p.bought.some(b=>b.item.startsWith('armor:'))){uiToast('Bán giáp vừa mua trước khi đổi loại.');return;}
  s.rules.buy(p,'armor:'+name,def.price,()=>{
    if(p.armor===def.absorb&&VS.player.armorType===name)return false;
    p.previousArmor={type:VS.player.armorType,armor:p.armor,pool:VS.player.regenPool};combatEquipArmor(VS.player,name);return true;
  });uiShopRefresh();
}
function uiSellArmor(name){
  const s=matchState,p=s.human,def=window.GAME_CONFIG.weapons.armor[name];
  const ok=s.rules.sell(p,'armor:'+name,()=>{if(VS.player.armorType!==name)return false;const old=p.previousArmor;combatEquipArmor(VS.player,old?.type||'none');p.armor=old?.armor||0;VS.player.regenPool=old?.pool||0;return true;});
  if(ok)p.uiSpent=Math.max(0,(p.uiSpent||0)-def.price);uiShopRefresh();
}
function uiShopDetails(name){
  const node=document.getElementById('shop-item-detail');if(!node)return;const def=weaponDef(name);node.replaceChildren();
  const heading=document.createElement('h3');heading.textContent=name.toUpperCase();node.appendChild(heading);
  function subheading(text){const h=document.createElement('h4');h.textContent=text;node.appendChild(h);}
  subheading('CHẾ ĐỘ BẮN CHÍNH');
  const mode=document.createElement('p');mode.className='shop-fire-mode';mode.textContent=def.auto?'Tự động':'Bán tự động';node.appendChild(mode);
  const movement=window.GAME_CONFIG.movement,kind=movement?.classByWeapon[name],speed=movement?.speedByWeaponClass[kind];
  const stats=document.createElement('div');stats.className='shop-stats';
  for(const [label,value,unit] of [['TỐC ĐỘ BẮN',def.fireRate,'viên/giây'],['TỐC ĐỘ DI CHUYỂN',speed,'m/giây'],['TỐC ĐỘ TRANG BỊ',def.equipTime/1000,'giây'],['ĐỘ LỆCH PHÁT ĐẦU',def.spread?.firstShot,'độ'],['TỐC ĐỘ NẠP ĐẠN',def.reloadTime/1000,'giây'],['BĂNG ĐẠN',def.mag,'viên']]){
    const cell=document.createElement('div'),title=document.createElement('span'),number=document.createElement('strong'),suffix=document.createElement('small');title.textContent=label;number.textContent=Number.isFinite(value)?value:'—';suffix.textContent=unit;cell.append(title,number,suffix);stats.appendChild(cell);
  }node.appendChild(stats);
  subheading('SÁT THƯƠNG');
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');header.appendChild(document.createElement('th'));
  let from=0;for(const damage of def.damage){const th=document.createElement('th');th.textContent=from+'–'+damage[0]+' m';header.appendChild(th);from=damage[0];}head.appendChild(header);table.appendChild(head);
  for(const [index,label] of [[1,'ĐẦU'],[2,'THÂN'],[3,'CHÂN']]){const row=document.createElement('tr'),th=document.createElement('th');th.textContent=label;row.appendChild(th);for(const damage of def.damage){const td=document.createElement('td');td.textContent=damage[index];row.appendChild(td);}table.appendChild(row);}node.appendChild(table);
  const penetration=document.createElement('p');penetration.textContent='Xuyên tường: '+({low:'Thấp',medium:'Trung bình',high:'Cao'}[def.penetration]||'—');node.appendChild(penetration);
  if(def.adsZoom||def.altFire){subheading('CHẾ ĐỘ BẮN PHỤ');const secondary=document.createElement('p');secondary.textContent=def.altFire?.type==='burst'?'Loạt '+def.altFire.count+' viên · Ngắm '+def.adsZoom+'×':def.altFire?.type==='shotgun'?'Loạt '+def.altFire.pellets+' viên':def.altFire?.type==='airburst'?'Đạn nổ trên không':def.adsZoom?'Ngắm '+def.adsZoom+'×':'';node.appendChild(secondary);}
}
function uiBuildShop(){
  const menu=document.getElementById('ui-buy-menu');if(!menu||!matchActive())return;
  if(matchState.mode==='deathmatch'&&typeof multiplayerActive==='function'&&multiplayerActive()){uiBuildDeathmatchWeapons(menu);return;}
  const s=matchState,p=s.human;if(s.rules.phase!=='buy'){if(uiState.shopOpen)uiCloseAll();return;}
  menu.replaceChildren();
  const header=document.createElement('header');header.innerHTML='<button type="button" aria-label="Đóng cửa hàng">×</button>';
  header.querySelector('button').onclick=uiShopToggle;menu.appendChild(header);
  const grid=document.createElement('div');grid.className='shop-layout';menu.appendChild(grid);
  const team=document.createElement('aside');team.className='shop-team';grid.appendChild(team);
  for(const member of s.rules.members.filter(m=>m.team===p.team)){
    const card=document.createElement('div');card.className='shop-teammate'+(member===p?' shop-you':'');
    const portrait=document.createElement('img');portrait.src=uiAsset('portrait-'+member.agent);portrait.alt=member.agent;card.appendChild(portrait);
    const text=document.createElement('div');text.className='shop-member-info';const memberName=document.createElement('span');memberName.textContent=member.name;const money=document.createElement('strong');money.innerHTML=uiCreditMarkup(member.credits);text.append(memberName,money);card.appendChild(text);
    const loadout=document.createElement('img');loadout.className='shop-team-weapon';loadout.src=uiAsset('weapon-'+(member.inventory.primary||member.inventory.secondary||'Classic'));loadout.alt=member.inventory.primary||member.inventory.secondary;card.appendChild(loadout);
    const online=typeof multiplayerActive==='function'&&multiplayerActive();
    if(member!==p&&p.uiRequest&&!online){const price=weaponDef(p.uiRequest).price,button=document.createElement('button');button.textContent='Mua hộ '+p.uiRequest;button.disabled=member.credits<price||member.hp<=0;button.onclick=()=>uiBuyWeapon(p.uiRequest,p,member);card.appendChild(button);}
    if(member!==p&&online&&member.uiRequest){const request=document.createElement('button'),name=member.uiRequest;request.textContent='Mua hộ '+name;request.disabled=p.credits<weaponDef(name).price||member.hp<=0;request.onclick=()=>uiBuyWeapon(name,member,p);card.appendChild(request);}
    if(member!==p&&!online&&!member.inventory.primary&&s.rules.round>1&&member.credits<weaponDef('Vandal').price){
      member.uiRequest='Vandal';const request=document.createElement('button');request.textContent='Xin Vandal · '+weaponDef('Vandal').price;request.disabled=p.credits<weaponDef('Vandal').price;request.onclick=()=>uiBuyWeapon('Vandal',member,p);card.appendChild(request);
    }team.appendChild(card);
  }
  if(p.uiRequest){const cancel=document.createElement('button');cancel.textContent='Hủy xin '+p.uiRequest;cancel.onclick=()=>{if(typeof multiplayerActive==='function'&&multiplayerActive())netCommand('request',{name:null});else{p.uiRequest=null;uiBuildShop();}};team.appendChild(cancel);}
  const weapons=document.createElement('div');weapons.className='shop-weapons';grid.appendChild(weapons);
  for(const [category,names] of uiShopCategories){
    const column=document.createElement('section');column.className='shop-category';const title=document.createElement('h3');title.textContent=category;column.appendChild(title);
    for(const name of names){
      const def=weaponDef(name),owned=p.inventory[def.slot]===name,card=document.createElement('div');card.className='shop-card'+(owned?' owned':'')+(p.credits<def.price?' unaffordable':'');
      const buy=document.createElement('button');buy.className='shop-buy';const image=document.createElement('img');image.src=uiAsset('weapon-'+name);image.alt=name;buy.appendChild(image);
      const caption=document.createElement('span');caption.className='shop-item-caption';const label=document.createElement('span');label.textContent=name.toUpperCase();const cost=document.createElement('span');cost.innerHTML=owned?'ĐÃ SỞ HỮU':uiCreditMarkup(def.price);caption.append(cost,label);buy.appendChild(caption);
      buy.onclick=()=>uiBuyWeapon(name);buy.oncontextmenu=event=>{event.preventDefault();uiRequestWeapon(name);};buy.onmouseenter=()=>uiShopDetails(name);buy.onfocus=()=>uiShopDetails(name);card.appendChild(buy);
      if(owned&&p.bought.some(b=>b.item==='gun:'+name)){const sell=document.createElement('button');sell.className='shop-sell';sell.textContent='BÁN';sell.onclick=()=>uiSellWeapon(name);card.appendChild(sell);}
      column.appendChild(card);
    }weapons.appendChild(column);
  }
  const right=document.createElement('aside');right.className='shop-armor';grid.appendChild(right);
  const armorTitle=document.createElement('h3');armorTitle.textContent='GIÁP';right.appendChild(armorTitle);
  for(const [name,def] of Object.entries(window.GAME_CONFIG.weapons.armor).filter(([name,def])=>def.price)){
    const owned=VS.player.armorType===name&&p.armor>0,card=document.createElement('div');card.className='shop-card'+(owned?' owned':'');const buy=document.createElement('button');buy.innerHTML='<img alt="" src="'+uiAsset('armor-'+name)+'"><span class="shop-armor-price">'+(owned?'ĐÃ SỞ HỮU':uiCreditMarkup(def.price))+'</span><span class="shop-armor-label"></span>';
    buy.querySelector('.shop-armor-label').textContent=({light:'GIÁP NHẸ',heavy:'GIÁP NẶNG',regen:'GIÁP HỒI PHỤC'})[name];buy.title=def.absorb+' điểm giáp'+(def.regenPool?' · '+def.regenPool+' điểm hồi phục':'');buy.onclick=()=>uiBuyArmor(name);card.appendChild(buy);
    if(p.bought.some(b=>b.item==='armor:'+name)){const sell=document.createElement('button');sell.className='shop-sell';sell.textContent='BÁN';sell.onclick=()=>uiSellArmor(name);card.appendChild(sell);}right.appendChild(card);
  }
  const detail=document.createElement('section');detail.id='shop-item-detail';grid.appendChild(detail);
  const abilities=document.createElement('section');abilities.className='shop-abilities';const abilityTitle=document.createElement('h3');abilityTitle.textContent='KỸ NĂNG';abilities.appendChild(abilityTitle);grid.appendChild(abilities);
  for(const slot of ['C','Q','E']){
    const cfg=agentConfig(),def=cfg[slot],card=document.createElement('div');card.className='shop-card';
    const buy=document.createElement('button');buy.innerHTML='<img alt="" src="/assets/playable/vfx/'+cfg.code+'-'+slot+'.png?v=21"><span></span>';
    const caption=buy.querySelector('span');caption.className='shop-ability-caption';const state=document.createElement('span'),title=document.createElement('span');state.textContent=agentState.charges[slot]>=def.charges?'ĐẦY':(def.price||0).toString();title.textContent=uiAbilityLabel(slot).toUpperCase();caption.append(state,title);buy.disabled=agentState.charges[slot]>=def.charges||p.credits<(def.price||0);buy.title=agentState.charges[slot]+'/'+def.charges;buy.onclick=()=>{agentBuy(slot);uiShopRefresh();};card.appendChild(buy);
    if(p.bought.some(b=>b.item==='ability:'+slot)){const sell=document.createElement('button');sell.className='shop-sell';sell.textContent='BÁN';sell.onclick=()=>{const ok=s.rules.sell(p,'ability:'+slot,()=>{if(!agentState.charges[slot])return false;agentState.charges[slot]--;return true;});if(ok)p.uiSpent=Math.max(0,(p.uiSpent||0)-(def.price||0));uiShopRefresh();};card.appendChild(sell);}abilities.appendChild(card);
  }
  uiShopDetails(p.uiRequest||p.inventory.primary||'Vandal');
}
function uiBuildDeathmatchWeapons(menu){menu.replaceChildren();const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.textContent='DEATHMATCH · CHỌN VŨ KHÍ';close.textContent='×';close.setAttribute('aria-label','Đóng');close.onclick=uiShopToggle;header.append(title,close);menu.appendChild(header);
  const grid=document.createElement('div');grid.className='shop-weapons';menu.appendChild(grid);for(const [label,names] of uiShopCategories){const col=document.createElement('section');col.className='shop-category';const heading=document.createElement('h3');heading.textContent=label;col.appendChild(heading);for(const name of names){const card=document.createElement('div');card.className='shop-card';const button=document.createElement('button'),image=document.createElement('img'),caption=document.createElement('span');image.src=uiAsset('weapon-'+name);image.alt='';caption.textContent=name.toUpperCase()+' · MIỄN PHÍ';button.append(image,caption);button.onclick=async()=>{const reply=await netCommand('buy',{kind:'weapon',name});if(reply.ok)uiShopToggle();else uiToast(reply.message||'Chưa đổi được vũ khí.');};card.appendChild(button);col.appendChild(card);}grid.appendChild(col);}
}
