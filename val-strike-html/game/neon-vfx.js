// Visual-only Q/E/X renderer. Gameplay owns simulation time and damage endpoints.
(function (global) {
  'use strict';
  const nativeFiles = {
    arm1L:'Sprinter_1P_Arm_Cylinder_L01_SM',arm1R:'Sprinter_1P_Arm_Cylinder_R01_SM',
    arm3L:'Sprinter_3P_Arm_Cylinder_L01_SM',arm3R:'Sprinter_3P_Arm_Cylinder_R01_SM',
    bootL:'Sprinter_E_3P_SlideBoot_L_Front01_SM',bootR:'Sprinter_E_3P_SlideBoot_R_Front01_SM',
    bootTop:'Sprinter_E_3P_SlideBoot_R_Top01_SM',swoosh1:'Sprinter_E_1P_EquipSwoosh01_SM',
    swoosh3:'Sprinter_E_3P_EquipSwoosh03_SM',zigL:'Sprinter_X_Equip_ZigZag_L01_SM',
    zigR:'Sprinter_X_Equip_ZigZag_R01_SM',burst:'Sprinter_X_Equip_BurstRIng01_SM',
    concuss:'Sprinter_Q_Cylinder',concussInverse:'Sprinter_Q_CylinderInverse',
    concussMesh:'Sprinter_Q_CylinderMesh',concussBeam:'Sprinter_Q_CustomBeamMesh'
  };
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  function positive(n,name){if(!Number.isFinite(n)||n<=0)throw Error('Neon VFX: invalid '+name);return n;}
  class Renderer {
    constructor(scene,options={}) {
      if(!global.BABYLON||!global.VSNeonVFXShaders)throw Error('Load Babylon and neon-vfx-shaders.js first');
      this.B=global.BABYLON;this.scene=scene;
      this.root=(options.assetRoot||'/assets/playable/vfx/').replace(/\/?$/,'/');
      this.limit=options.maxCosmeticEffects||24;this.effects=new Set();this.containers=new Map();
      this.textures=[];this.materials=new Set();this.errors=[];this.closed=false;this.ready=false;this.sequence=0;
      this.scratch={direction:new this.B.Vector3(),side:new this.B.Vector3(),up:new this.B.Vector3(),
        midpoint:new this.B.Vector3(),rotation:new this.B.Quaternion()};
      this.disposeObserver=scene.onDisposeObservable.add(()=>this.dispose());
      const store=this.B.Effect.ShadersStore,s=global.VSNeonVFXShaders;
      for(const name of ['surface','beam','native','trail','finger','corona','skin'])store['neon_'+name+'VertexShader']=s[name+'Vertex'];
      for(const name of ['beam','ground','shock','orb','native','trail','finger','corona','skin'])store['neon_'+name+'FragmentShader']=s[name+'Fragment'];
    }
    async prepare() {
      if(this.closed)throw Error('Neon VFX renderer disposed');
      if(this.ready)return this;
      if(this.preparing)return this.preparing;
      this.preparing=(async()=>{
        try {
          this.bolt=await this.loadTexture('Sprinter_Lightning_Beam_Flip01_T.png',true);
          this.glow=await this.loadTexture('Sprinter_Lightning_Beam_Flip01Glow_T.png',true);
          this.fluid=await this.loadTexture('neon-fluid-noise.png');
          this.flow=await this.loadTexture('neon-flow-field.png');
          this.caustics=await this.loadTexture('neon-caustics.png');
          for(const [label,file]of Object.entries(nativeFiles)) {
            if(this.closed)throw Error('Neon VFX preparation cancelled');
            const c=await this.B.SceneLoader.LoadAssetContainerAsync(this.root,file+'.glb',this.scene);
            if(this.closed){c.dispose();throw Error('Neon VFX preparation cancelled');}
            this.containers.set(label,c);
          }
          this.ready=true;return this;
        }catch(error){this.dispose();throw error;}
      })();
      return this.preparing;
    }
    loadTexture(file,atlas=false) {
      return new Promise((resolve,reject)=>{
        const B=this.B;let texture;
        texture=new B.Texture(this.root+file,this.scene,atlas,false,atlas?B.Texture.BILINEAR_SAMPLINGMODE:B.Texture.TRILINEAR_SAMPLINGMODE,
          ()=>this.closed?reject(Error('Neon VFX preparation cancelled')):resolve(texture),
          message=>reject(Error('Neon VFX texture '+file+': '+message)));
        texture.gammaSpace=false;texture.wrapU=B.Texture.WRAP_ADDRESSMODE;
        texture.wrapV=atlas?B.Texture.CLAMP_ADDRESSMODE:B.Texture.WRAP_ADDRESSMODE;this.textures.push(texture);
        texture.onDisposeObservable.add(()=>reject(Error('Neon VFX texture preparation cancelled')));
      });
    }
    assertReady(){if(this.closed||!this.ready)throw Error('Await Neon VFX prepare() before creating effects');}
    configureBloom(pipeline,{weight=.45,threshold=.85,kernel=48}={}) {
      pipeline.bloomEnabled=true;pipeline.bloomThreshold=threshold;
      pipeline.bloomWeight=weight;pipeline.bloomKernel=kernel;pipeline.bloomScale=.5;
    }
    material(kind,options={}) {
      const B=this.B,uniforms=['world','worldViewProjection','clock','opacity','seed','power','role','depleted',
        'progress','tiling','viewProjection','beamFrom','beamTo','eye','beamWidth','trailLife',
        'eyeRight','eyeUp','glowSize','surfaceBias'];
      const textured=['beam','native','trail','corona'].includes(kind);
      const fluid=['shock','orb'].includes(kind),caustic=['shock','ground'].includes(kind);
      const samplers=textured?['boltTexture','glowTexture']:[];
      if(fluid)samplers.push('fluidNoise');if(caustic)samplers.push('caustics');
      const m=new B.ShaderMaterial('neon_'+kind+'_'+this.sequence++,this.scene,
        {vertex:'neon_'+(['beam','native','trail','finger','corona','skin'].includes(kind)?kind:'surface'),fragment:'neon_'+kind},
        {attributes:kind==='skin'?['position','normal','color']:kind==='corona'?['position','normal','uv','uv2']:kind==='trail'?['position','uv','uv2']:options.vertexAlpha?['position','uv','color']:['position','uv'],uniforms,
          samplers,
          defines:options.vertexAlpha?['#define NEON_VERTEX_ALPHA']:[],needAlphaBlending:true});
      m.backFaceCulling=false;m.disableDepthWrite=true;
      m.onError=(_effect,message)=>{this.errors.push(kind+': '+message);};
      m.alphaMode=B.Engine.ALPHA_COMBINE;m.metadata={ownedSkill:true,skillAgent:'Neon',neonVFX:true};
      m.setFloat('clock',0);m.setFloat('opacity',1);m.setFloat('power',1);m.setFloat('role',options.role||0);
      m.setFloat('seed',options.seed||0);m.setFloat('depleted',0);m.setFloat('tiling',2);
      m.setFloat('progress',0);
      m.setFloat('surfaceBias',0);
      if(textured){m.setTexture('boltTexture',this.bolt);m.setTexture('glowTexture',this.glow);}
      if(fluid)m.setTexture('fluidNoise',this.fluid);if(caustic)m.setTexture('caustics',this.caustics);
      if(['beam','ground','shock','corona'].includes(kind))m.alphaMode=B.Engine.ALPHA_ADD;
      this.materials.add(m);return m;
    }
    mark(mesh,firstPerson=false) {
      mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=false;
      mesh.renderingGroupId=firstPerson?1:0;
      mesh.metadata={...mesh.metadata,neonVFX:true,skillAgent:'Neon',viewmodel:firstPerson};
      return mesh;
    }
    own(root,materials,update,transient=true,budgeted=false) {
      this.assertReady();
      if(budgeted){const list=[...this.effects].filter(e=>e.budgeted);if(list.length>=this.limit)list[0].dispose();}
      const cleanup=()=>{
        if(handle.disposed)return;handle.disposed=true;
        for(const m of materials){this.materials.delete(m);m.dispose(false,false);}
        this.effects.delete(handle);
      };
      const handle={root,transient,budgeted,disposed:false,update,dispose:()=>{
        if(handle.disposed)return;cleanup();root.dispose(false,false);
      }};
      root.onDisposeObservable.add(cleanup);
      this.effects.add(handle);return handle;
    }
    native(label,material,firstPerson=false,centered=true) {
      const B=this.B,c=this.containers.get(label);if(!c)throw Error('Native Neon model unavailable: '+label);
      const root=new B.TransformNode('neon_'+label,this.scene),offset=new B.TransformNode('neon_native_center',this.scene);
      offset.parent=root;
      const instance=c.instantiateModelsToScene(name=>'neon_'+this.sequence+'_'+name,false,{doNotInstantiate:true});
      instance.rootNodes.forEach(n=>n.parent=offset);
      for(const mesh of root.getChildMeshes()){mesh.material=material;this.mark(mesh,firstPerson);}
      root.computeWorldMatrix(true);const bounds=root.getHierarchyBoundingVectors(true);
      const size=bounds.max.subtract(bounds.min),center=bounds.min.add(bounds.max).scaleInPlace(.5);
      if(centered)offset.position.copyFrom(center).scaleInPlace(-1);
      root.metadata={nativeSize:size,nativeLabel:label};return root;
    }
    setBetween(root,from,to,widthScale=1) {
      const B=this.B,s=this.scratch,size=root.metadata.nativeSize;
      to.subtractToRef(from,s.direction);const length=s.direction.length();
      if(length<.0001){root.setEnabled(false);return;}
      root.setEnabled(true);s.direction.scaleInPlace(1/length);
      const axis=size.y>size.x&&size.y>size.z?B.Axis.Y:size.z>size.x?B.Axis.Z:B.Axis.X;
      const dot=clamp(B.Vector3.Dot(axis,s.direction),-1,1);
      B.Vector3.CrossToRef(axis,s.direction,s.side);
      if(s.side.lengthSquared()<.00001){
        if(dot>0)s.rotation.set(0,0,0,1);
        else B.Quaternion.RotationAxisToRef(axis===B.Axis.Y?B.Axis.X:B.Axis.Y,Math.PI,s.rotation);
      }else B.Quaternion.RotationAxisToRef(s.side.normalize(),Math.acos(dot),s.rotation);
      root.rotationQuaternion=root.rotationQuaternion||new B.Quaternion();root.rotationQuaternion.copyFrom(s.rotation);
      B.Vector3.LerpToRef(from,to,.5,root.position);
      const ratio=length/Math.max(size.x,size.y,size.z,.001);root.scaling.setAll(ratio*widthScale);
      if(axis===B.Axis.X)root.scaling.x=ratio;else if(axis===B.Axis.Y)root.scaling.y=ratio;else root.scaling.z=ratio;
    }
    createBeam({from,to,width=.24,seed=0}={}) {
      this.assertReady();const B=this.B;positive(width,'beam width');
      const mesh=this.mark(B.MeshBuilder.CreatePlane('neon_overdrive',{size:1},this.scene)),m=this.material('beam',{seed});
      mesh.material=m;mesh.alwaysSelectAsActiveMesh=true;
      const a=new B.Vector3(),b=new B.Vector3(),eye=new B.Vector3();
      if(from)a.copyFrom(from);if(to)b.copyFrom(to);
      m.setVector3('beamFrom',a);m.setVector3('beamTo',b);m.setVector3('eye',eye);m.setFloat('beamWidth',width);
      const impact=this.createPointGlow({size:.18});impact.root.parent=mesh;
      const effect=this.own(mesh,[m],(now,camera)=>{
        if(camera)eye.copyFrom(camera.globalPosition||camera.position);
        m.setVector3('eye',eye);m.setFloat('clock',now);return true;
      },false);
      effect.setEndpoints=(start,end)=>{
        a.copyFrom(start);b.copyFrom(end);m.setVector3('beamFrom',a);m.setVector3('beamTo',b);
        impact.setPosition(b);
        mesh.setEnabled(B.Vector3.DistanceSquared(a,b)>.000001);
      };
      effect.setPower=(value,depleted=0)=>{m.setFloat('opacity',clamp(value));m.setFloat('depleted',clamp(depleted));impact.setPower(value,depleted);};
      effect.setEndpoints(a,b);return effect;
    }
    createPointGlow({size=.12,firstPerson=false}={}) {
      this.assertReady();const B=this.B,mesh=this.mark(new B.Mesh('neon_energy_contact',this.scene),firstPerson),m=this.material('finger');mesh.material=m;
      const positions=new Float32Array(12);mesh.setVerticesData(B.VertexBuffer.PositionKind,positions,true);
      mesh.setVerticesData(B.VertexBuffer.UVKind,[0,0,1,0,1,1,0,1]);mesh.setIndices([0,1,2,0,2,3]);mesh.alwaysSelectAsActiveMesh=true;
      m.setFloat('glowSize',size);const right=new B.Vector3(),up=new B.Vector3(),eye=new B.Vector3();let power=0;
      const effect=this.own(mesh,[m],(_now,camera)=>{
        mesh.setEnabled(power>.001);if(power<=.001||!camera)return true;const matrix=camera.getWorldMatrix();
        B.Vector3.TransformNormalToRef(B.Axis.X,matrix,right);B.Vector3.TransformNormalToRef(B.Axis.Y,matrix,up);
        eye.copyFrom(camera.globalPosition||camera.position);m.setVector3('eye',eye);m.setVector3('eyeRight',right.normalize());m.setVector3('eyeUp',up.normalize());return true;
      },false);
      effect.setPosition=p=>{for(let i=0;i<4;i++){positions[i*3]=p.x;positions[i*3+1]=p.y;positions[i*3+2]=p.z;}mesh.updateVerticesData(B.VertexBuffer.PositionKind,positions,false,false);};
      effect.setPower=(value,warm=0)=>{power=clamp(value);m.setFloat('power',power);m.setFloat('depleted',clamp(warm));};return effect;
    }
    // Valorant Q (Relay Bolt) Impact & Concussive Detonation Zone
    createConcuss({point,normal,startedAt,radius,windup=.8,visibleSeconds=.55,seed=0,linkTo=null}) {
      this.assertReady();positive(radius,'concuss radius');positive(visibleSeconds,'concuss visibility');
      if(!Number.isFinite(startedAt)||!Number.isFinite(windup)||windup<0)throw Error('Neon VFX: invalid concuss time');
      const B=this.B,root=new B.TransformNode('neon_relay_impact',this.scene),m=this.material('ground',{seed});
      root.position.copyFrom(point);if(normal)root.position.addInPlace(normal.scale(.025));else root.position.y+=.025;
      root.rotationQuaternion=new B.Quaternion();
      if(normal){const n=normal.normalizeToNew(),dot=clamp(B.Vector3.Dot(B.Axis.Y,n),-1,1),axis=B.Vector3.Cross(B.Axis.Y,n);
        if(axis.lengthSquared()>.00001)B.Quaternion.RotationAxisToRef(axis.normalize(),Math.acos(dot),root.rotationQuaternion);
        else if(dot<0)B.Quaternion.RotationAxisToRef(B.Axis.X,Math.PI,root.rotationQuaternion);}
      const disc=this.mark(B.MeshBuilder.CreateDisc('neon_relay_ground',{radius,tessellation:64},this.scene));
      disc.rotation.x=Math.PI/2;disc.parent=root;disc.material=m;
      const crownMat=this.material('native',{role:1,seed}),crown=this.native('concuss',crownMat);
      crown.parent=root;
      // The extracted Q cylinder is Z-up in the source GLB; the game scene is
      // Y-up. Rotate the native 3D asset before applying its height scale so
      // the concussive column keeps the reference silhouette.
      crown.rotation.x=Math.PI/2;
      const size=crown.metadata.nativeSize;
      const inverseMat=this.material('native',{role:1,seed:seed+.17}),inverse=this.native('concussInverse',inverseMat);
      inverse.parent=root;inverse.rotation.x=Math.PI/2;inverse.rotation.y=Math.PI;
      const inverseSize=inverse.metadata.nativeSize;
      const shellMat=this.material('native',{role:1,seed:seed+.33}),shell=this.native('concussMesh',shellMat);
      shell.parent=root;shell.rotation.x=Math.PI/2;const shellSize=shell.metadata.nativeSize;
      const beamMat=this.material('native',{role:2,seed:seed+.49}),beam=this.native('concussBeam',beamMat,false,false);
      beam.parent=root;beam.position.y=.82;beam.rotation.z=Math.PI*.5;beam.setEnabled(false);
      // Vertical lightning burst column at detonation
      const pillar=this.createBeam({
        from:root.position,
        to:root.position.add(new B.Vector3(0,radius*1.45,0)),
        width:radius*.42,
        seed:seed+.29
      });
      pillar.root.parent=root;pillar.setPower(0);
      // Optional tether beam connecting the first bounce zone to the second bounce zone during windup
      const tether=linkTo?this.createBeam({from:root.position,to:linkTo,width:.16,seed:seed+.61}):null;
      if(tether)tether.root.parent=root;
      const dome=this.mark(new B.Mesh('neon_concuss_hemisphere',this.scene)),domeData=new B.VertexData(),positions=[],uvs=[],indices=[];
      for(let ring=0;ring<=10;ring++)for(let i=0;i<=44;i++){
        const theta=ring/10*Math.PI/2,phi=i/44*Math.PI*2;
        positions.push(Math.cos(phi)*Math.sin(theta),Math.cos(theta)*.78,Math.sin(phi)*Math.sin(theta));uvs.push(i/44,Math.cos(theta));
        if(ring<10&&i<44){const k=ring*45+i;indices.push(k,k+1,k+45,k+45,k+1,k+46);}
      }
      domeData.positions=positions;domeData.uvs=uvs;domeData.indices=indices;domeData.applyToMesh(dome);dome.parent=root;
      const domeMat=this.material('shock',{seed});dome.material=domeMat;
      const upNormal=normal?normal.normalizeToNew():B.Axis.Y;
      return this.own(root,[m,crownMat,inverseMat,shellMat,beamMat,domeMat],now=>{
        const age=now-startedAt;if(age<0){root.setEnabled(false);return true;}root.setEnabled(true);
        if(age>=windup+visibleSeconds){pillar.dispose();tether?.dispose();return false;}
        const chargeRatio=clamp(age/Math.max(windup,.001));
        const blast=clamp((age-windup)/visibleSeconds),charged=age>=windup;
        // Ground decal transitions from Windup (role 0) to Detonation crater (role 1)
        m.setFloat('clock',age);
        m.setFloat('role',charged?1:0);
        m.setFloat('progress',charged?blast:chargeRatio);
        m.setFloat('opacity',charged?Math.pow(1-blast,.65):.78+.22*chargeRatio);
        // Crown (Sprinter_Q_Cylinder) spins at low height during windup, then erupts upwards on detonation
        crown.setEnabled(true);inverse.setEnabled(true);shell.setEnabled(true);
        const crownHeight=charged?(1.25+blast*2.0):(.14+.18*chargeRatio);
        const crownRadius=charged?radius*(.98+.12*blast):radius*(.96-.04*chargeRatio);
        crown.scaling.set(crownRadius*2/size.x,crownRadius*2/size.y,crownHeight/size.z);
        crown.position.y=crownHeight*.5;
        crown.rotation.y=age*(charged?6.5:3.2);
        crownMat.setFloat('clock',age);
        crownMat.setFloat('opacity',charged?Math.pow(1-blast,.7)*.95:(.38+.45*chargeRatio));
        const inverseHeight=charged?crownHeight*1.04:crownHeight*.96,inverseRadius=crownRadius*1.03;
        inverse.scaling.set(inverseRadius*2/inverseSize.x,inverseRadius*2/inverseSize.y,inverseHeight/inverseSize.z);
        inverse.position.y=inverseHeight*.5;inverse.rotation.y=-age*(charged?5.4:2.7);
        inverseMat.setFloat('clock',age+.11);inverseMat.setFloat('opacity',charged?Math.pow(1-blast,.82)*.42:(.2+.28*chargeRatio));
        const shellHeight=charged?crownHeight*1.1:crownHeight*1.02,shellRadius=crownRadius*1.08;
        shell.scaling.set(shellRadius*2/shellSize.x,shellRadius*2/shellSize.y,shellHeight/shellSize.z);
        shell.position.y=shellHeight*.5;shell.rotation.y=age*(charged?3.1:1.8);
        shellMat.setFloat('clock',age-.17);shellMat.setFloat('opacity',charged?Math.pow(1-blast,.76)*.3:.16+.2*chargeRatio);
        beam.scaling.set(radius*1.7,Math.max(.4,crownHeight*1.55),1);beamMat.setFloat('clock',age*1.3);beamMat.setFloat('opacity',charged?Math.pow(1-blast,.7)*.68:chargeRatio*.18);
        // Concussive dome expands rapidly on detonation, with a subtle implosion preview at the end of windup
        dome.setEnabled(charged||chargeRatio>.55);
        if(!charged){
          const pre=clamp((chargeRatio-.55)/.45);
          dome.scaling.setAll(radius*(1.0-.45*pre));
          domeMat.setFloat('clock',age);domeMat.setFloat('progress',pre);domeMat.setFloat('opacity',pre*.28);
        }else{
          const expand=.35+.72*Math.pow(Math.min(1,blast*3.6),.55);
          dome.scaling.set(radius*expand,radius*(.55+.85*Math.min(1,blast*3.0)),radius*expand);
          domeMat.setFloat('clock',age);domeMat.setFloat('progress',blast);domeMat.setFloat('opacity',Math.pow(1-blast,.75)*.88);
        }
        // Central electric eruption column during detonation
        if(charged&&blast<.65){
          const burstEnv=Math.sin(Math.PI*clamp(blast/.65));
          pillar.setEndpoints(root.position,root.position.add(upNormal.scale(radius*(1.1+blast*1.2))));
          pillar.setPower(burstEnv*.95);
        }else{
          pillar.setPower(0);
        }
        if(tether){
          const tetherPower=!charged?(.45+.55*chargeRatio):Math.max(0,1-blast*2.5);
          tether.setEndpoints(root.position,linkTo);
          tether.setPower(tetherPower);
        }
        return true;
      });
    }
    createRelayBolt({seed=0,width=.22}={}) {
      this.assertReady();const B=this.B,root=new B.TransformNode('neon_relay_bolt',this.scene),beams=[];
      const a=new B.Vector3(),b=new B.Vector3(),direction=new B.Vector3(0,0,1);
      for(let i=0;i<3;i++){
        const beam=this.createBeam({from:a,to:b,width:width*(i===0?1.1:i===1?.72:.45),seed:seed+i*.37});
        beam.root.parent=root;beams.push(beam);
      }
      const glow=this.createPointGlow({size:width*1.65});glow.root.parent=root;
      const effect=this.own(root,[],()=>true,false);
      const core=this.mark(B.MeshBuilder.CreateSphere('neon_relay_core',{diameter:width*.82,segments:14},this.scene)),coreMat=this.material('orb');
      core.material=coreMat;core.parent=root;
      this.own(core,[coreMat],now=>{coreMat.setFloat('clock',now);return true;},false);
      effect.setPosition=(point,velocity)=>{
        root.position.copyFrom(point);if(velocity&&velocity.lengthSquared()>.000001)direction.copyFrom(velocity).normalize();
        a.copyFrom(point);b.copyFrom(direction).scaleInPlace(-width*3.1).addInPlace(point);
        beams.forEach((e,idx)=>{
          const tailScale=1+idx*.28;
          const tailEnd=direction.scale(-width*2.6*tailScale).addInPlace(point);
          e.setEndpoints(a,tailEnd);
        });
        glow.setPosition(point);
      };
      effect.setPower=value=>{
        const p=clamp(value);
        beams.forEach(e=>e.setPower(p));
        glow.setPower(p);
        core.setEnabled(p>.001);coreMat.setFloat('opacity',p);
      };
      return effect;
    }
    createSprintTrail({life=.32,width=.1,seed=0}={}) {
      this.assertReady();positive(life,'trail life');positive(width,'trail width');
      const B=this.B,count=18,root=new B.TransformNode('neon_sprint_trails',this.scene),m=this.material('trail',{seed});
      m.setFloat('trailLife',life);const tracks=[];
      for(let side=0;side<2;side++) {
        const mesh=this.mark(new B.Mesh('neon_foot_trail_'+side,this.scene));mesh.parent=root;mesh.material=m;
        const positions=new Float32Array(count*6),uvs=new Float32Array(count*4),births=new Float32Array(count*4),indices=[];
        for(let i=0;i<count;i++) {uvs[i*4]=uvs[i*4+2]=i*.35;uvs[i*4+1]=0;uvs[i*4+3]=1;births[i*4]=births[i*4+2]=-10000;
          if(i<count-1){const k=i*2;indices.push(k,k+1,k+2,k+2,k+1,k+3);}}
        mesh.setVerticesData(B.VertexBuffer.PositionKind,positions,true);
        mesh.setVerticesData(B.VertexBuffer.UVKind,uvs,false);mesh.setVerticesData(B.VertexBuffer.UV2Kind,births,true);mesh.setIndices(indices);
        tracks.push({mesh,positions,births,points:new Float32Array(count*4),length:0,last:-Infinity});
      }
      let power=1;const effect=this.own(root,[m],now=>{m.setFloat('clock',now);return true;},false);
      effect.setPower=value=>{power=clamp(value);};
      effect.reset=()=>{for(const t of tracks){t.length=0;t.last=-Infinity;t.mesh.setEnabled(false);}};
      effect.push=(side,point,now)=>{
        const t=tracks[side];if(!t||!Number.isFinite(now)||effect.disposed)return;
        if(power<=.001){t.length=0;t.last=-Infinity;t.mesh.setEnabled(false);return;}
        if(now<t.last){t.length=0;t.last=-Infinity;t.mesh.setEnabled(false);}
        if(now-t.last<1/30)return;
        const points=t.points,n=t.length,last=(n-1)*4;
        if(n){const dx=point.x-points[last],dy=point.y-points[last+1],dz=point.z-points[last+2];
          const d2=dx*dx+dy*dy+dz*dz;
          if(now<t.last||now-t.last>life||d2>4)t.length=0;else if(d2<.0004)return;}
        if(t.length===count){points.copyWithin(0,4);t.length--;}
        let offset=t.length*4;points[offset]=point.x;points[offset+1]=point.y+.018;points[offset+2]=point.z;points[offset+3]=now;
        t.length++;t.last=now;
        for(let i=0;i<count;i++) {
          const k=Math.min(i,t.length-1),j=k*4,prev=Math.max(0,k-1)*4,next=Math.min(t.length-1,k+1)*4;
          let dx=points[next]-points[prev],dz=points[next+2]-points[prev+2],length=Math.hypot(dx,dz);
          if(length<.00001){dx=0;dz=1;length=1;}const x=dz/length*width*.5,z=-dx/length*width*.5,p=i*6;
          t.positions[p]=points[j]-x;t.positions[p+1]=points[j+1];t.positions[p+2]=points[j+2]-z;
          t.positions[p+3]=points[j]+x;t.positions[p+4]=points[j+1];t.positions[p+5]=points[j+2]+z;
          t.births[i*4]=t.births[i*4+2]=points[j+3];
        }
        t.mesh.updateVerticesData(B.VertexBuffer.PositionKind,t.positions,true,false);
        t.mesh.updateVerticesData(B.VertexBuffer.UV2Kind,t.births,false,false);t.mesh.setEnabled(t.length>1);
      };
      return effect;
    }
    createArmEnergy({nodes,firstPerson=false,seed=0}) {
      this.assertReady();const B=this.B,root=new B.TransformNode('neon_arm_power',this.scene),materials=[],pairs=[];
      for(const [i,side]of ['L','R'].entries()) {
        const m=this.material('native',{seed:seed+i*.39}),native=this.native('arm'+(firstPerson?'1':'3')+side,m,firstPerson);
        native.parent=root;materials.push(m);pairs.push({native,m,side});
      }
      let power=0,depleted=0,visible=true;
      const effect=this.own(root,materials,now=>{
        root.setEnabled(visible&&power>.001);if(!visible||power<=.001)return true;
        for(const item of pairs) {
          const hand=nodes.get(item.side+'_Hand'),elbow=nodes.get(item.side+'_ForeArm')||nodes.get(item.side+'_Elbow');
          if(!hand||!elbow||hand.isDisposed()||elbow.isDisposed()){item.native.setEnabled(false);continue;}
          hand.computeWorldMatrix(true);elbow.computeWorldMatrix(true);
          this.setBetween(item.native,elbow.getAbsolutePosition(),hand.getAbsolutePosition(),1.35);
          item.m.setFloat('clock',now);item.m.setFloat('power',power);item.m.setFloat('depleted',depleted);
        }return true;
      },false);
      effect.setPower=(value,warm=0)=>{power=clamp(value);depleted=clamp(warm);};
      effect.setVisible=value=>{visible=!!value;};return effect;
    }
    createBootEnergy({nodes,seed=0}) {
      this.assertReady();const B=this.B,root=new B.TransformNode('neon_boot_power',this.scene),materials=[],pairs=[];
      for(const [i,label]of ['bootL','bootR','bootTop'].entries()) {
        const m=this.material('native',{vertexAlpha:true,role:0,seed:seed+i*.17}),native=this.native(label,m);
        native.parent=root;materials.push(m);pairs.push({native,m,side:label==='bootL'?'L':'R'});
      }
      let power=0;
      const effect=this.own(root,materials,now=>{
        root.setEnabled(power>.001);if(power<=.001)return true;
        for(const item of pairs){const bone=nodes.get(item.side+'_Foot')||nodes.get(item.side+'_Ankle');
          const toe=nodes.get(item.side+'_Toe');
          if(!bone||!toe||bone.isDisposed()||toe.isDisposed()){item.native.setEnabled(false);continue;}
          bone.computeWorldMatrix(true);item.native.setEnabled(true);item.native.position.copyFrom(bone.getAbsolutePosition());
          toe.computeWorldMatrix(true);const s=this.scratch;
          toe.getAbsolutePosition().subtractToRef(bone.getAbsolutePosition(),s.direction);
          if(s.direction.lengthSquared()<.000001){item.native.setEnabled(false);continue;}
          s.direction.normalize();B.Vector3.CrossToRef(B.Axis.Y,s.direction,s.side);
          if(s.side.lengthSquared()<.000001){item.native.setEnabled(false);continue;}
          s.side.normalize();B.Vector3.CrossToRef(s.direction,s.side,s.up);s.up.normalize();
          B.Quaternion.RotationQuaternionFromAxisToRef(s.side,s.up,s.direction,
            item.native.rotationQuaternion||(item.native.rotationQuaternion=new B.Quaternion()));
          item.m.setFloat('clock',now);item.m.setFloat('power',power);
        }return true;
      },false);
      effect.setPower=value=>{power=clamp(value);};return effect;
    }
    createFingerEnergy({nodes,firstPerson=false,size=.045}) {
      this.assertReady();positive(size,'finger glow size');const B=this.B;
      const mesh=this.mark(new B.Mesh('neon_finger_energy',this.scene),firstPerson),m=this.material('finger');mesh.material=m;
      const bones=[];for(const side of ['L','R'])for(const finger of ['Thumb','Index','Middle','Ring','Pinky']) {
        const tip=nodes.get(side+'_'+finger+'3')||nodes.get(side+'_'+finger+'2');
        const base=nodes.get(side+'_'+finger+'1')||tip;if(tip)bones.push({tip,base});
      }
      const positions=new Float32Array(bones.length*12),uvs=[],indices=[];
      for(let i=0;i<bones.length;i++){uvs.push(0,0,1,0,1,1,0,1);const k=i*4;indices.push(k,k+1,k+2,k,k+2,k+3);}
      mesh.setVerticesData(B.VertexBuffer.PositionKind,positions,true);mesh.setVerticesData(B.VertexBuffer.UVKind,uvs);mesh.setIndices(indices);
      mesh.alwaysSelectAsActiveMesh=true;m.setFloat('glowSize',size);
      const right=new B.Vector3(1,0,0),up=new B.Vector3(0,1,0),eye=new B.Vector3();let power=0,depleted=0,visible=true;
      m.setFloat('surfaceBias',.018);
      const effect=this.own(mesh,[m],(now,camera)=>{
        mesh.setEnabled(visible&&power>.001&&bones.length>0);if(!visible||power<=.001||!camera)return true;
        const matrix=camera.getWorldMatrix();B.Vector3.TransformNormalToRef(B.Axis.X,matrix,right);right.normalize();
        B.Vector3.TransformNormalToRef(B.Axis.Y,matrix,up);up.normalize();m.setVector3('eyeRight',right);m.setVector3('eyeUp',up);
        eye.copyFrom(camera.globalPosition||camera.position);m.setVector3('eye',eye);
        m.setFloat('power',power);m.setFloat('depleted',depleted);
        for(let i=0;i<bones.length;i++) {
          const {base,tip}=bones[i];if(base.isDisposed()||tip.isDisposed())return false;
          base.computeWorldMatrix(true);tip.computeWorldMatrix(true);
          for(let j=0;j<4;j++){const p=(j<2?base:tip).getAbsolutePosition(),k=i*12+j*3;positions[k]=p.x;positions[k+1]=p.y;positions[k+2]=p.z;}
        }
        mesh.updateVerticesData(B.VertexBuffer.PositionKind,positions,false,false);return true;
      },false);
      effect.setPower=(value,warm=0)=>{power=clamp(value);depleted=clamp(warm);};effect.setVisible=value=>{visible=!!value;};return effect;
    }
    createSkinPower({meshes,firstPerson=false}) {
      this.assertReady();const B=this.B,root=new B.TransformNode('neon_powered_skin',this.scene),m=this.material('skin'),overlays=[];
      for(const source of meshes||[]) {
        const skeleton=source.skeleton;if(!skeleton||!source.getTotalVertices())continue;
        const finger=new Set(),tip=new Set();
        skeleton.bones.forEach((bone,i)=>{if(/^[LR]_(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(bone.name)){finger.add(i);if(/[23]$/.test(bone.name))tip.add(i);}});
        const joints=source.getVerticesData(B.VertexBuffer.MatricesIndicesKind),weights=source.getVerticesData(B.VertexBuffer.MatricesWeightsKind);
        const positions=source.getVerticesData(B.VertexBuffer.PositionKind),normals=source.getVerticesData(B.VertexBuffer.NormalKind),sourceIndices=source.getIndices();
        if(!joints||!weights||!positions||!normals||!sourceIndices)continue;
        const strength=new Float32Array(source.getTotalVertices()),heat=new Float32Array(source.getTotalVertices());
        for(let i=0;i<strength.length;i++)for(let j=0;j<4;j++){
          const k=i*4+j,bone=joints[k];if(finger.has(bone))strength[i]+=weights[k];if(tip.has(bone))heat[i]+=weights[k];
        }
        const map=new Map(),data={position:[],normal:[],matricesIndices:[],matricesWeights:[],color:[]},indices=[];
        function vertex(old){
          if(map.has(old))return map.get(old);const id=map.size;map.set(old,id);
          for(let j=0;j<3;j++){data.position.push(positions[old*3+j]);data.normal.push(normals[old*3+j]);}
          for(let j=0;j<4;j++){data.matricesIndices.push(joints[old*4+j]);data.matricesWeights.push(weights[old*4+j]);}
          data.color.push(strength[old],heat[old],0,1);return id;
        }
        for(let i=0;i<sourceIndices.length;i+=3){const a=sourceIndices[i],b=sourceIndices[i+1],c=sourceIndices[i+2];
          if(Math.max(strength[a],strength[b],strength[c])<.12)continue;indices.push(vertex(a),vertex(b),vertex(c));}
        if(!indices.length)continue;
        const mesh=this.mark(new B.Mesh('neon_finger_surface',this.scene),firstPerson);mesh.parent=source;mesh.skeleton=skeleton;mesh.material=m;
        for(const [kind,values]of Object.entries(data))mesh.setVerticesData(kind,values,false);
        mesh.setIndices(indices);mesh.alwaysSelectAsActiveMesh=true;mesh.numBoneInfluencers=4;overlays.push(mesh);
      }
      let power=0,visible=true;
      const effect=this.own(root,[m],()=>{for(const mesh of overlays)mesh.setEnabled(visible&&power>.001);return true;},false);
      root.onDisposeObservable.add(()=>overlays.forEach(mesh=>mesh.dispose(false,false)));
      effect.setPower=(value,warm=0)=>{power=clamp(value);m.setFloat('power',power);m.setFloat('depleted',clamp(warm));};
      effect.setVisible=value=>{visible=!!value;};effect.overlayCount=overlays.length;return effect;
    }
    createBodyCorona({nodes,seed=0}) {
      this.assertReady();const B=this.B;
      const links=[['L_Shoulder','L_Elbow'],['R_Shoulder','R_Elbow'],['L_Elbow','L_Hand'],['R_Elbow','R_Hand'],
        ['Spine1','Spine3'],['L_Knee','L_Foot'],['R_Knee','R_Foot'],['Spine3','L_Shoulder'],['Spine3','R_Shoulder']].map(([a,b])=>[nodes.get(a),nodes.get(b)]).filter(([a,b])=>a&&b);
      const mesh=this.mark(new B.Mesh('neon_body_corona',this.scene)),m=this.material('corona',{seed});mesh.material=m;mesh.alwaysSelectAsActiveMesh=true;
      const positions=new Float32Array(links.length*12),normals=new Float32Array(links.length*12),uvs=[],uv2=[],indices=[];
      for(let i=0;i<links.length;i++){uvs.push(0,0,0,1,1,1,1,0);for(let j=0;j<4;j++)uv2.push(i===4?.20:.075,0);const k=i*4;indices.push(k,k+1,k+2,k,k+2,k+3);}
      mesh.setVerticesData(B.VertexBuffer.PositionKind,positions,true);mesh.setVerticesData(B.VertexBuffer.NormalKind,normals,true);
      mesh.setVerticesData(B.VertexBuffer.UVKind,uvs);mesh.setVerticesData(B.VertexBuffer.UV2Kind,uv2);mesh.setIndices(indices);m.setFloat('beamWidth',.26);
      const eye=new B.Vector3(),direction=new B.Vector3();let power=0;
      const effect=this.own(mesh,[m],(now,camera)=>{
        mesh.setEnabled(power>.001&&links.length>0);if(power<=.001||!camera)return true;
        eye.copyFrom(camera.globalPosition||camera.position);m.setVector3('eye',eye);m.setFloat('clock',now);m.setFloat('power',power);
        for(let i=0;i<links.length;i++){
          const [a,b]=links[i];if(a.isDisposed()||b.isDisposed())return false;a.computeWorldMatrix(true);b.computeWorldMatrix(true);
          b.getAbsolutePosition().subtractToRef(a.getAbsolutePosition(),direction);direction.normalize();
          for(let j=0;j<4;j++){const point=(j<2?a:b).getAbsolutePosition(),k=i*12+j*3;
            positions[k]=point.x;positions[k+1]=point.y;positions[k+2]=point.z;
            normals[k]=direction.x;normals[k+1]=direction.y;normals[k+2]=direction.z;}
        }
        mesh.updateVerticesData(B.VertexBuffer.PositionKind,positions,false,false);mesh.updateVerticesData(B.VertexBuffer.NormalKind,normals,false,false);return true;
      },false);
      effect.setPower=value=>{power=clamp(value);};return effect;
    }
    createActor({firstPersonNodes=null,bodyNodes=null,firstPersonMeshes=null,bodyMeshes=null,seed=0}) {
      this.assertReady();const renderer=this,handles=[],arms=[],fingers=[];
      for(const [nodes,firstPerson]of [[firstPersonNodes,true],[bodyNodes,false]])if(nodes) {
        const arm=this.createArmEnergy({nodes,firstPerson,seed});
        const source=firstPerson?firstPersonMeshes:bodyMeshes;
        const finger=source?this.createSkinPower({meshes:source,firstPerson}):this.createFingerEnergy({nodes,firstPerson});
        handles.push(arm,finger);arms.push({effect:arm,firstPerson});fingers.push({effect:finger,firstPerson});
      }
      const boots=bodyNodes?this.createBootEnergy({nodes:bodyNodes,seed}):null;
      const corona=bodyNodes?this.createBodyCorona({nodes:bodyNodes,seed}):null;
      const trail=bodyNodes?this.createSprintTrail({seed}):null,beam=this.createBeam({seed});
      const powerHandles=arms.concat(fingers);
      handles.push(beam);if(boots)handles.push(boots);if(corona)handles.push(corona);if(trail)handles.push(trail);
      beam.setPower(0);let closed=false,previousView=null;
      return {
        reset(){trail?.reset();beam.setPower(0);},
        sync(state) {
          if(closed)return;
          const visible=state.visible!==false&&state.alive!==false,firstPerson=!!state.firstPerson;
          const powered=visible&&(state.sprinting||state.sliding||state.ultimate||state.casting);
          const strength=powered?clamp(state.power??1):0,warm=clamp(state.depleted||0);
          for(const item of powerHandles){item.effect.setVisible(visible&&item.firstPerson===firstPerson);item.effect.setPower(strength,warm);}
          const showBody=visible&&!firstPerson;
          corona?.setPower(showBody&&powered?strength:0);
          boots?.setPower(showBody&&(state.sprinting||state.sliding)?strength:0);
          trail?.setPower(showBody&&(state.sprinting||state.sliding)?strength:0);
          if(previousView!==firstPerson){trail?.reset();previousView=firstPerson;}
          if(showBody&&bodyNodes&&trail&&(state.sprinting||state.sliding))for(const [side,label]of ['L_Foot','R_Foot'].entries()) {
            const node=bodyNodes.get(label);if(node&&!node.isDisposed()){node.computeWorldMatrix(true);trail.push(side,node.getAbsolutePosition(),state.now);}
          }
          const nodes=firstPerson?firstPersonNodes:bodyNodes;
          const hand=nodes?.get('R_Index3')||nodes?.get('R_Hand');
          if(visible&&state.ultimate&&state.firing&&state.hitPoint&&hand&&!hand.isDisposed()) {
            hand.computeWorldMatrix(true);beam.setEndpoints(hand.getAbsolutePosition(),state.hitPoint);beam.setPower(strength,warm);
          }else beam.setPower(0);
        },
        dispose(){if(closed)return;closed=true;handles.forEach(h=>h.dispose());},
        renderer
      };
    }
    createEquip({parent,firstPerson=false,ultimate=false,startedAt,duration=.55,seed=0}) {
      this.assertReady();positive(duration,'equip duration');const B=this.B;
      if(!Number.isFinite(startedAt))throw Error('Neon VFX: invalid equip time');
      const root=new B.TransformNode('neon_equip_power',this.scene);if(parent)root.parent=parent;
      const labels=ultimate?['zigL','zigR','burst']:[firstPerson?'swoosh1':'swoosh3'],materials=[];
      for(const [i,label]of labels.entries()) {
        const m=this.material('native',{role:2,seed:seed+i*.31}),native=this.native(label,m,firstPerson,false);
        native.parent=root;materials.push(m);
      }
      return this.own(root,materials,now=>{
        const age=now-startedAt;if(age<0){root.setEnabled(false);return true;}root.setEnabled(true);
        if(age>=duration)return false;const envelope=Math.sin(Math.PI*clamp(age/duration));
        for(const m of materials){m.setFloat('clock',age);m.setFloat('opacity',envelope);}
        return true;
      },true,true);
    }
    update(now,camera=this.scene.activeCamera) {
      if(this.closed||!Number.isFinite(now))return;
      for(const effect of [...this.effects]){if(!effect.disposed&&effect.update(now,camera)===false)effect.dispose();}
    }
    dispose() {
      if(this.closed)return;this.closed=true;this.ready=false;
      this.scene.onDisposeObservable.remove(this.disposeObserver);
      for(const effect of [...this.effects])effect.dispose();this.effects.clear();
      this.containers.forEach(c=>c.dispose());this.containers.clear();
      this.materials.forEach(m=>m.dispose(false,false));this.materials.clear();
      this.textures.forEach(t=>t.dispose());this.textures.length=0;
    }
  }
  global.VSNeonVFX=Object.freeze({create:(scene,options)=>new Renderer(scene,options)});
})(globalThis);
