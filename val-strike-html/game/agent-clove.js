// Reconstruct Clove's UE material roles using the original pixels and PSA poses.
const cloveRuseMap={view:null,nav:null,open:false,closing:false,opacity:0,closeOpacity:0,afterDeath:false,openedAt:0,closedAt:0,yaw:0,version:0};
function cloveEase(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function agentRuseMapUV(point,center,range,yaw=cloveRuseMap.yaw){
  const x=point.x-center.x,z=point.z-center.z,c=Math.cos(yaw),s=Math.sin(yaw);
  return {u:(x*c-z*s)/range,v:-(x*s+z*c)/range};
}
function agentRuseMapWorld(u,v,center,range,yaw=cloveRuseMap.yaw){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new BABYLON.Vector3(center.x+(u*c-v*s)*range,center.y+1.4,center.z-(u*s+v*c)*range);
}
async function agentClovePrepare(){
  const version=agentVisual.version;
  if(typeof MAP_MODE!=='undefined'&&VSMaps.valid(MAP_MODE)&&!cloveRuseMap.nav){
    try{const res=await fetch(VSMaps.get(MAP_MODE).root+'match-navigation.json?v=53');
      if(res.ok){const nav=await res.json();cloveRuseMap.nav={nodes:nav.nodes,step:nav.step||.6};}
    }catch(error){console.warn('[ruse terrain]',error.message);}
  }
  if(version!==agentVisual.version)return;
  const container=agentVisual.effectAssets.get('smonk-meddle-view.glb');
  if(!container)throw Error('Clove Meddle animation asset unavailable');
  const instance=container.instantiateModelsToScene(n=>'meddle_view_'+n,false,{doNotInstantiate:true});
  const root=agentLayerRoot('clove_meddle_view','Clove');root.parent=camera;
  instance.rootNodes.forEach(n=>n.parent=root);
  const material=agentMeddleMaterial('meddle_view_material'),coreMat=agentMeddleMaterial('meddle_held_core_material',true);
  root.getChildMeshes().forEach(m=>{m.material=m.material?.name==='None'||m.name.endsWith('primitive0')?coreMat:material;m.isPickable=false;m.renderingGroupId=1;m.metadata={viewmodel:true};});
  const groups=new Map();instance.animationGroups.forEach(g=>{g.start(false);g.pause();groups.set(g.name.replace(/^meddle_view_/,''),g);});
  const core=agentLayerRoot('meddle_held_core');core.parent=root;core.renderingGroupId=1;core.material=coreMat;
  const haloMat=agentMeddleHaloMaterial('meddle_equip_halo',.7),halo=agentLayerPlane(core,'meddle_equip_glow',.4,.4,haloMat);halo.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
  const swirl=agentLayerMaterial('meddle_equip_ribbons','clove-generic','#C786FF',.75);
  const ribbon=agentLayerSource(core,'meddle-ribbon',.32,swirl),inverse=agentLayerSource(core,'meddle-ribbon-inverse',.32,swirl);
  core.getChildMeshes().forEach(m=>{m.renderingGroupId=1;m.metadata={viewmodel:true};});
  const offset=root.getDescendants().find(n=>n.name.endsWith('Spikeball_Offset'));
  root.setEnabled(false);agentVisual.meddleView={root,core,offset,groups,instance,material,haloMat,swirl,ribbon,inverse};
}
function agentCloveDispose(){
  cloveRuseMap.version++;cloveRuseMap.open=false;cloveRuseMap.closing=false;cloveRuseMap.opacity=0;
  if(cloveRuseMap.view){const view=cloveRuseMap.view;agentLayerDispose(view.root);view.texture.dispose();cloveRuseMap.view=null;}
  if(agentVisual.meddleView){const view=agentVisual.meddleView;agentLayerDispose(view.root);
    view.instance.animationGroups.forEach(g=>g.dispose());view.instance.skeletons.forEach(s=>s.dispose());agentVisual.meddleView=null;}
}
function agentMeddleMaterial(name,core=false){
  BABYLON.Effect.ShadersStore.cloveEssenceVertexShader=`precision highp float;
    attribute vec3 position;attribute vec2 uv;uniform mat4 world;uniform mat4 viewProjection;varying vec2 vUV;
    #include<bonesDeclaration>
    void main(){mat4 finalWorld=world;
      #include<bonesVertex>
      vUV=uv;gl_Position=viewProjection*finalWorld*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.cloveEssenceFragmentShader=`precision highp float;varying vec2 vUV;
    uniform sampler2D essence;uniform sampler2D glowMask;uniform float clock;uniform float core;
    void main(){vec3 p=texture2D(essence,vUV+vec2(clock*-.1,0.0)).rgb;
      float glow=texture2D(glowMask,vUV).r;
      vec3 shell=mix(p,vec3(.53,.07,.86),.42)+vec3(.08,.045,.12)*glow;
      vec3 inner=mix(vec3(.35,.46,.96),vec3(.63,.96,1.0),smoothstep(.25,.8,p.g));
      gl_FragColor=vec4(clamp(mix(shell,inner,core),.07,.98),1.0);}`;
  const mat=new BABYLON.ShaderMaterial(name,scene,'cloveEssence',{
    attributes:['position','uv'],uniforms:['world','viewProjection','clock','core'],samplers:['essence','glowMask']});
  mat.setTexture('essence',agentEffectTexture('clove-essence'));mat.setTexture('glowMask',agentEffectTexture('clove-glow'));
  mat.setFloat('clock',0);mat.setFloat('core',core?1:0);mat.backFaceCulling=false;
  mat.metadata={ownedSkill:true,agentPattern:true,skillLayer:true};return mat;
}
function agentMeddleHaloMaterial(name,opacity=.7){
  BABYLON.Effect.ShadersStore.meddleHaloVertexShader=`precision highp float;attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.meddleHaloFragmentShader=`precision highp float;varying vec2 vUV;
    uniform sampler2D flow;uniform float clock;uniform float opacity;
    void main(){float r=length(vUV-.5)*2.0;float n=texture2D(flow,vUV+vec2(clock*.07,0.0)).r;
      float a=pow(max(0.0,1.0-r),2.4)*opacity;vec3 c=mix(vec3(.4,.62,1.0),vec3(.73,.25,1.0),smoothstep(.18,.8,r));
      gl_FragColor=vec4(c,a*(.8+.2*n));}`;
  const mat=new BABYLON.ShaderMaterial(name,scene,'meddleHalo',{attributes:['position','uv'],
    uniforms:['worldViewProjection','clock','opacity'],samplers:['flow'],needAlphaBlending:true});
  mat.setTexture('flow',agentEffectTexture('clove-generic'));mat.setFloat('clock',0);mat.setFloat('opacity',opacity);
  mat.backFaceCulling=false;mat.disableDepthWrite=true;mat.alphaMode=BABYLON.Engine.ALPHA_ADD;mat.metadata={skillLayer:true,ownedSkill:true};return mat;
}
function agentMeddleViewUpdate(now){
  const view=agentVisual.meddleView;if(!view)return;
  const action=agentVisual.action,held=VS.player.agent==='Clove'&&agentState.equipped==='Q';
  const toss=action?.name==='Q_cast'&&now-action.start<240;
  const visible=!agentVisual.third&&VS.player.hp>0&&(held||toss)&&!matchSpectatorActive();
  view.root.setEnabled(visible);if(!visible)return;
  const hand=agentVisual.fpNodes.get('R_Hand')||agentVisual.fpNodes.get('R_WeaponMaster');hand?.computeWorldMatrix(true);
  if(hand)view.root.position.copyFrom(BABYLON.Vector3.TransformCoordinates(hand.getAbsolutePosition(),BABYLON.Matrix.Invert(camera.getWorldMatrix()))).y+=.055;
  else view.root.position.set(.12,-.14,.55);
  const phase=toss?'toss':held&&action?.name==='Q_equip'?'equip':'idle',group=view.groups.get(phase);
  if(group)group.goToFrame(agentFrame(group,phase==='idle'?now:now-action.start,phase==='idle'));
  view.material.setFloat('clock',now/1000);view.core.material.setFloat('clock',now/1000);
  const appearance=phase==='equip'?cloveEase((now-action.start-80)/650):1;
  view.haloMat.setFloat('clock',now/1000);view.haloMat.setFloat('opacity',appearance*.7);
  view.swirl.setFloat('clock',now/1000);view.swirl.setFloat('opacity',appearance*.75);
  view.ribbon.rotation.y=now*.0014;view.inverse.rotation.y=-now*.0017;
  if(view.offset){view.offset.computeWorldMatrix(true);
    view.core.position.copyFrom(BABYLON.Vector3.TransformCoordinates(view.offset.getAbsolutePosition(),BABYLON.Matrix.Invert(view.root.getWorldMatrix())));}
  view.core.setEnabled(phase!=='equip'||now-action.start>320);
}
function agentRuseSmokeMaterial(name='ruse_pearl_bands'){
  BABYLON.Effect.ShadersStore.cloveSmokeVertexShader=`precision highp float;attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;uniform float clock;varying vec2 vUV;varying vec3 vP;
    void main(){vUV=uv;vP=normalize(position);float b=sin(position.y*1.6+clock)*sin(position.x*1.1-clock*.8);
      gl_Position=worldViewProjection*vec4(position*(1.0+.009*b),1.0);}`;
  BABYLON.Effect.ShadersStore.cloveSmokeFragmentShader=`precision highp float;varying vec2 vUV;varying vec3 vP;
    uniform sampler2D essence;uniform sampler2D flow;uniform float clock;uniform float opacity;uniform float formation;
    void main(){float longitude=atan(vP.z,vP.x);
      vec2 movingUV=vec2(longitude/6.283185+clock*.018,vP.y*.5+.5-clock*.024);
      float noise=texture2D(flow,movingUV).r;
      float warp=sin(longitude*3.0-clock*.33)*.13+sin(longitude*5.0+vP.y*4.0+clock*.2)*.055;
      float band=(vP.y+1.0)*2.2+vP.x*.22+warp+noise*.055-clock*.045;
      float phase=fract(band);vec3 p=texture2D(essence,vec2(movingUV.x,band*.24)).rgb;
      vec3 lavender=mix(vec3(.49,.46,.73),vec3(.69,.65,.87),p.r);
      vec3 pearl=mix(vec3(.77,.87,.96),vec3(.9,.84,.95),smoothstep(.15,.85,p.r));
      float pale=smoothstep(.19,.23,phase)*(1.0-smoothstep(.65,.69,phase));
      vec3 color=mix(lavender,pearl,pale);
      float rose=smoothstep(.72,.76,phase)*(1.0-smoothstep(.91,.95,phase));
      color=mix(color,vec3(.87,.66,.85),rose*(.45+.25*sin(floor(band)*2.1)));
      // The source reference fills upward with an uneven luminous lip. A
      // uniformly fading sphere never shows this open bowl / closing cap.
      float lip=-.05+formation*1.16+sin(longitude*7.0+clock*1.3)*.055+sin(longitude*13.0-clock)*.024;
      if(formation<.999&&vP.y>lip)discard;
      float edge=(1.0-smoothstep(.012,.065,abs(vP.y-lip)))*(1.0-smoothstep(.82,1.0,formation));
      vec3 hot=mix(vec3(1.0,.7,.43),vec3(.36,.92,.98),smoothstep(-.2,.45,sin(longitude*3.0+clock)));
      hot=mix(hot,vec3(.91,.25,.82),smoothstep(.55,.9,sin(longitude*5.0-clock)));
      color=mix(color,hot,edge);color*=.96+.04*noise;
      gl_FragColor=vec4(clamp(color,.12,.99),opacity);}`;
  const mat=new BABYLON.ShaderMaterial(name,scene,'cloveSmoke',{
    attributes:['position','uv'],uniforms:['worldViewProjection','clock','opacity','formation'],samplers:['essence','flow'],needAlphaBlending:true});
  mat.setTexture('essence',agentEffectTexture('clove-essence'));mat.setTexture('flow',agentEffectTexture('clove-generic'));
  mat.setFloat('clock',0);mat.setFloat('opacity',0);mat.setFloat('formation',0);mat.backFaceCulling=false;mat.forceDepthWrite=true;
  mat.metadata={ownedSkill:true,agentPattern:true,ruseSmoke:true};return mat;
}
function agentRuseViewCreate(canvas){
  const root=agentLayerRoot('ruse_hologram','Clove');root.parent=camera;root.position.set(0,-.025,.7);root.rotation.set(.12,-.06,0);
  const texture=new BABYLON.DynamicTexture('ruse_terrain',canvas,scene,false,BABYLON.Texture.BILINEAR_SAMPLINGMODE);
  texture.hasAlpha=true;texture.wrapU=texture.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;
  BABYLON.Effect.ShadersStore.ruseMapVertexShader=`precision highp float;attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  BABYLON.Effect.ShadersStore.ruseMapFragmentShader=`precision highp float;varying vec2 vUV;
    uniform sampler2D terrain;uniform float opacity;uniform float clock;
    void main(){float r=length(vUV-.5);vec4 p=texture2D(terrain,vUV);
      float ring=1.0-smoothstep(.002,.006,abs(r-.47));float mist=exp(-abs(r-.475)*90.0)*(.4+.25*sin(clock*1.5+atan(vUV.y-.5,vUV.x-.5)*3.0));
      float a=max(p.a,ring*.85+mist*.2)*(1.0-smoothstep(.488,.5,r));
      gl_FragColor=vec4(mix(p.rgb,vec3(.79,.68,1.0),max(ring,mist)),a*opacity);}`;
  const mat=new BABYLON.ShaderMaterial('ruse_map_material',scene,'ruseMap',{
    attributes:['position','uv'],uniforms:['worldViewProjection','opacity','clock'],samplers:['terrain'],needAlphaBlending:true});
  mat.setTexture('terrain',texture);mat.setFloat('opacity',0);mat.setFloat('clock',0);mat.backFaceCulling=false;mat.disableDepthWrite=true;mat.metadata={ownedSkill:true};
  const plane=BABYLON.MeshBuilder.CreatePlane('ruse_map_disc',{size:.58},scene);plane.parent=root;plane.material=mat;plane.renderingGroupId=1;plane.isPickable=false;
  const flow=agentLayerMaterial('ruse_summon_flow','clove-ripple','#BB98FF',.65);
  const ring=agentLayerSource(root,'minimap-ring',.61,flow);ring.position.z=.006;ring.rotation.x=Math.PI/2;
  root.getChildMeshes().forEach(m=>{m.renderingGroupId=1;m.metadata={viewmodel:true};});root.setEnabled(false);
  cloveRuseMap.view={root,plane,texture,mat,flow,ring};return cloveRuseMap.view;
}
function agentRuseViewUpdate(now){
  const view=cloveRuseMap.view;if(!view)return;
  // A close call from weapon switching must never create an unopened map.
  const age=now-cloveRuseMap.openedAt,t=cloveRuseMap.open
    ?cloveEase((age-(cloveRuseMap.afterDeath?0:90))/(cloveRuseMap.afterDeath?180:800))
    :cloveRuseMap.closing?cloveRuseMap.closeOpacity*(1-cloveEase((now-cloveRuseMap.closedAt)/230)):0;
  cloveRuseMap.opacity=t;if(!t&&!cloveRuseMap.open)cloveRuseMap.closing=false;
  const observer=cloveRuseMap.afterDeath&&VS.player.hp<=0;
  view.root.setEnabled(t>0&&VS.player.agent==='Clove'&&(observer||(!agentVisual.third&&!matchSpectatorActive())));
  if(observer)view.root.parent=scene.activeCamera||camera;
  else view.root.parent=camera;
  view.root.scaling.setAll(.45+.55*t);view.root.rotation.z=(1-t)*-.2;
  view.mat.setFloat('opacity',t);view.mat.setFloat('clock',now/1000);view.flow.setFloat('clock',now/1000);view.flow.setFloat('opacity',t*.65);
}
function agentRusePick(event){
  const view=cloveRuseMap.view;if(!cloveRuseMap.open||!view?.root.isEnabled())return null;
  const rect=document.getElementById('renderCanvas').getBoundingClientRect();
  // Babylon applies hardware scaling internally. Supplying render pixels here
  // applies it twice on the real engine (the NullEngine fixture used level 1).
  const engine=scene.getEngine(),hardware=engine.getHardwareScalingLevel();
  const ray=scene.createPickingRay((event.clientX-rect.left)/rect.width*engine.getRenderWidth()*hardware,
    (event.clientY-rect.top)/rect.height*engine.getRenderHeight()*hardware,BABYLON.Matrix.Identity(),scene.activeCamera||camera);
  const hit=scene.pickWithRay(ray,m=>m===view.plane),uv=hit?.hit&&hit.getTextureCoordinates();
  if(!uv)return null;return {u:uv.x*2-1,v:1-uv.y*2};
}
function agentRuseRaster(center,range,nodes,step=.6,size=128){
  const cells=new Uint8Array(size*size),pixels=step/(range*2)*size;
  for(const node of nodes){const p=Array.isArray(node)?BABYLON.Vector3.FromArray(node):node;
    if(p.y>center.y+1.4||p.y<center.y-13.6)continue;
    const {u,v}=agentRuseMapUV(p,center,range),x=(u+1)*size/2,y=(v+1)*size/2;
    for(let row=Math.max(0,Math.floor(y-pixels*.55));row<Math.min(size,Math.ceil(y+pixels*.55));row++)
      for(let col=Math.max(0,Math.floor(x-pixels*.55));col<Math.min(size,Math.ceil(x+pixels*.55));col++)cells[row*size+col]=1;
  }return cells;
}
