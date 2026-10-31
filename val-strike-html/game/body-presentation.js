// One 3P pose/attachment path for the local avatar, bots and remote players.
function bodyClip(groups,name) {
  if(!name)return null;
  return groups.get(name)||groups.get(name.replace(/_UB$/,'')+'_UB')||null;
}
function bodyActionName(name) {
  name=(name||'').replace(/_UB$/,'');
  if(name==='X_alt')return 'X_firealt';
  return /^X_fire[1345]$/.test(name)?'X_fire':name;
}
function bodyUpperPose(view,state,now) {
  const {groups,nodes}=view,action=state.action;
  const clip=action&&bodyClip(groups,bodyActionName(action.name)),clipDuration=clip?(clip.to-clip.from)/(clip.targetedAnimations[0]?.animation.framePerSecond||30)*1000:180;
  if(action&&(now>=action.start+(action.duration||clipDuration)||state.slot&&action.name.startsWith('gun_')))state.action=null;
  const active=state.action,name=active&&bodyActionName(active.name);
  let actionGroup=bodyClip(groups,name);
  if(!actionGroup&&name==='X_fire2')actionGroup=bodyClip(groups,'X_fire');
  const slot=state.slot,gun='gun_'+state.weapon+'_';
  const holding=slot?bodyClip(groups,slot+'_idle')||bodyClip(groups,slot+'_equip'):
    bodyClip(groups,gun+(state.reloading?(state.reloadClip||'reload'):state.ads?(state.crouching?'adscrouch':'ads'):state.crouching?'crouch':'idle'))||bodyClip(groups,gun+(state.reloading?'reload':'idle'));
  let upper=actionGroup||holding||bodyClip(groups,'Idle');
  if(!upper)return;
  const duration=active?.duration||((upper.to-upper.from)/(upper.targetedAnimations[0]?.animation.framePerSecond||30)*1000);
  const frame=actionGroup?upper.from+(upper.to-upper.from)*Math.min(1,Math.max(0,(now-active.start)/duration)):
    state.reloading?agentFrame(upper,now-(state.reloadStarted||now),false):slot&&upper===bodyClip(groups,slot+'_equip')?upper.to:agentFrame(upper,now);
  let authoredPitch=false;
  if(actionGroup&&Math.abs(state.pitch||0)>.001) {
    const direction=state.pitch<0?'N':'S',degrees=Math.abs(state.pitch)*180/Math.PI;
    const near=bodyClip(groups,name+'_'+direction+'45'),far=bodyClip(groups,name+'_'+direction+'90');
    if(near){
      const phase=Math.min(1,Math.max(0,(now-active.start)/duration)),a=degrees<45?upper:near,b=degrees<45?near:far||near;
      const blend=Math.min(1,degrees<45?degrees/45:(degrees-45)/45);
      const pose=agentPoseSnapshot(a,a.from+(a.to-a.from)*phase),other=agentPoseSnapshot(b,b.from+(b.to-b.from)*phase);
      bodyBlendPose(pose,other,blend);authoredPitch=true;
    }
  }
  if(!authoredPitch)upper.goToFrame(frame);
  const recoil=active&&!actionGroup&&name?.endsWith('_fire')?-.035*Math.sin(Math.min(1,(now-active.start)/(active.duration||160))*Math.PI):0;
  if(!authoredPitch)bodyAimPitch(nodes,state.yaw||0,(state.pitch||0)+recoil);
  const key=(actionGroup?name:upper.name)+(active?'@'+active.start:'');
  if(view.upperKey!==key){view.upperTransitionPose=agentCopyPose(view.upperPose,view.upperTransitionPose);view.upperTransition={start:now,pose:view.upperTransitionPose,duration:active?45:100};view.upperKey=key;}
  const transition=view.upperTransition;
  if(transition?.pose){const mix=Math.min(1,(now-transition.start)/transition.duration);for(const [node,pose] of transition.pose){BABYLON.Vector3.LerpToRef(pose.position,node.position,mix,node.position);if(pose.rotation&&node.rotationQuaternion)BABYLON.Quaternion.SlerpToRef(pose.rotation,node.rotationQuaternion,mix,node.rotationQuaternion);}if(mix>=1)view.upperTransition=null;}
  view.upperPose=agentCapturePose(upper,view.upperPose||undefined);
}
function bodyBlendPose(a,b,mix){for(const [node,value] of a){const other=b.get(node);if(!other)continue;BABYLON.Vector3.LerpToRef(value.position,other.position,mix,node.position);if(value.rotation&&other.rotation)BABYLON.Quaternion.SlerpToRef(value.rotation,other.rotation,mix,node.rotationQuaternion);}}
function bodyAimPitch(nodes,yaw,pitch) {
  const B=BABYLON,s=nodes._vsAimScratch||(nodes._vsAimScratch={world:new B.Vector3(),axis:new B.Vector3(),inverse:new B.Matrix(),rotation:new B.Quaternion(),result:new B.Quaternion()});
  s.world.set(Math.cos(yaw),0,-Math.sin(yaw));
  for(const [name,weight]of bodyPitchBones){const node=nodes.get(name);if(!node?.rotationQuaternion||!node.parent)continue;node.parent.computeWorldMatrix(true);const parent=node.parent.getWorldMatrix();parent.invertToRef(s.inverse);B.Vector3.TransformNormalToRef(s.world,s.inverse,s.axis);s.axis.normalize().scaleInPlace(Math.sign(parent.determinant())||1);B.Quaternion.RotationAxisToRef(s.axis,pitch*weight,s.rotation);s.rotation.multiplyToRef(node.rotationQuaternion,s.result);node.rotationQuaternion.copyFrom(s.result);node.computeWorldMatrix(true);}
}
const bodyPitchBones=[['Spine2',.35],['Spine3',.65]];
function bodyHandPoint(nodes) {
  const right=nodes.get('R_Hand')||nodes.get('R_WeaponPoint'),left=nodes.get('L_Hand')||nodes.get('L_WeaponPoint');
  if(!right)return null;right.computeWorldMatrix(true);
  if(!left)return right.getAbsolutePosition().clone();left.computeWorldMatrix(true);
  return BABYLON.Vector3.Lerp(right.getAbsolutePosition(),left.getAbsolutePosition(),.5);
}
function bodySkillProps(view,state,now) {
  const visible=state.visible&&state.hp>0,slot=state.slot,action=state.action;
  const casting=action&&now<action.start+(action.duration||700)?bodyActionName(action.name):'';
  const orb=state.agent==='Sage'&&(['C','Q','E'].includes(slot)||/^[CQE]_(equip|cast|self)$/.test(casting));
  const butterfly=state.agent==='Clove'&&(slot==='Q'||casting==='Q_equip');
  const label=orb?'orb':butterfly?'butterfly':null;
  if(label&&!view.worldHeld){
    const mesh=BABYLON.MeshBuilder.CreateSphere('world_held_skill',{diameter:.16,segments:12},scene);
    mesh.isPickable=false;mesh.metadata={skillAgent:state.agent};mesh.material=agentHeldMaterial(label);mesh.renderingGroupId=0;
    agentAttachEffectModel(mesh,label,.2,{agent:state.agent,material:mesh.material});agentHeldLayers(mesh,label);view.worldHeld=mesh;
  }
  view.worldHeld?.setEnabled(!!label&&visible);
  if(label&&visible&&view.worldHeld){const point=bodyHandPoint(view.nodes);if(point)view.worldHeld.position.copyFrom(point);view.worldHeld.rotation.y=now*.0012;view.worldHeld.metadata?.updateLayers?.(now);}
  const knives=state.agent==='Jett'&&slot==='X'&&state.knives>0;
  if(knives&&!view.worldKnives){
    const root=new BABYLON.TransformNode('world_blade_storm',scene);root.metadata={skillAgent:'Jett'};root.knives=[];
    for(let i=0;i<5;i++){
      const mesh=BABYLON.MeshBuilder.CreateBox('world_blade',{width:.02,height:.02,depth:.22},scene);mesh.parent=root;mesh.isPickable=false;
      mesh.material=agentMaterial('world_blade_mat','#C6EDFF');agentAttachEffectModel(mesh,'knife',.23,{agent:'Jett'});root.knives.push(mesh);
    }view.worldKnives=root;
  }
  view.worldKnives?.setEnabled(!!knives&&visible);
  if(knives&&visible){const point=bodyHandPoint(view.nodes);if(point)view.worldKnives.position.copyFrom(point);view.worldKnives.rotation.set(state.pitch||0,state.yaw||0,0);
    view.worldKnives.knives.forEach((mesh,i)=>{mesh.setEnabled(i<state.knives);mesh.position.set((i-2)*.13,.04+Math.abs(i-2)*.018,.1);mesh.rotation.z=Math.sin(now*.003+i)*.08;});}
}
function bodyDisposeProps(view){for(const key of ['worldHeld','worldKnives']){if(view[key])agentDisposeMesh(view[key]);view[key]=null;}view.upperPose?.clear();view.upperPose=null;view.upperTransitionPose?.clear();view.upperTransitionPose=null;view.upperTransition=null;view.upperKey=null;}
function bodyWeaponPose(prop,reloading,elapsed,action,now=agentNow()) {
  const firing=action?.name.startsWith('gun_')&&action.name.includes('_fire')&&now<action.start+(action.duration||160);
  const group=reloading?prop.groups.find(g=>g.name.endsWith('reload')):firing&&prop.groups.find(g=>g.name.endsWith('fire'));
  if(group)group.goToFrame(agentFrame(group,Math.max(0,reloading?elapsed||0:now-action.start),false));
  else for(const [node,pose] of prop.rest||[]){node.position.copyFrom(pose.position);if(node.rotationQuaternion&&pose.rotation)node.rotationQuaternion.copyFrom(pose.rotation);}
}
function bodyOwnerView(owner=VS.player,left=false) {
  const local=owner===VS.player,firstPerson=local&&!agentVisual.third;
  const nodes=local?(firstPerson?agentVisual.fpNodes:agentVisual.nodes):owner.bot?.nodes;
  const hand=nodes?.get(left?'L_Hand':'R_Hand')||nodes?.get(left?'L_WeaponPoint':'R_WeaponPoint')||owner.bot?.hand;
  hand?.computeWorldMatrix(true);return {firstPerson,hand};
}
