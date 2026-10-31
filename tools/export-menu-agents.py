"""Rebuild the three playable menu agents with native materials/motion, CPU only."""
import importlib.util,json,re,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('playable_export',ROOT/'tools/export-playable-agents.py')
export=importlib.util.module_from_spec(spec);spec.loader.exec_module(export)
agents=json.loads(re.search(r'=\s*(\[.*\]);',(ROOT/'val-strike-html/js/agents.js').read_text(),re.S)[1])
core=export.BASE/'_Core/3P/Anims';out=ROOT/'val-strike-html/assets/agents';report=json.loads((out/'manifest.json').read_text()) if (out/'manifest.json').exists() else {}
for agent in agents:
    if not agent['playable']:continue
    if len(sys.argv)>1 and agent['name'] not in sys.argv[1:]:continue
    base=export.BASE/agent['codename']/'S0'
    mesh=next(base.glob('CharSelect/**/CS_*Skelmesh*.psk'),None) or next(base.glob('3P/**/TP_*Skelmesh*.psk'),None) or next(base.glob('3P/**/SkeletalMesh_0.psk'),None)
    if mesh is None:raise RuntimeError('No native body for '+agent['name'])
    clips={}
    for label in ['Idle_LB','Idle_UB']:
        p=core/f'TP_Core_{label}.psa'
        if p.exists():clips[label]=p
    face=next(base.glob('3P/**/TP_*_Face_Idle*.psa'),None)
    if face:clips['FaceIdle_UB']=face
    native=sorted(p for p in base.glob('CharSelect/**/*.psa') if p.name.startswith('CS_') and not any(s in p.name for s in ['Montage','SEQ','StaticPose','PoseDriver']))
    idle=next((p for p in native if 'Idle' in p.name),None)
    intro=next((p for p in native if 'Intro' in p.name),None) or next((p for p in native if 'Shot_01' in p.name),None) or next((p for p in native if 'CharSelect' in p.name and 'Idle' not in p.name),None)
    if idle:clips['CharSelectIdle']=idle
    if intro:clips['CharSelectIntro']=intro
    if not clips:raise RuntimeError('No animation for '+agent['name'])
    report[agent['name']]=export.export_mesh(mesh,out/agent['file'],clips,mask=True)
    (out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(agent['name'],report[agent['name']]['clips'],flush=True)
(out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
images=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI/Textures/GameModes'
for mode,source in [('unrated','Unrated'),('deathmatch','Deathmatch'),('custom','CustomGame')]:
    shutil.copy2(images/f'TX_UI_GameMode_Cover_{source}.png',ROOT/f'val-strike-html/assets/menu/queue-{mode}.png')
