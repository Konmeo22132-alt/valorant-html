// Relay Bolt reference renderer using the native Q meshes and UV materials.
(function(global){
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=v=>1-Math.pow(1-clamp(v),3);
  const CROWN_F=`precision highp float;varying vec2 vUV;
    uniform sampler2D boltTexture;uniform sampler2D glowTexture;uniform sampler2D fluid;uniform sampler2D caustics;
    uniform float clock;uniform float opacity;uniform float phase;uniform float seed;uniform float inverse;
    float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    void main(){vec2 uv=vUV;float t=clock;float n=texture2D(fluid,uv*vec2(2.6,5.0)+vec2(t*.07,-t*.18)).r;
      float c=texture2D(caustics,uv*vec2(2.0,3.4)+vec2(-t*.05,t*.08)).r;
      float frame=mod(floor(t*24.0+seed*8.0),8.0);float bolt=texture2D(boltTexture,vec2(fract(uv.x*2.0+t*.11),(frame+fract(uv.y*2.0))/8.0)).r;
      float glow=texture2D(glowTexture,vec2(fract(uv.x*2.0-t*.08),(frame+fract(uv.y*2.0))/8.0)).r;
      float strand=pow(max(0.0,sin(uv.x*21.0+n*5.0+t*2.2+seed*4.0)),18.0);
      float branch=pow(max(0.0,sin(uv.x*43.0+uv.y*9.0-t*3.1+n*7.0)),20.0)*.7;
      float rim=pow(max(0.0,1.0-abs(uv.x-.5)*2.0),1.7);
      float lower=1.0-smoothstep(.43,.88,uv.y);float top=smoothstep(.48,.96,uv.y);
      float electric=clamp(bolt*.75+glow*.28+strand*.9+branch*.55+c*.2,0.0,1.0);
      float envelope=mix(lower,1.0,clamp(phase*1.35,0.0,1.0));
      float opening=mix(1.0,smoothstep(.28,.62,n+bolt*.35),top*.82);
      float alpha=(.16*rim+.52*electric+.58*top*(.28+.72*strand)+.22*n)*envelope*opacity*opening;
      vec3 cyan=mix(vec3(.015,.32,.95),vec3(.03,.78,1.0),clamp(n+.35,0.0,1.0));
      vec3 lime=mix(vec3(.62,.9,.06),vec3(1.0,.98,.42),clamp(lower+.45*bolt,0.0,1.0));
      vec3 color=mix(cyan,lime,clamp(lower*(.45+.55*phase)+bolt*.35,0.0,1.0));
      color+=cyan*top*.18;
      color=mix(color,vec3(.95,1.0,1.0),clamp(electric*.75+top*strand*.45,0.0,1.0));
      if(inverse>.5){color*=vec3(.55,.8,1.0);alpha*=.55;}
      if(alpha<.008)discard;gl_FragColor=vec4(color,clamp(alpha,0.0,1.0));}`;
  const GROUND_F=`precision highp float;varying vec2 vUV;uniform sampler2D fluid;uniform sampler2D caustics;uniform float clock;uniform float opacity;uniform float phase;
    void main(){vec2 p=(vUV-.5)*2.0;float r=length(p);if(r>1.0)discard;float t=clock;
      float n=texture2D(fluid,vUV*2.8+vec2(t*.12,-t*.08)).r;float c=texture2D(caustics,vUV*2.0+vec2(-t*.18,t*.13)).r;
      float ring=1.0-smoothstep(.018,.07,abs(r-(.58+phase*.31+(n-.5)*.08)));
      float cracks=pow(max(0.0,cos(atan(p.y,p.x)*8.0+n*4.0+t*1.8)),9.0)*smoothstep(.2,.9,r);
      float center=pow(max(0.0,1.0-r),5.0);float alpha=(ring*.78+cracks*.7+center*.35+c*.16)*opacity;
      vec3 col=mix(vec3(.02,.43,1.0),vec3(.0,.92,1.0),c*.65);col=mix(col,vec3(1.0,.95,.25),ring*.75+cracks*.55+center*.6);
      if(alpha<.008)discard;gl_FragColor=vec4(col,clamp(alpha,0.0,1.0));}`;
  class Renderer{
    constructor(scene,options={}){if(!global.VSNeonVFX)throw Error('Load neon-vfx-shaders.js and neon-vfx.js first');this.B=global.BABYLON;this.scene=scene;this.inner=global.VSNeonVFX.create(scene,options);this.errors=this.inner.errors;this.effects=new Set();this.seq=0;const store=this.B.Effect.ShadersStore;store.relayBoltNativeVertexShader=global.VSNeonVFXShaders.nativeVertex;store.relayBoltCrownFragmentShader=CROWN_F;store.relayBoltGroundFragmentShader=GROUND_F;}
    async prepare(){await this.inner.prepare();return this;}
    crownMaterial(name,role,inverse=0){const B=this.B,m=new B.ShaderMaterial(name,this.scene,{vertex:'relayBoltNative',fragment:'relayBoltCrown'},{attributes:['position','uv'],uniforms:['worldViewProjection','clock','opacity','phase','seed','inverse'],samplers:['boltTexture','glowTexture','fluid','caustics'],needAlphaBlending:true});m.setTexture('boltTexture',this.inner.bolt);m.setTexture('glowTexture',this.inner.glow);m.setTexture('fluid',this.inner.fluid);m.setTexture('caustics',this.inner.caustics);m.setFloat('clock',0);m.setFloat('opacity',0);m.setFloat('phase',role);m.setFloat('seed',this.seq++*.37);m.setFloat('inverse',inverse);m.backFaceCulling=false;m.disableDepthWrite=true;m.alphaMode=B.Engine.ALPHA_ADD;m.metadata={ownedSkill:true,skillAgent:'Neon',relayBolt:true};return m;}
    groundMaterial(name){const B=this.B,m=new B.ShaderMaterial(name,this.scene,{vertex:'relayBoltNative',fragment:'relayBoltGround'},{attributes:['position','uv'],uniforms:['worldViewProjection','clock','opacity','phase'],samplers:['fluid','caustics'],needAlphaBlending:true});m.setTexture('fluid',this.inner.fluid);m.setTexture('caustics',this.inner.caustics);m.setFloat('clock',0);m.setFloat('opacity',0);m.setFloat('phase',0);m.backFaceCulling=false;m.disableDepthWrite=true;m.alphaMode=B.Engine.ALPHA_ADD;m.metadata={ownedSkill:true,skillAgent:'Neon',relayBolt:true};return m;}
    spawn({point=new this.B.Vector3(),normal,startedAt=0,duration=3.6,radius=2.1,seed=.2}={}){const B=this.B,root=new B.TransformNode('relay_bolt_native_reference',this.scene),owned=[];root.position.copyFrom(point);if(normal){const axis=B.Vector3.Cross(B.Axis.Y,normal),angle=Math.acos(clamp(B.Vector3.Dot(B.Axis.Y,normal),-1,1));root.rotationQuaternion=new B.Quaternion();if(axis.lengthSquared()>.0001)B.Quaternion.RotationAxisToRef(axis.normalize(),angle,root.rotationQuaternion);}
      const groundMat=this.groundMaterial('relay_ground_native');owned.push(groundMat);const ground=B.MeshBuilder.CreateDisc('relay_ground_native',{radius:radius*1.2,tessellation:72},this.scene);ground.rotation.x=Math.PI/2;ground.parent=root;ground.material=groundMat;ground.isPickable=false;
      const crownMat=this.crownMaterial('relay_crown_native',1,0),inverseMat=this.crownMaterial('relay_crown_inverse',1,1),shellMat=this.crownMaterial('relay_crown_shell',1,0);owned.push(crownMat,inverseMat,shellMat);
      const crown=this.inner.native('concuss',crownMat),inverse=this.inner.native('concussInverse',inverseMat),shell=this.inner.native('concussMesh',shellMat);for(const item of [crown,inverse,shell]){item.parent=root;item.rotation.x=Math.PI/2;item.setEnabled(false);}
      const crownSize=crown.metadata.nativeSize,inverseSize=inverse.metadata.nativeSize,shellSize=shell.metadata.nativeSize;
      const wallMatL=this.crownMaterial('relay_wall_left',1,0),wallMatR=this.crownMaterial('relay_wall_right',1,1);owned.push(wallMatL,wallMatR);
      const wallL=this.inner.native('concussBeam',wallMatL,false,false),wallR=this.inner.native('concussBeam',wallMatR,false,false);
      wallL.parent=root;wallR.parent=root;wallL.position.x=-radius*.7;wallR.position.x=radius*.7;wallL.rotation.y=-.16;wallR.rotation.y=.16;wallL.setEnabled(false);wallR.setEnabled(false);
      const wallSize=wallL.metadata.nativeSize;
      const domeMat=this.inner.material('shock',{seed});owned.push(domeMat);const dome=B.MeshBuilder.CreateSphere('relay_shock_dome',{diameter:2,slice:.5,segments:48},this.scene);dome.parent=root;dome.material=domeMat;dome.isPickable=false;dome.setEnabled(false);
      const pillar=this.inner.createBeam({from:point,to:point.add(new B.Vector3(0,1,0)),width:radius*.34,seed:seed+.3});pillar.root.parent=root;pillar.setPower(0);
      const effect={root,disposed:false,update:(now)=>{const age=now-startedAt;if(age<0){root.setEnabled(false);return true;}if(age>=duration){effect.dispose();return false;}root.setEnabled(true);
        const windup=Math.min(.8,duration*.22),charge=clamp(age/Math.max(.01,windup)),blast=clamp((age-windup)/Math.max(.01,duration-windup)),fade=age>duration-.72?clamp((duration-age)/.72):1;
        groundMat.setFloat('clock',age);groundMat.setFloat('phase',charge*.6+blast*.4);groundMat.setFloat('opacity',fade*(.45+.55*charge));
        const height=age<windup?.16+.22*charge:1.8+blast*3.2,width=age<windup?radius*(.82-.08*charge):radius*(.98+.18*blast);
        const set=(node,size,h,w)=>{node.setEnabled(true);node.scaling.set(w*2/Math.max(size.x,.001),h/Math.max(size.y,.001),1);node.position.y=h*.5;};
        set(crown,crownSize,height,width);set(inverse,inverseSize,height*1.04,width*1.02);set(shell,shellSize,height*1.1,width*1.08);
        crownMat.setFloat('clock',age);crownMat.setFloat('phase',blast);crownMat.setFloat('opacity',fade*(age<windup?.38+.45*charge:Math.pow(1-blast,.62)*.98));
        inverseMat.setFloat('clock',age+.13);inverseMat.setFloat('phase',blast);inverseMat.setFloat('opacity',fade*(age<windup?.18+.22*charge:Math.pow(1-blast,.72)*.48));
        shellMat.setFloat('clock',age-.17);shellMat.setFloat('phase',blast);shellMat.setFloat('opacity',fade*(age<windup?.14+.18*charge:Math.pow(1-blast,.76)*.32));
        const wallAlpha=age<windup?0:fade*Math.min(1,blast*3.5)*.7;
        set(wallL,wallSize,height*1.18,width*1.15);set(wallR,wallSize,height*1.18,width*1.15);
        wallL.position.x=-width*.7;wallR.position.x=width*.7;wallL.position.z=.1;wallR.position.z=.1;
        wallMatL.setFloat('clock',age+.3);wallMatL.setFloat('phase',blast);wallMatL.setFloat('opacity',wallAlpha);
        wallMatR.setFloat('clock',age-.2);wallMatR.setFloat('phase',blast);wallMatR.setFloat('opacity',wallAlpha*.8);
        const domeT=age<windup?0:clamp(blast*2.8);dome.setEnabled(domeT>.02);dome.scaling.set(width*(.4+.9*domeT),height*(.08+.22*domeT),width*(.4+.9*domeT));dome.position.y=height*.08;domeMat.setFloat('clock',age);domeMat.setFloat('progress',domeT);domeMat.setFloat('opacity',fade*Math.pow(domeT,.6)*.3);
        if(age>=windup&&blast<.72){const p=Math.sin(Math.PI*clamp(blast/.72));pillar.setEndpoints(point,point.add(new B.Vector3(0,height*1.04,0)));pillar.setPower(p*.9);}else pillar.setPower(0);return true;},dispose:()=>{if(effect.disposed)return;effect.disposed=true;pillar.dispose();root.dispose(false,false);owned.forEach(m=>m.dispose(false,false));this.effects.delete(effect);}};this.effects.add(effect);return effect;}
    update(now,camera){this.inner.update(now,camera);for(const e of this.effects)e.update(now,camera);}
    dispose(){for(const e of [...this.effects])e.dispose();this.inner.dispose();}
  }
  global.__relayBoltRendererLoaded=true;global.VSNeonRelayBolt=Object.freeze({create:(scene,options)=>new Renderer(scene,options)});
})(globalThis);
