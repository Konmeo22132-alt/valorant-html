"""Inspect Riot's four Cypher videos and native source headers without a browser.

Run sequentially: each ffmpeg job has one decoder/filter thread. Only small
JPEGs are decoded for contact sheets; no game or Blender process is started.
"""
import argparse, hashlib, json, math, re, struct, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tools/art-review/cypher'
SOURCE=ROOT/'model/valorant-model-animations-agents/Content/Characters/Gumshoe/S0'
SLOTS=[('Q','cyber-cage','Ability_4'),('E','spycam','Ability_Q'),('C','trapwire','Ability_E'),('X','neural-theft','Ability_X')]

def read_header(path):
    result={'file':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size}
    with path.open('rb') as stream:
        while head:=stream.read(32):
            if len(head)!=32:raise ValueError('Truncated source '+str(path))
            name,_,size,count=struct.unpack('<20s3i',head);name=name.split(b'\0')[0].decode()
            if size<0 or count<0:raise ValueError(path)
            if name=='ANIMINFO':
                info=struct.unpack('<64s64s4i3f3i',stream.read(168))
                result.update(bones=info[2],fps=info[8],frames=info[11],duration=(info[11]-1)/info[8])
                stream.seek(size*count-168,1)
            elif name=='BONENAMES':
                names=[]
                for _ in range(count):
                    row=stream.read(size);names.append(row[:64].split(b'\0')[0].decode())
                result['boneNames']=names
                result['cameraCompensationCompatible']='R_WeaponMaster' in names and 'Camera' in names
            elif name in ('PNTS0000','VTXW0000','FACE0000','FACE3200','REFSKELT'):
                result[name]=count;stream.seek(size*count,1)
            else:stream.seek(size*count,1)
    return result

def page_data():
    page=ROOT/'tools/.artifacts/cypher-riot-page.html'
    if not page.exists():subprocess.run(['curl.exe','-fsS','--max-time','40','-o',str(page),'https://playvalorant.com/vi-vn/agents/cypher/'],check=True)
    text=page.read_text(encoding='utf-8')
    data=json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',text,re.S).group(1))
    blade=next(b for b in data['props']['pageProps']['page']['blades']if 'groups'in b)
    return blade['groups']

def videos():
    from PIL import Image,ImageDraw
    groups=page_data();report=[]
    for (slot,name,native),group in zip(SLOTS,groups):
        content=group['content'];url=content['media']['sources'][0]['src']
        folder=OUT/name;folder.mkdir(parents=True,exist_ok=True);video=folder/(name+'.mp4')
        if not video.exists():subprocess.run(['curl.exe','-fsS','--retry','2','--max-time','120','-o',str(video),url],check=True)
        meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',str(video)]))
        subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-threads','1','-i',str(video),'-an','-sn','-vf','fps=1,scale=320:180','-frames:v','45','-q:v','3',str(folder/'frame-%02d.jpg')],check=True)
        frames=sorted(folder.glob('frame-*.jpg'));sheet=Image.new('RGB',(1280,math.ceil(len(frames)/4)*204),'#101c24');draw=ImageDraw.Draw(sheet)
        for index,frame in enumerate(frames):
            x=index%4*320;y=index//4*204
            with Image.open(frame)as image:sheet.paste(image,(x,y))
            draw.text((x+8,y+183),f'{slot} {name} ~{index}s',fill='white')
        sheet.save(folder/'timeline.jpg',quality=88);sheet.close()
        item={'slot':slot,'name':name,'nativeFolder':native,'sourcePage':'https://playvalorant.com/vi-vn/agents/cypher/','video':url,'downloadBytes':video.stat().st_size,'sha256':hashlib.file_digest(video.open('rb'),'sha256').hexdigest(),'probe':meta,'timeline':(folder/'timeline.jpg').relative_to(ROOT).as_posix(),'sampling':'ffmpeg fps=1; approximate one-second timeline, not frame-accurate event timing'}
        report.append(item);print(slot,name,meta['format']['duration'],'seconds',video.stat().st_size,'bytes',flush=True)
    (OUT/'riot-videos.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

def inventory():
    files=[read_header(p)for p in sorted(SOURCE.rglob('*'))if p.suffix in ('.psk','.pskx','.psa')]
    images=[]
    for p in sorted(SOURCE.rglob('*.png')):
        with p.open('rb')as stream:header=stream.read(24)
        if header[:8]==b'\x89PNG\r\n\x1a\n':
            width,height=struct.unpack('>II',header[16:24]);images.append({'file':p.relative_to(ROOT).as_posix(),'width':width,'height':height,'bytes':p.stat().st_size})
    (OUT/'native-inventory.json').write_text(json.dumps({'files':files,'images':images},indent=2),encoding='utf-8')
    print('Native inventory:',len(files),'meshes/animations,',len(images),'textures',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--videos',action='store_true');parser.add_argument('--inventory',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    if args.inventory:inventory()
    if args.videos:videos()
