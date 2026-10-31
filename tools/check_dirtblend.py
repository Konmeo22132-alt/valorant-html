import bpy, re
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not re.search(r'sky|dome', o.name, re.I)]
NAME_KILL = re.compile(r'basalt|cliff|gravel|beach|foliage|plant_|^plant|grass|tree|cave|terrain|mountain|pebble|vegetation', re.I)
MAT_KILL = re.compile(r'basalt|cliff|beach|worldgrid|basicshape', re.I)

def classify(o):
    dims = o.dimensions
    biggest = max(dims.x, dims.y, dims.z)
    mat_hit = any(m and MAT_KILL.search(m.name) for m in o.data.materials if m)
    if mat_hit and biggest > 200: return 'KILL_BIGROCK'
    if NAME_KILL.search(o.name) and biggest <= 60: return 'KILL_VEG'
    if any(m and ('worldgrid' in m.name.lower() or 'basicshape' in m.name.lower()) for m in o.data.materials if m): return 'KILL_PLANE'
    return 'KEEP'

pat = re.compile(r'Dirtblend|TileGroundMoss|TileGroundWarm', re.I)
n = 0
for o in meshes:
    mats = [m.name for m in o.data.materials if m and pat.search(m.name)]
    if mats:
        n += 1
        cls = classify(o)
        if n <= 25 or cls != 'KEEP':
            print("VS_FLOOR", cls, "|", o.name[:60], "| dims", round(max(o.dimensions)), "|", mats[0][:45])
print("VS_TOTAL_FLOOR_OBJS", n)
