"""Bounded animation-only banks retaining native bone names and FP camera compensation."""
import copy,gc,json,struct

def glb_header(path):
    with path.open('rb')as stream:
        header=stream.read(20);length=struct.unpack_from('<I',header,12)[0]
        return json.loads(stream.read(length))

def animation_banks(export,view,clips,*,code,playable,package):
    original=glb_header(playable/f'{code}-{view}.glb');base_nodes=[{k:copy.deepcopy(v)for k,v in n.items()if k not in ('mesh','skin')}for n in original['nodes']]
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
        number+=1;filename=f'{code}-{view}-animations'+(''if number==1 else f'-{number:02d}')+'.glb'
        target=package/'assets/match'/filename;glb.save(target)
        banks.append({'file':target.relative_to(package).as_posix(),'bytes':target.stat().st_size,'clips':bank_clips})
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
        glb.doc['animations'].append(animation);bank_clips.append({'name':label,'source':path.relative_to(export.ROOT).as_posix(),'frames':info[11],'fps':info[8]})
        if len(glb.data)>8*1048576 or len(bank_clips)>=24:flush()
    flush();return banks

