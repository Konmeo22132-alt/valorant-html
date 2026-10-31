"""Export shared dart-removal animation banks without a renderer or Blender."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('cypher_convert', ROOT / 'tools/convert-cypher.py')
convert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(convert)
convert.PACKAGE = ROOT / 'tools/converted/cypher-dart'
convert.OUT = ROOT / 'val-strike-html/assets/playable'
(convert.PACKAGE / 'assets/match').mkdir(parents=True, exist_ok=True)
exporter = convert.load_exporter()
base = ROOT / 'model/valorant-model-animations-agents/Content/Characters/_Core/3P/Anims'
clips = {
    'body': {f'dart_remove_{label}_{view}': base / f'TP_Core_DartRemoval_{native}_{view}.psa'
             for label, native in [('intro', 'intro'), ('loop', 'Loop'), ('outro', 'Outro')]
             for view in ['UB', 'LB']},
    'arms': {k: v for k, v in convert.arms_skills().items() if k.startswith('dart_remove_')},
}
report = {}
for view, bank_clips in clips.items():
    banks = convert.animation_banks(exporter, view, bank_clips)
    if len(banks) != 1:
        raise RuntimeError('Unexpected dart bank count')
    target = ROOT / 'val-strike-html/assets/match' / f'cypher-dart-{view}.glb'
    shutil.copy2(convert.PACKAGE / banks[0]['file'], target)
    report[view] = {'file': target.relative_to(ROOT).as_posix(),
                    'bytes': target.stat().st_size, 'clips': banks[0]['clips']}
(ROOT / 'tools/art-review/cypher/dart-animation-manifest.json').write_text(
    json.dumps(report, indent=2) + '\n', encoding='utf-8')
