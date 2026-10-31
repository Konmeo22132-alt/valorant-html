// Neon C/Q visual rework aligned with authentic Valorant Fast Lane (C) and Relay Bolt (Q) mechanics.
(function (global) {
  'use strict';
  const B = global.BABYLON;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const shaders = {
    vertex: `precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    lane: `precision highp float;varying vec2 vUV;
      uniform sampler2D fluid;uniform sampler2D caustics;uniform sampler2D beam;
      uniform float time;uniform float age;uniform float duration;uniform float forming;
      uniform float enemy;uniform float side;uniform float dissolve;
      float n(vec2 p){return texture2D(fluid,p).r;}
      void main(){
        float x=vUV.x,y=vUV.y;
        float reveal=clamp(age/max(.001,forming),0.0,1.0);
        if(x>reveal)discard;
        float frontDist=reveal-x;
        float rise=clamp(frontDist*7.5,0.0,1.0);
        vec2 p=vec2(x*2.4+side*.31-time*.06,y*1.2-time*.14);
        float a=n(p*.72),b=n(p*1.63+vec2(-time*.05,time*.03)),c=n(p*3.4+vec2(time*.03,-time*.05));
        float swirl=clamp(a*.58+b*.3+c*.12,0.,1.);
        float jagged=sin(x*28.0-time*7.0+side*2.0)*.025+cos(x*52.0+time*10.0)*.015+(swirl-.5)*.06;
        float topLimit=rise*(.93+jagged);
        if(y>topLimit)discard;
        float topEdge=smoothstep(max(0.0,topLimit-.07),topLimit,y);
        vec3 deep=mix(vec3(.005,.15,.52),vec3(.25,.015,.08),enemy*.72);
        vec3 blue=mix(vec3(.012,.48,.88),vec3(.62,.04,.15),enemy*.75);
        vec3 cyan=mix(vec3(.04,.86,1.0),vec3(1.0,.24,.32),enemy*.65);
        vec3 col=mix(blue,deep,smoothstep(.08,.85,y));
        float vein=smoothstep(.58,.86,n(vec2(x*6.5-time*.12,y*3.8+swirl-time*.08)));
        col=mix(col,cyan,vein*(.35+.65*(1.0-y))*.55);
        float foot=1.0-smoothstep(.02,.24,y);
        float flame=smoothstep(.42,.84,n(vec2(x*5.5+time*.16,y*6.5-time*.12)));
        vec3 lime=mix(vec3(.48,.94,.08),vec3(1.0,.45,.08),enemy*.7);
        vec3 yellow=vec3(1.0,.95,.25);
        col=mix(col,lime,foot*flame*.92);
        col+=yellow*foot*flame*.28;
        float frame=mod(floor(time*22.0),8.0);
        float bolt=texture2D(beam,vec2(x*4.5-time*.22,(frame+clamp(y*4.0,.004,.996))/8.0)).r;
        float arc=bolt*smoothstep(.0,.38,1.0-y);
        float frontGlow=exp(-frontDist*18.0)*step(age,forming+.1);
        col=mix(col,cyan,clamp(topEdge*.62+frontGlow*.55,0.0,1.0));
        col=mix(col,yellow,clamp(arc*.78,0.0,1.0));
        col=mix(col,vec3(1.0,1.0,.88),1.0-smoothstep(.004,.022,y));
        float ending=clamp((age-duration+.6)/.6,0.0,1.0);
        if(dissolve>0.5&&ending>0.0&&y+swirl*.25>1.22-ending*1.45)discard;
        float alpha=clamp(.92+topEdge*.08+foot*.08,0.0,1.0)*(1.0-smoothstep(duration-.12,duration,age));
        gl_FragColor=vec4(col,alpha);
      }`,
    laneFloor: `precision highp float;varying vec2 vUV;uniform sampler2D fluid;uniform sampler2D caustics;uniform float time;uniform float age;uniform float duration;uniform float forming;uniform float enemy;
      void main(){
        float reveal=clamp(age/max(.001,forming),0.,1.);
        if(vUV.x>reveal)discard;
        vec2 p=vUV*vec2(3.4,1.3)+vec2(-time*.16,time*.05);
        float c=texture2D(caustics,p).r;
        float f=texture2D(fluid,p*1.7).r;
        float edge=1.-smoothstep(.04,.5,abs(vUV.y-.5)*2.);
        float core=exp(-abs(vUV.y-.5)*18.0);
        float arcs=smoothstep(.55,.88,f)*edge;
        vec3 baseCol=mix(vec3(.02,.45,.88),vec3(.85,.12,.22),enemy*.75);
        vec3 col=mix(baseCol,vec3(.12,.92,1.),c*.5);
        col=mix(col,vec3(.68,.96,.12),smoothstep(.52,.88,c)*edge*.75*(1.0-enemy*.6));
        col=mix(col,vec3(1.,.96,.45),clamp(core+arcs*.45,0.0,1.0));
        float fade=1.-smoothstep(duration-.45,duration,age);
        float alpha=(.28+edge*.72)*fade;
        if(alpha<.01)discard;
        gl_FragColor=vec4(col,alpha);
      }`,
    orb: `precision highp float;varying vec2 vUV;uniform sampler2D fluid;uniform sampler2D caustics;uniform float time;uniform float power;uniform float enemy;
      void main(){
        vec2 p=vUV-.5;float r=length(p)*2.;if(r>1.0)discard;
        float shell=1.-smoothstep(.45,1.,r);
        float core=1.-smoothstep(.02,.42,r);
        float n=texture2D(fluid,vUV*2.2+vec2(time*1.2,-time*.9)).r;
        float c=texture2D(caustics,vUV*1.6+vec2(-time*.6,time*.5)).r;
        vec3 base=mix(vec3(.03,.52,1.),vec3(1.,.2,.3),enemy*.75);
        vec3 col=mix(base,vec3(.12,.92,1.),n*.7);
        col=mix(col,vec3(1.,.96,.28),core*.95);
        col+=vec3(.3,.9,1.)*c*.32;
        float alpha=clamp(shell*.78+core,0.0,1.0)*power;
        if(alpha<.01)discard;
        gl_FragColor=vec4(col,alpha);
      }`,
    boltTrail: `precision highp float;varying vec2 vUV;uniform sampler2D fluid;uniform sampler2D beam;uniform float time;uniform float power;
      void main(){
        float edge=1.-smoothstep(.08,.5,abs(vUV.y-.5)*2.);
        float frame=mod(floor(time*24.0),8.0);
        float bolt=texture2D(beam,vec2(vUV.x*2.0-time*1.2,(frame+clamp(vUV.y,.004,.996))/8.0)).r;
        float f=texture2D(fluid,vec2(vUV.x*2.8-time*.8,vUV.y*2.+time*.2)).r;
        vec3 col=mix(vec3(.02,.42,1.),vec3(.15,.95,1.),max(f,bolt));
        col=mix(col,vec3(1.,.96,.32),smoothstep(.55,.92,max(bolt,f*.85)));
        float taper=smoothstep(0.0,.18,vUV.x)*(1.0-smoothstep(.85,1.0,vUV.x));
        float a=edge*(.25+max(f,bolt)*.95)*taper*power;
        if(a<.01)discard;
        gl_FragColor=vec4(col,clamp(a,0.0,1.0));
      }`,
    // Ground shader supporting both Windup (phase < 0.5) and Detonation (phase >= 0.5)
    ground: `precision highp float;varying vec2 vUV;uniform sampler2D fluid;uniform sampler2D caustics;uniform float time;uniform float power;uniform float phase;uniform float age;
      void main(){
        vec2 p=(vUV-.5)*2.;float r=length(p);if(r>1.0)discard;
        float n=texture2D(fluid,vUV*2.4+vec2(time*.18,-time*.14)).r;
        float c=texture2D(caustics,vUV*1.8+vec2(-time*.12,time*.1)).r;
        float angle=atan(p.y,p.x);
        float edgeNoise=texture2D(fluid,vec2(r*2.1+time*.08,angle*.78-time*.06)).r;
        float ringRadius=.95+(edgeNoise-.5)*.15;
        float outerRing=(1.-smoothstep(.012,.065,abs(r-ringRadius)))*smoothstep(.42,.72,edgeNoise);
        if(phase<0.5){
          // WINDUP: Outer boundary + shrinking charge ring
          float shrink=mix(.94,.08,clamp(age,0.0,1.0));
          float angle=atan(p.y,p.x);
          float ringNoise=texture2D(fluid,vec2(r*1.8-time*.08,angle*.72+time*.12)).r;
          float jitter=(ringNoise-.5)*.16;
          float chargeRing=(1.-smoothstep(.018,.072,abs(r-(shrink+jitter))))*smoothstep(.38,.76,ringNoise);
          float centerGlow=1.-smoothstep(.0,.22,r);
          float veins=smoothstep(.53,.84,c)*smoothstep(shrink-.28,shrink+.08,r);
          float forks=pow(max(0.,cos(angle*9.+ringNoise*5.+time*1.8)),10.)*smoothstep(.15,.92,r);
          vec3 col=mix(vec3(.02,.48,1.),vec3(.08,.94,1.),c*.7);
          col+=vec3(.05,.55,1.)*forks*.45;
          col=mix(col,vec3(1.,.96,.32),clamp(outerRing*.08+chargeRing*.28+centerGlow*age+forks*.72,0.0,1.0));
          float a=clamp(outerRing*.22+chargeRing*.38+veins*.8+forks*.82+centerGlow*.68,0.0,1.0)*power;
          if(a<.01)discard;
          gl_FragColor=vec4(col,a);
        }else{
          // DETONATION: Explosive electric web + shockwave ring
          float shock=(1.-smoothstep(.025,.085,abs(r-min(1.0,.15+age*1.65))))*smoothstep(.35,.76,edgeNoise);
          float spokes=pow(max(0.,cos(angle*9.+time*2.0+n*3.0)),7.)*smoothstep(.08,.95,r);
          float webNoise=texture2D(fluid,vUV*4.1+vec2(time*.12,-time*.08)).r;
          float web=smoothstep(.35,.72,c)*(1.0-smoothstep(.82,1.0,r))*smoothstep(.28,.76,webNoise);
          float flash=pow(max(0.0,1.0-r),3.0)*(1.0-smoothstep(0.0,.4,age));
          vec3 col=mix(vec3(.02,.42,.98),vec3(.12,.94,1.),c*.65);
          col+=vec3(.08,.65,1.)*spokes*.5+vec3(.03,.42,.95)*web*.35;
          col=mix(col,vec3(1.,.96,.28),clamp(shock*.42+spokes*.65+web*.55+flash,0.0,1.0));
          float a=clamp(outerRing*.2+shock*.45+spokes*.92+web*1.15+flash*.9,0.0,1.0)*power;
          if(a<.01)discard;
          gl_FragColor=vec4(col,a);
        }
      }`
  };
  class ReworkRenderer {
    constructor(scene, options = {}) {
      if (!B) throw Error('Babylon is required before neon-vfx-rework.js');
      this.B = B; this.scene = scene; this.root = (options.assetRoot || '/assets/playable/vfx/').replace(/\/?$/, '/');
      this.effects = new Set(); this.textures = []; this.materials = []; this.closed = false; this.ready = false; this.errors = [];
      const store = B.Effect.ShadersStore;
      store.neonReworkVertexShader = shaders.vertex;
      store.neonReworkLaneFragmentShader = shaders.lane;
      store.neonReworkLaneFloorFragmentShader = shaders.laneFloor;
      store.neonReworkOrbFragmentShader = shaders.orb;
      store.neonReworkBoltTrailFragmentShader = shaders.boltTrail;
      store.neonReworkGroundFragmentShader = shaders.ground;
      this.disposeObserver = scene.onDisposeObservable.add(() => this.dispose());
    }
    texture(file, atlas = false) {
      return new Promise((resolve, reject) => {
        const t = new B.Texture(this.root + file, this.scene, atlas, false, atlas ? B.Texture.BILINEAR_SAMPLINGMODE : B.Texture.TRILINEAR_SAMPLINGMODE,
          () => resolve(t), e => reject(Error('Neon rework texture ' + file + ': ' + e)));
        t.gammaSpace = false; t.wrapU = B.Texture.WRAP_ADDRESSMODE; t.wrapV = atlas ? B.Texture.CLAMP_ADDRESSMODE : B.Texture.WRAP_ADDRESSMODE;
        this.textures.push(t); t.onDisposeObservable.add(() => reject(Error('Neon rework texture disposed')));
      });
    }
    async prepare() {
      if (this.ready) return this; if (this.pending) return this.pending;
      this.pending = (async () => {
        this.fluid = await this.texture('neon-fluid-noise.png');
        this.caustics = await this.texture('neon-caustics.png');
        this.beam = await this.texture('Sprinter_Lightning_Beam_Flip01_T.png', true);
        this.ready = true; return this;
      })();
      try { return await this.pending; } catch (e) { this.dispose(); throw e; }
    }
    mat(kind, alphaMode = B.Engine.ALPHA_ADD) {
      const fragment = 'neonRework' + kind;
      const m = new B.ShaderMaterial('neon_rework_' + kind + '_' + this.materials.length, this.scene,
        { vertex: 'neonRework', fragment },
        {
          attributes: ['position', 'uv'],
          uniforms: ['worldViewProjection', 'time', 'age', 'duration', 'forming', 'enemy', 'side', 'dissolve', 'power', 'phase'],
          samplers: ['fluid', 'caustics', 'beam'],
          needAlphaBlending: true
        });
      m.backFaceCulling = false;
      m.disableDepthWrite = kind !== 'Lane';
      m.alphaMode = alphaMode;
      m.metadata = { neonRework: true, skillAgent: 'Neon', ownedSkill: true };
      m.setFloat('time', 0); m.setFloat('age', 0); m.setFloat('duration', 4); m.setFloat('forming', .42);
      m.setFloat('power', 1); m.setFloat('phase', 0); m.setFloat('side', 0); m.setFloat('enemy', 0); m.setFloat('dissolve', 1);
      m.setTexture('fluid', this.fluid); m.setTexture('caustics', this.caustics); m.setTexture('beam', this.beam);
      this.materials.push(m); return m;
    }
    mesh(name, positions, uvs, indices, material, parent, group = 0) {
      const mesh = new B.Mesh(name, this.scene), vd = new B.VertexData();
      vd.positions = positions; vd.uvs = uvs; vd.indices = indices; vd.applyToMesh(mesh);
      mesh.material = material; mesh.parent = parent; mesh.isPickable = false; mesh.renderingGroupId = group;
      mesh.metadata = { neonRework: true, skillAgent: 'Neon' }; return mesh;
    }
    trace(options) {
      const origin = options.origin || B.Vector3.Zero(), direction = options.direction || B.Axis.Z, length = options.length || 22, width = options.width || 3.2, pick = options.pick;
      const f = new B.Vector3(direction.x, 0, direction.z); if (f.lengthSquared() < .001) throw Error('Fast Lane direction is empty'); f.normalize();
      const across = new B.Vector3(f.z, 0, -f.x), out = [];
      for (const side of [-1, 1]) {
        const points = [];
        for (let i = 0; i <= 80; i++) {
          const p = origin.add(across.scale(side * width * .5)).add(f.scale(length * i / 80));
          let y = origin.y;
          if (typeof pick === 'function') {
            const hit = pick(new B.Ray(new B.Vector3(p.x, origin.y + 2, p.z), B.Vector3.Down(), 6), true);
            if (!hit || !hit.pickedPoint) break;
            y = hit.pickedPoint.y;
          }
          points.push(new B.Vector3(p.x, y, p.z));
        }
        if (points.length < 2) throw Error('Fast Lane profile is empty');
        out.push(points);
      }
      return { left: out[0], right: out[1] };
    }
    sampleProfile(points, t) {
      if (!points || !points.length) return B.Vector3.Zero();
      if (t <= 0) return points[0].clone();
      if (t >= 1) return points[points.length - 1].clone();
      const exact = t * (points.length - 1), idx = Math.floor(exact), frac = exact - idx;
      return B.Vector3.Lerp(points[idx], points[Math.min(points.length - 1, idx + 1)], frac);
    }
    spawnFastLane(options = {}) {
      if (!this.ready) throw Error('Await Neon rework prepare() first');
      const B = this.B || (this.B = global.BABYLON), root = new B.TransformNode('neon_rework_fast_lane', this.scene), materials = [];
      const profiles = options.left && options.right ? [options.left, options.right] : Object.values(this.trace(options));
      const height = options.height || 3.15, duration = options.duration || 4, forming = options.forming || .42;
      const leaderOrbs = [];
      profiles.forEach((points, sideIndex) => {
        const positions = [], uvs = [], indices = [], floorPos = [], floorUvs = [], distances = [0];
        for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + B.Vector3.Distance(points[i - 1], points[i]));
        const total = distances[distances.length - 1] || 1;
        points.forEach((p, i) => {
          const u = distances[i] / total, crest = height + Math.sin(distances[i] * 1.18 + sideIndex) * .12 + Math.sin(distances[i] * .37) * .08;
          positions.push(p.x, p.y, p.z, p.x, p.y + crest, p.z); uvs.push(u, 0, u, 1);
          if (i < points.length - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
          const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)], dx = next.x - prev.x, dz = next.z - prev.z, len = Math.hypot(dx, dz) || 1;
          const ox = dz / len * .3, oz = -dx / len * .3;
          floorPos.push(p.x - ox, p.y + .02, p.z - oz, p.x + ox, p.y + .02, p.z + oz); floorUvs.push(u, 0, u, 1);
        });
        const wm = this.mat('Lane', B.Engine.ALPHA_COMBINE);
        wm.setFloat('side', sideIndex ? 1 : -1); wm.setFloat('enemy', options.enemy ? 1 : 0); wm.setFloat('duration', duration); wm.setFloat('forming', forming);
        materials.push(wm);
        this.mesh('neon_rework_wall_' + sideIndex, positions, uvs, indices, wm, root);

        const fm = this.mat('LaneFloor', B.Engine.ALPHA_ADD);
        fm.setFloat('enemy', options.enemy ? 1 : 0); fm.setFloat('duration', duration); fm.setFloat('forming', forming);
        materials.push(fm);
        this.mesh('neon_rework_lane_contact_' + sideIndex, floorPos, floorUvs, indices, fm, root);

        const orbMat = this.mat('Orb', B.Engine.ALPHA_ADD);
        orbMat.setFloat('enemy', options.enemy ? 1 : 0);
        materials.push(orbMat);
        const orb = B.MeshBuilder.CreateSphere('neon_rework_lane_orb_' + sideIndex, { diameter: .38, segments: 12 }, this.scene);
        orb.material = orbMat; orb.parent = root; orb.isPickable = false; orb.metadata = { neonRework: true, skillAgent: 'Neon' };
        leaderOrbs.push({ orb, orbMat, points });
      });
      let disposed = false; const startedAt = options.startedAt || 0;
      const handle = {
        root,
        dispose: () => {
          if (disposed) return; disposed = true; root.dispose(false, false);
          materials.forEach(m => m.dispose(false, false)); this.effects.delete(handle);
        },
        update: now => {
          const age = now - startedAt;
          root.setEnabled(age >= 0 && age < duration);
          if (age < 0 || age >= duration) return;
          materials.forEach(m => { m.setFloat('time', now); m.setFloat('age', age); });
          const progress = clamp(age / Math.max(.001, forming));
          const orbPower = 1 - clamp((age - forming) / .18);
          for (const item of leaderOrbs) {
            item.orb.setEnabled(orbPower > .01);
            if (orbPower > .01) {
              const p = this.sampleProfile(item.points, progress);
              item.orb.position.set(p.x, p.y + .95, p.z);
              item.orbMat.setFloat('power', orbPower);
            }
          }
        }
      };
      this.effects.add(handle); return handle;
    }
    disc(name, radius, material, parent, y = .03) {
      const mesh = B.MeshBuilder.CreateDisc(name, { radius, tessellation: 56 }, this.scene);
      mesh.rotation.x = Math.PI / 2; mesh.position.y = y; mesh.parent = parent; mesh.material = material;
      mesh.isPickable = false; mesh.renderingGroupId = 0; mesh.metadata = { neonRework: true, skillAgent: 'Neon' };
      return mesh;
    }
    spawnRelayBolt(options = {}) {
      if (!this.ready) throw Error('Await Neon rework prepare() first');
      const B = this.B, root = new B.TransformNode('neon_rework_relay_bolt', this.scene);
      const orbMat = this.mat('Orb'), trailMat = this.mat('BoltTrail'), tetherMat = this.mat('BoltTrail');
      const materials = [orbMat, trailMat, tetherMat];
      const boltMat = new B.StandardMaterial('neon_rework_bolt_core_mat', this.scene);
      boltMat.diffuseColor = new B.Color3(.06, .7, 1); boltMat.emissiveColor = new B.Color3(.08, .9, 1); boltMat.alpha = .95; boltMat.backFaceCulling = false; materials.push(boltMat);
      const boltPath = [new B.Vector3(0, 0, -.28), new B.Vector3(.08, .09, -.1), new B.Vector3(-.06, -.08, .05), new B.Vector3(.12, .06, .22), new B.Vector3(0, 0, .34)];
      const boltMesh = B.MeshBuilder.CreateTube('neon_rework_relay_bolt_shape', { path: boltPath, radius: .045, tessellation: 6, updatable: false }, this.scene);
      boltMesh.material = boltMat; boltMesh.parent = root; boltMesh.isPickable = false;
      const orb = B.MeshBuilder.CreateSphere('neon_rework_relay_orb', { diameter: .24, segments: 14 }, this.scene);
      orb.material = orbMat; orb.parent = root; orb.isPickable = false; orb.metadata = { neonRework: true, skillAgent: 'Neon' };

      const trail = this.mesh('neon_rework_relay_trail', [-1.1, -.14, 0, 0, -.14, 0, 0, .14, 0, -1.1, .14, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 0, 2, 3], trailMat, root);
      const tether = this.mesh('neon_rework_relay_tether', [0, 0, -.12, 1, 0, -.12, 1, 0, .12, 0, 0, .12], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 0, 2, 3], tetherMat, root);
      tether.setEnabled(false);

      const radius = options.radius || 2.25;
      const zones = [];
      for (let i = 0; i < 2; i++) {
        const gMat = this.mat('Ground');
        const domeMat = this.mat('Orb');
        const pillarMat = this.mat('BoltTrail');
        materials.push(gMat, domeMat, pillarMat);

        const zoneRoot = new B.TransformNode('neon_rework_concuss_zone_' + i, this.scene);
        zoneRoot.parent = root; zoneRoot.setEnabled(false);

        const groundDisc = this.disc('neon_rework_relay_blast_' + i, radius, gMat, zoneRoot, .03);
        const dome = B.MeshBuilder.CreateSphere('neon_rework_relay_dome_' + i, { diameter: radius * 2, slice: 0.5, segments: 16 }, this.scene);
        dome.material = domeMat; dome.parent = zoneRoot; dome.isPickable = false; dome.setEnabled(false);
        const pillar = B.MeshBuilder.CreateCylinder('neon_rework_relay_pillar_' + i, { height: 1, diameterTop: radius * .45, diameterBottom: radius * .9, tessellation: 24, openEnded: true }, this.scene);
        pillar.material = pillarMat; pillar.parent = zoneRoot; pillar.isPickable = false; pillar.setEnabled(false);
        const arcs = [], shards = [];
        for (let j = 0; j < 4; j++) {
          const arc = B.MeshBuilder.CreatePlane('neon_rework_relay_arc_' + i + '_' + j, { size: 1 }, this.scene);
          arc.material = pillarMat; arc.parent = zoneRoot; arc.isPickable = false; arc.setEnabled(false); arcs.push(arc);
        }
        for (let j = 0; j < 7; j++) {
          const shard = B.MeshBuilder.CreatePlane('neon_rework_relay_shard_' + i + '_' + j, { size: 1 }, this.scene);
          shard.rotation.x = Math.PI / 2; shard.material = pillarMat; shard.parent = zoneRoot; shard.isPickable = false; shard.setEnabled(false); shards.push(shard);
        }
        const arcMat = new B.StandardMaterial('neon_rework_arc_mat_' + i, this.scene);
        arcMat.diffuseColor = new B.Color3(.02, .48, 1); arcMat.emissiveColor = new B.Color3(.02, .66, 1); arcMat.alpha = .78; arcMat.backFaceCulling = false;
        materials.push(arcMat);
        const electricArcs = [];
        for (let j = 0; j < 4; j++) {
          const a = j * Math.PI * .5 + i * .55, radial = new B.Vector3(Math.cos(a), 0, Math.sin(a));
          const side = new B.Vector3(-radial.z, 0, radial.x);
          const path = [
            radial.scale(radius * .18).add(new B.Vector3(0, .06, 0)),
            radial.scale(radius * .38).add(side.scale(.18)).add(new B.Vector3(0, .42, 0)),
            radial.scale(radius * .56).subtract(side.scale(.12)).add(new B.Vector3(0, .92, 0)),
            radial.scale(radius * .7).add(side.scale(.2)).add(new B.Vector3(0, .58, 0)),
            radial.scale(radius * .82).subtract(side.scale(.08)).add(new B.Vector3(0, 1.28, 0))
          ];
          const tube = B.MeshBuilder.CreateTube('neon_rework_relay_arc_tube_' + i + '_' + j, { path, radius: .024, tessellation: 6, updatable: false }, this.scene);
          tube.material = arcMat; tube.parent = zoneRoot; tube.isPickable = false; tube.setEnabled(false); electricArcs.push(tube);
        }

        zones.push({ zoneRoot, groundDisc, dome, pillar, arcs, shards, electricArcs, arcMat, gMat, domeMat, pillarMat });
      }

      const start = options.origin || new B.Vector3(0, 1.25, 0), dir = (options.direction || B.Axis.Z).clone().normalize();
      const startedAt = options.startedAt || 0, bounceAt = options.bounceAt || .42, travel = options.travelDuration || .78;
      const windup = options.windup || .65, blastDuration = options.visibleSeconds || .55;
      const hit1 = start.add(dir.scale(5.2)); hit1.y = .03;
      const hit2 = hit1.add(dir.scale(4.2)); hit2.y = .03;
      let manualPosition = null, manualVelocity = null, manualPower = 1, disposed = false;

      const orientRibbon = (meshNode, from, to, scaleLength = 1) => {
        const delta = to.subtract(from), len = delta.length();
        if (len < .001) { meshNode.setEnabled(false); return; }
        meshNode.setEnabled(true);
        meshNode.position.copyFrom(from);
        meshNode.rotation.y = Math.atan2(delta.z, -delta.x);
        meshNode.scaling.set(len * scaleLength, 1, 1);
      };

      const handle = {
        root,
        setPosition: (point, velocity) => {
          manualPosition = point ? point.clone() : null;
          if (velocity && velocity.lengthSquared() > .00001) manualVelocity = velocity.clone().normalize();
        },
        setPower: value => { manualPower = clamp(value); },
        dispose: () => {
          if (disposed) return; disposed = true; root.dispose(false, false);
          materials.forEach(m => m.dispose(false, false)); this.effects.delete(handle);
        },
        update: now => {
          const t = now - startedAt;
          const totalLife = travel + windup + blastDuration + .15;
          const active = t >= 0 && t < totalLife;
          root.setEnabled(active);
          if (!active) return;

          const flight = clamp(t / travel);
          let pos, velDir = dir;
          if (manualPosition) {
            pos = manualPosition;
            if (manualVelocity) velDir = manualVelocity;
          } else if (flight < bounceAt / travel) {
            const q = clamp(t / bounceAt);
            pos = B.Vector3.Lerp(start, hit1, q);
            pos.y += Math.sin(q * Math.PI) * .72;
            velDir = hit1.subtract(start).add(new B.Vector3(0, Math.cos(q * Math.PI) * .45, 0)).normalize();
          } else {
            const q = clamp((t - bounceAt) / Math.max(.001, travel - bounceAt));
            pos = B.Vector3.Lerp(hit1, hit2, q);
            pos.y = .08 + Math.sin(q * Math.PI) * .82;
            velDir = hit2.subtract(hit1).add(new B.Vector3(0, Math.cos(q * Math.PI) * .7, 0)).normalize();
          }

          const inFlight = manualPosition ? manualPower > .01 : t <= travel;
          orb.setEnabled(inFlight);
          boltMesh.setEnabled(inFlight);
          trail.setEnabled(inFlight);
          if (inFlight) {
            orb.position.copyFrom(pos);
            boltMesh.position.copyFrom(pos); boltMesh.rotation.y = Math.atan2(velDir.x, velDir.z); boltMesh.scaling.setAll(.82 + manualPower * .3); boltMat.alpha = manualPower;
            orbMat.setFloat('time', now); orbMat.setFloat('power', manualPower);
            trail.position.copyFrom(pos);
            trail.rotation.y = Math.atan2(velDir.x, velDir.z);
            trail.scaling.x = 1.35;
            trailMat.setFloat('time', now); trailMat.setFloat('power', manualPower);
          }

          // Tether lightning connecting impact 1 and impact 2 once the second impact registers
          const detonateAt = travel + windup;
          const showTether = false;
          if (showTether) {
            const tetherEnd = t < travel ? pos : hit2;
            orientRibbon(tether, hit1.add(new B.Vector3(0, .08, 0)), tetherEnd.add(new B.Vector3(0, .08, 0)), 1);
            tetherMat.setFloat('time', now);
            tetherMat.setFloat('power', t < detonateAt ? .9 : Math.max(0, 1 - (t - detonateAt) / .22));
          } else {
            tether.setEnabled(false);
          }

          // Both impact zones charge up after their respective impact and detonate simultaneously at detonateAt
          const impactTimes = [bounceAt, travel];
          const impactPoints = [hit1, hit2];
          for (let i = 0; i < zones.length; i++) {
            const z = zones[i], hitTime = impactTimes[i];
            if (manualPosition || t < hitTime || t >= detonateAt + blastDuration) {
              z.zoneRoot.setEnabled(false);
              continue;
            }
            z.zoneRoot.setEnabled(true);
            z.zoneRoot.position.copyFrom(impactPoints[i]);
            z.gMat.setFloat('time', now);
            z.domeMat.setFloat('time', now);
            z.pillarMat.setFloat('time', now);

            if (t < detonateAt) {
              // WINDUP PHASE
              const charge = clamp((t - hitTime) / Math.max(.001, detonateAt - hitTime));
              z.gMat.setFloat('phase', 0);
              z.gMat.setFloat('age', charge);
              z.gMat.setFloat('power', .65 + .35 * charge);

              z.dome.setEnabled(false); z.pillar.setEnabled(false);
              z.arcs.forEach(arc => arc.setEnabled(false)); z.shards.forEach(shard => shard.setEnabled(false));
              z.electricArcs.forEach(arc => arc.setEnabled(false));
              z.pillarMat.setFloat('power', .45 * charge);
            } else {
              // SIMULTANEOUS DETONATION PHASE
              const blast = clamp((t - detonateAt) / blastDuration);
              const fade = Math.pow(1 - blast, .7);
              z.gMat.setFloat('phase', 1);
              z.gMat.setFloat('age', blast);
              z.gMat.setFloat('power', fade);

              z.dome.setEnabled(false); z.pillar.setEnabled(false);
              z.arcs.forEach(arc => arc.setEnabled(false));
              z.electricArcs.forEach((arc, j) => {
                arc.setEnabled(fade > .03); arc.visibility = fade; arc.scaling.setAll(.72 + fade * .48); arc.rotation.y = now * (j % 2 ? .35 : -.28);
              });
              z.shards.forEach((shard, j) => {
                const a = j * (Math.PI * 2 / z.shards.length) + i * .4;
                shard.setEnabled(fade > .05); shard.position.set(Math.cos(a) * radius * (.32 + .18 * (j % 3)), .05 + fade * .12, Math.sin(a) * radius * (.32 + .18 * (j % 3)));
                shard.rotation.z = a + now * (j % 2 ? 1.4 : -1.1); shard.scaling.set((.16 + fade * .34) * (j % 2 ? 1.5 : .8), .12 + fade * .22, 1);
              });
              z.pillarMat.setFloat('power', fade * .9);
            }
          }
        }
      };
      this.effects.add(handle); return handle;
    }
    update(now) { if (!this.closed) for (const e of [...this.effects]) e.update(now); }
    dispose() {
      if (this.closed) return; this.closed = true; this.scene.onDisposeObservable.remove(this.disposeObserver);
      for (const e of [...this.effects]) e.dispose(); this.effects.clear();
      this.materials.forEach(m => m.dispose(false, false)); this.materials = [];
      this.textures.forEach(t => t.dispose()); this.textures = [];
    }
  }
  global.VSNeonVFXRework = Object.freeze({ create: (scene, options) => new ReworkRenderer(scene, options) });
})(globalThis);
