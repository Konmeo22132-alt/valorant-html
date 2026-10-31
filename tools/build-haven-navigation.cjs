'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),B=require('./node_modules/babylonjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'val-strike-html/assets/maps/optimized/haven-art'),layoutFile=path.join(root,'val-strike-html/game/config/haven-match.json');
const layout=JSON.parse(fs.readFileSync(layoutFile)),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),bytes=fs.readFileSync(path.join(dir,manifest.collision)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const context=vm.createContext({BABYLON:B,console,setTimeout,window:{}});
for(const name of ['collision-world','bot-navigation'])vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game',name+'.js'),'utf8'),context);
context.buffer=buffer;context.base=28+bytes.readUInt32LE(12);context.mov=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/movement.json')));context.options={...JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/match.json'))).navigation,spacing:.7,maxNodes:32000};context.seed=B.Vector3.FromArray(layout.spawn.attack);
(async()=>{
const nav=await vm.runInContext('BotNavigation.build(CollisionWorld.fromPacked(buffer,base),seed,options,mov,(i,n)=>{if(i%1000===0)console.log("Haven nav",i,n);})',context);
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function nearest(point,valid=()=>true){let best=-1,score=Infinity;nav.nodes.forEach((p,i)=>{if(!valid(p))return;const d=B.Vector3.DistanceSquared(p,B.Vector3.FromArray(point))+Math.max(0,Math.abs(p.y-point[1])-.5)*100;if(d<score){score=d;best=i;}});if(best<0||Math.abs(nav.nodes[best].y-point[1])>.8||B.Vector3.Distance(nav.nodes[best],B.Vector3.FromArray(point))>8)throw Error('No reachable floor near '+point);return best;}
const attack=nearest(layout.spawn.attack),defend=nearest(layout.spawn.defend),sites=layout.sites.map(s=>nearest(s.position,p=>s.polygons.some(poly=>inside(p,poly)))),orbs=layout.orbs.map(o=>nearest(o.position||o));
nav.data.layout={attack,defend,sites,orbs};nav.data.layoutSource=layout.source;nav.data.coordinateSpace='haven-meters-v1';
const distances=nav.distances(attack);for(const n of [defend,...sites,...orbs])if(!Number.isFinite(distances[n]))throw Error('Haven routes are disconnected');
layout.spawn.attack=nav.nodes[attack].asArray();layout.spawn.defend=nav.nodes[defend].asArray();layout.sites.forEach((s,i)=>s.position=nav.nodes[sites[i]].asArray());layout.orbs=orbs.map(n=>nav.nodes[n].asArray());layout.buyAreaSteps={attack:24,defend:20};
manifest.spawnCandidates=[layout.spawn.attack,layout.spawn.defend,...layout.sites.map(s=>s.position)];manifest.spawnAnchor=layout.spawn.attack;
fs.writeFileSync(layoutFile,JSON.stringify(layout,null,2));fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(dir,'match-navigation.json'),JSON.stringify(nav.data));console.log(JSON.stringify({nodes:nav.nodes.length,edges:nav.edges.reduce((n,a)=>n+a.length,0),layout:nav.data.layout,spawn:layout.spawn,sites:layout.sites.map(s=>[s.name,s.position])}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
