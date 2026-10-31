"""Author the reviewed Haven palette and compact flat-region material atlas."""
import json,math
from pathlib import Path
import numpy as np
import cv2
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'tools/art-review/haven-source'
OUT=ROOT/'val-strike-html/assets/maps/optimized/haven-art';OUT.mkdir(parents=True,exist_ok=True)
source=json.loads((REVIEW/'inventory.json').read_text(encoding='utf-8'))
choices={}
def assign(ids,color,mode='solid',group='architecture'):
    for i in ids:choices[i]={'color':color,'mode':mode,'group':group}
assign(range(319),'#b7aaa0')
# These groups were reviewed in materials-00 .. materials-07. Details get a
# small palette of broad painted regions; texture grain/normal maps are omitted.
assign([0,2,12,63,68,99,100,124,125,126,128,129,130,131,132,133,134,135,136,137,196,197,203,205,239,240,241,242,243,244,246,247,248,249,250,251,252,253,254,255,256,287,288,289,290], '#67787c','detail','metal')
assign([1],'#7b8055','detail','metal')
assign([3,112,213,217,218,219,220,221,222,232,257,258,259,260],'#7c807c')
assign([5,10,61,62,147,215,216,230,231],'#8e8875')
assign([4,81,121,146,195,261,272,318],'#000000','omit')
assign([8,37,38],'#34363b','solid','scenery')
assign([7,13,23,206,208,274,294,295,296],'#a67255','detail','wood')
assign([9,28,35,41,69,72,293,298,299,300,307,309,310,312],'#876344','solid','wood')
assign([36,66,273,304,308,311],'#49372f','solid','wood')
assign([70,101,102,103,305,306,315],'#a9654d','solid','wood')
assign([302,303],'#976946','solid','wood')
assign([297,313],'#50676b','solid','wood')
assign([314],'#a77d52','solid','wood')
assign([316],'#6a5547','solid','wood')
assign([11,31,53,54,55,56,58,59,60,64,65,67,71,73,74,75,76,77,78,79,80,84,85,86,87,113,114,115,122,139,140,148,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,199,200,201,202,204,210,212,214,233,234,235,236,237,238,262,263,271,276,277,278,279,280,281,282,283,284,285,286,292,301,317],'#9e7753','detail','wood')
assign([6,82,93,108,207,245],'#a9b5b0','cutout','marking')
assign([57,88,94],'#8f806c','cutout','marking')
assign([14,15,17,18,19,20,22,24,25,26,27,33,39,40,50,89,90,91,92,223,224,225,226,227,228,229],'#e7cea6')
assign([16,21],'#a7b5b3')
assign([23,27,229],'#c58a69')
assign([26],'#bdb39b')
assign([34,47,127,291],'#46545d','solid','metal')
assign([42],'#a39a7b')
assign([43,44,45],'#566f7d')
assign([46,104,105,120],'#c9e0df')
assign([48,29],'#c49c54','solid','metal')
assign([49,106],'#83cdba','solid','glass')
assign([51,52],'#68747b','detail','metal')
assign([83],'#c6e5e0','solid','light')
assign([95,96,97,111,149,150,151,152],'#809666','cutout','foliage')
assign([98],'#e8dfa6','cutout','foliage')
assign([107,109,110],'#d9bb7f','cutout','marking')
assign([116,117,118,119,123,275],'#89979b','detail','metal')
assign([138],'#547a61','detail','radianite')
assign([141,142,143,144,145],'#6a9a98','detail','screen')
assign([171,172],'#c5a170','solid','light')
assign([209],'#726860','solid','roof')
assign([211],'#a48743','detail','metal')
assign([264,266,267,270],'#665140','solid','wood')
assign([265,268],'#5e7f55','cutout','foliage')
assign([269],'#df9ed3','cutout','blossom')
assign([294],'#846548','solid','roof')
assign([295],'#8f7252','solid','roof')
assign([296],'#987257','solid','roof')

palettes={
 'wood':['#352c29','#533c30','#775238','#997049','#b58d5d','#dfc6a1','#a76049','#49656d','#879b96','#b59d50'],
 'metal':['#303e45','#4b5d65','#718188','#9caaa9','#c4ccc5','#9d674d','#c4a35e','#528178'],
 'radianite':['#233d35','#375c48','#609d6e','#7bcea0','#a5dfbf','#3c5056','#879693'],
 'marking':['#413a32','#8e806c','#ccb38c','#e6d2ac','#e8ded0'],
 'screen':['#223a43','#35626b','#55928c','#9ec8b5','#bf7e50','#d2bb76'],
 'architecture':['#594b41','#8e7660','#b49c7d','#d0b590','#ecd6b2','#a8b7b5'],
 'foliage':['#56744b','#79935e','#a1b17d'],
 'blossom':['#c783bd','#df9ed3','#f0bfe5']}
def rgb(h):return [int(h[i:i+2],16)for i in (1,3,5)]
atlas=Image.new('RGBA',(2048,1024));records=[]
for i,mat in enumerate(source['materials']):
    style=choices[i].copy();style.update({'id':i,'name':mat['name'],'sourceImage':mat.get('reviewImage')})
    base=rgb(style['color']);tile=Image.new('RGBA',(56,56),tuple(base)+(255,))
    image=REVIEW/'textures'/f'{i:03d}.png'
    if style['mode']in ('detail','cutout')and image.exists():
        original=Image.open(image).convert('RGBA').resize((112,112),Image.Resampling.LANCZOS)
        data=np.array(original);colors=data[:,:,:3];alpha=data[:,:,3]
        if style['mode']=='detail':
            colors=cv2.medianBlur(colors,7);colors=cv2.bilateralFilter(colors,7,35,35)
            palette=np.array([rgb(c)for c in palettes.get(style['group'],palettes['architecture'])],dtype=np.uint8)
            lab=cv2.cvtColor(colors,cv2.COLOR_RGB2LAB).astype(np.int16)
            plab=cv2.cvtColor(palette[None,:,:],cv2.COLOR_RGB2LAB).astype(np.int16)[0]
            nearest=np.argmin(np.sum((lab[:,:,None,:].astype(float)-plab[None,None,:,:])**2,axis=3),axis=2)
            ids=cv2.medianBlur(nearest.astype(np.uint8),5)
            painted=palette[ids];tile=Image.fromarray(np.dstack((painted,np.full_like(alpha,255)))).resize((56,56),Image.Resampling.NEAREST)
        else:
            # Keep the alpha silhouette, remove texture noise. No rectangular
            # solid cards and no alpha-blend layers in the runtime map.
            mask=np.uint8(alpha>100)*255
            if mask.min()==255 and style['group']=='marking':
                mask=np.uint8(colors.mean(2)>70)*255
            contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
            clean=np.zeros_like(mask)
            for c in contours:
                if cv2.contourArea(c)>=3:cv2.fillPoly(clean,[cv2.approxPolyDP(c,.8,True)],255)
            lum=cv2.cvtColor(colors,cv2.COLOR_RGB2GRAY)
            shade=np.where(lum>125,1.07,.91)
            painted=np.clip(np.array(base)[None,None,:]*shade[:,:,None],0,255).astype(np.uint8)
            tile=Image.fromarray(np.dstack((painted,clean))).resize((56,56),Image.Resampling.NEAREST)
    x=(i%32)*64+4;y=(i//32)*64+4
    atlas.paste(tile,(x,y));atlas.paste(tile.crop((0,0,1,56)).resize((4,56)),(x-4,y));atlas.paste(tile.crop((55,0,56,56)).resize((4,56)),(x+56,y))
    atlas.paste(tile.crop((0,0,56,1)).resize((64,4)),(x-4,y-4));atlas.paste(tile.crop((0,55,56,56)).resize((64,4)),(x-4,y+56))
    style['rect']=[(x+.5)/2048,1-(y+55.5)/1024,55/2048,55/1024]
    style['center']=[(x+28)/2048,1-(y+28)/1024]
    records.append(style)
atlas.save(OUT/'haven-atlas.png',optimize=True)
(OUT/'material-styles.json').write_text(json.dumps({'paletteSource':'Reviewed Haven native materials and supplied Site C low-poly reference','materials':records},indent=2),encoding='utf-8')
print('Haven material atlas', (OUT/'haven-atlas.png').stat().st_size,'bytes; materials',len(records))
