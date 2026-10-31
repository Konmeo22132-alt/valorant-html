from pathlib import Path
import json, re, shutil

root = Path(__file__).resolve().parents[1]
out = root / 'val-strike-html/assets/menu'
out.mkdir(parents=True, exist_ok=True)
ui = root / 'model/valorant-model-animations-gun/ShooterGame/Content/UI'
agents = json.loads(re.search(r'window.VS_AGENTS\s*=\s*(\[.*\])', (root / 'val-strike-html/js/agents.js').read_text(encoding='utf-8'), re.S).group(1))
overrides = {'Skye':'Guide_256','KAY/O':'Grenadier','Jett':'Wushu','Sage':'Thorne','Omen':'Wraith','Cypher':'Gumshoe','Sova':'Hunter','Brimstone':'Sarge','Astra':'Rift','Viper':'Pandemic','Yoru':'Stealth','Harbor':'Mage','Waylay':'Terra','Tejo':'Cashew','Veto':'Pine'}
report = {}
for agent in agents:
    name = agent['name']
    source = ui / 'Shared/Icons/Character/Thumbnails' / ('TX_Character_Thumb_' + overrides.get(name,name) + '.png')
    if not source.exists():
        raise FileNotFoundError(source)
    # Slash in KAY/O is a canonical display name; URL points to KAY%2FO.png,
    # which the HTTP handler resolves as KAY/O.png, so preserve its directory.
    target = out / ('thumb-' + name + '.png')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source,target)
    report[name] = str(source.relative_to(root))
source = ui / 'Textures/MapBackgrounds/TX_UI_Background_Map_Abyss.png'
shutil.copy2(source,out/'abyss-background.png')
(out/'manifest.json').write_text(json.dumps({'agents':report,'background':str(source.relative_to(root))},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Prepared {len(report)} real portraits and Abyss background.')
