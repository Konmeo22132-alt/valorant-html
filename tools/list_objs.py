import bpy, re
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
objs = [o for o in bpy.data.objects if o.type == 'MESH']
# nhóm nghi là núi/đá/địa hình
pat = re.compile(r'rock|cliff|basalt|terrain|mountain|cave|underside|beach|boulder|stone_env|env_|landscape|island', re.I)
hits = [o for o in objs if pat.search(o.name)]
tris = sum(len(o.data.polygons) for o in hits if o.data)
print("VS_OBJ_HITS", len(hits), "tris", tris)
for o in hits:
    print("VS_OBJ", o.name, len(o.data.polygons) if o.data else 0)
