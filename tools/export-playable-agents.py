"""CPU-only PSK/PSA exporter for bounded, per-agent gameplay assets."""
import json, math, struct, sys
from functools import lru_cache
from pathlib import Path
from gun_to_glb import GLB, audit, matrix, multiply, inverse_rigid, quaternion, fp_motion, ROOT, SOURCES, GUNS

BASE=ROOT/'model/valorant-model-animations-agents/Content/Characters'
OUT=ROOT/'val-strike-html/assets/playable'

@lru_cache(maxsize=1)
def source_index():
    content=BASE.parent
    files=list(content.rglob('*.png'))+list(content.rglob('*.json'))
    return {str(p.relative_to(content)).replace('\\','/').lower():p for p in files}

def material_source(name, path, include_metadata=False):
    # Material instances can rename textures completely (Jett tattoo overlay,
    # Sage's 1P/3P crystals, knives). Read exported UE references first.
    index=source_index()
    candidates=[p for p in index.values() if p.suffix=='.json' and p.stem==name]
    candidates.sort(key=lambda p:-len(set(p.parts)&set(path.parts)))
    metadata=json.loads(candidates[0].read_text(encoding='utf-8-sig')) if candidates else {}
    textures={}
    for channel,keys in {'albedo':['Albedo','PM_Diffuse','OverlayTexture'],'normal':['Normal','PM_Normals'],'packed':['MRAE','PM_SpecularMasks']}.items():
        for key in keys:
            reference=metadata.get('Textures',{}).get(key,{})
            reference=reference.get('ObjectPath') or reference.get('AssetPathName','')
            relative=reference.removeprefix('/Game/').rsplit('.',1)[0]+'.png'
            if relative.lower() in index:textures[channel]=index[relative.lower()];break
    stem=name.removeprefix('OverlayMaterialInstance_').removesuffix('_MI').removesuffix('_Mat')
    for channel,suffix in [('albedo','_DF'),('normal','_NM'),('packed','_MRAE')]:
        if channel not in textures:
            match=next((p for p in path.parents[2].rglob('*.png') if p.stem.lower()==(stem+suffix).lower()),None)
            if match:textures[channel]=match
    return (textures,metadata)if include_metadata else textures

def export_mesh(path, target, clips=None, mask=False, external_textures=None, split_bone_parts=None, compact_tracks=False, rest_clips=(), respect_native_materials=False):
    c=audit.chunks(path)
    def rec(key,fmt):
        size,count,data=c[key]; return [struct.unpack_from(fmt,data,i*size) for i in range(count)]
    points=rec('PNTS0000','<3f'); wedges=rec('VTXW0000','<IffB3x')
    faces=rec('FACE0000','<3HBBI') if 'FACE0000' in c else rec('FACE3200','<3IBBI')
    bones=rec('REFSKELT','<64s3i7f') if 'REFSKELT' in c else []
    names=[b[0].split(b'\0')[0].decode() for b in bones]
    glb=GLB();glb.texture_limit=None;glb.preserve_alpha=True;glb.external_image_folder=external_textures;glb.external_image_base=target.parent;d=glb.doc
    d['nodes']=[{'name':path.stem,'rotation':quaternion([0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1]),'scale':[.01]*3,'children':[]}]
    world=[]
    for i,b in enumerate(bones):
        q=list(b[4:8]); parent=b[3]
        if parent>=0:q[:3]=[-v for v in q[:3]]
        d['nodes'].append({'name':names[i],'translation':list(b[8:11]),'rotation':q,'children':[]})
        d['nodes'][parent+1 if parent>=0 else 0]['children'].append(i+1)
        local=matrix(b[8:11],q);world.append(multiply(world[parent],local) if parent>=0 else local)
    weights=[[] for _ in points]
    if bones:
        for w,p,b in rec('RAWWEIGHTS','<fii'):weights[p].append((b,w))
    if path.stem.startswith('FP_'):
        proximal={i for i,n in enumerate(names) if n in ('Skeleton','Root','L_Clavicle','R_Clavicle','L_Shoulder','R_Shoulder','L_ShoulderPad','R_ShoulderPad')}
        faces=[f for f in faces if not all(sum(w for b,w in weights[wedges[v][0]] if b in proximal)>.95 for v in f[:3])]
    parts={}
    for label,roots in (split_bone_parts or {}).items():
        included=set()
        for i in range(len(bones)):
            ancestor=i
            while ancestor>=0:
                if names[ancestor]in roots:included.add(i);break
                ancestor=bones[ancestor][3]
        parts[label]=included
    normals=[[0.,0.,0.] for _ in wedges];groups={}
    for a,b,e,m,*_ in faces:
        part=next((label for label,included in parts.items()if all(sum(w for bone,w in weights[wedges[v][0]]if bone in included)>.5 for v in (a,b,e))),'body')
        groups.setdefault((part,m),[]).extend((a,b,e));p,q,r=[points[wedges[i][0]] for i in (a,b,e)]
        u=[q[i]-p[i] for i in range(3)];v=[r[i]-p[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for j in (a,b,e):normals[j]=[normals[j][i]+n[i] for i in range(3)]
    attrs={'POSITION':[],'NORMAL':[],'TEXCOORD_0':[]}
    if bones:attrs.update(JOINTS_0=[],WEIGHTS_0=[])
    for i,(p,u,v,_) in enumerate(wedges):
        attrs['POSITION'].extend(points[p]);attrs['TEXCOORD_0'].extend((u,v))
        length=math.sqrt(sum(x*x for x in normals[i])) or 1;attrs['NORMAL'].extend(x/length for x in normals[i])
        if bones:
            w=sorted(weights[p],key=lambda x:-x[1])[:4] or [(0,1.)];total=sum(x[1] for x in w)
            attrs['JOINTS_0'].extend([x[0] for x in w]+[0]*(4-len(w)));attrs['WEIGHTS_0'].extend([x[1]/total for x in w]+[0.]*(4-len(w)))
    attributes={}
    for key,values in attrs.items():
        size=2 if key=='TEXCOORD_0' else 4 if key in ('JOINTS_0','WEIGHTS_0') else 3
        attributes[key]=glb.accessor(values,'VEC'+str(size),size,34962,5123 if key=='JOINTS_0' else 5126,key=='POSITION')
    materials=rec('MATT0000','<64s');material_report=[];image_cache={}
    def texture_image(path,packing=None):
        key=(str(path),packing)
        if key not in image_cache:image_cache[key]=glb.image(path,packing)
        return image_cache[key]
    for index,m in enumerate(materials):
        name=m[0].split(b'\0')[0].decode();textures,metadata=material_source(name,path,True)
        material={'name':name,'doubleSided':True,'pbrMetallicRoughness':{'metallicFactor':0,'roughnessFactor':.85}}
        if respect_native_materials:
            overrides=metadata.get('Properties',{}).get('BasePropertyOverrides',{})
            if metadata.get('BlendMode')==1 or overrides.get('BlendMode')=='EBlendMode::BLEND_Masked':material.update(alphaMode='MASK',alphaCutoff=overrides.get('OpacityMaskClipValue',.3333))
            elif metadata.get('IsTranslucent'):material.update(alphaMode='BLEND')
        if name=='TP_Thorne_S0_Orb_MI':
            # Native material's Diffuse Tint and Inner Color vector parameters;
            # the UE procedural sphere has no conventional albedo texture.
            material['pbrMetallicRoughness'].update(baseColorFactor=[0,.67228,.992157,1],roughnessFactor=.25)
            material['emissiveFactor']=[0,.173177,.076267]
        if name=='TP_Core_Eye_MI':material.update(alphaMode='BLEND')
        if textures.get('albedo'):material['pbrMetallicRoughness']['baseColorTexture']=texture_image(textures['albedo'])
        if textures.get('normal'):material['normalTexture']=texture_image(textures['normal'],'normal')
        # UE MRAE = metallic, roughness, AO, emissive. glTF ORM = AO, roughness, metallic.
        if textures.get('packed'):
            packed=texture_image(textures['packed'],'mrae')
            material['pbrMetallicRoughness'].update(metallicFactor=.12,metallicRoughnessTexture=packed,roughnessFactor=1)
            material['occlusionTexture']=packed
        d['materials'].append(material)
        material_report.append({'material':name,'textures':{key:str(p.relative_to(ROOT)) for key,p in textures.items()},'runtimeTint':name=='WorldGridMaterial' or not textures.get('albedo')})
    if not materials:d['materials']=[{'pbrMetallicRoughness':{'baseColorFactor':[.5,.85,.9,1]}}]
    d['meshes']=[]
    part_nodes=[]
    for part in dict.fromkeys(label for label,_ in groups):
        mesh={'name':path.stem+(''if part=='body'else'_'+part),'primitives':[{'attributes':attributes,'indices':glb.accessor(indices,'SCALAR',1,34963,5125),'material':min(m,len(d['materials'])-1)} for (label,m),indices in groups.items()if label==part]}
        d['meshes'].append(mesh);part_nodes.append({'name':'geometry'if part=='body'else'geometry_'+part,'mesh':len(d['meshes'])-1})
    if bones:
        for node in part_nodes:node['skin']=0
        d['skins']=[{'joints':list(range(1,len(bones)+1)),'skeleton':1,'inverseBindMatrices':glb.accessor([v for m in world for v in inverse_rigid(m)],'MAT4',16)}]
    for node in part_nodes:d['nodes'][0]['children'].append(len(d['nodes']));d['nodes'].append(node)
    for label,path_ in (clips or {}).items():
        source=audit.chunks(path_);info=struct.unpack_from('<64s64s4i3f3i',source['ANIMINFO'][2]);size,count,data=source['BONENAMES']
        lookup={data[i*size:].split(b'\0')[0].decode():i for i in range(count)}
        frames=list(range(info[11]))
        times=glb.accessor([f/info[8] for f in frames],'SCALAR',1,bounds=True);animation={'name':label,'samplers':[],'channels':[]}
        stride,_,keys=source['ANIMKEYS']
        def add_track(index,kind,values,n):
            track_times=times
            if compact_tracks and len(frames)>2 and all(values[j]==values[j%n]for j in range(n,len(values))):
                track_times=glb.accessor([frames[0]/info[8],frames[-1]/info[8]],'SCALAR',1,bounds=True);values=values[:n]*2
            animation['channels'].append({'sampler':len(animation['samplers']),'target':{'node':index,'path':kind}})
            animation['samplers'].append({'input':track_times,'output':glb.accessor(values,'VEC'+str(n),n),'interpolation':'LINEAR'})
        for i,name in enumerate(names):
            if name not in lookup:continue
            # Source LB files include reference upper-body poses. Exclude them.
            upper=any(token in name.lower() for token in ('spine','chest','neck','head','clav','shoulder','elbow','wrist','sleeve','twist','arm','hand','finger','thumb','index','middle','ring','pinky','weapon','palm','callus','thenar','camera'))
            ancestor=i
            while ancestor>=0:
                if names[ancestor]=='Spine1':upper=True;break
                ancestor=bones[ancestor][3]
            if mask and ((label.endswith('_LB') and upper) or (label.endswith('_UB') and not upper)):continue
            translations=[];rotations=[];previous=None
            for frame in frames:
                key=struct.unpack_from('<7f',keys,((info[10]+frame)*info[2]+lookup[name])*stride);q=list(key[3:7])
                if bones[i][3]>=0:q[:3]=[-v for v in q[:3]]
                if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
                previous=q;translations.extend(key[:3]);rotations.extend(q)
            for kind,values,n in [('translation',translations,3),('rotation',rotations,4)]:
                add_track(i+1,kind,values,n)
                if label in rest_clips:d['nodes'][i+1][kind]=values[:n]
        if 'FP_' in path.stem:
            # FP source poses contain camera travel; cancel it below the axis basis.
            if 'camera_compensation' not in [n['name'] for n in d['nodes']]:
                children=d['nodes'][0]['children'];d['nodes'][0]['children']=[len(d['nodes'])]
                d['nodes'].append({'name':'camera_compensation','children':children})
            compensation=next(i for i,n in enumerate(d['nodes']) if n['name']=='camera_compensation')
            fps,poses=fp_motion(path_,True);positions=[];rotations=[];previous=None
            for frame in frames:
                pose=poses[frame];q=quaternion(pose)
                if previous and sum(a*b for a,b in zip(q,previous))<0:q=[-v for v in q]
                previous=q;positions.extend(pose[i] for i in (3,7,11));rotations.extend(q)
            for kind,values,n in [('translation',positions,3),('rotation',rotations,4)]:
                add_track(compensation,kind,values,n)
                if label in rest_clips:d['nodes'][compensation][kind]=values[:n]
        if animation['channels']:d['animations'].append(animation)
    glb.save(target);return {'file':str(target.relative_to(ROOT)),'bytes':target.stat().st_size,'vertices':len(wedges),'bones':len(bones),'materials':material_report,'clips':[a['name'] for a in d['animations']],'parts':{part:sum(len(ix)//3 for(label,_),ix in groups.items()if label==part)for part,_ in groups},'externalTextures':[image['uri']for image in d['images']if 'uri'in image]}

def main():
    report={};core=BASE/'_Core/3P/Anims'
    clips={}
    for state in ('Run','Walk','CrouchWalk'):
        for direction in ('N','NE','E','SE','S','SW','W','NW'):
            p=core/f'TP_Core_{state}{direction}_LB.psa'
            if p.exists():clips[f'{state}{direction}_LB']=p
    for name in ('Idle_LB','Idle_UB','CrouchIdle_LB','Jump_LB','JumpLand_LB','DeathSplat'):
        p=core/f'TP_Core_{name}.psa'
        if p.exists():clips[name]=p
    clips['DeathSplat']=core/'TP_Core_Death_Splat.psa'
    # Gun upper-body poses use the same core 3P skeleton. Keep them separate
    # from lower-body movement so running/reloading cannot overwrite legs.
    for weapon,relative in SOURCES.items():
        directory=GUNS/relative/'S0/3P/Anims'
        if not directory.exists():continue
        for state,pattern in [('idle','TP_*_IdlePose_UB.psa'),('reload','TP_*_Reload_UB.psa')]:
            p=next(directory.glob(pattern),None)
            if p:clips[f'gun_{weapon}_{state}_UB']=p
    for name,code in [('Clove','Smonk'),('Jett','Wushu'),('Sage','Thorne')]:
        base=BASE/code/'S0';body_clips=dict(clips)
        tp_patterns={
          'Clove':{'C_cast':'TP_*_4_Boop_Cast_UB.psa','Q_equip':'TP_*_Q_Equip_UB.psa','Q_cast':'TP_*_Q_Cast_UB.psa','E_equip':'TP_*_E_Equip_UB.psa','E_cast':'TP_*_E_Cast_UB.psa'},
          'Jett':{'C_cast':'TP_*_4_Smoke_Cast_Outro_UB.psa','Q_cast':'TP_*_Q_CycloneBoost_Activate_UB.psa','E_cast':'TP_*_E_DashN_UB.psa','X_equip':'TP_*_X_Equip_UB.psa','X_fire':'TP_*_X_Attack01_UB.psa'},
          'Sage':{'C_equip':'TP_*_E_Equip_UB.psa','C_cast':'TP_*_E_Cast_UB.psa','Q_equip':'TP_*_4_SlowGrenade_Equip_UB.psa','Q_cast':'TP_*_4_SlowGrenade_Activate_UB.psa','E_equip':'TP_*_Q_Equip_UB.psa','E_cast':'TP_*_Q_AllyCast_UB.psa','X_equip':'TP_*_X_Resurrect_Equip_UB.psa','X_cast':'TP_*_X_Resurrect_Activate_UB.psa'}
        }[name]
        for label,pattern in tp_patterns.items():
            p=next(base.rglob(pattern),None)
            if p:body_clips[label+'_UB']=p
        report[name]={'body':export_mesh(base/f'3P/Models/TP_{code}_S0_Skelmesh.psk',OUT/f'{code.lower()}-body.glb',body_clips,True),'sourceAbilities':[],'effects':{}}
        # One selected-agent arms file; poses are driven by the weapon/ability rig.
        patterns={
          'Clove':{'C_cast':'FP_*_4_Fast_Cast.psa','Q_equip':'FP_*_Q_Butterfly_Equip.psa','Q_idle':'FP_*_Q_Butterfly_IdlePose.psa','Q_cast':'FP_*_Q_Butterfly_Toss.psa','E_equip':'FP_*_E_Equip.psa','E_cast':'FP_*_E_Cast.psa','X_cast':'FP_*_X_Revive.psa'},
          'Jett':{'C_cast':'FP_*_4_Smoke_Grenade_intro.psa','Q_cast':'FP_*_Q_CycloneBoost_Activate.psa','E_cast':'FP_*_E_DashN.psa','X_equip':'FP_*_X_Equip.psa','X_idle':'FP_*_X_IdlePose.psa','X_fire':'FP_*_X_Attack01.psa','X_alt':'FP_*_X_RightClickAttack.psa'},
          'Sage':{'C_equip':'FP_*_E_Equip.psa','C_idle':'FP_*_E_IdlePose.psa','C_cast':'FP_*_E_Wall_Cast.psa','Q_equip':'FP_*_4_SlowGrenade_Equip.psa','Q_idle':'FP_*_4_SlowGrenade_IdlePose.psa','Q_cast':'FP_*_4_SlowGrenade_Activate.psa','E_equip':'FP_*_Q_Equip.psa','E_idle':'FP_*_Q_IdlePose.psa','E_cast':'FP_*_Q_Ally_Cast.psa','E_self':'FP_*_Q_Self_Cast.psa','X_equip':'FP_*_X_Resurrect_Equip.psa','X_idle':'FP_*_X_Resurrect_IdlePose.psa','X_cast':'FP_*_X_Resurrect_Activate.psa'}
        }[name]
        fp_clips={label:next(base.rglob(pattern),None) for label,pattern in patterns.items()}
        if name=='Jett':
            for variant in range(1,6):fp_clips[f'X_fire{variant}']=next(base.rglob(f'FP_*_X_Attack0{variant}.psa'),None)
        if name=='Clove':fp_clips['E_idle']=next(base.rglob('FP_*_E_Idle_Pose.psa'),None)
        fp_clips={label:p for label,p in fp_clips.items() if p}
        report[name]['arms']=export_mesh(base/f'1P/Models/FP_{code}_S0_Skelmesh.psk',OUT/f'{code.lower()}-arms.glb',fp_clips)
        if name=='Clove':
            res_fp={key:base/'Ability_X/1P/Anims'/f'FP_Smonk_S0_X_{clip}.psa' for key,clip in {'X_cast':'Revive','idle':'Idle','walk':'Walk','run':'Run','outro':'Embody'}.items()}
            report[name]['resurrectionArms']=export_mesh(base/'Ability_X/1P/Models/FP_Smonk_S0_X_Resurrection_Skelmesh.psk',OUT/'smonk-resurrection-arms.glb',res_fp)
            res_clips={key:next(base.rglob(pattern)) for key,pattern in {'intro':'TP_Smonk_Resurrection_S0_X_Intro.psa','idle':'TP_Smonk_Resurrection_S0_X_Resurrection_Idle_Loop.psa','outro':'TP_Smonk_Resurrection_S0_X_Outro_Montage.psa'}.items()}
            report[name]['resurrectionBody']=export_mesh(base/'Ability_X/3P/Models/AB_Smonk_S0_X_Resurrection_Skelmesh.psk',OUT/'smonk-resurrection-body.glb',res_clips)
        for p in base.rglob('*'):
            if p.suffix in ('.psk','.pskx','.psa') and ('Ability_' in str(p) or 'VFX' in str(p)):
                report[name]['sourceAbilities'].append(str(p.relative_to(ROOT)))
        candidates={
          'Clove':{'meddle':'SMO_Q_Orb_SM.pskx','butterfly':'AB_Smonk_S0_Q_Butterfly_Skelmesh.psk','smoke':'SMO_E_Smoke-Outer-100_SM.pskx','smoke-inner':'SMO_E_Smoke-Inner-100_SM.pskx','pickup-swirl':'SMO_C_Swirl_SM.pskx','meddle-ribbon':'SMO_Q_FormationRibbon01_SM.pskx','meddle-swipe':'SMO_Q_Handswipe_SM.pskx','res-shockwave':'SMO_X_Shockwave02_SM.pskx','res-swipe':'SMO_X_ResSwipe_SM.pskx'},
          'Jett':{'knife':'AB_Wushu_S0_X_Staticmesh.pskx','updraft':'WushuQ_Hemisphere_PlanarUV.pskx','dash-left':'JettDashSplinemeshesLEFT_01.pskx','dash-right':'JettDashSplinemeshesRIGHT_01.pskx','knife-twirl':'Wushu_X_1P_TwirlTrail.pskx','knife-fan':'Wushu_X_1p_FanOut.pskx'},
          'Sage':{'orb':'AB_Thorne_S0_4_Staticmesh.pskx','wall':'AB_Thorne_S0_E.pskx','wall-beams':'AB_Thorne_S0_E_beams.pskx','wall-indicator':'Thorn_C_Indicator.pskx','wall-wisp':'Thorn_C_Wisp.pskx','wall-ground':'ThorneWallGroundBox.pskx','wall-skirt':'ThorneWallSkirtNew.pskx','heal-ribbon':'Thorn_E_1P_AllyHealingRibbon_new.pskx','res-ribbon':'Thorn_X_Res_3P_Ribbon.pskx','res-body':'AB_Thorne_S0_X_Body.pskx','orb-energy':'Thorn_E_1P_Healing_Orb_EnergyFlipbook.pskx'}
        }[name]
        for label,filename in candidates.items():
            p=next(base.rglob(filename),None)
            if p:report[name]['effects'][label]=export_mesh(p,OUT/f'{code.lower()}-{label}.glb')
    (OUT/'manifest.json').write_text(json.dumps(report,indent=2))
    for code in ('Hunter','Nox'):
        target=ROOT/f'val-strike-html/assets/agents/{code.lower()}.glb'
        source=next((BASE/code/'S0/3P/Models').rglob('*.psk'),None)
        if source and not target.exists():export_mesh(source,target,{'Idle':clips['Idle_LB']})
    print(json.dumps({k:{'bodyMiB':round(v['body']['bytes']/1048576,2),'clips':len(v['body']['clips']),'sourceAbilities':len(v['sourceAbilities']),'effects':list(v['effects'])} for k,v in report.items()},indent=2))

if __name__=='__main__':main()
