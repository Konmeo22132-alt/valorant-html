'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),B=require('./node_modules/babylonjs');
const root=path.resolve(__dirname,'..'),{loadWorld,config}=require('../server/world.cjs'),world=loadWorld(),stairs=world.collision.supplement;
assert.equal(stairs.surfaceRanges.length,13);
const results=[];let restored=0;
for(const range of stairs.surfaceRanges){let supported=0,missing=0,maxDelta=0;
 for(let i=range.start;i<range.end;i++){
  const a=B.Vector3.FromArray(stairs.triangles,i*9),b=B.Vector3.FromArray(stairs.triangles,i*9+3),c=B.Vector3.FromArray(stairs.triangles,i*9+6),normal=B.Vector3.Cross(b.subtract(a),c.subtract(a)).normalize();
  if(Math.abs(normal.y)<.98)continue;
  const point=a.add(b).add(c).scale(1/3),ray=new B.Ray(point.add(new B.Vector3(0,.04,0)),B.Vector3.Down(),.08);
  const extra=stairs.pick(ray,true);assert(extra&&Math.abs(extra.pickedPoint.y-point.y)<.025,'restored source face must be pickable');supported++;
  const supplement=world.collision.supplement;world.collision.supplement=null;const old=world.collision.pick(ray,true);world.collision.supplement=supplement;
  if(!old){missing++;restored++;}else maxDelta=Math.max(maxDelta,Math.abs(old.pickedPoint.y-point.y));
 }
 results.push({name:range.name,supported,missingBefore:missing,maxDelta:+maxDelta.toFixed(3)});
}
assert(restored>20,'restore actual holes left by simplified map collision');
const scope={BABYLON:B,console};vm.createContext(scope);for(const name of ['collision-world','actor-motion'])vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game/'+name+'.js'),'utf8'),scope);
scope.mov=config.movement;
vm.runInContext(`const stair=Object.create(CollisionWorld.prototype);stair.triangles=new Float32Array([]);stair.order=new Uint32Array([]);stair.nodes=[];stair.meshes=[{name:'stairs'}];
const faces=[];function tri(a,b,c){faces.push(...a,...b,...c);}function top(z0,z1,y){tri([-3,y,z0],[3,y,z0],[3,y,z1]);tri([-3,y,z0],[3,y,z1],[-3,y,z1]);}
top(-3,0,0);for(let i=1;i<=10;i++)top((i-1)*.5,i*.5,i*.31);top(5,8,3.1);
stair.triangles=new Float32Array(faces);stair.order=Uint32Array.from({length:faces.length/9},(_,i)=>i);stair.build(0,faces.length/9,0);
function pick(p,d,l,f){return stair.pick(new BABYLON.Ray(p,d,l),f);}
for(const speed of [3,6.75,18]){const actor={feet:new BABYLON.Vector3(0,0,-1),velocity:BABYLON.Vector3.Zero()};let min=100;for(let i=0;i<1200&&actor.feet.z<6;i++){actorStep(actor,new BABYLON.Vector3(0,0,speed),1/240,pick,mov);min=Math.min(min,actor.feet.y);}if(actor.feet.z<6||Math.abs(actor.feet.y-3.1)>.01||min<-.03)throw Error('Stair run failed '+speed+' '+actor.feet);}
const lateral={feet:new BABYLON.Vector3(-1,1.55,2.25),velocity:BABYLON.Vector3.Zero()};for(let i=0;i<120;i++)actorStep(lateral,new BABYLON.Vector3(2,0,0),1/240,pick,mov);if(lateral.feet.y<1.54||lateral.feet.y>1.55+mov.stepHeight+.01)throw Error('Lateral tread support failed '+lateral.feet);
`,scope);
console.log('PASS raw stair support, '+restored+' missing floor samples restored, 31 cm steps at walk/run/dash and lateral movement.');
fs.writeFileSync(path.join(root,'tools/.artifacts/stair-audit.json'),JSON.stringify(results,null,2));
