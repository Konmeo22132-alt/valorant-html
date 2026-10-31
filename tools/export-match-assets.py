"""Export source gun/spike meshes for world actors; retain original textures."""
import importlib, json, sys, struct
from gun_to_glb import GLB, matrix, inverse_rigid, quaternion, rigid_inverse
from pathlib import Path
m=importlib.import_module('export-playable-agents')
out=m.ROOT/'val-strike-html/assets/match'
out.mkdir(exist_ok=True)
content=m.GUNS.parents[1]
index=dict(m.source_index())
for extension in ('*.png','*.json'):
    for p in content.rglob(extension):index[str(p.relative_to(content)).replace('\\','/').lower()]=p
m.source_index=lambda:index
report=json.loads((out/'manifest.json').read_text()) if (out/'manifest.json').exists() else {}
for name in sys.argv[1:] or list(m.SOURCES):
    base=m.GUNS/m.SOURCES[name]/'S0/1P'
    mesh=next(p for p in (base/'Models').glob('*_S0_Skelmesh.psk') if 'Basemesh' not in p.stem and 'BaseMesh' not in p.stem)
    clips={}
    for label,pattern in [('reload','GN*_Reload.psa'),('reloadempty','GN*_ReloadEmpty.psa'),('fire','GN*_FireAdd.psa')]:
        clip=next((base.parent/'3P/Anims').glob(pattern),None)
        if clip:clips[label]=clip
    report[name]=m.export_mesh(mesh,out/(name.lower()+'.glb'),clips)
    # These props live below a 3P WeaponMaster bone, already in centimetres
    # and the agent's coordinate basis. Remove the standalone mesh conversion
    # and attach to GN Skeleton's socket instead of its bounding-box centre.
    target=out/(name.lower()+'.glb');raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    glb=GLB();glb.doc=json.loads(raw[20:20+length]);glb.data=bytearray(raw[28+length:])
    doc=glb.doc;root=doc['nodes'][0];root.pop('rotation',None);root.pop('scale',None)
    bone=doc['nodes'][1];bind=rigid_inverse(matrix(bone.get('translation',[0,0,0]),bone.get('rotation',[0,0,0,1])))
    socket=len(doc['nodes']);doc['nodes'].append({'name':'world_weapon_bind','children':root['children'],
        'translation':[bind[i] for i in (3,7,11)],'rotation':quaternion(bind)})
    root['children']=[socket];doc.setdefault('extras',{})['boneSpace']=True
    glb.save(target);report[name]['bytes']=target.stat().st_size
bomb=m.GUNS.parent/'Bomb/S0/1P'
report['spike']=m.export_mesh(bomb/'Models/EQ_Bomb_S0_Skelmesh.psk',out/'spike.glb',{'plant':bomb/'Anims/EQ_Core_Bomb_S0_Activate.psa'})
report['defuser']=m.export_mesh(bomb/'Models/EQ_Bomb_Defuser_S0_Skelmesh.psk',out/'defuser.glb')
(out/'manifest.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:{'bytes':v['bytes'],'materials':len(v['materials'])} for k,v in report.items()}))
