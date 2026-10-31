import bpy, re
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
sky = [o for o in meshes if re.search(r'sky|dome', o.name, re.I)]
ter = re.compile(r'basalt|cliff|gravel|beach|foliage|plant_|^plant|grass|tree|rock|cave|terrain|mountain|floater|pebble|vegetation', re.I)
map_o = [o for o in meshes if o not in sky and not ter.search(o.name)]
# object dùng BasicShapeMaterial
basic = [o for o in map_o if any(m and 'BasicShape' in m.name for m in o.data.materials)]
print("VS_BASIC", len(basic), "tris", sum(len(o.data.polygons) for o in basic if o.data))
for o in basic[:15]:
    print("VS_BASICOBJ", o.name, "| dims:", round(o.dimensions.x), round(o.dimensions.y), round(o.dimensions.z))
# top 10 object lớn nhất còn lại
def vol(o):
    d = o.dimensions
    return d.x * d.y * d.z
big = sorted(map_o, key=vol, reverse=True)[:15]
for o in big:
    d = o.dimensions
    mats = ",".join(m.name[:35] for m in o.data.materials if m)
    print("VS_BIG", o.name[:50], "| dims:", round(d.x), round(d.y), round(d.z), "|", mats)
