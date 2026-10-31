"""Render the actual exported Haven GLB, using CPU and a fixed review rig."""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tools/art-review/haven-output';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'val-strike-html/assets/maps/optimized/haven-art/haven_lowpoly.glb'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.max_bounces=3;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1120;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('haven_review_world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.60,.65,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0
light=bpy.data.lights.new('haven_review_sun','SUN');light.energy=2.2;light.angle=math.radians(12)
sun=bpy.data.objects.new('haven_review_sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(math.radians(30),math.radians(-20),math.radians(-30))
data=bpy.data.cameras.new('haven_review_camera');camera=bpy.data.objects.new('haven_review_camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.clip_end=2000;data.clip_start=.05
def render(name,eye,target,scale=None):
 camera.location=Vector(eye);camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
 data.type='ORTHO'if scale else'PERSP';data.ortho_scale=scale or 50;data.lens=24
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);print('HAVEN_RENDER',name,flush=True)
if '--ground-only'in sys.argv:
 render('ground-c',(-17,79,3.65),(-22,96,3.7))
 render('ground-b',(18,82,4.65),(22,98,4.7))
 render('ground-a',(62,80,4.65),(58,101,4.7))
elif '--overview-only'in sys.argv:
 render('overview',(125,-80,155),(17,90,6),165)
else:
 render('overview',(125,-80,155),(17,90,6),165)
 render('site-c',(-60,60,39),(-20,96,5),57)
 render('site-b',(49,58,37),(20,94,5),48)
 render('site-a',(98,60,39),(61,94,5),58)
print('HAVEN_RENDER_DONE',flush=True)
