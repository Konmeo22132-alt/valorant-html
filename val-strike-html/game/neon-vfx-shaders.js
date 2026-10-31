// Neon visual reconstruction, using native beam, flow, curl and caustic data.
// Loaded explicitly by Neon/the isolated art preview, not by the live game yet.
(function (global) {
  'use strict';
  const vertex = `precision highp float;
    attribute vec3 position;attribute vec2 uv;
    uniform mat4 worldViewProjection;varying vec2 vUV;
    void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
  const noise = `
    float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float field(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
        mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
    vec3 electricColor(float core,float warmth){
      vec3 blue=vec3(.015,.25,.98),cyan=vec3(.04,.88,1.0),hot=vec3(.95,1.0,.55);
      return mix(mix(blue,cyan,clamp(core*1.8,0.0,1.0)),hot,clamp(warmth,0.0,1.0));}`;
  const atlas = `
    uniform sampler2D boltTexture;uniform sampler2D glowTexture;
    uniform float clock;uniform float seed;uniform float depleted;
    // Eight native rows, one column. Half-texel guards keep adjacent rows out.
    // Interpolate frames rather than cross-fading the whole mesh on the CPU.
    vec4 beamSample(sampler2D tex,vec2 p){
      float frame=clock*24.0+seed*8.0,a=mod(floor(frame),8.0),b=mod(a+1.0,8.0);
      float y=clamp(p.y,0.004,0.996);
      vec4 x=texture2D(tex,vec2(p.x,(a+y)/8.0));
      vec4 z=texture2D(tex,vec2(p.x,(b+y)/8.0));return mix(x,z,fract(frame));}
    vec3 beamColor(float core){
      vec3 c=mix(vec3(.015,.24,1.0),vec3(.02,.9,1.0),clamp(core*2.0,0.0,1.0));
      c=mix(c,vec3(.96,1.0,.12),smoothstep(.4,.78,core));
      c=mix(c,vec3(1.0,1.0,.86),smoothstep(.83,1.0,core));
      return mix(c,vec3(1.0,.416101,.048028),depleted*.85);}`;
  global.VSNeonVFXShaders = Object.freeze({
    surfaceVertex: vertex,
    beamVertex: `precision highp float;attribute vec3 position;attribute vec2 uv;
      uniform mat4 viewProjection;uniform vec3 beamFrom;uniform vec3 beamTo;
      uniform vec3 eye;uniform float beamWidth;varying vec2 vUV;
      void main(){vUV=uv;vec3 d=beamTo-beamFrom;float len=max(length(d),.0001);
        d/=len;vec3 facing=eye-(beamFrom+beamTo)*.5;vec3 side=cross(d,facing);
        if(dot(side,side)<.000001)side=cross(d,abs(d.y)<.9?vec3(0,1,0):vec3(1,0,0));
        side=normalize(side);vec3 p=mix(beamFrom,beamTo,uv.x)+side*(uv.y-.5)*beamWidth;
        gl_Position=viewProjection*vec4(p,1.0);}`,
    beamFragment: `precision highp float;varying vec2 vUV;
      uniform float opacity;uniform float tiling;${atlas}
      void main(){vec2 p=vec2(vUV.x*tiling-clock*.4,vUV.y);
        vec4 packed=beamSample(boltTexture,p);
        float bolt=packed.r,glow=beamSample(glowTexture,p).r;
        float ends=smoothstep(0.0,.022,vUV.x)*(1.0-smoothstep(.97,1.0,vUV.x));
        float core=pow(max(bolt,0.0),.8),branch=packed.g*.32;
        float alpha=clamp(core+glow*.44+branch*.4,0.0,1.0)*opacity*ends;
        if(alpha<.008)discard;vec3 color=beamColor(core)+vec3(.015,.12,.24)*glow;
        gl_FragColor=vec4(color,alpha);}`,
    trailVertex: `precision highp float;attribute vec3 position;attribute vec2 uv;attribute vec2 uv2;
      uniform mat4 worldViewProjection;varying vec2 vUV;varying float vBorn;
      void main(){vUV=uv;vBorn=uv2.x;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    trailFragment: `precision highp float;varying vec2 vUV;varying float vBorn;
      uniform float opacity;uniform float trailLife;${atlas}
      void main(){float age=max(0.0,clock-vBorn);float fade=1.0-smoothstep(trailLife*.2,trailLife,age);
        float edge=pow(max(0.0,1.0-abs(vUV.y*2.0-1.0)),1.6);
        float bolt=beamSample(boltTexture,vec2(vUV.x,vUV.y)).r;
        float alpha=(edge*.32+bolt*.55)*fade*opacity;
        if(alpha<.008)discard;gl_FragColor=vec4(beamColor(bolt),alpha);}`,
    fingerVertex: `precision highp float;attribute vec3 position;attribute vec2 uv;
      uniform mat4 viewProjection;uniform vec3 eyeRight;uniform vec3 eyeUp;uniform vec3 eye;uniform float glowSize;uniform float surfaceBias;
      varying vec2 vUV;
      void main(){vUV=uv;vec3 toward=eye-position;toward/=max(length(toward),.0001);
        vec3 p=position+toward*surfaceBias+(eyeRight*(uv.x-.5)+eyeUp*(uv.y-.5))*glowSize;
        gl_Position=viewProjection*vec4(p,1.0);}`,
    fingerFragment: `precision highp float;varying vec2 vUV;uniform float power;uniform float depleted;
      void main(){vec2 p=(vUV-.5)*vec2(2.0,1.4);
        float r=length(vec2(p.x,max(0.0,abs(p.y)-.25)));if(r>1.0)discard;
        float core=1.0-smoothstep(.08,.57,r),halo=pow(max(0.0,1.0-r),1.7);
        vec3 c=mix(vec3(.025,.43,1.0),vec3(.06,.93,1.0),smoothstep(.05,.55,halo));
        c=mix(c,vec3(.96,1.0,.45),core*smoothstep(.12,.9,vUV.y));c=mix(c,vec3(1,.416101,.048028),depleted*.85);
        gl_FragColor=vec4(c,clamp((core*.7+halo*.5)*power,0.0,1.0));}`,
    skinVertex: `precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec4 color;
      uniform mat4 world;uniform mat4 viewProjection;varying vec2 vPower;
      #include<bonesDeclaration>
      void main(){mat4 finalWorld=world;
        #include<bonesVertex>
        vPower=color.rg;gl_Position=viewProjection*finalWorld*vec4(position+normal*.035,1.0);}`,
    skinFragment: `precision highp float;varying vec2 vPower;uniform float power;uniform float depleted;
      void main(){float a=smoothstep(.12,.55,vPower.x)*power;if(a<.008)discard;
        vec3 c=mix(vec3(.005,.68,1),vec3(.18,1,1),smoothstep(.05,.65,vPower.y));
        c=mix(c,vec3(.93,1,.43),smoothstep(.7,.98,vPower.y));c=mix(c,vec3(1,.416101,.048028),depleted*.8);
        gl_FragColor=vec4(c,a);}`,
    // Valorant Q Relay Bolt ground decal: handles both Windup (role < 0.5) and Detonation (role >= 0.5)
    groundFragment: `precision highp float;varying vec2 vUV;
      uniform float clock;uniform float progress;uniform float opacity;uniform float seed;uniform float role;
      uniform sampler2D caustics;${noise}
      void main(){
        vec2 p=(vUV-.5)*2.0;float r=length(p);if(r>1.0)discard;
        float angle=atan(p.y,p.x);
        // Voronoi electric fracture network
        vec2 grid=p*2.6,cell=floor(grid),f=fract(grid);float first=8.0,second=8.0;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
          vec2 o=vec2(float(i),float(j));vec2 point=vec2(hash21(cell+o+seed),hash21(cell+o+31.7+seed));
          float d=length(o+point-f);if(d<first){second=first;first=d;}else second=min(second,d);
        }
        float fracture=1.0-smoothstep(.022,.11,second-first);
        float c=texture2D(caustics,p*.55+seed+vec2(clock*.14,-clock*.09)).r;
        if(role<0.5){
          // WINDUP PHASE: Crisp outer boundary ring + shrinking implosion ring + swirling spokes
          float outerBorder=1.0-smoothstep(.012,.042,abs(r-.96));
          float shrinkRadius=mix(.95,.08,pow(progress,1.35));
          float shrinkRing=1.0-smoothstep(.018,.065,abs(r-shrinkRadius));
          float radialArcs=fracture*smoothstep(shrinkRadius-.25,shrinkRadius+.05,r)*(1.0-smoothstep(.92,.98,r));
          float centerPulse=1.0-smoothstep(.0,.18+progress*.12,r);
          float alpha=(outerBorder*.92+shrinkRing*.85+radialArcs*.55+centerPulse*.6+c*.14)*opacity;
          if(alpha<.007)discard;
          vec3 col=electricColor(outerBorder+shrinkRing+radialArcs,centerPulse+shrinkRing*progress);
          gl_FragColor=vec4(col,clamp(alpha,0.0,1.0));
        }else{
          // DETONATION PHASE: Full concussive ground crater with high-voltage yellow-white veins
          float shockRing=1.0-smoothstep(.02,.08,abs(r-min(1.0,.15+progress*1.6)));
          float outerRim=1.0-smoothstep(.015,.055,abs(r-.96));
          float spokes=fracture*smoothstep(.03,.22,r)*(1.0-smoothstep(.82,1.0,r));
          float flash=pow(max(0.0,1.0-r),3.5)*(1.0-smoothstep(0.0,.45,progress));
          float hot=spokes*smoothstep(.4,.82,c)+flash+shockRing*.85;
          float alpha=(spokes*.95+shockRing*.9+outerRim*.65+flash*.9+c*.22)*opacity*(1.0-smoothstep(.96,1.0,r));
          if(alpha<.007)discard;
          gl_FragColor=vec4(electricColor(spokes+shockRing,hot),clamp(alpha,0.0,1.0));
        }
      }`,
    shockFragment: `precision highp float;varying vec2 vUV;uniform float opacity;
      uniform float clock;uniform float seed;uniform float progress;uniform sampler2D fluidNoise;uniform sampler2D caustics;
      void main(){
        vec2 p=vec2(vUV.x*2.4,vUV.y*.9-clock*1.1)+seed;
        float c=texture2D(caustics,p).r,n=texture2D(fluidNoise,p*1.6+vec2(-clock*.4,clock*.3)).r;
        float arc=smoothstep(.28,.74,c);
        float filament=smoothstep(.48,.53,n)-smoothstep(.61,.67,n);
        float rim=1.0-smoothstep(.0,.35,vUV.y);
        float alpha=(arc*.68+filament*.85+rim*.35)*opacity*(1.0-smoothstep(.68,1.0,vUV.y));
        vec3 color=mix(vec3(.015,.35,1.0),vec3(.05,.94,1.0),arc);
        color=mix(color,vec3(.98,1.0,.35),clamp(filament*1.4+rim*(1.0-progress),0.0,1.0));
        if(alpha<.008)discard;
        gl_FragColor=vec4(color,clamp(alpha,0.0,1.0));
      }`,
    orbFragment: `precision highp float;varying vec2 vUV;uniform float opacity;uniform float clock;
      uniform sampler2D fluidNoise;
      void main(){
        float n=texture2D(fluidNoise,vUV*1.8+vec2(clock*1.4,-clock*1.1)).r;
        float n2=texture2D(fluidNoise,vUV*2.9+vec2(-clock*1.7,clock*.9)).r;
        float plasma=clamp(n*.6+n2*.4,0.0,1.0);
        vec3 color=mix(vec3(.01,.48,1.0),vec3(.12,.95,1.0),smoothstep(.15,.6,plasma));
        color=mix(color,vec3(.95,1.0,.25),smoothstep(.55,.82,plasma));
        color=mix(color,vec3(1.0,1.0,.92),smoothstep(.8,1.0,plasma));
        gl_FragColor=vec4(color,opacity);
      }`,
    coronaVertex: `precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;attribute vec2 uv2;
      uniform mat4 viewProjection;uniform vec3 eye;uniform float beamWidth;varying vec2 vUV;
      void main(){vUV=uv;vec3 side=cross(normal,eye-position);
        if(dot(side,side)<.00001)side=vec3(1,0,0);side=normalize(side);
        vec3 toward=eye-position;toward/=max(length(toward),.0001);
        gl_Position=viewProjection*vec4(position+toward*uv2.x+side*(uv.y-.5)*beamWidth,1.0);}`,
    coronaFragment: `precision highp float;varying vec2 vUV;uniform float power;${atlas}
      void main(){vec4 mask=beamSample(boltTexture,vec2(vUV.x-clock*.14,vUV.y));
        float core=mask.r,alpha=(core*.9+mask.g*.35)*power;
        vec3 c=mix(vec3(.01,.15,1),vec3(.05,.8,1),core);
        c=mix(c,vec3(.75,.95,1),smoothstep(.65,.96,core));
        if(alpha<.008)discard;gl_FragColor=vec4(c,alpha);}`,
    nativeVertex: `precision highp float;attribute vec3 position;attribute vec2 uv;
      #ifdef NEON_VERTEX_ALPHA
        attribute vec4 color;varying float vAlpha;
      #endif
      uniform mat4 worldViewProjection;varying vec2 vUV;
      void main(){vUV=uv;
        #ifdef NEON_VERTEX_ALPHA
          vAlpha=color.a;
        #endif
        gl_Position=worldViewProjection*vec4(position,1.0);}`,
    nativeFragment: `precision highp float;varying vec2 vUV;uniform float opacity;
      uniform float power;uniform float role;${atlas}${noise}
      #ifdef NEON_VERTEX_ALPHA
        varying float vAlpha;
      #endif
      void main(){float alpha=1.0,core=0.0;vec3 color;
        if(role<.5){
          float n=field(vUV*vec2(5,2)+vec2(clock*1.7,-clock*.9));
          float ribbon=1.0-smoothstep(.12,.3,abs(vUV.y-(.5+(n-.5)*.37)));
          float bolt=beamSample(boltTexture,vec2(vUV.x*2.0-clock*.3,vUV.y)).r;
          core=max(bolt,ribbon*.65);alpha=ribbon*.65+bolt*.35;
          color=mix(vec3(.16,.025,.64),vec3(.015,.5,1),ribbon);
          color=mix(color,vec3(.12,.92,1),smoothstep(.45,.88,core));
        }else if(role<1.5){
          // Sprinter_Q_Cylinder: Vertical lightning crown and concussive cylinder burst
          float n=field(vUV*vec2(9.0,3.5)+vec2(clock*2.2,-clock*3.4));
          float bolt=beamSample(boltTexture,vec2(vUV.x*3.0+clock*.45,vUV.y)).r;
          float edge=1.0-smoothstep(.02,.24,vUV.y);
          float flame=smoothstep(.22,.8,n)*(1.0-vUV.y);
          core=max(edge,max(flame,bolt*.85));
          alpha=core*(1.0-smoothstep(.62,1.0,vUV.y));
          color=electricColor(core,edge*.92+bolt*.55);
        }else{
          float bolt=beamSample(boltTexture,vec2(vUV.x-clock*.2,vUV.y)).r;
          float envelope=sin(clamp(vUV.y,0.0,1.0)*3.14159265);
          core=bolt;alpha=(.15+bolt*.85)*envelope;color=beamColor(core);
        }
        #ifdef NEON_VERTEX_ALPHA
          alpha*=vAlpha;
        #endif
        alpha*=opacity*power;if(alpha<.008)discard;
        gl_FragColor=vec4(color,clamp(alpha,0.0,1.0));}`
  });
})(globalThis);