// Authored materials + restored leaf silhouettes. No global decimation pass.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),MAP=path.join(ROOT,'val-strike-html/assets/maps');
const OUT=path.join(MAP,'optimized/abyss-art'),old=JSON.parse(fs.readFileSync(path.join(MAP,'optimized/abyss-stream/manifest.json')));
const art=JSON.parse(fs.readFileSync(path.join(OUT,'art-materials.json'))),settings=JSON.parse(fs.readFileSync(path.join(__dirname,'map-scale.json')));
const vm=require('node:vm'),BABYLON=require(path.join(ROOT,'val-strike-html/assets/vendor/babylon.js'));
const context={BABYLON};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'val-strike-html/game/collision-world.js'),'utf8')+'\nthis.CollisionWorld=CollisionWorld;',context);
const cb=fs.readFileSync(path.join(MAP,'optimized/abyss-stream/collision.glb'));
const packed=cb.buffer.slice(cb.byteOffset,cb.byteOffset+cb.byteLength);
const supports=context.CollisionWorld.fromPacked(packed,28+cb.readUInt32LE(12));
supports.surfaceRanges=old.collisionSurfaces.map(r=>({...r,mesh:{name:r.name,metadata:{surface:r.surface}}}));
const anchorAudit=[];
function anchor(point,kind,name){
 const p=BABYLON.Vector3.FromArray(point),up=BABYLON.Vector3.Up();let hit;
 const structural=h=>!/(?:Plant|Grass|Foliage|Tree|LightShaft|ConeLight)/i.test(h.pickedMesh.name);
 if(kind==='floor') {
  hit=supports.pick(new BABYLON.Ray(p.add(up.scale(.35)),up.scale(-1),.95),true,true).find(structural);
 } else {
  const directions=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
  hit=directions.flatMap(d=>supports.pick(new BABYLON.Ray(p,BABYLON.Vector3.FromArray(d),.6),false,true))
    .filter(structural).sort((a,b)=>a.distance-b.distance)[0];
 }
 if(!hit||BABYLON.Vector3.Distance(p,hit.pickedPoint)>.6){anchorAudit.push({name,kind,root:point,status:'omitted-no-support'});return null;}
 const normal=hit.getNormal(),target=hit.pickedPoint.add(normal.scale(.012));
 const offset=target.subtract(p).asArray();anchorAudit.push({name,kind,root:point,surface:hit.pickedMesh.name,offset,status:'anchored'});return offset;
}
function source(filename){const fd=fs.openSync(filename,'r'),h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);const j=Buffer.alloc(h.readUInt32LE(12));fs.readSync(fd,j,0,j.length,20);return {fd,doc:JSON.parse(j),base:28+j.length};}
function attribute(src,index){const a=src.doc.accessors[index],v=src.doc.bufferViews[a.bufferView],b=Buffer.alloc(v.byteLength);fs.readSync(src.fd,b,0,b.length,src.base+(v.byteOffset||0));
 const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
 const values=new Float32Array(a.count*size);for(let i=0;i<a.count;i++)for(let c=0;c<size;c++)values[i*size+c]=b[method]((a.byteOffset||0)+i*(v.byteStride||size*bytes)+c*bytes)/(a.normalized?({5121:255,5123:65535}[a.componentType]||1):1);
 return {values,size,count:a.count};}
class List{constructor(Type){this.Type=Type;this.data=new Type(1024);this.length=0;}push(...v){if(this.length+v.length>this.data.length){const n=new this.Type(Math.max(this.data.length*2,this.length+v.length));n.set(this.data);this.data=n;}this.data.set(v,this.length);this.length+=v.length;}array(){return this.data.subarray(0,this.length);}}
const tiles=new Map();let triangles=0,restoredLeaves=0,plants=0;
function tileFor(center,layer,scenery=false){const cell=scenery?128:32,key=(scenery?'scenery_':'')+center.map(v=>Math.floor(v/cell)).join('_')+'_'+layer;
 if(!tiles.has(key))tiles.set(key,{key,layer,vertices:new List(Float32Array),indices:new List(Uint32Array),lookup:new Map(),min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});return tiles.get(key);}
function color(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
function triangle(points,normals,uvs,style,ids,scenery=false){
 const center=[0,1,2].map(c=>points.reduce((s,p)=>s+p[c],0)/3),layer=['l','d'].includes(style.mode)?'cutout':'opaque',tile=tileFor(center,layer,scenery);
 const tint=style.mode==='s'||style.mode==='w'?color(style.color):[1,1,1],r=style.rect;
 for(let j=0;j<3;j++){
  const key=ids[j];let idx=tile.lookup.get(key);
  if(idx===undefined){idx=tile.vertices.length/12;tile.lookup.set(key,idx);
   const uv=style.mode==='s'||style.mode==='w'?[2044/2048,2044/2048]:[r[0]+Math.max(0,Math.min(1,uvs[j][0]))*r[2],r[1]+Math.max(0,Math.min(1,uvs[j][1]))*r[3]];
   tile.vertices.push(...points[j],...normals[j],...uv,...tint,1);
   for(let c=0;c<3;c++){tile.min[c]=Math.min(tile.min[c],points[j][c]);tile.max[c]=Math.max(tile.max[c],points[j][c]);}
  }tile.indices.push(idx);
 }triangles++;
}
const src=source(path.join(MAP,'raw/abyss_tex.glb')),node=src.doc.nodes.find(n=>'mesh'in n&&!/sky|dome/i.test(n.name)),mesh=src.doc.meshes[node.mesh],translation=node.translation||[0,0,0];
if(node.rotation||node.scale||node.matrix)throw Error('Expected baked architecture');
for(let pi=0;pi<mesh.primitives.length;pi++){
 const primitive=mesh.primitives[pi],style=art.materials[primitive.material];
 if(style.mode==='l'&&/BeachCabbage|RadPlant|Creeper|MorningGlory|PorcupineParty/.test(style.name))continue;
 // Tree crowns, lily pads and distant foliage keep their source silhouettes,
 // using the individually painted alpha atlas rather than an opaque triangle.
 if(/LightShaft|ConeLight|Glass_Decal|Floater.*EdgeWear/i.test(style.name))continue; // Transparent light/wear overlays are not solid architectural panels.
 const p=attribute(src,primitive.attributes.POSITION),n=attribute(src,primitive.attributes.NORMAL),uv=attribute(src,primitive.attributes.TEXCOORD_0),ind=attribute(src,primitive.indices).values;
 const scenery=/basalt|cliff|cave|vista|terrain|mountain|beach/i.test(style.name)&&!/floor|ground|dirtblend/i.test(style.name);
 for(let k=0;k<ind.length;k+=3){const ids=[ind[k],ind[k+2],ind[k+1]],points=ids.map(i=>[-(p.values[i*3]*settings.geometryScale+translation[0]),p.values[i*3+1]*settings.geometryScale+translation[1],p.values[i*3+2]*settings.geometryScale+translation[2]]);
  triangle(points,ids.map(i=>[-n.values[i*3],n.values[i*3+1],n.values[i*3+2]]),ids.map(i=>[uv.values[i*2],uv.values[i*2+1]]),style,ids.map(i=>pi+':'+i),scenery);
 }
}fs.closeSync(src.fd);
// Original object transforms are retained in the source snapshot. Ground-leaf
// cards keep UVs/shape; nearby plants are deliberately modelled as folded leaves.
const raw=source(path.join(MAP,'raw/abyss_raw.glb')),cache=new Map();
function rawScale(node){const s=node.scale||[1,1,1];return Math.max(...s.map(Math.abs))<.05?s.map(v=>v/.0067138671875):s;}
// The raw snapshot baked the UE centimetre conversion into vertices but also
// retained that conversion in these small-scale nodes. Remove it once.
function transform(v,node,normal=false){const s=rawScale(node),q=node.rotation||[0,0,0,1],t=node.translation||[0,0,0];
 let [x,y,z]=v.map((v,i)=>normal?v/s[i]:v*s[i]);const [qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
 const r=[-(x+qw*tx+qy*tz-qz*ty+(normal?0:t[0])),y+qw*ty+qz*tx-qx*tz+(normal?0:t[1]),z+qw*tz+qx*ty-qy*tx+(normal?0:t[2])];
 if(normal){const len=Math.hypot(...r)||1;return r.map(v=>v/len);}return r;
}
const litterStyle=art.textures['Plant_0_M0_DeadLeaves_DF_png.png'];
for(let ni=0;ni<raw.doc.nodes.length;ni++){
 const node=raw.doc.nodes[ni],name=node.name||'';if(!('mesh'in node))continue;
 const litter=/^Plant_0_GroundLeaves[ABC]/.test(name);
 const living=/^(Plant_0_(Beach|Hanging|Creeper|GroundA|Vine)|Plants_4_|Grass_1_|Plant_3_|Foliage_6_)/.test(name);
 if(!litter&&!living)continue;
 const m=raw.doc.meshes[node.mesh],spec=raw.doc.accessors[m.primitives[0].attributes.POSITION],mn=spec.min,mx=spec.max;
 if(litter){
  const delta=anchor(transform([(mn[0]+mx[0])/2,mn[1],(mn[2]+mx[2])/2],node),'floor',name);if(!delta)continue;
  if(!cache.has(node.mesh))cache.set(node.mesh,m.primitives.map(p=>({p:attribute(raw,p.attributes.POSITION),n:attribute(raw,p.attributes.NORMAL),uv:attribute(raw,p.attributes.TEXCOORD_0),indices:attribute(raw,p.indices).values})));
  for(const item of cache.get(node.mesh))for(let k=0;k<item.indices.length;k+=3){const ids=[item.indices[k],item.indices[k+2],item.indices[k+1]];
   triangle(ids.map(i=>transform([...item.p.values.subarray(i*3,i*3+3)],node).map((v,c)=>v+delta[c])),ids.map(i=>transform([...item.n.values.subarray(i*3,i*3+3)],node,true)),ids.map(i=>[item.uv.values[i*2],item.uv.values[i*2+1]]),litterStyle,ids.map(i=>'l'+ni+':'+i));
  }restoredLeaves++;continue;
 }
 // Eight folded hexagonal blades, a readable low-poly rosette/vine rather
 // than 1,000+ triangles of source plant cards or a flattened triangle blob.
 const hanging=/Hanging|Vine|Creeper/.test(name),radiant=/RadPlant/.test(name),grass=/Grass/.test(name),fern=/Fern/.test(name);
 const style={mode:'s',color:radiant?(/LrgC/.test(name)?'#9277AD':'#5FAF9F'):grass?'#8AAB65':fern?'#7B9B59':'#789C5C'};
 const localScale=rawScale(node).map(v=>Math.max(.00001,Math.abs(v)));
 const spread=radiant?1.1:grass?.55:.75;
 const cx=(mn[0]+mx[0])/2,cz=(mn[2]+mx[2])/2,width=Math.min(spread/localScale[0],Math.max(.08/localScale[0],(mx[0]-mn[0])*.48)),depth=Math.min(spread/localScale[2],Math.max(.08/localScale[2],(mx[2]-mn[2])*.48)),height=Math.min((hanging?3.5:radiant?1.8:1.1)/localScale[1],Math.max(.08/localScale[1],mx[1]-mn[1]));
 const count=grass?7:hanging?12:8;
 const root=[cx,hanging?mx[1]:mn[1]+height*.08,cz];
 const delta=anchor(transform(root,node),hanging?'attachment':'floor',name);if(!delta)continue;
 for(let leaf=0;leaf<count;leaf++){
  const angle=leaf*2.39996,origin=[cx,hanging?mx[1]-height*leaf/count:mn[1]+height*.08,cz];
  const tip=[cx+Math.cos(angle)*width,(hanging?origin[1]-height*.2:mn[1]+height*(.45+(leaf%3)*.25)),cz+Math.sin(angle)*depth];
  const mid=origin.map((v,i)=>(v+tip[i])*.5),side=[-Math.sin(angle)*width*(grass?.07:.28),0,Math.cos(angle)*depth*(grass?.07:.28)];
  const edge=(t,w)=>origin.map((v,i)=>v+(tip[i]-v)*t+side[i]*w);
  // Cabbage/vine leaves have rounded shoulders, unlike pointed grass and
  // radianite blades. The silhouette is modelled, not a triangle-shaped card.
  const outline=grass?[origin,edge(.55,1),tip,edge(.55,-1)]:radiant?[origin,edge(.35,.7),edge(.7,1),tip,edge(.7,-1),edge(.35,-.7)]:[origin,edge(.2,.45),edge(.5,1),edge(.82,.7),tip,edge(.82,-.7),edge(.5,-1),edge(.2,-.45)];
  const center=outline.length,points=[...outline,[mid[0],mid[1]+height*.035,mid[2]]].map(p=>transform(p,node).map((v,c)=>v+delta[c]));
  for(let face=0;face<center;face++){
   const ids=[face,(face+1)%center,center],a=points[ids[0]],b=points[ids[1]],c=points[center],u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...cross)||1,normal=cross.map(v=>v/len);
   triangle(ids.map(i=>points[i]),[normal,normal,normal],[[0,0],[0,0],[0,0]],{...style,color:face%2?style.color:(radiant?'#8CC9B4':'#A0B575')},ids.map(i=>'p'+ni+':'+leaf+':'+face+':'+i));
  }
 }
 if(hanging){
  const half=.012/localScale[0],bottom=mx[1]-height*(count-1)/count;
  for(let axis=0;axis<2;axis++){
   const side=axis===0?[half,0,0]:[0,0,half];
   const line=[[cx-side[0],mx[1],cz-side[2]],[cx+side[0],mx[1],cz+side[2]],[cx+side[0],bottom,cz+side[2]],[cx-side[0],bottom,cz-side[2]]].map(p=>transform(p,node).map((v,c)=>v+delta[c]));
   for(const ids of [[0,1,2],[0,2,3]])triangle(ids.map(i=>line[i]),[[0,0,1],[0,0,1],[0,0,1]],[[0,0],[0,0],[0,0]],{mode:'s',color:'#577660'},ids.map(i=>'stem'+ni+':'+axis+':'+i));
  }
 }plants++;
}fs.closeSync(raw.fd);
fs.writeFileSync(path.join(OUT,'foliage-anchors.json'),JSON.stringify(anchorAudit,null,2));
function glb(tile){const vertices=tile.vertices.array(),indices=tile.indices.array(),h=Buffer.alloc(12);h.write('VSC1');h.writeUInt32LE(vertices.length/12,4);h.writeUInt32LE(indices.length,8);
 const bytes=Buffer.concat([h,Buffer.from(vertices.buffer,vertices.byteOffset,vertices.byteLength),Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength)]);
 const doc={asset:{version:'2.0',generator:'Abyss reviewed art v22'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],buffers:[{byteLength:bytes.length}],bufferViews:[{buffer:0,byteOffset:12,byteLength:vertices.byteLength,byteStride:48,target:34962},{buffer:0,byteOffset:12+vertices.byteLength,byteLength:indices.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/12,type:'VEC3',min:tile.min,max:tile.max},{bufferView:0,byteOffset:12,componentType:5126,count:vertices.length/12,type:'VEC3'},{bufferView:0,byteOffset:24,componentType:5126,count:vertices.length/12,type:'VEC2'},{bufferView:0,byteOffset:32,componentType:5126,count:vertices.length/12,type:'VEC4'},{bufferView:1,componentType:5125,count:indices.length,type:'SCALAR'}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2,COLOR_0:3},indices:4}]}]};
 let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc(-j.length&3,32)]);const gh=Buffer.alloc(20),bh=Buffer.alloc(8);gh.write('glTF');gh.writeUInt32LE(2,4);gh.writeUInt32LE(28+j.length+bytes.length,8);gh.writeUInt32LE(j.length,12);gh.write('JSON',16);bh.writeUInt32LE(bytes.length);bh.write('BIN\0',4);return Buffer.concat([gh,j,bh,bytes]);}
const chunks=[];for(const tile of tiles.values()){const asset=glb(tile),file='cell_'+tile.key+'.glb';fs.writeFileSync(path.join(OUT,file),asset);chunks.push({file,min:tile.min,max:tile.max,bytes:asset.length,triangles:tile.indices.length/3,material:tile.layer});tile.lookup.clear();}
fs.copyFileSync(path.join(MAP,'optimized/abyss-stream/collision.glb'),path.join(OUT,'collision.glb'));
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({...old,version:2,source:'abyss-art-v23',palette:'art-atlas.png',materials:{opaque:{alphaMode:'OPAQUE'},cutout:{alphaMode:'MASK',alphaCutoff:.45}},material:{doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_specular:{specularFactor:0}}},triangles,chunks,art:{reviewedTextures:189,restoredLeafObjects:restoredLeaves,authoredPlants:plants,omittedUnsupported:anchorAudit.filter(a=>a.status.startsWith('omitted')).length,anchorAudit:'foliage-anchors.json',collisionSource:'accepted v19 collision retained'}}));
console.log(JSON.stringify({triangles,restoredLeaves,plants,unsupported:anchorAudit.filter(a=>a.status.startsWith('omitted')).length,chunks:chunks.length,geometryMB:chunks.reduce((s,c)=>s+c.bytes,0)/1048576,rssMB:process.memoryUsage().rss/1048576}));
