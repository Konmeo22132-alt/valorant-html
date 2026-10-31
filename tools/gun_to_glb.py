"""Small offline PSK/PSA exporter; no Blender process or GPU allocation.

S0 geometry, skeleton, GN articulation and camera-relative FP weapon motion.
Texture size is capped at 512; no Blender or GPU is required.
Usage: python tools/gun_to_glb.py Classic Vandal (or --all)
"""
import array, hashlib, io, json, math, os, struct, sys
from pathlib import Path
from PIL import Image
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('audit_guns', ROOT / 'tools/audit-guns.py')
audit = module_from_spec(spec); spec.loader.exec_module(audit)
GUNS = audit.GUNS
SOURCES = {
    'Classic': 'Sidearms/BasePistol', 'Shorty': 'Sidearms/Compact', 'Frenzy': 'Sidearms/AutoPistol',
    'Ghost': 'Sidearms/Slim', 'Sheriff': 'Sidearms/Revolver',
    'Stinger': 'SubMachineGuns/Vector', 'Spectre': 'SubMachineGuns/MP5',
    'Bucky': 'Shotguns/PumpShotgun', 'Judge': 'Shotguns/AutoShotgun',
    'Bulldog': 'Rifles/Burst', 'Guardian': 'SniperRifles/DMR', 'Phantom': 'Rifles/Carbine', 'Vandal': 'Rifles/AK',
    'Marshal': 'SniperRifles/Leversniper', 'Outlaw': 'SniperRifles/Doublesniper', 'Operator': 'SniperRifles/Boltsniper',
    'Ares': 'HvyMachineGuns/LMG', 'Odin': 'HvyMachineGuns/HMG', 'Melee': '../Melee'
}

def rigid_inverse(m):
    return [v for row in zip(*[inverse_rigid(m)[i:i+4] for i in range(0,16,4)]) for v in row]

def quaternion(m):
    trace=m[0]+m[5]+m[10]
    if trace>0:
        s=math.sqrt(trace+1)*2; q=[(m[9]-m[6])/s,(m[2]-m[8])/s,(m[4]-m[1])/s,s/4]
    else:
        i=max(range(3),key=lambda j:m[j*5]); j=(i+1)%3; k=(i+2)%3
        s=math.sqrt(max(0,1+m[i*5]-m[j*5]-m[k*5]))*2
        q=[0.,0.,0.,0.]; q[i]=s/4; q[j]=(m[j*4+i]+m[i*4+j])/s; q[k]=(m[k*4+i]+m[i*4+k])/s; q[3]=(m[k*4+j]-m[j*4+k])/s
    return q

def fp_motion(path, camera_inverse=False):
    c=audit.chunks(path); info=struct.unpack_from('<64s64s4i3f3i',c['ANIMINFO'][2])
    size,count,data=c['BONENAMES']; bones=[struct.unpack_from('<64s3i',data,i*size) for i in range(count)]
    names=[b[0].split(b'\0')[0].decode() for b in bones]
    weapon=names.index('R_WeaponMaster'); camera=names.index('Camera'); stride=c['ANIMKEYS'][0]; keys=c['ANIMKEYS'][2]
    needed=set()
    for index in (weapon,camera):
        while index>=0:needed.add(index);index=bones[index][3]
    frames=[]
    for frame in range(info[11]):
        world={}
        for i in sorted(needed):
            b=bones[i]
            key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+i)*stride)
            q=list(key[3:7]); parent=b[3]
            if parent>=0:q[:3]=[-v for v in q[:3]]
            local=matrix(key[:3],q);world[i]=multiply(world[parent],local) if parent>=0 else local
        frames.append(rigid_inverse(world[camera]) if camera_inverse else multiply(rigid_inverse(world[camera]),world[weapon]))
    return info[8],frames

def multiply(a, b):
    return [sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4)) for r in range(4) for c in range(4)]

def matrix(position, q):
    length = math.sqrt(sum(v * v for v in q)); x, y, z, w = [v / length for v in q]
    return [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), position[0],
            2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), position[1],
            2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), position[2], 0, 0, 0, 1]

def inverse_rigid(m):
    out = [0.] * 16
    for r in range(3):
        for c in range(3): out[r*4+c] = m[c*4+r]
        out[r*4+3] = -sum(out[r*4+c] * m[c*4+3] for c in range(3))
    out[15] = 1.
    return [out[r*4+c] for c in range(4) for r in range(4)]

class GLB:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Val-Strike PSK/PSA offline exporter'},
                    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [], 'meshes': [], 'skins': [],
                    'materials': [], 'textures': [], 'images': [], 'animations': [], 'bufferViews': [], 'accessors': []}
    def view(self, data, target=None):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        v = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(data)}
        if target: v['target'] = target
        self.data.extend(data); self.doc['bufferViews'].append(v)
        return len(self.doc['bufferViews']) - 1
    def accessor(self, values, kind, size, target=None, component=5126, bounds=False):
        packed = array.array({5126:'f',5123:'H',5125:'I'}[component], values)
        if sys.byteorder != 'little': packed.byteswap()
        a = {'bufferView': self.view(packed.tobytes(), target), 'componentType': component,
             'count': len(values) // size, 'type': kind}
        if bounds:
            a['min'] = [min(values[c::size]) for c in range(size)]
            a['max'] = [max(values[c::size]) for c in range(size)]
        self.doc['accessors'].append(a); return len(self.doc['accessors']) - 1
    def image(self, path, packing=None):
        with Image.open(path) as src:
            image = src.convert('RGBA' if getattr(self,'preserve_alpha',False) and packing is None else 'RGB')
            limit=getattr(self,'texture_limit',512)
            if limit:image.thumbnail((limit,limit), Image.Resampling.LANCZOS)
            r,g,b=image.convert('RGB').split()
            # Unreal's MRS names the channels Metallic/Roughness/Specular.
            # glTF expects occlusion/Roughness/Metallic, and OpenGL normal Y.
            if packing=='mrs': image=Image.merge('RGB',(Image.new('L',image.size,255),g,r))
            if packing=='mrae': image=Image.merge('RGB',(b,g,r))
            if packing=='normal': image=Image.merge('RGB',(r,g.point(lambda x:255-x),b))
            if packing=='ao': image=Image.merge('RGB',(r,r,r))
            stream = io.BytesIO(); image.save(stream, format='PNG', optimize=True)
        payload=stream.getvalue()
        external=getattr(self,'external_image_folder',None)
        if external:
            external=Path(external);external.mkdir(parents=True,exist_ok=True)
            target=external/(hashlib.sha256(payload).hexdigest()+'.png')
            if not target.exists():target.write_bytes(payload)
            uri=Path(os.path.relpath(target,getattr(self,'external_image_base',external.parent))).as_posix()
            # Babylon's glTF loader rejects parent-directory traversal in URIs.
            # Cross-folder models (e.g. character select) embed their textures;
            # models beside the shared texture directory retain deduplication.
            if '..' in Path(uri).parts:
                self.doc['images'].append({'name':path.stem,'mimeType':'image/png','bufferView':self.view(payload)})
            else:
                self.doc['images'].append({'name':path.stem,'uri':uri})
        else:self.doc['images'].append({'name': path.stem, 'mimeType':'image/png', 'bufferView':self.view(payload)})
        self.doc['textures'].append({'source':len(self.doc['images'])-1})
        return {'index':len(self.doc['textures'])-1}
    def save(self, path):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        self.doc['buffers'] = [{'byteLength':len(self.data)}]
        data = json.dumps(self.doc, separators=(',',':')).encode(); data += b' ' * (-len(data) % 4)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Stream the GLB sections rather than allocating several complete copies.
        with path.open('wb')as stream:
            stream.write(struct.pack('<4sII',b'glTF',2,28+len(data)+len(self.data)))
            stream.write(struct.pack('<I4s',len(data),b'JSON'));stream.write(data)
            stream.write(struct.pack('<I4s',len(self.data),b'BIN\0'));stream.write(self.data)

def append_arms(glb, idle):
    """Use the extracted Reyna 1P mesh, whose 104 animated bones match FP PSA.

    Keep a separate skin and bind matrices; animate full local FP poses, with
    inverse Camera above both mesh and rig so the hands share the gun's camera.
    """
    directory=ROOT/'model/valorant-model-animations-agents/Content/Characters/Vampire/S0/1P'
    source=audit.chunks(directory/'Models/FP_Vampire_S0_Skelmesh.psk')
    def records(key,fmt):
        size,count,data=source[key]
        return [struct.unpack_from(fmt,data,i*size) for i in range(count)]
    points=records('PNTS0000','<3f');wedges=records('VTXW0000','<IffB3x')
    faces=records('FACE0000','<3HBBI');bones=records('REFSKELT','<64s3i7f')
    names=[b[0].split(b'\0')[0].decode() for b in bones]
    weights=[[] for _ in points]
    for weight,point,bone in records('RAWWEIGHTS','<fii'):weights[point].append((bone,weight))
    # Source mesh includes rigid upper-arm/shoulder caps very close to the
    # camera. They can fill the view when aiming a pistol; retain forearms,
    # hands and elbow blends for this first-person viewmodel.
    proximal={i for i,name in enumerate(names) if name in ('Skeleton','Root','L_Clavicle','R_Clavicle',
        'L_Shoulder','R_Shoulder','L_ShoulderPad','R_ShoulderPad')}
    faces=[face for face in faces if not all(sum(w for b,w in weights[wedges[v][0]] if b in proximal)>.95 for v in face[:3])]
    doc=glb.doc;offset=len(doc['nodes']);globals_=[]
    for i,b in enumerate(bones):
        q=list(b[4:8]);length=math.sqrt(sum(v*v for v in q));q=[v/length for v in q]
        if b[3]>=0:q[:3]=[-v for v in q[:3]]
        local=matrix(b[8:11],q);globals_.append(multiply(globals_[b[3]],local) if b[3]>=0 else local)
        doc['nodes'].append({'name':'arms_'+names[i],'translation':list(b[8:11]),'rotation':q,'children':[]})
        if b[3]>=0:doc['nodes'][offset+b[3]]['children'].append(offset+i)
    attributes={'POSITION':[],'NORMAL':[],'TEXCOORD_0':[],'JOINTS_0':[],'WEIGHTS_0':[]}
    source_normals=records('VTXNORMS','<3f')
    for point,u,v,_ in wedges:
        attributes['POSITION'].extend(points[point]);attributes['NORMAL'].extend(source_normals[point]);attributes['TEXCOORD_0'].extend((u,v))
        influence=sorted(weights[point],key=lambda v:-v[1])[:4] or [(0,1.)];total=sum(w for _,w in influence)
        attributes['JOINTS_0'].extend([b for b,_ in influence]+[0]*(4-len(influence)))
        attributes['WEIGHTS_0'].extend([w/total for _,w in influence]+[0.]*(4-len(influence)))
    accessor_map={}
    for key,values in attributes.items():
        size=2 if key=='TEXCOORD_0' else 4 if key in ('JOINTS_0','WEIGHTS_0') else 3
        accessor_map[key]=glb.accessor(values,'VEC'+str(size),size,34962,5123 if key=='JOINTS_0' else 5126,key=='POSITION')
    materials=directory/'Materials'
    material={'name':'FP_Vampire_S0_MI','doubleSided':True,'pbrMetallicRoughness':{'metallicFactor':1,'roughnessFactor':1,
        'baseColorTexture':glb.image(materials/'FP_Vampire_S0_DF.png'),
        'metallicRoughnessTexture':glb.image(materials/'FP_Vampire_S0_MRAE.png','mrs')},
        'normalTexture':glb.image(materials/'FP_Vampire_S0_NM.png','normal')}
    material_index=len(doc['materials']);doc['materials'].append(material)
    skin_index=len(doc['skins']);doc['skins'].append({'name':'arms_rig','joints':list(range(offset,offset+len(bones))),
        'inverseBindMatrices':glb.accessor([v for m in globals_ for v in inverse_rigid(m)],'MAT4',16),'skeleton':offset})
    mesh_index=len(doc['meshes']);doc['meshes'].append({'name':'Reyna_1P_arms','primitives':[{'attributes':accessor_map,
        'indices':glb.accessor([v for face in faces for v in face[:3]],'SCALAR',1,34963,5125),'material':material_index}]})
    mesh_node=len(doc['nodes']);doc['nodes'].append({'name':'arms_mesh','mesh':mesh_index,'skin':skin_index})
    camera_node=len(doc['nodes']);doc['nodes'].append({'name':'arms_camera_inverse','children':[offset,mesh_node]})
    doc['nodes'][0]['children'].append(camera_node)
    # Bake IdlePose as the rest fallback so resetting an action never shows T-pose.
    c=audit.chunks(idle);size,count,data=c['BONENAMES'];lookup={data[i*size:].split(b'\0')[0].decode():i for i in range(count)}
    stride,_,keys=c['ANIMKEYS']
    info=struct.unpack_from('<64s64s4i3f3i',c['ANIMINFO'][2])
    for i,name in enumerate(names):
        if name not in lookup:continue
        key=struct.unpack_from('<7f',keys,(info[10]*info[2]+lookup[name])*stride);q=list(key[3:7])
        if bones[i][3]>=0:q[:3]=[-v for v in q[:3]]
        doc['nodes'][offset+i].update(translation=list(key[:3]),rotation=q)
    pose=fp_motion(idle,True)[1][0]
    doc['nodes'][camera_node].update(translation=[pose[i] for i in (3,7,11)],rotation=quaternion(pose))
    return bones,names,offset,camera_node

def append_arms_animation(glb, animation, path, arms, camera_adjust=None):
    bones,names,offset,camera_node=arms
    c=audit.chunks(path);info=struct.unpack_from('<64s64s4i3f3i',c['ANIMINFO'][2])
    size,count,data=c['BONENAMES'];source_bones=[struct.unpack_from('<64s3i',data,i*size) for i in range(count)]
    source_names=[b[0].split(b'\0')[0].decode() for b in source_bones];lookup={name:i for i,name in enumerate(source_names)}
    stride,_,keys=c['ANIMKEYS'];fps=info[8]
    # Sample at <=30 Hz and retain the final key. Runtime interpolates smoothly.
    frames=list(range(0,info[11],max(1,round(fps/30))))
    if frames[-1]!=info[11]-1:frames.append(info[11]-1)
    times=glb.accessor([frame/fps for frame in frames],'SCALAR',1,bounds=True)
    def channels(node,translations,rotations):
        for kind,values,size in [('translation',translations,3),('rotation',rotations,4)]:
            sampler=len(animation['samplers']);animation['samplers'].append({'input':times,'output':glb.accessor(values,'VEC'+str(size),size),'interpolation':'LINEAR'})
            animation['channels'].append({'sampler':sampler,'target':{'node':node,'path':kind}})
    for i,name in enumerate(names):
        if name not in lookup:continue
        source=lookup[name];parent=bones[i][3];source_parent=source_bones[source][3]
        if (names[parent] if parent>=0 else None)!=(source_names[source_parent] if source_parent>=0 else None):
            raise ValueError(f'arms hierarchy mismatch: {path.name}/{name}')
        translations=[];rotations=[];previous=None
        for frame in frames:
            key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+source)*stride);q=list(key[3:7])
            length=math.sqrt(sum(v*v for v in q));q=[v/length for v in q]
            if parent>=0:q[:3]=[-v for v in q[:3]]
            if previous and sum(a*b for a,b in zip(previous,q))<0:q=[-v for v in q]
            previous=q;translations.extend(key[:3]);rotations.extend(q)
        channels(offset+i,translations,rotations)
    translations=[];rotations=[];previous=None
    camera_frames=fp_motion(path,True)[1]
    for frame in frames:
        pose=camera_frames[frame]
        if camera_adjust:pose=multiply(camera_adjust,pose)
        q=quaternion(pose)
        if previous and sum(a*b for a,b in zip(previous,q))<0:q=[-v for v in q]
        previous=q;translations.extend((pose[3],pose[7],pose[11]));rotations.extend(q)
    channels(camera_node,translations,rotations)

def export(name):
    relative = SOURCES[name]; gun = relative.split('/')[-1]
    directory = GUNS / relative / 'S0/1P'
    psk = audit.chunks(directory / 'Models' / (f'GN_{gun}_S0_Skelmesh.psk' if name!='Melee' else 'EQ_Melee_S0_Skelmesh.psk'))
    def records(key, fmt):
        size,count,data=psk[key]
        return [struct.unpack_from(fmt,data,i*size) for i in range(count)]
    points = records('PNTS0000','<3f'); wedges = records('VTXW0000','<IffB3x')
    face_key = 'FACE0000' if 'FACE0000' in psk else 'FACE3200'
    faces = records(face_key, '<3HBBI' if face_key == 'FACE0000' else '<3IBBI')
    bones = records('REFSKELT','<64s3i7f')
    names = [b[0].split(b'\0')[0].decode() for b in bones]
    weights = [[] for _ in points]
    for weight, point, bone in records('RAWWEIGHTS','<fii'): weights[point].append((bone,weight))
    glb = GLB(); doc = glb.doc
    # Camera-space UE X/Y/Z -> glTF Y/Z/X. Babylon's glTF root mirrors X,
    # giving screen-right=-camera Y, up=Z, forward=X. Keep real centimetres.
    camera_basis=[0,1,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,1]
    doc['nodes'].append({'name':name, 'rotation':quaternion(camera_basis), 'scale':[.01,.01,.01], 'children':[]})
    globals_ = []
    for i,b in enumerate(bones):
        parent = b[3]; q=list(b[4:8]); position=list(b[8:11])
        magnitude=math.sqrt(sum(v*v for v in q)); q=[v/magnitude for v in q]
        if parent >= 0: q[:3] = [-v for v in q[:3]]
        node={'name':names[i],'translation':position,'rotation':q,'children':[]}
        doc['nodes'].append(node)
        local=matrix(position,q); globals_.append(multiply(globals_[parent],local) if parent >= 0 else local)
        doc['nodes'][parent+1 if parent >= 0 else 0]['children'].append(i+1)
    attributes={'POSITION':[], 'NORMAL':[], 'TEXCOORD_0':[], 'JOINTS_0':[], 'WEIGHTS_0':[]}
    normals=[[0.,0.,0.] for _ in wedges]
    grouped={}
    for a,b,c,material,*_ in faces:
        grouped.setdefault(material,[]).extend((a,b,c))
        p,q,r=[points[wedges[index][0]] for index in (a,b,c)]
        u=[q[j]-p[j] for j in range(3)]; v=[r[j]-p[j] for j in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for index in (a,b,c):
            for j in range(3): normals[index][j]+=n[j]
    for i,(point,u,v,_) in enumerate(wedges):
        attributes['POSITION'].extend(points[point]); attributes['TEXCOORD_0'].extend((u,v))
        length=math.sqrt(sum(x*x for x in normals[i])) or 1
        attributes['NORMAL'].extend(x/length for x in normals[i])
        influence=sorted(weights[point], key=lambda item:-item[1])[:4] or [(0,1.)]
        total=sum(w for _,w in influence)
        attributes['JOINTS_0'].extend([b for b,_ in influence]+[0]*(4-len(influence)))
        attributes['WEIGHTS_0'].extend([w/total for _,w in influence]+[0.]*(4-len(influence)))
    accessor_map={}
    for key,values in attributes.items():
        size=2 if key=='TEXCOORD_0' else 4 if key in ('JOINTS_0','WEIGHTS_0') else 3
        accessor_map[key]=glb.accessor(values,'VEC'+str(size),size,34962,5123 if key=='JOINTS_0' else 5126,key=='POSITION')
    material_names=[r[0].split(b'\0')[0].decode() for r in records('MATT0000','<64s')]
    files={p.stem.lower():p for p in (directory/'Materials').glob('*')}
    for material_name in material_names:
        mi=files.get(material_name.lower()) or files.get(material_name.lower()+'_mi')
        material={'name':material_name,'doubleSided':True,'pbrMetallicRoughness':{'metallicFactor':0,'roughnessFactor':.75}}
        if mi and mi.suffix=='.json':
            textures=json.loads(mi.read_text()).get('Textures',{})
            diffuse=textures.get('Albedo') or textures.get('PM_Diffuse')
            if diffuse:
                stem=diffuse['ObjectPath'].split('/')[-1].split('.')[0].lower()
                image=files.get(stem)
                if image: material['pbrMetallicRoughness']['baseColorTexture']=glb.image(image)
            for aliases,packing,slot in [(('MRS','PM_SpecularMasks'),'mrs','metallicRoughnessTexture'),(('Normal','PM_Normals'),'normal','normalTexture'),(('AEM',),'ao','occlusionTexture')]:
                reference=next((textures.get(alias) for alias in aliases if textures.get(alias)),None)
                image=files.get(reference['ObjectPath'].split('/')[-1].split('.')[0].lower()) if reference else None
                if image:
                    destination=material['pbrMetallicRoughness'] if packing=='mrs' else material
                    destination[slot]=glb.image(image,packing)
                    if packing=='mrs':material['pbrMetallicRoughness'].update(metallicFactor=1,roughnessFactor=1)
        doc['materials'].append(material)
    inverse=[value for m in globals_ for value in inverse_rigid(m)]
    doc['skins'].append({'name':name+'_rig','joints':list(range(1,len(bones)+1)),
                         'inverseBindMatrices':glb.accessor(inverse,'MAT4',16), 'skeleton':1})
    doc['meshes'].append({'name':name+'_S0','primitives':[{'attributes':accessor_map,
        'indices':glb.accessor(indices,'SCALAR',1,34963,5125),'material':material} for material,indices in grouped.items()]})
    mesh_index=len(doc['nodes']); doc['nodes'].append({'name':name+'_mesh','mesh':0,'skin':0}); doc['nodes'][0]['children'].append(mesh_index)
    # FP attaches to the GN Skeleton bone, whose bind orientation differs from
    # the mesh's component coordinates. Compensate it once below the attachment.
    anim_directory=directory/'Anims'
    prefix='FP_Core_Melee_S0_Tactical_' if name=='Melee' else f'FP_Core_{gun}_S0_'
    idle=anim_directory/(prefix+'IdlePose.psa')
    if not idle.exists(): raise ValueError(f'{name}: missing exact hip IdlePose')
    reference=fp_motion(idle)[1][0] if idle else None
    children=doc['nodes'][0]['children']; bind_node=len(doc['nodes'])
    bind_inverse=rigid_inverse(globals_[0])
    doc['nodes'].append({'name':'weapon_bind_compensation','children':children,
                         'translation':[bind_inverse[i] for i in (3,7,11)],'rotation':quaternion(bind_inverse)})
    motion_node=len(doc['nodes'])
    doc['nodes'].append({'name':'fp_weapon_motion','children':[bind_node],
                         'translation':[reference[i] for i in (3,7,11)],'rotation':quaternion(reference)})
    doc['nodes'][0]['children']=[motion_node]
    arms=append_arms(glb,idle)
    ads_path=next((anim_directory/(prefix+s+'.psa') for s in ('ADSIdlePose','AltIdlePose') if (anim_directory/(prefix+s+'.psa')).exists()),None)
    ads_adjust=multiply(fp_motion(ads_path)[1][0],rigid_inverse(reference)) if ads_path else None
    durations={}; animation_sources={}
    labels=('Fire','Fire2','Fire3','FireAlt','Equip','Inspect') if name=='Melee' else ('Fire','Reload','Equip','Inspect')
    if name=='Outlaw':labels+=('ReloadEmpty',)
    labels+=('Hold','Idle','Walk','Run','ADS')
    if ads_adjust:labels+=('FireADS',)
    for label in labels:
        suffixes={'Hold':('IdlePose',),'Idle':('IdleAdd','IdlePose'),
                  'Walk':('WalkAdd',),'Run':('RunAdd',),
                  'ADS':('ADSIdleAdd','AltIdleAdd','ADSIdlePose','AltIdlePose')}
        source_label='Fire' if label=='FireADS' else label
        paths=[p for p in anim_directory.glob('GN_*.psa') if p.stem.lower().endswith('_'+source_label.lower())]
        if label in suffixes:
            # These FP files contain full poses. Do not add them to bind transforms.
            paths=[]
        if not paths and source_label == 'Fire':
            paths=[p for p in anim_directory.glob('GN_*.psa') if p.stem.lower().endswith('_fireadd')]
        suffix={'Fire':'Attack1','Fire2':'Attack2','Fire3':'Attack3','FireAlt':'Attack_Alt'}.get(source_label,source_label) if name=='Melee' else source_label
        fp_paths=[anim_directory/(prefix+s+'.psa') for s in suffixes.get(label,(suffix,'FireAdd') if source_label=='Fire' else (suffix,)) if (anim_directory/(prefix+s+'.psa')).exists()]
        fp=fp_paths[0] if fp_paths else None
        if not paths and not fp: continue
        psa=audit.chunks(paths[0] if paths else fp); info=struct.unpack_from('<64s64s4i3f3i',psa['ANIMINFO'][2]); frame_count,fps=info[11],info[8]
        size,count,data=psa['BONENAMES']; animation_bones=[struct.unpack_from('<64s3i',data,i*size) for i in range(count)]
        lookup={b[0].split(b'\0')[0].decode().lower():i for i,b in enumerate(animation_bones)}
        times=[frame/fps for frame in range(frame_count)]; durations[label.lower()]=times[-1]
        time_accessor=glb.accessor(times,'SCALAR',1,bounds=True)
        animation={'name':label.lower(),'samplers':[],'channels':[]}
        key_size,_,keys=psa['ANIMKEYS']
        for bone_index,bone_name in enumerate(names):
            if not paths:continue
            source=lookup.get(bone_name.lower())
            if source is None: continue
            parent=bones[bone_index][3]; parent_source=animation_bones[source][3]
            if parent>=0 and (parent_source<0 or animation_bones[parent_source][0].split(b'\0')[0].decode().lower()!=names[parent].lower()):
                raise ValueError(f'{name}: hierarchy mismatch in {label}/{bone_name}')
            translations=[]; rotations=[]; previous=None
            for frame in range(frame_count):
                key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+source)*key_size)
                q=list(key[3:7])
                magnitude=math.sqrt(sum(v*v for v in q))
                if magnitude < 0.000001: raise ValueError(f'{name}: zero quaternion in {label}/{bone_name}')
                q=[v/magnitude for v in q]
                if parent>=0: q[:3]=[-v for v in q[:3]]
                if previous and sum(q[j]*previous[j] for j in range(4))<0: q=[-v for v in q]
                previous=q; translations.extend(key[:3]); rotations.extend(q)
            for kind,values,size in [('translation',translations,3),('rotation',rotations,4)]:
                sampler=len(animation['samplers']); animation['samplers'].append({'input':time_accessor,'output':glb.accessor(values,'VEC'+str(size),size),'interpolation':'LINEAR'})
                animation['channels'].append({'sampler':sampler,'target':{'node':bone_index+1,'path':kind}})
        if fp:
            fp_fps,frames=fp_motion(fp)
            translations=[]; rotations=[]; previous=None
            for pose in frames:
                if label=='FireADS':pose=multiply(ads_adjust,pose)
                q=quaternion(pose)
                if previous and sum(a*b for a,b in zip(previous,q))<0:q=[-v for v in q]
                previous=q;translations.extend((pose[3],pose[7],pose[11]));rotations.extend(q)
            fp_times=glb.accessor([i/fp_fps for i in range(len(frames))],'SCALAR',1,bounds=True)
            for kind,values,size in [('translation',translations,3),('rotation',rotations,4)]:
                sampler=len(animation['samplers']); animation['samplers'].append({'input':fp_times,'output':glb.accessor(values,'VEC'+str(size),size),'interpolation':'LINEAR'})
                animation['channels'].append({'sampler':sampler,'target':{'node':motion_node,'path':kind}})
            durations[label.lower()]=max(times[-1],(len(frames)-1)/fp_fps)
            append_arms_animation(glb,animation,fp,arms,ads_adjust if label=='FireADS' else None)
        animation_sources[label.lower()]={'articulation':paths[0].name if paths else None,'viewmodel':fp.name if fp else None}
        doc['animations'].append(animation)
    minimum=[min(p[c] for p in points) for c in range(3)]; maximum=[max(p[c] for p in points) for c in range(3)]
    doc['extras']={'weapon':name,'source':str(directory.relative_to(ROOT)),'sourceBoundsCm':[minimum,maximum],
                   'animationDurations':durations,'animationSources':animation_sources,'motionReference':idle.name if idle else None,
                   'cameraSpaceAttachment':True,'armsSource':'FP_Vampire_S0_Skelmesh.psk','textureLimit':512,
                   'packingStatus':'MRS R->metallic G->roughness; AEM R->AO; normal green inverted; source S0 has no emissive'}
    output=ROOT/'val-strike-html/assets/weapons'/f'{name.lower()}_s0.glb'; glb.save(output)
    print(json.dumps({'weapon':name,'triangles':len(faces),'bones':len(bones),'animations':durations,
                      'textures':len(doc['textures']),'bytes':output.stat().st_size,'boundsCm':[minimum,maximum]}))
if __name__=='__main__':
    for name in (list(SOURCES) if '--all' in sys.argv else sys.argv[1:] or ['Classic','Vandal']): export(name)
