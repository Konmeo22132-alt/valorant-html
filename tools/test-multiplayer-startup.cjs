'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('./node_modules/jsdom'),B=require('./node_modules/babylonjs');
const root=path.resolve(__dirname,'../val-strike-html'),dom=new JSDOM('<div id="match-status"></div>',{runScripts:'outside-only',url:'https://val.konmeo22132.dev/game/game.html?room=ABCDEF'}),w=dom.window;
w.BABYLON=B;w.GAME_CONFIG={};for(const name of ['movement','weapons','playable-agents','match','economy','rounds','abyss-match'])w.GAME_CONFIG[name]=JSON.parse(fs.readFileSync(path.join(root,'game/config/'+name+'.json')));
w.fetch=async()=>({ok:true,json:async()=>({nodes:[],layout:{}})});
const run=s=>vm.runInContext(s,dom.getInternalVMContext());run(fs.readFileSync(path.join(root,'js/state.js'),'utf8'));
run(`const MAP_MODE='abyss',scene={isDisposed:false},camera={},agentState={visualReady:true},weaponState={},botAssets=new Map();
const uiState={pings:[],seen:new Map(),mapOpen:false},matchState={active:false,loading:false,bots:[],sites:[],orbs:[],rules:null};let loaded=false,failAssets=false,draws=0;
VS.player.agent='Clove';window.__weaponsReady=true;const playerController={pause(){}};const VSAccount={room:{}};
class BotNavigation{constructor(data){this.data=data;}}
function recordGameError(error){console.error(error);}function matchStop(){matchState.active=false;matchState.bots=[];}function matchActive(){return matchState.active;}
function weaponDefs(){return window.GAME_CONFIG.weapons.weapons;}
async function matchPrepareBotAssets(){if(failAssets)throw Error('asset failure');for(const name of Object.keys(window.GAME_CONFIG.weapons.weapons))botAssets.set('prop_'+name.toLowerCase(),{});}
function matchCreateMarkers(){}function matchRefreshTargets(){}function agentPosition(){return BABYLON.Vector3.Zero();}function uiText(){}function uiImage(){return {};}
`);
for(const file of ['match-rules','hud-map','multiplayer'])run(fs.readFileSync(path.join(root,'game',file+'.js'),'utf8'));
run(`uiDrawMap=()=>draws++;netMatch.client={session:{self:'self'},send(data){if(data.op==='loaded')loaded=true;}};
matchState.active=true;matchState.human={team:'a'};uiMapUpdate(0);matchState.active=false;
const room={id:'ABCDEF',mode:'custom',members:[{id:'self',name:'Player',agent:VS.player.agent,team:'a'}]};`);
(async()=>{
 await run('netStart(room)');assert.equal(run('netMatch.active'),true);assert.equal(run('loaded'),true);assert.equal(run('matchState.rules.spike.state'),'none');assert.equal(run('matchState.loading'),false);
 run('uiMapUpdate(100);failAssets=true;loaded=false;');await run('netStart(room)');assert.equal(run('netMatch.active'),false);assert.equal(run('matchState.active'),false);assert.equal(run('loaded'),false);
 dom.window.close();console.log('PASS production startup without test UI, HUD before first snapshot, and failed loading cleanup.');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
