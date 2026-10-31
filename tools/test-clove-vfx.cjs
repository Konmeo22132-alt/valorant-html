// CPU checks of actual exported poses, picking and effect lifecycle. No browser/GPU.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const B=require('babylonjs');require('babylonjs-loaders');
const root=path.resolve(__dirname,'..'),asset=path.join(root,'val-strike-html/assets/playable');
B.SceneLoader.OnPluginActivatedObservable.add(p=>{p.skipMaterials=true;});
const engine=new B.NullEngine({renderWidth:960,renderHeight:600}),scene=new B.Scene(engine),camera=new B.FreeCamera('camera',new B.Vector3(0,1.6,0),scene);
camera.minZ=.05;
camera.fov=1.4;
const cfg=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/playable-agents.json')));
const context={BABYLON:B,scene,camera,console,assert,window:{__gameTime:1000,GAME_CONFIG:{'playable-agents':cfg}},
  VS:{player:{agent:'Clove',hp:100}},playerController:{getState:()=>({feet:[0,0,0]})},rangeTargets:()=>[],uiHUDUpdate:()=>{},matchSpectatorActive:()=>false};
vm.createContext(context);
for(const file of ['collision-world','agent-visuals','agent-effects','agent-skill-layers','agent-clove','agent-abilities'])
  vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game/'+file+'.js'),'utf8'),context,{filename:file});
const run=s=>vm.runInContext(s,context);
run(`agentEffectTexture=name=>{if(!agentEffectTextures.has(name)){const t=BABYLON.RawTexture.CreateRGBATexture(new Uint8Array([180,150,230,255]),1,1,scene);t.skillReady=Promise.resolve();agentEffectTextures.set(name,t);}return agentEffectTextures.get(name);};
 const layers=[];agentAttachEffectModel=async(parent,label)=>{layers.push(label);};
 const center=new BABYLON.Vector3(13,4,-7),point=new BABYLON.Vector3(22,4,18);
 for(const yaw of [0,.7,Math.PI/2,Math.PI,-2.3]){cloveRuseMap.yaw=yaw;const uv=agentRuseMapUV(point,center,60),p=agentRuseMapWorld(uv.u,uv.v,center,60);assert(Math.abs(p.x-point.x)<1e-8&&Math.abs(p.z-point.z)<1e-8,'rotated map must select the same world point');}
 cloveRuseMap.yaw=0;const cells=agentRuseRaster(center,60,[[13,4,-7],[13,99,-7]],.6,128);assert(cells[64*128+64]);assert(cells.reduce((a,b)=>a+b,0)<20,'unsupported floors cannot fill the hologram');
 agentSmoke(new BABYLON.Vector3(0,0,8),4,14000,1000);
 assert(layers.includes('smoke')&&layers.includes('smoke-inner'),'both original smoke shells retained');
 assert.equal(agentState.effects.find(e=>e.type==='smoke').mesh.material.getClassName(),'ShaderMaterial');
 assert.equal(agentState.effects.find(e=>e.type==='smoke').position.y,0,'Ruse dome must be anchored to the selected floor');
 agentProjectile('meddle',18,9.8,10000);assert(layers.includes('meddle-core')&&layers.includes('meddle-ribbon-inverse'));
 agentMeddleImpact(new BABYLON.Vector3(0,0,8),4);
 assert.equal(scene.meshes.filter(m=>m.name==='meddle_energy_curl').length,8);
 assert(layers.includes('meddle-ribbon-secondary')&&layers.includes('meddle-cast-ring'));
 agentEffectsTick();agentClearEffects();assert.equal(scene.meshes.length,0,'all world layers must dispose');
`);
(async()=>{try{
 const bytes=fs.readFileSync(path.join(asset,'smonk-meddle-view.glb'));
 const container=await B.SceneLoader.LoadAssetContainerAsync('','data:;base64,'+bytes.toString('base64'),scene,undefined,'.glb');
 context.loaded=container;run(`agentVisual.effectAssets.set('smonk-meddle-view.glb',loaded);`);
 await run('agentClovePrepare()');
 const armsBytes=fs.readFileSync(path.join(asset,'smonk-arms.glb'));
 const arms=await B.SceneLoader.LoadAssetContainerAsync('','data:;base64,'+armsBytes.toString('base64'),scene,undefined,'.glb');
 arms.addAllToScene();arms.rootNodes.forEach(n=>n.parent=camera);context.arms=arms;
 run(`arms.transformNodes.forEach(n=>agentVisual.fpNodes.set(n.name,n));arms.animationGroups.forEach(g=>{g.start(false);g.pause();});assert(arms.animationGroups.some(g=>g.name==='E_set'),'Ruse placement must have the native smoke-set gesture');`);
 const capture=run(`(()=>{const view=agentVisual.meddleView,reports=[];
   assert.equal(view.groups.size,3);assert(view.offset,'21-bone spikeball model has the core socket');
   assert.equal(view.root.getChildMeshes().find(m=>m.name.endsWith('primitive0')).material._floats.core,1,'original core primitive must get the cyan material, not the purple wing shader');
   for(const [phase,time] of [['equip',500],['idle',1200],['toss',180]]){
     window.__gameTime=2000+time;agentState.equipped=phase==='toss'?null:'Q';
     agentVisual.action=phase==='idle'?null:{name:phase==='toss'?'Q_cast':'Q_equip',start:2000};
     const armGroup=arms.animationGroups.find(g=>g.name===({equip:'Q_equip',idle:'Q_idle',toss:'Q_cast'}[phase]));
     armGroup.goToFrame(agentFrame(armGroup,time,phase==='idle'));
     agentMeddleViewUpdate(window.__gameTime);scene.render();
     agentMeddleViewUpdate(window.__gameTime);scene.render();
     let vertices=0,visible=0;const bounds=[Infinity,Infinity,-Infinity,-Infinity],worlds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
     for(const mesh of view.root.getChildMeshes().filter(m=>m!==view.core)){
       mesh.computeWorldMatrix(true);mesh.skeleton?.prepare(true);const positions=mesh.getPositionData(true,false);
       if(!positions)continue;
       for(const index of new Set(mesh.getIndices())){const i=index*3,world=BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(positions,i),mesh.getWorldMatrix());
         for(let k=0;k<3;k++){const v=world.asArray()[k];worlds[k]=Math.min(worlds[k],v);worlds[k+3]=Math.max(worlds[k+3],v);}
         const p=BABYLON.Vector3.Project(BABYLON.Vector3.FromArray(positions,i),mesh.getWorldMatrix(),scene.getTransformMatrix(),new BABYLON.Viewport(0,0,960,600));
         assert(Number.isFinite(p.x)&&Number.isFinite(p.y));vertices++;if(p.z>0&&p.z<1&&p.x>0&&p.x<960&&p.y>0&&p.y<600)visible++;
         bounds[0]=Math.min(bounds[0],p.x);bounds[1]=Math.min(bounds[1],p.y);bounds[2]=Math.max(bounds[2],p.x);bounds[3]=Math.max(bounds[3],p.y);}
     }
     const core=BABYLON.Vector3.TransformCoordinates(view.core.getAbsolutePosition(),BABYLON.Matrix.Invert(camera.getWorldMatrix()));
     reports.push({phase,visible,vertices,bounds:bounds.map(Math.round),core:core.asArray()});
     assert(visible>vertices*.25,'native Meddle '+phase+' pose must be visible');
     assert(core.z>.15&&core.z<1.2,'core must stay in front of the camera');
   }return reports;})()`);
 context.document={getElementById:()=>({getBoundingClientRect:()=>({left:50,top:30,width:1366,height:768})})};
 run(`const canvas={width:512,height:512,getContext:()=>({})};agentRuseViewCreate(canvas);
   cloveRuseMap.open=true;cloveRuseMap.openedAt=1000;agentRuseViewUpdate(1900);scene.render();
   for(const [u,v] of [[0,0],[.5,-.3],[-.4,.25]]){
     const local=new BABYLON.Vector3(u*.29,-v*.29,0),projected=BABYLON.Vector3.Project(local,cloveRuseMap.view.plane.getWorldMatrix(),scene.getTransformMatrix(),new BABYLON.Viewport(0,0,960,600));
     const uv=agentRusePick({clientX:50+projected.x/960*1366,clientY:30+projected.y/600*768});
     assert(uv&&Math.abs(uv.u-u)<.001&&Math.abs(uv.v-v)<.001,'projected hologram click must match its world landing point');
   }
   cloveRuseMap.open=false;cloveRuseMap.closedAt=1900;agentRuseViewUpdate(2200);assert(!cloveRuseMap.view.root.isEnabled(),'cancel completes hologram fade');
   VS.round={phase:'live'};window.__gameTime=4000;agentProjectile('meddle',18,9.8,10000,VS.player,null,null,240);
   const thrown=agentState.projectiles[0];assert(!thrown.mesh.isEnabled());
   abilityWorldPick=ray=>{if(ray.direction.y>=0)return null;const d=-ray.origin.y/ray.direction.y;
     return d>=0&&d<=ray.length?{pickedPoint:ray.origin.add(ray.direction.scale(d)),getNormal:()=>BABYLON.Vector3.Up()}:null;};
   for(let time=4016;time<6500&&!thrown.stuck;time+=16){window.__gameTime=time;agentUpdate(.016);}
   assert(thrown.stuck,'Meddle must land');assert.equal(thrown.expires-window.__gameTime,750,'ground contact starts the current Riot fuse');
   window.__gameTime=thrown.expires-1;agentUpdate(.016);assert(agentState.projectiles.includes(thrown));
   window.__gameTime=thrown.expires;agentUpdate(.001);assert(!agentState.projectiles.includes(thrown));agentClearEffects();
 `);
 console.log(JSON.stringify({result:'PASS CPU Clove source poses, projected picking, release/ground fuse, smoke/Q layers, lifecycle',poses:capture}));
 run('agentCloveDispose()');arms.dispose();assert.equal(scene.meshes.length,0);container.dispose();
 }finally{scene.dispose();engine.dispose();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
