'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'val-strike-html/assets/maps/optimized/haven-art'),review=path.join(root,'tools/art-review/haven-gameplay');
function glb(binary,bounds){const doc={asset:{version:'2.0',generator:'Val-Strike Haven exact collision BVH'},buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:12,byteLength:bounds.count*36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:bounds.count*3,type:'VEC3',min:bounds.min,max:bounds.max}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0,extras:{packedFormat:'VSB1'}};let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc(-j.length&3,32)]);const h=Buffer.alloc(20),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+binary.length,8);h.writeUInt32LE(j.length,12);h.write('JSON',16);bh.writeUInt32LE(binary.length);bh.write('BIN\0',4);return Buffer.concat([h,j,bh,binary]);}
(async()=>{
const {MeshoptSimplifier:s}=await import('meshoptimizer');await s.ready;
const bytes=fs.readFileSync(path.join(review,'source-triangles.bin')),source=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),ranges=JSON.parse(fs.readFileSync(path.join(review,'source-ranges.json')));
const pieces=[],surfaces=[];let count=0;
for(let ri=0;ri<ranges.length;ri++){
 const range=ranges[ri],vertices=[],indices=[],lookup=new Map();
 for(let i=range.start*9;i<range.end*9;i+=3){const p=[source[i],source[i+1],source[i+2]],key=p.map(n=>Math.round(n*1e6)).join(',');let id=lookup.get(key);if(id===undefined){id=vertices.length/3;lookup.set(key,id);vertices.push(...p);}indices.push(id);}
 const p=Float32Array.from(vertices),ix=Uint32Array.from(indices);let optimized=ix;
 if(ix.length>=24){[optimized]=s.simplify(ix,p,3,Math.floor(ix.length*.3/3)*3,.00001,['ErrorAbsolute','LockBorder']);}
 const t=new Float32Array(optimized.length*3);for(let i=0;i<optimized.length;i++)t.set(p.subarray(optimized[i]*3,optimized[i]*3+3),i*3);
 const name=range.name,surface=/wood|beam|roof|plank/i.test(name)?'wood':/box|metal|tech|grate|shard/i.test(name)?'metal':'concrete';
 pieces.push(t);surfaces.push({start:count,end:count+t.length/9,name,surface});count+=t.length/9;
 if(ri%1000===0)console.log('Haven exact collision',ri,'/',ranges.length);
}
const supportBytes=fs.readFileSync(path.join(review,'native-support.bin')),support=new Float32Array(supportBytes.buffer,supportBytes.byteOffset,supportBytes.length/4);pieces.push(support);surfaces.push({start:count,end:count+support.length/9,name:'Haven_native_walkable_support',surface:'concrete'});count+=support.length/9;
const triangles=new Float32Array(count*9);let off=0;for(const part of pieces){triangles.set(part,off);off+=part.length;}
const context=vm.createContext({console,BABYLON:require('./node_modules/babylonjs')});vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game/collision-world.js'),'utf8')+';this.World=CollisionWorld;',context);
const world=Object.create(context.World.prototype);world.triangles=triangles;world.order=Uint32Array.from({length:count},(_,i)=>i);world.nodes=[];world.build(0,count,0);
const bounds={min:world.nodes[0].min,max:world.nodes[0].max,count},nodeBounds=new Float32Array(world.nodes.length*6),links=new Int32Array(world.nodes.length*4);
world.nodes.forEach((n,i)=>{nodeBounds.set([...n.min,...n.max],i*6);links.set([n.start,n.end,n.left,n.right],i*4);});const header=Buffer.alloc(12);header.write('VSB1');header.writeUInt32LE(count,4);header.writeUInt32LE(world.nodes.length,8);
const binary=Buffer.concat([header,...[triangles,world.order,nodeBounds,links].map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength))]);fs.writeFileSync(path.join(dir,'collision.glb'),glb(binary,bounds));
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),layout=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/haven-match.json')));
Object.assign(manifest,{version:3,gameFormat:'draco-glb',triangles:manifest.renderTriangles,palette:manifest.atlas,collision:'collision.glb',collisionSurfaces:surfaces,collisionTriangles:count,bounds:{min:bounds.min,max:bounds.max},spawnAnchor:layout.spawn.attack,spawnCandidates:[layout.spawn.attack,layout.spawn.defend,...layout.sites.map(s=>s.position)],transform:{coordinateSpace:'haven-meters-v1',scale:1,pivot:[0,0,0]},material:{doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_specular:{specularFactor:0}}}});
for(const chunk of manifest.chunks){const file=fs.readFileSync(path.join(dir,chunk.file)),doc=JSON.parse(file.subarray(20,20+file.readUInt32LE(12))),a=doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];chunk.min=[-a.max[0],a.min[1],a.min[2]];chunk.max=[-a.min[0],a.max[1],a.max[2]];chunk.material=chunk.layer;chunk.residentBytes=a.count*32+chunk.triangles*3*4;}
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({triangles:count,nodes:world.nodes.length,collisionMiB:fs.statSync(path.join(dir,'collision.glb')).size/1048576}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
