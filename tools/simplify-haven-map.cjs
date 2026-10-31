// Appearance-aware render simplification, with absolute error and locked borders.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'val-strike-html/assets/maps/optimized/haven-art');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))),styles=JSON.parse(fs.readFileSync(path.join(out,'material-styles.json'))).materials;
const pack=(file,doc,pieces)=>{let bin=Buffer.concat(pieces);bin=Buffer.concat([bin,Buffer.alloc(-bin.length&3)]);doc.buffers=[{byteLength:bin.length}];let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc(-j.length&3,32)]);const h=Buffer.alloc(20),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.write('JSON',16);bh.writeUInt32LE(bin.length);bh.write('BIN\0',4);fs.writeFileSync(file,Buffer.concat([h,j,bh,bin]));};
(async()=>{
 const d=await require('draco3d').createDecoderModule({}),{MeshoptSimplifier:s}=await import('meshoptimizer');await s.ready;
 const files=[...manifest.chunks.map(c=>c.file),'haven_lowpoly.glb'];let processed=0;const audit=[];
 for(const filename of files){
  const file=path.join(out,filename),bytes=fs.readFileSync(file),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
  assert(doc.extensionsRequired?.includes('KHR_draco_mesh_compression'),'Input must be compressed: '+filename);
  const pieces=[],views=[];let offset=0;
  const append=(data,target)=>{const pad=Buffer.alloc(-offset&3);pieces.push(pad);offset+=pad.length;const v={buffer:0,byteOffset:offset,byteLength:data.length};if(target)v.target=target;views.push(v);pieces.push(data);offset+=data.length;return views.length-1;};
  const images=(doc.images||[]).map(image=>image.bufferView===undefined?image:{bufferView:append(fs.readFileSync(path.join(out,'haven-atlas.png'))),mimeType:'image/png'});
  for(const mesh of doc.meshes)for(const p of mesh.primitives){
   const ext=p.extensions.KHR_draco_mesh_compression,v=doc.bufferViews[ext.bufferView],data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),decoder=new d.Decoder(),buffer=new d.DecoderBuffer(),m=new d.Mesh();buffer.Init(data,data.length);const status=decoder.DecodeBufferToMesh(buffer,m);assert(status.ok());
   const n=m.num_points(),arrays={};
   for(const [name,id]of Object.entries(ext.attributes)){const values=new d.DracoFloat32Array(),attribute=decoder.GetAttributeByUniqueId(m,id);decoder.GetAttributeFloatForAllPoints(m,attribute,values);arrays[name]=Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));d.destroy(values);}
   const indices=new Uint32Array(m.num_faces()*3),face=new d.DracoInt32Array();for(let i=0;i<m.num_faces();i++){decoder.GetFaceFromMesh(m,i,face);for(let k=0;k<3;k++)indices[i*3+k]=face.GetValue(k);}
   const originalFaces=m.num_faces(),pos=arrays.POSITION,norm=arrays.NORMAL,uv=arrays.TEXCOORD_0;
   for(let i=0;i<n;i++){
    const slot=Math.floor(uv[i*2]*2048/64)+Math.floor(uv[i*2+1]*1024/64)*32,style=styles[slot];
    if(style?.mode==='solid'){uv[i*2]=style.center[0];uv[i*2+1]=1-style.center[1];}
   }
   // Weld complete identical vertices after removing obsolete solid-color UVs.
   const lookup=new Map(),remap=new Uint32Array(n),pv=[],av=[];
   for(let i=0;i<n;i++){
    const values=[...pos.subarray(i*3,i*3+3),...norm.subarray(i*3,i*3+3),...uv.subarray(i*2,i*2+2)],key=values.map((x,k)=>Math.round(x*(k<3?1e5:k<6?1e4:1e6))).join(',');let index=lookup.get(key);
    if(index===undefined){index=pv.length/3;lookup.set(key,index);pv.push(...values.slice(0,3));av.push(...values.slice(3));}remap[i]=index;
   }
   const positions=Float32Array.from(pv),attributes=Float32Array.from(av),welded=Uint32Array.from(indices,i=>remap[i]);
   const [result,error]=s.simplifyWithAttributes(welded,positions,3,attributes,5,[.5,.5,.5,128,128],null,Math.floor(indices.length*.45/3)*3,.015,['ErrorAbsolute','LockBorder','Permissive']);
   assert(error<=.015001);assert(result.length>0);
   // Compact all vertex attributes, preserving the actual existing positions.
   const used=new Map(),verts=[],atts=[],ix=new Uint32Array(result.length);
   for(let i=0;i<result.length;i++){const old=result[i];let index=used.get(old);if(index===undefined){index=used.size;used.set(old,index);verts.push(...positions.subarray(old*3,old*3+3));atts.push(...attributes.subarray(old*5,old*5+5));}ix[i]=index;}
   const vp=Float32Array.from(verts),va=Float32Array.from(atts),vn=Float32Array.from({length:used.size*3},(_,i)=>va[Math.floor(i/3)*5+i%3]),vu=Float32Array.from({length:used.size*2},(_,i)=>va[Math.floor(i/2)*5+3+i%2]);
   for(const [name,a]of Object.entries({POSITION:vp,NORMAL:vn,TEXCOORD_0:vu})){const spec=doc.accessors[p.attributes[name]];spec.bufferView=append(Buffer.from(a.buffer),34962);spec.componentType=5126;spec.count=used.size;delete spec.normalized;if(name==='POSITION'){spec.min=[0,1,2].map(k=>{let x=Infinity;for(let i=k;i<a.length;i+=3)x=Math.min(x,a[i]);return x;});spec.max=[0,1,2].map(k=>{let x=-Infinity;for(let i=k;i<a.length;i+=3)x=Math.max(x,a[i]);return x;});}}
   const ia=doc.accessors[p.indices];ia.bufferView=append(Buffer.from(ix.buffer),34963);ia.componentType=5125;ia.count=ix.length;delete p.extensions;
   audit.push({file:filename,mesh:mesh.name,before:originalFaces,after:ix.length/3,appearanceError:error});
   for(const object of [decoder,buffer,m,face])d.destroy(object);
  }
  doc.bufferViews=views;doc.images=images;delete doc.extensionsUsed;delete doc.extensionsRequired;pack(file,doc,pieces);
  const chunk=manifest.chunks.find(c=>c.file===filename);if(chunk)chunk.triangles=doc.meshes.reduce((a,m)=>a+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
  if(++processed%25===0)console.log('Haven simplify',processed,'/',files.length);
 }
 manifest.renderTriangles=manifest.chunks.reduce((n,c)=>n+c.triangles,0);delete manifest.compression;manifest.uvConvention='glTF top-left';
 manifest.simplification={algorithm:'meshoptimizer attributes + locked borders',targetRatio:.45,absoluteErrorLimit:.015,maxAppearanceError:Math.max(...audit.map(x=>x.appearanceError)),normalWeight:.5,uvWeight:128,originalCollisionRetained:true};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(root,'tools/art-review/haven-source/simplification.json'),JSON.stringify(audit,null,2));console.log('Haven simplified render triangles',manifest.renderTriangles);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
