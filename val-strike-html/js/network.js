// One native WebSocket per page. Inputs are transient; reconnect only restores
// the server-issued room session and never replays purchases or shots.
window.VSNetwork=class{
  constructor(){this.socket=null;this.session=null;this.listeners=new Set();this.pending=new Map();this.request=0;this.stopped=false;this.retry=0;this.rtt=0;this.connected=false;}
  on(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  notify(data){for(const fn of this.listeners)try{fn(data);}catch(error){console.error('[network UI]',error);}}
  open(){
    window.VSChat?.bind(this);
    this.stopped=false;if(this.socket?.readyState===WebSocket.OPEN)return Promise.resolve();if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{const socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws');this.socket=socket;
      const timeout=setTimeout(()=>{socket.close();reject(Error('Không kết nối được server.'));},8000);
      socket.onopen=()=>{clearTimeout(timeout);this.connected=true;this.retry=0;this.notify({type:'connection',connected:true});resolve();};
      socket.onmessage=event=>{let data;try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='room'){this.session={room:data.room.id,token:data.token,self:data.self};VSAccount.room=this.session;}
        if(data.type==='reply'){const pending=this.pending.get(data.request);if(pending){clearTimeout(pending.timer);this.pending.delete(data.request);pending.resolve(data);}if(!data.ok&&data.message&&data.op!=='chat')this.notify({type:'error',message:data.message});}
        if(data.type==='heartbeat')this.rtt=Math.round(performance.now()-data.client);
        if(data.type==='left'){this.session=null;VSAccount.room=null;}
        if(data.type==='error'&&data.op==='resume'){this.session=null;VSAccount.room=null;clearTimeout(this.retryTimer);}
        this.notify(data);
      };
      socket.onerror=()=>{clearTimeout(timeout);reject(Error('Không kết nối được server multiplayer.'));};
      socket.onclose=event=>{clearTimeout(timeout);this.connected=false;this.opening=null;clearInterval(this.heartbeat);
        for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.resolve({ok:false,message:'Kết nối đã ngắt.'});}this.pending.clear();this.notify({type:'connection',connected:false,code:event.code});
        if(event.code===4003){location.replace('/login');return;}if(!this.stopped&&this.session&&event.code!==4001)this.reconnect();
      };
    }).finally(()=>this.opening=null);
    this.opening.then(()=>{clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.send({op:'heartbeat',client:performance.now()}),3000);}).catch(()=>{});return this.opening;
  }
  send(data){if(this.socket?.readyState!==WebSocket.OPEN||this.socket.bufferedAmount>131072)return false;this.socket.send(JSON.stringify(data));return true;}
  async command(op,data={}){if(!this.connected)return {ok:false,message:'Đang kết nối lại…'};const request=++this.request;
    return new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(request);resolve({ok:false,message:'Server chưa phản hồi.'});},5000);this.pending.set(request,{resolve,timer});if(!this.send({op,...data,request})){clearTimeout(timer);this.pending.delete(request);resolve({ok:false,message:'Kết nối đang chậm.'});}});
  }
  async enter(op,data){await this.open();this.send({op,...data});}
  restore(){this.session=VSAccount.room;if(this.session)return this.open().then(()=>this.send({op:'resume',...this.session}));return Promise.resolve();}
  reconnect(){const delay=Math.min(4000,500*2**this.retry++);clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>{if(this.stopped||!this.session)return;this.open().then(()=>this.send({op:'resume',...this.session})).catch(()=>this.reconnect());},delay);}
  leave(){this.send({op:'leave'});this.session=null;VSAccount.room=null;this.close();}
  close(){this.stopped=true;clearInterval(this.heartbeat);clearTimeout(this.retryTimer);window.VSChat?.unbind(this);this.socket?.close();}
};
