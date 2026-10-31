(()=>{
  const paths=new Set(['/','/login','/play','/agents','/collection','/career','/settings']);let version=0;
  VS.navigate=async function(path,replace=false){if(path==='/game'){location.assign('/game/game.html?map=abyss');return;}if(!paths.has(path))path='/';const turn=++version;
    window.VSMenu?.dispose();window.__agentViewers?.forEach(v=>v.dispose());
    if(replace)history.replaceState({},'',path+(path===location.pathname?location.search:''));else if(location.pathname!==path)history.pushState({},'',path);
    const app=document.getElementById('app');app.setAttribute('aria-busy','true');
    try{await ACCOUNT_READY;if(turn!==version)return;
      if(!VSAccount.user){if(path!=='/login')history.replaceState({},'','/login?next='+encodeURIComponent(path));renderLogin(app);return;}
      if(path==='/login'){location.replace(loginNext());return;}
      const res=await fetch('/screens/main-menu.html?v=42');if(!res.ok)throw Error('Không tải được menu.');const html=await res.text();if(turn!==version)return;app.innerHTML=html;await VSMenu.mount(path,()=>turn===version);}
    catch(error){if(turn!==version)return;app.replaceChildren();const message=document.createElement('p');message.textContent=error.message;const retry=document.createElement('button');retry.textContent='Tải lại menu';retry.onclick=()=>{window.ACCOUNT_READY=VSAccount.refresh();VS.navigate(path,true);};app.append(message,retry);}
    finally{if(turn===version){app.removeAttribute('aria-busy');window.scrollTo(0,0);}}
  };
  function loginNext(){const next=new URLSearchParams(location.search).get('next')||'/';return /^\/(?:game\/game\.html(?:\?.*)?|play|agents|collection|career|settings)?$/.test(next)?next:'/';}
  function renderLogin(app){app.innerHTML=`<main class="login-screen"><div class="login-brand">VAL<span>STRIKE</span></div><form id="login-form" class="login-panel"><div class="eyebrow">CHÀO MỪNG TRỞ LẠI</div><h1>ĐĂNG NHẬP</h1><label class="menu-field">TÊN ĐĂNG NHẬP<input name="username" autocomplete="username" maxlength="32" required autofocus></label><label class="menu-field">MẬT KHẨU<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><p id="login-error" role="alert"></p><button class="menu-action">ĐĂNG NHẬP</button><p class="login-note">Tài khoản do quản trị viên cấp.<br>Đăng ký tài khoản đang đóng.</p></form></main>`;
    app.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=app.querySelector('#login-error');button.disabled=true;error.textContent='';try{await VSAccount.login(form.elements.username.value,form.elements.password.value);form.elements.password.value='';location.replace(loginNext());}catch(err){error.textContent=err.message;}finally{button.disabled=false;}};
  }
  window.addEventListener('popstate',()=>VS.navigate(location.pathname,true));
})();
