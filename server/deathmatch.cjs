'use strict';
const {MatchRules}=require('../val-strike-html/game/match-rules.js');
class DeathmatchRules extends MatchRules{
  start(members,now){this.members=members;this.round=1;this.score={a:0,b:0};this.attacking=null;this.spike={state:'none',channel:null,position:null};this.phase='live';this.until=now+this.config.match.deathmatch.duration;
    for(const p of members){p.hp=100;p.dead=p.deathReported=false;p.kills=p.deaths=p.assists=p.ult=0;p.credits=0;p.inventory={primary:'Vandal',secondary:'Classic',melee:'Melee'};p.bought=[];}
    this.emit('round',this);this.emit('live',this);
  }
  killed(victim,killer,now){if(victim.deathReported||this.phase!=='live')return;victim.hp=0;victim.dead=victim.deathReported=true;victim.deaths++;victim.respawnAt=now+this.config.match.deathmatch.respawnDelay;if(killer&&killer!==victim)killer.kills++;this.emit('death',{victim,killer,now});}
  tick(now){if(this.phase!=='live')return;const leader=[...this.members].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)[0];this.score={a:leader?.kills||0,b:this.config.match.deathmatch.killLimit};if(now>=this.until||leader?.kills>=this.config.match.deathmatch.killLimit){this.phase='complete';this.winner=leader?.team;this.reason=leader?.kills>=this.config.match.deathmatch.killLimit?'Đạt 40 hạ gục':'Hết thời gian';this.emit('end',this);}}
}
module.exports={DeathmatchRules};
