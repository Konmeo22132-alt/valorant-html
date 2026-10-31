"""Prepare original collision and native Haven map markup in game coordinates."""
from pathlib import Path
import numpy as np,json,struct,shutil
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tools/art-review/haven-gameplay';OUT.mkdir(parents=True,exist_ok=True)
MAP=ROOT/'val-strike-html/assets/maps';source=np.load(MAP/'raw/haven-collision-source.npz')
tri=source['triangles'].copy();tri[:,:,0]*=-1;tri=tri[:,[0,2,1],:]
tri.astype('<f4').tofile(OUT/'source-triangles.bin')
(OUT/'source-ranges.json').write_text(str(source['ranges']),encoding='utf-8')
file=ROOT/'model/valorant-model-animations-agents/Content/Characters/Global/MapMarkup/TargetingMeshes/Triad_NavMesh_Targeting_V2.pskx'
b=file.read_bytes();cursor=0;chunks={}
while cursor+32<=len(b):
 name,_,size,count=struct.unpack_from('<20s3i',b,cursor);cursor+=32;chunks[name.rstrip(b'\0').decode()]=(size,count,b[cursor:cursor+size*count]);cursor+=size*count
def records(name,fmt):
 size,count,data=chunks[name];return [struct.unpack_from(fmt,data,i*size)for i in range(count)]
points=np.array(records('PNTS0000','<3f'))/100;wedges=records('VTXW0000','<IffB3x');faces=records('FACE0000','<3HBBI')
world=np.column_stack((-points[:,0],points[:,2]-.1,points[:,1]))
support=np.array([[world[wedges[i][0]]for i in f[:3]]for f in faces],dtype='<f4')
n=np.cross(support[:,1]-support[:,0],support[:,2]-support[:,0]);reverse=n[:,1]<0;support[reverse]=support[reverse][:,[0,2,1],:]
support.tofile(OUT/'native-support.bin')
native=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI/InGame/Minimap/Maps/Triad/TX_Map_Triad_Revealed.png'
im=Image.open(native).convert('RGB');small=np.array(im.resize((256,256)));mask=small.max(2)>40;ground=world[:,[0,2]];best=None
for orientation in range(16):
 degree=(orientation%8)*45;mirror=1 if orientation<8 else -1;a=np.deg2rad(degree);basis=np.array([[np.cos(a)*mirror,np.sin(a)],[-np.sin(a)*mirror,np.cos(a)]])
 projected=ground@basis.T;mn=projected.min(0);mx=projected.max(0);yy,xx=np.where(mask);lo=np.array([xx.min(),yy.min()]);hi=np.array([xx.max(),yy.max()]);scale=min((hi-lo)/(mx-mn));offset=(lo+hi)/2-(mn+mx)/2*scale
 canvas=Image.new('L',(256,256));draw=ImageDraw.Draw(canvas);pixels=projected*scale+offset
 for f in faces:draw.polygon([tuple(pixels[wedges[i][0]])for i in f[:3]],fill=255)
 p=np.array(canvas)>0;iou=(mask&p).sum()/(mask|p).sum()
 if best is None or iou>best[0]:best=(float(iou),basis,scale*4,offset*4)
iou,basis,scale,offset=best
registration={'iou':iou,'basis':basis.tolist(),'scale':scale,'offset':offset.tolist()}
(OUT/'registration.json').write_text(json.dumps(registration,indent=2))
shutil.copyfile(native,ROOT/'val-strike-html/assets/ui/haven.png')
background=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI/Textures/MapBackgrounds/TX_UI_Background_Map_Haven.png'
shutil.copyfile(background,ROOT/'val-strike-html/assets/menu/haven-background.png')
# Native minimap paint masks are converted back into world-space polygons.
import cv2
rgb=np.array(im).astype(np.int16);yellow=np.uint8((rgb[:,:,0]>rgb[:,:,2]+12)&(rgb[:,:,1]>rgb[:,:,2]+12)&(rgb[:,:,0]>140))*255
contours,_=cv2.findContours(yellow,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
anchors={'A':np.array([-61,3,-94]),'B':np.array([-20,3,-94]),'C':np.array([23,2,-94])};sites={k:[]for k in anchors}
for contour in contours:
 if cv2.contourArea(contour)<100:continue
 pixel=cv2.approxPolyDP(contour,1.1,True).reshape(-1,2);xz=(pixel-offset)/scale@basis
 center=xz.mean(0);name=min(anchors,key=lambda k:np.linalg.norm(anchors[k][[0,2]]-center))
 sites[name].append(xz.round(4).tolist())
layout={'version':53,'coordinateSpace':'haven-meters-v1','source':'native Triad V2 targeting surface, original named floors and registered minimap plant regions','registration':registration,
 'spawn':{'attack':[-15,3,-24],'defend':[-31,3,-134]},'spawnYaw':{'attack':float(np.pi),'defend':0},
 'sites':[{'name':k,'position':p.tolist(),'floorTolerance':.7,'polygons':sites[k],'exclusions':[]}for k,p in anchors.items()],
 'orbs':[{'position':[-66,3,-71]},{'position':[27,2,-77]}]}
for site in layout['sites']:
 if not site['polygons']:raise RuntimeError('No native plant mask for site '+site['name'])
layoutfile=ROOT/'val-strike-html/game/config/haven-match.json';layoutfile.write_text(json.dumps(layout,indent=2),encoding='utf-8')
print('Haven collision triangles',len(tri),'native support',len(support),'minimap IoU',iou,'site polygons',{k:len(v)for k,v in sites.items()},flush=True)
