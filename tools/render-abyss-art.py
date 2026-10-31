"""Bounded CPU art preview of the actual VSC1 stream. No browser/GPU needed."""
import json,struct,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'val-strike-html/assets/maps/optimized/abyss-art'
manifest=json.loads((ASSETS/'manifest.json').read_text())
atlas=np.array(Image.open(ASSETS/'art-atlas.png').convert('RGBA'))
W,H=640,400
def render(eye,target,label):
 eye=np.array(eye,dtype=float);forward=np.array(target)-eye;forward/=np.linalg.norm(forward)
 right=np.cross([0,1,0],forward);right/=np.linalg.norm(right);up=np.cross(forward,right)
 basis=np.array([right,up,forward]).T;focal=W/(2*math.tan(math.radians(78)/2))
 image=np.full((H,W,3),[184,207,216],np.uint8);depth=np.full((H,W),np.inf)
 count=0
 for chunk in manifest['chunks']:
  mn=np.array(chunk['min']);mx=np.array(chunk['max']);center=(mn+mx)/2
  if np.linalg.norm(np.maximum(np.maximum(mn-eye,eye-mx),0))>100:continue
  data=(ASSETS/chunk['file']).read_bytes();offset=28+struct.unpack_from('<I',data,12)[0]
  n,ni=struct.unpack_from('<II',data,offset+4)
  verts=np.frombuffer(data,dtype='<f4',count=n*12,offset=offset+12).reshape(n,12)
  indices=np.frombuffer(data,dtype='<u4',count=ni,offset=offset+12+n*48).reshape(-1,3)
  points=(verts[:,:3]-eye)@basis
  screen=np.column_stack((W/2+points[:,0]/np.maximum(.01,points[:,2])*focal,H/2-points[:,1]/np.maximum(.01,points[:,2])*focal))
  tri=points[indices];valid=np.all(tri[:,:,2]>.08,axis=1)&np.any(tri[:,:,2]<100,axis=1)
  projected=screen[indices];valid&=(projected[:,:,0].max(1)>=0)&(projected[:,:,0].min(1)<W)&(projected[:,:,1].max(1)>=0)&(projected[:,:,1].min(1)<H)
  for ids in indices[valid]:
   p=screen[ids];z=points[ids,2];v=verts[ids]
   x0,y0=np.maximum([0,0],np.floor(p.min(0)).astype(int));x1,y1=np.minimum([W-1,H-1],np.ceil(p.max(0)).astype(int))
   if x1<x0 or y1<y0:continue
   a,b,c=p;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<.05:continue
   yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
   u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
   vv=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;ww=1-u-vv
   iz=u/z[0]+vv/z[1]+ww/z[2];d=1/np.maximum(iz,1e-8)
   mask=(u>=0)&(vv>=0)&(ww>=0)&(d<depth[y0:y1+1,x0:x1+1])
   if not mask.any():continue
   weights=np.stack([u/z[0],vv/z[1],ww/z[2]],axis=-1)/iz[:,:,None]
   uv=weights@v[:,6:8];xy=np.clip((uv*2048).astype(int),0,2047);tex=atlas[xy[:,:,1],xy[:,:,0]]
   if chunk['material']=='cutout':mask&=tex[:,:,3]>115
   normal=v[:,3:6].mean(0);normal/=max(1e-8,np.linalg.norm(normal));light=.78+.22*abs(np.dot(normal,[.25,.9,.35]))
   rgb=np.clip(tex[:,:,:3]*(weights@v[:,8:11])*light,0,255).astype(np.uint8)
   image[y0:y1+1,x0:x1+1][mask]=rgb[mask];depth[y0:y1+1,x0:x1+1][mask]=d[mask];count+=1
 result=Image.fromarray(image);draw=ImageDraw.Draw(result);draw.rectangle((0,0,W,25),fill='#182734');draw.text((10,7),label+' | CPU art preview',fill='white')
 result.save(ROOT/'tools/art-review'/('abyss-'+label+'.png'));print(label,count,flush=True)
anchor=np.array(manifest['spawnAnchor']);eye=anchor+[0,1.65,0]
render([-36,10,-8],[-48,10,-8],'site-a')
render([-20,24,34],[-20,8,50],'architecture')
render([-20,10,34],[-10,10,46],'courtyard')
