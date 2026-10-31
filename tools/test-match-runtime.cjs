// Real source model/skeleton import and local match integration, without WebGL.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),B=require('babylonjs');require('babylonjs-loaders');
const root=path.join(__dirname,'../val-strike-html');
B.SceneLoader.OnPluginActivatedObservable.add(p=>{p.skipMaterials=true;});
const loader=B.SceneLoader.LoadAssetContainerAsync;
B.SceneLoader.LoadAssetContainerAsync=async(base,file,scene)=>{
  const bytes=fs.readFileSync(path.join(root,base.replace(/^\//,''),file.split('?')[0]));
  return loader.call(B.SceneLoader,'','data:;base64,'+bytes.toString('base64'),scene,undefined,'.glb');
};
const dom=new JSDOM(fs.readFileSync(path.join(root,'game/game.html'),'utf8'),{url:'http://localhost/game/game.html?map=range&models=0',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.BABYLON=B;w.console=console;
w.GAME_CONFIG=Object.fromEntries(['movement','weapons','economy','rounds','performance','playable-agents','match'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,'game/config/'+n+'.json')))]));
const run=s=>vm.runInContext(s,dom.getInternalVMContext());
for(const file of ['../js/state','collision-world','engine','actor-motion','player','ui-overlay','weapon-models','weapons','range','agent-visuals','agent-effects','agent-skill-layers','agent-clove','agent-abilities','match-rules','bot-navigation','match-bots','match-ui','match-runtime'])run(fs.readFileSync(path.join(root,'game/'+file+'.js'),'utf8'));
run(`agentVisualSelect=()=>{agentState.visualReady=true;};
engine=new BABYLON.NullEngine();scene=new BABYLON.Scene(engine);buildPlaceholderMap();window.collisionWorld=new CollisionWorld(scene.meshes);
window.VS_SPAWN=new BABYLON.Vector3(0,1.7,-14);initPlayer();
const nodes=[],edges=[];for(let z=0;z<8;z++)for(let x=0;x<8;x++){nodes.push([-14+x*4,0,-14+z*4]);const e=[];if(x)e.push(z*8+x-1);if(x<7)e.push(z*8+x+1);if(z)e.push((z-1)*8+x);if(z<7)e.push((z+1)*8+x);edges.push(e);}
matchState.nav=new BotNavigation({nodes,edges,layout:{attack:0,defend:63,sites:[27,35],orbs:[18,45]}});
const roster=['a','b'].flatMap(team=>['Clove','Clove','Jett','Jett','Sage'].map(agent=>({team,agent})));`);
(async()=>{
  try {
    await run("matchStart('unrated',roster)");
    assert(run('matchActive()'));assert.equal(run('matchState.bots.length'),9);assert.equal(run('matchState.rules.phase'),'buy');
    assert.equal(run('VS.round.phase'),'buy');assert.equal(run('weaponState.loadout.primary'),null);
    assert.equal(run("matchState.rules.members.filter(p=>p.team==='a'&&p.agent==='Clove').length"),2);
    assert(run('matchState.bots.every(b=>b.entity.meshes.length===3&&b.instance.skeletons.length>0&&b.gun)'));
    run("agentBuy('C')");assert.equal(run('agentState.charges.C'),1);assert.equal(run('VS.player.credits'),600);
    assert.equal(run("weaponSwitch('Vandal');weaponState.current"),'Classic');
    run('window.__gamePlaying=true;window.__gameTime=45000;matchUpdate(1/30);');
    assert.equal(run('matchState.rules.phase'),'live');assert.equal(run("matchState.barrier.isEnabled()"),false);
    run('window.GAME_CONFIG.match.bots.sightRange=.1;matchState.bots.forEach(b=>{b.target=null;b.nextThink=0;});');
    const before=run('matchState.bots[0].entity.position.asArray().join()');
    for(let i=0;i<60;i++)run('window.__gameTime+=1000/30;matchUpdate(1/30);');
    assert.notEqual(run('matchState.bots[0].entity.position.asArray().join()'),before,'bot must move');
    run('window.GAME_CONFIG.match.bots.sightRange=45;');
    run(`const enemy=matchState.bots.find(b=>b.member.team==='b');enemy.entity.position.copyFrom(agentPosition().add(new BABYLON.Vector3(0,0,4)));enemy.entity.hp=1;
      combatDamage(enemy.entity,40,VS.player);matchEntityDied(enemy.entity,VS.player);matchEntityDied(enemy.entity,VS.player);`);
    assert.equal(run('matchState.human.kills'),1);assert.equal(run('VS.player.credits'),800);
    // Player death must credit its attacker even though agentAfterDamage fires synchronously.
    run(`const attacker=matchState.bots.find(b=>b.member.team==='b'&&b.entity.hp>0);combatDamage(VS.player,1000,attacker.entity);`);
    assert.equal(run('attacker.member.kills'),1);assert.equal(run('matchState.human.deaths'),1);
    run('window.__gameTime=150000;matchUpdate(1/30);');assert.equal(run('matchState.rules.phase'),'end');
    run('window.__gameTime=158000;matchUpdate(1/30);');assert.equal(run('matchState.rules.round'),2);assert.equal(run('VS.player.hp'),100);
    run('matchStop();');assert(!run('matchActive()'));assert.equal(run('scene.getMeshesByTags("matchBot").length'),0);
    await run("matchStart('deathmatch',roster)");assert(run('matchActive()'));assert.equal(run('weaponState.current'),'Vandal');
    run(`window.__gameTime=200000;combatDamage(VS.player,1000,matchState.bots[0].entity);window.__gameTime+=2600;matchUpdate(1/30);`);
    assert.equal(run('VS.player.hp'),100);assert.equal(run('matchState.human.deaths'),1);
    run('matchStop();');assert.equal(run('matchState.bots.length'),0);
    assert(!run('scene.meshes.some(m=>m.name.startsWith("bot_hit_"))'));
    console.log('PASS runtime: real bot skeletons/guns, roster cap, shop, movement, death credit, round reset, DM respawn, cleanup (CPU; materials skipped)');
  } finally {run('scene.dispose();engine.dispose();');w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
