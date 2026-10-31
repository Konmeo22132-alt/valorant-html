"""Inspect a supplied GLB and render its real geometry on CPU, without editing it.

blender --background --threads 4 --python tools/inspect-haven-reference.py
"""
import bpy
import json
import math
import sys
from pathlib import Path
from collections import defaultdict
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'site_c_haven_valorant_low_poly.glb'
OUT = ROOT / 'tools/art-review/haven-reference'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
center = (low + high) / 2
span = high - low
materials = defaultdict(lambda: {'triangles': 0, 'area': 0.0, 'objects': 0})
objects = []
for obj in meshes:
    mesh = obj.data
    mesh.calc_loop_triangles()
    used = set()
    for tri in mesh.loop_triangles:
        material = mesh.materials[tri.material_index] if tri.material_index < len(mesh.materials) else None
        name = material.name if material else '(none)'
        a, b, c = [obj.matrix_world @ mesh.vertices[i].co for i in tri.vertices]
        materials[name]['triangles'] += 1
        materials[name]['area'] += (b-a).cross(c-a).length / 2
        used.add(name)
    for name in used:
        materials[name]['objects'] += 1
    objects.append({'name': obj.name, 'triangles': len(mesh.loop_triangles),
                    'smoothFaces': sum(p.use_smooth for p in mesh.polygons),
                    'faces': len(mesh.polygons), 'vertices': len(mesh.vertices),
                    'bounds': [list(obj.matrix_world @ Vector(p)) for p in obj.bound_box]})
for material in bpy.data.materials:
    if material.name not in materials:
        continue
    principled = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if material.use_nodes else None
    rgba = list(principled.inputs['Base Color'].default_value) if principled else list(material.diffuse_color)
    srgb = lambda x: 12.92*x if x <= 0.0031308 else 1.055*x**(1/2.4)-0.055
    materials[material.name].update({'linearRGBA': rgba,
        'displayHex': '#'+''.join(f'{round(min(1,max(0,srgb(c)))*255):02x}' for c in rgba[:3]),
        'roughness': float(principled.inputs['Roughness'].default_value) if principled else material.roughness,
        'metallic': float(principled.inputs['Metallic'].default_value) if principled else material.metallic})

report = {'source': SOURCE.name, 'bytes': SOURCE.stat().st_size,
    'meshObjects': len(meshes), 'uniqueMeshDatablocks': len({o.data.as_pointer() for o in meshes}),
    'visibleTriangles': sum(o['triangles'] for o in objects),
    'vertices': sum(o['vertices'] for o in objects),
    'boundsBlenderZUp': {'min': list(low), 'max': list(high), 'size': list(span)},
    'materials': dict(sorted(materials.items(), key=lambda p: -p[1]['area'])),
    'largestMeshes': sorted(objects, key=lambda o: -o['triangles']),
    'images': [i.name for i in bpy.data.images if i.source == 'FILE'],
    'cameras': [o.name for o in scene.objects if o.type == 'CAMERA']}
(OUT/'inspection.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print('HAVEN_REFERENCE_STATS', json.dumps({k:v for k,v in report.items() if k not in ['materials','largestMeshes']}, ensure_ascii=False), flush=True)

# Rendering uses the original mesh normals and materials. Only the lights and
# cameras below are added. No geometry, palette, scale or source file changes.
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 3
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 1100
scene.render.resolution_y = 780
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('reference_review_world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .18, .22, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
light_data = bpy.data.lights.new('review_sun', 'SUN')
light_data.energy = 2.2
light_data.angle = math.radians(15)
light = bpy.data.objects.new('review_sun', light_data)
scene.collection.objects.link(light)
light.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-35))

camera_data = bpy.data.cameras.new('review_camera')
camera = bpy.data.objects.new('review_camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
size = max(span.x, span.y)
camera_data.clip_start = max(size/10000, .001)
camera_data.clip_end = max(size*10, 1000)
def render(name, direction, target, scale):
    camera.location = target + Vector(direction).normalized()*size*2
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale = scale
    scene.render.filepath = str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    print('HAVEN_REFERENCE_RENDER', name, flush=True)

if '--reference-angle' in sys.argv:
    render('site-reference-angle', (1, -.15, 1.15), Vector((-4, 3, 5)), 84)
elif '--site-only' in sys.argv:
    render('site-overview', (1, 1.3, 1.4), Vector((-4, 3, 5)), 83)
    render('site-detail', (1.2, 1, .85), Vector((-3, 3, 4)), 52)
else:
    render('overview', (1, -1.4, 1.35), center, size*1.20)
    render('reverse', (-1, 1.3, 1.1), center, size*1.20)
    render('top', (0, -.001, 1), center, size*1.15)
print('HAVEN_REFERENCE_DONE', OUT, flush=True)
