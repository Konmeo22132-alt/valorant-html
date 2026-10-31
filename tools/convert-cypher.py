"""Convert native Cypher assets in small, sequential CPU-only jobs.

Draft package mirrors the web asset tree under tools/converted/cypher. Shared
2048px source textures are externalized/deduplicated; production is not edited.
"""
import argparse, copy, ctypes, gc, importlib.util, json, math, shutil, struct, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PACKAGE=ROOT/'tools/converted/cypher'
OUT=PACKAGE/'assets/playable'
SOURCE=ROOT/'model/valorant-model-animations-agents/Content/Characters/Gumshoe/S0'
TEXTURES=OUT/'textures/gumshoe'
JOBS=('menu','body','arms','devices','body-actions','arms-actions','ui')

def load_exporter():
    spec=importlib.util.spec_from_file_location('cypher_native_export',ROOT/'tools/export-playable-agents.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def source(pattern):
    matches=sorted(SOURCE.rglob(pattern))
    if not matches:raise FileNotFoundError(pattern)
    return matches[0]

def clip_map(names):return {label:source(name)for label,name in names.items()}

def body_skills():
    return clip_map({
      'C_equip_UB':'TP_Gumshoe_S0_E_Tripwire_Equip_UB.psa',
      'C_idle_UB':'TP_Gumshoe_S0_E_Tripwire_Loop_UB.psa','C_cast_UB':'TP_Gumshoe_S0_E_Fire_UB.psa',
      'C_recall_UB':'TP_Gumshoe_S0_E_RecallStart_UB.psa','C_recall_finish_UB':'TP_Gumshoe_S0_E_RecalFinish_UB.psa',
      'Q_cast_UB':'TP_Gumshoe_S0_4_TrapThrow_UB.psa',
      'E_equip_UB':'TP_Gumshoe_S0_Q_Equip_UB.psa','E_idle_UB':'TP_Gumshoe_S0_Q_Loop_UB.psa',
      'E_cast_UB':'TP_Gumshoe_S0_Q_Fire_UB.psa','E_camera_UB':'TP_Gumshoe_S0_Q_PrivateEye_CameraLook_UB.psa',
      'E_camera_idle_UB':'TP_Gumshoe_S0_Q_PrivateEye_CameraLook_Loop_UB.psa',
      'E_camera_LB':'TP_Gumshoe_S0_Q_PrivateEye_CameraLook_LB.psa',
      'E_camera_idle_LB':'TP_Gumshoe_S0_Q_PrivateEye_CameraLook_Loop_LB.psa',
      'E_recall_UB':'TP_Gumshoe_S0_Q_RecallStart_UB.psa','E_recall_finish_UB':'TP_Gumshoe_S0_Q_RecallFinish_UB.psa',
      'X_cast_UB':'TP_Gumshoe_S0_X_HatThrow_Activate_UB.psa','X_cast_LB':'TP_Gumshoe_S0_X_HatThrow_Activate_LB.psa'})

def arms_skills():
    return clip_map({
      'C_equip':'FP_Gumshoe_S0_E_Equip.psa','C_idle':'FP_Gumshoe_S0_E_Loop.psa','C_cast':'FP_Gumshoe_S0_E_Fire.psa',
      'C_recall':'FP_Gumshoe_S0_E_TripwireRecallStart.psa','C_recall_finish':'FP_Gumshoe_S0_E_Tripwire_RecallFinish.psa',
      'Q_cast':'FP_Gumshoe_S0_4.psa','E_equip':'FP_Gumshoe_S0_Q_Equip.psa','E_idle':'FP_Gumshoe_S0_Q_Loop.psa',
      'E_cast':'FP_Gumshoe_S0_Q_Fire.psa','E_camera':'FP_Gumshoe_S0_Q_PrivateEye_HandsDown_Pose.psa',
      'E_recall':'FP_Gumshoe_S0_Q_PrivateEye_RecallCast.psa','E_recall_finish':'FP_Gumshoe_S0_Q_PrivateEye_RecallFinish.psa',
      'X_cast':'FP_Gumshoe_S0_X_Activate.psa',
      'dart_remove_intro':'FP_Gumshoe_S0_DartRemoval_Intro.psa','dart_remove_loop':'FP_Gumshoe_S0_DartRemoval_loop.psa',
      'dart_remove_outro':'FP_Gumshoe_S0_DartRemoval_Outro.psa','dart_remove_cancel':'FP_Gumshoe_S0_DartRemoval_Cancel.psa'})

def glb_header(path):
    with path.open('rb')as stream:
        header=stream.read(20);length=struct.unpack_from('<I',header,12)[0]
        return json.loads(stream.read(length))

def animation_banks(export,view,clips):
    original=glb_header(OUT/f'gumshoe-{view}.glb');base_nodes=[{k:copy.deepcopy(v)for k,v in n.items()if k not in ('mesh','skin')}for n in original['nodes']]
    names={n.get('name'):i for i,n in enumerate(base_nodes)};parents={child:i for i,n in enumerate(base_nodes)for child in n.get('children',[])}
    def upper(index):
        if any(token in base_nodes[index].get('name','').lower()for token in ('weapon','camera')):return True
        while index in parents:
            if base_nodes[index].get('name')=='Spine1':return True
            index=parents[index]
        return False
    banks=[];bank_clips=[];number=0
    def new_bank():
        glb=export.GLB();glb.doc['nodes']=copy.deepcopy(base_nodes);glb.doc['scenes']=copy.deepcopy(original['scenes']);return glb
    glb=new_bank()
    def flush():
        nonlocal number,glb,bank_clips
        if not bank_clips:return
        number+=1;filename=f'gumshoe-{view}-animations'+(''if number==1 else f'-{number:02d}')+'.glb'
        target=PACKAGE/'assets/match'/filename;glb.save(target)
        banks.append({'file':target.relative_to(PACKAGE).as_posix(),'bytes':target.stat().st_size,'clips':bank_clips})
        print('Animation bank',filename,len(bank_clips),'clips',flush=True);glb=new_bank();bank_clips=[];gc.collect()
    for label,path in clips.items():
        chunks=export.audit.chunks(path);info=struct.unpack_from('<64s64s4i3f3i',chunks['ANIMINFO'][2])
        size,count,data=chunks['BONENAMES'];lookup={data[i*size:].split(b'\0')[0].decode():i for i in range(count)}
        frames=range(info[11]);time_values=[f/info[8]for f in frames];times=glb.accessor(time_values,'SCALAR',1,bounds=True)
        animation={'name':label,'samplers':[],'channels':[]};stride,_,keys=chunks['ANIMKEYS']
        def track(index,kind,values,n):
            clock=times
            if info[11]>2 and all(values[i]==values[i%n]for i in range(n,len(values))):clock=glb.accessor([0,time_values[-1]],'SCALAR',1,bounds=True);values=values[:n]*2
            animation['channels'].append({'sampler':len(animation['samplers']),'target':{'node':index,'path':kind}})
            animation['samplers'].append({'input':clock,'output':glb.accessor(values,'VEC'+str(n),n),'interpolation':'LINEAR'})
        for name,index in names.items():
            if name not in lookup:continue
            if view=='body'and(label.endswith('_LB')and upper(index)or label.endswith('_UB')and not upper(index)):continue
            positions=[];rotations=[];previous=None
            for frame in frames:
                key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+lookup[name])*stride);q=list(key[3:7])
                if name!='Skeleton':q[:3]=[-v for v in q[:3]]
                if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
                previous=q;positions.extend(key[:3]);rotations.extend(q)
            track(index,'translation',positions,3);track(index,'rotation',rotations,4)
        if view=='arms'and'camera_compensation'in names:
            if not {'Camera','R_WeaponMaster'}<=lookup.keys():raise ValueError('Cannot compensate FP camera: '+str(path))
            _,poses=export.fp_motion(path,True);positions=[];rotations=[];previous=None
            for pose in poses:
                q=export.quaternion(pose)
                if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
                previous=q;positions.extend(pose[i]for i in (3,7,11));rotations.extend(q)
            track(names['camera_compensation'],'translation',positions,3);track(names['camera_compensation'],'rotation',rotations,4)
        glb.doc['animations'].append(animation);bank_clips.append({'name':label,'source':path.relative_to(ROOT).as_posix(),'frames':info[11],'fps':info[8]})
        if len(glb.data)>8*1048576 or len(bank_clips)>=24:flush()
    flush();return banks

def run_job(job):
    if job=='ui':
        ui=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI';report=[]
        icons=ui/'InGame/HUD/Abilities/Assets/ShippingIcons/Gumshoe'
        for slot,name in {'C':'Tripwire','Q':'Cage','E':'Camera','X':'Interrogate'}.items():
            src=icons/f'TX_Gumshoe_{name}.png';dst=OUT/'vfx'/f'gumshoe-{slot}.png';dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
            report.append({'role':'ability '+slot,'source':src.relative_to(ROOT).as_posix(),'file':dst.relative_to(PACKAGE).as_posix()})
        sources=[*(ui/'InGame/HUD/Abilities/Gumshoe/Camera').glob('*.png'),*(ui/'Shared/Icons/Abilities/Minimap').glob('*Cypher*.png')]
        for src in sources:
            dst=PACKAGE/'assets/ui/cypher'/src.name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
            report.append({'role':'native camera/minimap UI; original filename retained','source':src.relative_to(ROOT).as_posix(),'file':dst.relative_to(PACKAGE).as_posix()})
        return report
    export=load_exporter();common={'external_textures':TEXTURES,'compact_tracks':True,'respect_native_materials':True}
    if job=='menu':
        return export.export_mesh(source('CS_Gumshoe_S0_Skelmesh.psk'),PACKAGE/'assets/agents/gumshoe.glb',clip_map({'CharSelectIntro':'CS_Gumshoe_S0_CS_Intro.psa','CharSelectIdle':'CS_Gumshoe_S0_Idle.psa','CharSelectFidget':'CS_Gumshoe_S0_Fidget.psa'}),**common,rest_clips=('CharSelectIdle',))
    if job=='body':
        core=export.BASE/'_Core/3P/Anims';clips={}
        for state in ('Run','Walk','CrouchWalk'):
            for direction in ('N','NE','E','SE','S','SW','W','NW'):clips[f'{state}{direction}_LB']=core/f'TP_Core_{state}{direction}_LB.psa'
        for label in ('Idle_LB','Idle_UB','CrouchIdle_LB','Jump_LB','JumpLand_LB'):clips[label]=core/f'TP_Core_{label}.psa'
        clips['DeathSplat']=core/'TP_Core_Death_Splat.psa'
        for weapon,relative in export.SOURCES.items():
            directory=export.GUNS/relative/'S0/3P/Anims'
            for state,pattern in [('idle','TP_*_IdlePose_UB.psa'),('reload','TP_*_Reload_UB.psa')]:
                match=next(directory.glob(pattern),None)
                if match:clips[f'gun_{weapon}_{state}_UB']=match
        clips.update(body_skills());clips['FaceIdle_UB']=source('TP_Gumshoe_S0_Face_Idle.psa')
        result=export.export_mesh(source('TP_Gumshoe_S0_Skelmesh.psk'),OUT/'gumshoe-body.glb',clips,True,**common,split_bone_parts={'hat':{'Hat'}},rest_clips=('Idle_LB','gun_Classic_idle_UB'))
        result['sourceClips']={k:v.relative_to(ROOT).as_posix()for k,v in clips.items()};return result
    if job=='arms':
        clips=arms_skills();directory=export.GUNS/export.SOURCES['Classic']/'S0/1P/Anims'
        clips={'idle':next(directory.glob('FP_*_IdlePose.psa')),**clips}
        result=export.export_mesh(source('FP_Gumshoe_S0_Skelmesh.psk'),OUT/'gumshoe-arms.glb',clips,**common,rest_clips=('idle',))
        result['sourceClips']={k:v.relative_to(ROOT).as_posix()for k,v in clips.items()};return result
    if job=='devices':
        choices={
          'cage':'AB_Gumshoe_S0_4_Skelmesh.psk','cage-world':'AB_Gumshoe_S0_4_Staticmesh.pskx',
          'trapwire':'AB_Gumshoe_S0_E_Skelmesh.psk','trapwire-world':'ABTP_Gumshoe_S0_E_Staticmesh.pskx',
          'spycam':'AB_Gumshoe_S0_Q_Skelmesh.psk','spycam-hand':'AB_Gumshoe_S0_Q_InHand_Skelmesh.psk',
          'spycam-world':'AB_Gumshoe_S0_Q_Staticmesh.pskx','spycam-dart':'AB_Gumshoe_S0_Q_Dart_Skelmesh.psk',
          'spycam-coat':'AB_Gumshoe_S0_Q_Coat_Staticmesh.pskx','hat':'AB_Gumshoe_S0_X_Skelmesh.psk'}
        clips={
          'trapwire':clip_map({'idle':'AB_Gumshoe_S0_E_TripWire_Loop.psa'}),
          'spycam':clip_map({'equip':'AB_Gumshoe_S0_Q_PrivateEye_Equip.psa','idle':'AB_Gumshoe_S0_Q_PrivateEye_Loop.psa','camera':'AB_Gumshoe_S0_Q_PrivateEye_CameraLook.psa','camera_idle':'AB_Gumshoe_S0_Q_PrivateEye_CameraLook_Loop.psa'}),
          'spycam-hand':clip_map({'equip':'AB_Gumshoe_S0_Q_PrivateEye_Equip.psa','idle':'AB_Gumshoe_S0_Q_PrivateEye_Loop.psa'}),
          'hat':clip_map({'cast':'AB_Gumshoe_S0_X_HatThrow_Activate.psa'})}
        report={}
        for label,filename in choices.items():
            report[label]=export.export_mesh(source(filename),OUT/f'gumshoe-{label}.glb',clips.get(label),**common)
            if any(m['runtimeTint']for m in report[label]['materials']):raise ValueError('Unresolved device material: '+label)
            print('Device',label,report[label]['bytes'],'bytes',flush=True);gc.collect()
        return report
    if job=='body-actions':
        clips={}
        for weapon,relative in export.SOURCES.items():
            directory=export.GUNS/relative/'S0/3P/Anims'
            for state,patterns in {'equip':['TP_*_Equip_UB.psa'],'crouch':['TP_*_CrouchPose_UB.psa'],'ads':['TP_*_AltIdlePose_UB.psa'],'adscrouch':['TP_*_AltCrouchPose_UB.psa'],'reloadempty':['TP_*_ReloadEmpty_UB.psa'],'fire':['TP_*_FireAdd.psa','TP_*_FireAdd_UB.psa','TP_*_Fire_UB.psa']}.items():
                match=next((p for pattern in patterns for p in sorted(directory.glob(pattern))if not any(x in p.name for x in ('Aggressive','Fury','Tactical','Macaron'))),None)
                if match:clips[f'gun_{weapon}_{state}_UB']=match
        melee=export.GUNS/export.SOURCES['Melee']/'S0/3P/Anims'
        for label,filename in {'fire':'TP_Core_Melee_S0_Attack01_UB.psa','fire2':'TP_Core_Melee_S0_Attack02_UB.psa','fire3':'TP_Core_Melee_S0_Attack03_UB.psa','firealt':'TP_Core_Melee_S0_Alt_Attack_UB.psa'}.items():clips['gun_Melee_'+label+'_UB']=melee/filename
        for path in sorted(SOURCE.rglob('TP_*.psa')):
            if '/Ability_'not in path.as_posix()or not path.stem.endswith(('_UB','_LB'))or any(x in path.stem.lower()for x in ('montage','seq','cosmetic','add')):continue
            clips['native_'+path.stem]=path
        return animation_banks(export,'body',clips)
    if job=='arms-actions':
        existing=set(arms_skills().values());clips={}
        for path in sorted(SOURCE.rglob('FP_*.psa')):
            if path in existing or any(x in path.stem.lower()for x in ('montage','seq','cosmetic','add')):continue
            clips['native_'+path.stem]=path
        return animation_banks(export,'arms',clips)
    raise ValueError(job)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--job',choices=JOBS);args=parser.parse_args()
    PACKAGE.mkdir(parents=True,exist_ok=True)
    if not args.job:
        for job in JOBS:subprocess.run([sys.executable,'-X','utf8',str(Path(__file__)),'--job',job],check=True)
        return
    # Keep conversion behind the user's running game in Windows scheduling.
    kernel=ctypes.windll.kernel32;kernel.GetCurrentProcess.restype=ctypes.c_void_p
    kernel.SetPriorityClass.argtypes=[ctypes.c_void_p,ctypes.c_uint32]
    handle=kernel.GetCurrentProcess();kernel.SetPriorityClass(handle,0x4000)
    report_path=PACKAGE/'manifest.json';report=json.loads(report_path.read_text())if report_path.exists()else{}
    print('Cypher conversion:',args.job,flush=True);report[args.job]=run_job(args.job)
    class MemoryCounters(ctypes.Structure):
        _fields_=[('cb',ctypes.c_uint32),('faults',ctypes.c_uint32)]+[(name,ctypes.c_size_t)for name in ('peakWorkingSet','workingSet','peakPagedPool','pagedPool','peakNonpagedPool','nonpagedPool','pagefile','peakPagefile')]
    counters=MemoryCounters();counters.cb=ctypes.sizeof(counters)
    memory=ctypes.windll.psapi.GetProcessMemoryInfo;memory.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint32]
    if memory(handle,ctypes.byref(counters),counters.cb):
        report.setdefault('workerPeakMiB',{})[args.job]=round(counters.peakWorkingSet/1048576,2)
        print('Peak worker RAM:',report['workerPeakMiB'][args.job],'MiB',flush=True)
    report['packageStatus']='native-assets-staged; gameplay/VFX integration pending; not deployed'
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Completed',args.job,flush=True)

if __name__=='__main__':main()
