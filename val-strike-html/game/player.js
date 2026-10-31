// Feet are authoritative; camera height and weapon sway never affect collisions.
let camera;
function initPlayer() {
  const canvas = document.getElementById('renderCanvas');
  const overlay = document.getElementById('loading-overlay');
  const mov = window.GAME_CONFIG.movement;
  const mobileMode = new URLSearchParams(location.search).get('mode') === 'mobile';
  window.__mobileMode = mobileMode;
  const crouchKeys = mov.crouchKeys || ['ControlLeft', 'ControlRight'];
  const lockedCrouchKeys = mov.lockedCrouchKeys || ['ControlLeft', 'ControlRight'];
  const controls = [...new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
    'KeyR', 'KeyF', 'KeyZ', 'KeyC', 'KeyQ', 'KeyE', 'KeyX', 'KeyV', 'KeyG', 'KeyH', 'KeyB', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Escape', ...crouchKeys, ...lockedCrouchKeys])];
  let keyboardLocked = false, keyboardRequestPending = false, keyboardLockVersion = 0;
  let playAttempt = 0, fullscreenStarting = false, disposed = false;
  let escapePracticeMenu = false;
  const container = document.getElementById('game-container');
  const fullscreenGate = uiCreateFullscreenPrompt();
  const gateMessage = document.getElementById('fullscreen-message');
  const fullscreenButtons = [document.getElementById('play-fullscreen'), document.getElementById('fullscreen-enter')].filter(Boolean);
  const fullscreenSupported = mobileMode || (!!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false && !!navigator.keyboard?.lock);
  function fullscreenReady() { return mobileMode ? !disposed && !document.hidden : (!disposed && !!document.fullscreenElement && keyboardLocked && !document.hidden && document.hasFocus?.() !== false); }
  function syncFullscreenGate(message) {
    // Production entry owns the first fullscreen gesture. Afterwards the
    // existing pause dialog is the sole place to resume fullscreen play.
    if(window.GameEntry){
      if(fullscreenGate)fullscreenGate.hidden=true;
      container.inert=false;
      const button=document.getElementById('play-fullscreen');
      if(button)button.textContent=document.fullscreenElement?'Tiếp tục chơi':'Vào toàn màn hình để chơi';
      return;
    }
    // ESC is the practice/pause shortcut. Keep its menu usable if a browser
    // still exits fullscreen for that key despite Keyboard Lock.
    const required = !document.fullscreenElement && !disposed && !escapePracticeMenu && !window.GameEntry?.pending;
    if (fullscreenGate) {
      const wasHidden = fullscreenGate.hidden;
      fullscreenGate.hidden = !required;
      container.inert = required;
      const footer = document.querySelector('footer.legal');if (footer) footer.inert = required;
      if (gateMessage) gateMessage.textContent = !fullscreenSupported
        ? 'Trình duyệt cần hỗ trợ toàn màn hình và Keyboard Lock để chơi với phím Ctrl.'
        : message || 'Game chỉ chạy trong toàn màn hình. C / Q / E / X: kỹ năng · Ctrl: cúi.';
      if (required && wasHidden && !document.hidden) document.getElementById('fullscreen-enter')?.focus({preventScroll:true});
    }
    const button = document.getElementById('play-fullscreen');
    if (button) button.textContent = document.fullscreenElement ? 'Tiếp tục chơi' : 'Vào toàn màn hình để chơi';
  }
  const controlsStatus = document.getElementById('controls-status');
  function updateControlsStatus(message) {
    if (mobileMode) { if (controlsStatus) controlsStatus.textContent = 'Mobile Mode · chạm và kéo để điều khiển'; return; }
    if (controlsStatus) controlsStatus.textContent = message || (keyboardLocked
      ? 'C / Q / E / X: kỹ năng • Ctrl: cúi • ESC: tạm dừng'
      : 'Nhấn nút tiếp tục và cho phép Keyboard Lock để dùng Ctrl an toàn.');
  }
  function releaseKeyboard() {
    keyboardLockVersion++;
    if (keyboardLocked || keyboardRequestPending) navigator.keyboard?.unlock?.();
    keyboardLocked = false; updateControlsStatus();
  }
  async function acquireKeyboard() {
    if (keyboardLocked) return true;
    if (keyboardRequestPending || !document.fullscreenElement || !navigator.keyboard?.lock) return false;
    const version = keyboardLockVersion;
    keyboardRequestPending = true;
    try {
      // Capture Escape too: while fullscreen, the first Escape must open the
      // in-game pause/practice menu instead of making the browser leave fullscreen.
      // ESC is handled by the game while this lock is active; pause deliberately
      // keeps the lock so the browser cannot process the same ESC as fullscreen-exit.
      await navigator.keyboard.lock(controls);
      if (version !== keyboardLockVersion || !document.fullscreenElement || document.hidden || disposed || scene.isDisposed) {
        navigator.keyboard.unlock(); return false;
      }
      keyboardLocked = true; updateControlsStatus(); return true;
    } catch (error) {
      if (version === keyboardLockVersion) updateControlsStatus('Chưa được cấp Keyboard Lock. Hãy cho phép browser sử dụng bàn phím rồi nhấn Tiếp tục chơi.');
      return false;
    } finally { keyboardRequestPending = false; }
  }
  async function startFullscreen() {
    if (fullscreenStarting || disposed) return false;
    if (mobileMode) { resume(); return true; }
    if (!fullscreenSupported) {syncFullscreenGate();updateControlsStatus('Trình duyệt chưa hỗ trợ toàn màn hình và Keyboard Lock.');return false;}
    fullscreenStarting = true;const attempt = ++playAttempt;
    fullscreenButtons.forEach(button => button.disabled = true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (attempt !== playAttempt || disposed || document.hidden || !document.fullscreenElement) return false;
      const locked = await acquireKeyboard();
      if (attempt !== playAttempt || !locked || !fullscreenReady()) return false;
      if (!resume()) return false;
      // Fullscreen/keyboard permission can consume the gesture; a canvas click
      // can acquire pointer lock with a fresh gesture if this request is denied.
      try { await canvas.requestPointerLock(); } catch (error) { updateControlsStatus('Bấm vào màn chơi để khóa chuột, hoặc giữ chuột giữa và kéo để nhìn quanh.'); }
      return true;
    } catch (error) {
      if (attempt === playAttempt) {updateControlsStatus('Chưa mở được toàn màn hình. Nhấn nút để thử lại.');syncFullscreenGate('Vui lòng cho phép toàn màn hình, rồi nhấn nút để thử lại.');}
      return false;
    } finally { fullscreenStarting = false;fullscreenButtons.forEach(button => button.disabled = !fullscreenSupported || disposed); }
  }
  let spawn = window.VS_SPAWN.clone();
  if (VSMaps.valid(MAP_MODE) && !window.__mapFallback) {
    try {
      const markers = VSProfile.data.markers||[];
      const saved = markers[markers.length - 1];
      const marker = saved && mapSavedMarker(saved);
      if (marker && ['x', 'y', 'z'].every(k => Number.isFinite(marker[k]))) {
        const hit = worldPick(new BABYLON.Vector3(marker.x, marker.y + 0.3, marker.z), BABYLON.Vector3.Down(), 1, true);
        if (hit && !worldPick(hit.pickedPoint.add(new BABYLON.Vector3(0, 0.05, 0)), BABYLON.Vector3.Up(), mov.standingHeight)) {
          spawn = hit.pickedPoint.add(new BABYLON.Vector3(0, mov.eyeHeight, 0));
        }
      }
    } catch (error) { console.warn('[player] ignored invalid spawn marker'); }
  }
  camera = new BABYLON.UniversalCamera('cam', spawn.clone(), scene);
  camera.rotation.y = window.VS_SPAWN_YAW || 0;
  camera.fov = mov.baseFov; camera.minZ = 0.03;
  camera.inputs.clear(); camera.applyGravity = false; camera.checkCollisions = false;
  scene.activeCamera = camera; canvas.tabIndex = 0;
  const feet = spawn.subtract(new BABYLON.Vector3(0, mov.eyeHeight, 0));
  const velocity = new BABYLON.Vector3(0, 0, 0), keys = Object.create(null);
  let playing = false, grounded = true, crouching = false, jumpRequested = false;
  let restorePointerAfterCursor = false;
  window.__agentCursorMode = false;
  let eyeHeight = mov.eyeHeight, landedUntil = 0, tagUntil = 0;
  let dashUntil = 0, dashVelocity = BABYLON.Vector3.Zero(),networkMotion=null;
  let predictedMotion=null;
  const prediction=()=>predictedMotion||(predictedMotion=new NetworkMotion(mov,worldPick,{feet,velocity},window.GAME_CONFIG.network?.tickRate||30));
  window.__gameTime = 0; window.__gamePlaying = false;
  const probes = [[0, 0], [mov.playerRadius * 0.65, 0], [-mov.playerRadius * 0.65, 0], [0, mov.playerRadius * 0.65], [0, -mov.playerRadius * 0.65]];

  function clearInput() {
    if(typeof matchState!=='undefined'){matchState.hold=false;matchState.orbChannel=null;}
    Object.keys(keys).forEach(key => delete keys[key]); jumpRequested = false;
    velocity.x = velocity.z = 0;
    if (typeof weaponClearInput === 'function') weaponClearInput();
    if (typeof agentClearInput === 'function') agentClearInput();
  }
  function pause(keepKeyboardLock = false) {
    window.VSChat?.close(false);
    playAttempt++;
    playing = false; window.__gamePlaying = false; clearInput();
    window.__agentCursorMode = false; restorePointerAfterCursor = false;
    if (typeof uiCloseAll === 'function') uiCloseAll(false);
    if (typeof agentCancelEquip === 'function') agentCancelEquip();
    if (!keepKeyboardLock || !document.fullscreenElement) releaseKeyboard();
    overlay.style.display = window.GameEntry?.pending ? 'none' : 'flex'; setLoadingText(escapePracticeMenu
      ? 'TẠM DỪNG — CÓ THỂ NẠP KỸ NĂNG; BẬT TOÀN MÀN HÌNH ĐỂ TIẾP TỤC'
      : document.fullscreenElement ? 'TẠM DỪNG — NHẤN TIẾP TỤC CHƠI' : 'VUI LÒNG BẬT TOÀN MÀN HÌNH ĐỂ CHƠI');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    syncFullscreenGate('Game đã tạm dừng. Vui lòng bật lại toàn màn hình để tiếp tục.');
    window.__renderOnce = true;
  }
  function resume() {
    if(window.GameEntry?.pending)return false;
    if (!fullscreenReady()) {syncFullscreenGate();return false;}
    if ((typeof matchState !== 'undefined' && matchState.loading) || document.getElementById('match-roster')?.hidden === false) {
      syncFullscreenGate();overlay.style.display = 'flex';return false;
    }
    if (playing) return true;
    clearInput(); playing = true; escapePracticeMenu = false; window.__gamePlaying = true;
    syncFullscreenGate();overlay.style.display = 'none'; canvas.focus();
    if (!window.__weaponsReady) { weaponInit(); window.__weaponsReady = true; }
    window.__renderOnce = true;
    return true;
  }
  async function startPlay() {
    if(window.GameEntry?.pending)return;
    if (window.__agentCursorMode) return;
    if ((typeof matchState !== 'undefined' && matchState.loading) || document.getElementById('match-roster')?.hidden === false) return;
    if (mobileMode) { resume(); return true; }
    if (!fullscreenReady()) return startFullscreen();
    if (playing && document.pointerLockElement === canvas) return;
    const attempt = playAttempt;
    try {
      await canvas.requestPointerLock();
      if (attempt === playAttempt && document.pointerLockElement === canvas) resume();
    } catch (error) { updateControlsStatus('Chưa khóa được chuột. Bấm lại vào màn chơi hoặc giữ chuột giữa để nhìn quanh.'); }
  }
  canvas.addEventListener('click', startPlay);
  overlay.addEventListener('click', event => { if (!event.target.closest('a,button,input,select,option,label')) startPlay(); });
  fullscreenButtons.forEach(button => {button.disabled = !fullscreenSupported;button.addEventListener('click', startFullscreen);});
  updateControlsStatus();
  document.addEventListener('fullscreenchange', () => {if (disposed) return;if (!document.fullscreenElement) pause();else syncFullscreenGate();});
  scene.onDisposeObservable.add(() => {disposed = true;playAttempt++;playing = false;window.__gamePlaying = false;clearInput();releaseKeyboard();syncFullscreenGate();fullscreenButtons.forEach(button => button.disabled = true);});
  window.addEventListener('pagehide', pause);
  document.getElementById('respawn-player')?.addEventListener('click', respawn);
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) resume();
    else if (playing && !window.__agentCursorMode) pause();
  });
  document.addEventListener('pointerlockerror', () => updateControlsStatus('Bấm vào màn chơi để khóa chuột, hoặc giữ chuột giữa và kéo để nhìn quanh.'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
  document.addEventListener('pointermove', event => {
    if (!playing || window.__agentCursorMode || (typeof uiInputBlocked==='function'&&uiInputBlocked()) || (document.pointerLockElement !== canvas && !(event.buttons & 4))) return;
    const lookCamera=typeof matchSpectatorActive==='function'&&matchSpectatorActive()?deathSpectator.camera:camera;
    lookCamera.rotation.y += (event.movementX || 0) * mov.lookSensitivity;
    lookCamera.rotation.x = Math.max(-1.55, Math.min(1.55, lookCamera.rotation.x + (event.movementY || 0) * mov.lookSensitivity));
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && playing) { event.preventDefault(); escapePracticeMenu = true; pause(true); return; }
    if (event.code === 'Escape' && !playing && keyboardLocked && document.fullscreenElement) {
      event.preventDefault();
      document.exitFullscreen?.().catch?.(() => {});
      return;
    }
    if (!playing || !controls.includes(event.code) || event.target.matches?.('input,select,textarea,[contenteditable="true"]')) return;
    if (lockedCrouchKeys.includes(event.code) && !keyboardLocked) return;
    event.preventDefault();
    if (event.code === 'Space' && !keys.Space && !event.repeat) jumpRequested = true;
    keys[event.code] = true;
  });
  window.addEventListener('keyup', event => { delete keys[event.code]; });

  function canStand(x = feet.x, z = feet.z) {
    return !probes.some(([px, pz]) => worldPick(new BABYLON.Vector3(x + px, feet.y + 0.05, z + pz), BABYLON.Vector3.Up(), mov.standingHeight));
  }
  function speed() {
    const weapon = typeof weaponState !== 'undefined' ? weaponState.current : 'Classic';
    const max = mov.speedByWeaponClass[mov.classByWeapon[weapon] || 'pistol'];
    let value = max;
    if (keys.ShiftLeft || keys.ShiftRight || window.__mobileInput?.walk) value *= mov.walkMultiplier;
    if (crouching) value *= mov.crouchMultiplier;
    if (typeof weaponState !== 'undefined' && weaponState.ads) value *= mov.adsSpeedMult[weapon] || 1;
    if (window.__gameTime < tagUntil) value *= 1 - mov.tag.slowPct;
    value *= typeof agentSpeedMultiplier === 'function' ? agentSpeedMultiplier(feet) : 1;
    return { max, value };
  }
  function moveAxis(axis, displacement, height) {
    actorMoveAxis({feet,velocity},axis,displacement,height,worldPick,mov);
  }
  function floorAt(length) {
    return actorFloorAt(feet,length,worldPick,mov);
  }
  function respawn() {
    if(typeof matchActive==='function'&&matchActive())return;
    if (typeof agentRespawn === 'function') agentRespawn();
    dashUntil = 0;
    feet.copyFrom(spawn).y -= mov.eyeHeight; velocity.setAll(0);
    eyeHeight = mov.eyeHeight; crouching = false; grounded = true; clearInput();
    camera.position.copyFrom(spawn); camera.rotation.set(0, window.VS_SPAWN_YAW || 0, 0); window.__renderOnce = true;
  }
  scene.onBeforeRenderObservable.add(() => {
    if (!playing) return;
    if (!fullscreenReady()) {pause();return;}
    const dt = window.__frameDT || 1 / 30;
    const mobileLook = window.__mobileLook;
    if (mobileLook && (mobileLook.x || mobileLook.y)) {
      camera.rotation.y += mobileLook.x * mov.lookSensitivity;
      camera.rotation.x = Math.max(-1.55, Math.min(1.55, camera.rotation.x + mobileLook.y * mov.lookSensitivity));
      mobileLook.x = 0; mobileLook.y = 0;
    }
    if(typeof multiplayerActive!=='function'||!multiplayerActive())window.__gameTime += dt * 1000;
    if(typeof matchSpectatorUpdate==='function')matchSpectatorUpdate(dt,keys);
    if (VS.player.hp <= 0 || (typeof agentState !== 'undefined' && agentState.resurrectAt > window.__gameTime)) { jumpRequested=false;velocity.setAll(0);window.__moveState = { hSpeed: 0, speedPct: 0, grounded: true, crouching: false }; return; }
    // NetworkMotion advances fixed input ticks and reconciles acknowledgments.
    // Local per-render physics must not integrate the same tick again.
    if(typeof multiplayerActive==='function'&&multiplayerActive()) {
      jumpRequested=false;
      return;
    }
    if(typeof matchMovementBlocked==='function'&&matchMovementBlocked()){velocity.setAll(0);jumpRequested=false;window.__moveState={hSpeed:0,speedPct:0,grounded,crouching};return;}
    const mobile = window.__mobileInput || {};
    crouching = crouchKeys.some(code => keys[code]) || (keyboardLocked && lockedCrouchKeys.some(code => keys[code])) || !!mobile.crouch || (crouching && !canStand());
    const bodyHeight = crouching ? mov.crouchHeight : mov.standingHeight;
    const targetEye = crouching ? mov.crouchEyeHeight : mov.eyeHeight;
    eyeHeight += (targetEye - eyeHeight) * Math.min(1, dt * 16);
    if (crouching) eyeHeight = Math.min(eyeHeight, bodyHeight - 0.02);
    const currentSpeed = speed();
    const yaw = camera.rotation.y;
    let x = mobile.active ? Number(mobile.moveX || 0) : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let z = mobile.active ? Number(mobile.moveZ || 0) : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const magnitude = Math.hypot(x, z);
    if (magnitude) { x /= magnitude; z /= magnitude; }
    const wishX = (Math.cos(yaw) * x + Math.sin(yaw) * z) * currentSpeed.value;
    const wishZ = (Math.cos(yaw) * z - Math.sin(yaw) * x) * currentSpeed.value;
    const deltaX = wishX - velocity.x, deltaZ = wishZ - velocity.z;
    const difference = Math.hypot(deltaX, deltaZ), change = (magnitude ? mov.acceleration : mov.deceleration) * dt;
    const ratio = difference ? Math.min(1, change / difference) : 0;
    velocity.x += deltaX * ratio; velocity.z += deltaZ * ratio;
    if (window.__gameTime < dashUntil) { velocity.x = dashVelocity.x; velocity.z = dashVelocity.z; }
    if (mobile.jumpRequested) { jumpRequested = true; mobile.jumpRequested = false; }
    if (jumpRequested && grounded) { velocity.y = mov.jumpSpeed; grounded = false; }
    jumpRequested = false;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), subDT = dt / steps;
    let distanceMoved = 0;
    for (let step = 0; step < steps; step++) {
      const previousX = feet.x, previousZ = feet.z;
      moveAxis('x', velocity.x * subDT, bodyHeight); moveAxis('z', velocity.z * subDT, bodyHeight);
      distanceMoved += Math.hypot(feet.x - previousX, feet.z - previousZ);
      velocity.y = Math.max(-mov.terminalVelocity, velocity.y + mov.gravity * subDT);
      if (VS.player.agent === 'Jett' && (keys.Space || mobile.jumpHeld) && velocity.y < -2 && !grounded && window.__gameTime >= (VS.player.suppressedUntil || 0)) velocity.y = -2;
      let dy = velocity.y * subDT;
      if (dy > 0) {
        for (const [x, z] of probes) {
          const hit = worldPick(new BABYLON.Vector3(feet.x + x, feet.y + bodyHeight - 0.01, feet.z + z), BABYLON.Vector3.Up(), dy + 0.02);
          if (hit) { dy = Math.min(dy, Math.max(0, hit.distance - 0.02)); velocity.y = 0; }
        }
      }
      const floor = floorAt(mov.stepHeight + 0.15 + Math.max(0, -dy));
      const nextY = feet.y + dy;
      if (velocity.y <= 0 && floor !== null && nextY <= floor + (grounded ? 0.12 : 0.005)) {
        if (!grounded) landedUntil = window.__gameTime + mov.landSpread.duration * 1000;
        feet.y = floor; velocity.y = 0; grounded = true;
      } else { feet.y = nextY; grounded = false; }
    }
    if (feet.y < spawn.y - 35) {
      if (typeof agentDie === 'function') agentDie('fall'); else respawn();
    }
    camera.position.set(feet.x, feet.y + eyeHeight, feet.z);
    const hSpeed = distanceMoved / dt;
    window.__moveState = { hSpeed, maxMs: currentSpeed.max, speedPct: hSpeed / currentSpeed.max, grounded, crouching,
      landing: window.__gameTime < landedUntil, localX: x, localZ: z, yaw, pitch: camera.rotation.x };
  });
  window.playerController = { pause, resume, respawn, startFullscreen,
    networkReset:state=>{prediction().reset(state);networkMotion=state;dashUntil=0;camera.position.set(feet.x,feet.y+eyeHeight,feet.z);},
    networkReconcile:state=>{prediction().reconcile(state);networkMotion=state;},
    networkPredict:input=>prediction().predict(input),
    networkRender:(alpha,dt)=>{
      if(!predictedMotion?.ready)return;const actor=predictedMotion.actor,point=predictedMotion.render(alpha,dt);
      crouching=actor.crouching;grounded=actor.grounded;eyeHeight+=((crouching?mov.crouchEyeHeight:mov.eyeHeight)-eyeHeight)*Math.min(1,dt*16);
      camera.position.set(point.x,point.y+eyeHeight,point.z);
      const hSpeed=Math.hypot(velocity.x,velocity.z),max=mov.speedByWeaponClass[mov.classByWeapon[networkMotion?.weapon||weaponState.current]||'pistol'];
      window.__moveState={hSpeed,maxMs:max,speedPct:hSpeed/max,grounded,crouching,landing:false,localX:velocity.x*Math.cos(camera.rotation.y)-velocity.z*Math.sin(camera.rotation.y),localZ:velocity.x*Math.sin(camera.rotation.y)+velocity.z*Math.cos(camera.rotation.y),yaw:camera.rotation.y,pitch:camera.rotation.x};
    },
    presentGame:()=>{overlay.style.display='none';syncFullscreenGate();if(fullscreenReady())startPlay();else pause();window.__renderOnce=true;},
    cursorMode: (enabled,restoreAllowed=true) => {
      if (enabled) {
        if (window.__agentCursorMode) return;
        restorePointerAfterCursor=document.pointerLockElement===canvas;
        window.__agentCursorMode=true;clearInput();
        if (restorePointerAfterCursor) document.exitPointerLock();
      } else {
        const restore=window.__agentCursorMode && restorePointerAfterCursor;
        window.__agentCursorMode=false;restorePointerAfterCursor=false;
        canvas.focus();
        // Called from the map click / weapon key, retaining user activation.
        if (restore && playing && restoreAllowed && fullscreenReady()) {
          try {Promise.resolve(canvas.requestPointerLock()).catch(()=>updateControlsStatus('Bấm vào màn chơi để khóa chuột lại.'));}
          catch (error) {updateControlsStatus('Bấm vào màn chơi để khóa chuột lại.');}
        }
      }
    },
    impulse: y => { velocity.y = y; grounded = false; },
    dash: (direction, speed, duration) => { dashVelocity.copyFrom(direction).scaleInPlace(speed); dashUntil = window.__gameTime + duration; },
    teleport: point => { feet.copyFrom(point); velocity.setAll(0); dashUntil = 0; camera.position.set(feet.x, feet.y + eyeHeight, feet.z); },
    syncPosition: (point,state) => { networkMotion=state||networkMotion;feet.copyFrom(point); velocity.setAll(0); dashUntil = 0; camera.position.set(feet.x, feet.y + eyeHeight, feet.z); },
    correct: delta => { feet.addInPlace(delta); camera.position.set(feet.x,feet.y+eyeHeight,feet.z); },
    stop: clearInput,
    tag: () => { tagUntil = window.__gameTime + mov.tag.decaySec * 1000; },
    getState: () => ({ playing, grounded, crouching, keyboardLocked, feet: feet.asArray(), velocity: velocity.asArray(), eyeHeight, keys: Object.keys(keys) }) };
  uiHUDInject(); uiHUDUpdate(); setLoadingText('SẴN SÀNG — VÀO TOÀN MÀN HÌNH ĐỂ CHƠI');syncFullscreenGate();window.__renderOnce = true;
  if (typeof agentInit === 'function') agentInit();
  if (typeof matchInit === 'function') matchInit();
}
