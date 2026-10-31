// Shared by gameplay and the asset viewer so both use the same Haven lighting.
window.VSMapPresentation = {
  haven(scene, ambient) {
    const B = BABYLON;
    scene.clearColor = new B.Color4(.69, .76, .79, 1);
    scene.imageProcessingConfiguration.exposure = 1;
    scene.imageProcessingConfiguration.contrast = 1.12;
    ambient.intensity = .55;
    ambient.diffuse = new B.Color3(.92, .96, 1);
    ambient.groundColor = new B.Color3(.38, .35, .31);
    const sun = new B.DirectionalLight('haven_sun', new B.Vector3(-.506, -.814, -.285), scene);
    sun.position.set(109.5, 209.5, -18.75);
    sun.intensity = 1.65;
    sun.autoCalcShadowZBounds = true;
    const shadows = new B.ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = scene.getEngine().webGLVersion >= 2;
    shadows.filteringQuality = VSRenderPerformance.profile().shadowQuality;
    // The whole-map depth range needs enough bias to avoid self-shadow bands
    // on large planar floors. Contact shading preserves the nearby creases.
    shadows.bias = .002;
    shadows.normalBias = .1;
    // Roofs and walls contain single sided planes; back-face-only shadows lose them.
    shadows.forceBackFacesOnly = false;
    shadows.getShadowMap().refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
    return shadows;
  },

  cameras(scene, map, config = {}) {
    const B = BABYLON, attached = new Set();
    let contact;const profile=VSRenderPerformance.profile();
    if (map === 'haven' && profile.contact && config.mapContactShadows !== false && B.SSAO2RenderingPipeline.IsSupported) {
      // A dedicated world buffer avoids compiling MRT variants for every
      // character/VFX material and keeps camera-relative hands out of map AO.
      const geometry=scene._mapContactGeometry=scene.enableGeometryBufferRenderer(profile.geometryRatio);
      if(geometry)contact = new B.SSAO2RenderingPipeline('haven_contact_shadows', scene, { ssaoRatio: profile.ssaoRatio, blurRatio: profile.blurRatio }, [], geometry);
      if(geometry){
      geometry.getGBuffer().renderParticles=false;geometry.getGBuffer().renderSprites=false;
      geometry.renderList = scene.meshes.filter(mesh => mesh.metadata?.streamedWorld);
      // Explicit RTT lists bypass scene frustum culling. Filter map candidates
      // for this camera/pass while retaining all off-screen shadow casters.
      const visible=[];geometry.getGBuffer().getCustomRenderList=(face,list,length)=>{
        visible.length=0;const planes=scene.frustumPlanes,camera=scene.activeCamera;
        for(let i=0;i<length;i++){const mesh=list[i];if(mesh?.metadata?.streamedWorld&&mesh.isEnabled()&&mesh.isVisible&&(!camera||(mesh.layerMask&camera.layerMask)!==0)&&(!planes||mesh.isInFrustum(planes)))visible.push(mesh);}
        if(window.__vsRenderStats){window.__vsRenderStats.aoCandidates=length;window.__vsRenderStats.aoSubmitted=visible.length;}return visible;
      };
      contact.samples = profile.samples;
      contact.bilateralSamples=profile.bilateralSamples;
      contact.radius = .65;
      contact.totalStrength = .85;
      contact.base = .15;
      contact.maxZ = 500;
      contact.expensiveBlur = profile.expensiveBlur;
      }
    }
    const attach = () => {
      const camera = scene.activeCamera;
      if (!camera || camera.name === 'stream_prime' || attached.has(camera)) return;
      attached.add(camera);
      camera.maxZ = map === 'haven' ? 700 : camera.maxZ;
      if (contact) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(contact.name, camera, true);
      // Attach after contact shading, including follow/spectator cameras.
      new B.FxaaPostProcess('map_edge_antialiasing', 1, camera);
    };
    const observer = scene.onActiveCameraChanged.add(attach);
    attach();
    scene.onDisposeObservable.addOnce(() => {
      scene.onActiveCameraChanged.remove(observer);
      attached.clear();
      contact?.dispose();
    });
  }
};
