function matchRetargetAnimations(container,nodes,groups,prefix) {
  if(!container)return [];
  return container.animationGroups.map(source=>{
    const group=new BABYLON.AnimationGroup(prefix+source.name,scene);
    group.metadata={matchRetarget:true};
    for(const track of source.targetedAnimations){const target=nodes.get(track.target.name);if(target)group.addTargetedAnimation(track.animation,target);}
    if(group.targetedAnimations.length){group.start(false);group.pause();groups.set(source.name,group);}return group;
  });
}
function matchBotChannelProp(bot,channel,now) {
  if(bot.channelProp&&(!channel||bot.channelKind!==channel.kind)){bot.channelProp.root.dispose();bot.channelProp=null;}
  const action=bot.ability?.action,casting=action&&!action.name.startsWith('gun_')&&now<action.start+(action.duration||700);
  bot.gun?.root.setEnabled(bot.entity.hp>0&&!channel&&!bot.member.skill&&!casting&&now>=(bot.ability?.lockUntil||0)&&!bot.ability?.knives);
  if(!channel||!bot.hand)return;
  if(!bot.channelProp) {
    bot.channelProp=matchProp(channel.kind==='plant'?'spike':'defuser',bot.hand,channel.kind==='plant'?.35:.2);bot.channelKind=channel.kind;
    bot.hand.computeWorldMatrix(true);const scale=bot.hand.absoluteScaling;
    bot.channelProp.root.scaling.set(1/Math.max(.00001,Math.abs(scale.x)),1/Math.max(.00001,Math.abs(scale.y)),1/Math.max(.00001,Math.abs(scale.z)));
  }
  for(const group of bot.channelProp.groups)group.goToFrame(channel.kind==='plant'?group.from+(group.to-group.from)*Math.min(1,(now-channel.start)/window.GAME_CONFIG.rounds.plantDuration):agentFrame(group,now-channel.start));
}
function matchPlayerChannelPose(now) {
  if(!matchActive())return;
  // First-person clips must be ready even before the player opens third person.
  if(matchState.poseFpVersion!==agentVisual.version&&agentVisual.fpNodes.size) {
    matchRetargetAnimations(botAssets.get(VS.player.agent+'_arms_animations'),agentVisual.fpNodes,agentVisual.fpGroups,'match_player_');
    matchState.poseFpVersion=agentVisual.version;
  }
  if(!agentVisual.bodyAnimations&&matchState.poseBodyVersion!==agentVisual.version&&agentVisual.nodes.size) {
    matchRetargetAnimations(botAssets.get(VS.player.agent+'_body_animations'),agentVisual.nodes,agentVisual.groups,'match_player_');
    matchState.poseBodyVersion=agentVisual.version;
  }
  const channel=matchState.rules.spike.channel;if(!channel||channel.actor!==matchState.human)return;
  const progress=Math.min(1,(now-channel.start)/window.GAME_CONFIG.rounds.plantDuration);
  for(const name of [channel.kind,channel.kind+'_UB',channel.kind+'_LB']) {
    const group=(name.includes('_')?agentVisual.groups:agentVisual.fpGroups).get(name);if(!group)continue;
    group.goToFrame(channel.kind==='plant'?group.from+(group.to-group.from)*progress:agentFrame(group,now-channel.start));
  }
  const prop=channel.kind==='plant'?matchState.plantView:matchState.defuseView,hand=(agentVisual.third?agentVisual.nodes:agentVisual.fpNodes).get('R_WeaponMaster');
  if(prop&&hand) {
    prop.root.parent=hand;prop.root.position.setAll(0);hand.computeWorldMatrix(true);const scale=hand.absoluteScaling;
    prop.root.scaling.set(1/Math.max(.00001,Math.abs(scale.x)),1/Math.max(.00001,Math.abs(scale.y)),1/Math.max(.00001,Math.abs(scale.z)));
    prop.root.getChildMeshes().forEach(mesh=>mesh.renderingGroupId=agentVisual.third?0:1);
  }
}
