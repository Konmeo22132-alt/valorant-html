const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {MatchRules}=require('../val-strike-html/game/match-rules.js');
const config=Object.fromEntries(['match','rounds','economy'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(__dirname,'../val-strike-html/game/config/'+n+'.json')))]));
const roster=()=>['a','b'].flatMap(team=>['Clove','Clove','Jett','Jett','Sage'].map((agent,id)=>({team,agent,id,position:[id,0,0],ultCost:8})));
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('two copies per team, independent opposing team, third rejected',()=>{
  const r=new MatchRules(config),players=roster();r.members=players;
  assert(!r.choose(players[4],'Clove'));assert(r.choose(players[0],'Sage'));assert(r.choose(players[4],'Clove'));
  r.start(players,0);players[3].agent='Clove';assert.throws(()=>new MatchRules(config).start(players,0),/tối đa/);
});
check('buy/sell refunds once and locks when live',()=>{
  const r=new MatchRules(config);r.start(roster(),0);const p=r.members[0];
  assert(r.buy(p,'test',400,()=>true));assert.equal(p.credits,400);assert(r.sell(p,'test',()=>true));assert.equal(p.credits,800);assert(!r.sell(p,'test',()=>true));
  r.tick(45000);assert(!r.buy(p,'test',100,()=>true));assert.equal(r.until,145000);
});
check('plant, dead attackers after plant, defuse checkpoint persists across actors',()=>{
  const r=new MatchRules(config);r.start(roster(),0);r.tick(45000);const attacker=r.members[0],defender=r.members[5],other=r.members[6];
  assert(r.beginChannel(attacker,'plant',46000,true,attacker.position));r.tick(49999);assert.equal(r.spike.state,'carried');r.tick(50000);assert.equal(r.spike.state,'planted');
  assert.equal(attacker.credits,1100);assert.equal(attacker.ult,1);
  for(const p of r.members.filter(p=>p.team==='a'))r.killed(p,defender,51000);
  r.tick(52000);assert.equal(r.phase,'live');
  assert(r.beginChannel(defender,'defuse',53000,true,[0,0,0]));r.tick(56500);r.cancelChannel();assert.equal(r.spike.checkpoint,3500);
  assert(r.beginChannel(other,'defuse',57000,true,[0,0,0]));r.tick(60499);assert.equal(r.phase,'live');r.tick(60500);assert.equal(r.winner,'b');assert.equal(other.ult,1);
});
check('death drops spike and awards kill only once',()=>{
  const r=new MatchRules(config);r.start(roster(),0);r.tick(45000);const [victim]=r.members,killer=r.members[5];
  r.killed(victim,killer,46000);r.killed(victim,killer,46001);assert.equal(killer.credits,1000);assert.equal(killer.kills,1);assert.equal(victim.deaths,1);assert.equal(r.spike.state,'dropped');
  assert(!r.pickup(killer,0));assert(!r.pickup(r.members[1],3));assert(r.pickup(r.members[1],1));
});
check('timeout, economy streaks, survivor loss and dead inventory',()=>{
  const r=new MatchRules(config);r.start(roster(),0);r.tick(45000);const dead=r.members[0],alive=r.members[1];dead.inventory.primary='Vandal';r.killed(dead,r.members[5],46000);
  r.tick(145000);assert.equal(r.winner,'b');assert.equal(dead.credits,2700);assert.equal(alive.credits,1800);assert.equal(dead.inventory.primary,null);
  r.tick(152000);assert.equal(r.round,2);assert.equal(r.phase,'buy');assert.equal(r.until,182000);r.tick(182000);r.finish('b','test',183000);assert.equal(r.losses.a,2);
});
check('halftime reset, overtime alternation and two-round margin',()=>{
  const r=new MatchRules(config);r.start(roster(),0);r.round=12;r.nextRound(10);assert.equal(r.attacking,'b');assert.equal(r.members[0].credits,800);assert.equal(r.until,45010);
  r.round=24;r.score={a:12,b:12};r.nextRound(20);assert.equal(r.attacking,'a');assert.equal(r.members[0].credits,5000);assert.equal(r.members[0].ult,5);
  r.phase='live';r.finish('a','test',30);assert.equal(r.phase,'end');r.nextRound(40);assert.equal(r.attacking,'b');r.phase='live';r.finish('a','test',50);assert.equal(r.phase,'complete');
});
console.log(JSON.stringify({checks,status:'PASS'}));
