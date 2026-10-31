'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('./node_modules/jsdom');
const root=path.resolve(__dirname,'../val-strike-html');
const dom=new JSDOM('<div id="menu-content"></div><span id="profile-name"></span><img id="profile-portrait"><div id="menu-toast" hidden></div>',{runScripts:'outside-only',url:'http://localhost/play'}),w=dom.window,calls=[];
w.VSProfile={load:()=>({name:'Player',agent:'Clove'}),flush:async()=>{},history:()=>[]};w.VSAccount={room:null,request:async()=>({rooms:[]})};w.VS={navigate(){}};
w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,new URL(url,w.location).pathname),'utf8'))});w.VSAgentViewer=()=>({dispose(){},load(){}});
w.VSNetwork=class{constructor(){this.connected=true;this.session={self:'host'};}on(fn){this.listener=fn;return()=>{};}async enter(op,data){calls.push({op,...data});this.listener({type:'room',room:{id:'ABCDEF',name:'Haven',host:'host',mode:data.mode,gameMode:data.gameMode,map:data.map,size:data.size,phase:'lobby',members:[{id:'host',agent:'Clove',team:'a',name:'Player',connected:true,ready:false}]}});}command(op,data){calls.push({op,...data});return Promise.resolve({ok:true});}close(){}};
for(const file of ['js/agents.js','game/maps.js','js/menu.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
(async()=>{try{
await w.VSMenu.mount('/play',()=>true);w.document.querySelector('[data-mode="custom"]').click();w.document.getElementById('open-create').click();const form=w.document.getElementById('create-room');assert.equal(form.elements.map.options.length,2);assert.equal(form.elements.gameMode.options.length,2);form.elements.map.value='haven';form.elements.gameMode.value='deathmatch';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[0].map,'haven');assert.equal(calls[0].gameMode,'deathmatch');assert(w.document.getElementById('room-map'));assert(w.document.getElementById('room-game-mode'));
w.document.getElementById('room-map').value='abyss';w.document.getElementById('room-map').dispatchEvent(new w.Event('change'));assert.equal(calls.at(-1).op,'settings');assert.equal(calls.at(-1).map,'abyss');
console.log('PASS custom form map/mode payloads and host lobby controls.');
}finally{w.VSMenu.dispose();dom.window.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
