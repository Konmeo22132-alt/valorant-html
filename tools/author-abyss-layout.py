"""Author match coordinates from named source geometry and native minimap.
This reads geometry/texture data on CPU; it never starts the game renderer.
"""
import json, struct, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
MAP=ROOT/'val-strike-html/assets/maps'
raw=(MAP/'raw/abyss_raw.glb').read_bytes()
doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
nav=json.loads((MAP/'optimized/abyss-art/match-navigation.json').read_text())
nodes=np.array(nav['nodes'])
source={n['name']:n for n in doc['nodes']}
def point(name):
    n=source[name];a=doc['accessors'][doc['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']]
    v=(np.array(a['min'])+a['max'])/2
    s=np.array(n.get('scale',[1,1,1]));s=s/.0067138671875 if max(abs(s))<.05 else s
    v*=s;q=np.array(n.get('rotation',[0,0,0,1]));t=2*np.cross(q[:3],v)
    v=v+q[3]*t+np.cross(q[:3],t)+n.get('translation',[0,0,0]);v[0]*=-1
    # Floor height is the top face, not the center of a thick floor slab.
    v[1]=n.get('translation',[0,0,0])[1]+a['max'][1]*s[1]
    return v
def floor(position):
    costs=((nodes-position)**2).sum(1)
    costs+=np.maximum(0,np.abs(nodes[:,1]-position[1])-.75)*100
    closest=nodes[costs.argmin()]
    return (closest if abs(closest[1]-position[1])<.75 else position).round(5).tolist()
anchors={
    'attack':floor(point('Shell_4_AtkSpawnFloorA')),
    'defend':floor(point('Shell_0_DefSpawnFloorA')),
    'A':floor(point('Shell_2_ASite_FloorB')),
    'B':floor(point('Shell_6_BSiteFloorA')),
}
native=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI/InGame/Minimap/Maps/Infinity/TX_Map_Infinity_Revealed.png'
targeting=(ROOT/'model/valorant-model-animations-agents/Content/Characters/Global/MapMarkup/TargetingMeshes/Infinity_NavMesh_TargetingDU_2025.pskx').read_bytes()
chunks={};cursor=0
while cursor+32<=len(targeting):
    label,_,size,count=struct.unpack_from('<20s3i',targeting,cursor);cursor+=32
    chunks[label.split(b'\0')[0].decode()]=(size,count,targeting[cursor:cursor+size*count]);cursor+=size*count
def records(name,fmt):
    size,count,data=chunks[name];return [struct.unpack_from(fmt,data,i*size) for i in range(count)]
points=np.array(records('PNTS0000','<3f'))
wedges=records('VTXW0000','<IffB3x')
key='FACE0000' if 'FACE0000' in chunks else 'FACE3200'
faces=records(key,'<3HBBI' if key=='FACE0000' else '<3IBBI')
# Export basis: Babylon X reflection after UE -> glTF Y-up conversion.
ground=np.column_stack((-points[:,0]/100,-points[:,1]/100))
im=Image.open(native).convert('RGB');small=np.array(im.resize((256,256)))
mask=small.max(2)>40
best=None
for orientation in range(16):
    degree=(orientation%8)*45;mirror=1 if orientation<8 else -1
    a=math.radians(degree);basis=np.array([[math.cos(a)*mirror,math.sin(a)],[-math.sin(a)*mirror,math.cos(a)]])
    p=ground@basis.T;mn=p.min(0);mx=p.max(0)
    yy,xx=np.where(mask);target_min=np.array([xx.min(),yy.min()]);target_max=np.array([xx.max(),yy.max()])
    scale=min((target_max-target_min)/(mx-mn));offset=(target_min+target_max)/2-(mn+mx)/2*scale
    canvas=Image.new('L',(256,256));draw=ImageDraw.Draw(canvas);r=max(1,.43*scale)
    projected_points=p*scale+offset
    for face in faces:draw.polygon([tuple(projected_points[wedges[i][0]]) for i in face[:3]],fill=255)
    projected=np.array(canvas)>0;iou=(mask&projected).sum()/(mask|projected).sum()
    if best is None or iou>best[0]:best=(float(iou),degree,basis,scale,offset,canvas)
iou,degree,basis,scale,offset,canvas=best
# The native minimap stores both plant regions in yellow. Split connected masks.
rgb=np.array(im).astype(np.int16);yellow=(rgb[:,:,0]>rgb[:,:,2]+12)&(rgb[:,:,1]>rgb[:,:,2]+12)&(rgb[:,:,0]>140)
regions=[];seen=set()
for y,x in zip(*np.where(yellow)):
    if (x,y) in seen:continue
    queue=[(int(x),int(y))];seen.add((x,y))
    for u,v in queue:
        for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            k=(u+dx,v+dy)
            if 0<=k[0]<rgb.shape[1] and 0<=k[1]<rgb.shape[0] and yellow[k[1],k[0]] and k not in seen:seen.add(k);queue.append(k)
    if len(queue)>100:regions.append(queue)
def contours(region):
    cells=set(map(tuple,region));edges={}
    for x,y in cells:
        for neighbor,a,b in [((x,y-1),(x,y),(x+1,y)),((x+1,y),(x+1,y),(x+1,y+1)),((x,y+1),(x+1,y+1),(x,y+1)),((x-1,y),(x,y+1),(x,y))]:
            if neighbor not in cells:edges.setdefault(a,[]).append(b)
    loops=[]
    while edges:
        start=next(iter(edges));current=start;loop=[]
        while True:
            loop.append(current);choices=edges.get(current)
            if not choices:break
            following=choices.pop()
            if not choices:del edges[current]
            current=following
            if current==start:break
        if len(loop)<4:continue
        # Preserve corners, remove only collinear pixel steps.
        loop=[p for i,p in enumerate(loop) if (p[0]-loop[i-1][0])*(loop[(i+1)%len(loop)][1]-p[1])!=(p[1]-loop[i-1][1])*(loop[(i+1)%len(loop)][0]-p[0])]
        if len(loop)<3:continue
        area=sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(loop,loop[1:]+loop[:1]))/2
        if abs(area)>4:loops.append((loop,area))
    return loops
site_polygons={};site_exclusions={}
for region in regions:
    pixels=np.array(region);mn=pixels.min(0);mx=pixels.max(0)
    corners=np.array([[mn[0],mn[1]],[mx[0],mn[1]],[mx[0],mx[1]],[mn[0],mx[1]]])/4
    world=(corners-offset)/scale@basis
    center=world.mean(0)
    name=min(['A','B'],key=lambda k:np.linalg.norm(center-np.array(anchors[k])[[0,2]]))
    for loop,area in contours(region):
        polygon=(np.array(loop)/4-offset)/scale@basis
        (site_polygons if area>0 else site_exclusions).setdefault(name,[]).append(polygon.round(5).tolist())
out={
 'version':30,'coordinateSpace':'abyss-meters-v1',
 'source':'named raw GLB floor geometry; plant masks registered from native Infinity minimap',
 'registration':{'iou':iou,'basis':basis.tolist(),'degrees':degree,'scale':float(scale*4),'offset':(offset*4).tolist()},
 'spawn':{k:anchors[k] for k in ['attack','defend']},
 'sites':[{'name':k,'position':anchors[k],'polygons':site_polygons.get(k,[]),'exclusions':site_exclusions.get(k,[]),'floorTolerance':.7} for k in ['A','B']],
 'sourceAnchors':{'attack':'Shell_4_AtkSpawnFloorA','defend':'Shell_0_DefSpawnFloorA','A':'Shell_2_ASite_FloorB','B':'Shell_6_BSiteFloorA'},
}
# Record source doorway regions; final barrier cuts are authored below in world space.
for k,v in anchors.items():print(k,v)
print('Native minimap registration',round(iou,3),degree,'plant regions', {k:len(v) for k,v in site_polygons.items()})
(ROOT/'tools/art-review/abyss-layout-source.json').write_text(json.dumps(out,indent=2))
preview=Image.merge('RGB',(canvas,canvas,canvas)).resize((768,768));draw=ImageDraw.Draw(preview)
for k,v in anchors.items():
    xy=np.array(v)[[0,2]]@basis.T*scale+offset;x,y=xy*3
    draw.ellipse((x-6,y-6,x+6,y+6),fill='red');draw.text((x+8,y),k,fill='white')
preview.save(ROOT/'tools/art-review/abyss-layout-source.png')
