"""Bake the reviewed, individually authored Abyss art direction to a small atlas."""
import json,math,colorsys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'val-strike-html/assets/maps/textures'
OUT=ROOT/'val-strike-html/assets/maps/optimized/abyss-art';OUT.mkdir(parents=True,exist_ok=True)
review=json.loads((ROOT/'tools/art-review/abyss-direction.json').read_text())
index=json.loads((ROOT/'tools/art-review/texture-index.json').read_text())
decisions={i:(color,mode) for i,color,mode in review['textures']}
atlas=Image.new('RGBA',(2048,2048));styles={}
def rgb(color):return tuple(int(color[i:i+2],16) for i in (1,3,5))
for item in index:
 i=item['id'];color,mode=decisions[i];base=np.array(rgb(color),dtype=float)
 with Image.open(SOURCE/item['file']) as source:
  im=source.convert('RGBA').resize((120,120),Image.Resampling.LANCZOS)
  original=np.array(im);a=original[:,:,3];image=im.filter(ImageFilter.MedianFilter(5));data=np.array(image)
 if mode in ('s','w'):tile=Image.new('RGBA',(120,120),tuple(base.astype(int))+(255,))
 elif mode=='l':
  # Preserve each leaf contour, with hand-selected color and two broad facets.
  # The card's two triangles never become the visible leaf silhouette.
  mask=np.uint8(a>=115)*255
  contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
  tile=Image.new('RGBA',(120,120));draw=ImageDraw.Draw(tile)
  for contour in contours:
   if cv2.contourArea(contour)<2:continue
   polygon=cv2.approxPolyDP(contour,1.0,True).reshape(-1,2)
   if len(polygon)<3:continue
   points=[tuple(map(int,p)) for p in polygon];draw.polygon(points,fill=tuple(base.astype(int))+(255,))
  ta=np.array(tile);luma=data[:,:,:3].mean(axis=2);factor=np.where(luma>np.median(luma[a>115]) if np.any(a>115) else False,1.10,.88)
  ta[:,:,:3]=np.clip(base[None,None,:]*factor[:,:,None],0,255).astype(np.uint8);tile=Image.fromarray(ta)
 else:
  # Large readable painted regions, not a single averaged color or photo grain.
  r=data[:,:,:3].astype(float)/255;maximum=r.max(2);minimum=r.min(2);saturation=(maximum-minimum)/(maximum+.001)
  luminance=r@np.array([.2126,.7152,.0722]);factor=np.where(luminance<.23,.65,np.where(luminance>.64,1.2,.96))
  painted=base[None,None,:]*factor[:,:,None]
  hue=np.array(Image.fromarray(data[:,:,:3]).convert('HSV'))[:,:,0]/255
  palette=np.array([rgb(c) for c in ['#B87968','#BFA05E','#8FA36B','#5EA799','#759BAB','#9786B1']])
  region=np.minimum(5,(hue*6).astype(int));chromatic=palette[region]*factor[:,:,None]
  painted=np.where((saturation>.26)[:,:,None],chromatic,painted)
  alpha=np.where(a>100,255,0) if mode=='d' else np.full_like(a,255)
  tile=Image.fromarray(np.dstack([np.clip(painted,0,255).astype(np.uint8),alpha.astype(np.uint8)]))
 x=i%16*128+4;y=i//16*128+4;atlas.paste(tile,(x,y))
 # Four-pixel gutters prevent atlas neighbours bleeding under bilinear sampling.
 atlas.paste(tile.crop((0,0,1,120)).resize((4,120)),(x-4,y));atlas.paste(tile.crop((119,0,120,120)).resize((4,120)),(x+120,y))
 atlas.paste(tile.crop((0,0,120,1)).resize((128,4)),(x-4,y-4));atlas.paste(tile.crop((0,119,120,120)).resize((128,4)),(x-4,y+120))
 styles[item['file']]={'id':i,'color':color,'mode':mode,'rect':[(x+.5)/2048,(y+.5)/2048,119/2048,119/2048]}
atlas.paste((255,255,255,255),(2040,2040,2048,2048))
mapping=json.loads((SOURCE/'material_texture_map.json').read_text());materials=json.loads((ROOT/'tools/abyss-source-materials.json').read_text())
result=[];unmapped=[];next_tile=len(index)
for i,material in enumerate(materials):
 name=material['name'];filename=mapping.get(name);style=dict(styles.get(filename,{'color':'#AFC2BF','mode':'s','rect':styles[index[14]['file']]['rect']}))
 if not filename:unmapped.append(name)
 if str(i) in review['materialOverrides']:
  style['color']=review['materialOverrides'][str(i)]
  if style['mode'] in ('p','d','l') and filename:
   original=styles[filename];source_id=original['id'];sx=source_id%16*128+4;sy=source_id//16*128+4
   data=np.array(atlas.crop((sx,sy,sx+120,sy+120)))
   base=np.array(rgb(original['color']),dtype=float)
   shade=np.clip(data[:,:,:3].mean(2)/max(1,base.mean()),.55,1.25)
   data[:,:,:3]=np.clip(np.array(rgb(style['color']))[None,None,:]*shade[:,:,None],0,255).astype(np.uint8)
   tile=Image.fromarray(data);x=next_tile%16*128+4;y=next_tile//16*128+4
   atlas.paste(tile,(x,y));atlas.paste(tile.crop((0,0,1,120)).resize((4,120)),(x-4,y));atlas.paste(tile.crop((119,0,120,120)).resize((4,120)),(x+120,y))
   atlas.paste(tile.crop((0,0,120,1)).resize((128,4)),(x-4,y-4));atlas.paste(tile.crop((0,119,120,120)).resize((128,4)),(x-4,y+120))
   style['rect']=[(x+.5)/2048,(y+.5)/2048,119/2048,119/2048];next_tile+=1
 style.update(name=name,sourceTexture=filename)
 result.append(style)
atlas.save(OUT/'art-atlas.png',optimize=True)
(OUT/'art-materials.json').write_text(json.dumps({'materials':result,'textures':styles,'review':review['direction'],'unmapped':unmapped},indent=2))
atlas.resize((1024,1024)).save(ROOT/'tools/art-review/painted-atlas.png')
print('Reviewed',len(styles),'textures; materials',len(result),'unmapped',len(unmapped))
