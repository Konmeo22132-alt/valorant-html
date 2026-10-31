"""Export extracted shell geometry and only skins with proven identical S0 UV/geometry."""
import json, struct, hashlib
from pathlib import Path
from PIL import Image
import gun_to_glb as g
OUT=g.ROOT/'val-strike-html/assets/weapons'

def signature(chunks):
    # Bone identities/material names may differ; vertex positions, UVs and face slots must not.
    return tuple(hashlib.sha256(chunks[key][2]).hexdigest() for key in ('PNTS0000','VTXW0000','FACE0000') if key in chunks)

catalog={}; rejected=0
for name,relative in g.SOURCES.items():
    if name=='Melee':continue
    base=g.GUNS/relative; source=g.audit.chunks(base/'S0/1P/Models'/f'GN_{base.name}_S0_Skelmesh.psk')
    sig=signature(source); skins={}
    for model in sorted(base.glob('*/Models/*.psk')):
        if signature(g.audit.chunks(model))!=sig:rejected+=1;continue
        folder=model.parents[1]
        if folder.name in skins:continue
        material_files=sorted((folder/'Materials').glob('*MI.json'),key=lambda p:(p.stem!=f'{base.name}_{folder.name}_MI',len(p.stem)))
        if not material_files:continue
        textures=json.loads(material_files[0].read_text()).get('Textures',{}); slots={}
        for slot,aliases,packing in [('albedo',('Albedo','PM_Diffuse'),None),('normal',('Normal','PM_Normals'),'normal'),('metallic',('MRS','PM_SpecularMasks'),'mrs'),('ambient',('AEM',),'ao')]:
            ref=next((textures.get(key) for key in aliases if textures.get(key)),None)
            if not ref:continue
            stem=ref['ObjectPath'].split('/')[-1].split('.')[0]
            image=next((p for p in (folder/'Materials').glob('*.png') if p.stem.lower()==stem.lower()),None)
            if not image:continue
            with Image.open(image) as src:
                im=src.convert('RGB');im.thumbnail((512,512),Image.Resampling.LANCZOS);r,gr,b=im.split()
                if packing=='normal':im=Image.merge('RGB',(r,gr.point(lambda x:255-x),b))
                if packing=='mrs':im=Image.merge('RGB',(Image.new('L',im.size,255),gr,r))
                if packing=='ao':im=Image.merge('RGB',(r,r,r))
                output=OUT/'skins'/name.lower()/folder.name/(slot+'.png');output.parent.mkdir(parents=True,exist_ok=True);im.save(output,optimize=True)
                slots[slot]='/assets/weapons/'+output.relative_to(OUT).as_posix()
        if 'albedo' in slots:skins[folder.name]={'name':folder.name,'textures':slots,'source':str(material_files[0].relative_to(g.ROOT)),'verification':'identical positions, wedge UVs and indexed face/material slots'}
    catalog[name]=skins
(OUT/'skins.json').write_text(json.dumps(catalog,separators=(',',':')))

shells={}
folder=g.GUNS/'_Core/Ejectables/Bullets/S0/Models'
for caliber,filename in [('9mm','Shell_9mm_StaticMesh.pskx'),('44sw','Shell_44sw_StaticMesh.pskx'),('556','Shell_556_Staticmesh.pskx'),('762','Shell_762_StaticMesh.pskx'),('306','Shell_306_StaticMesh.pskx'),('12g','Shell_12g3i_StaticMesh.pskx'),('50bmg','Bullet_50bmg_Shell_StaticMesh.pskx')]:
    c=g.audit.chunks(folder/filename)
    size,count,data=c['PNTS0000'];points=[struct.unpack_from('<3f',data,i*size) for i in range(count)]
    size,count,data=c['VTXW0000'];wedges=[struct.unpack_from('<IffB',data,i*size) for i in range(count)]
    facekey='FACE0000' if 'FACE0000' in c else 'FACE3200';size,count,data=c[facekey];faces=[struct.unpack_from('<3H' if facekey=='FACE0000' else '<3I',data,i*size) for i in range(count)]
    positions=[v for wedge in wedges for v in (-points[wedge[0]][0]*.01,points[wedge[0]][2]*.01,points[wedge[0]][1]*.01)]
    shells[caliber]={'positions':positions,'indices':[i for face in faces for i in (face[0],face[2],face[1])],'source':filename}
(OUT/'shells.json').write_text(json.dumps(shells,separators=(',',':')))
print(json.dumps({'skins':{k:list(v) for k,v in catalog.items() if v},'rejectedDifferentMeshes':rejected,'shells':{k:len(v['indices'])//3 for k,v in shells.items()}}))
