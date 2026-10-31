import bpy, importlib.util, sys

PSK_FILE = sys.argv[sys.argv.index('--') + 1]
OUT_GLB = sys.argv[sys.argv.index('--') + 2]

ADDON = r"C:\Users\Admin\Downloads\valorant\blender-portable\blender-4.2.0-windows-x64\4.2\scripts\addons\io_import_scene_unreal_psa_psk.py"
bpy.ops.wm.read_homefile(use_empty=True)
spec = importlib.util.spec_from_file_location("psk_import", ADDON)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.register()

bpy.ops.import_scene.psk(filepath=PSK_FILE)

armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print("VS_ARM", len(armatures))
print("VS_MESH", len(meshes), [(m.name, len(m.data.polygons)) for m in meshes][:8])
print("VS_MATS", [m.name for m in bpy.data.materials][:10])

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_yup=True,
                          export_animations=False, export_skins=True)
print("VS_GLB_DONE")
