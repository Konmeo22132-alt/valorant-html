"""Read a few source datablocks without loading the whole scene or rendering."""
import bpy
import json
import mathutils
import struct
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / 'val-strike-html/assets/maps/raw/abyss.blend'
with bpy.data.libraries.load(str(source), link=False) as (available, selected):
    names = [n for n in available.objects if 'skydome' in n.lower() or n == 'Appliances_0_GunRackA']
    selected.objects = names

result = []
for obj in selected.objects:
    if not obj or obj.type != 'MESH':
        continue
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    result.append({'name': obj.name, 'scale': list(obj.scale), 'location': list(obj.location),
                   'min': low, 'max': high, 'span': [high[i] - low[i] for i in range(3)]})
print('VS_SOURCE_SCALE ' + json.dumps(result))
with (root / 'val-strike-html/assets/maps/optimized/abyss_lowpoly.glb').open('rb') as stream:
    header = stream.read(20)
    document = json.loads(stream.read(struct.unpack_from('<I', header, 12)[0]))
sky_node = next(n for n in document['nodes'] if 'skydome' in n.get('name', '').lower())
accessor = document['accessors'][document['meshes'][sky_node['mesh']]['primitives'][0]['attributes']['POSITION']]
original = next(obj for obj in result if obj['name'] == sky_node['name'])
exported_span = accessor['max'][0] - accessor['min'][0]
scale = original['span'][0] / exported_span
settings = {
    '_comment': 'Restore the map scale removed by blend_to_glb.py (100 / horizontal span). Measured against the unchanged source skydome; do not scale node translations twice.',
    'coordinateSpace': 'abyss-meters-v1',
    'source': 'assets/maps/raw/abyss.blend',
    'referenceObject': original['name'],
    'originalReferenceSpan': original['span'][0],
    'exportedReferenceSpan': exported_span,
    'geometryScale': scale,
    'cellSize': 32,
    'sceneryCellSize': 128,
}
(root / 'tools/map-scale.json').write_text(json.dumps(settings, indent=2) + '\n', encoding='utf-8')
print('VS_MAP_SCALE ' + json.dumps(settings))
