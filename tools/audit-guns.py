"""Read the extracted PSK/PSA headers without starting Blender or a renderer."""
import json, struct, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
GUNS = ROOT / 'model/valorant-model-animations-gun/ShooterGame/Content/Equippables/Guns'
def chunks(path):
    data = path.read_bytes(); result = {}; cursor = 0
    while cursor + 32 <= len(data):
        name, _, size, count = struct.unpack_from('<20s3i', data, cursor)
        cursor += 32
        if size < 0 or count < 0 or cursor + size * count > len(data): raise ValueError(path)
        result[name.split(b'\0')[0].decode()] = (size, count, data[cursor:cursor + size * count])
        cursor += size * count
    return result
def anim_info(path):
    c = chunks(path); size, count, data = c['ANIMINFO']
    info = struct.unpack_from('<64s64s4i3f3i', data)
    return {'file': path.name, 'bones': info[2], 'fps': info[8], 'frames': info[11], 'duration': (info[11] - 1) / info[8]}
report = []
for directory in sorted(GUNS.glob('*/*/S0/1P')):
    gun = directory.parents[1].name
    mesh = directory / 'Models' / f'GN_{gun}_S0_Skelmesh.psk'
    if not mesh.exists(): continue
    c = chunks(mesh)
    animations = list((directory / 'Anims').glob('*.psa'))
    selected = [p for p in animations if p.stem.endswith(('_Fire', '_Reload', '_Equip', '_Inspect')) and '_Montage' not in p.stem]
    report.append({'gun': gun, 'mesh': str(mesh.relative_to(ROOT)), 'points': c['PNTS0000'][1],
        'triangles': c.get('FACE0000', c.get('FACE3200'))[1], 'bones': c['REFSKELT'][1],
        'animationCount': len(animations), 'animations': [anim_info(p) for p in selected]})
if __name__ == '__main__':
    if '--full' in sys.argv: print(json.dumps(report, ensure_ascii=False, indent=2))
    else: print(json.dumps([{k: v for k, v in item.items() if k not in ('animations', 'mesh')} for item in report], indent=2))
