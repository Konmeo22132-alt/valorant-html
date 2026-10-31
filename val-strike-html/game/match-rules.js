// Pure local authority: team identity is a/b; attacking side changes at halftime.
class MatchRules {
  constructor(config, emit=()=>{}) {
    this.config=config;this.emit=emit;this.phase='idle';this.score={a:0,b:0};
    this.round=0;this.members=[];this.losses={a:0,b:0};this.attacking='a';this.spike=null;
  }
  choose(member,agent) {
    if(this.phase!=='idle'&&this.phase!=='select')return false;
    if(!this.config.match.playableRoster.includes(agent))return false;
    if(this.members.filter(p=>p!==member&&p.team===member.team&&p.agent===agent).length>=this.config.match.maxAgentCopiesPerTeam)return false;
    member.agent=agent;return true;
  }
  credit(p,amount) {p.credits=Math.min(this.config.economy.maxCredits,Math.max(0,p.credits+amount));}
  start(members,now) {
    const {match,economy}=this.config;
    for(const team of ['a','b']) {
      const players=members.filter(p=>p.team===team);
      if(match.allowUnevenTeams){if(players.length<1||players.length>match.teamSize)throw Error('Mỗi đội cần từ 1 đến '+match.teamSize+' người.');}
      else if(players.length!==match.teamSize)throw Error('Đội hình phải đủ '+match.teamSize+' người/team.');
      for(const agent of match.playableRoster)if(players.filter(p=>p.agent===agent).length>match.maxAgentCopiesPerTeam)throw Error('Mỗi đặc vụ tối đa '+match.maxAgentCopiesPerTeam+' lần/team.');
      if(players.some(p=>!match.playableRoster.includes(p.agent)))throw Error('Đặc vụ chưa hỗ trợ.');
    }
    this.members=members;this.score={a:0,b:0};this.round=0;this.losses={a:0,b:0};
    for(const p of members){p.credits=economy.roundStart;p.kills=0;p.deaths=0;p.assists=0;p.ult=0;p.inventory={primary:null,secondary:'Classic',melee:'Melee'};}
    this.nextRound(now);
  }
  nextRound(now) {
    const r=this.config.rounds;this.round++;
    const overtime=this.round>r.halfRounds*2;
    this.attacking=overtime?((this.round-r.halfRounds*2)%2?'a':'b'):(this.round<=r.halfRounds?'a':'b');
    const pistol=this.round===1||this.round===r.halfRounds+1;
    if(pistol)this.losses={a:0,b:0};
    for(const p of this.members) {
      if(pistol||overtime){p.credits=overtime?r.overtime.credits:this.config.economy.roundStart;p.inventory={primary:null,secondary:'Classic',melee:'Melee'};p.armor=0;}
      if(overtime&&r.overtime.ultPointsToMissing3)p.ult=Math.max(0,(p.ultCost||8)-3);
      p.hp=100;p.dead=false;p.deathReported=false;p.bought=[];p.armor=p.armor||0;p.channel=null;
    }
    this.phase='buy';this.until=now+(pistol?r.buyPhaseFirst:r.buyPhase);
    const carrier=this.members.find(p=>p.team===this.attacking);
    this.spike={state:'carried',carrier,position:null,checkpoint:0,channel:null};
    this.emit('round',this);
  }
  buy(p,item,price,apply) {
    if(this.phase!=='buy'||p.hp<=0||!Number.isFinite(price)||price<0||p.credits<price)return false;
    if(!apply())return false;
    this.credit(p,-price);p.bought.push({item,price});this.emit('purchase',p);return true;
  }
  sell(p,item,apply) {
    if(this.phase!=='buy')return false;
    const index=p.bought.findLastIndex(b=>b.item===item);if(index<0||!apply())return false;
    this.credit(p,p.bought[index].price*this.config.economy.sellRefundPct);p.bought.splice(index,1);return true;
  }
  killed(victim,killer,now) {
    if(victim.deathReported||this.phase!=='live')return;
    victim.hp=0;victim.dead=true;victim.deathReported=true;victim.deaths++;
    victim.ult=Math.min(victim.ultCost||8,(victim.ult||0)+this.config.economy.ultPoints.died);
    if(killer&&killer.team!==victim.team){killer.kills++;this.credit(killer,this.config.economy.killReward);killer.ult=Math.min(killer.ultCost||8,(killer.ult||0)+this.config.economy.ultPoints.kill);}
    if(this.spike.carrier===victim){this.spike.state='dropped';this.spike.carrier=null;this.spike.position=[...victim.position];}
    if(this.spike.channel?.actor===victim)this.cancelChannel();
    this.emit('death',{victim,killer,now});
  }
  pickup(p,distance) {
    if(this.phase!=='live'||p.hp<=0||p.team!==this.attacking||this.spike.state!=='dropped'||distance>this.config.match.interactionRange)return false;
    this.spike.state='carried';this.spike.carrier=p;return true;
  }
  beginChannel(p,kind,now,valid,position) {
    if(this.phase!=='live'||p.hp<=0||!valid)return false;
    if(this.spike.channel)return this.spike.channel.actor===p&&this.spike.channel.kind===kind;
    if(kind==='plant'&&(this.spike.state!=='carried'||this.spike.carrier!==p||p.team!==this.attacking))return false;
    if(kind==='defuse'&&(this.spike.state!=='planted'||p.team===this.attacking))return false;
    const progress=kind==='defuse'?this.spike.checkpoint:0;
    this.spike.channel={actor:p,kind,start:now,progress,position:[...position]};return true;
  }
  cancelChannel() {this.spike.channel=null;}
  tick(now,alive=p=>p.hp>0) {
    if(this.phase==='buy'&&now>=this.until){this.phase='live';this.until=now+this.config.rounds.roundTime;this.emit('live',this);}
    if(this.phase==='end'&&now>=this.until){this.nextRound(now);return;}
    if(this.phase!=='live')return;
    const r=this.config.rounds,s=this.spike,c=s.channel;
    // Explosion wins a tie; no defuse can finish after the bomb deadline.
    if(s.state==='planted'&&now>=s.explodesAt){this.finish(this.attacking,'Spike phát nổ',now);return;}
    if(c) {
      const elapsed=now-c.start+c.progress;
      if(c.kind==='defuse'&&elapsed>=r.defuseCheckpoint)s.checkpoint=r.defuseCheckpoint;
      if(elapsed>=(c.kind==='plant'?r.plantDuration:r.defuseDuration)) {
        s.channel=null;
        if(c.kind==='plant') {
          s.state='planted';s.position=c.position;s.carrier=null;s.explodesAt=now+r.spikeTimer;
          for(const p of this.members.filter(p=>p.team===this.attacking))this.credit(p,this.config.economy.plantTeamReward);
          c.actor.ult=Math.min(c.actor.ultCost||8,(c.actor.ult||0)+this.config.economy.ultPoints.plant);this.emit('plant',s);
        } else {c.actor.ult=Math.min(c.actor.ultCost||8,(c.actor.ult||0)+this.config.economy.ultPoints.defuse);this.finish(c.actor.team,'Gỡ Spike',now);return;}
      }
    }
    const defending=this.attacking==='a'?'b':'a';
    if(!this.members.some(p=>p.team===defending&&alive(p))){this.finish(this.attacking,'Hạ toàn bộ đội phòng thủ',now);return;}
    if(s.state!=='planted'&&!this.members.some(p=>p.team===this.attacking&&alive(p))){this.finish(defending,'Hạ toàn bộ đội tấn công',now);return;}
    if(s.state!=='planted'&&now>=this.until)this.finish(defending,'Hết giờ',now);
  }
  finish(winner,reason,now) {
    if(this.phase!=='live')return;
    const e=this.config.economy;this.score[winner]++;this.losses[winner]=0;
    const loser=winner==='a'?'b':'a';this.losses[loser]++;
    for(const p of this.members) {
      const reward=p.team===winner?e.winRound:p.hp>0?e.survivedLossReward:e.lossStreak[Math.min(e.lossStreak.length-1,this.losses[loser]-1)];
      this.credit(p,reward);if(p.hp<=0&&e.deathLossWeapons){p.inventory={primary:null,secondary:'Classic',melee:'Melee'};p.armor=0;}
    }
    this.spike.channel=null;this.reason=reason;this.winner=winner;
    const r=this.config.rounds;this.phase=this.score[winner]>=r.matchWinRounds&&Math.abs(this.score.a-this.score.b)>=2?'complete':'end';
    this.until=now+r.postRound;this.emit('end',this);
  }
}
if(typeof module!=='undefined')module.exports={MatchRules};
