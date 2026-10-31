"""Publish the Haven runtime and map/mode integration, excluding authoring files."""
from pathlib import Path
import json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
files=['server/server.cjs','server/room.cjs','server/world.cjs','val-strike-html/index.html',
 'val-strike-html/js/menu.js','val-strike-html/js/asset-preloader.js','val-strike-html/css/menu.css',
 'val-strike-html/assets/ui/haven.png','val-strike-html/assets/menu/haven-background.png',
 'val-strike-html/game/config/haven-match.json']
for name in ['maps.js','config-loader.js','engine.js','map-streamer.js','player.js','agent-clove.js','hud-map.js','match-runtime.js','match-bots.js','multiplayer.js','ui-overlay.js','entry-flow.js','entry-flow.css','game.html']:
 files.append('val-strike-html/game/'+name)
base='val-strike-html/assets/maps/optimized/haven-art/'
manifest=json.loads((ROOT/base/'manifest.json').read_text(encoding='utf-8'))
files.extend(base+name for name in ['manifest.json','collision.glb','match-navigation.json','haven-atlas.png'])
files.extend(base+chunk['file']for chunk in manifest['chunks'])
for name in files:
 if not (ROOT/name).is_file():raise FileNotFoundError(name)
(ROOT/'tools/.artifacts/haven-release-files.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
subprocess.run([sys.executable,'-X','utf8','tools/upload-assets.py','--only',*files],cwd=ROOT,check=True)
