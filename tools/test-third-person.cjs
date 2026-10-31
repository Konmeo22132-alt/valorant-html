'use strict';
// Import real exported GLBs and drive the production presenters on a CPU scene.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),B=require('./node_modules/babylonjs'),{JSDOM}=require('./node_modules/jsdom');require('./node_modules/babylonjs-loaders');
const root=path.resolve(__dirname,'../val-strike-html'),dom=new JSDOM('<canvas id="renderCanvas"></canvas>',{runScripts:'outside-only',url:'http://localhost/game/game.html?map=range'}),w=dom.window;
B.SceneLoader.OnPluginActivatedObservable.add(plugin=>{plugin.skipMaterials=true;});
const original=B.SceneLoader.LoadAssetContainerAsync;
B.SceneLoader.LoadAssetContainerAsync=async(base,file,scene)=>original.call(B.SceneLoader,'','data:;base64,'+fs.readFileSync(path.join(root,base.replace(/^\//,''),file.split('?')[0])).toString('base64'),scene,undefined,'.glb');
w.BABYLON=B;w.console=console;w.GAME_CONFIG={};for(const name of ['movement','weapons','playable-agents','rounds','match','abyss-match'])w.GAME_CONFIG[name]=JSON.parse(fs.readFileSync(path.join(root,'game/config/'+name+'.json')));
const run=s=>vm.runInContext(s,dom.getInternalVMContext());
run(fs.readFileSync(path.join(root,'js/state.js'),'utf8'));
run(`const engine=new BABYLON.NullEngine(),scene=new BABYLON.Scene(engine),camera=new BABYLON.FreeCamera('camera',new BABYLON.Vector3(0,1.7,-3),scene);scene.activeCamera=camera;window.__gameTime=1000;
const playerController={getState:()=>({feet:[0,0,0]}),cursorMode(){}},weaponState={current:'Vandal',reloading:false,ads:false,reloadStarted:0};
const matchState={rules:{spike:{channel:null}},active:false,bots:[]};function matchActive(){return false;}function matchSpectatorActive(){return false;}function matchMovementBlocked(){return false;}
function weaponDef(name=weaponState.current){return window.GAME_CONFIG.weapons.weapons[name];}function weaponDefs(){return window.GAME_CONFIG.weapons.weapons;}function uiHUDUpdate(){}function agentNotice(){}
`);
for(const name of ['collision-world','body-presentation','agent-visuals','agent-effects','agent-skill-layers','agent-clove','agent-abilities','match-animation','match-bots'])run(fs.readFileSync(path.join(root,'game/'+name+'.js'),'utf8'));
run(`agentEffectTexture=name=>{if(!agentEffectTextures.has(name)){const texture=BABYLON.RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene);texture.skillReady=Promise.resolve();agentEffectTextures.set(name,texture);}return agentEffectTextures.get(name);};
agentMeddleViewUpdate=()=>{};agentRuseViewUpdate=()=>{};matchPlayerChannelPose=()=>{};
window.__moveState={hSpeed:0,grounded:true,crouching:false};agentVisual.third=true;
agentVisual.thirdCamera=new BABYLON.FreeCamera('follow',new BABYLON.Vector3(0,1.7,-3),scene);
`);
const reports=[];
(async()=>{
 for(const weapon of Object.keys(w.GAME_CONFIG.weapons.weapons))await run(`(async()=>botAssets.set('prop_${weapon.toLowerCase()}',await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/','${weapon.toLowerCase()}.glb',scene)))()`);
 for(const agent of ['Clove','Jett','Sage']){
  run(`agentVisualDispose();VS.player.agent='${agent}';agentVisual.desired='${agent}';agentVisual.third=true;agentState.equipped=null;agentState.knives=0;`);
  await run('agentVisualLoadBody()');assert(run('agentVisual.bodyRoot&&agentVisual.bodyAnimations'),'local third person loads animation supplement without match');
  const clips=run('[...agentVisual.groups.keys()]');assert(clips.includes('gun_Melee_fire_UB')&&clips.includes('gun_Melee_firealt_UB'));
  const muzzleReports=[];
  for(const weapon of Object.keys(w.GAME_CONFIG.weapons.weapons)){
   run(`weaponState.current='${weapon}';agentVisual.bodyAction=null;camera.rotation.setAll(0);agentVisual.upperPose=null;agentVisualUpdate();`);await new Promise(resolve=>setImmediate(resolve));run('agentVisualUpdate();scene.render();');
   assert(run('agentVisual.thirdGun?.isEnabled()'),'world weapon visible: '+agent+'/'+weapon);
   assert(run(`!!bodyClip(agentVisual.groups,'gun_${weapon}_idle')`),'authored holding pose '+weapon);
   const bounds=run('agentVisual.thirdGun.getHierarchyBoundingVectors(true)');assert(bounds.max.subtract(bounds.min).length()<2.5,'weapon must keep real-world size '+agent+'/'+weapon);
   const a=run(`(()=>{const gun=agentVisual.thirdGun.getDescendants().find(n=>n.name.endsWith('Muzzle'));if(!gun)return null;gun.computeWorldMatrix(true);return gun.getAbsolutePosition().asArray();})()`);
   if(a){assert(a.every(Number.isFinite));assert(Math.hypot(a[0],a[2])<2.2&&a[1]>.1&&a[1]<2.5,'gun socket near hands '+weapon+' '+a);muzzleReports.push({weapon,muzzle:a});}
  }
  run(`weaponState.current='Melee';agentVisual.upperPose=null;agentBodyAction('gun_Melee_fire_UB',500);window.__gameTime=2000;agentVisual.bodyAction.start=2000;agentVisualUpdate();scene.render();`);
  const first=run("agentVisual.nodes.get('R_Hand').getAbsolutePosition().asArray()");
  run('window.__gameTime=2240;agentVisualUpdate();scene.render();');const strike=run("agentVisual.nodes.get('R_Hand').getAbsolutePosition().asArray()");assert(B.Vector3.Distance(B.Vector3.FromArray(first),B.Vector3.FromArray(strike))>.08,'actual knife strike changes third-person hand '+agent);
  run(`weaponState.current='Vandal';agentVisual.bodyAction=null;agentVisual.upperPose=null;camera.rotation.x=-.7;window.__gameTime=2500;agentVisualUpdate();`);await new Promise(resolve=>setImmediate(resolve));run('agentVisualUpdate();scene.render();');const up=run("agentVisual.thirdGun.getDescendants().find(n=>n.name.endsWith('Muzzle')).getAbsolutePosition().y");
  run('camera.rotation.x=.7;window.__gameTime=2750;agentVisualUpdate();scene.render();');const down=run("agentVisual.thirdGun.getDescendants().find(n=>n.name.endsWith('Muzzle')).getAbsolutePosition().y");assert(up>down+.2,'pitch must rotate gun and arms together '+agent+' '+up+' '+down);
  if(agent==='Sage'){run("agentState.equipped='E';agentVisualUpdate();scene.render();");assert(run('agentVisual.worldHeld?.isEnabled()'),'Sage orb in third person');const distance=run('BABYLON.Vector3.Distance(agentVisual.worldHeld.position,bodyHandPoint(agentVisual.nodes))');assert(distance<.015);}
  if(agent==='Jett'){run("agentState.equipped='X';agentState.knives=5;agentVisualUpdate();scene.render();");assert(run('agentVisual.worldKnives?.isEnabled()'),'Jett knives in third person');assert.equal(run('agentVisual.worldKnives.knives.filter(k=>k.isEnabled()).length'),5);}
  reports.push({agent,bodyClips:clips.length,muzzleReports,knifeMotion:B.Vector3.Distance(B.Vector3.FromArray(first),B.Vector3.FromArray(strike)),pitch:{up,down}});
  const code=w.GAME_CONFIG['playable-agents'][agent].code;
  await run(`(async()=>{botAssets.set('${agent}',await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/','${code}-body.glb',scene));botAssets.set('${agent}_body_animations',await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/','${code}-body-animations.glb',scene));})()`);
  run(`const remote${agent}=matchCreateBot({id:'remote${agent}',team:'b',agent:'${agent}',hp:100},${reports.length});remote${agent}.remote=true;remote${agent}.weapon='Melee';remote${agent}.ability={knives:0,lockUntil:0,action:{name:'gun_Melee_fire_UB',start:3000,duration:500}};remote${agent}.gun=matchProp('Melee',remote${agent}.hand,.8);remote${agent}.entity.position.set(2,0,4);matchBotPose(remote${agent},3000);scene.render();`);
  const r0=run(`remote${agent}.nodes.get('R_Hand').getAbsolutePosition().asArray()`);
  run(`matchBotPose(remote${agent},3240);scene.render();`);const r1=run(`remote${agent}.nodes.get('R_Hand').getAbsolutePosition().asArray()`);assert(B.Vector3.Distance(B.Vector3.FromArray(r0),B.Vector3.FromArray(r1))>.08,'remote melee strike '+agent);
  const slot=agent==='Sage'?'E':agent==='Jett'?'X':'Q';
  run(`remote${agent}.member.skill='${slot}';remote${agent}.ability.action=null;remote${agent}.ability.knives=${agent==='Jett'?5:0};remote${agent}.pitch=.6;matchBotPose(remote${agent},3500);matchBotChannelProp(remote${agent},null,3500);scene.render();`);
  assert(!run(`remote${agent}.gun.root.isEnabled()`),'remote equipped skill hides gun');
  assert(run(`remote${agent}.${agent==='Jett'?'worldKnives':'worldHeld'}?.isEnabled()`),'remote skill prop '+agent);
  run(`bodyDisposeProps(remote${agent});remote${agent}.gun.root.dispose();remote${agent}.root.dispose();remote${agent}.hitRoot.dispose();remote${agent}.badge.dispose();`);
 }
 fs.mkdirSync(path.join(root,'../tools/.artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'../tools/.artifacts/third-person-audit.json'),JSON.stringify(reports,null,2));
 run('agentVisualDispose();scene.dispose();engine.dispose();');dom.window.close();console.log('PASS all 3 local and remote third-person rigs: 19 holding poses, source weapon sockets, real knife motion, pitch, Jett knives, Sage orb and equipped gun visibility.');
})().catch(error=>{console.error(error.stack);dom.window.close();process.exitCode=1;});
