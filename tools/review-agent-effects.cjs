// CPU review requested by the user. Exercises lifecycle/bindings, not WebGL.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),B=require(path.join(ROOT,'val-strike-html/assets/vendor/babylon.js'));
const engine=new B.NullEngine(),scene=new B.Scene(engine),camera=new B.FreeCamera('camera',new B.Vector3(0,1.65,0),scene);
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'val-strike-html/game/config/playable-agents.json')));
const context={BABYLON:B,scene,camera,console,URLSearchParams,setTimeout,clearTimeout,
 window:{__gameTime:1000,GAME_CONFIG:{'playable-agents':cfg}},VS:{player:{agent:'Sage',hp:100}},
 playerController:{getState:()=>({feet:[0,0,0]})},rangeTargets:()=>[],uiHUDUpdate:()=>{}};
vm.createContext(context);
for(const name of ['collision-world','agent-visuals','agent-effects','agent-skill-layers','agent-clove','agent-abilities'])vm.runInContext(fs.readFileSync(path.join(ROOT,'val-strike-html/game/'+name+'.js'),'utf8'),context,{filename:name});
context.assert=assert;
vm.runInContext(`
 const bindings=[];agentAttachEffectModel=async(parent,label,size,options={})=>{bindings.push(label);};
 agentEffectTexture=name=>{
   if(!agentEffectTextures.has(name)) {
     const texture=BABYLON.RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene);
     texture.skillReady=Promise.resolve();agentEffectTextures.set(name,texture);
   }return agentEffectTextures.get(name);
 };
 agentAimGround=()=>new BABYLON.Vector3(0,0,6);
 const held=BABYLON.MeshBuilder.CreateSphere('review_orb',{diameter:.14},scene);
 agentHeldLayers(held,'orb');held.metadata.updateLayers(1000);
 const crystals=held.getChildMeshes().filter(m=>m.name==='skill_shard');
 assert.equal(crystals.length,8,'keep every held orb shard');
 for(const shard of crystals){shard.computeWorldMatrix(true);const b=shard.getBoundingInfo().boundingBox;
   assert(b.maximumWorld.y-b.minimumWorld.y<.08,'orb shard must not become a large spike');
   assert(shard.material.emissiveColor.g>.9,'unlit shards must retain their light');}
 assert.equal(held.getChildMeshes().find(m=>m.name==='held_core_glow').material.alphaMode,BABYLON.Engine.ALPHA_ADD);
 agentDisposeMesh(held);
 VS.player.agent='Clove';agentState.intangibleUntil=2000;agentState.revivedUntil=15000;
 assert(agentWeaponHidden(1500));assert(agentWeaponHidden(2200));
 agentState.lockUntil=6000;assert(!agentResurrectionActive(4000),'a later cast must not restart resurrection');
 agentVisual.action={name:'C_cast'};assert(agentWeaponHidden(4000));agentVisual.action=null;
 const source=new BABYLON.PBRMaterial('spectral_source',scene),ghost=BABYLON.MeshBuilder.CreateSphere('review_ghost',{},scene);
 ghost.material=source;const assets={meshes:[ghost],materials:[],textures:[]};agentResurrectionMaterials(assets);
 assert.equal(ghost.material.getClassName(),'ShaderMaterial');assert(ghost.material.metadata.spectral);
 agentDisposeMesh(ghost);source.dispose();agentState.intangibleUntil=agentState.revivedUntil=agentState.lockUntil=0;
 VS.player.agent='Sage';
 agentWallPositions=(point,yaw)=>Array.from({length:4},(_,i)=>point.add(new BABYLON.Vector3((i-1.5)*2.6,0,0)));
 agentState.equipped='C';agentWallPreviewUpdate();
 assert(agentState.wallPreview.root.isEnabled());
 assert(scene.getMeshByName('barrier_ground_print'));
 assert(!scene.getMeshByName('barrier_preview_segment'));
 assert(bindings.includes('wall-indicator')&&bindings.includes('wall-wisp'));
 agentPlaceWall(new BABYLON.Vector3(0,0,6),0);
 assert.equal(agentState.effects.filter(e=>e.type==='wall').length,4);
 for(const e of agentState.effects.filter(e=>e.type==='wall')) {
   e.mesh.computeWorldMatrix(true);const box=e.mesh.getBoundingInfo().boundingBox;
   assert(Math.abs(box.minimumWorld.y)<.00001,'wall foot must touch floor while rising');
   assert.equal(e.mesh.visibility,1,'intact shell must not be replaced by rubble');
 }
 assert(bindings.includes('wall-beams')&&bindings.includes('wall-skirt')&&bindings.includes('wall-ground'));
 const ally={hp:40,position:new BABYLON.Vector3(2,0,3)};
 agentCastLayers('heal',ally,5000);agentCastLayers('revive',ally,3000);
 VS.player.agent='Clove';agentCastLayers('pickup',VS.player,5000);agentCastLayers('clove-revive',VS.player,6000);
 for(let i=0;i<7;i++)agentSmoke(new BABYLON.Vector3(i*9,0,0),4,14000,500);
 assert.equal(agentState.effects.filter(e=>e.type==='smoke').length,7,'live smoke must not be evicted by effect cap');
 const slow=BABYLON.MeshBuilder.CreateDisc('review_slow',{radius:5},scene);
 slow.material=agentMaterial('review_slow_mat','#71CDBD');agentSlowLayers({mesh:slow,radius:5});
 assert.equal(slow.getChildMeshes().filter(m=>m.name==='skill_shard').length,64);
 VS.player.agent='Jett';agentWind('dash',500);agentWind('updraft',650);
 assert(bindings.includes('dash-left')&&bindings.includes('dash-right')&&bindings.includes('updraft'));
 for(let i=0;i<20;i++)agentKnifeFlight(new BABYLON.Ray(camera.position.clone(),BABYLON.Vector3.Forward(),10),new BABYLON.Vector3(0,1,10),i,false);
 assert.equal(agentState.effects.filter(e=>e.type==='knifeFlight').length,20,'live flight must not be removed by cap');
 const p={type:'cloud',mesh:BABYLON.MeshBuilder.CreateSphere('review_cloud',{},scene),velocity:new BABYLON.Vector3(0,0,1)};
 agentProjectileLayers(p);agentState.projectiles.push(p);
 for(const time of [1000,1050,1300,1600,2000]){window.__gameTime=time;agentEffectsTick();}
 assert(bindings.includes('heal-ribbon')&&bindings.includes('res-body')&&bindings.includes('pickup-swirl')&&bindings.includes('res-shockwave'));
 agentDisposeMesh(slow);agentClearEffects();
 assert.equal(agentState.effects.length,0);assert.equal(agentState.projectiles.length,0);
 assert.equal(scene.meshes.length,0,'skill meshes must be cleaned on reset');
 console.log(JSON.stringify({review:'CPU lifecycle and layer binding PASS',sourceBindings:[...new Set(bindings)],remainingMaterials:scene.materials.length}));
`,context);
scene.dispose();engine.dispose();
