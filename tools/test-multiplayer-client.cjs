'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),{JSDOM}=require('jsdom'),B=require('babylonjs');
const root=path.resolve(__dirname,'../val-strike-html'),dom=new JSDOM('<div id="game-container"><canvas id="renderCanvas"></canvas><div id="hud-ping-world"></div></div><div id="match-status"></div>',{runScripts:'outside-only',url:'http://localhost:8455/game/game.html?map=abyss&room=ABCDEF'}),w=dom.window;
w.BABYLON=B;w.fetch=async()=>({status:401});w.GAME_CONFIG={};for(const name of ['weapons','playable-agents','network','movement'])w.GAME_CONFIG[name]=JSON.parse(fs.readFileSync(path.join(root,'game/config/'+name+'.json')));
const run=s=>vm.runInContext(s,dom.getInternalVMContext());for(const file of ['state','profile'])run(fs.readFileSync(path.join(root,'js/'+file+'.js'),'utf8'));
run(`
const engine=new BABYLON.NullEngine({renderWidth:640,renderHeight:360}),scene=new BABYLON.Scene(engine),camera=new BABYLON.FreeCamera('camera',new BABYLON.Vector3(0,1.7,-10),scene);camera.minZ=.05;scene.activeCamera=camera;
const uiState={pings:[],shopOpen:false},agentState={effects:[],projectiles:[],charges:{},cooldowns:{}},weaponState={ammo:{},loadout:{},current:'Classic'};
VS.player.agent='Clove';const human={id:'self',entity:VS.player,team:'a'},remote={id:'other',team:'b',hp:100};const matchState={rules:{phase:'select',members:[human,remote]},human,bots:[],orbs:[],tracers:[]};
matchState.rules.spike={state:'none',channel:null};let moves=[],teleports=0,uiUpdates=0,positions=[],calls=[];
const playerController={getState:()=>({keys:[],feet:[0,0,0]}),correct(p){moves.push(p.asArray());},teleport(){teleports++;},networkReset(){teleports++;},networkReconcile(){},networkPredict(){},networkRender(){},syncPosition(p){moves.push(p.asArray());},stop(){},pause(){}};
window.__gamePlaying=false;window.__frameDT=1/30;window.__gameTime=0;
function agentPosition(){return BABYLON.Vector3.Zero();}function agentNow(){return window.__gameTime;}function uiAsset(name){return '/assets/ui/'+name+'.png';}
function uiToast(){}function uiInputBlocked(){return false;}function weaponSwitch(name){weaponState.current=name;}function matchSpectatorStop(){}function agentSetThirdPerson(){}function agentCancelEquip(){}function agentClearEffects(){agentState.effects=[];}function uiRoundStart(){}function matchCreateBuyBoundaries(){}function matchBuildShop(){}function uiBuildShop(){}function uiCloseAll(){}function matchUIUpdate(){uiUpdates++;}function netNoop(){}function agentRemoveEffect(){}function agentEffectsTick(){}function agentWallPreviewUpdate(){}function agentHUD(){}function agentVisualUpdate(){}function uiHUDUpdate(){}function matchPlayerChannelPose(){}function matchBotPose(bot){positions.push(bot.entity.position.clone());}function matchBotChannelProp(){}function agentConfig(){return window.GAME_CONFIG['playable-agents'].Jett;}function agentDisposeMesh(){}function agentRebuildSolids(){}
`);
run(fs.readFileSync(path.join(root,'game/hud-map.js'),'utf8'));run(fs.readFileSync(path.join(root,'game/multiplayer.js'),'utf8'));
// Test production projection after rendering CPU camera matrices. Render scale
// changes should not move a world anchor or mix CSS/physical pixel coordinates.
w.document.getElementById('renderCanvas').getBoundingClientRect=()=>({width:640,height:360,left:0,top:0});
run(`uiState.pings=[{type:'danger',position:new BABYLON.Vector3(0,1,0),until:6000}];scene.render();uiWorldPings(0);`);
const marker=w.document.querySelector('#hud-ping-world>div'),x0=parseFloat(marker.style.left);assert(Math.abs(x0-320)<1);
run(`camera.rotation.y=.01;scene.render();uiWorldPings(33);`);const x1=parseFloat(marker.style.left);assert(x1<x0&&x0-x1<10);
run(`camera.rotation.y=.02;scene.render();uiWorldPings(66);`);const x2=parseFloat(marker.style.left);assert(Math.abs((x0-x1)-(x1-x2))<.1,'smooth projection without 150ms minimap steps');assert.equal(run('uiState.pings[0].position.x'),0);
// Packet interpolation advances between snapshots and handles yaw wrap.
run(`
const actor={member:remote,entity:{hp:100,position:BABYLON.Vector3.Zero(),forward:BABYLON.Vector3.Forward()},actor:{velocity:BABYLON.Vector3.Zero()},root:{setEnabled(){}},ability:{}};netMatch.actors.set('other',actor);
netMatch.client={connected:true,session:{self:'self',room:'ABCDEF'},rtt:0,send(d){calls.push(d);},command(op,data){calls.push({op,...data});return Promise.resolve({ok:true});}};netMatch.active=true;netMatch.authoritative=true;
const make=(time,phase='playing')=>({type:'snapshot',time,version:1,room:{id:'ABCDEF',phase},rules:{phase:'buy',round:1,score:{a:0,b:0},attacking:'a',until:45000,spike:{state:'none',position:null,carrier:null,channel:null}},members:[{id:'self',agent:'Clove',team:'a',hp:100,armor:0,credits:800,ult:0,inputSeq:88,position:[0,0,0],yaw:0,pitch:0,weapon:'Classic',ammo:{Classic:{clip:12,reserve:36}},inventory:{secondary:'Classic'},charges:{E:1},cooldowns:{}}],effects:[],projectiles:[],drops:[],orbs:[],pings:[]});
netMatch.latest=make(1000,'loading');netFrame();
`);assert.equal(run('uiUpdates'),0,'loading packets cannot apply zero spawn/rules');
run(`
const latest=make(1000);const initial=make(900);initial.members.push({id:'other',position:[0,0,0],yaw:6.27,velocity:[1,0,0]});latest.members.push({id:'other',position:[1,0,0],yaw:.01,velocity:[1,0,0]});netMatch.latest=latest;netMatch.applied=latest;netMatch.packets=[{...initial,received:performance.now()-100},{...latest,received:performance.now()-30}];netFrame();
`);const first=run('actor.entity.position.x');run('netMatch.packets[1].received-=30;netFrame();');const second=run('actor.entity.position.x');assert(second>first&&second<1,'movement advances between packets');assert(Math.abs(run('actor.entity.forward.x'))<.05,'yaw interpolates through zero');
// Apply an authoritative ack from an existing server session; a reloaded page
// must continue above its sequence rather than send 1 and get ignored forever.
run('netMatch.actors.clear();netApplyPacket(make(1100));');assert.equal(run('netMatch.inputSeq'),88);assert.equal(run('weaponState.ammo.Classic.clip'),12);assert.equal(run('human.credits'),800);assert(run('teleports')>0);
// Continuous knife fire is bounded to its actual interval, never every frame.
run(`VS.player.agent='Jett';agentState.equipped='X';agentState.knifeHeld=true;agentState.lockUntil=0;window.__gameTime=2000;netVisualTick();netVisualTick();netVisualTick();`);assert.equal(run("calls.filter(c=>c.op==='ability').length"),1);
// Production command wrappers keep Jett knives equipped after a fire reply.
run(`
function weaponShoot(){return true;}function weaponReload(){}function agentEquip(){return true;}function agentCast(){}function agentCancelEquip(){agentState.equipped=null;agentState.steer=false;}function agentBuy(){}function combatDamage(){}function agentBeforeDamage(){}function weaponResolveHit(){}function uiBuyWeapon(){}function uiSellWeapon(){}function uiBuyArmor(){}function uiSellArmor(){}function uiRequestWeapon(){}function uiSendPing(){}function agentDamageWall(){}function abilityWorldPick(){}function weaponSpawnBulletHole(){}function agentNotice(){}function agentAimGround(){}
matchState.rules.phase='live';agentState.lockUntil=0;agentState.knives=5;agentState.equipped='X';netInstallAuthority();agentCast();
`);assert.equal(run('netMatch.nextKnife'),run('agentNow()+agentConfig().X.interval'),'knife command schedules its real interval without an undefined clock');assert.equal(run('calls.at(-1).slot'),'X');
// Names use real ally identity and the same rendered camera as world pings.
run(`
const preShoot=calls.filter(c=>c.op==='shoot').length;netMatch.client.connected=false;
if(!weaponShoot(false,false))throw Error('offline local attack was blocked');
if(calls.filter(c=>c.op==='shoot').length!==preShoot)throw Error('offline shots must not be queued');
netMatch.client.connected=true;weaponState.ammo.Classic={clip:11,reserve:36};
netMatch.pendingShots=[{seq:1,weapon:'Classic',cost:1}];
netApplyPacket(make(1200));if(weaponState.ammo.Classic.clip!==11)throw Error('old snapshot refilled a pending shot');
const acknowledged=make(1300);acknowledged.members[0].shotAck=1;acknowledged.members[0].ammo.Classic.clip=11;
netApplyPacket(acknowledged);if(weaponState.ammo.Classic.clip!==11||netMatch.pendingShots.length)throw Error('confirmed shot subtracted twice');
`);
run(`remote.name='<Human ally>';remote.team='a';remote.hp=100;netMatch.actors.set('other',actor);scene.render();netNameTags();`);
const tag=w.document.querySelector('#net-nametags>div');assert.equal(tag.textContent,'<Human ally>');assert.equal(tag.querySelectorAll('*').length,0,'name is plain text');assert.equal(tag.hidden,false);
run('remote.team="b";netNameTags();');assert.equal(w.document.querySelectorAll('#net-nametags>div').length,0,'enemy names are not disclosed');
Promise.resolve().then(()=>{assert.equal(run('agentState.equipped'),'X','fire reply retains knives');run('scene.dispose();engine.dispose();');dom.window.close();console.log('PASS client CPU: stable ping and nametags, loading guard, advancing interpolation/yaw wrap, reconnect sequence, authoritative resources, bounded knife fire and actual command wrappers. No browser/WebGL.');}).catch(error=>{console.error(error.stack);dom.window.close();process.exitCode=1;});
