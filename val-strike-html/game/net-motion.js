// Absolute reconciliation followed by replay of unacknowledged fixed ticks.
// Render smoothing is separate from the physical actor and never fed back.
class NetworkMotion {
  constructor(mov,pick,actor,tickRate=30){
    this.mov=mov;this.pick=pick;this.actor=actor;this.dt=1/tickRate;this.pending=[];this.offset=BABYLON.Vector3.Zero();this.previous=actor.feet.clone();this.context={};this.ready=false;this.lastAck=0;
  }
  environment(state){return {weapon:state.weapon,agent:state.agent,speedScale:state.speedScale??1,blocked:state.hp<=0||state.resurrectAt>0||state.movementBlocked,
    spawnPoint:state.buyPhase&&state.spawnPoint?BABYLON.Vector3.FromArray(state.spawnPoint):null,
    time:state.time||0,dashUntil:state.dashUntil||0,dashDirection:state.dashUntil>state.time&&state.dashDirection?BABYLON.Vector3.FromArray(state.dashDirection):null,dashSpeed:state.dashSpeed||18};}
  restore(state){
    this.actor.feet.copyFromFloats(...state.position);this.actor.velocity.copyFromFloats(...state.velocity);this.actor.crouching=!!state.crouching;this.actor.grounded=!!state.grounded;this.actor.jumpHeld=!!state.jumpHeld;
  }
  reset(state){this.restore(state);this.previous.copyFrom(this.actor.feet);this.context=this.environment(state);this.pending=[];this.offset.setAll(0);this.ready=true;this.lastAck=state.inputSeq||0;}
  predict(input){
    if(!this.ready)return;
    const command={...input};this.pending.push(command);if(this.pending.length>120)this.pending.shift();this.previous.copyFrom(this.actor.feet);
    this.advance(command,this.context);
  }
  advance(command,context){context.time+=this.dt*1000;if(context.time>=context.dashUntil)context.dashDirection=null;actorNetworkStep(this.actor,command,this.dt,this.pick,this.mov,context);}
  reconcile(state){
    if(!this.ready){this.reset(state);return;}
    const ack=state.inputSeq||0;if(ack<this.lastAck)return;this.lastAck=ack;
    const displayed=this.actor.feet.add(this.offset),segment=this.previous.subtract(this.actor.feet);this.context=this.environment(state);
    this.pending=this.pending.filter(command=>command.seq>ack);this.restore(state);
    this.previous.copyFrom(this.actor.feet).addInPlace(segment);
    for(const command of this.pending){this.previous.copyFrom(this.actor.feet);this.advance(command,this.context);}
    this.offset.copyFrom(displayed.subtract(this.actor.feet));
    // Respawns/large corrections must not sweep the camera through walls.
    if(this.offset.length()>2.5)this.offset.setAll(0);
  }
  render(alpha,frameDT){
    this.offset.scaleInPlace(Math.exp(-18*Math.max(0,frameDT)));
    // Interpolate between two collision-resolved positions. Extrapolating the
    // last velocity produces a backwards jump whenever input/speed changes.
    return BABYLON.Vector3.Lerp(this.previous,this.actor.feet,Math.max(0,Math.min(1,alpha))).addInPlace(this.offset);
  }
}
