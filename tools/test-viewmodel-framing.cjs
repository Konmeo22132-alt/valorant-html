// CPU projection of the actual skinned viewmodel: no browser or WebGL context.
const { harness } = require('./test-ingame.cjs');
const B = require('babylonjs'); require('babylonjs-loaders');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
B.SceneLoader.OnPluginActivatedObservable.add(plugin => { plugin.skipMaterials = true; });
const original = B.SceneLoader.LoadAssetContainerAsync;
B.SceneLoader.LoadAssetContainerAsync = (root, file, scene) => original.call(B.SceneLoader, '',
  'data:;base64,' + fs.readFileSync(path.join(__dirname, '../val-strike-html/assets/weapons', file)).toString('base64'), scene, undefined, '.glb');
async function ready(h, name) {
  for (let i=0;i<500;i++) {
    if (h.w.__viewmodelStatus?.weapon===name && h.w.__viewmodelStatus?.state==='ready') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error(JSON.stringify(h.w.__viewmodelStatus));
}
(async()=>{
  const h=harness(undefined,true), captures=[];
  try {
    for (const name of h.read('Object.keys(weaponDefs())')) {
      h.read(`weaponSwitch('${name}')`);await ready(h,name);h.frame(100);h.read('weaponResetRig();weaponAnimation=null');
      const poses=['idle',...(['Classic','Vandal','Melee','Odin'].includes(name)?['inspect','fire']:[])];
      for (const pose of poses) {
        if (pose!=='idle') h.read(`weaponPlayAnimation('${pose}',1000);weaponAnimation.group.goToFrame(weaponAnimation.group.from+(weaponAnimation.group.to-weaponAnimation.group.from)*${pose==='inspect'?.5:.25});`);
        // Babylon syncs linked transform nodes into skeletons during render.
        // Freeze the gameplay observer so it cannot replace the sampled pose.
        h.read('window.__gamePlaying=false;scene.render();window.__gamePlaying=true');
        const data=h.read(`(()=>{
          camera.computeWorldMatrix(true);scene.updateTransformMatrix(true);
          const viewport=new BABYLON.Viewport(0,0,640,400),polygons=[];let visible=0,vertices=0;
          const bounds=[Infinity,Infinity,-Infinity,-Infinity];
          for(const mesh of weaponAssetContainer.meshes){
            if(!mesh.getTotalVertices())continue;mesh.computeWorldMatrix(true);mesh.skeleton?.prepare(true);
            const positions=mesh.getPositionData(true,false),indices=mesh.getIndices(),points=[];
            for(let i=0;i<positions.length;i+=3){
              const point=BABYLON.Vector3.Project(BABYLON.Vector3.FromArray(positions,i),mesh.getWorldMatrix(),scene.getTransformMatrix(),viewport);
              points.push(point);vertices++;if(point.z>0&&point.z<1&&point.x>=0&&point.x<=640&&point.y>=0&&point.y<=400)visible++;
              bounds[0]=Math.min(bounds[0],point.x);bounds[1]=Math.min(bounds[1],point.y);bounds[2]=Math.max(bounds[2],point.x);bounds[3]=Math.max(bounds[3],point.y);
            }
            for(let i=0;i<indices.length;i+=3){
              const triangle=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];
              if(triangle.some(p=>p.z<=0||p.z>=1)||triangle.every(p=>p.x<0||p.x>640||p.y<0||p.y>400))continue;
              polygons.push({points:triangle.map(p=>[p.x,p.y]),depth:triangle.reduce((n,p)=>n+p.z,0)/3,arms:mesh.name==='arms_mesh'});
            }
          }
          return {visible,vertices,bounds,polygons:polygons.sort((a,b)=>b.depth-a.depth)};
        })()`);
        assert.ok(data.bounds.every(Number.isFinite),name+' '+pose+' finite projection');
        if(pose==='idle') assert.ok(data.visible/data.vertices>0.04,name+' idle gun must be visible');
        console.log(JSON.stringify({name,pose,visible:data.visible,vertices:data.vertices,bounds:data.bounds.map(Math.round)}));
        if(['Classic','Vandal','Melee','Odin'].includes(name)) captures.push({name,pose,...data});
        h.read('weaponResetRig();weaponAnimation=null');
      }
    }
    const output=path.join(__dirname,'.artifacts');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'viewmodel-projection.json'),JSON.stringify(captures));
    console.log('PASS CPU projection of 19 skinned viewmodels; diagnostic is geometry only, not WebGL/material validation');
  } finally {h.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
