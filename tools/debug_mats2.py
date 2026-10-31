import bpy
from collections import Counter
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
mats = [m for m in bpy.data.materials if m and m.use_nodes]
print("VS_COUNT", len(mats))
tc = Counter()
for m in mats[:50]:
    for n in m.node_tree.nodes:
        tc[n.type] += 1
for k, v in tc.most_common(12):
    print("VS_NODETYPE", k, v)
# in chi tiết 3 material đầu
for m in mats[:3]:
    print("VS_MAT", m.name)
    for n in m.node_tree.nodes:
        print("   VS_NODE", n.type, "|", n.name)
        if n.type == 'TEX_IMAGE' and n.image:
            print("      VS_IMG", n.image.name, n.image.file_format, "packed:", n.image.packed_file is not None)
