import bpy, mathutils, re

bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")

meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not re.search(r'sky|dome', o.name, re.I)]
NAME_KILL = re.compile(r'basalt|cliff|gravel|beach|foliage|plant_|^plant|grass|tree|cave|terrain|mountain|pebble|vegetation', re.I)
MAT_KILL = re.compile(r'basalt|cliff|beach|worldgrid|basicshape', re.I)

def classify(o):
    dims = o.dimensions
    biggest = max(dims.x, dims.y, dims.z)
    mat_hit = any(m and MAT_KILL.search(m.name) for m in o.data.materials if m)
    if mat_hit and biggest > 200:
        return 'KILL_BIGROCK'
    if NAME_KILL.search(o.name) and biggest <= 60:
        return 'KILL_VEG'
    if any(m and ('worldgrid' in m.name.lower() or 'basicshape' in m.name.lower()) for m in o.data.materials if m):
        return 'KILL_PLANE'
    return 'KEEP'

killed = [o for o in meshes if classify(o).startswith('KILL')]
kept = [o for o in meshes if not classify(o).startswith('KILL')]

# transform như pipeline (tính trên kept sau khi join — bbox của kept)
mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3)
for o in kept:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
span = [mx[i]-mn[i] for i in range(3)]
s = 100.0 / max(span[0], span[1])
cx, cy, cz = mn.x + span[0]/2, mn.y + span[1]/2, mn.z
print("VS_S", round(s, 5), "C", round(cx), round(cy), round(cz))

def bl_box(gx0, gx1, gy0, gy1, gz0, gz1):
    # trả bbox blender tương ứng game box
    x0 = gx0/s + cx; x1 = gx1/s + cx
    y1 = cy - gz0/s; y0 = cy - gz1/s
    z0 = (gy0-0.5)/s + cz; z1 = (gy1-0.5)/s + cz
    return (x0, x1, y0, y1, z0, z1)

# phòng user: game x 21-28, y 28.5-30.5, z -17..-11
bx0, bx1, by0, by1, bz0, bz1 = bl_box(21, 28, 28.5, 30.5, -17, -11)
print("VS_BLBOX", [round(v) for v in (bx0, bx1, by0, by1, bz0, bz1)])

def in_box(o, box):
    hit = False
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        if (box[0] <= w.x <= box[1] and box[2] <= w.y <= box[3] and box[4] <= w.z <= box[5]):
            hit = True
            break
    return hit

print("--- KEPT trong vùng phòng ---")
for o in kept:
    if in_box(o, (bx0, bx1, by0, by1, bz0, bz1)):
        mats = ",".join(m.name[:40] for m in o.data.materials if m)[:90]
        print("VS_KEEP", o.name[:55], "| tris", len(o.data.polygons), "|", mats)
print("--- KILLED trong vùng phòng ---")
for o in killed:
    if in_box(o, (bx0, bx1, by0, by1, bz0, bz1)):
        mats = ",".join(m.name[:40] for m in o.data.materials if m)[:90]
        print("VS_KILLED", o.name[:55], "| tris", len(o.data.polygons), "| dims", round(max(o.dimensions)), "|", mats)
