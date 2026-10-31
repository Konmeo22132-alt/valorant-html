# Val-Strike HTML — Blender headless export v5
# Export 2 biến thể từ cùng geometry đã decimate:
#   1. abyss_tex.glb  — GIỮ texture gốc (ngôn ngữ thị giác Valorant thật)
#   2. abyss_bl.glb   — flat color quantized (dự phòng, siêu nhẹ)
import bpy, mathutils, re, colorsys
import numpy as np
from collections import defaultdict

SRC = r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend"
OUT_TEX = r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss_tex.glb"
OUT_FLAT = r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss_bl.glb"

bpy.ops.wm.open_mainfile(filepath=SRC)

# ---------- Tách skydome ----------
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
sky_objs = [o for o in meshes if re.search(r'sky|dome', o.name, re.I)]
map_objs = [o for o in meshes if o not in sky_objs]
print("VS_STATS meshes:", len(map_objs), "sky:", len(sky_objs))
print("VS_STATS tris_before:", sum(len(o.data.polygons) for o in map_objs if o.data))

# ---------- Xóa núi/đá/thực vật — chỉ giữ building chơi được ----------
# Muốn giữ lại nhóm nào, bỏ pattern tương ứng khỏi danh sách.
DELETE_PAT = re.compile(
    r'basalt|cliff|gravel|beach|foliage|plant_|^plant|grass|tree'
    r'|cave|terrain|mountain|pebble|vegetation',
    re.I)
# Lọc theo MATERIAL: núi/vách đá dùng Basalt/Cliff materials.
# KHÔNG lọc 'rock'/'floater' theo tên object — Floater_11/12/26 là trang
# trí building (BrickEdges/PlasterDestruction) bị xóa oan gây đứt map.
MAT_KILL_PAT = re.compile(r'basalt|cliff|beach|worldgrid|basicshape', re.I)
# KEEP: sàn/nền dùng texture blend (Grass_M0_Dirtblend...) tuyệt đối không xóa
MAT_KEEP_PAT = re.compile(r'dirtblend|floor|ground|tile|concrete', re.I)
# Chỉ xóa đá KHỔNG LỒ (vỏ núi Vista 300-600 units) — giữ đá vừa/nhỏ
# gần map vì chúng là phong cảnh nhìn thấy từ cửa sổ trong map!
kill = []
for o in map_objs:
    dims = o.dimensions
    biggest = max(dims.x, dims.y, dims.z)
    name_hit = bool(DELETE_PAT.search(o.name))
    mat_hit = any(m and MAT_KILL_PAT.search(m.name) for m in o.data.materials if m)
    mat_keep = any(m and MAT_KEEP_PAT.search(m.name) for m in o.data.materials if m)
    if mat_keep:
        continue    # sàn/nền — không bao giờ xóa
    if mat_hit and biggest > 200:
        kill.append(o)          # vỏ núi khổng lồ
    elif name_hit and biggest <= 12:
        kill.append(o)          # cỏ/decal nhỏ (≤12) — "TreeRoomIntFloorA" là SÀN 44 units, không xóa!
    elif any(m and ('worldgrid' in m.name.lower() or 'basicshape' in m.name.lower())
             for m in o.data.materials if m):
        kill.append(o)          # plane trắng Unreal
map_objs = [o for o in map_objs if o not in kill]
kill_tris = sum(len(o.data.polygons) for o in kill if o.data)
for o in kill:
    bpy.data.objects.remove(o, do_unlink=True)
print("VS_STATS deleted_terrain_objs:", len(kill), "tris:", kill_tris)
print("VS_STATS map_objs_after:", len(map_objs),
      "tris:", sum(len(o.data.polygons) for o in map_objs if o.data))

# ---------- Join + decimate ----------
for o in bpy.data.objects:
    o.select_set(False)
for o in map_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = map_objs[0]
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active

mod = joined.modifiers.new("decimate", 'DECIMATE')
mod.ratio = 0.30
bpy.context.view_layer.objects.active = joined
bpy.ops.object.modifier_apply(modifier="decimate")
print("VS_STATS tris_after_decimate:", len(joined.data.polygons))

# ---------- Giữ đơn vị mét của scene nguồn ----------
def world_bbox(obj):
    mn = mathutils.Vector((1e9,) * 3)
    mx = mathutils.Vector((-1e9,) * 3)
    for c in obj.bound_box:
        w = obj.matrix_world @ mathutils.Vector(c)
        mn.x = min(mn.x, w.x); mn.y = min(mn.y, w.y); mn.z = min(mn.z, w.z)
        mx.x = max(mx.x, w.x); mx.y = max(mx.y, w.y); mx.z = max(mx.z, w.z)
    return mn, mx

mn, mx = world_bbox(joined)
# The source scene is already in meters. Fitting the entire scenery into 100
# units shrank playable rooms while the 1.8 m controller remained unchanged.
S = 1.0
print("VS_STATS scale_factor:", S)
targets = [joined] + list(sky_objs)
for o in bpy.data.objects:
    o.select_set(False)
for o in targets:
    o.scale = (o.scale[0] * S, o.scale[1] * S, o.scale[2] * S)
    o.select_set(True)
bpy.context.view_layer.objects.active = joined
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# ---------- Export 1: TEXTURED (giữ nguyên material + texture) ----------
bpy.ops.export_scene.gltf(
    filepath=OUT_TEX,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_image_format='AUTO',   # jpeg cho opaque, png cho alpha
    export_jpeg_quality=85,
)
print("VS_TEX_EXPORT_DONE")

# ---------- Export 2: FLAT COLOR — màu từ color_map.json ----------
# Màu do các agent XEM ẢNH texture + tên material rồi quyết định
# (tag "surface" = trầm, "accent" = đậm/rực cho decal/trang trí).
import json
COLOR_MAP_PATH = r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\textures\color_map.json"
with open(COLOR_MAP_PATH) as f:
    color_map = json.load(f)   # texture_filename -> [hex, tag]

def df_image(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            if re.search(r'_DF($|\.)', n.image.name) or 'Albedo' in n.image.name:
                return n.image
    return None

flat_by_original = {}
missed = 0
for mat in bpy.data.materials:
    if not mat or not mat.use_nodes:
        continue
    img = df_image(mat)
    hexcol = "#808080"
    if img:
        fname = re.sub(r'[^\w\-]', '_', img.name)[:80] + ".png"
        if fname in color_map:
            hexcol = color_map[fname][0]
        else:
            missed += 1
    else:
        missed += 1
    fm = bpy.data.materials.new("flat_" + mat.name[:50])
    fm.use_nodes = True
    fb = fm.node_tree.nodes.get("Principled BSDF") or next(
        (n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    fb.inputs["Base Color"].default_value = tuple(int(hexcol[i:i+2], 16)/255 for i in (1, 3, 5)) + (1.0,)
    if "Specular IOR Level" in fb.inputs:
        fb.inputs["Specular IOR Level"].default_value = 0.0
    if "Roughness" in fb.inputs:
        fb.inputs["Roughness"].default_value = 1.0
    flat_by_original[mat] = fm
print("VS_STATS flat_materials:", len(flat_by_original), "missed:", missed)

# Gán material flat cho joined
for i in range(len(joined.data.materials)):
    orig = joined.data.materials[i]
    if orig in flat_by_original:
        joined.data.materials[i] = flat_by_original[orig]

bpy.ops.export_scene.gltf(
    filepath=OUT_FLAT,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_image_format='AUTO',
)
print("VS_FLAT_EXPORT_DONE")
