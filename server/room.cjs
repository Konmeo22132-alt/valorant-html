'use strict';
const crypto=require('node:crypto');
const {MatchRules}=require('../val-strike-html/game/match-rules.js');
const {DeathmatchRules}=require('./deathmatch.cjs');
const {loadWorld,config,B}=require('./world.cjs');
const maps=require('../val-strike-html/game/maps.js');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const vec=a=>B.Vector3.FromArray(a);
const clean=s=>String(s||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,24);
function boxHit(ray,center,half,yaw=0){
  const inv=B.Matrix.RotationY(-yaw),o=B.Vector3.TransformNormal(ray.origin.subtract(center),inv),d=B.Vector3.TransformNormal(ray.direction,inv);
  let lo=0,hi=ray.length;
  for(const k of ['x','y','z']){if(Math.abs(d[k])<1e-9){if(Math.abs(o[k])>half[k])return null;}else{let a=(-half[k]-o[k])/d[k],b=(half[k]-o[k])/d[k];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}}
  return lo;
}
class Room{
  constructor(name,size=1,options={}){
    this.mode=options.mode||'unrated';if(!['unrated','deathmatch','custom'].includes(this.mode))throw Error('Chế độ không hợp lệ.');
    this.id=crypto.randomBytes(3).toString('hex').toUpperCase();this.name=clean(name)||'VAL-STRIKE';this.size=clamp(Math.round(size)||1,1,5);
    this.members=[];this.host=null;this.phase='lobby';this.now=0;this.tick=0;this.version=0;this.events=[];this.effects=[];this.projectiles=[];this.drops=[];this.pings=[];this.eventID=0;
    this.chatKey=crypto.randomBytes(16).toString('hex');
    this.gameMode=this.mode==='custom'?(options.gameMode||'unrated'):this.mode;
    if(!['unrated','deathmatch'].includes(this.gameMode))throw Error('Luật trận không hợp lệ.');
    this.map=options.map||(this.mode==='custom'?'abyss':maps.random());if(!maps.valid(this.map))throw Error('Bản đồ không hợp lệ.');
    this.world=options.world||loadWorld(this.map);this.layout=this.world.layout||config[maps.get(this.map).layout];this.config={...config,'map-layout':this.layout,match:{...config.match,teamSize:this.size}};
    this.rules=new (this.gameMode==='deathmatch'?DeathmatchRules:MatchRules)(this.config,(type,value)=>this.onRule(type,value));this.created=Date.now();this.lastActive=this.created;
  }
  emit(type,data={},team=null){const event={id:++this.eventID,type,time:this.now,...data};this.events.push({event,team});return event;}
  join(name,token){
    let p=this.members.find(p=>p.token===token);
    if(p)return p;
    if(this.phase!=='lobby')throw Error('Trận đã bắt đầu. Chỉ người trong phòng có thể kết nối lại.');
    let team=this.gameMode==='deathmatch'?'dm-'+crypto.randomBytes(5).toString('hex'):['a','b'].sort((a,b)=>this.members.filter(p=>p.team===a).length-this.members.filter(p=>p.team===b).length)[0];
    if(this.gameMode==='deathmatch'&&this.members.length>=this.size*2)throw Error('Phòng đã đầy.');
    if(this.members.filter(p=>p.team===team).length>=this.size){if(this.mode==='custom'&&this.members.filter(p=>p.team==='observer').length<4)team='observer';else throw Error('Phòng đã đầy.');}
    const agent=config.match.playableRoster.find(a=>this.members.filter(p=>p.team===team&&p.agent===a).length<config.match.maxAgentCopiesPerTeam);
    p={id:crypto.randomBytes(8).toString('hex'),token:crypto.randomBytes(24).toString('hex'),name:clean(name)||'Đặc vụ',team,agent,ready:false,loaded:false,connected:true,hp:100,armor:0,armorType:'none',regenPool:0,credits:800,ult:0,ultCost:config['playable-agents'][agent].ultCost,kills:0,deaths:0,assists:0,inventory:{primary:null,secondary:'Classic',melee:'Melee'},weapon:'Classic',ammo:{},charges:{},cooldowns:{},input:{keys:0,yaw:0,pitch:0,seq:0},inputAt:0,feet:B.Vector3.Zero(),velocity:B.Vector3.Zero(),yaw:0,pitch:0,crouching:false,grounded:true,bought:[],ledger:new Map(),lastDamageAt:-Infinity,skillLock:0,equipUntil:0,lastShot:-Infinity,shotCount:0};
    if(team==='observer')p.hp=0;Object.defineProperty(p,'position',{get:()=>p.feet.asArray()});
    this.members.push(p);if(!this.host)this.host=p.id;this.rules.members=this.members;this.lastActive=Date.now();return p;
  }
  lobby(viewer){return {id:this.id,name:this.name,mode:this.mode,gameMode:this.gameMode,map:this.map,size:this.size,host:this.host,phase:this.phase,version:this.version,selectionRemaining:Math.max(0,(this.selectionUntil||0)-this.now),members:this.members.map(p=>{
    const hidden=this.phase==='selecting'&&viewer&&viewer.team!=='observer'&&p.team!==viewer.team;
    return {id:p.id,name:p.name,agent:hidden?null:this.phase==='selecting'&&!p.pickedAgent&&!p.locked?null:p.agent,team:p.team,ready:p.ready,locked:hidden?false:!!p.locked,loaded:p.loaded,connected:p.connected};
  })};}
  pickAgent(p,data,lock=false){
    if(this.phase!=='selecting'||p.team==='observer'||p.locked)throw Error('Không thể đổi đặc vụ lúc này.');
    if(!config.match.playableRoster.includes(data.agent))throw Error('Đặc vụ này chưa được mở.');
    if(this.members.filter(q=>q!==p&&q.team===p.team&&q.locked&&q.agent===data.agent).length>=config.match.maxAgentCopiesPerTeam)throw Error('Đội đã khóa hai '+data.agent+'.');
    p.agent=data.agent;p.pickedAgent=true;p.locked=lock;
    const combat=this.members.filter(q=>q.team!=='observer');
    if(lock&&combat.length>=2&&combat.every(q=>q.locked&&q.connected))this.selectionUntil=Math.min(this.selectionUntil,this.now+10000);
    return true;
  }
  spawn(p){if(this.gameMode==='deathmatch'){const nav=this.world.nav||(this.world.nav=JSON.parse(require('node:fs').readFileSync(require('node:path').join(this.world.root,'match-navigation.json'))));let best=null,score=-Infinity;for(let i=0;i<64;i++){const node=nav.nodes[Math.floor(Math.random()*nav.nodes.length)];if(node[1]<-10)continue;const point=vec(node),distance=Math.min(400,...this.members.filter(q=>q!==p&&q.hp>0).map(q=>B.Vector3.DistanceSquared(q.feet,point)));if(distance>score){score=distance;best=point;}}return best||vec(this.layout.spawn.attack);}
    const side=p.team===this.rules.attacking?'attack':'defend',base=vec(this.layout.spawn[side]),index=this.members.filter(a=>a.team===p.team).indexOf(p);
    const nav=this.world.nav||(this.world.nav=JSON.parse(require('node:fs').readFileSync(require('node:path').join(this.world.root,'match-navigation.json'))));
    const nearby=nav.nodes.filter(n=>Math.abs(n[1]-base.y)<.8&&B.Vector3.DistanceSquared(vec(n),base)<25).sort((a,b)=>B.Vector3.DistanceSquared(vec(a),base)-B.Vector3.DistanceSquared(vec(b),base));
    return nearby.length?vec(nearby[Math.min(nearby.length-1,index*6)]):base;
  }
  onRule(type,value){
    if(type==='round'){
      this.version++;this.effects=[];this.projectiles=[];this.drops=[];this.pings=[];
      for(const p of this.members.filter(p=>p.team!=='observer')){const cfg=config['playable-agents'][p.agent],pistol=[1,config.rounds.halfRounds+1].includes(this.rules.round)&&this.gameMode!=='deathmatch';
        p.feet.copyFrom(this.spawn(p));p.deathPoint=null;p.deathAt=-Infinity;p.deathCause=null;p.velocity.setAll(0);p.overheal=0;p.decay=null;p.ledger.clear();p.ultCost=cfg.ultCost;p.loaded=true;
        p.charges=this.gameMode==='deathmatch'?{C:0,Q:0,E:0}:{C:pistol?0:p.charges.C||0,Q:pistol?0:p.charges.Q||0,E:Math.min(cfg.E.charges,Math.max(p.charges.E||0,cfg.E.free||0))};p.cooldowns={};p.resurrectAt=p.intangibleUntil=p.reviveDeadline=p.hasteUntil=p.skillLock=p.equipUntil=p.dashReady=p.dashExpires=p.dashUntil=p.knives=0;
        p.weapon=p.inventory.primary||p.inventory.secondary||'Melee';p.ammo={};for(const name of Object.values(p.inventory).filter(Boolean)){const d=config.weapons.weapons[name];if(d.mag)p.ammo[name]={clip:d.mag,reserve:d.reserveMax};}
        p.reloadUntil=0;p.inputQueue=[];p.input.seq=p.receivedInputSeq||p.input.seq;p.input.keys=0;p.yaw=p.team===this.rules.attacking?Math.PI:0;p.pitch=0;p.input.yaw=p.yaw;p.input.pitch=0;p.spawnPoint=p.feet.clone();p.dashKills=0;p.orbAt=0;
        if(pistol){p.armor=0;p.armorType='none';p.regenPool=0;}p.lastShot=-Infinity;p.nextShot=0;p.burstLeft=0;p.lastVictim=null;p.heal=p.decay=null;p.overhealRemaining=0;p.uiRequest=null;p.interact=false;
        p.skillEquipped=null;p.reviveCaster=null;p.knifeAt=0;p.knifeAlternate=false;p.jumpHeld=false;p.input.ads=p.input.steer=false;p.lastDamageAt=-Infinity;
      }
      this.orbs=null;this.emit('round',{round:this.rules.round});
    }
    if(type==='live')this.emit('phase',{phase:'live'});
    if(type==='end'){this.emit('roundEnd',{winner:this.rules.winner,reason:this.rules.reason,score:this.rules.score});if(this.rules.phase==='complete'){this.phase='complete';this.completedAt=Date.now();}}
    if(type==='plant')this.emit('plant',{position:value.position});
  }
  select(p,data){
    if(this.phase!=='lobby')throw Error('Đội hình đã khóa.');
    const team=data.team||p.team,agent=data.agent||p.agent;
    if(!(this.gameMode==='deathmatch'?team===p.team:(['a','b'].includes(team)||this.mode==='custom'&&team==='observer'))||!config.match.playableRoster.includes(agent))throw Error('Đội hoặc đặc vụ không hợp lệ.');
    if(team!==p.team&&this.members.filter(a=>a.team===team).length>=(team==='observer'?4:this.size))throw Error('Đội đã đủ người.');
    if(team!=='observer'&&this.members.filter(a=>a!==p&&a.team===team&&a.agent===agent).length>=config.match.maxAgentCopiesPerTeam)throw Error('Đội đã có hai '+agent+'.');
    p.hp=team==='observer'?0:100;
    p.team=team;p.agent=agent;p.ultCost=config['playable-agents'][agent].ultCost;
    p.ready=!!data.ready;return true;
  }
  start(p){
    if(p.id!==this.host||this.phase!=='lobby')throw Error('Chỉ chủ phòng có thể bắt đầu.');
    const combat=this.members.filter(p=>p.team!=='observer');if(combat.some(p=>!p.connected||!p.ready))throw Error('Mọi người chơi cần sẵn sàng.');
    if(this.gameMode==='deathmatch'){if(combat.length<2)throw Error('Deathmatch cần ít nhất hai người.');}
    else if(this.mode==='custom'){const a=combat.filter(p=>p.team==='a').length,b=combat.filter(p=>p.team==='b').length;if(!a||!b)throw Error('Mỗi đội cần ít nhất một người đã sẵn sàng.');this.config.match.teamSize=this.size;this.config.match.allowUnevenTeams=true;}
    else if(['a','b'].some(t=>combat.filter(p=>p.team===t).length!==this.size))throw Error('Cần đủ người đã sẵn sàng ở cả hai đội.');
    this.matchId=crypto.randomBytes(8).toString('hex');
    this.phase='selecting';this.selectionUntil=this.now+config.match.selectionDuration;
    this.members.forEach(p=>{p.loaded=false;p.locked=p.team==='observer';p.pickedAgent=false;});return true;
  }
  command(p,data){
    if(!p||!p.connected)throw Error('Kết nối không còn trong phòng.');
    if(data.op==='shoot'&&Number.isSafeInteger(data.shotSeq)&&data.shotSeq>0){if(data.shotSeq<=(p.shotAck||0))return false;p.shotAck=data.shotSeq;}
    if(['switch','reload'].includes(data.op)&&Number.isSafeInteger(data.weaponSeq)&&data.weaponSeq>0){if(data.weaponSeq<=(p.weaponAck||0))return false;p.weaponAck=data.weaponSeq;}
    if(data.op==='select')return this.select(p,data);
    if(data.op==='settings'){
      if(this.mode!=='custom'||this.phase!=='lobby'||p.id!==this.host)throw Error('Chỉ chủ phòng Custom được đổi bản đồ và luật trận trước khi bắt đầu.');
      const map=data.map??this.map,gameMode=data.gameMode??this.gameMode;
      if(!maps.valid(map)||!['unrated','deathmatch'].includes(gameMode))throw Error('Bản đồ hoặc luật trận không hợp lệ.');
      const world=loadWorld(map),changed=gameMode!==this.gameMode;
      this.map=map;this.gameMode=gameMode;this.world=world;this.layout=world.layout;this.config={...config,'map-layout':this.layout,match:{...config.match,teamSize:this.size}};
      this.rules=new (gameMode==='deathmatch'?DeathmatchRules:MatchRules)(this.config,(type,value)=>this.onRule(type,value));
      this.members.forEach((member,i)=>{if(changed){member.team=gameMode==='deathmatch'?'dm-'+member.id:i%2?'b':'a';member.hp=100;member.agent=config.match.playableRoster.find(agent=>this.members.slice(0,i).filter(q=>q.team===member.team&&q.agent===agent).length<config.match.maxAgentCopiesPerTeam);member.ultCost=config['playable-agents'][member.agent].ultCost;}member.ready=false;});this.rules.members=this.members;return true;
    }
    if(data.op==='start')return this.start(p);
    if(data.op==='pickAgent')return this.pickAgent(p,data);
    if(data.op==='lockAgent')return this.pickAgent(p,data,true);
    if(data.op==='rematch'){if(this.phase!=='complete'||p.id!==this.host)throw Error('Chỉ chủ phòng mở lại sảnh sau khi trận kết thúc.');if(this.mode!=='custom'){this.map=maps.random();this.world=loadWorld(this.map);this.layout=this.world.layout;this.config['map-layout']=this.layout;}this.phase='lobby';this.members=this.members.filter(p=>!p.left);this.members.forEach(p=>{p.ready=false;p.loaded=false;});return true;}
    if(data.op==='loaded'){if(this.phase==='loading')p.loaded=true;return true;}
    if(p.team==='observer')return false;
    if(data.op==='input'){
      if(!Number.isSafeInteger(data.seq)||data.seq<0||data.seq<=(p.receivedInputSeq??p.input.seq)||!Number.isFinite(data.yaw)||!Number.isFinite(data.pitch))return false;
      const command={seq:data.seq,keys:Number.isInteger(data.keys)?data.keys&255:0,yaw:((data.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2),pitch:clamp(data.pitch,-1.55,1.55),ads:!!data.ads,steer:!!data.steer};p.receivedInputSeq=data.seq;(p.inputQueue??=[]).push(command);if(p.inputQueue.length>12)p.inputQueue.splice(0,p.inputQueue.length-12);p.inputAt=this.now;return true;
    }
    if(this.phase!=='playing')throw Error('Trận chưa bắt đầu.');
    if(['shoot','ability','ping'].includes(data.op)&&Number.isFinite(data.yaw)&&Number.isFinite(data.pitch)){p.yaw=p.input.yaw=data.yaw%(Math.PI*2);p.pitch=p.input.pitch=clamp(data.pitch,-1.55,1.55);}
    if(data.op==='ping')return this.ping(p,data);
    if(data.op==='request'){if(this.rules.phase!=='buy'||data.name!==null&&!Object.hasOwn(config.weapons.weapons,data.name))return false;p.uiRequest=data.name;return true;}
    if(data.op==='buy')return this.buy(p,data);
    if(data.op==='sell')return this.sell(p,data);
    if(data.op==='interact'){p.interact=!!data.held;return true;}
    if(data.op==='drop')return this.drop(p);
    if(data.op==='pickup')return this.pickup(p);
    if(data.op==='cancelSkill'){p.skillEquipped=null;return true;}
    if(p.hp<=0&&!(data.op==='ability'&&p.agent==='Clove'&&['E','X'].includes(data.slot)))throw Error('Bạn đã chết.');
    if(data.op==='switch'){
      if(!Object.values(p.inventory).includes(data.name))throw Error('Bạn không sở hữu vũ khí này.');
      if(p.weapon!==data.name||p.skillEquipped){p.weapon=data.name;p.reloadUntil=0;p.equipUntil=this.now+config.weapons.weapons[data.name].equipTime;p.skillEquipped=null;}return true;
    }
    if(data.op==='reload')return this.reload(p);
    if(data.op==='shoot')return this.shoot(p,data);
    if(data.op==='equipSkill'){if(this.rules.phase!=='live'||!['C','Q','E'].includes(data.slot)||!p.charges[data.slot])return false;
      p.skillEquipped=data.slot;p.reloadUntil=0;p.skillLock=this.now+(p.agent==='Clove'?(data.slot==='E'?1000:data.slot==='Q'?800:600):600);return true;}
    if(data.op==='ability')return this.ability(p,data);
    throw Error('Lệnh không hợp lệ.');
  }
  buy(p,d){
    if(this.gameMode==='deathmatch'){if(this.rules.phase!=='live'||p.hp<=0||d.kind!=='weapon'||!Object.hasOwn(config.weapons.weapons,d.name))return false;const def=config.weapons.weapons[d.name];if(def.slot==='melee')return false;p.inventory[def.slot]=d.name;p.weapon=d.name;p.ammo[d.name]={clip:def.mag,reserve:def.reserveMax};p.equipUntil=this.now+def.equipTime;p.reloadUntil=0;return true;}
    if(this.rules.phase!=='buy'||p.hp<=0)return false;
    if(d.kind==='weapon'){
      if(!Object.hasOwn(config.weapons.weapons,d.name))return false;
      const def=config.weapons.weapons[d.name],target=d.recipient?this.members.find(a=>a.id===d.recipient):p;if(!def||def.slot==='melee'||!target||target.team!==p.team||target.hp<=0)return false;
      return this.rules.buy(p,(target===p?'gun:':'gift:'+target.id+':')+d.name,def.price,()=>{if(target.inventory[def.slot]===d.name)return false;
        const old=target.inventory[def.slot];if(old&&old!=='Classic')this.makeDrop(target,old);target.inventory[def.slot]=d.name;target.ammo[d.name]={clip:def.mag,reserve:def.reserveMax};target.uiRequest=null;
        if(target===p){p.weapon=d.name;p.equipUntil=this.now+def.equipTime;p.reloadUntil=0;}return true;});
    }
    if(d.kind==='armor'){
      const def=config.weapons.armor[d.name];if(!def||!def.price||p.bought.some(b=>b.item.startsWith('armor:')))return false;
      return this.rules.buy(p,'armor:'+d.name,def.price,()=>{if(p.armorType===d.name&&p.armor>=def.absorb)return false;p.previousArmor={type:p.armorType,armor:p.armor,pool:p.regenPool};p.armorType=d.name;p.armor=def.absorb;p.regenPool=def.regenPool||0;return true;});
    }
    if(d.kind==='skill'){
      const def=config['playable-agents'][p.agent][d.slot];if(!['C','Q','E'].includes(d.slot)||!def||p.charges[d.slot]>=def.charges)return false;
      return this.rules.buy(p,'ability:'+d.slot,def.price||0,()=>{p.charges[d.slot]++;return true;});
    }return false;
  }
  sell(p,d){
    if(d.kind==='weapon'){const def=config.weapons.weapons[d.name];if(!def)return false;return this.rules.sell(p,'gun:'+d.name,()=>{if(p.inventory[def.slot]!==d.name)return false;p.inventory[def.slot]=def.slot==='secondary'?'Classic':null;p.weapon=p.inventory.primary||p.inventory.secondary||'Melee';return true;});}
    if(d.kind==='armor')return this.rules.sell(p,'armor:'+d.name,()=>{if(p.armorType!==d.name)return false;p.armorType=p.previousArmor?.type||'none';p.armor=p.previousArmor?.armor||0;p.regenPool=p.previousArmor?.pool||0;return true;});
    if(d.kind==='skill')return this.rules.sell(p,'ability:'+d.slot,()=>{if(!p.charges[d.slot])return false;p.charges[d.slot]--;return true;});return false;
  }
  reload(p){const d=config.weapons.weapons[p.weapon],a=p.ammo[p.weapon];if(!a||this.now<p.equipUntil||this.now<p.skillLock||p.skillEquipped||p.reloadUntil||a.clip>=d.mag||!a.reserve)return false;
    p.reloadUntil=this.now+(d.reloadPerShell||(!a.clip&&d.reloadEmptyTime)||d.reloadTime);p.reloadStarted=this.now;p.reloadEmpty=!a.clip;this.emit('reload',{owner:p.id,weapon:p.weapon,started:p.reloadStarted,until:p.reloadUntil});return true;}
  eye(p){return p.feet.add(new B.Vector3(0,p.crouching?config.movement.crouchEyeHeight:config.movement.eyeHeight,0));}
  direction(p){return new B.Vector3(Math.sin(p.yaw)*Math.cos(p.pitch),-Math.sin(p.pitch),Math.cos(p.yaw)*Math.cos(p.pitch));}
  pick(ray,floor=false){
    let hit=this.world.collision.pick(ray,floor);
    for(const e of this.effects.filter(e=>e.type==='wall'&&e.hp>0)){const height=e.height*Math.max(.05,clamp((this.now-e.created)/e.rise,0,1)),center=vec(e.position).add(new B.Vector3(0,height/2,0));
      const distance=boxHit(ray,center,new B.Vector3(e.width/2,height/2,e.depth/2),e.yaw);
      if(distance!==null&&(!hit||distance<hit.distance))hit={distance,pickedPoint:ray.origin.add(ray.direction.scale(distance)),wall:e,getNormal:()=>B.Vector3.Up()};}
    return hit;
  }
  target(p,range,dead=false,self=false){
    const origin=this.eye(p),forward=this.direction(p);let best=null,score=.94;
    if(self)return p;
    for(const q of this.members){if(q===p||q.team!==p.team||(q.hp<=0)!==dead||q.resurrectAt)continue;const delta=q.feet.add(new B.Vector3(0,dead?.2:1.1,0)).subtract(origin),distance=delta.length();if(distance>range||distance<.01)continue;
      const dot=B.Vector3.Dot(delta.scale(1/distance),forward);if(dot>score&&!this.pick(new B.Ray(origin,delta.normalize(),Math.max(0,distance-.1)))){best=q;score=dot;}}
    return best;
  }
  damage(p,amount,killer,zone='ability',weapon='ability'){
    if(p.hp<=0||this.now<p.intangibleUntil||!Number.isFinite(amount)||amount<=0)return;
    const absorbed=Math.min(p.armor,amount*(config.weapons.armor[p.armorType]?.absorbPct??config.weapons.armor.absorbPct));p.armor-=absorbed;
    const temporary=Math.min(p.overheal||0,amount-absorbed);p.overheal=Math.max(0,(p.overheal||0)-temporary);p.hp=Math.max(0,p.hp-(amount-absorbed-temporary));p.lastDamageAt=this.now;
    if(killer&&killer!==p)p.ledger.set(killer.id,{at:this.now,damage:amount});
    this.emit('damage',{victim:p.id,killer:killer?.id,amount,zone,weapon});
    if(p.hp<=0){p.deathPoint=p.feet.clone();p.deathAt=this.now;p.deathCause=weapon==='fall'?'fall':'combat';p.input.keys=0;p.velocity.setAll(0);p.skillEquipped=null;p.reloadUntil=0;
      p.heal=p.decay=null;p.overheal=p.overhealRemaining=p.hasteUntil=p.skillLock=p.knives=p.dashReady=p.dashExpires=p.dashUntil=p.reviveDeadline=0;
      if(p.agent==='Clove')p.charges.E=Math.min(1,p.charges.E||0);
      this.rules.killed(p,killer,this.now);if(killer&&killer.team!==p.team){killer.lastVictim=this.now;if(killer.reviveDeadline&&this.now>=killer.skillLock)killer.reviveDeadline=0;if(killer.agent==='Jett'&&++killer.dashKills>=config['playable-agents'].Jett.E.kills){killer.charges.E=1;killer.dashKills=0;}if(weapon==='Blade Storm'&&!killer.knifeAlternate)killer.knives=config['playable-agents'].Jett.X.knives;}
      for(const [id,e] of p.ledger){const helper=this.members.find(q=>q.id===id);if(helper&&helper!==killer&&helper.team!==p.team&&this.now-e.at<(helper.agent==='Clove'?config['playable-agents'].Clove.C.assistWindow:8000)){helper.assists++;helper.lastVictim=this.now;if(helper.reviveDeadline&&this.now>=helper.skillLock)helper.reviveDeadline=0;}}
      if(this.gameMode!=='deathmatch'){if(p.inventory.primary)this.makeDrop(p,p.inventory.primary);if(p.inventory.secondary!=='Classic')this.makeDrop(p,p.inventory.secondary);}
      this.emit('death',{victim:p.id,killer:killer?.id,zone,weapon});}
  }
  shoot(p,data){
    if(this.rules.phase!=='live'||p.hp<=0||p.reloadUntil||this.now<p.skillLock||p.skillEquipped||this.now<p.equipUntil||this.now<p.intangibleUntil)return false;
    const def=config.weapons.weapons[p.weapon],alt=data.alternate&&['shotgun','airburst','melee'].includes(def.altFire?.type)?def.altFire:null,a=p.ammo[p.weapon],melee=def.slot==='melee';
    if(this.now-p.lastShot>(def.spread?.recovery||.4)*1000)p.shotCount=0;
    const burst=p.input.ads&&def.altFire?.type==='burst'?def.altFire:null;
    const ramp=p.weapon==='Odin'&&p.shotCount>=def.fireRateRamp.afterShots?def.fireRateRamp.to:def.fireRate;
    const delay=alt?(alt.fireDelay||1000/(alt.fireRate||ramp)):burst?1000/burst.shotRate:(def.fireDelay||1000/(p.input.ads&&def.adsFireRate||ramp));
    // A bounded tick allowance absorbs packet timing; a second shot in the
    // same simulation tick is always rejected. Cadence accumulates on server.
    if(this.now===p.lastShot||this.now+1000/config.network.tickRate<(p.nextShot||0))return false;
    if(!melee&&(!a||!a.clip))return false;
    let count=alt?.type==='shotgun'?Math.min(a.clip,alt.pellets):alt?.pellets||def.pellets||1;const ammo=melee?0:Math.min(a.clip,alt?.ammoCost||1);if(a)a.clip-=ammo;
    const scheduled=Math.max(this.now-1000/config.network.tickRate,p.nextShot||this.now);
    p.nextShot=scheduled+delay;p.lastShot=this.now;p.shotCount++;
    if(burst){if(!p.burstLeft){p.burstLeft=burst.count;p.burstAt=scheduled;}if(!--p.burstLeft)p.nextShot=Math.max(p.nextShot,p.burstAt+burst.interval);}else p.burstLeft=0;
    const origin=this.eye(p),forward=this.direction(p),range=alt?.range||def.range||(melee?2.5:1000),moves=Math.hypot(p.velocity.x,p.velocity.z),mov=config.movement,max=config.movement.speedByWeaponClass[config.movement.classByWeapon[p.weapon]]||5.4;
    const first=def.spread?.firstShot||0;let spread=p.input.ads?(def.adsZeroError?0:def.adsSpread??first*.6):first;
    if(!(p.input.ads&&def.adsZeroError))spread+=((def.spread?.max||0)-first)*Math.min(1,(p.shotCount-1)/config.weapons.recoilModel.bloomShots);
    if(!p.grounded)spread+=mov.airborneSpread;else if(moves>max*mov.deadzonePct)spread+=moves>max*.85?mov.runSpread:mov.walkSpread;if(p.crouching)spread*=mov.crouchSpreadMult;
    spread=Math.max(spread,alt?.spreadMin||0);let damageDef=alt?.damage?{...def,damage:alt.damage}:def,shotOrigin=origin,shotRange=range;
    if(alt?.type==='airburst'){
      const short=new B.Ray(origin,forward,alt.detonationDistance),blocked=this.pick(short)||this.members.some(q=>q!==p&&q.hp>0&&boxHit(short,q.feet.add(new B.Vector3(0,q.crouching?.85:1.1,0)),new B.Vector3(.3,q.crouching?.7:.9,.25))!==null);
      if(blocked){count=1;damageDef={...def,damage:alt.canisterDamage};shotRange=alt.detonationDistance;spread=0;}else shotOrigin=origin.add(forward.scale(alt.detonationDistance));
    }
    for(let i=0;i<count;i++){
      const direction=forward.clone(),right=new B.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw)),up=B.Vector3.Cross(direction,right),angle=crypto.randomInt(1000000)/1000000*Math.PI*2,radius=Math.sqrt(crypto.randomInt(1000000)/1000000)*Math.tan(spread*Math.PI/180);
      direction.addInPlace(right.scale(Math.cos(angle)*radius)).addInPlace(up.scale(Math.sin(angle)*radius)).normalize();
      const ray=new B.Ray(shotOrigin,direction,shotRange);let closest=null;
      for(const q of this.members){if(q===p||q.hp<=0||this.now<q.intangibleUntil)continue;
        for(const [zone,y,h,w] of [['head',1.65,.3,.3],['body',q.crouching?.86:1.125,q.crouching?.55:.75,.55],['leg',.375,.75,.4]]){
          const distance=boxHit(ray,q.feet.add(new B.Vector3(0,q.crouching&&zone==='head'?1.22:y,0)),new B.Vector3(w/2,h/2,.22));if(distance!==null&&(!closest||distance<closest.distance))closest={q,zone,distance};}
      }
      const world=this.pick(ray),end=closest?shotOrigin.add(direction.scale(closest.distance)):world?.pickedPoint||shotOrigin.add(direction.scale(Math.min(shotRange,100)));
      if(world?.wall&&(!closest||world.distance<closest.distance)){const row=damageDef.damage.find(d=>world.distance<=d[0])||damageDef.damage.at(-1);world.wall.hp-=row[2];}
      else if(closest){const limited=new B.Ray(shotOrigin,direction,closest.distance);const wall=this.effects.some(e=>e.type==='wall'&&e.hp>0&&boxHit(limited,vec(e.position).add(new B.Vector3(0,e.height/2,0)),new B.Vector3(e.width/2,e.height/2,e.depth/2),e.yaw)!==null);
        const factor=wall?0:this.world.penetration(limited,closest.distance,def).factor;if(factor>0){const row=damageDef.damage.find(d=>closest.distance<=d[0])||damageDef.damage.at(-1);let amount=row[{head:1,body:2,leg:3}[closest.zone]]*factor;
          if(melee&&B.Vector3.Dot(direction,this.direction(closest.q))>.5)amount*=def.backstabMultiplier||2;
          // Existing Unrated has reduced friendly fire; server owns the scaling.
          if(closest.q.team===p.team)amount*=.35;this.damage(closest.q,amount,p,closest.zone,p.weapon);}}
      this.emit('shot',{owner:p.id,weapon:p.weapon,from:origin.asArray(),to:end.asArray(),alternate:!!data.alternate});
    }return true;
  }
  spend(p,slot){const cfg=config['playable-agents'][p.agent][slot];if(slot==='X'){p.ult=0;return;}p.charges[slot]--;if(cfg.cooldown&&!p.cooldowns[slot])p.cooldowns[slot]=this.now+cfg.cooldown;}
  ground(point,center,range){if(!finite(point))return null;const v=vec(point);if(Math.hypot(v.x-center.x,v.z-center.z)>range)return null;
    const hit=this.world.collision.pick(new B.Ray(v.add(new B.Vector3(0,.5,0)),B.Vector3.Down(),1.2),true);return hit&&Math.abs(hit.pickedPoint.y-v.y)<.6?hit.pickedPoint:null;}
  effect(type,p,point,radius,duration,extra={}){const e={id:crypto.randomBytes(7).toString('hex'),type,owner:p.id,agent:p.agent,position:point.asArray(),radius,created:this.now,starts:this.now,expires:this.now+duration,...extra};this.effects.push(e);return e;}
  ability(p,d){
    if(this.gameMode==='deathmatch')return false;
    const cfg=config['playable-agents'][p.agent],slot=d.slot,def=cfg[slot];if(!['C','Q','E','X'].includes(slot)||!def||this.rules.phase!=='live')return false;
    const dead=p.hp<=0,now=this.now;if(dead&&!(p.agent==='Clove'&&['E','X'].includes(slot)))return false;
    if(slot==='X'&&p.agent==='Clove'&&!dead&&now<p.intangibleUntil){p.intangibleUntil=now;p.skillLock=now+cfg.X.reequip;return true;}
    if(now<p.skillLock||p.resurrectAt)return false;
    const dash=p.agent==='Jett'&&slot==='E'&&p.dashExpires>now,knife=p.agent==='Jett'&&slot==='X'&&p.knives>0;
    if(!dash&&!knife&&(slot==='X'?p.ult<cfg.ultCost:!p.charges[slot]))return false;
    if(p.agent==='Clove'&&slot==='E'){
      if(!Array.isArray(d.points)||!d.points.length||d.points.length>Math.min(dead?1:2,p.charges.E))return false;
      const center=dead?p.deathPoint:p.feet,points=d.points.map(a=>this.ground(a,center,dead?def.deadRange:def.range));if(points.some(v=>!v))return false;
      for(const v of points){this.spend(p,slot);this.effect('smoke',p,v,def.radius,def.windup+(dead?def.deadDuration:def.duration),{starts:now+def.windup});}
      p.skillEquipped=null;p.skillLock=now+(dead?0:700);this.emit('cast',{owner:p.id,slot});return true;
    }
    if(p.agent==='Clove'&&slot==='C'){
      if(p.lastVictim==null||now-p.lastVictim>def.activationWindow)return false;this.spend(p,slot);p.overhealRemaining=def.overheal;p.overhealUntil=now+def.duration;p.hasteUntil=now+def.hasteDuration;p.lastVictim=null;p.skillLock=now+500;p.skillEquipped=null;this.emit('cue',{owner:p.id,target:p.id,kind:'pickup',duration:def.hasteDuration});return true;
    }
    if(p.agent==='Clove'&&slot==='X'){
      if(!dead||p.deathCause==='fall'||now-p.deathAt>def.window||this.pick(new B.Ray(p.deathPoint.add(new B.Vector3(0,.05,0)),B.Vector3.Up(),1.8)))return false;
      this.spend(p,slot);p.resurrectAt=now+def.revive;p.intangibleUntil=p.resurrectAt+def.intangible;p.reviveDeadline=p.intangibleUntil+def.reequip+def.deadline;p.skillLock=p.intangibleUntil+def.reequip;p.skillEquipped=null;this.emit('reviveCast',{owner:p.id,at:p.resurrectAt,intangibleUntil:p.intangibleUntil,deadline:p.reviveDeadline});return true;
    }
    if((p.agent==='Clove'&&slot==='Q')||(p.agent==='Sage'&&slot==='Q')||(p.agent==='Jett'&&slot==='C')){
      this.spend(p,slot);const type=p.agent==='Clove'?'meddle':p.agent==='Sage'?'slow':'cloud',speed=type==='cloud'?def.speed:type==='slow'?18:18,delay=type==='meddle'?240:0;
      const projectile={id:crypto.randomBytes(7).toString('hex'),type,owner:p.id,agent:p.agent,position:this.eye(p).asArray(),velocity:this.direction(p).scale(speed).asArray(),gravity:type==='cloud'?0:9.8,created:now,release:now+delay,expires:now+delay+(type==='cloud'?def.flight:type==='slow'?6000:10000),stuck:false};
      this.projectiles.push(projectile);p.skillLock=now+(type==='cloud'?350:700);if(type!=='cloud')p.skillEquipped=null;this.emit('cast',{owner:p.id,slot});return true;
    }
    if(p.agent==='Jett'&&slot==='Q'){this.spend(p,slot);p.velocity.y=def.verticalSpeed;p.skillLock=now+def.reequip;this.emit('updraft',{owner:p.id});return true;}
    if(p.agent==='Jett'&&slot==='E'){
      if(!dash){this.spend(p,slot);p.dashReady=now+def.windup;p.dashExpires=p.dashReady+def.window;p.dashKills=0;return true;}
      if(now<p.dashReady)return false;const x=(p.input.keys&8?1:0)-(p.input.keys&4?1:0),z=(p.input.keys&1?1:0)-(p.input.keys&2?1:0),direction=new B.Vector3(Math.cos(p.yaw)*x+Math.sin(p.yaw)*(x||z?z:1),0,Math.cos(p.yaw)*(x||z?z:1)-Math.sin(p.yaw)*x).normalize();
      p.dashDirection=direction;p.dashUntil=now+def.duration;p.dashReady=p.dashExpires=0;p.skillLock=now+def.reequip;this.emit('dash',{owner:p.id,direction:direction.asArray()});return true;
    }
    if(p.agent==='Jett'&&slot==='X'){
      if(!knife){this.spend(p,slot);p.knives=def.knives;p.skillLock=now+def.equip;p.skillEquipped='X';this.emit('cast',{owner:p.id,slot});return true;}
      if(d.equip||p.skillEquipped!=='X'){p.skillEquipped='X';p.skillLock=now+def.equip;this.emit('cast',{owner:p.id,slot});return true;}
      if(now<(p.knifeAt||0))return false;p.knifeAt=now+(d.alternate?def.burstInterval:def.interval);const count=d.alternate?p.knives:1;p.knives-=count;
      p.knifeAlternate=!!d.alternate;
      for(let i=0;i<count;i++){const origin=this.eye(p),forward=this.direction(p);if(d.alternate){const radius=Math.sqrt(crypto.randomInt(1000000)/1000000)*Math.tan(def.burstSpread*Math.PI/180),angle=crypto.randomInt(1000000)/1000000*Math.PI*2,right=new B.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw)),up=B.Vector3.Cross(forward,right);forward.addInPlace(right.scale(Math.cos(angle)*radius)).addInPlace(up.scale(Math.sin(angle)*radius)).normalize();}const ray=new B.Ray(origin,forward,1000);let hit=null;
        for(const q of this.members.filter(q=>q!==p&&q.hp>0&&q.team!==p.team))for(const [zone,y,h] of [['head',q.crouching?1.22:1.65,.3],['body',q.crouching?.86:1.125,q.crouching?.55:.75],['leg',.375,.75]]){const distance=boxHit(ray,q.feet.add(new B.Vector3(0,y,0)),new B.Vector3(.275,h/2,.22));if(distance!==null&&(!hit||distance<hit.distance))hit={q,zone,distance};}
        if(hit&&!this.pick(new B.Ray(origin,forward,hit.distance)))this.damage(hit.q,def.damage[{head:0,body:1,leg:2}[hit.zone]],p,hit.zone,'Blade Storm');
        this.emit('knife',{owner:p.id,from:origin.asArray(),to:origin.add(forward.scale(hit?.distance||60)).asArray(),alternate:!!d.alternate});}
      if(!p.knives)p.skillEquipped=null;return true;
    }
    if(p.agent==='Sage'&&slot==='C'){
      const point=this.ground(d.point,p.feet,def.range);if(!point||!Number.isFinite(d.yaw))return false;
      const positions=[];for(let i=0;i<def.segments;i++){const offset=(i-(def.segments-1)/2)*def.width,v=point.add(new B.Vector3(Math.cos(d.yaw)*offset,0,-Math.sin(d.yaw)*offset)),floor=this.ground(v.asArray(),p.feet,def.range+def.width*2);
        if(!floor||Math.abs(floor.y-point.y)>.45||this.pick(new B.Ray(floor.add(new B.Vector3(0,.05,0)),B.Vector3.Up(),def.height)))return false;
        for(const side of [-.65,0,.65])if(this.pick(new B.Ray(floor.add(new B.Vector3(-Math.cos(d.yaw)*def.width*.49+Math.sin(d.yaw)*side,1.1,Math.sin(d.yaw)*def.width*.49+Math.cos(d.yaw)*side)),new B.Vector3(Math.cos(d.yaw),0,-Math.sin(d.yaw)),def.width*.98)))return false;positions.push(floor);}
      this.spend(p,slot);for(const v of positions)this.effect('wall',p,v,0,def.duration,{yaw:d.yaw,width:def.width,height:def.height,depth:def.depth,rise:def.rise,hp:def.hp,fortified:false});p.skillLock=now+700;p.skillEquipped=null;this.emit('wall',{owner:p.id,point:point.asArray(),yaw:d.yaw});return true;
    }
    if(p.agent==='Sage'&&slot==='E'){
      const target=this.target(p,def.range,false,!!d.alternate);if(!target||target.hp>=100)return false;this.spend(p,slot);target.heal={owner:p.id,remaining:target===p?def.selfHP:def.allyHP,rate:(target===p?def.selfHP:def.allyHP)/(def.duration/1000),damageDelay:def.damageDelay};p.skillLock=now+700;p.skillEquipped=null;this.emit('cue',{owner:p.id,target:target.id,kind:'heal',duration:def.duration});return true;
    }
    if(p.agent==='Sage'&&slot==='X'){
      const target=this.target(p,def.range,true);if(!target||this.pick(new B.Ray(target.feet.add(new B.Vector3(0,.05,0)),B.Vector3.Up(),1.8)))return false;this.spend(p,slot);target.resurrectAt=now+def.channel;target.reviveCaster=p.id;target.intangibleUntil=target.resurrectAt;p.skillLock=target.resurrectAt;p.skillEquipped=null;this.emit('cue',{owner:p.id,target:target.id,kind:'revive',duration:def.channel});return true;
    }return false;
  }
  makeDrop(p,name){if(!name||name==='Melee')return;const drop={id:crypto.randomBytes(6).toString('hex'),name,position:p.feet.asArray(),ammo:{...p.ammo[name]},created:this.now};this.drops.push(drop);return drop;}
  drop(p){if(p.hp<=0||!['buy','live'].includes(this.rules.phase)||['Melee','Classic'].includes(p.weapon))return false;this.makeDrop(p,p.weapon);const slot=config.weapons.weapons[p.weapon].slot;p.inventory[slot]=null;p.weapon=p.inventory.primary||p.inventory.secondary||'Melee';p.skillEquipped=null;p.reloadUntil=0;p.equipUntil=this.now+config.weapons.weapons[p.weapon].equipTime;return true;}
  pickup(p){const drop=this.drops.find(d=>B.Vector3.DistanceSquared(p.feet,vec(d.position))<config.match.interactionRange**2);if(!drop||p.hp<=0||!['buy','live'].includes(this.rules.phase))return false;const def=config.weapons.weapons[drop.name],old=p.inventory[def.slot];if(old&&old!=='Classic')this.makeDrop(p,old);p.inventory[def.slot]=drop.name;p.ammo[drop.name]={...drop.ammo};p.weapon=drop.name;p.skillEquipped=null;p.reloadUntil=0;p.equipUntil=this.now+def.equipTime;this.drops.splice(this.drops.indexOf(drop),1);return true;}
  ping(p,d){if(!['danger','going','watch','help'].includes(d.kind)||this.now<(p.pingAt||0))return false;let point;
    if(d.map){point=this.ground(d.point,p.feet,150);}else point=this.pick(new B.Ray(this.eye(p),this.direction(p),100))?.pickedPoint;
    if(!point)return false;p.pingAt=this.now+700;const ping={id:crypto.randomBytes(6).toString('hex'),owner:p.id,team:p.team,type:d.kind,position:point.asArray(),until:this.now+6000};this.pings.push(ping);this.emit('ping',ping,p.team);return true;}
  step(dt){
    this.now+=dt*1000;this.tick++;
    if(this.phase==='selecting'){
      if(this.now>=this.selectionUntil){
        for(const p of this.members.filter(q=>q.team!=='observer'&&!q.locked)){
          const choices=config.match.playableRoster.filter(agent=>this.members.filter(q=>q!==p&&q.team===p.team&&q.locked&&q.agent===agent).length<config.match.maxAgentCopiesPerTeam);
          p.agent=choices.includes(p.agent)?p.agent:choices[0];p.locked=true;p.pickedAgent=true;p.ultCost=config['playable-agents'][p.agent].ultCost;
        }
        this.phase='revealing';this.revealUntil=this.now+4000;
      }return;
    }
    if(this.phase==='revealing'){
      if(this.now>=this.revealUntil){this.phase='loading';this.loadingAt=this.now;this.members.forEach(p=>p.loaded=false);}return;
    }
    if(this.phase==='loading'){
      if(this.members.every(p=>p.loaded&&p.connected)){this.phase='playing';this.rules.start(this.members.filter(p=>p.team!=='observer'),this.now);}
      else if(this.now-this.loadingAt>config.network.loadingTimeoutMs){this.phase='lobby';this.members.forEach(p=>{p.ready=false;p.loaded=false;});this.emit('notice',{message:'Chưa tải đủ người. Phòng trở về sảnh để thử lại.'});}return;
    }
    if(this.phase!=='playing')return;
    const mov=config.movement;
    for(const p of this.members){
      if(p.team==='observer')continue;
      if(this.gameMode==='deathmatch'&&p.hp<=0&&p.connected&&this.now>=p.respawnAt){p.hp=100;p.armor=0;p.dead=p.deathReported=false;p.respawnAt=0;p.feet.copyFrom(this.spawn(p));p.velocity.setAll(0);p.ledger.clear();p.reloadUntil=0;p.equipUntil=this.now+500;p.intangibleUntil=this.now+1500;for(const name of Object.values(p.inventory)){const d=config.weapons.weapons[name];if(d?.mag)p.ammo[name]={clip:d.mag,reserve:d.reserveMax};}this.emit('revived',{owner:p.id});}
      if(p.inputQueue?.length)p.input=p.inputQueue.shift();
      if(!p.connected||this.now-p.inputAt>config.network.inputTimeoutMs){p.inputQueue=[];p.input.keys=0;p.interact=false;p.input.steer=false;}p.yaw=p.input.yaw;p.pitch=p.input.pitch;
      if(p.resurrectAt){const caster=this.members.find(q=>q.id===p.reviveCaster);if(p.reviveCaster&&(!caster||caster.hp<=0||B.Vector3.Distance(caster.feet,p.feet)>config['playable-agents'].Sage.X.range)){p.resurrectAt=p.intangibleUntil=0;p.reviveCaster=null;}else if(this.now>=p.resurrectAt){p.hp=100;p.armor=0;p.dead=false;p.deathReported=false;p.resurrectAt=0;p.reviveCaster=null;p.velocity.setAll(0);this.emit('revived',{owner:p.id});}}
      if(p.reviveDeadline&&this.now>=p.reviveDeadline){p.reviveDeadline=0;if(p.lastVictim==null||p.lastVictim<p.deathAt)this.damage(p,1000,null,'ability','Not Dead Yet');}
      if(p.hp<=0)continue;
      for(const slot of ['C','Q','E'])if(p.cooldowns[slot]&&this.now>=p.cooldowns[slot]){p.cooldowns[slot]=0;p.charges[slot]=Math.min(config['playable-agents'][p.agent][slot].charges,p.charges[slot]+1);}
      if(p.reloadUntil&&this.now>=p.reloadUntil){const def=config.weapons.weapons[p.weapon],a=p.ammo[p.weapon],amount=Math.min(a.reserve,def.reloadPerShell?1:def.mag-a.clip);a.clip+=amount;a.reserve-=amount;p.reloadUntil=def.reloadPerShell&&a.clip<def.mag&&a.reserve?this.now+def.reloadPerShell:0;}
      if(p.armorType==='regen'&&p.regenPool&&this.now-p.lastDamageAt>=config.weapons.armor.regen.delay){const d=config.weapons.armor.regen,amount=Math.min(d.absorb-p.armor,p.regenPool,dt*d.absorb/(d.duration/1000));p.armor+=amount;p.regenPool-=amount;}
      if(p.heal&&this.now-p.lastDamageAt>=p.heal.damageDelay){const n=Math.min(100-p.hp,p.heal.remaining,p.heal.rate*dt);p.hp+=n;p.heal.remaining-=n;if(p.hp>=100||p.heal.remaining<=0)p.heal=null;}
      if(p.overhealRemaining){const cfg=config['playable-agents'].Clove.C,amount=Math.min(cfg.healRate*dt,p.overhealRemaining,100-p.hp+cfg.overheal-(p.overheal||0));const health=Math.min(100-p.hp,amount);p.hp+=health;p.overheal=(p.overheal||0)+amount-health;p.overhealRemaining-=amount;}
      if(p.overhealUntil&&this.now>=p.overhealUntil)p.overheal=Math.max(0,(p.overheal||0)-config['playable-agents'].Clove.C.decayRate*dt);
      if(p.decay){const d=p.decay;if(this.now<d.expires){const n=Math.max(0,Math.min(d.maximum-d.amount,p.hp-1,d.rate*dt));p.hp-=n;d.amount+=n;}else{const n=Math.min(d.amount,100-p.hp,d.restoreRate*dt);p.hp+=n;d.amount-=n;if(d.amount<=.01)p.decay=null;}}
      let speedScale=1;
      if(p.hasteUntil>this.now)speedScale*=config['playable-agents'].Clove.C.haste;
      if(this.now-p.lastDamageAt<mov.tag.decaySec*1000)speedScale*=1-mov.tag.slowPct*(1-(this.now-p.lastDamageAt)/(mov.tag.decaySec*1000));
      if(this.effects.some(e=>e.type==='slow'&&Math.abs(p.feet.y-e.position[1])<1.2&&Math.hypot(p.feet.x-e.position[0],p.feet.z-e.position[2])<e.radius))speedScale*=config['playable-agents'].Sage.Q.slow;
      p.speedScale=speedScale;
      this.world.networkStep(p,p.input,dt,(o,d,l,f)=>this.pick(new B.Ray(o,d,l),f),mov,{
        weapon:p.weapon,agent:p.agent,speedScale,blocked:!!(this.rules.spike.channel?.actor===p||p.revivingUntil||['end','complete'].includes(this.rules.phase)),
        dashDirection:p.dashUntil>this.now?p.dashDirection:null,dashSpeed:config['playable-agents'].Jett.E.speed,spawnPoint:this.rules.phase==='buy'?p.spawnPoint:null
      });
      if(p.feet.y<-35)this.damage(p,1000,null,'body','fall');
      if(p.interact&&this.rules.phase==='live'&&this.gameMode!=='deathmatch')this.interact(p);else{if(this.rules.spike.channel?.actor===p)this.rules.cancelChannel();p.orbAt=0;}
    }
    for(const projectile of [...this.projectiles])this.projectileStep(projectile,dt);
    for(const e of this.effects){if(e.type==='wall'&&!e.fortified&&this.now-e.created>=config['playable-agents'].Sage.C.fortify){e.fortified=true;e.hp=config['playable-agents'].Sage.C.fortifiedHP;}if(e.type==='wall'&&this.now-e.created>=config['playable-agents'].Sage.C.decayStart)e.hp=Math.min(e.hp,config['playable-agents'].Sage.C.fortifiedHP*(e.expires-this.now)/(config['playable-agents'].Sage.C.duration-config['playable-agents'].Sage.C.decayStart));}
    this.effects=this.effects.filter(e=>e.expires>this.now&&(e.type!=='wall'||e.hp>0));this.pings=this.pings.filter(p=>p.until>this.now);
    const channel=this.rules.spike.channel;if(channel&&(channel.actor.hp<=0||B.Vector3.Distance(vec(channel.position),channel.actor.feet)>.5))this.rules.cancelChannel();
    this.rules.tick(this.now,p=>p.hp>0||p.resurrectAt>this.now||p.agent==='Clove'&&p.ult>=p.ultCost&&this.now-p.deathAt<config['playable-agents'].Clove.X.window&&p.deathCause!=='fall');
  }
  interact(p){const s=this.rules.spike,d=config.match.interactionRange;
    if(s.state==='dropped')this.rules.pickup(p,B.Vector3.Distance(p.feet,vec(s.position)));
    const site=this.layout.sites.find(site=>Math.abs(site.position[1]-p.feet.y)<(site.floorTolerance||1)&&site.polygons.some(poly=>this.inPolygon(p.feet,poly))&&!site.exclusions?.some(poly=>this.inPolygon(p.feet,poly)));
    if(s.state==='carried'&&s.carrier===p)this.rules.beginChannel(p,'plant',this.now,!!site,p.position);
    if(s.state==='planted')this.rules.beginChannel(p,'defuse',this.now,B.Vector3.Distance(p.feet,vec(s.position))<=d,p.position);
    if(!this.orbs)this.orbs=this.layout.orbs?.map(a=>({position:a.position||a,taken:false}))||[];
    if(!s.channel&&p.ult<p.ultCost)for(const orb of this.orbs){if(orb.taken||!finite(orb.position)||B.Vector3.DistanceSquared(p.feet,vec(orb.position))>d*d)continue;if(!p.orbAt)p.orbAt=this.now;if(this.now-p.orbAt>=config.match.orbDuration){orb.taken=true;p.ult=Math.min(p.ultCost,p.ult+config.economy.ultPoints.orb);p.orbAt=0;}return;}
    p.orbAt=0;
  }
  inPolygon(point,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>point.z)!==(b[1]>point.z)&&point.x<(b[0]-a[0])*(point.z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  projectileStep(p,dt){
    if(this.now<p.release)return;
    const owner=this.members.find(a=>a.id===p.owner),def=config['playable-agents'][p.agent][p.type==='cloud'?'C':'Q'];
    if(!p.released){p.released=true;if(owner){p.position=this.eye(owner).add(this.direction(owner).scale(.35)).asArray();}}
    if(!p.stuck){const origin=vec(p.position),velocity=vec(p.velocity);if(p.type==='cloud'&&owner?.input.steer)velocity.copyFrom(this.direction(owner)).scaleInPlace(def.speed);velocity.y-=p.gravity*dt;const delta=velocity.scale(dt),length=delta.length(),hit=length?this.pick(new B.Ray(origin,delta.scale(1/length),length)):null;
      if(hit){p.position=hit.pickedPoint.asArray();if(p.type==='meddle'&&hit.getNormal().y>.55){p.stuck=true;p.expires=this.now+def.windup;}else if(p.type==='meddle'){const normal=hit.getNormal();velocity.subtractInPlace(normal.scale(2*B.Vector3.Dot(velocity,normal))).scaleInPlace(.45);p.position=hit.pickedPoint.add(normal.scale(.035)).asArray();}else p.expires=this.now;}
      else p.position=origin.add(delta).asArray();p.velocity=velocity.asArray();}
    if(this.now>=p.expires){const point=vec(p.position);
      if(p.type==='cloud')this.effect('smoke',owner,point,def.radius,def.duration);
      if(p.type==='slow'){const floor=this.world.collision.pick(new B.Ray(point.add(new B.Vector3(0,.2,0)),B.Vector3.Down(),3),true);if(floor)this.effect('slow',owner,floor.pickedPoint,def.radius,def.duration);}
      if(p.type==='meddle'&&p.stuck){
        for(const target of this.members){const delta=target.feet.add(new B.Vector3(0,1,0)).subtract(point),distance=delta.length();
          if(target.hp<=0||distance>=def.radius||this.pick(new B.Ray(point,delta.normalize(),Math.max(0,distance-.1))))continue;
          if(target.decay)target.hp=Math.min(100,target.hp+target.decay.amount);target.ledger.set(p.owner,{at:this.now,damage:def.decay});target.decay={amount:0,maximum:def.decay,rate:def.decayRate,restoreRate:def.restoreRate,expires:this.now+def.duration};
        }this.emit('meddleImpact',{owner:p.owner,position:p.position,radius:def.radius});
      }
      this.projectiles.splice(this.projectiles.indexOf(p),1);}
  }
  snapshot(viewer){
    if(this.phase==='selecting'||this.phase==='revealing')return {type:'snapshot',room:this.lobby(viewer),time:this.now,tick:this.tick,version:this.version,members:[],events:[]};
    const r=this.rules,s=r.spike||{state:'none',position:null};return {type:'snapshot',room:this.lobby(viewer),time:this.now,tick:this.tick,version:this.version,
    rules:{phase:r.phase,round:r.round,score:r.score,attacking:r.attacking,until:r.until,winner:r.winner,reason:r.reason,spike:{state:s.state,position:s.position,carrier:s.carrier?.id,checkpoint:s.checkpoint,explodesAt:s.explodesAt,channel:s.channel?{...s.channel,actor:s.channel.actor.id}:null}},
    members:this.members.map(p=>({id:p.id,name:p.name,team:p.team,agent:p.agent,connected:p.connected,hp:p.hp,armor:p.armor,armorType:p.armorType,regenPool:p.regenPool,credits:p.credits,ult:p.ult,kills:p.kills,deaths:p.deaths,assists:p.assists,position:p.position,velocity:p.velocity.asArray(),yaw:p.yaw,pitch:p.pitch,crouching:p.crouching,grounded:p.grounded,ads:!!p.input.ads,weapon:p.weapon,reloading:!!p.reloadUntil,inventory:p.inventory,charges:p.charges,cooldowns:p.cooldowns,knives:p.knives,overheal:p.overheal||0,skill:p.skillEquipped,hasteUntil:p.hasteUntil,lastVictim:p.lastVictim,skillLock:p.skillLock,equipUntil:p.equipUntil,deathAt:Number.isFinite(p.deathAt)?p.deathAt:null,deathCause:p.deathCause,resurrectAt:p.resurrectAt,intangibleUntil:p.intangibleUntil,reviveDeadline:p.reviveDeadline,dashReady:p.dashReady,dashExpires:p.dashExpires,uiRequest:p.uiRequest,uiSpent:p.bought.reduce((a,b)=>a+b.price,0),bought:p.bought,inputSeq:p.input.seq,...(p===viewer?{weaponAck:p.weaponAck||0,shotAck:p.shotAck||0,receivedInputSeq:p.receivedInputSeq||p.input.seq,jumpHeld:!!p.jumpHeld,speedScale:p.speedScale??1,spawnPoint:p.spawnPoint?.asArray(),dashUntil:p.dashUntil||0,dashDirection:p.dashDirection?.asArray(),ammo:p.ammo,orbAt:p.orbAt,reloadUntil:p.reloadUntil,lastDamageAt:Number.isFinite(p.lastDamageAt)?p.lastDamageAt:null}:{} )})),
    effects:this.effects,projectiles:this.projectiles,drops:this.drops,orbs:this.orbs||[],pings:this.pings.filter(p=>p.team===viewer.team)};}
}
module.exports={Room,boxHit,finite,clean};
