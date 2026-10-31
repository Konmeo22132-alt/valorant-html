// At most one asset load in flight and one active gun. Switching disposes GPU resources.
let weaponAssetContainer = null, weaponAssetVersion = 0, weaponAssetLoading = false;
let weaponAnimationGroups = [], weaponRigRest = [], weaponAnimation = null;
let weaponLoopAnimation = null, weaponLoopBlend = null;
function weaponDisposeAsset() {
  if (typeof agentDisposeThirdGun === 'function') agentDisposeThirdGun();
  if (typeof weaponClearSkin === 'function') weaponClearSkin();
  weaponAnimation = null; weaponLoopAnimation = null; weaponLoopBlend = null;
  weaponAnimationGroups = []; weaponRigRest = [];
  if (weaponAssetContainer) { weaponAssetContainer.dispose(); weaponAssetContainer = null; }
}
function weaponRequestAsset() {
  weaponAssetVersion++;
  window.__viewmodelStatus = { weapon: weaponState.current, state: weaponDef().model ? 'loading' : 'placeholder' };
  if (new URLSearchParams(location.search).get('models') === '0' || weaponAssetLoading) return;
  weaponLoadAsset();
}
async function weaponLoadAsset() {
  weaponAssetLoading = true;
  let version;
  try {
    do {
      version = weaponAssetVersion;
      const name = weaponState.current, model = weaponDef(name).model;
      if (!model) break;
      window.__viewmodelStatus = { weapon: name, state: 'loading' };
      const container = await BABYLON.SceneLoader.LoadAssetContainerAsync('/assets/weapons/', model.file, scene);
      if (version !== weaponAssetVersion || scene.isDisposed) { container.dispose(); continue; }
      weaponDisposeAsset();
      if (weaponModel) weaponModel.dispose(false, true);
      weaponModel = new BABYLON.TransformNode('viewmodel_root', scene);
      weaponModel.parent = camera; weaponModel.position.set(0, 0, 0);
      container.addAllToScene();
      container.rootNodes.forEach(node => { node.parent = weaponModel; });
      weaponModel.rotation.y = model.yaw;
      weaponModel.scaling.setAll(model.scale);
      container.meshes.forEach(mesh => {
        mesh.isPickable = false; mesh.checkCollisions = false;
        mesh.metadata = { ...mesh.metadata, viewmodel: true };
        mesh.renderingGroupId = 1; mesh.alwaysSelectAsActiveMesh = true;
      });
      weaponAssetContainer = container; weaponAnimationGroups = container.animationGroups;
      weaponAnimationGroups.forEach(group => group.stop());
      weaponRigRest = container.transformNodes.map(node => ({ node,
        position: node.position.clone(), rotation: node.rotationQuaternion?.clone(), scaling: node.scaling.clone() }));
      window.__viewmodelStatus = { weapon: name, state: 'ready', animations: weaponAnimationGroups.map(group => group.name) };
      if (typeof weaponApplySkin === 'function') weaponApplySkin();
      if (weaponState.reloading) weaponPlayAnimation(weaponState.reloadClip || 'reload', weaponState.reloadDuration, weaponState.reloadStarted);
      else if (weaponNow() < weaponState.equipUntil) weaponPlayAnimation('equip', weaponDef().equipTime, weaponState.equipUntil - weaponDef().equipTime);
      weaponToggleADS(weaponState.ads);
      weaponUpdateAnimation();
      window.__renderOnce = true;
    } while (version !== weaponAssetVersion);
  } catch (error) {
    window.__viewmodelStatus = { weapon: weaponState.current, state: 'fallback', error: String(error.message || error) };
    console.warn('[viewmodel] using placeholder', error);
  } finally {
    weaponAssetLoading = false;
    if (version !== weaponAssetVersion) weaponLoadAsset();
  }
}
function weaponResetRig() {
  weaponLoopAnimation = null; weaponLoopBlend = null;
  weaponAnimationGroups.forEach(group => group.stop());
  weaponRigRest.forEach(({ node, position, rotation, scaling }) => {
    node.position.copyFrom(position); node.scaling.copyFrom(scaling);
    if (rotation) node.rotationQuaternion.copyFrom(rotation);
  });
}
function weaponPlayAnimation(kind, durationOverride, startOverride) {
  const group = (kind === 'fire' && weaponState.ads && weaponAnimationGroups.find(animation => animation.name === 'fireads'))
    || weaponAnimationGroups.find(animation => animation.name === kind);
  if (!group) return;
  weaponResetRig();
  const def = weaponDef();
  const nativeDuration = (group.to - group.from) / group.targetedAnimations[0].animation.framePerSecond * 1000;
  const duration = durationOverride || (kind === 'reload' ? def.reloadTime : kind === 'equip' ? def.equipTime : kind === 'inspect' ? nativeDuration : weaponFireDelay());
  group.start(false); group.pause(); group.goToFrame(group.from);
  weaponAnimation = { group, start: startOverride ?? weaponNow(), duration: Math.max(1, duration) };
  weaponUpdateAnimation();
}
function weaponUpdateAnimation() {
  if (weaponAnimation) {
    const { group, start, duration } = weaponAnimation;
    const progress = Math.max(0, Math.min(1, (weaponNow() - start) / duration));
    group.goToFrame(group.from + (group.to - group.from) * progress);
    if (progress < 1) return;
    // Blend from the action's last pose back to the selected holding loop.
    weaponAnimation = null; weaponLoopAnimation = null;
  }
  const movement = window.__moveState || {};
  const kind = weaponState.ads ? 'ads' : movement.grounded && movement.hSpeed > 0.1
    ? (movement.speedPct > 0.85 ? 'run' : 'walk') : 'idle';
  const group = weaponAnimationGroups.find(animation => animation.name === kind)
    || weaponAnimationGroups.find(animation => animation.name === 'idle');
  if (!group) return;
  if (weaponLoopAnimation?.group !== group) {
    const pose = weaponRigRest.map(({ node }) => ({ node, position: node.position.clone(), rotation: node.rotationQuaternion?.clone() }));
    weaponResetRig();
    group.start(false); group.pause();
    const duration = (group.to - group.from) / group.targetedAnimations[0].animation.framePerSecond * 1000;
    weaponLoopAnimation = { group, start: weaponNow(), duration: Math.max(1, duration) };
    weaponLoopBlend = { start: weaponNow(), pose };
  }
  const loop = weaponLoopAnimation;
  group.goToFrame(group.from + (group.to - group.from) * ((weaponNow() - loop.start) % loop.duration) / loop.duration);
  if (weaponLoopBlend) {
    const progress = Math.min(1, (weaponNow() - weaponLoopBlend.start) / 120);
    for (const { node, position, rotation } of weaponLoopBlend.pose) {
      BABYLON.Vector3.LerpToRef(position, node.position, progress, node.position);
      if (rotation) BABYLON.Quaternion.SlerpToRef(rotation, node.rotationQuaternion, progress, node.rotationQuaternion);
    }
    if (progress >= 1) weaponLoopBlend = null;
  }
}
