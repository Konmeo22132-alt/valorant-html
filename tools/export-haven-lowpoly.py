"""Build a spatially batched Haven art GLB from the untouched Blender source.

Conservative planar simplification protects architecture; collapse is limited to
scenery/small props. Original structural triangles are saved separately.
"""
import bpy,bmesh,json,math,hashlib,struct
from pathlib import Path
from collections import defaultdict,Counter
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
MAP=ROOT/'val-strike-html/assets/maps'
OUT=MAP/'optimized/haven-art';REVIEW=ROOT/'tools/art-review/haven-source'
style_list=json.loads((OUT/'material-styles.json').read_text())['materials']
styles={s['name']:s for s in style_list}
BASE={'Triad_Art_A','Triad_Art_Atk','Triad_Art_AtkPathA','Triad_Art_AtkPathB','Triad_Art_AtkPathC','Triad_Art_B','Triad_Art_Basalt','Triad_Art_C','Triad_Art_Def'}
bpy.ops.wm.open_mainfile(filepath=str(MAP/'raw/haven.blend'))
scene=bpy.context.scene
print('HAVEN_FRAME',scene.frame_current,'animated',sum(bool(o.animation_data)for o in bpy.data.objects),flush=True)
source_objects=[o for o in bpy.data.objects if o.type=='MESH']
audit=[];kept=[];seen=set();hashes={}
def fingerprint(mesh):
    if mesh.name in hashes:return hashes[mesh.name]
    verts=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',verts)
    loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops)
    sizes=np.empty(len(mesh.polygons),dtype=np.int32);mesh.polygons.foreach_get('loop_total',sizes)
    slots=np.empty(len(mesh.polygons),dtype=np.int32);mesh.polygons.foreach_get('material_index',slots)
    normals=np.empty(len(mesh.corner_normals)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',normals)
    uv=np.zeros(len(mesh.loops)*2,dtype=np.float32)
    if mesh.uv_layers.active:mesh.uv_layers.active.data.foreach_get('uv',uv)
    digest=hashlib.sha256(verts.tobytes()+loops.tobytes()+sizes.tobytes()+slots.tobytes()+normals.tobytes()+uv.tobytes()).hexdigest();hashes[mesh.name]=digest;return digest
for o in source_objects:
    reason=None
    if not any(c.name in BASE for c in o.users_collection):reason='alternate-or-cinematic-collection'
    elif o.name.startswith(('NEPV','LightShaft','ConeLight')):reason='cinematic-effect'
    elif all(not m or styles[m.name]['mode']=='omit'for m in o.data.materials):reason='non-surface-overlay'
    elif o.name.startswith('Roof_17_CsitePlanks') and min((o.matrix_world@Vector(p)).z for p in o.bound_box)>20:reason='detached-high-roof-debris'
    if not reason:
        key=(fingerprint(o.data),tuple(round(x,6)for row in o.matrix_world for x in row),tuple(m.name if m else ''for m in o.data.materials))
        if key in seen:reason='identical-geometry-transform-material'
        else:seen.add(key)
    if reason:audit.append({'name':o.name,'reason':reason})
    else:kept.append(o)
(REVIEW/'object-filter.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
print('HAVEN_FILTER',len(source_objects),'->',len(kept),dict(Counter(x['reason']for x in audit)),flush=True)

cache={};mesh_audit=[];chunks=defaultdict(list);collision=[];collision_ranges=[];collision_count=0
def mesh_arrays(mesh):
    mesh.calc_loop_triangles()
    v=np.empty((len(mesh.vertices),3),np.float32);mesh.vertices.foreach_get('co',v.ravel())
    lv=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',lv)
    tl=np.empty((len(mesh.loop_triangles),3),np.int32);mesh.loop_triangles.foreach_get('loops',tl.ravel())
    normal=np.empty((len(mesh.corner_normals),3),np.float32);mesh.corner_normals.foreach_get('vector',normal.ravel())
    uv=np.zeros((len(mesh.loops),2),np.float32)
    if mesh.uv_layers.active:mesh.uv_layers.active.data.foreach_get('uv',uv.ravel())
    mi=np.empty(len(mesh.loop_triangles),np.int32);mesh.loop_triangles.foreach_get('material_index',mi)
    return v[lv[tl]],normal[tl],uv[tl],mi
def flower_mesh(original):
    # Native pink cards become a few faceted volumes following their occupied
    # space. This is deterministic and specific to the blossom material.
    p=np.array([v.co[:]for v in original.vertices],dtype=float)
    centers=[p[np.argmax(p[:,2])]]
    for _ in range(4):
        distance=np.min(np.sum((p[:,None,:]-np.array(centers)[None,:,:])**2,axis=2),axis=1)
        centers.append(p[np.argmax(distance)])
    centers=np.array(centers)
    for _ in range(8):
        labels=np.argmin(np.sum((p[:,None,:]-centers[None,:,:])**2,axis=2),axis=1)
        for k in range(5):
            if np.any(labels==k):centers[k]=p[labels==k].mean(0)
    bm=bmesh.new()
    for k,c in enumerate(centers):
        q=p[labels==k]
        if len(q)<3:continue
        extent=np.maximum((q.max(0)-q.min(0))*.46,.15)
        result=bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)
        for v in result['verts']:v.co=Vector(c)+Vector(tuple(v.co[i]*extent[i]for i in range(3)))
    mesh=bpy.data.meshes.new('haven_faceted_blossom');bm.to_mesh(mesh);bm.free()
    mesh.materials.append(original.materials[0]);return mesh
def prototype(o):
    key=o.data.name
    if key in cache:return cache[key]
    original=o.data
    if len(original.materials)==1 and original.materials[0] and styles[original.materials[0].name]['group']=='blossom':
        optimized=flower_mesh(original);method='faceted-blossom-clusters'
    else:
        optimized=original.copy();bm=bmesh.new();bm.from_mesh(optimized)
        # DISSOLVE removes coplanar tessellation only. Material and UV boundaries
        # protect motifs, edges and every non-coplanar stair tread/riser.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        uv_layer=bm.loops.layers.uv.active
        if uv_layer:
            for face in bm.faces:
                mat=original.materials[face.material_index] if face.material_index<len(original.materials)else None
                if mat and styles[mat.name]['mode']=='solid':
                    for loop in face.loops:loop[uv_layer].uv=(0,0)
        bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(.5),verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL','UV'})
        bm.to_mesh(optimized);bm.free();method='planar-dissolve'
        if o.name.startswith(('Basalt_','Rocks_')) and len(optimized.polygons)>200:
            temp=bpy.data.objects.new('haven_scenery_lod',optimized);scene.collection.objects.link(temp)
            mod=temp.modifiers.new('distant_scenery_lod','DECIMATE');mod.ratio=.28
            evaluated=temp.evaluated_get(bpy.context.evaluated_depsgraph_get())
            reduced=bpy.data.meshes.new_from_object(evaluated);bpy.data.objects.remove(temp,do_unlink=True)
            bpy.data.meshes.remove(optimized);optimized=reduced;method='scenery-collapse-28pct'
            for face in optimized.polygons:face.use_smooth=False
    result=mesh_arrays(optimized)
    source_tri=sum(max(0,len(p.vertices)-2)for p in original.polygons)
    mesh_audit.append({'name':key,'exampleObject':o.name,'before':source_tri,'after':len(result[0]),'method':method})
    cache[key]=(result,original)
    bpy.data.meshes.remove(optimized)
    return cache[key]
def transform(points,matrix):return points@matrix[:3,:3].T+matrix[:3,3]
def gltf(points):return points[..., [0,2,1]]*np.array([1,1,-1],np.float32)
for oi,o in enumerate(kept):
    (p,n,uv,mi),original=prototype(o)
    matrix=np.array(o.matrix_world,dtype=np.float32)
    world=gltf(transform(p,matrix));nm=np.linalg.inv(matrix[:3,:3]).T
    normals=gltf(n@nm.T);normals/=np.maximum(np.linalg.norm(normals,axis=2,keepdims=True),1e-12)
    middle=np.array(o.matrix_world.translation);cell=tuple(math.floor(float(v)/24)for v in middle)
    for material_index in np.unique(mi):
        if material_index>=len(original.materials) or not original.materials[material_index]:continue
        style=styles[original.materials[material_index].name]
        if style['mode']=='omit':continue
        mask=mi==material_index;coords=uv[mask].copy()
        if style['mode']=='solid' or style['group']=='blossom':coords[:]=style['center']
        else:
            minimum=coords.min(axis=1);maximum=coords.max(axis=1)
            base=np.floor((minimum+maximum)/2)
            needs=(minimum<-.001)|(maximum>1.001)
            coords-=np.where(needs,base,0)[:,None,:]
            coords=np.clip(coords,0,1)
            r=style['rect'];coords[:,:,0]=r[0]+coords[:,:,0]*r[2];coords[:,:,1]=r[1]+coords[:,:,1]*r[3]
        layer='cutout'if style['mode']=='cutout'and style['group']!='blossom'else'opaque'
        chunks[(cell,layer)].append(np.concatenate((world[mask],normals[mask],coords),axis=2).astype(np.float32))
    # Collision is from the selected ORIGINAL structural geometry, before any
    # render simplification. Foliage, decals, lights and scenery are excluded.
    structural=not o.name.startswith(('Plant','Foliage','Grass','Tree','Basalt','Rocks','Light','Floater','Graffiti','Gravel','Wires','Flag','SmallFlag'))
    if structural:
        sp,_,_,sm=mesh_arrays(original)
        solid=np.array([i<len(original.materials)and original.materials[i]is not None and styles[original.materials[i].name]['mode']not in ('omit','cutout')for i in sm])
        cp=gltf(transform(sp[solid],matrix)).astype('<f4')
        if len(cp):
            collision.append(cp);collision_ranges.append({'name':o.name,'start':collision_count,'end':collision_count+len(cp)})
            collision_count+=len(cp)
    if oi%500==0:print('HAVEN_OBJECT',oi,'/',len(kept),'prototypes',len(cache),flush=True)
(REVIEW/'geometry-optimization.json').write_text(json.dumps(mesh_audit,indent=2),encoding='utf-8')
np.savez_compressed(MAP/'raw/haven-collision-source.npz',triangles=np.concatenate(collision),ranges=json.dumps(collision_ranges))

class Writer:
    def __init__(self):
        self.bin=bytearray();self.doc={'asset':{'version':'2.0','generator':'Val-Strike Haven authored low-poly v1'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'buffers':[],'bufferViews':[],'accessors':[],
        'materials':[{'name':'Haven matte','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}},{'name':'Haven leaf silhouettes','doubleSided':True,'alphaMode':'MASK','alphaCutoff':.45,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}}],
        'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9728,'minFilter':9728,'wrapS':33071,'wrapT':33071}],'images':[]}
    def view(self,data,target=None):
        self.bin+=b'\0'*(-len(self.bin)%4);start=len(self.bin);self.bin+=data
        v={'buffer':0,'byteOffset':start,'byteLength':len(data)}
        if target:v['target']=target
        self.doc['bufferViews'].append(v);return len(self.doc['bufferViews'])-1
    def accessor(self,array,kind,component,bounds=False,normalized=False):
        a={'bufferView':self.view(array.tobytes(),34963 if kind=='SCALAR'else 34962),'componentType':component,'count':len(array),'type':kind}
        if bounds:a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
        if normalized:a['normalized']=True
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def add(self,name,rows,layer):
        rows=np.ascontiguousarray(rows.reshape(-1,8),dtype='<f4')
        unique,indices=np.unique(rows.view(np.dtype((np.void,32))).ravel(),return_inverse=True)
        v=unique.view('<f4').reshape(-1,8);assert len(v)<=60000
        p=self.accessor(v[:,:3].copy(),'VEC3',5126,True)
        n=self.accessor(v[:,3:6].copy(),'VEC3',5126)
        texture_uv=v[:,6:8].copy();texture_uv[:,1]=1-texture_uv[:,1]
        uv=self.accessor(np.round(np.clip(texture_uv,0,1)*65535).astype('<u2'),'VEC2',5123,normalized=True)
        ix=self.accessor(indices.astype('<u2'),'SCALAR',5123)
        self.doc['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':p,'NORMAL':n,'TEXCOORD_0':uv},'indices':ix,'material':0 if layer=='opaque'else 1}]})
        self.doc['nodes'].append({'name':name,'mesh':len(self.doc['meshes'])-1});self.doc['scenes'][0]['nodes'].append(len(self.doc['nodes'])-1)
    def save(self,path,embedded=False):
        if embedded:self.doc['images']=[{'bufferView':self.view((OUT/'haven-atlas.png').read_bytes()),'mimeType':'image/png'}]
        else:self.doc['images']=[{'uri':'haven-atlas.png'}]
        self.bin+=b'\0'*(-len(self.bin)%4);self.doc['buffers']=[{'byteLength':len(self.bin)}]
        j=json.dumps(self.doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
        path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(self.bin))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(self.bin),b'BIN\0')+self.bin)

full=Writer();records=[];total_triangles=0
for (cell,layer),parts in sorted(chunks.items()):
    rows=np.concatenate(parts)
    for part,start in enumerate(range(0,len(rows),20000)):
        data=rows[start:start+20000];name='haven_'+'_'.join(map(str,cell))+'_'+layer+'_'+str(part)
        writer=Writer();writer.add(name,data,layer);file=OUT/(name+'.glb');writer.save(file)
        full.add(name,data,layer)
        record={'file':file.name,'layer':layer,'triangles':len(data),'bytes':file.stat().st_size,'min':data[:,:,:3].min(axis=(0,1)).tolist(),'max':data[:,:,:3].max(axis=(0,1)).tolist()}
        records.append(record);total_triangles+=len(data)
full.save(OUT/'haven_lowpoly.glb',embedded=True)
manifest={'version':1,'map':'haven','source':'assets/maps/raw/haven.blend','coordinateSpace':'glTF right-handed Y-up; source Blender meters unchanged','cellSize':24,
 'sourceObjects':len(source_objects),'selectedObjects':len(kept),'sourceInstancedTriangles':sum(sum(max(0,len(p.vertices)-2)for p in o.data.polygons)for o in source_objects),
 'renderTriangles':total_triangles,'chunks':records,'uvConvention':'glTF top-left','atlas':'haven-atlas.png','atlasBytes':(OUT/'haven-atlas.png').stat().st_size,
 'standalone':'haven_lowpoly.glb','standaloneBytes':(OUT/'haven_lowpoly.glb').stat().st_size,'collisionSource':'raw/haven-collision-source.npz','collisionTriangles':collision_count,
 'excluded':dict(Counter(x['reason']for x in audit)),'geometryPolicy':'Architecture planar dissolve 0.5 degrees, material and painted UV boundaries protected; unused solid-color UV seams removed; distant rocks 28 percent; native blossom cards replaced with faceted crown clusters.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
current_files={r['file']for r in records}|{'haven_lowpoly.glb'}
for previous in OUT.glob('haven_*.glb'):
    if previous.name not in current_files:previous.unlink()
print('HAVEN_EXPORT',json.dumps({k:v for k,v in manifest.items()if k!='chunks'}),flush=True)
