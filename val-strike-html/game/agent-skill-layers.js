// Skill layers are independent of map LOD. Shared source textures retain their
// native size/alpha. No distance/frustum policy removes a living skill layer.
async function agentPreloadSkillAssets(name,version) {
  const common=['alpha-scroll-b','alpha-scroll-c','smoke-noise'];
  const selected={Clove:['clove-ripple','clove-butterfly','clove-essence','clove-glow','clove-generic'],
    Jett:['jett-wind','jett-air','jett-swipe','jett-dome'],
    Sage:['sage-crystal','sage-flow','sage-noise','sage-orb','sage-energy','sage-energy-mask','sage-res-body']}[name];
  const textures=[...common,...selected].map(agentEffectTexture);
  await Promise.all(textures.map(t=>t.skillReady));
  if(version!==agentVisual.version)return;
  const response=await fetch('/assets/playable/manifest.json?v=38');if(!response.ok)throw Error('Skill manifest '+response.status);
  const manifest=await response.json(),code=window.GAME_CONFIG['playable-agents'][name].code;
  // Two concurrent model requests keep loading memory bounded; every layer is
  // prepared before casting, so a short effect cannot expire during download.
  const files=Object.keys(manifest[name].effects);
  for(let i=0;i<files.length;i+=2) {
    await Promise.all(files.slice(i,i+2).map(async label=>{
      const filename=code+'-'+label+'.glb';
      const container=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',filename+'?v=27',scene);
      if(version!==agentVisual.version||scene.isDisposed){container.dispose();return;}
      agentVisual.effectAssets.set(filename,container);
    }));
    if(version!==agentVisual.version)return;
  }
  if(name==='Clove') {
    await agentClovePrepare();if(version!==agentVisual.version)return;
    await agentLoadResurrectionArms();if(version===agentVisual.version&&!agentVisual.resurrection)throw Error('Clove resurrection arms unavailable');
    const container=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/','smonk-resurrection-body.glb?v=27',scene);
    if(version!==agentVisual.version||scene.isDisposed){container.dispose();return;}
    const root=new BABYLON.TransformNode('clove_resurrection_body',scene);container.addAllToScene();container.rootNodes.forEach(n=>n.parent=root);
    agentResurrectionMaterials(container);
    const groups=new Map();container.animationGroups.forEach(g=>{g.start(false);g.pause();groups.set(g.name,g);});groups.get('idle')?.goToFrame(0);
    const bounds=root.getHierarchyBoundingVectors(true),height=bounds.max.y-bounds.min.y,scale=height>0?1.8/height:1;
    root.scaling.setAll(scale);root.setEnabled(false);container.meshes.forEach(m=>{m.isPickable=false;m.metadata={agentBody:true};});
    agentVisual.ghost={container,root,groups,offset:-bounds.min.y*scale};
  }
}
function agentLayerMaterial(name,texture,color,opacity=.65,mask='alpha-scroll-b') {
  if(texture==='sage-energy')mask='sage-energy-mask';
  else if(name.includes('res'))mask='alpha-scroll-c';
  BABYLON.Effect.ShadersStore.skillLayerVertexShader=`precision highp float;
    attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;
    void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.skillLayerFragmentShader=`precision highp float;
    varying vec2 vUV;uniform sampler2D pattern;uniform sampler2D maskTexture;
    uniform vec3 color;uniform float clock;uniform float opacity;uniform float radial;uniform float frames;
    void main(){vec2 uv=vUV;float frame=mod(floor(clock*24.0),frames);
      vec2 sampleUV=vec2(uv.x-clock*.12,(uv.y+frame)/frames);
      vec4 p=texture2D(pattern,sampleUV);float m=texture2D(maskTexture,vec2(uv.x,uv.y-clock*.17)).r;
      float edge=mix(sin(clamp(uv.y,0.0,1.0)*3.14159),1.0-smoothstep(.38,.5,length(uv-.5)),radial);
      float a=max(p.r,max(p.g,p.b))*p.a*mix(.45,1.0,m)*edge;
      gl_FragColor=vec4(color*(.8+p.rgb*.35),a*opacity);}`;
  const material=new BABYLON.ShaderMaterial(name,scene,'skillLayer',{
    attributes:['position','uv'],uniforms:['worldViewProjection','color','clock','opacity','radial','frames'],
    samplers:['pattern','maskTexture'],needAlphaBlending:true});
  material.setTexture('pattern',agentEffectTexture(texture));material.setTexture('maskTexture',agentEffectTexture(mask));
  material.setColor3('color',BABYLON.Color3.FromHexString(color));material.setFloat('opacity',opacity);
  material.setFloat('clock',0);material.setFloat('radial',0);material.setFloat('frames',1);
  material.backFaceCulling=false;material.disableDepthWrite=true;material.alphaMode=BABYLON.Engine.ALPHA_ADD;
  material.metadata={skillLayer:true,opacity};return material;
}
function agentLuminousMaterial(name,color) {
  const material=agentMaterial(name,color);
  material.disableLighting=true;material.emissiveColor=material.diffuseColor.clone();
  material.metadata={ownedSkill:true};return material;
}
function agentResurrectionMaterials(container) {
  // Source DF stores a dark underlying skin, not the final spectral appearance.
  // Remap its detail into a bounded luminous palette; never multiply the entire
  // body by a dark albedo or add a flat white emissive term.
  BABYLON.Effect.ShadersStore.cloveSpectralVertexShader=`precision highp float;
    attribute vec3 position;attribute vec3 normal;attribute vec2 uv;
    uniform mat4 world;uniform mat4 viewProjection;
    varying vec2 vUV;varying vec3 vWorld;varying vec3 vNormal;
    #include<bonesDeclaration>
    void main(){mat4 finalWorld=world;
      #include<bonesVertex>
      vec4 p=finalWorld*vec4(position,1.0);vWorld=p.xyz;
      vNormal=normalize(mat3(finalWorld)*normal);vUV=uv;
      gl_Position=viewProjection*p;}`;
  BABYLON.Effect.ShadersStore.cloveSpectralFragmentShader=`precision highp float;
    varying vec2 vUV;varying vec3 vWorld;varying vec3 vNormal;
    uniform sampler2D skinDetail;uniform float hasDetail;uniform float firstPerson;uniform float fade;
    uniform float clock;uniform vec3 eyePosition;
    void main(){vec3 source=texture2D(skinDetail,vUV).rgb;
      float value=dot(source,vec3(.2126,.7152,.0722));
      float detail=mix(.65,smoothstep(.045,.38,value),hasDetail);
      float rim=pow(1.0-clamp(abs(dot(normalize(vNormal),normalize(eyePosition-vWorld))),0.0,1.0),1.7);
      vec3 body=mix(vec3(.57,.38,.76),vec3(.82,.68,.94),detail);
      vec3 hands=mix(vec3(.64,.73,.91),vec3(.85,.94,.98),detail);
      vec3 core=mix(body,hands,firstPerson);
      vec3 edge=mix(vec3(.98,.65,.89),vec3(.91,.87,.99),firstPerson);
      float wave=.5+.5*sin(vWorld.y*4.0-clock*2.0);
      vec3 color=mix(core,edge,rim*.85)+vec3(.02,.012,.025)*wave;
      gl_FragColor=vec4(clamp(color,0.0,.99),mix(.84+.12*rim,.96,firstPerson)*fade);}`;
  const replacements=new Map();
  for(const mesh of container.meshes) {
    const source=mesh.material;if(!source||!mesh.getTotalVertices())continue;
    let material=replacements.get(source);
    if(!material) {
      material=new BABYLON.ShaderMaterial(source.name+'_spectral',scene,'cloveSpectral',{
        attributes:['position','normal','uv'],
        uniforms:['world','viewProjection','eyePosition','clock','hasDetail','firstPerson','fade'],
        samplers:['skinDetail'],needAlphaBlending:true});
      material.setTexture('skinDetail',source.albedoTexture||agentEffectTexture('clove-generic'));
      material.setFloat('hasDetail',source.albedoTexture?1:0);material.setFloat('fade',1);
      material.setFloat('firstPerson',source.name.startsWith('FP_')?1:0);
      material.setFloat('clock',0);material.setVector3('eyePosition',camera.globalPosition||camera.position);
      material.onBindObservable.add(()=>{
        const effect=material.getEffect();
        effect.setVector3('eyePosition',(scene.activeCamera||camera).globalPosition);
        effect.setFloat('clock',agentNow()/1000);
      });
      material.backFaceCulling=true;material.disableDepthWrite=true;
      material.alphaMode=BABYLON.Engine.ALPHA_COMBINE;
      material.metadata={ownedSkill:true,spectral:true};
      container.materials.push(material);replacements.set(source,material);
    }
    mesh.material=material;
  }
}
function agentLayerRoot(name,skillAgent) {const root=new BABYLON.Mesh(name,scene);root.isPickable=false;if(skillAgent)root.metadata={skillAgent};return root;}
function agentLayerSource(root,label,size,material,fit) {
  const anchor=agentLayerRoot('source_'+label);anchor.parent=root;anchor.material=material;
  agentAttachEffectModel(anchor,label,size,{replace:false,material,fit});return anchor;
}
function agentLayerPlane(root,name,width,height,material) {
  const mesh=BABYLON.MeshBuilder.CreatePlane(name,{width,height,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  mesh.parent=root;mesh.material=material;mesh.isPickable=false;return mesh;
}
function agentLayerRing(root,radius,material) {
  const mesh=BABYLON.MeshBuilder.CreateDisc('energy_ground',{radius,tessellation:48},scene);
  mesh.parent=root;mesh.rotation.x=Math.PI/2;mesh.material=material;mesh.isPickable=false;return mesh;
}
function agentLayerShards(root,count,radius,height,material,size=.065) {
  const shards=[];
  for(let i=0;i<count;i++) {
    const mesh=BABYLON.MeshBuilder.CreatePolyhedron('skill_shard',{type:1,size},scene);
    mesh.parent=root;mesh.material=material;mesh.isPickable=false;
    const a=i*2.39996;mesh.position.set(Math.cos(a)*radius,.08+(i%5)/5*height,Math.sin(a)*radius);
    mesh.scaling.set(.45,1.8,.7);mesh.rotation.set(i*.7,i*.3,i*.6);shards.push(mesh);
  }return shards;
}
function agentLayerDispose(root) {
  const materials=new Set([root.material,...root.getChildMeshes().map(mesh=>mesh.material)].filter(Boolean));
  root.dispose(false,false);materials.forEach(material=>{if(material.metadata?.skillLayer||material.metadata?.ownedSkill)material.dispose(false,false);});
}
function agentLayerTrack(root,life,update) {
  const effect={type:'skillLayers',mesh:root,created:agentNow(),expires:agentNow()+life,update};
  root.onDisposeObservable.add(()=>{
    const owned=new Set(root.getChildMeshes().map(m=>m.material));
    owned.forEach(m=>{if(m?.metadata?.skillLayer||m?.metadata?.ownedSkill)m.dispose(false,false);});
  });
  agentState.effects.push(effect);return effect;
}
function agentSkillLayersTick() {
  const now=agentNow();
  const held=typeof matchActive==='function'&&matchActive()?matchState.bots.map(b=>b.held).filter(Boolean):[];
  const roots=[...agentState.effects.map(e=>e.mesh),...agentState.projectiles.map(p=>p.mesh),agentState.wallPreview?.root,agentVisual.heldEffect,...held].filter(Boolean);
  const materials=new Set();for(const root of roots)for(const mesh of [root,...root.getChildMeshes()]) {
    if(mesh.material?.metadata?.skillLayer)materials.add(mesh.material);
  }
  materials.forEach(m=>m.setFloat('clock',now/1000));
  for(const effect of agentState.effects)if(effect.type==='skillLayers')effect.update?.(effect,now);
  agentVisual.heldEffect?.metadata?.updateLayers?.(now);
  held.forEach(mesh=>{mesh.metadata?.updateLayers?.(now);if(mesh.material?.metadata?.agentPattern)mesh.material.setFloat('clock',now/1000);});
  for(const p of agentState.projectiles){p.updateVFX?.(now);if(p.velocity.lengthSquared()>.01)p.mesh.lookAt(p.mesh.position.add(p.velocity));}
}
function agentHeldMaterial(label) {
  if(label!=='orb')return agentMeddleMaterial('meddle_held');
  BABYLON.Effect.ShadersStore.sageOrbVertexShader=`precision highp float;attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.sageOrbFragmentShader=`precision highp float;varying vec2 vUV;uniform sampler2D core;
    uniform sampler2D flow;uniform float clock;void main(){vec3 p=texture2D(core,vUV).rgb;
      float n=texture2D(flow,vUV*1.3+vec2(clock*.08,-clock*.13)).r;
      float crack=smoothstep(.42,.76,p.b+p.r*.3);vec3 color=mix(vec3(.015,.13,.17),vec3(.08,.8,.66),crack);
      color+=vec3(.15,.7,.55)*pow(n,5.0)*.5;gl_FragColor=vec4(color,1.0);}`;
  const mat=new BABYLON.ShaderMaterial('sage_orb_source',scene,'sageOrb',{attributes:['position','uv'],
    uniforms:['worldViewProjection','clock'],samplers:['core','flow']});
  mat.setTexture('core',agentEffectTexture('sage-orb'));mat.setTexture('flow',agentEffectTexture('sage-flow'));
  mat.setFloat('clock',0);mat.metadata={agentPattern:true};return mat;
}
function agentHeldLayers(mesh,label) {
  if(mesh.metadata?.updateLayers)return;
  const root=agentLayerRoot('held_skill_layers');root.parent=mesh;
  const mat=agentLayerMaterial('orb_halo',label==='orb'?'sage-energy':'clove-glow',label==='orb'?'#72FFE0':'#E1B1FF',.8);
  const halo=agentLayerPlane(root,'held_core_glow',.3,.3,mat);halo.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
  const shardMat=agentLuminousMaterial('held_crystals','#83F8DD');
  const shards=label==='orb'?agentLayerShards(root,8,.105,.08,shardMat,.012):[];
  if(label==='orb')agentLayerSource(root,'orb-energy',.2,mat);
  else {const ribbon=agentLayerSource(root,'meddle-ribbon',.3,mat);ribbon.rotation.y=Math.PI/2;}
  let view=false;for(let node=mesh;node;node=node.parent)if(node===camera||node.metadata?.viewmodel)view=true;
  root.getChildMeshes().forEach(m=>m.renderingGroupId=view?1:0);
  mesh.onDisposeObservable.add(()=>{mat.dispose(false,false);shardMat.dispose();});
  mesh.metadata={...mesh.metadata,updateLayers:now=>{
    shards.forEach((s,i)=>{const a=now*.0015+i*Math.PI/4;s.position.set(Math.cos(a)*.11,Math.sin(now*.004+i)*.035,Math.sin(a)*.11);s.rotation.y=a;});
    halo.scaling.setAll(1+Math.sin(now*.004)*.06);
  }};
}
function agentCreateWallPreview() {
  const root=agentLayerRoot('barrier_placement'),cfg=agentConfig().C;
  const material=agentLayerMaterial('barrier_placement_energy','sage-flow','#4FF4CB',.8),crystal=agentLayerMaterial('barrier_placement_crystal','sage-crystal','#7DFFE0',.6);
  const ground=BABYLON.MeshBuilder.CreateGround('barrier_ground_print',{width:cfg.width*cfg.segments,height:cfg.depth,subdivisions:1},scene);
  ground.parent=root;ground.position.y=.025;ground.material=crystal;ground.isPickable=false;
  const curtain=agentLayerPlane(root,'barrier_ground_wisps',cfg.width*cfg.segments,.5,material);curtain.position.y=.25;
  const indicator=agentLayerSource(root,'wall-indicator',cfg.width*cfg.segments,material,[cfg.width*cfg.segments,.3,cfg.depth]);
  indicator.position.y=.04;
  const wisp=agentLayerSource(root,'wall-wisp',cfg.width*cfg.segments,material,[cfg.width*cfg.segments,.45,cfg.depth]);wisp.position.y=.23;
  const shardMat=agentLuminousMaterial('placement_shard','#88FFE2');
  const shards=agentLayerShards(root,24,1,.24,shardMat);
  shards.forEach((s,i)=>s.position.set((i/23-.5)*cfg.width*cfg.segments,.07+i%4*.05,Math.sin(i*2.4)*cfg.depth*.42));
  return {root,material,crystal,shardMat,shards,at:-Infinity,dispose(){agentLayerDispose(root);}};
}
function agentPreviewPlacementUpdate() {
  const active=VS.player.agent==='Sage'&&agentState.equipped==='C'&&VS.player.hp>0;
  if(!active){agentState.wallPreview?.root.setEnabled(false);return;}
  if(!agentState.wallPreview)agentState.wallPreview=agentCreateWallPreview();
  const preview=agentState.wallPreview,now=agentNow();preview.root.setEnabled(true);
  preview.shards.forEach((s,i)=>{s.position.y=.08+(Math.sin(now*.003+i)+1)*.1;s.rotation.y=now*.001+i;});
  if(now-preview.at<80)return;preview.at=now;
  const cfg=agentConfig().C,point=agentAimGround(cfg.range),yaw=camera.rotation.y+agentState.rotation;
  if(!point){preview.root.setEnabled(false);return;}
  preview.root.position.copyFrom(point);preview.root.rotation.y=yaw;
  const valid=agentWallPositions(point,yaw)!==null,color=BABYLON.Color3.FromHexString(valid?'#4FF4CB':'#F46A78');
  preview.material.setColor3('color',color);preview.crystal.setColor3('color',color);
  preview.shardMat.diffuseColor.copyFrom(color);preview.shardMat.emissiveColor.copyFrom(color);
}
function agentSmokeLayers(effect,clove) {
  const telegraph=agentLayerRoot('smoke_telegraph');telegraph.position.copyFrom(effect.floorPosition||effect.position);
  if(!effect.floorPosition)telegraph.position.y-=effect.radius*.35;
  const teleMat=agentLayerMaterial('smoke_telegraph_flow',clove?'clove-ripple':'jett-air',clove?'#DCA7F4':'#DAF8FF',.7);teleMat.setFloat('radial',1);
  const teleRing=agentLayerRing(telegraph,effect.radius,teleMat);teleRing.position.y=.03;
  const life=effect.starts-effect.created+(clove?650:380);
  agentLayerTrack(telegraph,life,(e,now)=>{const t=(now-e.created)/life;teleRing.scaling.setAll(.45+.55*Math.min(1,t*3));teleMat.setFloat('opacity',Math.sin(t*Math.PI)*.7);});
  const root=agentLayerRoot('smoke_secondary');root.parent=effect.mesh;
  const color=clove?'#EDB2E8':'#D9F8FF';
  const mat=clove?agentRuseSmokeMaterial('ruse_source_bands'):agentLayerMaterial('smoke_edge_flow','jett-dome',color,.3);
  agentLayerSource(root,clove?'smoke-inner':'updraft',effect.radius*1.94,mat);
  if(clove){agentLayerSource(root,'smoke',effect.radius*2.015,mat);effect.ruseShellMaterials=[mat];}
  const groundMat=agentLayerMaterial('smoke_ground_ripples',clove?'clove-ripple':'jett-air',color,.6);
  groundMat.setFloat('radial',1);const ring=agentLayerRing(root,effect.radius*1.02,groundMat);ring.position.y=(effect.floorPosition?effect.floorPosition.y-effect.position.y:-effect.radius*.35)+.03;
  effect.mesh.onDisposeObservable.add(()=>{mat.dispose(false,false);groundMat.dispose(false,false);});
}
function agentWallLayers(effect) {
  const cfg=effect.cfg||agentConfig().C,root=agentLayerRoot('barrier_surface_layers');root.parent=effect.mesh;
  const mat=agentLayerMaterial('barrier_beams','sage-flow','#6CFFD9',.35);
  agentLayerSource(root,'wall-beams',cfg.width,mat,[cfg.width,cfg.height,cfg.depth]);
  const skirt=agentLayerSource(root,'wall-skirt',cfg.width,mat,[cfg.width,.38,cfg.depth*1.1]);skirt.position.y=-cfg.height/2+.19;
  const ground=agentLayerSource(root,'wall-ground',cfg.width,mat,[cfg.width,.12,cfg.depth*1.15]);ground.position.y=-cfg.height/2+.06;
  effect.mesh.onDisposeObservable.add(()=>mat.dispose(false,false));
}
function agentProjectileLayers(projectile) {
  const root=agentLayerRoot('projectile_energy');root.parent=projectile.mesh;
  const clove=projectile.type==='meddle',sage=projectile.type==='slow';
  const mat=clove?agentMeddleHaloMaterial('projectile_glow'):agentLayerMaterial('projectile_glow',sage?'sage-energy':'jett-air',sage?'#7BFFE0':'#DCF6FF',.75);
  const glow=agentLayerPlane(root,'projectile_halo',.38,.38,mat);glow.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
  const trail=agentLayerPlane(root,'projectile_streak',.16,.65,mat);trail.rotation.x=Math.PI/2;trail.position.z=-.3;
  if(!clove&&!sage)agentLayerSource(root,'updraft',.22,mat);
  if(clove){
    const core=BABYLON.MeshBuilder.CreateSphere('meddle_projectile_core',{diameter:.115,segments:12},scene);core.parent=root;core.isPickable=false;core.material=agentMeddleMaterial('meddle_projectile_core_material',true);
    agentLayerSource(root,'meddle-core',.13,core.material);
    const pink=agentLayerMaterial('meddle_flight_pink','clove-generic','#C774FF',.85),blue=agentLayerMaterial('meddle_flight_blue','clove-generic','#ABDFFF',.75);
    const ribbon=agentLayerSource(root,'meddle-ribbon',.35,pink),inverse=agentLayerSource(root,'meddle-ribbon-inverse',.35,blue);
    projectile.updateVFX=now=>{const age=(now-projectile.releaseAt)/1000,pulse=1+Math.sin(age*15)*.08;
      core.scaling.setAll(pulse);ribbon.rotation.z=age*3;inverse.rotation.z=-age*3;
      mat.setFloat('opacity',projectile.stuck ? .9 : .7);glow.scaling.setAll(projectile.stuck?1.3:pulse);
    };
  }
}
function agentMeddleImpact(point,radius,owner=VS.player) {
  const root=agentLayerRoot('meddle_detonation','Clove');root.position.copyFrom(point);
  const pink=agentLayerMaterial('meddle_pink_burst','clove-generic','#D682FF',.9),blue=agentLayerMaterial('meddle_blue_burst','clove-generic','#A4C8FF',.75);
  const ring=BABYLON.MeshBuilder.CreateTorus('meddle_expanding_ring',{diameter:radius*2,thickness:.055,tessellation:64},scene);ring.parent=root;ring.material=pink;ring.isPickable=false;ring.position.y=.025;
  const ribbon=agentLayerSource(root,'meddle-ribbon',radius*2,blue,[radius*2,2.6,radius*2]);
  const inverse=agentLayerSource(root,'meddle-ribbon-inverse',radius*2,pink,[radius*2,2.6,radius*2]);
  const secondary=agentLayerSource(root,'meddle-ribbon-secondary',radius*2,pink,[radius*2,2.1,radius*2]);
  agentLayerSource(root,'meddle-cast-ring',radius*2,pink);
  const arcs=[];
  for(let i=0;i<8;i++){
    const paths=[[],[]],base=i*Math.PI/4;
    for(let j=0;j<=18;j++){const t=j/18,a=base+t*.75,r=radius*(.74+Math.sin(t*Math.PI)*.2),h=Math.sin(t*Math.PI)*(1.3+i%3*.25);
      const p=new BABYLON.Vector3(Math.cos(a)*r,h,Math.sin(a)*r);paths[0].push(p);paths[1].push(p.add(new BABYLON.Vector3(0,.12,.025)));}
    const arc=BABYLON.MeshBuilder.CreateRibbon('meddle_energy_curl',{pathArray:paths,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);arc.parent=root;arc.material=i%2?pink:blue;arc.isPickable=false;arcs.push(arc);
  }
  agentLayerTrack(root,850,(e,now)=>{const t=(now-e.created)/850,fade=Math.min(1,t*12)*Math.max(0,1-t);
    root.scaling.setAll(.12+.88*(1-Math.pow(1-t,4)));pink.setFloat('opacity',fade*.95);blue.setFloat('opacity',fade*.8);
    ribbon.rotation.y=t*1.4;inverse.rotation.y=-t*1.1;secondary.rotation.y=t*.7;arcs.forEach(arc=>arc.position.y=Math.sin(t*Math.PI)*.15);
  });
}
function agentCastLayers(kind,entity,duration,owner=VS.player) {
  const clove=agentConfig(owner).code==='smonk',root=agentLayerRoot(kind+'_layers',clove?'Clove':'Sage');
  const color=clove?'#D7A2FF':'#68FFE0',material=agentLayerMaterial(kind+'_flow',clove?'clove-generic':'sage-energy',color,.75);
  const ground=agentLayerMaterial(kind+'_ground',clove?'clove-ripple':'sage-crystal',color,.7);ground.setFloat('radial',1);
  const ring=agentLayerRing(root,kind==='pickup'?.65:1,ground);ring.position.y=.025;
  const source=kind==='pickup'?'pickup-swirl':kind==='clove-revive'?'res-shockwave':kind==='heal'?'heal-ribbon':'res-ribbon';
  const ribbon=agentLayerSource(root,source,kind==='pickup'?1.6:2.2,material,[1.3,1.8,1.3]);ribbon.position.y=.9;
  const shardMat=clove?agentLayerMaterial('clove_cast_butterflies','clove-butterfly',color,.8):agentLuminousMaterial('cast_motes',color);
  if(clove)shardMat.setFloat('radial',1);
  const motes=clove?Array.from({length:16},()=>{
    const mote=agentLayerPlane(root,'clove_cast_butterfly',.13,.13,shardMat);
    mote.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;return mote;
  }):agentLayerShards(root,16,.6,1.5,shardMat);
  if(kind==='revive') {
    const body=agentLayerMaterial('resurrection_silhouette','sage-res-body','#83FFE3',.75);
    const silhouette=agentLayerSource(root,'res-body',1.8,body,[.7,1.8,.45]);silhouette.position.y=.9;
  }
  const at=()=>entity===VS.player?agentPosition():agentPosition(entity);root.position.copyFrom(at());
  agentLayerTrack(root,duration,(e,now)=>{
    const t=Math.min(1,(now-e.created)/duration);root.position.copyFrom(at());ribbon.rotation.y=t*3;
    const fade=Math.min(1,t*5,(1-t)*6);material.setFloat('opacity',fade*.75);ground.setFloat('opacity',fade*.7);
    ring.scaling.setAll(.8+Math.sin(t*Math.PI*6)*.1);
    motes.forEach((m,i)=>{const a=now*.002+i*2.4;m.position.set(Math.cos(a)*.6,((t*2+i/16)%1)*1.8,Math.sin(a)*.6);
      const scale=Math.max(.001,fade);m.scaling.set(scale*(clove ? .3+.7*Math.abs(Math.sin(now*.012+i)) : 1),scale,scale);});
  });
  if(kind==='heal' && entity!==owner)agentHealBeam(entity,duration,owner);
}
function agentHealBeam(entity,duration,owner=VS.player) {
  const root=agentLayerRoot('ally_heal_beam'),material=agentLayerMaterial('healing_stream','sage-flow','#6BFFE1',.8);
  const beam=agentLayerPlane(root,'healing_ribbon',1,.16,material);
  agentLayerTrack(root,duration,()=>{
    const view=bodyOwnerView(owner),from=view.hand?view.hand.getAbsolutePosition().clone():owner===VS.player?camera.position.add(camera.getDirection(new BABYLON.Vector3(0,-.18,.5))):agentPosition(owner).add(new BABYLON.Vector3(0,1.25,0)).add(owner.forward.scale(.4)),to=agentPosition(entity).add(new BABYLON.Vector3(0,1,0));
    const direction=to.subtract(from),length=direction.length();beam.position.copyFrom(BABYLON.Vector3.Lerp(from,to,.5));
    beam.scaling.x=length;beam.rotationQuaternion=BABYLON.Quaternion.FromLookDirectionLH(direction.normalize(),BABYLON.Vector3.Up()).multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,Math.PI/2));
  });
}
function agentSlowLayers(effect) {
  const root=agentLayerRoot('slow_crystals');root.parent=effect.mesh;root.rotation.x=-Math.PI/2;
  const material=agentLuminousMaterial('slow_crystal','#71CDBD');
  const shards=agentLayerShards(root,64,effect.radius*.8,.1,material);
  shards.forEach((s,i)=>{const a=i*2.39996,r=effect.radius*Math.sqrt((i+.5)/64)*.95;s.position.set(Math.cos(a)*r,.07,Math.sin(a)*r);s.scaling.set(1+(i%3),1,1+(i%2));});
  effect.mesh.onDisposeObservable.add(()=>material.dispose());
}
function agentAbilityCastTrail(label,texture,color,duration=500,owner=VS.player) {
  const firstPerson=bodyOwnerView(owner).firstPerson;
  const root=agentLayerRoot(label+'_cast_trail',owner.member?.agent||owner.agent);root.parent=firstPerson?camera:null;
  const mat=agentLayerMaterial(label+'_trail_mat',texture,color,.7);
  if(texture==='jett-swipe')mat.setFloat('frames',4);
  const source=agentLayerSource(root,label,.55,mat);source.position.set(0,firstPerson?-.13:0,firstPerson?.55:0);
  root.getChildMeshes().forEach(m=>m.renderingGroupId=firstPerson?1:0);
  agentLayerTrack(root,duration,(e,now)=>{
    if(!firstPerson){const hand=bodyOwnerView(owner).hand;if(hand)root.position.copyFrom(hand.getAbsolutePosition());else root.position.copyFrom(agentPosition(owner)).y+=1.3;root.rotation.y=owner===VS.player?camera.rotation.y:Math.atan2(owner.forward.x,owner.forward.z);}
    const t=(now-e.created)/duration;mat.setFloat('opacity',Math.sin(t*Math.PI)*.7);source.rotation.z=t*2;
  });
}
