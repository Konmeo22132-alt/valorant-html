'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{createServer}=require('../server/server.cjs'),WS=require('./node_modules/ws'),{config}=require('../server/world.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const duration=config.match.selectionDuration;config.match.selectionDuration=900;
 const app=createServer({database:':memory:'}),peers=[];await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const port=app.server.address().port,base='http://127.0.0.1:'+port;
 async function account(username){const password=crypto.randomBytes(18).toString('hex');await app.store.createUser({username,password});const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});assert.equal(login.status,200);return login.headers.get('set-cookie').split(';')[0];}
 function peer(cookie){const socket=new WS('ws://127.0.0.1:'+port+'/ws',{headers:{Cookie:cookie,Origin:base}}),messages=[];socket.on('message',bytes=>messages.push(JSON.parse(bytes)));socket.on('error',error=>messages.push({type:'socketError',message:error.message}));const p={socket,messages,send:data=>socket.send(JSON.stringify(data))};peers.push(p);return p;}
 async function until(p,predicate){const end=Date.now()+8000;while(Date.now()<end){const value=p.messages.find(predicate);if(value)return value;const error=p.messages.find(m=>m.type==='socketError');if(error)throw Error(error.message);await sleep(10);}throw Error('Timed out: '+p.messages.slice(-3).map(m=>m.type+':'+m.room?.phase).join(','));}
 try{
  const hostCookie=await account('AuditHost'),guestCookie=await account('AuditGuest'),host=peer(hostCookie),guest=peer(guestCookie);await until(host,m=>m.type==='hello');await until(guest,m=>m.type==='hello');
  host.send({op:'create',name:'Entry audit',mode:'custom',map:'haven',gameMode:'deathmatch',size:1});const entered=await until(host,m=>m.type==='room');assert.equal(entered.room.map,'haven');assert.equal(entered.room.gameMode,'deathmatch');guest.send({op:'join',room:entered.room.id});const joined=await until(guest,m=>m.type==='room');
  guest.send({op:'settings',map:'abyss',request:101});assert.equal((await until(guest,m=>m.type==='reply'&&m.request===101)).ok,false,'guest cannot change custom map');
  host.send({op:'settings',map:'abyss',gameMode:'unrated',request:102});assert((await until(host,m=>m.type==='reply'&&m.request===102)).ok);
  await until(guest,m=>m.type==='room'&&m.room.map==='abyss'&&m.room.gameMode==='unrated');
  host.send({op:'settings',map:'haven',request:103});assert((await until(host,m=>m.type==='reply'&&m.request===103)).ok);
  await until(guest,m=>m.type==='room'&&m.room.map==='haven'&&m.room.gameMode==='unrated');
  host.send({op:'select',ready:true,request:1});guest.send({op:'select',ready:true,request:1});await until(host,m=>m.type==='reply'&&m.request===1);await until(guest,m=>m.type==='reply'&&m.request===1);
  host.send({op:'start',request:2});await until(host,m=>m.type==='reply'&&m.request===2&&m.ok);const selecting=await until(guest,m=>m.type==='room'&&m.room.phase==='selecting');assert.equal(selecting.room.members.find(m=>m.id===entered.self).agent,null,'enemy selection is hidden');
  host.send({op:'lockAgent',agent:'Clove',request:3});guest.send({op:'lockAgent',agent:'Jett',request:3});assert((await until(host,m=>m.type==='reply'&&m.request===3)).ok);assert((await until(guest,m=>m.type==='reply'&&m.request===3)).ok);
  const revealed=await until(guest,m=>m.type==='room'&&m.room.phase==='revealing');assert.equal(revealed.room.members.find(m=>m.id===entered.self).agent,'Clove');
  await until(guest,m=>m.type==='room'&&m.room.phase==='loading');host.send({op:'loaded'});guest.send({op:'loaded'});const snapshot=await until(guest,m=>m.type==='snapshot'&&m.room.phase==='playing');assert.equal(snapshot.rules.phase,'buy');assert.equal(snapshot.room.map,'haven');assert.equal(snapshot.room.gameMode,'unrated');
  const own=snapshot.members.find(m=>m.id===joined.self);assert(own.ammo);assert.equal(snapshot.members.find(m=>m.id!==joined.self).ammo,undefined);
  guest.send({op:'input',seq:1,keys:8,yaw:0,pitch:0,position:[9999,9999,9999]});const moved=await until(guest,m=>m.type==='snapshot'&&m.members?.some(p=>p.id===joined.self&&p.inputSeq>=1));const current=moved.members.find(m=>m.id===joined.self);assert(current.position.every(Number.isFinite));assert(current.position[1]>0);assert(current.position[0]<100);assert(current.receivedInputSeq>=current.inputSeq);
  guest.socket.close();await sleep(80);const resumed=peer(guestCookie);await until(resumed,m=>m.type==='hello');resumed.send({op:'resume',room:entered.room.id,token:joined.token});const restored=await until(resumed,m=>m.type==='room');assert.equal(restored.self,joined.self);
  console.log('PASS authenticated two-client flow: selection/privacy, lock-in, timed reveal, loading barrier, gameplay snapshot, processed input acknowledgment and reconnect.');
 }finally{peers.forEach(p=>p.socket.terminate());await app.close();config.match.selectionDuration=duration;}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
