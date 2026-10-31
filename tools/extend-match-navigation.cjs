// Add lower source-floor components and continuous-floor connectors using collision data on CPU.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'val-strike-html/assets/maps/optimized/abyss-art');
const B=require(path.join(root,'val-strike-html/assets/vendor/babylon.js'));
const data=JSON.parse(fs.readFileSync(path.join(dir,'match-navigation.json'))),layout=JSON.parse(fs.readFileSync(path.join(root,'tools/art-review/abyss-layout-source.json')));
const mov=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/movement.json'))),options=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/match.json'))).navigation;
const context={BABYLON:B,console,setTimeout};vm.createContext(context);
for(const f of ['collision-world','bot-navigation'])vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game/'+f+'.js'),'utf8'),context);
const packed=fs.readFileSync(path.join(dir,'collision.glb'));context.packed=packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength);context.offset=28+packed.readUInt32LE(12);
const world=vm.runInContext('CollisionWorld.fromPacked(packed,offset)',context),Navigation=vm.runInContext('BotNavigation',context);
const key=p=>p.map((v,i)=>Math.round(v/(i===1?.15:.3))).join(',');
const lookup=new Map(data.nodes.map((p,i)=>[key(p),i]));
(async()=>{
 // Replace the previous broad jump shortcuts. Only authored, continuous-floor
 // connectors below may join components; never bridge the Abyss void.
 for(const edge of Object.keys(data.offMeshEdges||{})){const [a,b]=edge.split(':').map(Number);data.edges[a]=data.edges[a].filter(n=>n!==b);}
 data.offMeshEdges={};
 for(const seed of [layout.sites.find(s=>s.name==='B').position,[6,4,46]]) {
  if(data.nodes.some(n=>B.Vector3.DistanceSquared(B.Vector3.FromArray(n),B.Vector3.FromArray(seed))<.4))continue;
  console.log('Bake lower floor',seed);
  const added=await Navigation.build(world,B.Vector3.FromArray(seed),options,mov,(i,n)=>{if(i%1000===0)console.log('Floor nodes',i,n);});
  const ids=added.data.nodes.map(p=>{const k=key(p);if(lookup.has(k))return lookup.get(k);const id=data.nodes.length;lookup.set(k,id);data.nodes.push(p);data.edges.push([]);return id;});
  added.data.edges.forEach((edges,i)=>edges.forEach(j=>{if(!data.edges[ids[i]].includes(ids[j]))data.edges[ids[i]].push(ids[j]);}));
 }
 const positions=data.nodes.map(p=>B.Vector3.FromArray(p)),buckets=new Map();
 for(let i=0;i<positions.length;i++){const p=positions[i],k=Math.floor(p.x/2)+','+Math.floor(p.z/2);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);}
 let links=0;
 const component=new Int32Array(positions.length).fill(-1);let components=0;
 for(let i=0;i<positions.length;i++)if(component[i]<0){const queue=[i];component[i]=components++;for(let k=0;k<queue.length;k++)for(const next of data.edges[queue[k]])if(component[next]<0){component[next]=component[i];queue.push(next);}}
 const candidates=[];
 for(let i=0;i<positions.length;i++) {
  const from=positions[i],bx=Math.floor(from.x/2),bz=Math.floor(from.z/2);
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(const j of buckets.get((bx+dx)+','+(bz+dz))||[]) {
   if(j<=i||data.edges[i].includes(j))continue;const to=positions[j],delta=to.subtract(from),horizontal=Math.hypot(delta.x,delta.z);
   if(component[i]===component[j]||horizontal<.1||horizontal>5||Math.abs(delta.y)>2)continue;
   candidates.push({i,j,rank:horizontal+Math.abs(delta.y)});
  }
 }
 candidates.sort((a,b)=>a.rank-b.rank);const tried=new Set();
 const footprint=(point,last)=>{
   let highest=null;const radius=mov.playerRadius*.65;
   for(const [x,z] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
     const hit=world.pick(new B.Ray(new B.Vector3(point.x+x,last+mov.stepHeight+.03,point.z+z),B.Vector3.Down(),mov.stepHeight+.28),true);
     if(hit&&(!highest||hit.pickedPoint.y>highest.pickedPoint.y))highest=hit;
   }return highest?.pickedPoint.y;
 };
 for(const {i,j} of candidates) {
   const from=positions[i],to=positions[j],area=[Math.round(from.x/2),Math.round(from.z/2),component[i],component[j]].join(':');
   if(tried.has(area))continue;tried.add(area);
   const length=Math.hypot(to.x-from.x,to.z-from.z),count=Math.ceil(length/.12),points=[from];let valid=true,last=from.y;
   for(let step=1;step<=count;step++) {
     const sample=B.Vector3.Lerp(from,to,step/count),floor=footprint(sample,last);
     if(floor===undefined||Math.abs(floor-last)>mov.stepHeight+.04){valid=false;break;}
     sample.y=floor;
     if(world.pick(new B.Ray(sample.add(new B.Vector3(0,.05,0)),B.Vector3.Up(),mov.standingHeight))){valid=false;break;}
     const previous=points[points.length-1],delta=sample.subtract(previous),distance=delta.length(),direction=delta.scale(1/distance);
     for(const height of [mov.stepHeight+.03,1,mov.standingHeight-.03])for(const side of [-mov.playerRadius,0,mov.playerRadius]) {
       if(world.pick(new B.Ray(previous.add(new B.Vector3(direction.z*side,height,-direction.x*side)),direction,distance))){valid=false;break;}
     }
     if(!valid)break;points.push(sample);last=floor;
   }
   if(!valid||Math.abs(last-to.y)>.15)continue;
   let previous=i;
   for(let step=1;step<points.length-1;step+=2) {
     const p=points[step].asArray(),k=key(p);let id=lookup.get(k);
     if(id===undefined){id=data.nodes.length;lookup.set(k,id);data.nodes.push(p);positions.push(points[step]);data.edges.push([]);}
     if(id!==previous){if(!data.edges[previous].includes(id))data.edges[previous].push(id);if(!data.edges[id].includes(previous))data.edges[id].push(previous);previous=id;}
   }
   if(!data.edges[previous].includes(j))data.edges[previous].push(j);if(!data.edges[j].includes(previous))data.edges[j].push(previous);links++;
 }
 const nav=new Navigation(data),snap=p=>nav.nearest(B.Vector3.FromArray(p));
 data.layout={attack:snap(layout.spawn.attack),defend:snap(layout.spawn.defend),sites:layout.sites.map(s=>snap(s.position)),orbs:[snap([-37,8,21]),snap([28,8,12])]};
 data.layoutSource='raw named source floors + registered native minimap; see config/abyss-match.json';
 fs.writeFileSync(path.join(dir,'match-navigation.json'),JSON.stringify(data));
 // Make each objective a reachable floor point inside its native plant region.
 for(const site of layout.sites) {
  const contains=(p,poly)=>{let hit=false;for(let a=0,b=poly.length-1;a<poly.length;b=a++){const u=poly[a],v=poly[b];if((u[1]>p.z)!==(v[1]>p.z)&&p.x<(v[0]-u[0])*(p.z-u[1])/(v[1]-u[1])+u[0])hit=!hit;}return hit;};
  const inside=p=>site.polygons.some(poly=>contains(p,poly))&&!site.exclusions.some(poly=>contains(p,poly));
  const candidates=positions.map((p,id)=>({p,id})).filter(({p})=>Math.abs(p.y-site.position[1])<1&&inside(p));
  const chosen=candidates.sort((a,b)=>B.Vector3.DistanceSquared(a.p,B.Vector3.FromArray(site.position))-B.Vector3.DistanceSquared(b.p,B.Vector3.FromArray(site.position)))[0];
  if(chosen){site.position=chosen.p.asArray();data.layout.sites[layout.sites.indexOf(site)]=chosen.id;}
 }
 layout.orbs=data.layout.orbs.map(i=>data.nodes[i]);
 const da=nav.distances(data.layout.attack),dd=nav.distances(data.layout.defend);
 // Pre-round area ends at the first third of the shortest route to a site.
layout.buyAreaSteps={attack:Math.min(32,Math.max(6,Math.floor(Math.min(...data.layout.sites.map(i=>da[i]).filter(Number.isFinite))*.32))),defend:Math.min(32,Math.max(6,Math.floor(Math.min(...data.layout.sites.map(i=>dd[i]).filter(Number.isFinite))*.35)))};
 fs.writeFileSync(path.join(dir,'match-navigation.json'),JSON.stringify(data));
 fs.writeFileSync(path.join(root,'val-strike-html/game/config/abyss-match.json'),JSON.stringify(layout,null,2));
 console.log(JSON.stringify({nodes:data.nodes.length,floorConnectors:links,layout:data.layout,buyAreaSteps:layout.buyAreaSteps,siteStepsFromAttack:data.layout.sites.map(i=>da[i]),siteStepsFromDefend:data.layout.sites.map(i=>dd[i])}));
})().catch(e=>{console.error(e);process.exitCode=1;});
