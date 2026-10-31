"""Make numbered review sheets; color/art decisions are authored separately."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'val-strike-html/assets/maps/textures'
OUT=ROOT/'tools/art-review';OUT.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',12)
files=sorted(SOURCE.glob('*.png'))
records=[]
for start in range(0,len(files),24):
 sheet=Image.new('RGB',(1000,1260),'#202b34');draw=ImageDraw.Draw(sheet)
 for local,path in enumerate(files[start:start+24]):
  x=local%4*250;y=local//4*210
  with Image.open(path) as image:
   thumb=image.convert('RGBA');thumb.thumbnail((242,166))
   for cy in range(0,168,16):
    for cx in range(0,244,16):draw.rectangle((x+cx,y+cy,x+cx+15,y+cy+15),fill='#626a70' if (cx//16+cy//16)%2 else '#90979b')
   sheet.paste(thumb,(x+(244-thumb.width)//2,y+(168-thumb.height)//2),thumb)
  label=path.name.removesuffix('_DF_png.png').removesuffix('_png.png')
  draw.text((x+4,y+170),f'{start+local:03d} '+label[:29],font=font,fill='white')
  draw.text((x+4,y+186),label[29:59],font=font,fill='white')
  records.append({'id':start+local,'file':path.name,'sheet':start//24})
 sheet.save(OUT/f'textures-{start//24:02d}.jpg',quality=90)
(OUT/'texture-index.json').write_text(json.dumps(records,indent=2))
print('Textures',len(files),'sheets',(len(files)+23)//24)
