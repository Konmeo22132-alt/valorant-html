import bpy, importlib.util, os

ADDON = r"C:\Users\Admin\Downloads\valorant\blender-portable\blender-4.2.0-windows-x64\4.2\scripts\addons\io_import_scene_unreal_psa_psk.py"
CONTENT = r"C:\Users\Admin\Downloads\valorant\valorant-model-animations\Content"

bpy.ops.wm.read_homefile(use_empty=True)
spec = importlib.util.spec_from_file_location("psk_import", ADDON)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.register()

bpy.ops.import_scene.psk(filepath=os.path.join(CONTENT, "Characters", "Breach", "S0", "3P", "Models", "TP_Breach_S0_Skelmesh.psk"))
print("VS_AFTER_PSK arms:", sum(1 for o in bpy.data.objects if o.type == 'ARMATURE'), "actions:", len(bpy.data.actions))

CORE3P = os.path.join(CONTENT, "Characters", "_Core", "3P", "Anims")
for name in ["TP_Core_Idle_LB.psa", "TP_Core_RunN_LB.psa", "TP_Core_Idle_AimN_UB.psa"]:
    bpy.ops.import_scene.psa(filepath=os.path.join(CORE3P, name))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    act = arms[0].animation_data.action if arms[0].animation_data else None
    print("VS_AFTER", name,
          "| arms:", len(arms),
          "| actions_total:", len(bpy.data.actions),
          "| active:", act.name if act else None,
          "| fcurves:", len(act.fcurves) if act else 0,
          "| frames:", [round(f, 1) for f in act.frame_range] if act else None)
    # sample data_path
    if act:
        paths = sorted(set(fc.data_path.split('.')[-1].split('[')[0] for fc in act.fcurves))[:8]
        print("VS_BONES_SAMPLE:", paths)
print("VS_ALL_ACTIONS:", [(a.name, len(a.fcurves)) for a in bpy.data.actions])
