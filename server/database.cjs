'use strict';
const {DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const defaults={name:'Đặc vụ',agent:'Clove',sensitivity:1,fps:240,crosshair:'#00ff41'};
const mobileDefaults={preset:'3finger',scale:1,controls:{}};
function mobileSettings(value){
  const source=value&&typeof value==='object'?value:{};
  const preset=['2finger','3finger','4finger'].includes(source.preset)?source.preset:mobileDefaults.preset;
  const scale=Math.max(.75,Math.min(1.35,Number(source.scale)||1));
  const controls={};
  if(source.controls&&typeof source.controls==='object')for(const [id,item]of Object.entries(source.controls).slice(0,32)){
    if(!/^[a-z0-9-]{1,40}$/i.test(id)||!item||typeof item!=='object')continue;
    const x=Number(item.x),y=Number(item.y),itemScale=Number(item.scale);
    controls[id]={x:Number.isFinite(x)?Math.max(0,Math.min(100,x)):50,y:Number.isFinite(y)?Math.max(0,Math.min(100,y)):50,scale:Number.isFinite(itemScale)?Math.max(.65,Math.min(1.6,itemScale)):1};
  }
  return {preset,scale,controls};
}
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
const derive=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(key.toString('hex'))));
function profile(value,base=defaults){const p={...base};for(const k of Object.keys(defaults))if(value[k]!==undefined)p[k]=value[k];p.name=String(p.name).replace(/[\x00-\x1f<>]/g,'').trim().slice(0,24)||'Đặc vụ';if(!['Clove','Jett','Sage'].includes(p.agent))p.agent='Clove';p.sensitivity=Math.max(.2,Math.min(3,Number(p.sensitivity)||1));p.fps=[20,30,60,75,90,120,144,165,180,200,240].includes(Number(p.fps))?Number(p.fps):240;if(!/^#[0-9a-f]{6}$/i.test(p.crosshair))p.crosshair=defaults.crosshair;return p;}
class Store{
  constructor(file=process.env.DB_PATH||path.join(__dirname,'../data/val-strike.sqlite')){
    if(file!==':memory:')fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','player')),created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles(user_id INTEGER PRIMARY KEY REFERENCES users(id),settings TEXT NOT NULL,data TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,csrf TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results(user_id INTEGER NOT NULL REFERENCES users(id),result_id TEXT NOT NULL,at INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,result_id));
      CREATE TABLE IF NOT EXISTS room_sessions(user_id INTEGER PRIMARY KEY REFERENCES users(id),room_id TEXT NOT NULL,player_id TEXT NOT NULL,token TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS room_chat(id INTEGER PRIMARY KEY,room_key TEXT NOT NULL,room_id TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),player_id TEXT NOT NULL,sender TEXT NOT NULL,text TEXT NOT NULL,at INTEGER NOT NULL,client_id TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'all' CHECK(channel IN ('all','team')),team TEXT,UNIQUE(room_key,user_id,client_id));
      CREATE INDEX IF NOT EXISTS room_chat_history ON room_chat(room_key,id);
      CREATE TABLE IF NOT EXISTS room_chat_recipients(message_id INTEGER NOT NULL REFERENCES room_chat(id),user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(message_id,user_id));
      CREATE INDEX IF NOT EXISTS room_chat_recipient_history ON room_chat_recipients(user_id,message_id);`);
    const chatColumns=new Set(this.db.prepare('PRAGMA table_info(room_chat)').all().map(column=>column.name));
    if(!chatColumns.has('channel'))this.db.exec("ALTER TABLE room_chat ADD COLUMN channel TEXT NOT NULL DEFAULT 'all' CHECK(channel IN ('all','team'))");
    if(!chatColumns.has('team'))this.db.exec('ALTER TABLE room_chat ADD COLUMN team TEXT');
    this.chatInsert=this.db.prepare('INSERT INTO room_chat(room_key,room_id,user_id,player_id,sender,text,at,client_id,channel,team) VALUES(?,?,?,?,?,?,?,?,?,?)');
    this.chatRecipientInsert=this.db.prepare('INSERT OR IGNORE INTO room_chat_recipients(message_id,user_id) VALUES(?,?)');
    this.chatFind=this.db.prepare('SELECT id,player_id AS player,sender AS name,text,at,channel,team FROM room_chat WHERE room_key=? AND user_id=? AND client_id=?');
    this.chatRecent=this.db.prepare("SELECT id,player_id AS player,sender AS name,text,at,channel,team FROM room_chat WHERE room_key=? AND (channel='all' OR EXISTS(SELECT 1 FROM room_chat_recipients r WHERE r.message_id=room_chat.id AND r.user_id=?)) ORDER BY id DESC LIMIT 60");
    const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'bootstrap-admin.json'),'utf8'));
    if(!this.db.prepare('SELECT id FROM users WHERE username=?').get(seed.username)){
      this.db.exec('BEGIN');try{const result=this.db.prepare('INSERT INTO users(username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?)').run(seed.username,seed.hash,seed.salt,'admin',Date.now());this.db.prepare('INSERT INTO profiles(user_id,settings) VALUES(?,?)').run(result.lastInsertRowid,JSON.stringify({...defaults,name:seed.username}));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    }
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  }
  async login(username,password){const u=this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username||'').trim());const salt=u?.salt||'val-strike-login-dummy';const candidate=await derive(String(password||''),salt);if(!u||!crypto.timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(u.password_hash,'hex')))return null;
    const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex'),expires=Date.now()+14*86400000;
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),u.id,expires,csrf);return {token,expires,csrf,user:{id:u.id,username:u.username,role:u.role}};
  }
  session(req){const t=/(?:^|;\s*)vs_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];if(!t)return null;return this.db.prepare('SELECT u.id,u.username,u.role,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(t),Date.now());}
  revoke(s){this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);}
  userData(id){const p=this.db.prepare('SELECT settings,data FROM profiles WHERE user_id=?').get(id);return {profile:profile(JSON.parse(p.settings)),data:JSON.parse(p.data),history:this.db.prepare('SELECT payload FROM results WHERE user_id=? ORDER BY at DESC LIMIT 100').all(id).map(r=>JSON.parse(r.payload)),room:this.db.prepare('SELECT room_id AS room,player_id AS self,token FROM room_sessions WHERE user_id=?').get(id)||null};}
  saveProfile(id,value){const p=profile(value,this.userData(id).profile);this.db.prepare('UPDATE profiles SET settings=? WHERE user_id=?').run(JSON.stringify(p),id);return p;}
  saveData(id,value){const data={markers:Array.isArray(value.markers)?value.markers.slice(0,128).filter(p=>p&&typeof p==='object'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)).map(p=>({x:p.x,y:p.y,z:p.z,type:String(p.type||'').slice(0,24),name:String(p.name||'').slice(0,32),coordinateSpace:String(p.coordinateSpace||'').slice(0,64)})):[]};if(value.graphics&&typeof value.graphics==='object'){const g=value.graphics;data.graphics={quality:['high','balanced','performance'].includes(g.quality)?g.quality:'balanced',resolution:['auto','100','85','75'].includes(String(g.resolution))?String(g.resolution):'auto'};}if(value.mobile&&typeof value.mobile==='object')data.mobile=mobileSettings(value.mobile);this.db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(data),id);return data;}
  record(id,result){this.db.prepare('INSERT OR IGNORE INTO results(user_id,result_id,at,payload) VALUES(?,?,?,?)').run(id,result.id,result.at||Date.now(),JSON.stringify(result));}
  room(id,p,r){this.db.prepare('INSERT INTO room_sessions VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET room_id=excluded.room_id,player_id=excluded.player_id,token=excluded.token').run(id,r.id,p.id,p.token);}
  clearRoom(id){this.db.prepare('DELETE FROM room_sessions WHERE user_id=?').run(id);}
  chatHistory(room,player){return this.chatRecent.all(room.chatKey,player.userId).reverse();}
  chatMessage(room,player,text,clientId,channel){
    if(!['all','team'].includes(channel))throw Error('Kênh chat không hợp lệ.');
    if(channel==='team'&&(room.gameMode==='deathmatch'||!['a','b'].includes(player.team)))throw Error('Chat đội chỉ dành cho người chơi trong hai đội.');
    const previous=this.chatFind.get(room.chatKey,player.userId,clientId);
    if(previous)return {message:previous,created:false};
    const now=performance.now(),bucket=player.chatRate||{tokens:4,at:now};
    bucket.tokens=Math.min(4,bucket.tokens+(now-bucket.at)/1000);bucket.at=now;player.chatRate=bucket;
    if(bucket.tokens<1)throw Error('Bạn gửi tin quá nhanh. Vui lòng đợi một chút.');
    bucket.tokens--;
    // Snapshot recipients at send time. Switching teams or rejoining must not
    // grant access to earlier private messages from the other team.
    const recipients=channel==='team'?new Set(room.members.filter(p=>p.team===player.team&&Number.isSafeInteger(p.userId)).map(p=>p.userId)):null;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=this.chatInsert.run(room.chatKey,room.id,player.userId,player.id,player.name,text,Date.now(),clientId,channel,channel==='team'?player.team:null);
      if(recipients)for(const id of recipients)this.chatRecipientInsert.run(row.lastInsertRowid,id);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    return {message:this.chatFind.get(room.chatKey,player.userId,clientId),created:true,recipients};
  }
  users(){return this.db.prepare('SELECT u.id,u.username,u.role,u.created_at,p.settings FROM users u JOIN profiles p ON p.user_id=u.id ORDER BY u.id').all().map(u=>({id:u.id,username:u.username,role:u.role,createdAt:u.created_at,name:JSON.parse(u.settings).name}));}
  async createUser(value){const username=String(value.username||'').trim(),password=String(value.password||'');if(!/^[a-zA-Z0-9_]{3,32}$/.test(username))throw Error('Tên đăng nhập gồm 3–32 chữ, số hoặc dấu gạch dưới.');if(password.length<8||password.length>128)throw Error('Mật khẩu phải có 8–128 ký tự.');if(this.db.prepare('SELECT id FROM users WHERE username=?').get(username))throw Error('Tên đăng nhập đã tồn tại.');const salt=crypto.randomBytes(24).toString('hex'),hash=await derive(password,salt);
    this.db.exec('BEGIN');try{const u=this.db.prepare('INSERT INTO users(username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?)').run(username,hash,salt,'player',Date.now());this.db.prepare('INSERT INTO profiles(user_id,settings) VALUES(?,?)').run(u.lastInsertRowid,JSON.stringify(profile({name:value.name||username})));this.db.exec('COMMIT');return Number(u.lastInsertRowid);}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
module.exports={Store,profile};
