"""Keep the menu roster and the three implemented kits consistent, offline."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'val-strike-html'
path=ROOT/'game/config/agents.json'
config=json.loads(path.read_text(encoding='utf-8-sig'))
kits=json.loads((ROOT/'game/config/playable-agents.json').read_text())
roster=[]
for agent in config['agents']:
    agent['available']=(ROOT/'assets/agents'/agent['file']).exists()
    if agent['name'] in kits:
        kit=kits[agent['name']];agent['ultCost']=kit['ultCost']
        agent['abilities']={slot:kit[slot] for slot in ('C','Q','E','X')}
    roster.append({key:agent[key] for key in ('name','codename','file','role','available','playable')})
config['_comment']='Canonical model roster checked 2026-10-09. Only Clove/Jett/Sage kits are implemented and researched; other kits remain historical plan data.'
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'js/agents.js').write_text('// Canonical codenames: valorant-api.com; checked 2026-10-09.\nwindow.VS_AGENTS = '+json.dumps(roster,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print(json.dumps({'roster':len(roster),'available':sum(a['available'] for a in roster),'playable':[a['name'] for a in roster if a['playable']]}))
