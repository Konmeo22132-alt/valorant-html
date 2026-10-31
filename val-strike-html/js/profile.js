// Server-backed account cache. No user records or credentials in Web Storage.
window.VSAccount={user:null,csrf:null,room:null,
  hydrate(data){this.user=data.user;this.csrf=data.csrf;this.room=data.room||null;VSProfile.current={...VSProfile.defaults,...data.profile};VSProfile.records=data.history||[];VSProfile.data=data.data||{};return data;},
  async request(path,method='GET',body){const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-VS-CSRF':this.csrf||''}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok){if(response.status===401&&path!=='/api/login'){this.user=null;location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));}throw Error(value.error||'Không lưu được dữ liệu.');}return value;},
  async refresh(){const response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(response.status===401){this.user=null;return null;}if(!response.ok)throw Error('Không tải được tài khoản.');return this.hydrate(await response.json());},
  async login(username,password){return this.hydrate(await this.request('/api/login','POST',{username,password}));},
  async logout(){await this.request('/api/logout','POST',{});this.user=this.csrf=this.room=null;VSProfile.current={...VSProfile.defaults};VSProfile.records=[];VSProfile.data={};location.replace('/login');}
};
window.VSProfile={fpsOptions:[20,30,60,75,90,120,144,165,180,200,240],defaults:{name:'Đặc vụ',agent:'Clove',sensitivity:1,fps:240,crosshair:'#00ff41'},current:null,records:[],data:{},pending:Promise.resolve(),error:null,
  graphics(){const g=this.data.graphics||{};return{quality:['performance','balanced','high'].includes(g.quality)?g.quality:'balanced',resolution:['auto','100','85','75'].includes(String(g.resolution))?String(g.resolution):'auto'};},
  load(){return {...this.defaults,...this.current};},
  save(value){const p={...this.load(),...value};this.current=p;this.pending=this.pending.then(async()=>{try{const data=await VSAccount.request('/api/profile','PUT',value);this.current={...this.current,...data.profile};this.error=null;}catch(error){this.error=error;window.dispatchEvent(new CustomEvent('profile-error',{detail:error.message}));}});return p;},
  async flush(){await this.pending;if(this.error)throw this.error;},
  history(){return [...this.records];},
  async record(result){result={...result,id:result.id||'offline:'+crypto.randomUUID(),at:Date.now()};await VSAccount.request('/api/results','POST',result);this.records.unshift(result);},
  async saveData(value){const data=await VSAccount.request('/api/data','PUT',{...this.data,...value});this.data=data.data;return this.data;},
  apply(config){const p=this.load();VS.player.name=p.name;config.movement.lookSensitivity=.0021*p.sensitivity;config.performance.maxFPS=this.fpsOptions.includes(Number(p.fps))?Number(p.fps):240;document.documentElement.style.setProperty('--profile-crosshair',p.crosshair);}
};
window.ACCOUNT_READY=VSAccount.refresh();
