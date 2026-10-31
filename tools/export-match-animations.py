"""Export small animation-only rigs; reuse source body/arms textures unchanged."""
import json, struct, copy
from pathlib import Path
from gun_to_glb import GLB, ROOT, audit, fp_motion, quaternion, GUNS, SOURCES

BASE=ROOT/'val-strike-html/assets/playable'
BOMB=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/Equippables/Bomb/S0'
report={}
for code in ('smonk','wushu','thorne'):
  for view in ('body','arms'):
    raw=(BASE/f'{code}-{view}.glb').read_bytes()
    original=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    glb=GLB();doc=glb.doc
    doc['nodes']=[{k:copy.deepcopy(v) for k,v in n.items() if k not in ('mesh','skin')} for n in original['nodes']]
    doc['scenes']=copy.deepcopy(original['scenes'])
    names={n.get('name'):i for i,n in enumerate(doc['nodes'])}
    parents={child:i for i,n in enumerate(doc['nodes']) for child in n.get('children',[])}
    def upper(index):
      if any(token in doc['nodes'][index].get('name','').lower() for token in ('weapon','camera')):return True
      while index in parents:
        if doc['nodes'][index].get('name')=='Spine1':return True
        index=parents[index]
      return False
    if view=='body':
      clips={label:BOMB/'3P/Anims'/file for label,file in {
        'plant_UB':'TP_Core_Bomb_S0_Activate_UB.psa','plant_LB':'TP_Core_Bomb_S0_Activate_LB.psa',
        'defuse_UB':'TP_Core_Bomb_S0_Defusal_Loop_UB.psa','defuse_LB':'TP_Core_Bomb_S0_Defusal_Loop_LB.psa'}.items()}
      if code=='wushu':
        dash=ROOT/'model/valorant-model-animations-agents/Content/Characters/Wushu/S0/Ability_E/3P/Anims/TP_Wushu_S0_E_Dash_North.psa'
        clips.update(E_cast_UB=dash,E_cast_LB=dash)
      # The main body exports have idle/reload poses, but no knife strikes.
      # Export the original third-person strikes onto each agent's rig.
      melee=GUNS/SOURCES['Melee']/'S0/3P/Anims'
      for label,file in {'fire':'TP_Core_Melee_S0_Attack01_UB.psa',
                         'fire2':'TP_Core_Melee_S0_Attack02_UB.psa',
                         'fire3':'TP_Core_Melee_S0_Attack03_UB.psa',
                         'firealt':'TP_Core_Melee_S0_Alt_Attack_UB.psa'}.items():
        clips['gun_Melee_'+label+'_UB']=melee/file
      for weapon,relative in SOURCES.items():
        directory=GUNS/relative/'S0/3P/Anims'
        source=next((p for p in sorted(directory.glob('TP_*_Equip_UB.psa'))
                     if not any(v in p.name for v in ('Aggressive','Fury','Tactical','Macaron'))),None)
        if source:clips['gun_'+weapon+'_equip_UB']=source
        if weapon=='Shorty' and source:clips['gun_Shorty_idle_UB']=source
        for state,patterns in {
          'idle':['TP_*_IdlePose_UB.psa','TP_*_Idle_UB.psa'], 'crouch':['TP_*_CrouchPose_UB.psa'],
          'ads':['TP_*_AltIdlePose_UB.psa'], 'adscrouch':['TP_*_AltCrouchPose_UB.psa'],
          'reload':['TP_*_Reload_UB.psa'], 'reloadempty':['TP_*_ReloadEmpty_UB.psa']
        }.items():
          source=next((p for pattern in patterns for p in sorted(directory.glob(pattern))
                       if not any(v in p.name for v in ('Aggressive','Fury','Tactical','Macaron'))),None)
          if source:clips[f'gun_{weapon}_{state}_UB']=source
        # The extracted FireAdd PSA contains full local transforms (not raw
        # additive offsets). Export its full pose so arm lengths stay intact.
        source=next((p for pattern in ('TP_*_FireAdd.psa','TP_*_FireAdd_UB.psa','TP_*_Fire_UB.psa') for p in directory.glob(pattern)),None)
        if source:clips[f'gun_{weapon}_fire_UB']=source
      abilities=ROOT/f'model/valorant-model-animations-agents/Content/Characters/{dict(smonk="Smonk",wushu="Wushu",thorne="Thorne")[code]}/S0'
      patterns={
        'smonk':{'Q_idle':'TP_*_Q_Idle_Pose_UB.psa','E_idle':'TP_*_E_Idle_Pose_UB.psa'},
        'wushu':{'X_idle':'TP_*_X_Idle_UB.psa','X_fire':'TP_*_X_Attack01_UB.psa',
                 'X_fire2':'TP_*_X_Attack02_UB.psa','X_firealt':'TP_*_X_RightClickAttack_UB.psa'},
        'thorne':{'C_idle':'TP_*_E_Idle_UB.psa','Q_idle':'TP_*_4_SlowGrenade_Idle_UB.psa',
                  'E_idle':'TP_*_Q_Idle_UB.psa','E_self':'TP_*_Q_SelfHeal_UB.psa',
                  'X_idle':'TP_*_X_Resurrect_Idle_UB.psa'}
      }[code]
      for label,pattern in patterns.items():
        source=next(abilities.rglob(pattern),None)
        if source:clips[label+'_UB']=source
      # Include every authored equip/cast plus pitch variants, using gameplay
      # slot names (Sage's source E/Q/4 map to C/E/Q in the game).
      specs={
        'smonk':{'C_cast':'4_Boop_Cast','Q_equip':'Q_Equip','Q_cast':'Q_Cast','E_equip':'E_Equip','E_cast':'E_Cast'},
        'wushu':{'C_cast':'4_Smoke_Cast_Outro','Q_cast':'Q_CycloneBoost_Activate','E_cast':'E_DashN','X_equip':'X_Equip'},
        'thorne':{'C_equip':'E_Equip','C_cast':'E_Cast','Q_equip':'4_SlowGrenade_Equip',
                  'Q_cast':'4_SlowGrenade_Activate','E_equip':'Q_Equip','E_cast':'Q_AllyCast',
                  'X_equip':'X_Resurrect_Equip','X_cast':'X_Resurrect_Activate'}
      }[code]
      for label,stem in specs.items():
        source=next(abilities.rglob('TP_*_'+stem+'_UB.psa'),None)
        if source:clips[label+'_UB']=source
      for label,stem in ({'Q_cast':'Q_Cast'} if code=='smonk' else
                         {'Q_cast':'4_SlowGrenade_Activate'} if code=='thorne' else
                         {'X_fire':'X_Attack01','X_fire2':'X_Attack02','X_firealt':'X_RightClickAttack'}).items():
        for angle in ('N45','N90','S45','S90'):
          source=next(abilities.rglob('TP_*_'+stem+'_'+('Aim' if code=='thorne' else '')+angle+'_UB.psa'),None)
          if source:clips[label+'_'+angle+'_UB']=source
    else:
      clips={'plant':BOMB/'1P/Anims/FP_Core_Bomb_S0_Activate.psa','defuse':BOMB/'1P/Anims/FP_Core_Bomb_S0_Defusal_Loop.psa'}
    for label,path in clips.items():
      chunks=audit.chunks(path);info=struct.unpack_from('<64s64s4i3f3i',chunks['ANIMINFO'][2])
      size,count,data=chunks['BONENAMES'];lookup={data[i*size:].split(b'\0')[0].decode():i for i in range(count)}
      frames=[info[11]-1] if label=='gun_Shorty_idle_UB' else list(range(info[11]));times=glb.accessor([(f-frames[0])/info[8] for f in frames],'SCALAR',1,bounds=True)
      animation={'name':label,'samplers':[],'channels':[]};stride,_,keys=chunks['ANIMKEYS']
      def track(index,kind,values,n):
        animation['channels'].append({'sampler':len(animation['samplers']),'target':{'node':index,'path':kind}})
        animation['samplers'].append({'input':times,'output':glb.accessor(values,'VEC'+str(n),n),'interpolation':'LINEAR'})
      for name,index in names.items():
        if name not in lookup:continue
        if view=='body' and (label.endswith('_LB') and upper(index) or label.endswith('_UB') and not upper(index)):continue
        translation=[];rotation=[];previous=None
        for frame in frames:
          key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+lookup[name])*stride);q=list(key[3:7])
          if name!='Skeleton':q[:3]=[-v for v in q[:3]]
          if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
          previous=q;translation.extend(key[:3]);rotation.extend(q)
        track(index,'translation',translation,3);track(index,'rotation',rotation,4)
      if view=='arms' and 'camera_compensation' in names:
        _,poses=fp_motion(path,True);position=[];rotation=[];previous=None
        for frame in frames:
          pose=poses[frame];q=quaternion(pose)
          if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
          previous=q;position.extend(pose[i] for i in (3,7,11));rotation.extend(q)
        track(names['camera_compensation'],'translation',position,3);track(names['camera_compensation'],'rotation',rotation,4)
      doc['animations'].append(animation)
    target=ROOT/f'val-strike-html/assets/match/{code}-{view}-animations.glb';glb.save(target)
    report[target.name]={'bytes':target.stat().st_size,'clips':list(clips),'source':[str(p.relative_to(ROOT)) for p in clips.values()]}
(ROOT/'val-strike-html/assets/match/animations.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:{'bytes':v['bytes'],'clips':v['clips']} for k,v in report.items()}))
