// Fast Lane (C) authoritative Valorant visual implementation.
// Includes dual leading electric orbs, vision-blocking plasma walls with jagged
// lightning crests, base flame contact strips, and rising electric sparks.
(function (global) {
  'use strict';
  const shaders = {
    vertex: `precision highp float;attribute vec3 position;attribute vec2 uv;
      uniform mat4 worldViewProjection;varying vec2 vUV;
      void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    wall: `precision highp float;varying vec2 vUV;
      uniform sampler2D cells;uniform sampler2D curls;uniform sampler2D lightning;
      uniform float time;uniform float age;uniform float duration;uniform float forming;
      uniform float wallLength;uniform float wallHeight;uniform float enemy;uniform float variation;
      void main(){
        float reveal=clamp(age/max(forming,.001),0.0,1.0);
        if(vUV.x>reveal)discard;
        float y=clamp(vUV.y,0.0,1.0),x=vUV.x*wallLength;
        // Wall erupts rapidly behind the leading projectile
        float frontDist=reveal-vUV.x;
        float rise=clamp(frontDist*7.5,0.0,1.0);
        vec2 p=vec2(x*.15,y*.82-time*.14)+vec2(variation,.0);
        float bend=texture2D(curls,p*.55+vec2(.21,-time*.04)).r;
        float swirls=texture2D(curls,p+vec2(bend*.14,-time*.08)).r;
        float network=texture2D(cells,p*1.35+vec2((bend-.5)*.22,swirls*.12-time*.06)).r;
        // Jagged animated top edge matching Valorant's electric wall silhouette
        float jagged=sin(x*2.4-time*6.0+variation*4.0)*.028+cos(x*5.8+time*9.0)*.016+(swirls-.5)*.065;
        float topLimit=rise*(.93+jagged);
        if(y>topLimit)discard;
        float topEdge=1.0-smoothstep(max(0.0,topLimit-.07),topLimit,y);
        // Base Valorant blue/cyan opaque plasma body
        vec3 deepBlue=mix(vec3(.004,.16,.58),vec3(.24,.015,.08),enemy*.7);
        vec3 midBlue=mix(vec3(.008,.44,.84),vec3(.58,.04,.14),enemy*.75);
        vec3 brightCyan=mix(vec3(.04,.86,1.0),vec3(1.0,.22,.32),enemy*.65);
        vec3 navy=vec3(.003,.035,.18);
        vec3 color=mix(midBlue,deepBlue,smoothstep(.08,.78,y));
        color=mix(color,navy,smoothstep(.76,1.0,y)*.75);
        // Large upward-scrolling cellular plasma islands
        float broad=texture2D(cells,p*.78+vec2(.31,-time*.09)).r;
        float cellularSheet=smoothstep(.24,.76,network)*(.35+.65*(1.0-y));
        color=mix(color,brightCyan,cellularSheet*.48);
        color+=brightCyan*smoothstep(.52,.88,broad)*.18;
        // Enemy red/magenta lower warning band
        float redBand=exp(-pow((y-.20)/.17,2.0))*enemy;
        color=mix(color,vec3(.78,.04,.12),redBand*.82);
        // Basal jade/lime/yellow surging electric flames (characteristic of Neon's Fast Lane)
        float heightLimit=.38+(bend-.5)*.18;
        float reach=1.0-smoothstep(heightLimit,heightLimit+.15,y);
        float width=mix(.14,.32,smoothstep(.02,.46,y));
        float plasma=smoothstep(width,width+.15,network)*reach;
        float root=exp(-y*8.0);
        vec3 jade=mix(vec3(.06,.56,.46),vec3(.85,.18,.25),enemy*.7);
        vec3 lime=mix(vec3(.58,.92,.06),vec3(1.0,.48,.08),enemy*.7);
        vec3 yellow=vec3(1.0,.96,.32);
        vec3 plasmaColor=mix(jade,lime,clamp(root*1.75,0.0,1.0));
        color=mix(color,plasmaColor*1.2,plasma*.92);
        // High-frequency lightning arcs snapping along the base, leading edge, and top crest
        float frame=mod(floor(time*22.0)+floor(variation*5.0),8.0);
        float boltBase=texture2D(lightning,vec2(x*.36-time*.18,(frame+clamp(y*5.2,.004,.996))/8.0)).r;
        float boltBody=texture2D(lightning,vec2(x*.22+time*.12,(mod(frame+3.0,8.0)+clamp(y*1.6,.004,.996))/8.0)).r;
        float baseArc=boltBase*smoothstep(.25,.72,swirls)*(1.0-smoothstep(.08,.24,y));
        float bodyArc=boltBody*smoothstep(.58,.88,network)*.45;
        float frontGlow=exp(-frontDist*18.0)*step(age,forming+.1);
        color=mix(color,yellow,clamp(baseArc*.9+bodyArc*.55+topEdge*.75+frontGlow*.85,0.0,1.0));
        float foot=1.0-smoothstep(.005,.024,y);
        color=mix(color,vec3(1.0,1.0,.88),foot*.95);
        // Upward organic cellular dissolve at the end of duration
        float ending=clamp((age-duration+.65)/.65,0.0,1.0);
        if(ending>0.0&&y+swirls*.24>1.22-ending*1.45)discard;
        float dissolveEdge=ending>0.0?1.0-smoothstep(0.0,.08,(1.22-ending*1.45)-(y+swirls*.24)):0.0;
        color=mix(color,brightCyan*1.4,dissolveEdge);
        float alpha=clamp(.92+foot*.08+topEdge*.08+baseArc*.08,0.0,1.0)*(1.0-smoothstep(duration-.12,duration,age));
        gl_FragColor=vec4(color,alpha);
      }`,
    contact: `precision highp float;varying vec2 vUV;
      uniform sampler2D cells;uniform float time;uniform float age;uniform float duration;
      uniform float forming;uniform float wallLength;uniform float enemy;
      void main(){
        float reveal=clamp(age/max(forming,.001),0.0,1.0);
        if(vUV.x>reveal)discard;
        float d=abs(vUV.y*2.0-1.0),core=exp(-d*22.0),halo=exp(-d*d*5.2);
        float irregular=texture2D(cells,vec2(vUV.x*wallLength*.38-time*.22,time*.12)).r;
        float fade=clamp((duration-age)/.45,0.0,1.0);
        float alpha=(core*.92+halo*.22+irregular*halo*.24)*fade*(1.0-smoothstep(.68,1.0,d));
        vec3 baseTint=mix(vec3(.08,.75,.95),vec3(1.0,.22,.28),enemy*.75);
        vec3 coreTint=mix(vec3(.88,1.0,.38),vec3(1.0,.82,.35),enemy*.6);
        vec3 color=mix(baseTint,coreTint,core);
        if(alpha<.005)discard;
        gl_FragColor=vec4(color,clamp(alpha,0.0,1.0));
      }`,
    orb: `precision highp float;varying vec2 vUV;
      uniform sampler2D curls;uniform float time;uniform float power;uniform float enemy;
      void main(){
        vec2 p=(vUV-.5)*2.0;float r=length(p);if(r>1.0)discard;
        float n=texture2D(curls,vUV*2.2+vec2(time*1.6,-time*1.2)).r;
        float core=1.0-smoothstep(.0,.45,r);
        float shell=1.0-smoothstep(.35,1.0,r);
        vec3 outerCol=mix(vec3(.02,.78,1.0),vec3(1.0,.2,.3),enemy*.75);
        vec3 col=mix(outerCol,vec3(.96,1.0,.38),clamp(core+n*.35,0.0,1.0));
        col=mix(col,vec3(1.0,1.0,.95),smoothstep(.65,1.0,core));
        float alpha=clamp(core+shell*.75*n,0.0,1.0)*power;
        if(alpha<.01)discard;
        gl_FragColor=vec4(col,alpha);
      }`,
    debrisVertex: `precision highp float;attribute vec3 position;attribute vec2 uv;attribute vec2 uv2;
      uniform mat4 viewProjection;uniform vec3 cameraRight;uniform vec3 cameraUp;
      uniform float time;uniform float age;uniform float duration;uniform float forming;uniform float pixelScale;
      varying vec2 vUV;varying float vOpacity;varying float vKind;
      void main(){vUV=uv;vKind=uv2.y;
        float cycle=fract(time*(.95+uv2.x)+uv2.x*7.0);
        vec3 p=position+vec3(sin(uv2.x*61.0)*cycle*.11,cycle*(.16+uv2.y*.42),cos(uv2.x*43.0)*cycle*.11);
        float depth=max(.02,(viewProjection*vec4(p,1.0)).w),size=(1.6+uv2.y*2.4)*depth*pixelScale;
        p+=(cameraRight*(uv.x-.5)+cameraUp*(uv.y-.5))*size;
        vOpacity=(1.0-cycle)*step(forming*.25,age)*clamp((duration-age)/.35,0.0,1.0);
        gl_Position=viewProjection*vec4(p,1.0);
      }`,
    debris: `precision highp float;varying vec2 vUV;varying float vOpacity;varying float vKind;
      void main(){vec2 p=abs(vUV-.5)*2.0;float edge=max(p.x,p.y*.75+p.x*.25);
        float a=(1.0-smoothstep(.35,1.0,edge))*vOpacity;
        vec3 color=vKind<.45?vec3(.04,.82,1.0):vec3(1.0,.98,.48);
        if(a<.015)discard;gl_FragColor=vec4(color,a);}`
  };
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  class FastLaneRenderer {
    constructor(scene, { assetRoot = '/assets/playable/vfx/' } = {}) {
      this.scene = scene; this.B = global.BABYLON; this.root = assetRoot.replace(/\/?$/, '/');
      this.effects = new Set(); this.textures = []; this.errors = []; this.closed = false; this.ready = false;
      const store = this.B.Effect.ShadersStore;
      store.fastLaneReferenceVertexShader = shaders.vertex;
      store.fastLaneReferenceWallFragmentShader = shaders.wall;
      store.fastLaneReferenceContactFragmentShader = shaders.contact;
      store.fastLaneReferenceOrbFragmentShader = shaders.orb;
      store.fastLaneReferenceDebrisVertexShader = shaders.debrisVertex;
      store.fastLaneReferenceDebrisFragmentShader = shaders.debris;
      this.disposal = scene.onDisposeObservable.add(() => this.dispose());
    }
    async prepare() {
      if (this.ready) return this; if (this.pending) return this.pending;
      this.pending = (async () => {
        try {
          this.cells = await this.texture('neon-caustics.png');
          this.curls = await this.texture('neon-fluid-noise.png');
          this.lightning = await this.texture('Sprinter_Lightning_Beam_Flip01_T.png', true);
          if (this.closed) throw Error('Fast Lane renderer disposed during preparation');
          this.ready = true; return this;
        } catch (error) { this.dispose(); throw error; }
      })(); return this.pending;
    }
    texture(file, atlas = false) {
      const B = this.B; return new Promise((resolve, reject) => {
        const t = new B.Texture(this.root + file, this.scene, atlas, false, atlas ? B.Texture.BILINEAR_SAMPLINGMODE : B.Texture.TRILINEAR_SAMPLINGMODE,
          () => this.closed ? reject(Error('Fast Lane preparation cancelled')) : resolve(t), message => reject(Error(file + ': ' + message)));
        t.gammaSpace = false; t.wrapU = B.Texture.WRAP_ADDRESSMODE; t.wrapV = atlas ? B.Texture.CLAMP_ADDRESSMODE : B.Texture.WRAP_ADDRESSMODE;
        t.onDisposeObservable.add(() => reject(Error('Fast Lane texture disposed'))); this.textures.push(t);
      });
    }
    material(kind) {
      const B = this.B, m = new B.ShaderMaterial('fast_lane_reference_' + kind, this.scene,
        { vertex: kind === 'Debris' ? 'fastLaneReferenceDebris' : 'fastLaneReference', fragment: 'fastLaneReference' + kind },
        {
          attributes: kind === 'Debris' ? ['position', 'uv', 'uv2'] : ['position', 'uv'],
          uniforms: ['worldViewProjection', 'viewProjection', 'time', 'age', 'duration', 'forming', 'wallLength', 'wallHeight', 'enemy', 'variation',
            'cameraRight', 'cameraUp', 'pixelScale', 'power'],
          samplers: kind === 'Wall' ? ['cells', 'curls', 'lightning'] : kind === 'Contact' ? ['cells'] : kind === 'Orb' ? ['curls'] : [],
          needAlphaBlending: true
        });
      m.backFaceCulling = false;
      m.disableDepthWrite = kind !== 'Wall';
      m.alphaMode = (kind === 'Contact' || kind === 'Orb' || kind === 'Debris') ? B.Engine.ALPHA_ADD : B.Engine.ALPHA_COMBINE;
      m.onError = (_effect, message) => this.errors.push(kind + ': ' + message);
      m.metadata = { neonFastLane: true, skillAgent: 'Neon', ownedSkill: true };
      m.setFloat('time', 0); m.setFloat('age', 0); m.setFloat('duration', 5); m.setFloat('forming', .4); m.setFloat('power', 1); m.setFloat('enemy', 0);
      if (kind === 'Wall') { m.setTexture('cells', this.cells); m.setTexture('curls', this.curls); m.setTexture('lightning', this.lightning); }
      if (kind === 'Contact') m.setTexture('cells', this.cells);
      if (kind === 'Orb') m.setTexture('curls', this.curls);
      return m;
    }
    mesh(name, data, material, parent) {
      const B = this.B, mesh = new B.Mesh(name, this.scene); data.applyToMesh(mesh); mesh.material = material; mesh.parent = parent;
      mesh.isPickable = false; mesh.checkCollisions = false; mesh.renderingGroupId = 0;
      mesh.metadata = { neonFastLane: true, skillAgent: 'Neon' }; return mesh;
    }
    trace({ origin, direction, length = 22, width = 3.2, pick, step = .28, maxRise = .8, maxDrop = 3 }) {
      const B = this.B; if (typeof pick !== 'function') throw Error('Fast Lane requires a terrain picker or two explicit profiles');
      const f = new B.Vector3(direction.x, 0, direction.z); if (f.lengthSquared() < .0001) throw Error('Invalid Fast Lane direction'); f.normalize();
      const across = new B.Vector3(f.z, 0, -f.x), profiles = [], count = Math.min(256, Math.ceil(length / step));
      for (const side of [-1, 1]) {
        const points = [], start = origin.add(across.scale(side * width * .5)); let groundY = origin.y, previous = null;
        for (let i = 0; i <= count; i++) {
          const p = start.add(f.scale(i / count * length));
          const hit = pick(new B.Ray(new B.Vector3(p.x, groundY + maxRise, p.z), B.Vector3.Down(), maxRise + maxDrop), true);
          if (!hit?.pickedPoint) break; p.y = hit.pickedPoint.y;
          if (previous && p.y <= groundY + .03) {
            const a = previous.add(new B.Vector3(0, .12, 0)), d = p.add(new B.Vector3(0, .12, 0)).subtract(a), distance = d.length();
            if (distance > .001) { const block = pick(new B.Ray(a, d.scale(1 / distance), distance), false); if (block && block.distance < distance - .01) break; }
          }
          groundY = p.y; points.push(p); previous = p;
        }
        if (points.length < 2) throw Error('No usable Fast Lane ground profile'); profiles.push(points);
      } return { left: profiles[0], right: profiles[1] };
    }
    sampleProfile(points, t) {
      const B = this.B;
      if (!points || !points.length) return B.Vector3.Zero();
      if (t <= 0) return points[0].clone();
      if (t >= 1) return points[points.length - 1].clone();
      const exact = t * (points.length - 1), idx = Math.floor(exact), frac = exact - idx;
      return B.Vector3.Lerp(points[idx], points[Math.min(points.length - 1, idx + 1)], frac);
    }
    spawn(options) {
      if (!this.ready || this.closed) throw Error('Await Fast Lane prepare() first');
      const { height = 3.05, startedAt = 0, duration = 5, forming = .42, enemy = false } = options;
      if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(duration) || duration <= 0) throw Error('Invalid Fast Lane dimensions/time');
      let { left, right } = options; if (!left || !right) ({ left, right } = this.trace(options));
      const B = this.B, root = new B.TransformNode('fast_lane_reference', this.scene), materials = [], profiles = [left, right], debrisPoints = [];
      const leaderOrbs = [];
      try {
        for (const [side, points] of profiles.entries()) {
          const p = [], uv = [], idx = [], floorP = [], floorUV = [], distances = [0]; let length = 0;
          for (let i = 1; i < points.length; i++) { length += B.Vector3.Distance(points[i - 1], points[i]); distances.push(length); }
          if (length < .01) throw Error('Fast Lane profile is too short');
          for (let i = 0; i < points.length; i++) {
            const v = points[i], s = distances[i], u = s / length;
            const crest = height + Math.sin(s * .72) * .045 + Math.sin(s * 1.63 + .4) * .025;
            p.push(v.x, v.y - .035, v.z, v.x, v.y + crest, v.z); uv.push(u, 0, u, 1);
            const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
            const x = dz / n * .28, z = -dx / n * .28;
            floorP.push(v.x - x, v.y + .025, v.z - z, v.x + x, v.y + .025, v.z + z); floorUV.push(u, 0, u, 1);
            if (i < points.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
            if (i % 3 === 0) debrisPoints.push(v);
          }
          const bodyData = new B.VertexData(); bodyData.positions = p; bodyData.uvs = uv; bodyData.indices = idx;
          const bodyMat = this.material('Wall'); bodyMat.setFloat('wallLength', length); bodyMat.setFloat('wallHeight', height);
          bodyMat.setFloat('variation', side * .73 + .21); bodyMat.setFloat('enemy', enemy ? 1 : 0); materials.push(bodyMat);
          this.mesh('fast_lane_blue_volume_' + side, bodyData, bodyMat, root);

          const footData = new B.VertexData(); footData.positions = floorP; footData.uvs = floorUV; footData.indices = idx;
          const footMat = this.material('Contact'); footMat.setFloat('wallLength', length); footMat.setFloat('enemy', enemy ? 1 : 0); materials.push(footMat);
          this.mesh('fast_lane_fine_contact_' + side, footData, footMat, root);

          // Dual leading electric spheres that trace out the parallel walls
          const orbMat = this.material('Orb'); orbMat.setFloat('enemy', enemy ? 1 : 0); materials.push(orbMat);
          const orbMesh = B.MeshBuilder.CreateSphere('fast_lane_leader_orb_' + side, { diameter: .38, segments: 12 }, this.scene);
          orbMesh.material = orbMat; orbMesh.parent = root; orbMesh.isPickable = false;
          orbMesh.metadata = { neonFastLane: true, skillAgent: 'Neon' };
          leaderOrbs.push({ mesh: orbMesh, mat: orbMat, points });
        }
        const pos = [], uv = [], uv2 = [], idx = []; const count = 28;
        for (let i = 0; i < count; i++) {
          const p = debrisPoints[Math.min(debrisPoints.length - 1, Math.floor(i / count * debrisPoints.length))], s = (i * .61803398875) % 1;
          for (let j = 0; j < 4; j++) { pos.push(p.x, p.y + .04, p.z); uv2.push(s, (i * .371) % 1); }
          uv.push(0, 0, 1, 0, 1, 1, 0, 1); const k = i * 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
        }
        const debrisData = new B.VertexData(); debrisData.positions = pos; debrisData.uvs = uv; debrisData.uvs2 = uv2; debrisData.indices = idx;
        const debrisMat = this.material('Debris'); materials.push(debrisMat); const debris = this.mesh('fast_lane_small_fragments', debrisData, debrisMat, root);
        debris.alwaysSelectAsActiveMesh = true;
        const rightVector = new B.Vector3(), upVector = new B.Vector3(); let disposed = false;
        const handle = {
          root,
          dispose: () => {
            if (disposed) return; disposed = true; root.dispose(false, false);
            materials.forEach(m => m.dispose(false, false)); this.effects.delete(handle);
          },
          update: (now, camera) => {
            const age = now - startedAt; root.setEnabled(age >= 0); if (age < 0) return;
            if (age >= duration) { handle.dispose(); return; }
            for (const m of materials) { m.setFloat('time', now); m.setFloat('age', age); m.setFloat('duration', duration); m.setFloat('forming', forming); }
            const travelProgress = clamp(age / Math.max(forming, .001));
            const orbFade = 1 - clamp((age - forming) / .18);
            for (const item of leaderOrbs) {
              item.mesh.setEnabled(orbFade > .01);
              if (orbFade > .01) {
                const pos = this.sampleProfile(item.points, travelProgress);
                item.mesh.position.set(pos.x, pos.y + .95, pos.z);
                item.mesh.scaling.setAll(.85 + .35 * Math.sin(now * 28));
                item.mat.setFloat('power', orbFade);
              }
            }
            if (camera) {
              const world = camera.getWorldMatrix(); B.Vector3.TransformNormalToRef(B.Axis.X, world, rightVector); B.Vector3.TransformNormalToRef(B.Axis.Y, world, upVector);
              debrisMat.setVector3('cameraRight', rightVector.normalize()); debrisMat.setVector3('cameraUp', upVector.normalize());
              debrisMat.setFloat('pixelScale', 2 * Math.tan(camera.fov * .5) / this.scene.getEngine().getRenderHeight());
            }
          }
        };
        this.effects.add(handle); return handle;
      } catch (error) { root.dispose(false, false); materials.forEach(m => m.dispose(false, false)); throw error; }
    }
    update(now, camera = this.scene.activeCamera) {
      if (!this.closed && Number.isFinite(now)) for (const effect of [...this.effects]) effect.update(now, camera);
    }
    dispose() {
      if (this.closed) return; this.closed = true; this.ready = false; this.scene.onDisposeObservable.remove(this.disposal);
      for (const effect of [...this.effects]) effect.dispose(); this.effects.clear(); this.textures.forEach(t => t.dispose()); this.textures = [];
    }
  }
  global.VSNeonFastLane = Object.freeze({ create: (scene, options) => new FastLaneRenderer(scene, options) });
})(globalThis);