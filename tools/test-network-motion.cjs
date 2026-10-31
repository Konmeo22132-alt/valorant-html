'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{Room}=require('../server/room.cjs'),{loadWorld,config,B}=require('../server/world.cjs');
const world=loadWorld(),root=path.resolve(__dirname,'../val-strike-html'),scope={BABYLON:B};vm.createContext(scope);
for(const file of ['actor-motion','net-motion'])vm.runInContext(fs.readFileSync(path.join(root,'game/'+file+'.js'),'utf8'),scope);
const Motion=vm.runInContext('NetworkMotion',scope),results=[];
for(const rtt of [0,90,280,1000,3000])for(const fps of [60,144,240]){
 const room=new Room('two client prediction audit',1,{world,mode:'custom'}),players=[room.join('host'),room.join('guest')];players.forEach(p=>room.select(p,{ready:true}));room.start(players[0]);
 players.forEach(p=>room.command(p,{op:'lockAgent',agent:p.agent}));room.now=room.selectionUntil;room.step(1/30);room.now=room.revealUntil;room.step(1/30);players.forEach(p=>p.loaded=true);room.step(1/30);
 const state=p=>({...room.snapshot(p).members.find(s=>s.id===p.id),time:room.now,buyPhase:true});
 const clients=players.map(p=>{const motion=new Motion(config.movement,(o,d,l,f)=>room.pick(new B.Ray(o,d,l),f),{feet:B.Vector3.Zero(),velocity:B.Vector3.Zero()});motion.reset(state(p));return {p,motion,seq:p.input.seq,acc:0,first:null,origin:p.feet.clone(),lastDisplay:p.feet.clone(),maxFrame:0,incoming:[],outgoing:[],lastArrival:0};});
 let physics=0,snapshot=0;
 for(let frame=1;frame<=fps*7;frame++){
  const t=frame/fps,dt=1/fps;
  for(const c of clients){
   c.acc+=dt;
   while(c.acc+1e-8>=1/30){c.acc-=1/30;const keys=t<.12?0:t<.9?8:t<1.3?0:t<1.85?4:0,input={op:'input',seq:++c.seq,keys,yaw:0,pitch:0,ads:false};
    c.motion.predict(input);const jitter=rtt?Math.sin(c.seq*2.17)*.025:0,at=Math.max(c.lastArrival+.00001,t+rtt/2000+jitter);c.lastArrival=at;c.outgoing.push({at,input});
   }
   while(c.outgoing[0]?.at<=t)room.command(c.p,c.outgoing.shift().input);
  }
  physics+=dt;snapshot+=dt;
  while(physics+1e-8>=1/30){physics-=1/30;room.step(1/30);}
  if(snapshot+1e-8>=.05){snapshot-=.05;for(const c of clients)c.incoming.push({at:t+rtt/2000,state:state(c.p)});}
  for(const c of clients){while(c.incoming[0]?.at<=t)c.motion.reconcile(c.incoming.shift().state);
   const display=c.motion.render(Math.max(0,c.acc)*30,dt);if(c.first===null&&B.Vector3.DistanceSquared(display,c.origin)>.0001)c.first=t;
   c.maxFrame=Math.max(c.maxFrame,Math.hypot(display.x-c.lastDisplay.x,display.z-c.lastDisplay.z));c.lastDisplay.copyFrom(display);
   assert(display.asArray().every(Number.isFinite));assert(Math.hypot(c.motion.actor.velocity.x,c.motion.actor.velocity.z)<=6.76);assert(display.y>-10);
  }
 }
 for(const c of clients){assert(c.first<.2,'input must respond locally before an RTT');assert(B.Vector3.Distance(c.motion.actor.feet,c.p.feet)<.03,'prediction converges after release');assert(c.maxFrame<.22,'no large per-frame teleport');assert(c.p.hp>0,'spawn remains supported');}
 results.push({rtt,fps,hostMaxStep:clients[0].maxFrame,guestMaxStep:clients[1].maxFrame,response:clients[1].first-.12});
}
fs.mkdirSync(path.join(__dirname,'.artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'.artifacts/network-motion-audit.json'),JSON.stringify(results,null,2));
// A socket outage does not stop local physics and cannot grow replay memory
// indefinitely. On reconnection, reset to the fresh authoritative snapshot.
const offline=new Motion(config.movement,(o,d,l,f)=>world.collision.pick(new B.Ray(o,d,l),f),{feet:B.Vector3.Zero(),velocity:B.Vector3.Zero()});
const spawn=config['abyss-match'].spawn.attack;
offline.reset({position:spawn,velocity:[0,0,0],hp:100,weapon:'Classic',agent:'Clove',grounded:true,time:0,inputSeq:0});
const beginning=offline.actor.feet.clone();for(let n=1;n<=900;n++){offline.predict({seq:n,keys:n%120<60?8:4,yaw:0,pitch:0});assert(offline.pending.length<=120);assert(offline.render(.5,1/30).asArray().every(Number.isFinite));}
assert(B.Vector3.Distance(offline.actor.feet,beginning)>.1,'offline input still moves');
offline.reset({position:spawn,velocity:[0,0,0],hp:100,weapon:'Classic',grounded:true,time:30000,inputSeq:950});assert.equal(offline.pending.length,0);assert(offline.actor.feet.equals(B.Vector3.FromArray(spawn)));
console.log('PASS actual host/guest prediction at 0/90/280/1000/3000 ms RTT, jitter and 60/144/240 FPS; 30-second outage keeps local movement, bounded memory and fresh-snapshot reconnect.');
