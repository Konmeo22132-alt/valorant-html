"""Inventory original Haven Blender scene before authoring the low-poly export."""
import bpy,json
from pathlib import Path
from collections import Counter
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tools/art-review/haven-source';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'val-strike-html/assets/maps/raw/haven.blend'))
objects=[]
for o in bpy.data.objects:
    if o.type!='MESH':continue
    b=[o.matrix_world@Vector(p) for p in o.bound_box]
    objects.append({'name':o.name,'mesh':o.data.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),
      'triangles':sum(max(0,len(p.vertices)-2)for p in o.data.polygons),'bounds':[[min(p[i]for p in b)for i in range(3)],[max(p[i]for p in b)for i in range(3)]],
      'materials':[m.name if m else None for m in o.data.materials],'hidden':o.hide_render,'visible':o.visible_get(),
      'collections':[c.name for c in o.users_collection], 'matrix':[list(row)for row in o.matrix_world],
      'modifiers':[(m.name,m.type)for m in o.modifiers]})
materials=[]
for m in bpy.data.materials:
    nodes=m.node_tree.nodes if m.use_nodes else []
    materials.append({'name':m.name,'diffuseColor':list(m.diffuse_color),'surfaceMode':m.surface_render_method,
      'images':[{'node':n.name,'image':n.image.name,'file':n.image.filepath}for n in nodes if n.type=='TEX_IMAGE' and n.image],
      'nodes':[(n.name,n.type)for n in nodes],
      'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name)for l in m.node_tree.links]if m.use_nodes else [],
      'values':{n.name:{i.name:list(i.default_value)if hasattr(i.default_value,'__len__')else i.default_value for i in n.inputs if hasattr(i,'default_value')and i.type in ('RGBA','VALUE','VECTOR')}for n in nodes if n.type in ('BSDF_PRINCIPLED','RGB','MIX_RGB','GROUP')}})
images=[]
for im in bpy.data.images:
    images.append({'name':im.name,'path':im.filepath,'size':list(im.size),'packed':bool(im.packed_file),'source':im.source,'exists':Path(bpy.path.abspath(im.filepath)).exists()if im.filepath else False})
report={'file':bpy.data.filepath,'units':bpy.context.scene.unit_settings.system,'unitScale':bpy.context.scene.unit_settings.scale_length,
 'objects':objects,'materials':materials,'images':images,'collections':[(c.name,len(c.objects))for c in bpy.data.collections],
 'summary':{'meshObjects':len(objects),'uniqueMeshDatablocks':len({o['mesh']for o in objects}),'instancedTriangles':sum(o['triangles']for o in objects),'materials':len(materials),'images':len(images),'missingImages':[i['name']for i in images if not i['packed']and not i['exists']]}}
(OUT/'inventory.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print('HAVEN_SOURCE',json.dumps(report['summary'],ensure_ascii=False),flush=True)
print('HAVEN_COLLECTIONS',report['collections'],flush=True)
print('HAVEN_LARGEST',[(o['name'],o['triangles'])for o in sorted(objects,key=lambda o:-o['triangles'])[:12]],flush=True)
thumbs=OUT/'textures';thumbs.mkdir(exist_ok=True)
for i,m in enumerate(materials):
    names=[im['image']for im in m['images']if not im['image'].startswith(('Albedo_DF','Normal_NM','MRA_MRA'))]
    base=next((n for n in names if '_DF.' in n or '_DF_' in n),None)or(next(iter(names),None))
    m['reviewImage']=base
    if not base:continue
    image=bpy.data.images.get(base)
    if not image or not image.has_data:continue
    copy=image.copy();copy.scale(192,192);copy.file_format='PNG';copy.filepath_raw=str(thumbs/f'{i:03d}.png');copy.save();bpy.data.images.remove(copy)
(OUT/'inventory.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
