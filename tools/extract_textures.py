import bpy, json, os, re

OUT_DIR = r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\textures"
os.makedirs(OUT_DIR, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=r"C:\Users\Admin\Downloads\valorant\val-strike-html\assets\maps\raw\abyss.blend")

def df_image(mat):
    # texture Base Color = image kết thúc _DF (Diffuse) hoặc chứa Albedo
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            nm = n.image.name
            if re.search(r'_DF($|\.)', nm) or 'Albedo' in nm:
                return n.image
    return None

mapping = {}
saved = {}
for mat in bpy.data.materials:
    if not mat or not mat.use_nodes:
        continue
    img = df_image(mat)
    if not img:
        continue
    if img.name not in saved:
        fname = re.sub(r'[^\w\-]', '_', img.name)[:80] + ".png"
        path = os.path.join(OUT_DIR, fname)
        try:
            img.save_render(path)
            saved[img.name] = fname
        except Exception as e:
            print("VS_WARN", img.name, str(e)[:50])
            continue
    mapping[mat.name] = saved[img.name]

with open(os.path.join(OUT_DIR, "material_texture_map.json"), "w") as f:
    json.dump(mapping, f, indent=1)
print("VS_DONE materials:", len(mapping), "textures:", len(saved))
