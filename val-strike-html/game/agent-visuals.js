// Selected agent only. No preview engine, shadow map or particle system.
const agentVisual = { version: 0, loading: false, desired: null, body: null, arms: null,
  bodyRoot: null, fpRoot: null, third: false, thirdCamera: null, action: null,
  nodes: new Map(), groups: new Map(), fpNodes: new Map(), fpGroups: new Map(),
  effectAssets: new Map(), lastPose: new Map(), lastUpdate: 0, state: 'idle', transition: null };
function agentVisualDispose() {
  if(typeof agentCloveDispose==='function')agentCloveDispose();
  agentState.visualReady=false;
  agentVisual.version++;agentVisual.action=null;
  agentVisual.bodyAction=null;
  bodyDisposeProps(agentVisual);
  agentVisual.bodyAnimations?.dispose();agentVisual.bodyAnimations=null;
  agentDisposeThirdGun();
  if (agentVisual.heldEffect) agentDisposeMesh(agentVisual.heldEffect);agentVisual.heldEffect=null;
  agentVisual.body?.dispose();agentVisual.arms?.dispose();
  agentVisual.resurrection?.container.dispose();agentVisual.resurrection?.root.dispose();agentVisual.resurrection=null;
  agentVisual.ghost?.container.dispose();agentVisual.ghost?.root.dispose();agentVisual.ghost=null;
  agentVisual.bodyRoot?.dispose();agentVisual.fpRoot?.dispose();
  agentVisual.body=agentVisual.arms=agentVisual.bodyRoot=agentVisual.fpRoot=null;
  agentVisual.knives?.dispose(false,true);agentVisual.knives=null;
  agentVisual.effectAssets.forEach(container=>{if (container.dispose) container.dispose();});agentVisual.effectAssets.clear();
  for(const groups of [agentVisual.groups,agentVisual.fpGroups])for(const group of groups.values())if(group.metadata?.matchRetarget)group.dispose();
  agentVisual.nodes.clear();agentVisual.fpNodes.clear();agentVisual.groups.clear();agentVisual.fpGroups.clear();
  agentVisual.lastPose.clear();agentVisual.transitionPose?.clear();agentVisual.transitionPose=null;agentVisual.transition=null;
  if (typeof agentEffectsDispose==='function') agentEffectsDispose();
}
function agentVisualSelect(name) {
  agentVisualDispose();agentVisual.desired=name;
  if (!agentVisual.loading) agentVisualLoad();
}
async function agentVisualLoad() {
  agentVisual.loading=true;let version;
  try {
    do {
      version=agentVisual.version;const name=agentVisual.desired,code=window.GAME_CONFIG['playable-agents'][name].code;
      const arms=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',code+'-arms.glb?v=38',scene);
      if (version!==agentVisual.version||scene.isDisposed) {arms.dispose();continue;}
      agentVisual.arms=arms;
      agentVisual.fpRoot=new BABYLON.TransformNode('agent_fp',scene);agentVisual.fpRoot.parent=camera;
      arms.addAllToScene();arms.rootNodes.forEach(node=>node.parent=agentVisual.fpRoot);
      arms.meshes.forEach(mesh=>{mesh.isPickable=false;mesh.renderingGroupId=1;mesh.metadata={viewmodel:true};});
      arms.transformNodes.forEach(node=>agentVisual.fpNodes.set(node.name,node));
      arms.animationGroups.forEach(group=>{group.start(false);group.pause();agentVisual.fpGroups.set(group.name,group);});
      agentVisual.fpRoot.setEnabled(false);
      window.__agentVisualStatus={agent:name,state:'loading-skill-assets'};
      await agentPreloadSkillAssets(name,version);
      if(version!==agentVisual.version||scene.isDisposed)continue;
      agentState.visualReady=true;
      window.__agentVisualStatus={agent:name,state:'ready',bodyClips:[...agentVisual.groups.keys()],abilityClips:[...agentVisual.fpGroups.keys()]};
      if (typeof weaponAssetContainer!=='undefined' && weaponAssetContainer) agentHideWeaponArms();
      if (agentVisual.third) await agentVisualLoadBody();
      window.__renderOnce=true;
    } while(version!==agentVisual.version && !scene.isDisposed);
  } catch(error) {agentState.visualReady=false;window.__agentVisualStatus={agent:agentVisual.desired,state:'failed',error:String(error)};agentNotice('Asset kỹ năng tải lỗi: '+error.message);console.error('[agent assets]',error);}
  finally {agentVisual.loading=false;if (version!==agentVisual.version&&!scene.isDisposed) agentVisualLoad();}
}
async function agentVisualLoadBody() {
  if (agentVisual.bodyLoading || agentVisual.bodyRoot || !agentVisual.desired) return;
  const version=agentVisual.version,code=window.GAME_CONFIG['playable-agents'][agentVisual.desired].code;
  agentVisual.bodyLoading=true;let pending;
  try {
    pending=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',code+'-body.glb?v=27',scene);
    if (version!==agentVisual.version||scene.isDisposed) {pending.dispose();return;}
    const body=pending;agentVisual.body=body;agentVisual.bodyRoot=new BABYLON.TransformNode('player_avatar',scene);
    body.addAllToScene();body.rootNodes.forEach(node=>node.parent=agentVisual.bodyRoot);
    body.meshes.forEach(mesh=>{mesh.isPickable=false;mesh.metadata={agentBody:true};mesh.alwaysSelectAsActiveMesh=false;});
    body.animationGroups.forEach(group=>{group.start(false);group.pause();agentVisual.groups.set(group.name,group);});
    body.transformNodes.forEach(node=>agentVisual.nodes.set(node.name,node));
    const animations=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/',code+'-body-animations.glb?v=48',scene);
    if(version!==agentVisual.version||scene.isDisposed){animations.dispose();return;}
    agentVisual.bodyAnimations=animations;
    matchRetargetAnimations(animations,agentVisual.nodes,agentVisual.groups,'player_body_');
    agentVisual.groups.get('Idle_LB')?.goToFrame(0);agentVisual.groups.get('Idle_UB')?.goToFrame(0);
    const bounds=agentVisual.bodyRoot.getHierarchyBoundingVectors(true),height=bounds.max.y-bounds.min.y;
    if (height>0) {const scale=1.8/height;agentVisual.bodyRoot.scaling.setAll(scale);agentVisual.bodyOffset=-bounds.min.y*scale;}
    agentVisual.bodyRoot.setEnabled(agentVisual.third);window.__renderOnce=true;
    if (window.__agentVisualStatus) window.__agentVisualStatus.bodyClips=[...agentVisual.groups.keys()];
  } catch(error) {pending?.dispose();console.error('[agent body]',error);}
  finally {agentVisual.bodyLoading=false;if (version!==agentVisual.version && agentVisual.third && !scene.isDisposed) agentVisualLoadBody();}
}
function agentHideWeaponArms() {
  if (!agentVisual.arms || !weaponAssetContainer) return;
  weaponAssetContainer.meshes.filter(mesh=>mesh.name.includes('Reyna_1P_arms') || mesh.name==='arms_mesh' || mesh.skeleton?.name==='arms_rig').forEach(mesh=>mesh.setEnabled(false));
}
function agentSetThirdPerson(enabled) {
  enabled=!!enabled;
  if(agentVisual.third===enabled){scene.activeCamera=enabled?agentVisual.thirdCamera||camera:camera;return;}
  agentVisual.third=enabled;
  if (agentVisual.third && !agentVisual.bodyRoot) agentVisualLoadBody();
  if (!agentVisual.thirdCamera) {agentVisual.thirdCamera=new BABYLON.UniversalCamera('agent_follow',camera.position.clone(),scene);agentVisual.thirdCamera.inputs.clear();agentVisual.thirdCamera.minZ=.05;agentVisual.thirdCamera.fov=camera.fov;}
  scene.activeCamera=agentVisual.third?agentVisual.thirdCamera:camera;
  window.__renderOnce=true;
}
function agentToggleThirdPerson() {agentSetThirdPerson(!agentVisual.third);}
// Pose storage is owned by the clip/view and reused across render frames.
function agentCapturePose(group,pose=new Map()) {
  let nodes=group._vsPoseNodes;if(!nodes){nodes=[];const seen=new Set();for(const track of group.targetedAnimations)if(!seen.has(track.target)){seen.add(track.target);nodes.push(track.target);}group._vsPoseNodes=nodes;}
  if(pose._vsClip!==group){pose.clear();pose._vsClip=group;}
  for(const node of nodes){let value=pose.get(node);if(!value){value={position:node.position.clone(),rotation:node.rotationQuaternion?.clone()};pose.set(node,value);}else{value.position.copyFrom(node.position);if(node.rotationQuaternion){if(value.rotation)value.rotation.copyFrom(node.rotationQuaternion);else value.rotation=node.rotationQuaternion.clone();}else value.rotation=null;}}
  return pose;
}
function agentCopyPose(from,to=new Map()) {
  if(!from){to.clear();return to;}
  if(to._vsClip!==from._vsClip){to.clear();to._vsClip=from._vsClip;}
  for(const [node,value]of from){let target=to.get(node);if(!target){target={position:value.position.clone(),rotation:value.rotation?.clone()};to.set(node,target);}else{target.position.copyFrom(value.position);if(value.rotation){if(target.rotation)target.rotation.copyFrom(value.rotation);else target.rotation=value.rotation.clone();}else target.rotation=null;}}
  return to;
}
function agentPoseSnapshot(group,frame) {
  group.goToFrame(frame);return group._vsPoseBuffer=agentCapturePose(group,group._vsPoseBuffer);
}
function agentFrame(group,now,loop=true) {
  const fps=group.targetedAnimations[0]?.animation.framePerSecond||30,duration=(group.to-group.from)/fps*1000;
  return group.from+(group.to-group.from)*(duration>0?(loop?(now%duration)/duration:Math.min(1,now/duration)):0);
}
function agentVisualAction(name,duration) {
  const bodyName=bodyActionName(name);
  agentVisual.action={name,start:agentNow(),duration};
  agentBodyAction(bodyName,duration);
  if (name==='X_cast' && VS.player.agent==='Clove') {agentVisual.resurrectionStarted=agentNow();agentLoadResurrectionArms();}
  if(VS.player.agent==='Clove'&&name==='Q_cast')agentAbilityCastTrail('meddle-swipe','clove-generic','#E4B3FF',650);
  if(VS.player.agent==='Clove'&&name==='X_cast')agentAbilityCastTrail('res-swipe','clove-generic','#D9B2FF',650);
  if(VS.player.agent==='Jett'&&name==='X_equip')agentAbilityCastTrail('knife-fan','jett-air','#C5F5FF',700);
  if(VS.player.agent==='Jett'&&name.startsWith('X_fire'))agentAbilityCastTrail('knife-twirl','jett-swipe','#C5F5FF',duration||167);
}
function agentBodyAction(name,duration) {
  agentVisual.bodyAction={name:bodyActionName(name),start:agentNow(),duration};
}
async function agentLoadResurrectionArms() {
  if (agentVisual.resurrection || agentVisual.resurrectionLoading) return;
  const version=agentVisual.version;agentVisual.resurrectionLoading=true;let pending;
  try {
    pending=await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/','smonk-resurrection-arms.glb?v=27',scene);
    if (version!==agentVisual.version || scene.isDisposed) {pending.dispose();return;}
    const root=new BABYLON.TransformNode('clove_resurrection_arms',scene);root.parent=camera;
    pending.addAllToScene();pending.rootNodes.forEach(node=>node.parent=root);
    agentResurrectionMaterials(pending);
    pending.meshes.forEach(mesh=>{mesh.isPickable=false;mesh.renderingGroupId=1;mesh.metadata={viewmodel:true};});
    const groups=new Map();pending.animationGroups.forEach(group=>{group.start(false);group.pause();groups.set(group.name,group);});
    root.setEnabled(false);agentVisual.resurrection={root,groups,container:pending};
  } catch(error) {pending?.dispose();console.warn('[resurrection arms]',error.message);}
  finally {agentVisual.resurrectionLoading=false;}
}
function agentVisualUpdate() {
  if(typeof matchSpectatorActive==='function'&&matchSpectatorActive()) {
    for(const root of [agentVisual.fpRoot,agentVisual.bodyRoot,agentVisual.ghost?.root,agentVisual.resurrection?.root,agentVisual.heldEffect,agentVisual.knives,agentVisual.worldHeld,agentVisual.worldKnives,agentVisual.thirdGun,typeof weaponModel!=='undefined'?weaponModel:null])root?.setEnabled(false);
    agentVisual.meddleView?.root.setEnabled(false);agentRuseViewUpdate(agentNow());return;
  }
  const now=agentNow(),move=window.__moveState||{};
  const ghostActive=!!agentVisual.ghost&&agentResurrectionActive(now);
  if(agentVisual.ghost){
    const ghost=agentVisual.ghost;ghost.root.setEnabled(agentVisual.third&&ghostActive);
    if(ghostActive){
      ghost.root.position.copyFrom(agentPosition()).y+=ghost.offset;ghost.root.rotation.y=camera.rotation.y;
      const started=agentState.resurrectionCastAt,end=agentState.resurrectionWindupEnds;
      const fadeIn=Math.max(0,Math.min(1,(now-started)/450)),fadeOut=end>started?Math.max(0,Math.min(1,(end-now)/350)):1,opacity=fadeIn*fadeOut;
      for(const material of ghost.container.materials)if(material.metadata?.spectral)material.setFloat('fade',opacity);
      const phase=agentState.resurrectAt>now?'intro':agentState.intangibleUntil>now?'idle':'outro',group=ghost.groups.get(phase);
      if(group)group.goToFrame(agentFrame(group,phase==='outro'?now-agentState.intangibleUntil:now-agentVisual.resurrectionStarted,phase==='idle'));
    }
  }
  if (agentVisual.bodyRoot) {
    const root=agentVisual.bodyRoot,feet=agentPosition();root.position.copyFrom(feet).y+=agentVisual.bodyOffset||0;
    root.rotation.y=camera.rotation.y;root.setEnabled(agentVisual.third&&!ghostActive);
    if (agentVisual.third) {
      const follow=agentVisual.thirdCamera,direction=camera.getDirection(BABYLON.Axis.Z),behind=direction.scale(-3);
      behind.y+=.45;const length=behind.length(),hit=abilityWorldPick(new BABYLON.Ray(camera.position.clone(),behind.scale(1/length),length));
      follow.position.copyFrom(camera.position).addInPlace(behind.normalize().scale(hit?Math.max(.1,hit.distance-.2):length));
      follow.rotation.copyFrom(camera.rotation);follow.fov=window.GAME_CONFIG.movement.baseFov;
    }
    if (agentVisual.third) {
      agentVisual.lastUpdate=now;
      const state=VS.player.hp<=0?'death':!move.grounded?'jump':move.crouching?'crouch':move.hSpeed>.1?(move.speedPct>.85?'run':'walk'):'idle';
      const moving=move.hSpeed>.1 && !['death','jump'].includes(state);
      const directions=['N','NE','E','SE','S','SW','W','NW'];
      const angle=(Math.atan2(move.localX||0,move.localZ??1)+Math.PI*2)%(Math.PI*2),sector=angle/(Math.PI/4),index=Math.floor(sector),mix=sector-index;
      let names,weight;
      if (moving) {const prefix=state==='crouch'?'CrouchWalk':state==='walk'?'Walk':'Run';names=[prefix+directions[index]+'_LB',prefix+directions[(index+1)%8]+'_LB'];weight=mix;}
      else {names=[{death:'DeathSplat',jump:'Jump_LB',crouch:'CrouchIdle_LB',idle:'Idle_LB'}[state]||'Idle_LB'];weight=0;}
      const first=agentVisual.groups.get(names[0])||agentVisual.groups.get('Idle_LB'),second=agentVisual.groups.get(names[1]);
      if (first) {
        const pose=agentPoseSnapshot(first,agentFrame(first,state==='death'?now-agentState.deathAt:now,state!=='death'));
        if (second) {
          const other=agentPoseSnapshot(second,agentFrame(second,now));
          for (const [node,value] of pose) {const b=other.get(node);if (!b) continue;BABYLON.Vector3.LerpToRef(value.position,b.position,weight,node.position);if (value.rotation&&b.rotation) BABYLON.Quaternion.SlerpToRef(value.rotation,b.rotation,weight,node.rotationQuaternion);}
        }
        if (state!==agentVisual.state) {agentVisual.transitionPose=agentCopyPose(agentVisual.lastPose,agentVisual.transitionPose);agentVisual.transition={start:now,pose:agentVisual.transitionPose};agentVisual.state=state;}
        if (agentVisual.transition) {
          const t=Math.min(1,(now-agentVisual.transition.start)/120);
          for (const [node,value] of agentVisual.transition.pose) {BABYLON.Vector3.LerpToRef(value.position,node.position,t,node.position);if (value.rotation&&node.rotationQuaternion) BABYLON.Quaternion.SlerpToRef(value.rotation,node.rotationQuaternion,t,node.rotationQuaternion);}
          if (t>=1) agentVisual.transition=null;
        }
        agentVisual.lastPose=agentCapturePose(first,agentVisual.lastPose);
        if(state!=='death')bodyUpperPose(agentVisual,{action:agentVisual.bodyAction,slot:agentState.equipped,weapon:weaponState.current,reloading:weaponState.reloading,reloadClip:weaponState.reloadClip,reloadStarted:weaponState.reloadStarted,ads:weaponState.ads,crouching:move.crouching,yaw:camera.rotation.y,pitch:camera.rotation.x},now);
      }
    }
  }
  const action=agentVisual.action,group=action&&agentVisual.fpGroups.get(action.name);
  let actionPlaying=false;
  if (group) {
    const frame=action.duration ? group.from+(group.to-group.from)*Math.min(1,(now-action.start)/action.duration) : agentFrame(group,now-action.start,false);
    group.goToFrame(frame);actionPlaying=frame<group.to;
    if (!actionPlaying) agentVisual.action=null;
  } else if (action) agentVisual.action=null;
  if (agentVisual.fpRoot) {
    const dead=VS.player.hp<=0,ability=agentState.equipped;
    const resurrectionVisible=!!agentVisual.resurrection && agentResurrectionActive(now);
    agentVisual.fpRoot.setEnabled(!agentVisual.third && !resurrectionVisible && !dead);
    if (agentVisual.resurrection) {
      agentVisual.resurrection.root.setEnabled(!agentVisual.third && resurrectionVisible);
      const phase=agentState.resurrectAt>now?'X_cast':agentState.intangibleUntil<=now?'outro':move.hSpeed>.1?(move.speedPct>.85?'run':'walk'):'idle';
      const group=agentVisual.resurrection.groups.get(phase);
      if (resurrectionVisible && group) group.goToFrame(agentFrame(group,phase==='outro'?now-agentState.intangibleUntil:now-agentVisual.resurrectionStarted,!['X_cast','outro'].includes(phase)));
    }
    if (!actionPlaying && ability) {
      const idle=agentVisual.fpGroups.get(ability+'_idle')||agentVisual.fpGroups.get(ability+'_equip');
      if (idle) idle.goToFrame(idle.name.endsWith('_equip')?idle.to:agentFrame(idle,now));
    } else if (!actionPlaying && typeof weaponRigRest!=='undefined' && weaponAssetContainer) {
      for (const {node} of weaponRigRest) {
        if (!node.name.startsWith('arms_')) continue;
        const name=node.name==='arms_camera_inverse'?'camera_compensation':node.name.substring(5),target=agentVisual.fpNodes.get(name);
        if (target) {target.position.copyFrom(node.position);if (target.rotationQuaternion&&node.rotationQuaternion) target.rotationQuaternion.copyFrom(node.rotationQuaternion);}
      }
    }
    if (typeof weaponModel!=='undefined' && weaponModel) weaponModel.setEnabled(!agentVisual.third && !dead && !ability && !actionPlaying && !agentWeaponHidden(now) && !(typeof matchMovementBlocked==='function'&&matchMovementBlocked()) && !(weaponState.ads&&weaponDef().class==='sniper'));
    agentHideWeaponArms();
  }
  if (agentState.equipped==='X' && VS.player.agent==='Jett') agentRenderKnives();
  else agentVisual.knives?.setEnabled(false);
  agentThirdGunUpdate();agentHeldEffectUpdate();
  bodySkillProps(agentVisual,{visible:agentVisual.third&&!ghostActive,agent:VS.player.agent,hp:VS.player.hp,slot:agentState.equipped,action:agentVisual.bodyAction,knives:agentState.knives,yaw:camera.rotation.y,pitch:camera.rotation.x},now);
  agentMeddleViewUpdate(now);agentRuseViewUpdate(now);if(typeof matchPlayerChannelPose==='function')matchPlayerChannelPose(now);
}
function agentResurrectionActive(now=agentNow()) {
  return VS.player.agent==='Clove' && (agentState.resurrectAt>0 || (agentState.intangibleUntil>0 &&
    now<agentState.intangibleUntil+agentConfig().X.reequip));
}
function agentWeaponHidden(now=agentNow()) {
  if(typeof matchActive==='function'&&matchActive()&&matchState?.rules?.spike?.channel?.actor===matchState.human)return true;
  return VS.player.agent==='Clove' && (agentResurrectionActive(now) ||
    (agentVisual.action?.name==='C_cast' && agentState.lockUntil>now));
}
function agentDisposeThirdGun() {
  agentVisual.thirdGun?.dispose(false,false);agentVisual.thirdGun=null;
  agentVisual.thirdGunProp=null;agentVisual.gunName=null;agentVisual.gunLoading=null;
}
function agentThirdGunUpdate() {
  if(!agentVisual.third||!agentVisual.bodyRoot){agentVisual.thirdGun?.setEnabled(false);return;}
  const name=weaponState.current,hand=agentVisual.nodes.get('R_WeaponPoint')||agentVisual.nodes.get('R_Hand');
  if(!hand)return;
  if(agentVisual.gunName!==name&&agentVisual.gunLoading!==name){
    const version=agentVisual.version;agentVisual.gunLoading=name;agentVisual.thirdGun?.setEnabled(false);
    const key='prop_'+name.toLowerCase(),ready=botAssets.get(key);
    Promise.resolve(ready||BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/match/',name.toLowerCase()+'.glb?v=48',scene)).then(container=>{
      if(scene.isDisposed){if(!ready)container.dispose();return;}
      botAssets.set(key,container);
      if(version!==agentVisual.version||weaponState.current!==name)return;
      agentDisposeThirdGun();const prop=matchProp(name,hand,.8);if(!prop)return;
      agentVisual.thirdGunProp=prop;agentVisual.thirdGun=prop.root;agentVisual.gunName=name;window.__renderOnce=true;
    }).catch(error=>{console.error('[third-person weapon]',name,error);}).finally(()=>{if(agentVisual.gunLoading===name)agentVisual.gunLoading=null;});
  }
  const action=agentVisual.bodyAction,clip=action&&bodyClip(agentVisual.groups,action.name),duration=action?.duration||(clip?(clip.to-clip.from)/(clip.targetedAnimations[0]?.animation.framePerSecond||30)*1000:0);
  const skill=action&&!action.name.startsWith('gun_')&&agentNow()<action.start+duration;
  agentVisual.thirdGun?.setEnabled(agentVisual.gunName===name&&VS.player.hp>0&&!agentState.equipped&&!skill&&!agentWeaponHidden());
  if(agentVisual.thirdGunProp)bodyWeaponPose(agentVisual.thirdGunProp,weaponState.reloading,agentNow()-weaponState.reloadStarted,agentVisual.bodyAction);
}
function agentHeldEffectUpdate() {
  if(VS.player.agent==='Clove'){agentVisual.heldEffect?.setEnabled(false);return;}
  const label=VS.player.agent==='Sage' && ['C','Q','E'].includes(agentState.equipped)?'orb':VS.player.agent==='Clove'&&agentState.equipped==='Q'?'butterfly':null;
  if (!label) {agentVisual.heldEffect?.setEnabled(false);return;}
  if (!agentVisual.heldEffect || agentVisual.heldEffect.isDisposed()) {
    const mesh=BABYLON.MeshBuilder.CreateSphere('held_ability',{diameter:.14,segments:8},scene);
    mesh.parent=camera;mesh.material=agentHeldMaterial(label);mesh.isPickable=false;mesh.renderingGroupId=1;
    agentVisual.heldEffect=mesh;agentAttachEffectModel(mesh,label,.18,{material:mesh.material});
  }
  const mesh=agentVisual.heldEffect;mesh.setEnabled(!agentVisual.third && VS.player.hp>0);
  const hand=agentVisual.fpNodes.get('R_WeaponMaster')||agentVisual.fpNodes.get('R_Hand');
  if (hand) {
    hand.computeWorldMatrix(true);let point=hand.getAbsolutePosition().clone();
    const left=VS.player.agent==='Sage'&&(agentVisual.fpNodes.get('L_WeaponMaster')||agentVisual.fpNodes.get('L_Hand'));
    if(left){left.computeWorldMatrix(true);point=BABYLON.Vector3.Lerp(point,left.getAbsolutePosition(),.5);}
    point=BABYLON.Vector3.TransformCoordinates(point,BABYLON.Matrix.Invert(camera.getWorldMatrix()));mesh.position.copyFrom(point);
  }
  else mesh.position.set(.1,-.12,.45);
  mesh.position.y+=Math.sin(agentNow()*.004)*.006;
  mesh.rotation.y=agentNow()*.0012;mesh.rotation.z=Math.sin(agentNow()*.005)*.12;
  agentHeldLayers(mesh,label);
}
async function agentAttachEffectModel(parent,label,size,options={}) {
  if (!label || !agentConfig()) return;
  let name=options.agent;for(let node=parent;!name&&node;node=node.parent)name=node.metadata?.skillAgent;
  name=name||VS.player.agent;
  const code=window.GAME_CONFIG['playable-agents'][name].code,filename=code+'-'+label+'.glb',version=agentVisual.version;
  const cache=typeof matchSkillAssets!=='undefined'&&matchSkillAssets.has(filename)?matchSkillAssets:agentVisual.effectAssets;
  let container=cache.get(filename);
  try {
    if (!container) {
      // Promise is shared so a five-knife volley never starts five loaders.
      container=BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/playable/',filename+'?v=27',scene);
      cache.set(filename,container);container=await container;
      if ((cache===agentVisual.effectAssets&&version!==agentVisual.version)||scene.isDisposed) {container.dispose();return;}
      cache.set(filename,container);
    } else container=await container;
    if (parent.isDisposed()||(cache===agentVisual.effectAssets&&version!==agentVisual.version)) return;
    const instance=container.instantiateModelsToScene(name=>'effect_'+name,false,{doNotInstantiate:true});
    const root=new BABYLON.TransformNode('effect_asset',scene);instance.rootNodes.forEach(node=>node.parent=root);
    if (label==='knife') {
      const before=root.getHierarchyBoundingVectors(true),extent=before.max.subtract(before.min);
      if (extent.y>extent.x && extent.y>extent.z) root.rotation.x=Math.PI/2;
      else if (extent.x>extent.z) root.rotation.y=-Math.PI/2;
      root.computeWorldMatrix(true);root.getChildMeshes().forEach(mesh=>mesh.computeWorldMatrix(true));
    }
    const bounds=root.getHierarchyBoundingVectors(true),extent=bounds.max.subtract(bounds.min),largest=Math.max(extent.x,extent.y,extent.z);
    if (largest>0) {
      root.scaling.setAll(size/largest);
      if (options.fit || label==='wall') {
        const target=options.fit?BABYLON.Vector3.FromArray(options.fit):parent.getBoundingInfo().boundingBox.extendSize.scale(2);
        root.scaling.set(target.x/Math.max(.001,extent.x),target.y/Math.max(.001,extent.y),target.z/Math.max(.001,extent.z));
      }
      root.position.copyFrom(bounds.min.add(bounds.max).scale(-.5).multiply(root.scaling));
    }
    root.parent=parent;root.getChildMeshes().forEach(mesh=>{
      let view=false;for(let node=parent;node;node=node.parent)if(node===camera||node.renderingGroupId===1||node.metadata?.viewmodel)view=true;
      mesh.isPickable=false;mesh.renderingGroupId=view?1:0;mesh.metadata={abilityVisual:true,viewmodel:view};
      // WorldGridMaterial is an Unreal editor placeholder, not the smoke shader.
      // Keep the colored runtime material when the mesh has no exported albedo.
      if (options.material || (mesh.material && (mesh.material.name==='WorldGridMaterial' ||
          (mesh.material.getClassName()==='PBRMaterial' && !mesh.material.albedoTexture)))) mesh.material=options.material||parent.material;
    });
    if(options.replace!==false)parent.visibility=0;
    parent.onDisposeObservable.add(()=>{instance.animationGroups.forEach(group=>group.dispose());instance.skeletons.forEach(skeleton=>skeleton.dispose());});
  } catch(error) {console.warn('[ability mesh]',filename,error.message);}
}
function agentRenderKnives() {
  if (!agentVisual.knives || agentVisual.knives.isDisposed()) {
    agentVisual.knives=new BABYLON.TransformNode('blade_storm_view',scene);agentVisual.knives.parent=camera;agentVisual.knifeMeshes=[];
    for (let i=0;i<5;i++) {
      const knife=BABYLON.MeshBuilder.CreateBox('blade',{width:.02,height:.025,depth:.2},scene);
      knife.parent=agentVisual.knives;knife.position.set((i-2)*.11,-.13+Math.abs(i-2)*.025,.42);
      knife.material=agentMaterial('knife_mat','#C6EDFF');knife.isPickable=false;knife.renderingGroupId=1;
      agentVisual.knifeMeshes.push(knife);agentAttachEffectModel(knife,'knife',.2);
    }
  }
  agentVisual.knives.setEnabled(!agentVisual.third && VS.player.hp>0);
  agentVisual.knifeMeshes.forEach((mesh,i)=>{
    mesh.setEnabled(i<agentState.knives);
    const angle=agentNow()*.0015+i*1.2566;
    mesh.position.set((i-2)*.105+Math.sin(angle)*.012,-.13+Math.abs(i-2)*.025+Math.cos(angle)*.014,.42+Math.sin(angle)*.015);
    mesh.rotation.z=Math.sin(angle)*.12;mesh.rotation.y=Math.sin(angle*.7)*.08;
  });
}
