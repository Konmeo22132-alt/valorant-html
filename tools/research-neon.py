"""Download Riot's Neon references and inspect them with one-thread ffmpeg."""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tools/art-review/neon'
GROUPS={'RELAY BOLT':('Q','relay-bolt'),'HIGH GEAR':('E','high-gear'),
        'FAST LANE':('C','fast-lane'),'OVERDRIVE':('X','overdrive')}

def main():
    html=(OUT/'riot-page.html').read_text(encoding='utf-8')
    data=json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',html,re.S).group(1))
    groups=next(b for b in data['props']['pageProps']['page']['blades']if 'groups' in b)['groups']
    report=[]
    for group in groups:
        content=group['content'];title=content['title']
        if title not in GROUPS:continue
        slot,name=GROUPS[title];folder=OUT/name;folder.mkdir(parents=True,exist_ok=True)
        url=content['media']['sources'][0]['src'];video=folder/(name+'.mp4')
        if not video.exists():subprocess.run(['curl.exe','-fsS','--retry','2','--max-time','120','-o',str(video),url],check=True)
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate,codec_name','-of','json',str(video)]))
        subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-threads','1','-i',str(video),'-an','-sn','-vf','fps=2,scale=480:270','-frames:v','60','-q:v','3',str(folder/'frame-%02d.jpg')],check=True)
        frames=sorted(folder.glob('frame-*.jpg'));sheet=Image.new('RGB',(1440,math.ceil(len(frames)/3)*294),'#101c24');draw=ImageDraw.Draw(sheet)
        for index,frame in enumerate(frames):
            x=index%3*480;y=index//3*294
            with Image.open(frame)as image:sheet.paste(image,(x,y))
            draw.text((x+8,y+273),f'{slot} {name} ~{index/2:.1f}s',fill='white')
        sheet.save(folder/'timeline.jpg',quality=90);sheet.close()
        report.append({'slot':slot,'name':name,'video':url,'bytes':video.stat().st_size,'sha256':hashlib.file_digest(video.open('rb'),'sha256').hexdigest(),'probe':probe,'description':content['description'],'timeline':(folder/'timeline.jpg').relative_to(ROOT).as_posix()})
        print(slot,title,probe['format']['duration'],'seconds',flush=True)
    (OUT/'riot-videos.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
