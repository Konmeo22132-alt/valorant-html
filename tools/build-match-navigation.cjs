// Offline CPU bake; never opens a renderer or changes the map geometry.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),B=require(path.join(root,'val-strike-html/assets/vendor/babylon.js'));
const dir=path.join(root,'val-strike-html/assets/maps/optimized/abyss-art'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const context={BABYLON:B,console,setTimeout};vm.createContext(context);
for(const f of ['collision-world','bot-navigation'])vm.runInContext(fs.readFileSync(path.join(root,'val-strike-html/game/'+f+'.js'),'utf8'),context);
const buffer=fs.readFileSync(path.join(dir,manifest.collision)),array=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
context.array=array;context.offset=28+buffer.readUInt32LE(12);
context.mov=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/movement.json')));
context.window={GAME_CONFIG:{movement:context.mov},__mapBounds:manifest.bounds,__mapSpawnAnchor:manifest.spawnAnchor,__mapSpawnCandidates:manifest.spawnCandidates};
vm.runInContext('const world=CollisionWorld.fromPacked(array,offset);function worldPick(p,d,l,f){return world.pick(new BABYLON.Ray(p,d,l),f);}',context);
const engineSource=fs.readFileSync(path.join(root,'val-strike-html/game/engine.js'),'utf8');
vm.runInContext(engineSource.slice(engineSource.indexOf('function autoFindSpawn()')),context);
context.seed=vm.runInContext('autoFindSpawn().subtract(new BABYLON.Vector3(0,window.GAME_CONFIG.movement.eyeHeight,0)).asArray()',context);
context.options=JSON.parse(fs.readFileSync(path.join(root,'val-strike-html/game/config/match.json'))).navigation;
vm.runInContext(`BotNavigation.build(CollisionWorld.fromPacked(array,offset),BABYLON.Vector3.FromArray(seed),options,mov,(i,n)=>{if(i%1000===0)console.log('Bake floor',i,n);})`,context).then(nav=>{
  fs.writeFileSync(path.join(dir,'match-navigation.json'),JSON.stringify(nav.data));
  console.log(JSON.stringify({seed:context.seed,nodes:nav.nodes.length,edges:nav.edges.reduce((n,a)=>n+a.length,0),layout:nav.data.layout}));
}).catch(error=>{console.error(error);process.exitCode=1;});
