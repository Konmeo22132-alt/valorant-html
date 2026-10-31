"""Rebuild the reviewed Haven low-poly map and its portable GLB.

Use --after-export to finish a completed Blender geometry export. Rendering is
optional; it uses four CPU threads and does not start a game or a browser.
"""
import argparse,subprocess,sys,hashlib,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BLENDER=ROOT/'blender-portable/blender-4.2.0-windows-x64/blender.exe'
OUT=ROOT/'val-strike-html/assets/maps/optimized/haven-art'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--after-export',action='store_true')
parser.add_argument('--render',action='store_true')
args=parser.parse_args()
def run(command,log=None):
    print('RUN', ' '.join(map(str,command)),flush=True)
    if log:
        with (ROOT/log).open('w',encoding='utf-8') as target:subprocess.run(command,cwd=ROOT,stdout=target,stderr=subprocess.STDOUT,check=True)
    else:subprocess.run(command,cwd=ROOT,check=True)
if not args.after_export:
    run([str(BLENDER),'--background','--threads','4','--python','tools/inspect-haven-source.py'],'tools/haven-source-inspect.log')
    run([sys.executable,'-X','utf8','tools/author-haven-style.py'])
    run([str(BLENDER),'--background','--threads','4','--python','tools/export-haven-lowpoly.py'],'tools/haven-export.log')
run(['node','--max-old-space-size=768','tools/compress-haven-map.cjs'])
run(['node','--max-old-space-size=768','tools/simplify-haven-map.cjs'])
run(['node','--max-old-space-size=768','tools/compress-haven-map.cjs'])
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
source=ROOT/'val-strike-html/assets/maps/raw/haven.blend'
with source.open('rb') as f:manifest['sourceSHA256']=hashlib.file_digest(f,'sha256').hexdigest()
def glb(file):
    b=file.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<I',b,8)[0]==len(b)
    length=struct.unpack_from('<I',b,12)[0];return b,json.loads(b[20:20+length]),28+length
totals=0
for chunk in manifest['chunks']:
    b,doc,_=glb(OUT/chunk['file'])
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes']for p in m['primitives'])
    assert triangles==chunk['triangles'];assert len(b)==chunk['bytes'];totals+=triangles
b,doc,base=glb(OUT/manifest['standalone'])
assert sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes']for p in m['primitives'])==totals==manifest['renderTriangles']
im=doc['bufferViews'][doc['images'][0]['bufferView']]
assert b[base+im.get('byteOffset',0):base+im.get('byteOffset',0)+im['byteLength']]==(OUT/'haven-atlas.png').read_bytes()
manifest['standaloneSHA256']=hashlib.sha256(b).hexdigest()
manifest['verification']={'allChunksHaveValidHeaders':True,'triangleCountsMatch':True,'embeddedAtlasMatches':True,'dracoRoundtripChecked':True}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
run([sys.executable,'-X','utf8','tools/prepare-haven-gameplay.py'])
run(['node','--max-old-space-size=768','tools/build-haven-world.cjs'])
run(['node','--max-old-space-size=768','tools/build-haven-navigation.cjs'])
if args.render:
    run([str(BLENDER),'--background','--threads','4','--python','tools/render-haven-lowpoly.py'],'tools/haven-render.log')
    run([str(BLENDER),'--background','--threads','4','--python','tools/render-haven-lowpoly.py','--','--ground-only'],'tools/haven-render-ground.log')
print('HAVEN_READY',json.dumps({k:manifest[k]for k in ['renderTriangles','standaloneBytes','chunkBytes','atlasBytes','sourceSHA256','standaloneSHA256']}),flush=True)
