"""Review native texture dimensions/alpha in published VFX and embedded GLBs."""
import io,json,struct
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
vfx=json.loads((ROOT/'val-strike-html/assets/playable/vfx/texture-inventory.json').read_text())
published=0
for name,item in vfx['published'].items():
 if name[-2:] in ('-C','-Q','-E','-X'):continue
 with Image.open(ROOT/item['source']) as a,Image.open(ROOT/'val-strike-html'/item['file'].lstrip('/')) as b:
  assert a.size==b.size,(name,a.size,b.size)
  assert a.convert('RGBA').tobytes()==b.convert('RGBA').tobytes(),name
 published+=1
manifest=json.loads((ROOT/'val-strike-html/assets/playable/manifest.json').read_text())
count=0;files=0
def inspect(report):
 global count,files
 path=ROOT/report['file'];path=path if path.exists() else ROOT/'val-strike-html/assets/playable'/Path(report['file']).name
 with path.open('rb') as f:
  header=f.read(20);size=struct.unpack_from('<I',header,12)[0];doc=json.loads(f.read(size));base=28+size
  sources={Path(p).stem:ROOT/p for m in report['materials'] for p in m['textures'].values()}
  for image in doc.get('images',[]):
   source=sources.get(image['name'])
   assert source and source.exists(),(path,image['name'])
   view=doc['bufferViews'][image['bufferView']];f.seek(base+view.get('byteOffset',0));data=f.read(view['byteLength'])
   with Image.open(source) as a,Image.open(io.BytesIO(data)) as b:assert a.size==b.size,(path,image['name'],a.size,b.size)
   count+=1
 files+=1
for agent in manifest.values():
 for key in ('arms','body','resurrectionArms','resurrectionBody'):
  if key in agent:inspect(agent[key])
 for report in agent['effects'].values():inspect(report)
print(json.dumps({'publishedVFXPixelAlphaMatches':published,'GLBsReviewed':files,'nativeEmbeddedTextures':count,'status':'PASS'}))
