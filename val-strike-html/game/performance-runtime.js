// Graphics budgets and passive diagnostics. No gameplay clocks or hitboxes change.
window.VSRenderPerformance=(()=>{
  const profiles={
    high:{geometryRatio:.75,ssaoRatio:.75,blurRatio:1,samples:16,bilateralSamples:16,expensiveBlur:true,contact:true,shadowQuality:1,initialScale:1,minScale:.8},
    balanced:{geometryRatio:.5,ssaoRatio:.5,blurRatio:.5,samples:8,bilateralSamples:8,expensiveBlur:true,contact:true,shadowQuality:2,initialScale:.9,minScale:.65},
    performance:{geometryRatio:.5,ssaoRatio:.5,blurRatio:.5,samples:4,bilateralSamples:4,expensiveBlur:false,contact:false,shadowQuality:2,initialScale:.75,minScale:.6}
  };
  function choice(){return window.VSProfile?.graphics?.()||{quality:'balanced',resolution:'auto'};}
  function profile(){return profiles[choice().quality]||profiles.balanced;}
  function create(engine,scene,config,resize){
    const selection=choice(),quality=profile(),automatic=selection.resolution==='auto';
    let scale=automatic?quality.initialScale:Number(selection.resolution)/100,previous=0,used=0,cursor=0,lastReport=0,cpuSum=0,gpuSum=0,gpuSamples=0,sampleCount=0,lastGPUCount=0,lastResize=0,warmFrames=0;
    const intervals=new Float32Array(240),sorted=[],stats=window.__vsRenderStats={version:60,quality:selection.quality,automatic,gpuTimer:false,renderScale:scale,frameMS:null,p95MS:null,p99MS:null,cpuSubmitMS:null,gpuMS:null,drawCalls:null,aoSubmitted:0,aoCandidates:0};
    let instrumentation=null;
    if(engine.getCaps().timerQuery&&BABYLON.EngineInstrumentation){
      try{instrumentation=new BABYLON.EngineInstrumentation(engine);instrumentation.captureGPUFrameTime=true;stats.gpuTimer=true;}catch(error){instrumentation?.dispose();instrumentation=null;stats.gpuTimer=false;}
    }
    function gpuSample(){const counter=instrumentation?.gpuFrameTimeCounter;if(!counter)return;const count=counter.count??counter._totalValueCount;
      if(count===lastGPUCount||!Number.isFinite(count))return;lastGPUCount=count;const value=counter.current/1e6;if(Number.isFinite(value)&&value>.01&&value<250){gpuSum+=value;gpuSamples++;}}
    const api={
      scale:()=>scale,
      reset(){previous=0;used=cursor=cpuSum=gpuSum=gpuSamples=sampleCount=warmFrames=0;lastReport=performance.now();},
      begin(now){if(!window.__gamePlaying){api.reset();return;}if(previous){intervals[cursor++%intervals.length]=Math.min(1000,now-previous);used=Math.min(intervals.length,used+1);}previous=now;},
      end(cpuMS){if(!window.__gamePlaying)return;cpuSum+=cpuMS;sampleCount++;warmFrames++;gpuSample();const now=performance.now();if(now-lastReport<1500||sampleCount<20)return;
        sorted.length=used;let total=0;for(let i=0;i<used;i++){sorted[i]=intervals[i];total+=intervals[i];}sorted.sort((a,b)=>a-b);
        const cpu=cpuSum/sampleCount,gpu=gpuSamples>=5?gpuSum/gpuSamples:null;
        Object.assign(stats,{frameMS:used?total/used:null,p95MS:used?sorted[Math.floor((used-1)*.95)]:null,p99MS:used?sorted[Math.floor((used-1)*.99)]:null,cpuSubmitMS:cpu,gpuMS:gpu,renderScale:scale,renderWidth:engine.getRenderWidth(),renderHeight:engine.getRenderHeight(),drawCalls:engine._drawCalls?.current??null});
        // Adapt only with valid asynchronous GPU measurements. CPU stalls alone
        // must not blur the image. The automatic mode targets up to 60 FPS;
        // the user's independent render cap remains selectable through 240.
        if(automatic&&gpu!==null&&warmFrames>90&&now-lastResize>2500){
          const budget=1000/Math.min(60,Math.max(20,config.maxFPS||60));let next=scale;
          if(gpu>budget*.96&&cpu<budget*.85)next=Math.max(quality.minScale,scale-.08);
          else if(gpu<budget*.6&&cpu<budget*.8&&now-lastResize>6000)next=Math.min(1,scale+.04);
          if(Math.abs(next-scale)>.005){scale=next;lastResize=now;resize();stats.renderScale=scale;}
        }
        cpuSum=gpuSum=gpuSamples=sampleCount=0;lastReport=now;
      },
      dispose(){instrumentation?.dispose();}
    };
    scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
  }
  return{profile,choice,create};
})();
