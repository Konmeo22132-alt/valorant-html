"""Loopback-only UI review using production entry files and actual game assets."""
import http.server,json,pathlib,urllib.parse,re
ROOT=pathlib.Path(__file__).resolve().parents[1]/'val-strike-html'
SCENE_REVIEW=r'''<script>
let reviewFrames=0,reviewViewApplied=false,reviewView=new URLSearchParams(location.search).get('view'),reviewSpawn;
const reviewHUD=setInterval(()=>{
 if(typeof scene==='undefined'||!scene?.activeCamera||typeof camera==='undefined'||!camera)return;
 const view=reviewView;
 if(window.GameEntry?.phase==='ready'&&!reviewSpawn){
  reviewSpawn={position:camera.position.clone(),rotation:camera.rotation.clone(),fov:camera.fov,minZ:camera.minZ};
  const bar=document.createElement('nav');bar.id='review-tools';bar.style.cssText='position:fixed;right:10px;top:55px;z-index:10001;display:flex;gap:4px';
  for(const [key,label]of [['spawn','NGƯỜI CHƠI'],['a','SITE A'],['b','SITE B'],['c','SITE C']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{reviewView=key;reviewViewApplied=false;reviewFrames=0;};bar.appendChild(button);}
  for(const [key,label]of [['off','TẮT BÓNG'],['on','BẬT BÓNG'],['bias','BIAS .002']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{for(const material of Object.values(window.mapStreamer.materials))material.unfreeze();if(key==='bias'){scene._mapShadows.bias=.002;scene._mapShadows.getShadowMap().resetRefreshCounter();}else scene.shadowsEnabled=key==='on';reviewFrames=0;};bar.appendChild(button);}
  const hide=document.createElement('button');hide.textContent='ẨN CÔNG CỤ';hide.onclick=()=>{bar.hidden=true;bar.style.display='none';document.getElementById('review-diagnostic').hidden=true;};bar.appendChild(hide);
  document.body.appendChild(bar);
 }
 if(view&&!reviewViewApplied&&window.GameEntry?.phase==='ready'){
  const source={a:[[98,60,39],[61,94,5],58],b:[[18,82,4.65],[22,98,4.7]],c:[[-60,60,39],[-20,96,5],57]}[view];
  if(source){const point=p=>new BABYLON.Vector3(-p[0],p[2],-p[1]);camera.position.copyFrom(point(source[0]));camera.setTarget(point(source[1]));camera.minZ=.3;camera.maxZ=700;camera.fov=source[2]?2*Math.atan(source[2]/(2*BABYLON.Vector3.Distance(camera.position,point(source[1]))*engine.getAspectRatio(camera))):.8;}
  else if(view==='spawn'){camera.position.copyFrom(reviewSpawn.position);camera.rotation.copyFrom(reviewSpawn.rotation);camera.fov=reviewSpawn.fov;camera.minZ=reviewSpawn.minZ;}
  reviewViewApplied=true;
 }
 if(window.GameEntry?.phase==='ready'&&reviewFrames>120)return;
 if(window.GameEntry?.phase==='ready')uiPulse();window.__renderOnce=true;
 let diagnostic=document.getElementById('review-diagnostic');
 if(!diagnostic){diagnostic=document.createElement('output');diagnostic.id='review-diagnostic';diagnostic.style.cssText='position:fixed;right:10px;bottom:22px;z-index:10000;color:white;background:#10242bcc;font:11px monospace;padding:5px 8px';document.body.appendChild(diagnostic);}
 diagnostic.textContent=JSON.stringify({phase:window.GameEntry?.phase,waiting:scene.getWaitingItemsCount(),match:document.getElementById('match-status')?.textContent,render:[engine.getRenderWidth(),engine.getRenderHeight()],chunks:window.__mapStreamStats?.residentChunks,triangles:window.__mapStreamStats?.residentTriangles,casters:scene._mapShadows?.getShadowMap()?.renderList?.length,post:scene.activeCamera?._postProcesses?.filter(Boolean).length,errors:window.__errs});
 if(window.GameEntry?.phase==='ready')reviewFrames++;
},33);
</script>'''
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def send_data(self,data,kind):
        self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',len(data));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def do_GET(self):
        route=urllib.parse.urlsplit(self.path).path
        if route=='/game/preview-entry.html':
            html=(ROOT/'game/game.html').read_text(encoding='utf-8').replace('class="assets-pending"','')
            html=re.sub(r'<script src="/js/asset-preloader.js\?v=\d+"></script>','<script>window.VSAssets={ready:()=>Promise.resolve()};</script>',html)
            if urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('review')==['scene']:
                html=html.replace('</head>','<style>body[data-entry] #game-container{visibility:visible!important}#entry-shell,#loading-overlay,#fullscreen-required{display:none!important}</style></head>')
                html=html.replace('</body>',SCENE_REVIEW+'</body>')
            self.send_data(html.encode(),'text/html; charset=utf-8');return
        if route=='/game/config/match.json' and 'review=scene' in self.headers.get('Referer',''):
            value=json.loads((ROOT/'game/config/match.json').read_text(encoding='utf-8'));value['selectionDuration']=1200
            self.send_data(json.dumps(value).encode(),'application/json');return
        if route=='/api/me':
            self.send_data(json.dumps({'user':{'id':0,'username':'UI review','role':'player'},'csrf':'preview','profile':{'name':'Bạn','agent':'Clove','sensitivity':1,'fps':60,'crosshair':'#00ff41'},'history':[],'data':{}}).encode(),'application/json');return
        super().do_GET()
    def do_PUT(self):
        body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
        self.send_data(json.dumps({'profile':body}).encode(),'application/json')
print('Production entry preview on http://127.0.0.1:8460/game/preview-entry.html?map=abyss&mode=unrated',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',8460),Handler).serve_forever()
