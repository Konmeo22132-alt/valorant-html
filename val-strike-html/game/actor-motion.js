// Shared swept radius, floor probes and head clearance for human and bot actors.
function actorMoveAxis(actor,axis,displacement,height,pick,mov) {
  if(!displacement)return;
  const direction=axis==='x'?new BABYLON.Vector3(Math.sign(displacement),0,0):new BABYLON.Vector3(0,0,Math.sign(displacement));
  const count=Math.max(1,Math.ceil(Math.abs(displacement)/.07)),stride=Math.abs(displacement)/count;
  for(let i=0;i<count;i++) {
    const before=actor.feet.clone(),floor=actorFloorAt(before,mov.stepHeight+.08,pick,mov);
    const grounded=actor.velocity.y<=0&&floor!==null&&Math.abs(before.y-floor)<.06;
    const candidate=before.clone();candidate[axis]+=Math.sign(displacement)*stride;
    const support=grounded?actorFloorAt(candidate,mov.stepHeight+.36,pick,mov):null;
    if(support!==null&&support>before.y&&support-before.y<=mov.stepHeight+.01) {
      const rise=support-before.y;
      const ceiling=pick(before.add(new BABYLON.Vector3(0,height-.02,0)),BABYLON.Vector3.Up(),rise+.025);
      if(!ceiling)actor.feet.y=support;
    }
    let allowed=stride;
    const low=grounded?mov.stepHeight+.03:.025;
    for(const y of [low,height*.3,height*.55,height*.8,height-.025])for(const side of [-.85,0,.85]) {
      const radius=mov.playerRadius*Math.sqrt(1-side*side),origin=actor.feet.add(new BABYLON.Vector3(0,y,0));
      origin[axis==='x'?'z':'x']+=side*mov.playerRadius;
      const hit=pick(origin,direction,stride+radius+.005);
      if(hit)allowed=Math.min(allowed,Math.max(0,hit.distance-radius-.005));
    }
    actor.feet[axis]+=Math.sign(displacement)*allowed;
    if(allowed<stride-.0001){actor.velocity[axis]=0;if(!allowed)actor.feet.y=before.y;break;}
    if(grounded&&support!==null&&support<actor.feet.y&&actor.feet.y-support<=mov.stepHeight+.01)actor.feet.y=support;
  }
}
function actorFloorAt(feet,length,pick,mov) {
  let floor=null;const radius=mov.playerRadius*.9,diagonal=radius/Math.SQRT2;
  // Exact source treads now provide continuous centre support. Probe the rim
  // only at an edge/gap instead of tracing nine rays on every flat-floor step.
  const centre=pick(feet.add(new BABYLON.Vector3(0,mov.stepHeight+.01,0)),BABYLON.Vector3.Down(),length,true);
  if(centre)return centre.pickedPoint.y;
  for(const [x,z] of [[radius,0],[-radius,0],[0,radius],[0,-radius],[diagonal,diagonal],[-diagonal,diagonal],[diagonal,-diagonal],[-diagonal,-diagonal]]) {
    const hit=pick(feet.add(new BABYLON.Vector3(x,mov.stepHeight+.01,z)),BABYLON.Vector3.Down(),length,true);
    if(hit&&(floor===null||hit.pickedPoint.y>floor))floor=hit.pickedPoint.y;
  }return floor;
}
function actorStep(actor,wish,dt,pick,mov) {
  const change=wish.lengthSquared()>.001?mov.acceleration:mov.deceleration;
  const delta=wish.subtract(new BABYLON.Vector3(actor.velocity.x,0,actor.velocity.z)),distance=delta.length();
  if(distance){delta.scaleInPlace(Math.min(1,change*dt/distance));actor.velocity.x+=delta.x;actor.velocity.z+=delta.z;}
  const steps=Math.max(1,Math.ceil(dt*60)),sub=dt/steps;
  for(let i=0;i<steps;i++) {
    actorMoveAxis(actor,'x',actor.velocity.x*sub,actor.crouching?mov.crouchHeight:mov.standingHeight,pick,mov);
    actorMoveAxis(actor,'z',actor.velocity.z*sub,actor.crouching?mov.crouchHeight:mov.standingHeight,pick,mov);
    actor.velocity.y=Math.max(-mov.terminalVelocity,actor.velocity.y+mov.gravity*sub);
    const floor=actorFloorAt(actor.feet,mov.stepHeight+.15+Math.max(0,-actor.velocity.y*sub),pick,mov);
    const next=actor.feet.y+actor.velocity.y*sub;
    if(actor.velocity.y>0) {
      const height=actor.crouching?mov.crouchHeight:mov.standingHeight;
      const ceiling=pick(actor.feet.add(new BABYLON.Vector3(0,height,0)),BABYLON.Vector3.Up(),actor.velocity.y*sub+.01);
      if(ceiling){actor.feet.y+=Math.max(0,ceiling.distance-.01);actor.velocity.y=0;continue;}
    }
    if(floor!==null&&actor.velocity.y<=0&&next<=floor+.12){actor.feet.y=floor;actor.velocity.y=0;}
    else actor.feet.y=next;
  }
}

// Fixed input tick shared by the server and client prediction/replay. Render
// FPS never changes how much simulated time a movement command represents.
function actorNetworkStep(actor,input,dt,pick,mov,context={}) {
  const keys=input.keys||0,yaw=input.yaw||0;
  actor.crouching=!!(keys&32);
  if(!actor.crouching&&pick(actor.feet.add(new BABYLON.Vector3(0,mov.crouchHeight,0)),BABYLON.Vector3.Up(),mov.standingHeight-mov.crouchHeight))actor.crouching=true;
  actor.grounded=actor.velocity.y===0&&actorFloorAt(actor.feet,mov.stepHeight+.16,pick,mov)!==null;
  if(keys&64&&actor.grounded&&!actor.jumpHeld&&!context.blocked){actor.velocity.y=mov.jumpSpeed;actor.grounded=false;}
  actor.jumpHeld=!!(keys&64);
  const weapon=context.weapon||'Classic';let speed=mov.speedByWeaponClass[mov.classByWeapon[weapon]]||5.4;
  if(keys&16)speed*=mov.walkMultiplier;if(actor.crouching)speed*=mov.crouchMultiplier;if(input.ads)speed*=mov.adsSpeedMult[weapon]||1;
  speed*=context.speedScale??1;
  const x=(keys&8?1:0)-(keys&4?1:0),z=(keys&1?1:0)-(keys&2?1:0);
  const wish=new BABYLON.Vector3(Math.cos(yaw)*x+Math.sin(yaw)*z,0,Math.cos(yaw)*z-Math.sin(yaw)*x);
  if(wish.lengthSquared())wish.normalize().scaleInPlace(speed);
  if(context.blocked)wish.setAll(0);
  if(context.dashDirection){wish.copyFrom(context.dashDirection).scaleInPlace(context.dashSpeed||18);actor.velocity.x=wish.x;actor.velocity.z=wish.z;}
  if(context.agent==='Jett'&&keys&64&&actor.velocity.y<-2&&!actor.grounded)actor.velocity.y=-2;
  const previous=actor.feet.clone();actorStep(actor,wish,dt,pick,mov);
  if(context.spawnPoint&&(BABYLON.Vector3.DistanceSquared(actor.feet,context.spawnPoint)>225||Math.abs(actor.feet.y-context.spawnPoint.y)>2)){actor.feet.copyFrom(previous);actor.velocity.setAll(0);}
  actor.grounded=actor.velocity.y===0&&actorFloorAt(actor.feet,mov.stepHeight+.16,pick,mov)!==null;
}
