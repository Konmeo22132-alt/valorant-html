"""Stage native Neon assets with bounded CPU jobs. Does not publish/unlock Neon."""
import argparse
import ctypes
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'model/valorant-model-animations-agents/Content/Characters/Sprinter/S0'
PACKAGE=ROOT/'tools/converted/neon'
OUT=PACKAGE/'assets/playable'
TEXTURES=OUT/'textures/sprinter'
JOBS=('menu','body','arms','body-actions','arms-actions','vfx','ui')

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/file)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def source(name):
    matches=sorted(SOURCE.rglob(name))
    if not matches:raise FileNotFoundError(name)
    return matches[0]

def mapped(values):return{k:source(v)for k,v in values.items()}

def body_skills():
    clips=mapped({'C_cast_UB':'TP_Sprinter_S0_4_Wall_UB.psa','C_cast_LB':'TP_Sprinter_S0_4_Wall_LB.psa',
        'Q_cast_UB':'TP_Sprinter_S0_Q_Concuss_Cast_UB.psa','Q_cast_LB':'TP_Sprinter_S0_Q_Concuss_Cast_LB.psa',
        'E_equip_UB':'TP_Sprinter_S0_E_Equip_UB.psa','E_equip_LB':'TP_Sprinter_S0_E_Equip_LB.psa',
        'E_idle_UB':'TP_Sprinter_S0_E_Idle_UB.psa','E_idle_LB':'TP_Sprinter_S0_E_Idle_LB.psa',
        'X_equip_UB':'TP_Sprinter_S0_X_Equip_UB.psa','X_equip_LB':'TP_Sprinter_S0_X_Equip_LB.psa',
        'X_idle_UB':'TP_Sprinter_S0_X_Idle_UB.psa','X_idle_LB':'TP_Sprinter_S0_X_Idle_LB.psa',
        'X_fire_UB':'TP_Sprinter_S0_X_Fire_UB.psa','X_fire_LB':'TP_Sprinter_S0_X_Fire_LB.psa',
        'X_outro_UB':'TP_Sprinter_S0_X_NoFuel_UB.psa','X_outro_LB':'TP_Sprinter_S0_X_NoFuel_LB.psa'})
    for direction in ('N','NE','E','SE','S','SW','W','NW'):
        for half in ('UB','LB'):clips[f'E_slide_{direction}_{half}']=source(f'TP_Sprinter_S0_E_Slide_{direction}_{half}.psa')
    return clips

def arms_skills():return mapped({'C_cast':'FP_Sprinter_S0_4_Wall.psa','Q_cast':'FP_Sprinter_S0_Q_Concuss.psa',
    'E_equip':'FP_Sprinter_S0_E_Equip.psa','E_idle':'FP_Sprinter_S0_E_Idle.psa','E_walk':'FP_Sprinter_S0_E_Walk.psa',
    'E_sprint_additive':'FP_Sprinter_S0_E_Sprint_Add.psa','E_jump':'FP_Sprinter_S0_E_Jump.psa','E_land':'FP_Sprinter_S0_E_JumpLand.psa',
    'X_equip':'FP_Sprinter_S0_X_Equip.psa','X_idle':'FP_Sprinter_S0_X_Idle_Both.psa','X_fire':'FP_Sprinter_S0_X_Fire.psa',
    'X_stop':'FP_Sprinter_S0_X_StopFiring.psa','X_outro':'FP_Sprinter_S0_X_NoFuel.psa','X_slide':'FP_Sprinter_S0_X_SlideIn.psa',
    'X_reequip':'FP_Sprinter_S0_X_ReEquip.psa'})

def run(job):
    export=module('neon_native_export','export-playable-agents.py')
    common={'external_textures':TEXTURES,'compact_tracks':True,'respect_native_materials':True}
    if job=='menu':return export.export_mesh(source('CS_Sprinter_S0_Skelmesh.psk'),PACKAGE/'assets/agents/sprinter.glb',mapped({'CharSelectIntro':'CS_Sprinter_S0_CharSelect_Intro.psa','CharSelectIdle':'CS_Sprinter_S0_CharSelect_Idle.psa'}),**common,rest_clips=('CharSelectIdle',))
    if job=='body':
        core=export.BASE/'_Core/3P/Anims';clips={}
        for state in ('Run','Walk','CrouchWalk'):
            for direction in ('N','NE','E','SE','S','SW','W','NW'):clips[f'{state}{direction}_LB']=core/f'TP_Core_{state}{direction}_LB.psa'
        for label in ('Idle_LB','Idle_UB','CrouchIdle_LB','Jump_LB','JumpLand_LB'):clips[label]=core/f'TP_Core_{label}.psa'
        clips['DeathSplat']=core/'TP_Core_Death_Splat.psa'
        for weapon,relative in export.SOURCES.items():
            directory=export.GUNS/relative/'S0/3P/Anims'
            for state,pattern in [('idle','TP_*_IdlePose_UB.psa'),('reload','TP_*_Reload_UB.psa')]:
                path=next(directory.glob(pattern),None)
                if path:clips[f'gun_{weapon}_{state}_UB']=path
        clips.update(body_skills());return export.export_mesh(source('TP_Sprinter_S0_Skelmesh.psk'),OUT/'sprinter-body.glb',clips,True,**common,rest_clips=('Idle_LB','gun_Classic_idle_UB'))
    if job=='arms':
        directory=export.GUNS/export.SOURCES['Classic']/'S0/1P/Anims'
        clips={'idle':next(directory.glob('FP_*_IdlePose.psa')),**arms_skills()}
        return export.export_mesh(source('FP_Sprinter_S0_Skelmesh.psk'),OUT/'sprinter-arms.glb',clips,**common,rest_clips=('idle',))
    if job in ('body-actions','arms-actions'):
        view=job.split('-')[0];clips={};existing=set((body_skills()if view=='body'else arms_skills()).values())
        if view=='body':
            for weapon,relative in export.SOURCES.items():
                directory=export.GUNS/relative/'S0/3P/Anims'
                for state,patterns in {'equip':['TP_*_Equip_UB.psa'],'crouch':['TP_*_CrouchPose_UB.psa'],'ads':['TP_*_AltIdlePose_UB.psa'],'adscrouch':['TP_*_AltCrouchPose_UB.psa'],'reloadempty':['TP_*_ReloadEmpty_UB.psa'],'fire':['TP_*_FireAdd.psa','TP_*_FireAdd_UB.psa','TP_*_Fire_UB.psa']}.items():
                    match=next((p for pattern in patterns for p in sorted(directory.glob(pattern))if not any(x in p.name for x in ('Aggressive','Fury','Tactical','Macaron'))),None)
                    if match:clips[f'gun_{weapon}_{state}_UB']=match
            melee=export.GUNS/export.SOURCES['Melee']/'S0/3P/Anims'
            for label,filename in {'fire':'TP_Core_Melee_S0_Attack01_UB.psa','fire2':'TP_Core_Melee_S0_Attack02_UB.psa','fire3':'TP_Core_Melee_S0_Attack03_UB.psa','firealt':'TP_Core_Melee_S0_Alt_Attack_UB.psa'}.items():clips['gun_Melee_'+label+'_UB']=melee/filename
        for path in sorted(SOURCE.rglob(('TP_'if view=='body'else'FP_')+'*.psa')):
            if path in existing or any(v in path.stem.lower()for v in ('montage','seq')):continue
            if view=='body'and not path.stem.endswith(('_UB','_LB'))and 'Backpack_Cosmetic'not in path.stem:continue
            clips['native_'+path.stem]=path
        banks=module('neon_animation_banks','native-animation-banks.py')
        return banks.animation_banks(export,view,clips,code='sprinter',playable=OUT,package=PACKAGE)
    if job=='vfx':
        report={'textures':[],'geometry':[]}
        for p in (SOURCE/'VFX/Textures').glob('*.png'):
            dst=OUT/'vfx'/p.name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst);report['textures'].append({'file':dst.relative_to(PACKAGE).as_posix(),'source':p.relative_to(ROOT).as_posix()})
        # VFX geometry is converted with an invisible material until the native
        # shader bindings are reconstructed; it must never appear as white stock meshes.
        for p in sorted((SOURCE/'VFX/Meshes').glob('*.pskx')):
            dst=OUT/'vfx'/(p.stem+'.glb');item=export.export_mesh(p,dst)
            raw=dst.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])
            chunks=export.audit.chunks(p);native_attributes=[]
            for name,(stride,count,payload)in chunks.items():
                if name.startswith('EXTRAUVS'):
                    semantic='TEXCOORD_'+str(int(name[len('EXTRAUVS'):])+1);kind='VEC2';component=5126;normalized=False
                elif name=='VERTEXCOLOR':
                    semantic='COLOR_0';kind='VEC4';component=5121;normalized=True
                else:continue
                vertex_count=doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes']['POSITION']]['count']
                if count!=vertex_count:raise ValueError('Native VFX attribute count mismatch: '+name)
                binary.extend(b'\0'*(-len(binary)%4));doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(payload),'target':34962});binary.extend(payload)
                accessor={'bufferView':len(doc['bufferViews'])-1,'componentType':component,'count':count,'type':kind}
                if normalized:accessor['normalized']=True
                doc['accessors'].append(accessor)
                for mesh in doc['meshes']:
                    for primitive in mesh['primitives']:primitive['attributes'][semantic]=len(doc['accessors'])-1
                native_attributes.append(semantic)
            binary.extend(b'\0'*(-len(binary)%4));doc['buffers'][0]['byteLength']=len(binary)
            for material in doc['materials']:
                material.clear();material.update(name='native_vfx_requires_shader',alphaMode='BLEND',doubleSided=True,pbrMetallicRoughness={'baseColorFactor':[0,0,0,0]},extras={'requiresRuntimeVFXMaterial':True})
            data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*(-len(data)%4)
            with dst.open('wb')as stream:stream.write(struct.pack('<5I',0x46546c67,2,28+len(data)+len(binary),len(data),0x4e4f534a));stream.write(data);stream.write(struct.pack('<2I',len(binary),0x004e4942));stream.write(binary)
            item['file']=dst.relative_to(PACKAGE).as_posix();item['nativeExtraAttributes']=native_attributes;item['bindingStatus']='native mesh only; runtime shader required';report['geometry'].append(item)
        report['materials']=[]
        for p in (SOURCE/'VFX').rglob('*.json'):
            dst=OUT/'vfx/materials'/p.name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst);report['materials'].append(dst.relative_to(PACKAGE).as_posix())
        return report
    if job=='ui':
        directory=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI/InGame/HUD/Abilities/Assets/ShippingIcons';files=list(directory.rglob('*Sprinter*.png'));result=[]
        for p in files:
            dst=PACKAGE/'assets/ui/neon'/p.name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst);result.append(dst.relative_to(PACKAGE).as_posix())
        if not result:
            html=(ROOT/'tools/art-review/neon/riot-page.html').read_text(encoding='utf-8');data=json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',html,re.S).group(1));groups=next(b for b in data['props']['pageProps']['page']['blades']if 'groups'in b)['groups'];slots={'FAST LANE':'C','RELAY BOLT':'Q','HIGH GEAR':'E','OVERDRIVE':'X'}
            for group in groups:
                slot=slots.get(group['content']['title'])
                if not slot:continue
                dst=OUT/'vfx'/f'sprinter-{slot}.png';dst.parent.mkdir(parents=True,exist_ok=True);subprocess.run(['curl.exe','-fsS','--retry','2','--max-time','45','-o',str(dst),group['thumbnail']['url']],check=True);result.append({'file':dst.relative_to(PACKAGE).as_posix(),'source':group['thumbnail']['url']})
        return result
    raise ValueError(job)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--job',choices=JOBS);args=parser.parse_args();PACKAGE.mkdir(parents=True,exist_ok=True)
    if not args.job:
        for job in JOBS:subprocess.run([sys.executable,'-X','utf8',str(Path(__file__)),'--job',job],check=True)
        return
    if sys.platform=='win32':
        kernel=ctypes.windll.kernel32;kernel.GetCurrentProcess.restype=ctypes.c_void_p;kernel.SetPriorityClass.argtypes=[ctypes.c_void_p,ctypes.c_uint32];kernel.SetPriorityClass(kernel.GetCurrentProcess(),0x4000)
    path=PACKAGE/'manifest.json';report=json.loads(path.read_text())if path.exists()else{'status':'native assets staged; runtime not implemented; not playable'}
    print('Neon conversion:',args.job,flush=True);report[args.job]=run(args.job)
    if args.job in ('menu','body','arms')and any(m['runtimeTint']for m in report[args.job]['materials']):raise RuntimeError('Unresolved native material; do not publish')
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    files=[{'file':p.relative_to(PACKAGE).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()}for folder in ('assets','game')for p in sorted((PACKAGE/folder).rglob('*'))if p.is_file()]
    (PACKAGE/'package-files.json').write_text(json.dumps({'agent':'Neon','status':report['status'],'totalBytes':sum(p['bytes']for p in files),'files':files},indent=2)+'\n',encoding='utf-8')
    print(args.job,'complete;',len(files),'files,',round(sum(p['bytes']for p in files)/1048576,2),'MiB',flush=True)

if __name__=='__main__':main()
