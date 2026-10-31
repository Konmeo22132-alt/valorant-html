import bpy, re
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
objs = [o for o in bpy.data.objects if o.type == 'MESH']
# sau khi trừ sky + terrain đã xóa: tìm plane/trắng lớn
pat = re.compile(r'cloud|plane|backdrop|fog|card|billboard|quad|white|paper|screen|canvas|banner|cloth|flag', re.I)
hits = [o for o in objs if pat.search(o.name)]
print("VS_HITS", len(hits))
for o in hits[:40]:
    bb = o.dimensions
    print("VS_OBJ", o.name, "| dims:", round(bb.x), round(bb.y), round(bb.z))
