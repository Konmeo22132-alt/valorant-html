// One automatically started preview; detached canvases retain no render loops.
window.__agentViewers=new Set();
window.VSAgentViewer=function(canvas,file,options={}){
  let engine,scene,container,anchor,selected=file,version=0,loading=false,disposed=false,last=0,observer;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
  const status=document.createElement('div');status.className='preview-status';status.setAttribute('role','status');status.textContent='Đang tải nhân vật…';canvas.parentElement.appendChild(status);
  function resize(){if(engine){const limit=options.maxResolution||480;engine.setHardwareScalingLevel(Math.max(1,canvas.clientWidth/limit,canvas.clientHeight/limit));engine.resize();}}
  async function load(){if(loading||disposed||!engine)return;loading=true;let requested;
    try{do{requested=version;const next=await BABYLON.SceneLoader.LoadAssetContainerAsync(options.base||'/assets/agents/',selected,scene);
      if(disposed||requested!==version){next.dispose();continue;}container?.dispose();anchor?.dispose();container=next;next.addAllToScene();
      anchor=new BABYLON.TransformNode('preview_anchor',scene);next.rootNodes.forEach(n=>n.parent=anchor);next.animationGroups.forEach(g=>g.stop());
      const idle=next.animationGroups.find(g=>g.name==='CharSelectIdle'),intro=next.animationGroups.find(g=>g.name==='CharSelectIntro');
      // CharSelect rigs carry a different root offset from their bind pose.
      // Frame the deformed idle mesh, otherwise the character sits below view.
      if(idle&&!options.locked){idle.start(false);idle.pause();idle.goToFrame(idle.from);scene.render();next.meshes.forEach(mesh=>{if(mesh.getTotalVertices?.()>0)mesh.refreshBoundingInfo({applySkeleton:true,applyMorph:true});});}
      anchor.computeWorldMatrix(true);const bounds=anchor.getHierarchyBoundingVectors(true),height=bounds.max.y-bounds.min.y,center=bounds.max.add(bounds.min).scale(.5);
      if(height>.001&&Number.isFinite(height)){const scale=1.8/height;anchor.scaling.setAll(scale);anchor.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);}
      idle?.stop();
      const settle=()=>{if(disposed||container!==next)return;if(idle)idle.start(true);else next.animationGroups.filter(g=>/^(Idle_LB|Idle_UB|FaceIdle_UB)$/.test(g.name)).forEach(g=>g.start(true));};
      if(options.locked){const white=new BABYLON.StandardMaterial('locked_white',scene);white.diffuseColor=new BABYLON.Color3(.88,.88,.88);white.specularColor=BABYLON.Color3.Black();next.meshes.filter(m=>m.getTotalVertices?.()>0).forEach(m=>m.material=white);next.materials.push(white);}
      else if(intro){intro.onAnimationGroupEndObservable.addOnce(settle);intro.start(false);}else settle();
      scene.imageProcessingConfiguration.exposure=1.15;scene.imageProcessingConfiguration.contrast=1.05;
      await scene.whenReadyAsync();if(disposed)return;scene.render();status.hidden=true;resolveReady();
    }while(!disposed&&requested!==version);}catch(error){rejectReady(error);if(!disposed){status.hidden=false;status.textContent='Không tải được model. '+error.message;console.warn('[preview]',error);}}
    finally{loading=false;if(!disposed&&requested!==version)load();}
  }
  const handle={ready,load(next,settings={}){Object.assign(options,settings);selected=next;version++;status.hidden=false;status.textContent='Đang tải nhân vật…';load();},dispose(){if(disposed)return;disposed=true;resolveReady();version++;status.remove();window.removeEventListener('resize',resize);observer?.disconnect();if(engine){engine.stopRenderLoop();container?.dispose();scene?.dispose();engine.dispose();}window.__agentViewers.delete(handle);}};
  try{engine=new BABYLON.Engine(canvas,false,{powerPreference:'low-power',stencil:false,antialias:false},false);resize();scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(0,0,0,0);
    const camera=new BABYLON.ArcRotateCamera('preview_camera',Math.PI/2,1.4,options.radius||3.35,new BABYLON.Vector3(0,options.targetY||.94,0),scene);camera.minZ=.05;
    new BABYLON.HemisphericLight('preview_light',BABYLON.Vector3.Up(),scene).intensity=1.05;
    engine.runRenderLoop(()=>{const now=performance.now();if(disposed||document.hidden||!canvas.isConnected||now-last<1000/(options.maxFPS||20)-.5){if(document.hidden)last=now;return;}scene.animationTimeScale=Math.min(100,now-last||50)/Math.max(1,engine.getDeltaTime());last=now;scene.render();});
    window.addEventListener('resize',resize);if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(canvas);}load();
  }catch(error){rejectReady(error);status.textContent='Không khởi tạo được 3D. '+error.message;engine?.dispose();}
  window.__agentViewers.add(handle);return handle;
};
