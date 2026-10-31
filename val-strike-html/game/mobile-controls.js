// Mobile touch adapter and account-backed HUD layout editor.
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('mode') !== 'mobile') return;
  const hud=document.getElementById('mobile-hud');if(!hud)return;
  document.documentElement.classList.add('mobile-mode');
  const state=window.__mobileInput={active:true,moveX:0,moveZ:0,crouch:false,walk:false,jumpRequested:false,jumpHeld:false};
  const look=window.__mobileLook={x:0,y:0},$=id=>document.getElementById(id),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const defaults={joystick:{x:15,y:78,scale:1},'fire-left':{x:34,y:76,scale:1},'fire-right':{x:89,y:71,scale:1},actions:{x:76,y:88,scale:1},abilities:{x:78,y:18,scale:1},weapons:{x:80,y:76,scale:1},ping:{x:8,y:12,scale:1}};
  const clone=o=>JSON.parse(JSON.stringify(o)),saved=window.VSProfile?.data?.mobile||{};
  let layout=clone(defaults),preset=['2finger','3finger','4finger'].includes(saved.preset)?saved.preset:'3finger',layoutScale=Number(saved.scale)||1;
  if(saved.controls&&typeof saved.controls==='object')for(const id of Object.keys(layout))if(saved.controls[id])layout[id]={...layout[id],...saved.controls[id]};
  let editing=false,selected='joystick',drag=null;
  function prevent(event){event.preventDefault();event.stopPropagation();}function ensurePlay(){if(!window.__gamePlaying)window.playerController?.resume?.();}
  function layoutNode(id){return document.querySelector(`[data-mobile-layout-id="${id}"]`);}
  function applyLayout(){for(const [id,value]of Object.entries(layout)){const node=layoutNode(id);if(!node)continue;node.style.left=`${value.x}%`;node.style.top=`${value.y}%`;node.style.right='auto';node.style.bottom='auto';node.style.transform=`translate(-50%,-50%) scale(${value.scale*layoutScale})`;node.classList.toggle('mobile-layout-selected',editing&&selected===id);}}
  function status(message){const node=$('mobile-layout-status');if(node)node.textContent=message;}
  function setEditor(value){editing=!!value;document.documentElement.classList.toggle('mobile-layout-editing',editing);$('mobile-layout-editor').hidden=!editing;$('mobile-layout-toggle').hidden=editing;applyLayout();}
  async function saveLayout(){try{await VSProfile.saveData({mobile:{preset,scale:layoutScale,controls:layout}});status('Đã lưu layout vào tài khoản.');}catch(error){status('Không lưu được: '+error.message);}}
  function resetLayout(){layout=clone(defaults);layoutScale=1;$('mobile-layout-scale').value='1';applyLayout();status('Đã đặt lại layout mặc định.');}
  const presetLayouts={'2finger':{...defaults,abilities:{x:83,y:18,scale:.9},actions:{x:77,y:89,scale:.9},'fire-left':{x:29,y:78,scale:.85}},'3finger':clone(defaults),'4finger':{...defaults,abilities:{x:72,y:16,scale:.85},actions:{x:84,y:84,scale:.85},'fire-left':{x:29,y:22,scale:.7},'fire-right':{x:91,y:65,scale:1.05}}};
  function usePreset(value){preset=value;layout=clone(presetLayouts[value]||defaults);applyLayout();}
  function editorDown(event){if(!editing)return;const node=event.target.closest?.('[data-mobile-layout-id]');if(!node)return;prevent(event);selected=node.dataset.mobileLayoutId;const rect=hud.getBoundingClientRect(),value=layout[selected];drag={id:selected,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,baseX:value.x,baseY:value.y,width:rect.width,height:rect.height};node.setPointerCapture?.(event.pointerId);applyLayout();}
  function editorMove(event){if(!drag||event.pointerId!==drag.pointer)return;prevent(event);layout[drag.id].x=clamp(drag.baseX+(event.clientX-drag.startX)/drag.width*100,2,98);layout[drag.id].y=clamp(drag.baseY+(event.clientY-drag.startY)/drag.height*100,2,98);applyLayout();}
  function editorUp(event){if(drag&&event.pointerId===drag.pointer)drag=null;}
  hud.addEventListener('pointerdown',editorDown,true);hud.addEventListener('pointermove',editorMove,true);hud.addEventListener('pointerup',editorUp,true);hud.addEventListener('pointercancel',editorUp,true);
  $('mobile-layout-toggle').addEventListener('pointerdown',event=>{prevent(event);setEditor(true);});
  document.querySelector('[data-mobile-editor="close"]').addEventListener('pointerdown',event=>{prevent(event);setEditor(false);});
  document.querySelector('[data-mobile-editor="reset"]').addEventListener('pointerdown',event=>{prevent(event);resetLayout();});
  document.querySelector('[data-mobile-editor="save"]').addEventListener('pointerdown',event=>{prevent(event);saveLayout();});
  $('mobile-layout-preset').value=preset;$('mobile-layout-preset').addEventListener('change',event=>usePreset(event.target.value));
  $('mobile-layout-scale').value=String(layoutScale);$('mobile-layout-scale').addEventListener('input',event=>{layoutScale=Number(event.target.value)||1;applyLayout();});
  const stickZone=$('mobile-joystick-zone'),stick=$('mobile-joystick-stick');let joystickPointer=null,lookPointer=null,lookLast=null;
  function joystick(event){const rect=stickZone.getBoundingClientRect(),radius=rect.width*.34,dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;state.moveX=clamp(dx*scale/radius,-1,1);state.moveZ=clamp(-dy*scale/radius,-1,1);stick.style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;}
  function resetJoystick(){joystickPointer=null;state.moveX=state.moveZ=0;stick.style.transform='translate(-50%,-50%)';}
  stickZone.addEventListener('pointerdown',event=>{if(editing)return;prevent(event);ensurePlay();joystickPointer=event.pointerId;stickZone.setPointerCapture?.(event.pointerId);joystick(event);});stickZone.addEventListener('pointermove',event=>{if(event.pointerId===joystickPointer&&!editing){prevent(event);joystick(event);}});['pointerup','pointercancel','lostpointercapture'].forEach(type=>stickZone.addEventListener(type,resetJoystick));
  const lookZone=$('mobile-look-zone');lookZone.addEventListener('pointerdown',event=>{if(editing)return;prevent(event);ensurePlay();lookPointer=event.pointerId;lookLast={x:event.clientX,y:event.clientY};lookZone.setPointerCapture?.(event.pointerId);});lookZone.addEventListener('pointermove',event=>{if(event.pointerId!==lookPointer||!lookLast||editing)return;prevent(event);look.x+=(event.clientX-lookLast.x)*.55;look.y+=(event.clientY-lookLast.y)*.55;lookLast={x:event.clientX,y:event.clientY};});function endLook(event){if(event.pointerId===lookPointer){lookPointer=null;lookLast=null;}}['pointerup','pointercancel','lostpointercapture'].forEach(type=>lookZone.addEventListener(type,endLook));
  function press(node,down,up){const start=event=>{if(editing)return;prevent(event);ensurePlay();node.classList.add('mobile-pressed');down(event);};const end=event=>{if(editing)return;prevent(event);node.classList.remove('mobile-pressed');up?.(event);};node.addEventListener('pointerdown',start);['pointerup','pointercancel','lostpointercapture'].forEach(type=>node.addEventListener(type,end));}
  function fireDown(){if(typeof weaponState==='undefined'||typeof weaponShoot!=='function')return;weaponState.shooting=!!weaponDef().auto;weaponShoot();}function fireUp(){if(typeof weaponState!=='undefined')weaponState.shooting=false;}
  document.querySelectorAll('[data-mobile-fire]').forEach(node=>press(node,fireDown,fireUp));
  const action={ads:{down:()=>typeof weaponToggleADS==='function'&&weaponToggleADS(true),up:()=>typeof weaponToggleADS==='function'&&weaponToggleADS(false)},reload:{down:()=>typeof weaponReload==='function'&&weaponReload()},jump:{down:()=>{state.jumpRequested=true;state.jumpHeld=true;},up:()=>{state.jumpHeld=false;}},crouch:{down:()=>{state.crouch=true;},up:()=>{state.crouch=false;}},walk:{down:()=>{state.walk=true;},up:()=>{state.walk=false;}}};
  document.querySelectorAll('[data-mobile-action]').forEach(node=>{const item=action[node.dataset.mobileAction];if(item)press(node,item.down,item.up);});document.querySelectorAll('[data-mobile-weapon]').forEach(node=>press(node,()=>typeof weaponSwitch==='function'&&weaponSwitch(node.dataset.mobileWeapon),null));
  document.querySelectorAll('[data-mobile-ability]').forEach(node=>press(node,()=>{const slot=node.dataset.mobileAbility;if(typeof agentEquip!=='function')return;agentEquip(slot);setTimeout(()=>{if(window.__gamePlaying&&typeof agentCast==='function'&&typeof agentState!=='undefined'&&agentState.equipped===slot)agentCast(false);},45);},null));
  $('mobile-ping').addEventListener('pointerdown',event=>{if(editing)return;prevent(event);const point=typeof agentAimGround==='function'?agentAimGround(100):null;if(point&&typeof uiSendPing==='function')uiSendPing('danger',point);});window.addEventListener('blur',()=>{resetJoystick();state.crouch=state.walk=state.jumpHeld=false;state.jumpRequested=false;if(typeof weaponState!=='undefined')weaponState.shooting=false;});
  applyLayout();hud.hidden=false;
})();
