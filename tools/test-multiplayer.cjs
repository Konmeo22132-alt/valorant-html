'use strict';
const assert=require('node:assert/strict'),{Room}=require('../server/room.cjs'),{loadWorld,B,config}=require('../server/world.cjs');
const {createServer}=require('../server/server.cjs'),WS=require('ws');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const world=loadWorld(),room=new Room('Authority audit',1,{world}),a=room.join('A'),b=room.join('B');
  a.ready=b.ready=true;room.start(a);a.loaded=b.loaded=true;room.step(1/30);assert.equal(room.rules.phase,'buy');assert.equal(room.phase,'playing');
  const floor=world.collision.pick(new B.Ray(a.feet.add(new B.Vector3(0,.6,0)),B.Vector3.Down(),1),true);assert(floor,'real Abyss spawn must have collision floor');
  assert.equal(room.command(a,{op:'buy',kind:'weapon',name:'Vandal'}),false,'server rejects spending unavailable money');assert.equal(a.credits,800);
  assert(room.command(a,{op:'buy',kind:'weapon',name:'Ghost'}));assert.equal(a.credits,300);assert.equal(a.ammo.Ghost.clip,13);
  assert(room.command(a,{op:'sell',kind:'weapon',name:'Ghost'}));assert.equal(a.credits,800);assert.equal(room.command(a,{op:'sell',kind:'weapon',name:'Ghost'}),false,'no duplicate refunds');
  assert(room.command(a,{op:'buy',kind:'skill',slot:'Q'}));assert.equal(a.charges.Q,1);assert.equal(a.credits,550);
  const start=a.feet.clone();room.command(a,{op:'input',seq:1,keys:0,yaw:0,pitch:0,position:[9999,9999,9999],hp:999,credits:99999});room.step(1/30);
  assert(B.Vector3.Distance(a.feet,start)<.1,'client position cannot teleport');assert.equal(a.hp,100);assert.equal(a.credits,550);
  assert.equal(room.command(a,{op:'input',seq:2,keys:255,yaw:NaN,pitch:0}),false);
  assert.equal(room.command(a,{op:'input',seq:1,keys:255,yaw:0,pitch:0}),false,'old input sequence rejected');
  room.now=room.rules.until;room.step(1/30);assert.equal(room.rules.phase,'live');assert.equal(room.command(a,{op:'buy',kind:'armor',name:'light'}),false);
  // Use a clear corridor in real collision data; compare accepted damage with
  // server damage tables and ensure forged targets/damage are ignored.
  let corridor;
  for(const node of world.nav.nodes){const p=B.Vector3.FromArray(node),q=p.add(new B.Vector3(0,0,3));
    if(!world.collision.pick(new B.Ray(p.add(new B.Vector3(0,1.125,0)),B.Vector3.Forward(),3))&&world.collision.pick(new B.Ray(q.add(new B.Vector3(0,.4,0)),B.Vector3.Down(),.7),true)){corridor=p;break;}}
  assert(corridor,'Abyss has a clear test corridor');a.feet.copyFrom(corridor);b.feet.copyFrom(corridor).z+=3;
  a.weapon='Classic';a.equipUntil=0;a.skillLock=0;a.input.yaw=a.yaw=0;a.input.pitch=a.pitch=Math.atan2(.575,3);a.ammo.Classic={clip:12,reserve:36};
  const hp=b.hp;assert(room.command(a,{op:'shoot',damage:999999,target:b.id,origin:b.position}));assert.equal(a.ammo.Classic.clip,11);assert(b.hp<hp&&b.hp>0,'server ray and weapon table decide damage, not client values');
  const damaged=b.hp;assert.equal(room.command(a,{op:'shoot'}),false,'fire cadence enforced');assert.equal(b.hp,damaged);
  assert(room.command(a,{op:'reload'}));assert.equal(room.command(a,{op:'shoot'}),false,'cannot shoot during reload');
  room.now=a.reloadUntil;room.step(1/30);assert.equal(a.ammo.Classic.clip,12);
  assert.equal(room.command(a,{op:'ability',slot:'E',points:[[9999,0,9999]]}),false);assert.equal(a.charges.E,1);
  assert(room.command(a,{op:'ability',slot:'E',points:[corridor.asArray()]}));assert.equal(a.charges.E,0);assert(room.effects.some(e=>e.type==='smoke'));
  room.now=a.skillLock;assert(room.command(a,{op:'ability',slot:'Q'}));assert.equal(a.charges.Q,0);assert(room.projectiles.some(e=>e.type==='meddle'));
  const three=new Room('Copies',3,{world}),players=Array.from({length:6},(_,i)=>three.join('P'+i));const team=players.filter(p=>p.team==='a');team.forEach(p=>p.ready=false);
  assert(three.select(team[0],{agent:'Clove'}));assert(three.select(team[1],{agent:'Clove'}));assert.throws(()=>three.select(team[2],{agent:'Clove'}),/hai|bản sao/);
  assert.throws(()=>room.join('Late'),/đã bắt đầu/);assert.equal(room.join('Resume',a.token),a);
  const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port,clients=[];
  function peer(){const socket=new WS('ws://127.0.0.1:'+port+'/ws'),messages=[];socket.on('message',b=>messages.push(JSON.parse(b)));clients.push(socket);return {socket,messages,send:d=>socket.send(JSON.stringify(d))};}
  async function until(p,fn){const end=Date.now()+3000;while(Date.now()<end){const found=p.messages.find(fn);if(found)return found;await delay(10);}throw Error('WebSocket response timeout');}
  try{
    const x=peer(),y=peer();await until(x,m=>m.type==='hello');await until(y,m=>m.type==='hello');
    x.send({op:'create',name:'Integration',size:1,player:'One'});const joined=await until(x,m=>m.type==='room');
    y.send({op:'join',room:joined.room.id,player:'Two'});const two=await until(y,m=>m.type==='room');assert.equal(two.room.members.length,2);
    x.send({op:'select',ready:true,request:1});y.send({op:'select',ready:true,request:2});assert((await until(x,m=>m.type==='reply'&&m.request===1)).ok);assert((await until(y,m=>m.type==='reply'&&m.request===2)).ok);
    x.send({op:'start',request:3});assert((await until(x,m=>m.type==='reply'&&m.request===3)).ok);await until(y,m=>m.type==='room'&&m.room.phase==='loading');
    x.send({op:'loaded'});y.send({op:'loaded'});const snapshot=await until(x,m=>m.type==='snapshot'&&m.room.phase==='playing');assert.equal(snapshot.members.length,2);assert.equal(snapshot.rules.phase,'buy');
    const privateAmmo=snapshot.members.find(m=>m.id===joined.self).ammo;assert(privateAmmo);assert.equal(snapshot.members.find(m=>m.id!==joined.self).ammo,undefined);
    const token=two.token,self=two.self;y.socket.close();await delay(100);const z=peer();await until(z,m=>m.type==='hello');z.send({op:'resume',room:joined.room.id,token});const resumed=await until(z,m=>m.type==='room');assert.equal(resumed.self,self);assert.equal(resumed.room.members.length,2);
    x.send({op:'leave'});const transferred=await until(z,m=>m.type==='room'&&m.room.host===self);assert.equal(transferred.room.host,self,'host leaving transfers control to a connected player');
    const request=await fetch('http://127.0.0.1:'+port+'/api/health');assert((await request.json()).ok);
    assert.equal((await fetch('http://127.0.0.1:'+port+'/agents')).status,200);
    console.log('PASS multiplayer: real Abyss collision, authority/input replay, purchase/refund, cadence/reload/damage, skill resources/range, copy cap, WebSocket room/start/snapshots/reconnect, private ammo, HTTP routes');
  }finally{clients.forEach(c=>c.terminate());await app.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
