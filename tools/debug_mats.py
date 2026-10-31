import bpy
from collections import Counter
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")
mats = [m for m in bpy.data.materials if m and m.use_nodes]
print("VS_COUNT", len(mats))
types = Counter()
linked = 0
for m in mats:
    b = m.node_tree.nodes.get("Principled BSDF")
    if not b:
        types['no_principled'] += 1
        continue
    bc = b.inputs.get("Base Color")
    if bc and bc.is_linked:
        linked += 1
        types[bc.links[0].from_node.type] += 1
    else:
        types['basecolor_not_linked'] += 1
print("VS_LINKED", linked)
for k, v in types.most_common(10):
    print("VS_TYPE", k, v)
