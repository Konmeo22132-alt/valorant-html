'use strict';
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebSocketServer,WebSocket}=require('../tools/node_modules/ws');
const {Room,clean}=require('./room.cjs'),{config,root,loadWorld}=require('./world.cjs');
const {Store}=require('./database.cjs');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.bin':'application/octet-stream','.woff2':'font/woff2','.mp4':'video/mp4'};
function createServer(options={}){
  for(const map of require('../val-strike-html/game/maps.js').ids)loadWorld(map);
  const store=new Store(options.database),rooms=new Map(),connections=new Set(),rate=config.network,attempts=new Map();let last=performance.now(),accumulator=0,snapshotAt=0;
  function respond(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  async function handler(req,res){
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{respond(res,400,{error:'URL không hợp lệ'});return;}
    const auth=store.session(req),secure=!!req.socket.encrypted||process.env.COOKIE_SECURE==='1';
    function cookie(token,age){res.setHeader('Set-Cookie',`vs_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`);}
    if(pathname.startsWith('/api/')){try{
      if(pathname==='/api/health'&&req.method==='GET'){respond(res,200,{ok:true,version:42,tickRate:rate.tickRate,rooms:rooms.size,connections:connections.size});return;}
      const write=['POST','PUT','DELETE'].includes(req.method);let body={};
      if(write){const origin=req.headers.origin;if((origin&&new URL(origin).host!==req.headers.host)||req.headers['sec-fetch-site']==='cross-site'){respond(res,403,{error:'Yêu cầu không hợp lệ.'});return;}if(!String(req.headers['content-type']||'').startsWith('application/json')){respond(res,415,{error:'Cần dữ liệu JSON.'});return;}
        let input='',length=0;for await(const chunk of req){length+=chunk.length;if(length>32768){respond(res,413,{error:'Dữ liệu quá lớn.'});return;}input+=chunk;}try{body=JSON.parse(input||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{respond(res,400,{error:'JSON không hợp lệ.'});return;}}
      if(pathname==='/api/login'&&req.method==='POST'){
        const peer=req.socket.remoteAddress,proxied=process.env.TRUST_PROXY==='1'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer),key=proxied?(req.headers['x-real-ip']||peer):peer,now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);const a=attempts.get(key)||{count:0,until:now+60000};if(++a.count>12){respond(res,429,{error:'Thử lại sau một phút.'});return;}attempts.set(key,a);
        if(typeof body.password!=='string'||body.password.length>128){respond(res,400,{error:'Thông tin đăng nhập không hợp lệ.'});return;}const session=await store.login(body.username,body.password);if(!session){respond(res,401,{error:'Tên đăng nhập hoặc mật khẩu chưa đúng.'});return;}cookie(session.token,14*86400);respond(res,200,{user:session.user,csrf:session.csrf,...store.userData(session.user.id)});return;
      }
      if(!auth){respond(res,401,{error:'Vui lòng đăng nhập.'});return;}
      if(write&&req.headers['x-vs-csrf']!==auth.csrf){respond(res,403,{error:'Phiên yêu cầu không hợp lệ. Tải lại trang.'});return;}
      if(pathname==='/api/me'&&req.method==='GET'){const d=store.userData(auth.id);if(d.room&&!rooms.get(d.room.room)?.members.some(p=>p.userId===auth.id)){store.clearRoom(auth.id);d.room=null;}respond(res,200,{user:{id:auth.id,username:auth.username,role:auth.role},csrf:auth.csrf,...d});return;}
      if(pathname==='/api/logout'&&req.method==='POST'){store.revoke(auth);for(const c of connections)if(c.auth.token_hash===auth.token_hash){detach(c,true);c.ws.close(4003,'Đã đăng xuất');}cookie('',0);respond(res,200,{ok:true});return;}
      if(pathname==='/api/profile'&&req.method==='PUT'){respond(res,200,{profile:store.saveProfile(auth.id,body)});return;}
      if(pathname==='/api/data'&&req.method==='PUT'){respond(res,200,{data:store.saveData(auth.id,body)});return;}
      if(pathname==='/api/results'&&req.method==='POST'){if(!['Unrated · Bot','Deathmatch'].includes(body.mode)||!['Clove','Jett','Sage'].includes(body.agent)||!String(body.id||'').startsWith('offline:')){respond(res,400,{error:'Kết quả không hợp lệ.'});return;}const number=n=>Math.max(0,Math.min(10000,Math.trunc(Number(n)||0)));const result={id:String(body.id).slice(0,100),at:Date.now(),mode:body.mode,map:body.map==='Haven'?'Haven':'Abyss',agent:body.agent,kills:number(body.kills),deaths:number(body.deaths),assists:number(body.assists),score:{a:number(body.score?.a),b:number(body.score?.b)},winner:body.winner===true,source:'bot'};store.record(auth.id,result);respond(res,200,{ok:true});return;}
      if(pathname==='/api/admin/users'){if(auth.role!=='admin'){respond(res,403,{error:'Chỉ admin được quản lý tài khoản.'});return;}if(req.method==='GET'){respond(res,200,{users:store.users()});return;}if(req.method==='POST'){await store.createUser(body);respond(res,201,{users:store.users()});return;}}
      if(pathname==='/api/rooms'&&req.method==='GET'){respond(res,200,{rooms:[...rooms.values()].map(r=>({id:r.id,name:r.name,mode:r.mode,gameMode:r.gameMode,map:r.map,size:r.size,phase:r.phase,players:r.members.filter(p=>p.connected).length,max:r.mode==='custom'&&r.gameMode!=='deathmatch'?r.size*2+4:r.size*2}))});return;}
      if(pathname==='/api/network'&&req.method==='GET'){respond(res,200,{host:req.headers.host,addresses:Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal).map(a=>a.address)});return;}
      respond(res,404,{error:'Không có chức năng này.'});return;
    }catch(error){respond(res,400,{error:error.message||'Không xử lý được yêu cầu.'});return;}}
    if(!['GET','HEAD'].includes(req.method)){respond(res,405,{error:'Method không hợp lệ'});return;}
    if(pathname.startsWith('/game/')&&pathname.endsWith('.html')&&!auth){res.writeHead(302,{Location:'/login?next='+encodeURIComponent(req.url)});res.end();return;}
    if(pathname==='/api/network'){respond(res,200,{host:req.headers.host,addresses:Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal).map(a=>a.address)});return;}
    const route=['/','/login','/agents','/collection','/career','/play','/settings'].includes(pathname)?'index.html':pathname.slice(1),file=path.resolve(root,route);
    if(!file.startsWith(root+path.sep)||route.includes('\0')){respond(res,403,{error:'Đường dẫn không hợp lệ'});return;}
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){respond(res,404,{error:'Không có tài nguyên này'});return;}
      let start=0,end=stat.size-1,status=200;const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
      if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}start=Number(m[1]);end=m[2]?Math.min(end,Number(m[2])):end;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    });
  }
  const server=options.tls?https.createServer(options.tls,handler):http.createServer(handler);
  const wss=new WebSocketServer({noServer:true,maxPayload:rate.maxMessageBytes,perMessageDeflate:false});
  function send(ws,value){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>rate.maxBufferedBytes){ws.close(1013,'Kết nối chậm');return;}ws.send(JSON.stringify(value));}
  function publish(room){for(const c of connections)if(c.room===room)send(c.ws,{type:'room',room:room.lobby(c.player),self:c.player.id,token:c.player.token});}
  function detach(c,leave=false){if(!c.room||!c.player)return;const room=c.room,p=c.player;
    if(p.connection===c){p.connected=false;p.disconnectedAt=Date.now();p.input.keys=0;p.inputQueue=[];p.interact=false;p.connection=null;p.left=leave;
      if(leave&&room.phase==='lobby'){room.members.splice(room.members.indexOf(p),1);if(room.host===p.id)room.host=room.members.find(p=>p.connected)?.id||room.members[0]?.id;}}
    if(leave&&room.host===p.id)room.host=room.members.find(p=>p.connected)?.id||room.host;
    if(leave&&c.auth)store.clearRoom(c.auth.id);c.room=null;c.player=null;publish(room);
  }
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'||connections.size>=rate.maxConnections){socket.destroy();return;}
    req.auth=store.session(req);if(!req.auth){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{socket.destroy();return;}if(origin.host!==req.headers.host){socket.destroy();return;}}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',(ws,req)=>{
    const c={ws,auth:req.auth,room:null,player:null,alive:true,count:0,window:Date.now()};connections.add(c);send(ws,{type:'hello',version:42,tickRate:rate.tickRate});
    ws.on('pong',()=>c.alive=true);
    ws.on('message',(bytes,binary)=>{
      if(binary)return ws.close(1003,'Chỉ nhận JSON');
      const now=Date.now();if(now-c.window>1000){c.window=now;c.count=0;}if(++c.count>rate.messagesPerSecond)return ws.close(1008,'Quá nhiều lệnh');
      let data;try{data=JSON.parse(bytes.toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Lệnh không hợp lệ');}catch{return send(ws,{type:'error',message:'JSON không hợp lệ'});}
      try{
        if(data.op==='heartbeat')return send(ws,{type:'heartbeat',client:data.client,server:performance.now()});
        if(data.op==='create'||data.op==='join'||data.op==='resume'){
          if(c.room)detach(c,true);let room;
          if(data.op==='create'){if(rooms.size>=rate.maxRooms)throw Error('Server đã đủ phòng.');room=new Room(data.name,data.size,{mode:data.mode||'unrated',...(data.mode==='custom'?{map:data.map,gameMode:data.gameMode}:{})});rooms.set(room.id,room);}
          else room=rooms.get(String(data.room||'').toUpperCase());if(!room)throw Error('Không tìm thấy phòng.');
          const existing=room.members.find(p=>p.userId===c.auth.id);if(data.op==='resume'&&!existing)throw Error('Phiên chơi không hợp lệ hoặc đã hết hạn.');
          for(const other of connections)if(other!==c&&other.auth.id===c.auth.id&&other.room&&other.room!==room){detach(other,true);other.ws.close(4001,'Đã chuyển phòng');}
          const p=room.join(store.userData(c.auth.id).profile.name,existing?.token);p.userId=c.auth.id;store.room(c.auth.id,p,room);if(p.connection&&p.connection!==c){p.connection.room=null;p.connection.player=null;p.connection.ws.close(4001,'Đã kết nối ở cửa sổ khác');}
          p.connected=true;p.left=false;p.connection=c;p.disconnectedAt=null;if(!room.host)room.host=p.id;c.room=room;c.player=p;publish(room);
          send(ws,{type:'chatHistory',room:room.id,messages:store.chatHistory(room,p)});
          if(room.phase!=='lobby')send(ws,room.snapshot(p));return;
        }
        if(data.op==='leave'){detach(c,true);return send(ws,{type:'left'});}
        if(!c.room)throw Error('Bạn chưa vào phòng.');
        if(data.op==='chat'){
          if(!c.player?.connected||c.player.connection!==c)throw Error('Bạn không còn kết nối với phòng.');
          if(typeof data.text!=='string'||data.text.length>280||typeof data.clientId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(data.clientId))throw Error('Tin nhắn không hợp lệ hoặc vượt quá 280 ký tự.');
          const text=data.text.normalize('NFC').replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,' ').trim();
          if(!text)throw Error('Vui lòng nhập tin nhắn.');
          const {message,created,recipients}=store.chatMessage(c.room,c.player,text,data.clientId,data.channel??'all');
          if(created){for(const peer of connections)if(peer.room===c.room&&(!recipients||recipients.has(peer.player?.userId)))send(peer.ws,{type:'chat',room:c.room.id,message});}
          else send(ws,{type:'chat',room:c.room.id,message});
          if(data.request)send(ws,{type:'reply',op:'chat',request:data.request,ok:true});
          return;
        }
        const ok=c.room.command(c.player,data);if(data.request)send(ws,{type:'reply',request:data.request,ok:ok!==false,message:ok===false?'Thao tác chưa hợp lệ trong trạng thái hiện tại.':undefined});
        if(['select','settings','pickAgent','lockAgent','start','loaded','request','rematch'].includes(data.op))publish(c.room);
      }catch(error){send(ws,{type:data.request?'reply':'error',op:data.op,request:data.request,ok:false,message:error.message});}
    });
    ws.on('close',()=>{detach(c);connections.delete(c);});ws.on('error',()=>{});
  });
  function advance(){
    const now=performance.now();accumulator+=Math.min(100,now-last);last=now;const dt=1/rate.tickRate;let steps=0;
    while(accumulator>=dt*1000&&steps++<rate.maxCatchupSteps){for(const room of rooms.values()){const phase=room.phase;room.step(dt);if(phase!==room.phase){if(room.phase==='complete')saveResults(room);publish(room);}}accumulator-=dt*1000;}
    if(now-snapshotAt<1000/rate.snapshotRate)return;snapshotAt=now;
    for(const room of rooms.values()){
      for(const p of [...room.members])if(!p.connected&&Date.now()-p.disconnectedAt>rate.reconnectGraceMs){
        if(room.phase==='lobby'){room.members.splice(room.members.indexOf(p),1);if(room.host===p.id)room.host=room.members.find(p=>p.connected)?.id;publish(room);}
        else if(room.phase==='playing'&&p.hp>0)room.damage(p,1000,null,'body','disconnect');
        if(room.host===p.id&&!p.connected){room.host=room.members.find(q=>q.connected)?.id;publish(room);}
      }
      if(!room.members.some(p=>p.connected)&&room.members.every(p=>!p.disconnectedAt||Date.now()-p.disconnectedAt>rate.reconnectGraceMs)){rooms.delete(room.id);continue;}
      for(const c of connections)if(c.room===room){if(room.phase!=='lobby')send(c.ws,room.snapshot(c.player));for(const {event,team} of room.events)if(!team||team===c.player.team)send(c.ws,{type:'event',event});}
      room.events=[];
    }
  }
  const interval=setInterval(advance,1000/rate.tickRate),heartbeat=setInterval(()=>{for(const c of connections){if(!c.alive){c.ws.terminate();continue;}c.alive=false;c.ws.ping();}},15000);
  interval.unref();heartbeat.unref();
  function saveResults(room){for(const p of room.members)if(p.userId&&p.team!=='observer')store.record(p.userId,{id:'online:'+room.id+':'+room.matchId+':'+p.id,at:Date.now(),mode:room.mode==='custom'?'CUSTOM · '+room.gameMode.toUpperCase():room.gameMode.toUpperCase(),map:require('../val-strike-html/game/maps.js').get(room.map).name,agent:p.agent,kills:p.kills,deaths:p.deaths,assists:p.assists,score:room.rules.score,winner:room.rules.winner===p.team,source:'server'});}
  server.on('close',()=>{clearInterval(interval);clearInterval(heartbeat);for(const c of connections)c.ws.terminate();wss.close();store.close();});
  return {server,rooms,wss,store,close:()=>new Promise(resolve=>{for(const c of connections)c.ws.terminate();server.close(resolve);})};
}
if(require.main===module){const port=Number(process.env.PORT||8455),host=process.env.HOST||'127.0.0.1',tls=process.env.TLS_KEY&&process.env.TLS_CERT?{key:fs.readFileSync(process.env.TLS_KEY),cert:fs.readFileSync(process.env.TLS_CERT)}:null;
  const app=createServer({tls});app.server.listen(port,host,()=>console.log(`VAL-STRIKE v42 ${tls?'https':'http'}://${host}:${port}/ · multiplayer ${config.network.tickRate} tick/s`));
  process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));process.on('SIGINT',()=>app.close().then(()=>process.exit(0)));
}
module.exports={createServer};
