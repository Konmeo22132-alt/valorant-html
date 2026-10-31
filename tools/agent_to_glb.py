# Convert 1 agent UE (psk 3P + PSA + textures) -> GLB cho Babylon.js
# Animation: ghép LB (chân chạy) + UB (tay aim) per-bone — chỉ copy bone
# CÓ BIẾN ĐỘNG từ UB, giữ bone đang chuyển động của LB.
import bpy, importlib.util, os, re, sys

ADDON = r"C:\Users\Admin\Downloads\valorant\blender-portable\blender-4.2.0-windows-x64\4.2\scripts\addons\io_import_scene_unreal_psa_psk.py"
CONTENT = r"C:\Users\Admin\Downloads\valorant\valorant-model-animations\Content"

AGENT = sys.argv[sys.argv.index('--') + 1]
SKIN = sys.argv[sys.argv.index('--') + 2]
OUT_GLB = sys.argv[sys.argv.index('--') + 3]

bpy.ops.wm.read_homefile(use_empty=True)
spec = importlib.util.spec_from_file_location("psk_import", ADDON)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.register()

BASE = os.path.join(CONTENT, "Characters", AGENT, SKIN, "3P", "Models")
psk = os.path.join(BASE, f"TP_{AGENT}_{SKIN}_Skelmesh.psk")
bpy.ops.import_scene.psk(filepath=psk)

# --- Texture DF ---
mats_dir = os.path.join(BASE, "Materials")
for mat in bpy.data.materials:
    if not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    stem = mat.name
    df = next((os.path.join(mats_dir, c) for c in
               [stem[:-3] + "_DF.png", stem + "_DF.png"] if os.path.exists(os.path.join(mats_dir, c))), None)
    if df:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(df)
        mat.node_tree.links.new(bsdf.inputs['Base Color'], tex.outputs['Color'])
    if bsdf.inputs.get('Metallic'):
        bsdf.inputs['Metallic'].default_value = 0.0
    if bsdf.inputs.get('Roughness'):
        bsdf.inputs['Roughness'].default_value = 0.8

ARM = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
CORE3P = os.path.join(CONTENT, "Characters", "_Core", "3P", "Anims")
anim_dir = os.path.join(CONTENT, "Characters", AGENT, SKIN, "3P", "Anims")

# Dùng thẳng PSA — file LB chứa full pose (cả tay), không cần merge.
# (Merge UB đè lên làm chân đóng băng — đã audit.)
ANIM_SET = [
    ("Run",    os.path.join(CORE3P, "TP_Core_RunN_LB.psa")),
    ("Walk",   os.path.join(CORE3P, "TP_Core_WalkN_LB.psa")),
    ("Sprint", os.path.join(CORE3P, "TP_Core_SprintN_LB.psa")),
    ("Crouch", os.path.join(CORE3P, "TP_Core_CrouchIdle_LB.psa")),
    ("Jump",   os.path.join(CORE3P, "TP_Core_Jump_LB.psa")),
    ("Death",  os.path.join(CORE3P, "TP_Core_Death_Splat.psa")),
    ("Idle",   os.path.join(anim_dir, f"TP_{AGENT}_{SKIN}_Face_Idle.psa")),
    ("CharSelect", os.path.join(CONTENT, "Characters", AGENT, SKIN, "CharSelect", "Anims", f"CS_{AGENT}_{SKIN}_CharSelect.psa")),
]
has_anim = False
for out_name, path in ANIM_SET:
    if not os.path.exists(path):
        print("VS_ANIM_MISSING", out_name)
        continue
    before = {a.name for a in bpy.data.actions}
    bpy.ops.import_scene.psa(filepath=path)
    new_names = {a.name for a in bpy.data.actions} - before
    act = bpy.data.actions.get(list(new_names)[0]) if new_names else ARM.animation_data.action
    ARM.animation_data.action = act
    act.name = out_name
    fr = round(act.frame_range[1] - act.frame_range[0], 1)
    print("VS_ANIM_OK", out_name, "| fcurves:", len(act.fcurves), "| frames:", fr)
    has_anim = True

has_anim = True

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_yup=True,
                          export_animations=has_anim, export_skins=True)
print("VS_GLB_DONE anim:", has_anim)
