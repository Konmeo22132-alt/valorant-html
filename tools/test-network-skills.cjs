'use strict';
// Exercise real server code and packed Abyss collision without rendering.
const assert=require('node:assert/strict'),{Room}=require('../server/room.cjs'),{loadWorld,config,B}=require('../server/world.cjs');
const world=loadWorld(),room=new Room('Skill and lifecycle audit',2,{world}),players=Array.from({length:4},(_,i)=>room.join('Human '+i));
const [clove,jett,sage,enemy]=players;room.select(clove,{agent:'Clove',ready:true});room.select(sage,{agent:'Sage',ready:true});room.select(jett,{agent:'Jett',ready:true});room.select(enemy,{agent:'Clove',ready:true});
room.start(clove);room.now=room.selectionUntil;room.step(1/30);room.now=room.revealUntil;room.step(1/30);players.forEach(p=>p.loaded=true);room.step(1/30);room.now=room.rules.until;room.step(1/30);
let base;
for(const a of world.nav.nodes){const p=B.Vector3.FromArray(a),q=p.add(new B.Vector3(0,0,3));if(!room.pick(new B.Ray(p.add(new B.Vector3(0,1.1,0)),B.Vector3.Forward(),4))&&!room.pick(new B.Ray(p.add(new B.Vector3(0,.05,0)),B.Vector3.Up(),2))&&room.ground(q.asArray(),p,5)){base=p;break;}}
assert(base);players.forEach((p,i)=>{p.feet.copyFrom(base);p.feet.z+=i*1.5;p.velocity.setAll(0);p.input.keys=0;p.charges={C:config['playable-agents'][p.agent].C.charges,Q:config['playable-agents'][p.agent].Q.charges,E:config['playable-agents'][p.agent].E.charges};p.ult=p.ultCost;});
function aim(p,q,height=1.1){const d=q.feet.add(new B.Vector3(0,height,0)).subtract(room.eye(p));p.yaw=p.input.yaw=Math.atan2(d.x,d.z);p.pitch=p.input.pitch=-Math.atan2(d.y,Math.hypot(d.x,d.z));}
function wait(ms){const end=room.now+ms;while(room.now<end)room.step(1/30);}
function unlock(p){room.now=Math.max(room.now,p.skillLock||0);p.skillLock=0;p.equipUntil=0;}
// Clove C, E, Q and X; post-death smoke is anchored to the corpse.
clove.hp=50;assert.equal(room.ability(clove,{slot:'C'}),false);clove.lastVictim=room.now;assert(room.ability(clove,{slot:'C'}));wait(1100);assert(clove.hp>50&&clove.hasteUntil>room.now);
unlock(clove);assert(room.ability(clove,{slot:'E',points:[base.asArray()]}));assert(room.effects.some(e=>e.type==='smoke'&&e.starts>room.now));
unlock(clove);clove.pitch=clove.input.pitch=.7;assert(room.ability(clove,{slot:'Q'}));const meddle=room.projectiles.find(p=>p.type==='meddle');assert(meddle.release>room.now);wait(280);assert(meddle.released);assert(B.Vector3.Distance(B.Vector3.FromArray(meddle.position),room.eye(clove))>0);
// Use a server impact fixture after validating flight, then test real fuse,
// decay and recovery; the client cannot provide decay values to the command.
meddle.position=base.add(new B.Vector3(0,.05,0)).asArray();meddle.stuck=true;meddle.expires=room.now+750;wait(800);assert(clove.decay&&clove.decay.maximum===90);assert(!room.projectiles.includes(meddle));
unlock(clove);clove.charges.E=2;room.damage(clove,1000,enemy,'body','Vandal');assert.equal(clove.charges.E,1);const corpse=clove.deathPoint.clone();
assert(room.ability(clove,{slot:'E',points:[corpse.asArray()]}));const deadSmoke=room.effects.at(-1);assert.equal(deadSmoke.expires-deadSmoke.starts,config['playable-agents'].Clove.E.deadDuration);assert(B.Vector3.Distance(B.Vector3.FromArray(deadSmoke.position),corpse)<.6);
assert(room.ability(clove,{slot:'X'}));assert.equal(clove.ult,0);assert(clove.resurrectAt>room.now);wait(1550);assert.equal(clove.hp,100);const hp=clove.hp;room.damage(clove,1000,enemy);assert.equal(clove.hp,hp,'revive intangibility');
wait(config['playable-agents'].Clove.X.intangible+config['playable-agents'].Clove.X.reequip+50);room.damage(enemy,1000,clove,'head','Vandal');assert.equal(clove.reviveDeadline,0,'kill makes the revival permanent');
// Jett steered cloud, updraft, dash prime/execute and five actual knives.
unlock(jett);jett.input.yaw=jett.yaw=0;jett.input.pitch=jett.pitch=0;assert(room.ability(jett,{slot:'C'}));const cloud=room.projectiles.find(p=>p.type==='cloud');jett.input.steer=true;jett.input.yaw=jett.yaw=Math.PI/2;room.projectileStep(cloud,1/30);assert(cloud.velocity[0]>20);assert(Math.abs(cloud.velocity[2])<.01);
unlock(jett);assert(room.ability(jett,{slot:'Q'}));assert.equal(jett.velocity.y,config['playable-agents'].Jett.Q.verticalSpeed);jett.velocity.setAll(0);
unlock(jett);assert(room.ability(jett,{slot:'E'}));assert.equal(jett.charges.E,0);assert.equal(room.ability(jett,{slot:'E'}),false,'dash windup');room.now=jett.dashReady;assert(room.ability(jett,{slot:'E'}));assert(jett.dashUntil>room.now);assert.equal(jett.dashExpires,0);
unlock(jett);assert(room.ability(jett,{slot:'X',equip:true}));assert.equal(jett.knives,5);assert.equal(jett.skillEquipped,'X');unlock(jett);jett.input.pitch=jett.pitch=-1.4;assert(room.ability(jett,{slot:'X'}));assert.equal(jett.knives,4);assert.equal(room.ability(jett,{slot:'X'}),false,'knife cadence');
assert(room.command(jett,{op:'switch',name:'Classic'}));assert.equal(jett.knives,4);unlock(jett);assert(room.ability(jett,{slot:'X',equip:true}));assert.equal(jett.knives,4,'re-equip does not refill or spend another ult');unlock(jett);assert(room.ability(jett,{slot:'X',alternate:true}));assert.equal(jett.knives,0);
// Sage heal, slow field, real four-part wall and interruptible resurrection.
unlock(sage);sage.feet.copyFrom(base);clove.feet.copyFrom(base).z+=3;clove.hp=30;clove.lastDamageAt=-Infinity;aim(sage,clove);assert(room.ability(sage,{slot:'E'}));assert.equal(sage.charges.E,0);assert(sage.cooldowns.E>room.now);wait(1000);assert(clove.hp>30);
unlock(sage);sage.pitch=sage.input.pitch=.7;assert(room.ability(sage,{slot:'Q'}));const slow=room.projectiles.find(p=>p.type==='slow');slow.released=true;slow.position=base.add(new B.Vector3(0,.1,0)).asArray();slow.velocity=[0,0,0];slow.expires=room.now;room.projectileStep(slow,1/30);assert(room.effects.some(e=>e.type==='slow'));
unlock(sage);let wall;
for(let i=0;i<world.nav.nodes.length;i+=7){const p=B.Vector3.FromArray(world.nav.nodes[i]);sage.feet.copyFrom(p);if(room.ability(sage,{slot:'C',point:p.asArray(),yaw:0})){wall=room.effects.filter(e=>e.type==='wall');break;}}
assert(wall&&wall.length===4,'source wall has four valid floor segments');wait(2100);assert(wall.every(e=>e.fortified&&e.hp===config['playable-agents'].Sage.C.fortifiedHP));room.effects=room.effects.filter(e=>e.type!=='wall');
unlock(sage);sage.feet.copyFrom(base);clove.feet.copyFrom(base).z+=3;clove.intangibleUntil=0;room.damage(clove,1000,jett,'body','Vandal');clove.ult=0;aim(sage,clove,.2);assert(room.ability(sage,{slot:'X'}));assert(clove.resurrectAt>room.now);sage.feet.x+=20;room.step(1/30);assert.equal(clove.resurrectAt,0,'moving caster out of range interrupts resurrection');
unlock(sage);sage.feet.copyFrom(base);sage.ult=sage.ultCost;aim(sage,clove,.2);assert(room.ability(sage,{slot:'X'}));wait(3350);assert.equal(clove.hp,100);assert.equal(clove.dead,false);
// Pings remain immutable world anchors and are visible only to teammates.
unlock(clove);assert(room.ping(clove,{kind:'danger',map:true,point:base.asArray()}));const anchor=room.pings.at(-1).position.slice();clove.yaw=3;assert.deepEqual(room.pings.at(-1).position,anchor);assert.equal(room.snapshot(sage).pings.length,1);assert.equal(room.snapshot(jett).pings.length,0);
// A lost or released input cannot finish a held orb interaction later.
clove.ult=0;clove.feet.copyFrom(B.Vector3.FromArray(config['abyss-match'].orbs[0]));clove.inputAt=room.now;clove.interact=true;room.step(1/30);assert(clove.orbAt>0);wait(400);assert.equal(clove.orbAt,0);assert.equal(clove.interact,false);assert.equal(clove.ult,0);
const orbEnd=room.now+config.match.orbDuration+100;while(room.now<orbEnd){clove.inputAt=room.now;clove.interact=true;room.step(1/30);}assert.equal(clove.ult,config.economy.ultPoints.orb,'continuous valid input collects the actual orb');clove.interact=false;
// Round and rematch reset pending skills, channels, scores and fire timers.
sage.skillEquipped='E';sage.reviveCaster=clove.id;sage.knifeAt=999999;sage.input.ads=true;room.rules.finish('a','audit',room.now);assert.equal(room.rules.phase,'end');room.now=room.rules.until;room.step(1/30);assert.equal(room.rules.phase,'buy');assert.equal(sage.skillEquipped,null);assert.equal(sage.reviveCaster,null);assert.equal(sage.knifeAt,0);assert.equal(sage.input.ads,false);
room.rules.phase='live';room.rules.score={a:12,b:0};room.rules.finish('a','audit final',room.now);assert.equal(room.phase,'complete');assert.throws(()=>room.command(jett,{op:'rematch'}),/chủ phòng/);assert(room.command(clove,{op:'rematch'}));assert(players.every(p=>!p.ready&&!p.loaded));players.forEach(p=>p.ready=true);room.start(clove);room.now=room.selectionUntil;room.step(1/30);room.now=room.revealUntil;room.step(1/30);players.forEach(p=>p.loaded=true);room.step(1/30);assert.deepEqual(room.rules.score,{a:0,b:0});assert(players.every(p=>p.kills===0&&p.ult===0));
console.log('PASS server CPU: all 12 skills, floor/wall collision, corpse smoke, fuse/decay, revive/interrupt/intangibility, Jett re-equip/cadence, private world pings, round cleanup and rematch.');
