import bpy, mathutils, re

bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")

# --- replicate pipeline: tách sky + xóa terrain giống blend_to_glb.py ---
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
meshes = [o for o in meshes if not re.search(r'sky|dome', o.name, re.I)]
NAME_KILL = re.compile(r'basalt|cliff|gravel|beach|foliage|plant_|^plant|grass|tree|cave|terrain|mountain|pebble|vegetation', re.I)
MAT_KILL = re.compile(r'basalt|cliff|beach|worldgrid|basicshape', re.I)
keep = []
for o in meshes:
    if NAME_KILL.search(o.name):
        continue
    if any(m and MAT_KILL.search(m.name) for m in o.data.materials if m):
        continue
    keep.append(o)

mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3)
for o in keep:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
span = [mx[i]-mn[i] for i in range(3)]
s = 100.0 / max(span[0], span[1])
cx, cy, cz = mn.x + span[0]/2, mn.y + span[1]/2, mn.z
print("VS_S", s, "center", round(cx), round(cy), round(cz))

def bl_from_game(gx, gy, gz):
    # game = normalize(bl): gx=(x-cx)*s ; gz=-(y-cy)*s ; gy=(z-cz)*s+0.5
    return mathutils.Vector((gx/s + cx, cy - gz/s, (gy-0.5)/s + cz))

cam_bl = bl_from_game(43, 24.27, -8.66)
tgt_bl = bl_from_game(30, 24.27, -8.66)
print("VS_CAM_BL", [round(v) for v in cam_bl], "TGT", [round(v) for v in tgt_bl])

scene = bpy.context.scene
cam_data = bpy.data.cameras.new("refcam")
cam_data.clip_end = 2000
cam_obj = bpy.data.objects.new("refcam", cam_data)
scene.collection.objects.link(cam_obj)
cam_obj.location = cam_bl
direction = tgt_bl - cam_bl
cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam_obj

scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.filepath = r"C:\Users\Admin\Downloads\valorant\reference_dir2.png"
bpy.ops.render.render(write_still=True)
print("VS_RENDER_DONE")
