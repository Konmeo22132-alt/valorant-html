// Native source textures and animated mesh layers for agent abilities.
const agentEffectTextures=new Map();
function agentEffectsDispose() {agentEffectTextures.forEach(texture=>texture.dispose());agentEffectTextures.clear();}
function agentEffectTexture(name) {
  if (!agentEffectTextures.has(name)) {
    let ready,failed;const promise=new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
    const texture=new BABYLON.Texture('/assets/playable/vfx/'+name+'.png?v=27',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      ready,message=>failed(new Error('Skill texture '+name+': '+message)));
    texture.skillReady=promise;promise.catch(error=>{window.__skillAssetErrors=window.__skillAssetErrors||[];window.__skillAssetErrors.push(error.message);});
    // Release an obsolete preload when agent selection disposes its textures.
    texture.onDisposeObservable.add(()=>ready());
    texture.wrapU=texture.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    agentEffectTextures.set(name,texture);
  }
  return agentEffectTextures.get(name);
}
function agentPatternMaterial(name,base,accent,textureName,alpha=1) {
  BABYLON.Effect.ShadersStore.agentPatternVertexShader=`precision highp float;
    attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;uniform float clock;uniform float billow;varying vec2 vUV;varying vec3 vP;
    void main(){vUV=uv;vP=position;float wave=sin(position.y*2.5+clock*2.2)*sin(position.x*2.0-clock*1.7);
      gl_Position=worldViewProjection*vec4(position*(1.0+billow*.018*wave),1.0);}`;
  BABYLON.Effect.ShadersStore.agentPatternFragmentShader=`precision highp float;
    varying vec2 vUV;varying vec3 vP;uniform sampler2D pattern;uniform vec3 baseColor;uniform vec3 accentColor;
    uniform float clock;uniform float opacity;uniform float damage;uniform float billow;uniform sampler2D glowMask;uniform float useGlow;
    void main(){vec2 flow=vec2(sin(vUV.y*13.0+clock*1.7),cos(vUV.x*11.0-clock*1.4))*.06*billow;
      float speed=mix(.025,.15,billow);
      float a=texture2D(pattern,vUV*2.0+flow+vec2(clock*speed,clock*speed*.65)).r;
      float b=texture2D(pattern,vUV*3.0-flow+vec2(-clock*speed*.8,clock*speed*1.1)).g;
      float n=smoothstep(.12,.85,a*.65+b*.35);
      vec3 color=mix(baseColor,accentColor,n);color*=mix(1.0,.88+.12*sin(vP.y*.8+clock*.9),billow);
      float crack=step(.94,fract((vUV.x+vUV.y*.7)*13.0+a*2.0))*damage;
      if(useGlow>.5){float glow=texture2D(glowMask,vUV).r;color+=accentColor*glow*(.65+.25*sin(clock*5.0));}
      gl_FragColor=vec4(mix(color,vec3(.65,.92,1.0),crack*.75),opacity);}`;
  const material=new BABYLON.ShaderMaterial(name,scene,'agentPattern',{
    attributes:['position','uv'],uniforms:['worldViewProjection','clock','baseColor','accentColor','opacity','damage','billow','useGlow'],
    samplers:['pattern','glowMask'],needAlphaBlending:alpha<1});
  material.setColor3('baseColor',BABYLON.Color3.FromHexString(base));material.setColor3('accentColor',BABYLON.Color3.FromHexString(accent));
  material.setTexture('pattern',agentEffectTexture(textureName));material.setFloat('opacity',alpha);material.setFloat('clock',0);material.setFloat('damage',0);material.setFloat('billow',0);
  material.backFaceCulling=false;material.metadata={agentPattern:true};
  const glow=name.includes('meddle');material.setFloat('useGlow',glow?1:0);material.setTexture('glowMask',agentEffectTexture(glow?'clove-glow':textureName));
  return material;
}
function agentBarrierMaterial(height,segment) {
  BABYLON.Effect.ShadersStore.sageBarrierVertexShader=`precision highp float;
    attribute vec3 position;attribute vec3 normal;uniform mat4 worldViewProjection;uniform mat4 world;uniform mat4 barrierInverse;
    varying vec3 vP;varying vec3 vN;void main(){vP=(barrierInverse*world*vec4(position,1.0)).xyz;vN=normal;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.sageBarrierFragmentShader=`precision highp float;
    varying vec3 vP;varying vec3 vN;uniform sampler2D pattern;uniform sampler2D crystal;uniform sampler2D bubbles;uniform float clock;uniform float height;uniform float segment;uniform float damage;
    void main(){float y=clamp(vP.y/height+.5,0.0,1.0);vec2 uv=vec2(vP.x*.3+segment*.78,y);
      float n=texture2D(pattern,uv*1.4+vec2(clock*.018,0.0)).r;
      float facet=texture2D(crystal,uv*2.0+vec2(clock*.02,0.0)).r;
      float bubble=texture2D(bubbles,uv*5.0+vec2(0.0,-clock*.07)).r;
      float wave=sin(y*12.0+sin(uv.x*5.0)*2.0+n*1.8-clock*.28)*.5+.5;
      vec3 dark=vec3(.015,.19,.23),jade=vec3(.13,.76,.61),rim=vec3(.44,.94,.76);
      vec3 color=mix(dark,jade,smoothstep(.02,.93,y));
      color=mix(color,rim,(wave*.16+n*.12+facet*.13+pow(bubble,8.0)*.12)*smoothstep(.25,.95,y));
      color=mix(color,rim,smoothstep(.95,1.0,y)*.5);
      float fissure=1.0-smoothstep(.012,.03,abs(fract(uv.x*3.0+y*.8+n*.25)-.5));
      color=mix(color,vec3(.7,1.0,.9),fissure*damage*.75);
      color*=.82+.18*abs(vN.z);gl_FragColor=vec4(color,1.0);}`;
  const material=new BABYLON.ShaderMaterial('intact_sage_barrier',scene,'sageBarrier',{
    attributes:['position','normal'],uniforms:['worldViewProjection','world','barrierInverse','clock','height','segment','damage'],samplers:['pattern','crystal','bubbles']});
  material.setTexture('pattern',agentEffectTexture('sage-flow'));material.setFloat('clock',0);
  material.setFloat('height',height);material.setFloat('segment',segment);material.setFloat('damage',0);
  material.setTexture('crystal',agentEffectTexture('sage-crystal'));material.setTexture('bubbles',agentEffectTexture('sage-noise'));
  material.setMatrix('barrierInverse',BABYLON.Matrix.Identity());
  material.backFaceCulling=false;material.metadata={agentPattern:true};return material;
}
function agentEffectCue(entity,color,duration,kind='pulse',owner=VS.player) {
  if(['pickup','heal','revive'].includes(kind))agentCastLayers(kind,entity,duration,owner);
  const mesh=BABYLON.MeshBuilder.CreateTorus('ability_'+kind,{diameter:1,thickness:.035,tessellation:24},scene);
  mesh.isPickable=false;
  mesh.material=agentPatternMaterial('cue_mat',color,'#E0FFF8',kind==='wind'?'jett-wind':kind==='pickup'?'clove-ripple':'sage-flow',.65);
  const effect={type:'cue',mesh,entity,kind,created:agentNow(),expires:agentNow()+duration};agentState.effects.push(effect);
  mesh.position.copyFrom(agentPosition(entity)).y+=.08;
}
function agentSmokeButterflies(effect) {
  const material=agentLayerMaterial('ruse_butterfly_mat','clove-butterfly','#D5BDFF',.8);
  material.setFloat('radial',1);
  effect.butterflies=[];
  for(let i=0;i<6;i++) {
    const mesh=BABYLON.MeshBuilder.CreatePlane('ruse_butterfly',{size:.5},scene);mesh.material=material;
    mesh.parent=effect.mesh;mesh.isPickable=false;mesh.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;effect.butterflies.push(mesh);
  }
  effect.mesh.onDisposeObservable.add(()=>material.dispose(false,false));
}
function agentEffectsTick() {
  agentSkillLayersTick();
  const now=agentNow();
  const meshes=[...agentState.effects.map(e=>e.mesh),...agentState.projectiles.map(p=>p.mesh),agentVisual.heldEffect].filter(Boolean);
  for (const mesh of meshes) if (mesh.material?.metadata?.agentPattern) mesh.material.setFloat('clock',now/1000);
  for (const effect of agentState.effects) {
    if (effect.type==='flash') {
      const t=(now-effect.created)/(effect.expires-effect.created);
      effect.mesh.scaling.setAll(.1+.9*(1-Math.pow(1-t,2)));effect.mesh.material.alpha=.3*(1-t);
    }
    if (effect.type==='slow') {
      const scale=Math.max(.01,Math.min(1,(now-effect.created)/280,(effect.expires-now)/400));
      effect.mesh.scaling.x=effect.mesh.scaling.z=scale;
    }
    if (effect.type==='knifeFlight') {
      if (!effect.originResolved && now>=effect.release) {
        effect.originResolved=true;
        if (effect.hand && !effect.hand.isDisposed()) {
          effect.hand.computeWorldMatrix(true);const point=effect.hand.getAbsolutePosition();
          if (BABYLON.Vector3.Distance(point,effect.owner&&effect.owner!==VS.player?agentPosition(effect.owner).add(new BABYLON.Vector3(0,1.4,0)):camera.position)<1.5) effect.from.copyFrom(point);
        }
        effect.mesh.position.copyFrom(effect.from);effect.mesh.lookAt(effect.to);
      }
      const t=Math.max(0,Math.min(1,(now-effect.release)/effect.flight));
      effect.mesh.setEnabled(now>=effect.release);
      BABYLON.Vector3.LerpToRef(effect.from,effect.to,t,effect.mesh.position);
      effect.mesh.scaling.setAll(Math.min(1,(1-t)*8));
    }
    if (effect.type==='windRibbon') {
      if(effect.owner&&!bodyOwnerView(effect.owner).firstPerson){effect.mesh.parent=null;effect.mesh.position.copyFrom(agentPosition(effect.owner)).y+=1.4;effect.mesh.rotation.y=effect.owner===VS.player?camera.rotation.y:Math.atan2(effect.owner.forward.x,effect.owner.forward.z);}
      else if (agentVisual.third) {effect.mesh.parent=null;effect.mesh.position.copyFrom(agentPosition()).y+=1.4;effect.mesh.rotation.y=camera.rotation.y;}
      else {effect.mesh.parent=camera;effect.mesh.position.setAll(0);effect.mesh.rotation.setAll(0);}
      const t=(now-effect.created)/(effect.expires-effect.created);
      effect.mesh.material.setFloat('clock',(now-effect.created)/1000);
      effect.mesh.material.setFloat('opacity',Math.sin(Math.PI*t)*.7);
      effect.ribbons.forEach((mesh,i)=>{
        if (effect.kind==='dash') {mesh.position.z=.2+((t*2+i*.17)%1)*1.6;mesh.rotation.z=Math.sin(t*3+i)*.12;}
        else {mesh.rotation.y=t*5+i*Math.PI/3;mesh.position.y=-1.4+t*1.7;}
      });
    }
    if (effect.butterflies) effect.butterflies.forEach((mesh,i)=>{
      const angle=now*.00065+i*Math.PI/3,radius=effect.radius*1.015;
      const forming=cloveEase(Math.max(0,Math.min(1,(now-effect.starts)/650)));
      const y=effect.radius*(.2+.6*(.5+.5*Math.sin(now*.0007+i*2)))*forming,horizontal=Math.sqrt(Math.max(0,radius*radius-y*y));
      mesh.position.set(Math.cos(angle)*horizontal,y,Math.sin(angle)*horizontal);mesh.scaling.x=.65+Math.sin(now*.012+i)*.3;
    });
    if (effect.type==='cue') {
      const progress=(now-effect.created)/(effect.expires-effect.created);
      effect.mesh.position.copyFrom(agentPosition(effect.entity)).y+=.08+(effect.kind==='revive'?progress*1.8:Math.sin(progress*Math.PI*6)*.12);
      effect.mesh.rotation.y=progress*Math.PI*2;effect.mesh.scaling.setAll(1+Math.sin(progress*Math.PI*8)*.1);
      effect.mesh.material.setFloat('opacity',Math.min(.65,(1-progress)*3));
    }
    if (effect.type==='wall' && effect.mesh.material?.metadata?.agentPattern) {
      effect.mesh.material.setMatrix('barrierInverse',BABYLON.Matrix.Invert(effect.mesh.computeWorldMatrix(true)));
      const cfg=effect.cfg||agentConfig().C;effect.mesh.material.setFloat('damage',1-Math.max(0,effect.hp)/(effect.fortified?cfg.fortifiedHP:cfg.hp));
    }
  }
}
// Six translucent strips at the view edges. No full-screen pass or particle pool.
function agentWind(kind,duration,owner=VS.player) {
  // Older player calls pass a direction as the third argument.
  if(!owner.member&&owner!==VS.player)owner=VS.player;
  BABYLON.Effect.ShadersStore.agentWindVertexShader=`precision highp float;attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.agentWindFragmentShader=`precision highp float;varying vec2 vUV;uniform sampler2D pattern;
    uniform float clock;uniform float opacity;void main(){vec4 p=texture2D(pattern,vec2(vUV.x-clock*2.5,vUV.y));
    float edge=sin(vUV.x*3.14159);gl_FragColor=vec4(.72,.92,1.0,p.a*max(p.r,p.g)*opacity*edge);}`;
  const material=new BABYLON.ShaderMaterial('moving_wind',scene,'agentWind',{attributes:['position','uv'],
    uniforms:['worldViewProjection','clock','opacity'],samplers:['pattern'],needAlphaBlending:true});
  material.setTexture('pattern',agentEffectTexture('jett-wind'));material.setFloat('clock',0);material.setFloat('opacity',0);
  material.backFaceCulling=false;material.disableDepthWrite=true;
  const firstPerson=bodyOwnerView(owner).firstPerson;
  const root=new BABYLON.Mesh('wind_ribbons',scene);root.metadata={skillAgent:'Jett'};root.parent=firstPerson?camera:null;root.material=material;
  if(!firstPerson){root.position.copyFrom(agentPosition(owner)).y+=1;root.rotation.y=owner===VS.player?camera.rotation.y:Math.atan2(owner.forward.x,owner.forward.z);}
  if(kind==='dash') {
    const left=agentLayerSource(root,'dash-left',1.8,material,[.5,.45,1.8]);left.position.set(-.5,-.1,.9);
    const right=agentLayerSource(root,'dash-right',1.8,material,[.5,.45,1.8]);right.position.set(.5,-.1,.9);
  } else {
    const dome=agentLayerSource(root,'updraft',1.5,material,[1.5,1.8,1.5]);dome.position.set(0,-.7,.55);
  }
  const ribbons=[];
  for(let i=0;i<6;i++) {
    const paths=[[],[]],angle=i*Math.PI/3;
    for(let j=0;j<=12;j++) {
      const t=j/12,a=angle+t*1.8;
      const p=kind==='dash'?new BABYLON.Vector3(Math.cos(angle)*(.28+t*.32),Math.sin(angle)*(.2+t*.3),t*1.7)
        :new BABYLON.Vector3(Math.cos(a)*.6,t*1.8,Math.sin(a)*.6+.65);
      paths[0].push(p);paths[1].push(p.add(new BABYLON.Vector3(.015,.025,0)));
    }
    const ribbon=BABYLON.MeshBuilder.CreateRibbon('wind_strip',{pathArray:paths,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    ribbon.parent=root;ribbon.material=material;ribbon.isPickable=false;ribbon.renderingGroupId=firstPerson?1:0;ribbons.push(ribbon);
  }
  agentState.effects.push({type:'windRibbon',kind,owner,mesh:root,ribbons,created:agentNow(),expires:agentNow()+duration});
}
function agentKnifeFlight(ray,to,index,alternate,owner=VS.player) {
  const hand=bodyOwnerView(owner,!!(index%2)).hand;
  const from=hand?hand.getAbsolutePosition().clone():ray.origin.add(ray.direction.scale(.4));
  // Ignore a not-yet-posed bind skeleton. Damage remains hitscan; travel is visual.
  if (BABYLON.Vector3.Distance(from,ray.origin)>1.5) from.copyFrom(ray.origin).addInPlace(ray.direction.scale(.4));
  const mesh=BABYLON.MeshBuilder.CreateBox('launched_blade',{width:.018,height:.026,depth:.23},scene);
  mesh.material=agentLuminousMaterial('flight_blade_mat','#B8EFFF');
  mesh.metadata={skillAgent:'Jett'};mesh.isPickable=false;mesh.position.copyFrom(from);mesh.lookAt(to);mesh.setEnabled(false);
  agentAttachEffectModel(mesh,'knife',.23);
  const streak=BABYLON.MeshBuilder.CreateCylinder('blade_streak',{height:.65,diameterTop:.002,diameterBottom:.014,tessellation:4},scene);
  streak.parent=mesh;streak.position.z=-.4;streak.rotation.x=Math.PI/2;streak.material=mesh.material;streak.isPickable=false;
  const release=agentNow()+(alternate?65:55),flight=Math.max(65,BABYLON.Vector3.Distance(from,to)/400*1000);
  agentState.effects.push({type:'knifeFlight',mesh,owner,from,to,hand,release,flight,expires:release+flight});
}
function agentWallPreviewUpdate() { agentPreviewPlacementUpdate(); }
