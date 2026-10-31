// Package the actual exported map with the existing local Draco decoder.
// Compression affects render geometry only; the original collision is separate.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'val-strike-html/assets/maps/optimized/haven-art');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))),flip=manifest.uvConvention!=='glTF top-left';
function read(file){const bytes=fs.readFileSync(file),length=bytes.readUInt32LE(12);return {doc:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};}
function save(file,doc,bin){let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc(-j.length&3,32)]);bin=Buffer.concat([bin,Buffer.alloc(-bin.length&3)]);doc.buffers=[{byteLength:bin.length}];j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc(-j.length&3,32)]);const h=Buffer.alloc(20),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.write('JSON',16);bh.writeUInt32LE(bin.length);bh.write('BIN\0',4);fs.writeFileSync(file,Buffer.concat([h,j,bh,bin]));}
function attr(source,index){const a=source.doc.accessors[index],v=source.doc.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3}[a.type],step={5123:2,5125:4,5126:4}[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),read={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],values=new Float32Array(a.count*size);for(let i=0;i<a.count;i++)for(let c=0;c<size;c++)values[i*size+c]=source.bin[read](offset+i*(v.byteStride||size*step)+c*step)/(a.normalized?65535:1);return {values,size,count:a.count};}
(async()=>{
 const d=await require('draco3d').createEncoderModule({}),decode=await require('draco3d').createDecoderModule({});
 const files=[...manifest.chunks.map(c=>c.file),'haven_lowpoly.glb'];let processed=0,decodedTriangles=0,removedDegenerateFaces=0,standaloneTriangles=0;
 for(const filename of files){
  const source=read(path.join(out,filename)),doc=source.doc;
  if(doc.extensionsRequired?.includes('KHR_draco_mesh_compression')){const chunk=manifest.chunks.find(c=>c.file===filename);if(chunk){chunk.bytes=fs.statSync(path.join(out,filename)).size;chunk.triangles=doc.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);}processed++;continue;}
  const pieces=[],views=[];let offset=0;
  const append=bytes=>{const pad=Buffer.alloc(-offset&3);pieces.push(pad);offset+=pad.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});pieces.push(bytes);offset+=bytes.length;return views.length-1;};
  const images=(doc.images||[]).map(image=>{if(image.bufferView===undefined)return image;const v=doc.bufferViews[image.bufferView],data=source.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);return {...image,bufferView:append(data)};});
  for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
   const builder=new d.MeshBuilder(),packed=new d.Mesh(),encoder=new d.Encoder(),result=new d.DracoInt8Array();
   const ix=attr(source,primitive.indices);builder.AddFacesToMesh(packed,ix.count/3,Uint32Array.from(ix.values));
   const ids={};let count,positions;
   for(const [name,index]of Object.entries(primitive.attributes)){
    const item=attr(source,index);count=item.count;
    if(name==='POSITION')positions=item.values;
    if(name==='TEXCOORD_0'&&flip)for(let i=1;i<item.values.length;i+=2)item.values[i]=1-item.values[i];
    const kind={POSITION:d.POSITION,NORMAL:d.NORMAL,TEXCOORD_0:d.TEX_COORD}[name];ids[name]=builder.AddFloatAttributeToMesh(packed,kind,item.count,item.size,item.values);
   }
   encoder.SetSpeedOptions(5,5);encoder.SetAttributeQuantization(d.POSITION,16);encoder.SetAttributeQuantization(d.NORMAL,10);encoder.SetAttributeQuantization(d.TEX_COORD,18);
   const length=encoder.EncodeMeshToDracoBuffer(packed,result);assert(length>0);const bytes=Buffer.alloc(length);for(let i=0;i<length;i++)bytes[i]=result.GetValue(i)&255;
   // Decode every primitive once to verify payload topology and finite data.
   const decoder=new decode.Decoder(),buffer=new decode.DecoderBuffer(),roundtrip=new decode.Mesh();buffer.Init(bytes,bytes.length);const status=decoder.DecodeBufferToMesh(buffer,roundtrip);assert(status.ok(),status.error_msg());
   const removed=ix.count/3-roundtrip.num_faces();
   if(removed){let degenerate=0;for(let i=0;i<ix.count;i+=3){const a=ix.values[i]*3,b=ix.values[i+1]*3,c=ix.values[i+2]*3,ab=[0,1,2].map(k=>positions[b+k]-positions[a+k]),ac=[0,1,2].map(k=>positions[c+k]-positions[a+k]);const area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;if(area<1e-8)degenerate++;}assert(removed>=0&&removed<=degenerate,'Compression removed non-degenerate faces: '+filename);removedDegenerateFaces+=removed;}
   count=roundtrip.num_points();decodedTriangles+=roundtrip.num_faces();
   for(const [name,index]of Object.entries(primitive.attributes)){const a=doc.accessors[index];delete a.bufferView;delete a.byteOffset;delete a.normalized;a.componentType=5126;a.count=count;const at=decoder.GetAttributeByUniqueId(roundtrip,ids[name]),values=new decode.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(roundtrip,at,values);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.size();i++){const value=values.GetValue(i);assert(Number.isFinite(value));if(name==='POSITION'){min[i%3]=Math.min(min[i%3],value);max[i%3]=Math.max(max[i%3],value);}}if(name==='POSITION'){a.min=min;a.max=max;}decode.destroy(values);}
   const indexSpec=doc.accessors[primitive.indices];delete indexSpec.bufferView;delete indexSpec.byteOffset;indexSpec.componentType=count<=65535?5123:5125;indexSpec.count=roundtrip.num_faces()*3;
   primitive.extensions={KHR_draco_mesh_compression:{bufferView:append(bytes),attributes:ids}};
   for(const object of [builder,packed,encoder,result])d.destroy(object);for(const object of [decoder,buffer,roundtrip])decode.destroy(object);
  }
  doc.bufferViews=views;doc.images=images;doc.extensionsUsed=['KHR_draco_mesh_compression'];doc.extensionsRequired=['KHR_draco_mesh_compression'];
  save(path.join(out,filename),doc,Buffer.concat(pieces));
  const chunk=manifest.chunks.find(c=>c.file===filename);if(chunk){chunk.bytes=fs.statSync(path.join(out,filename)).size;chunk.triangles=doc.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);}
  else standaloneTriangles=doc.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
  if(++processed%25===0)console.log('Haven Draco',processed,'/',files.length);
 }
 const current=new Set(files);for(const filename of fs.readdirSync(out))if(/^haven_.*\.glb$/.test(filename)&&!current.has(filename))fs.unlinkSync(path.join(out,filename));
 manifest.renderTriangles=manifest.chunks.reduce((n,c)=>n+c.triangles,0);manifest.uvConvention='glTF top-left';manifest.atlasBytes=fs.statSync(path.join(out,'haven-atlas.png')).size;manifest.compression={extension:'KHR_draco_mesh_compression',positionBits:16,normalBits:10,uvBits:18,decodedTriangles:manifest.renderTriangles+standaloneTriangles,removedDegenerateFaces,localDecoder:'/game/draco/'};
 manifest.standaloneBytes=fs.statSync(path.join(out,'haven_lowpoly.glb')).size;manifest.chunkBytes=manifest.chunks.reduce((n,c)=>n+c.bytes,0);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({triangles:manifest.renderTriangles,chunks:manifest.chunks.length,chunkMB:manifest.chunkBytes/1048576,standaloneMB:manifest.standaloneBytes/1048576,uvCorrected:flip}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
