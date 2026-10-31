// CPU-only UI/authority integration. Does not start a browser or WebGL context.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),B=require('../val-strike-html/assets/vendor/babylon.js');
const root=path.resolve(__dirname,'../val-strike-html');
const dom=new JSDOM('<div id="game-container"><canvas id="renderCanvas"></canvas></div><div id="match-hud"><div id="match-scoreboard" hidden></div></div>',{runScripts:'outside-only',url:'http://localhost:8455/game/game.html?map=abyss'});
const w=dom.window;w.BABYLON=B;w.HTMLCanvasElement.prototype.getContext=()=>null;
w.GAME_CONFIG={};for(const name of ['weapons','economy','rounds','match','playable-agents','abyss-match'])w.GAME_CONFIG[name]=JSON.parse(fs.readFileSync(path.join(root,'game/config/'+name+'.json')));
const run=source=>vm.runInContext(source,dom.getInternalVMContext());
for(const name of ['../js/state','match-rules','ui-overlay','hud-map','combat-ui','shop-ui','range'])run(fs.readFileSync(path.join(root,'game/'+name+'.js'),'utf8'));
run(`
const MAP_MODE='abyss';let scene={onBeforeRenderObservable:{add(){}},onAfterRenderObservable:{add(){}},onDisposeObservable:{add(){}},activeCamera:null};
const camera={position:new BABYLON.Vector3(0,1.7,0),globalPosition:new BABYLON.Vector3(0,1.7,0),rotation:{y:0},fov:1.4,getDirection:()=>BABYLON.Vector3.Forward()};
const agentState={charges:{C:0,Q:0,E:1},equipped:null};const weaponState={current:'Classic',ads:false,reloading:false};
window.__gameTime=0;window.__gamePlaying=true;
let cursor=false,castCanceled=0,clearCount=0,playerLoadouts=0;
const playerController={stop(){},cursorMode(value){cursor=value;window.__agentCursorMode=value;},getState:()=>({feet:[0,0,0],grounded:true,crouching:false,keys:[],velocity:[0,0,0]})};
function agentNow(){return window.__gameTime;}function weaponNow(){return window.__gameTime;}function agentConfig(){return window.GAME_CONFIG['playable-agents'].Clove;}
function agentPosition(){return BABYLON.Vector3.Zero();}function agentCancelEquip(){castCanceled++;}function weaponClearInput(){clearCount++;}
function weaponDefs(){return window.GAME_CONFIG.weapons.weapons;}function weaponDef(name=weaponState.current){return weaponDefs()[name];}
function worldPick(){return null;}function abilityWorldPick(){return null;}function agentLOS(){return false;}
function matchApplyLoadout(){playerLoadouts++;}function matchDrop(){}function matchBotSpawn(){}function matchUIUpdate(){}
function matchMember(entity){return entity===VS.player?matchState.human:entity?.member;}
function matchMemberPoint(member){return member.entity.position||BABYLON.Vector3.Zero();}
function matchActive(){return matchState.active;}
function agentBuy(slot){const def=agentConfig()[slot];return matchState.rules.buy(matchState.human,'ability:'+slot,def.price,()=>{if(agentState.charges[slot]>=def.charges)return false;agentState.charges[slot]++;return true;});}
const members=['a','b'].flatMap(team=>['Clove','Clove','Jett','Jett','Sage'].map((agent,index)=>({id:(team==='a'?0:5)+index,team,agent,name:team+index,hp:100,armor:0,ultCost:8,entity:null})));
for(const p of members)p.entity={member:p,hp:100,armor:0,position:new BABYLON.Vector3(p.id,0,p.id),bot:{ability:{charges:{C:1,Q:1,E:1}}}};
members[0].entity=VS.player;VS.player.position=BABYLON.Vector3.Zero();VS.player.agent='Clove';
for(const p of members)Object.defineProperty(p,'hp',{get:()=>p.entity.hp,set:v=>{p.entity.hp=v;}});
const matchState={active:true,mode:'unrated',human:members[0],bots:[],sites:[],orbs:[],rules:new MatchRules(window.GAME_CONFIG,(type,p)=>{if(type==='purchase')uiRecordPurchase(p,p.bought.at(-1).price);})};
matchState.rules.start(members,0);uiHUDInject();uiRoundStart();
`);
try{
  run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',bubbles:true}));`);
  assert(run('uiState.shopOpen&&cursor'));assert(run('window.__gamePlaying'),'shop must not pause clock');
  assert.equal(run("document.querySelectorAll('.shop-buy').length"),18);
  run("uiBuyWeapon('Ghost')");assert.equal(run('matchState.human.credits'),300);assert.equal(run('matchState.human.inventory.secondary'),'Ghost');
  run("uiSellWeapon('Ghost');uiSellWeapon('Ghost')");assert.equal(run('matchState.human.credits'),800,'refund once');
  run("matchState.rules.members[1].credits=4000;uiRequestWeapon('Vandal');uiBuyWeapon('Vandal',matchState.human,matchState.rules.members[1]);");
  assert.equal(run('matchState.human.credits'),800);assert.equal(run('matchState.rules.members[1].credits'),1100);assert.equal(run('matchState.human.inventory.primary'),'Vandal');
  run('matchState.rules.phase="live";uiCloseAll();');assert(!run('uiState.shopOpen||cursor'));
  const before=run('matchState.human.credits');run("uiBuyWeapon('Sheriff')");assert.equal(run('matchState.human.credits'),before,'no live purchase');
  run('uiRoundStart();matchState.rules.members[5].entity.hp=30;combatDamage(matchState.rules.members[5].entity,160,VS.player,{zone:"head",weapon:"Vandal"});');
  assert.equal(run('matchState.human.uiScore'),30,'ACS excludes overkill');
  run('matchState.rules.members[5].hp=0;uiElimination(matchState.rules.members[5],matchState.human);');
  assert.equal(run('matchState.human.uiScore'),180,'first elimination alive-tier');
  run('uiElimination(matchState.rules.members[6],matchState.human);');assert.equal(run('matchState.human.uiScore'),360,'multikill bonus');
  run('document.getElementById("match-scoreboard").hidden=false;uiScoreboardUpdate();');
  assert.equal(run('document.querySelectorAll("#match-scoreboard tbody tr").length'),10);
  assert(run('document.querySelector(".board-enemy td:nth-child(8)").textContent==="—"'),'enemy credits concealed');
  run('const old=matchState.human.uiScore;combatDamage(matchState.rules.members[1].entity,30,VS.player,{zone:"body"});');assert.equal(run('matchState.human.uiScore'),run('old'),'no friendly ACS');
  run('VS.player.hp=100;combatDamage(VS.player,1000,matchState.rules.members[7].entity,{zone:"head",weapon:"Vandal"});uiCombatReportUpdate();');
  assert(!run('document.getElementById("hud-combat-report").hidden'));assert(run('uiState.report.rows.size>0'));
  run('const registration=window.GAME_CONFIG["abyss-match"].registration;const center=uiMapPoint(BABYLON.Vector3.Zero(),1024);');
  assert.deepEqual(Array.from(run('center')),Array.from(run('registration.offset')));
  run('uiState.seen.set(7,{position:new BABYLON.Vector3(1,0,2),until:4000,liveAt:0});matchState.rules.members[7].entity.position.set(40,0,40);VS.player.hp=0;uiWorldPings=()=>{};uiMapUpdate(1000);');
  assert.deepEqual(Array.from(run('uiState.seen.get(7).position.asArray()')),[1,0,2],'hidden enemy snapshot must not follow movement');
  run('uiMapUpdate(5000);');assert.equal(run('uiState.seen.size'),0,'last known expires');
  run('uiResetMatch();');assert.equal(run('uiState.report'),null);assert.equal(run('uiState.feed.length'),0);
  console.log('PASS UI authority: clock, purchases/refunds/gifts, live guard, damage/ACS, concealment, report, minimap registration/last-known expiry, cleanup (CPU only)');
}finally{w.close();}
