import bpy, re
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
names = sorted(set(m.name for m in bpy.data.materials))
print("VS_COUNT", len(names))
for n in names:
    print("VS_MAT", n)
