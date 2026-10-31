"""Preserve native overlay eyes and glass colors/opacity in the menu GLBs."""
import importlib.util,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('agent_export',ROOT/'tools/export-playable-agents.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
out=ROOT/'val-strike-html/assets/agents';report=json.loads((out/'manifest.json').read_text());index=module.source_index()
for agent,record in report.items():
    if agent not in ('Clove','Jett','Sage'):continue
    file=ROOT/record['file'];raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=module.GLB();g.doc=json.loads(raw[20:20+length]);g.data=bytearray(raw[28+length:]);g.texture_limit=None;g.preserve_alpha=True;changed=False
    for mat,detail in zip(g.doc['materials'],record['materials']):
        metadata=next((p for p in index.values() if p.suffix=='.json' and p.stem==mat['name']),None)
        if not metadata:continue
        source=json.loads(metadata.read_text(encoding='utf-8-sig'));textures=source.get('Textures',{});pbr=mat['pbrMetallicRoughness']
        if mat['name']=='TP_Core_Eye_MI':
            ref=textures['OverlayTexture']['ObjectPath'].removeprefix('/Game/').rsplit('.',1)[0]+'.png';image=index[ref.lower()]
            pbr['baseColorTexture']=g.image(image);mat['alphaMode']='BLEND';mat['extensions']={'KHR_materials_unlit':{}};g.doc.setdefault('extensionsUsed',[])
            if 'KHR_materials_unlit' not in g.doc['extensionsUsed']:g.doc['extensionsUsed'].append('KHR_materials_unlit')
            detail['textures']['albedo']=str(image.relative_to(ROOT));detail['runtimeTint']=False;changed=True
        elif 'glass' in mat['name'].lower():
            colors=source.get('Colors',{});color=next((v for k,v in colors.items() if 'glass' in k.lower() and 'color' in k.lower()),{'R':.18,'G':.22,'B':.24});scalars=source.get('Scalars',{});opacity=next((v for k,v in scalars.items() if 'opacity' in k.lower() and 'glare' not in k.lower()),.12)
            pbr['baseColorFactor']=[color.get(c,0) for c in ('R','G','B')]+[max(.05,min(.35,opacity))];pbr['roughnessFactor']=.12;mat['alphaMode']='BLEND';changed=True;detail['nativeGlass']=True
    if changed:g.save(file);record['bytes']=file.stat().st_size
(out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('Native eye/glass materials repaired for Clove, Jett, Sage')
