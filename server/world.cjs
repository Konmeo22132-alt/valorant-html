'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../tools/node_modules/babylonjs');
const root=path.resolve(__dirname,'../val-strike-html');
const config=Object.fromEntries(['movement','weapons','economy','rounds','match','playable-agents','abyss-match','haven-match','network'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,'game/config',n+'.json')))]));
const maps=require('../val-strike-html/game/maps.js'),shared=new Map();
function loadWorld(map='abyss'){
  if(!maps.valid(map))throw Error('Bản đồ không hợp lệ.');
  if(shared.has(map))return shared.get(map);
  const descriptor=maps.get(map),directory=path.join(root,descriptor.root),layout=config[descriptor.layout];
  const mapConfig={...config,'map-layout':layout};
  const scope=vm.createContext({BABYLON:B,window:{GAME_CONFIG:mapConfig},weaponNow:()=>0});
  for(const file of ['collision-world','actor-motion','range'])vm.runInContext(fs.readFileSync(path.join(root,'game',file+'.js'),'utf8'),scope,{filename:file});
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  const bytes=fs.readFileSync(path.join(directory,manifest.collision));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),base=20+new DataView(buffer).getUint32(12,true)+8;
  scope.packed=buffer;scope.base=base;
  const collision=vm.runInContext('CollisionWorld.fromPacked(packed,base)',scope);
  collision.surfaceRanges=manifest.collisionSurfaces.map(r=>({...r,mesh:{name:r.name,metadata:{worldCollision:true,surface:r.surface}}}));
  if(map==='abyss')collision.addSupplement(JSON.parse(fs.readFileSync(path.join(directory,'stair-collision.json'))));
  scope.window.collisionWorld=collision;
  const world={B,config:mapConfig,map,layout,root:directory,collision,nav:JSON.parse(fs.readFileSync(path.join(directory,'match-navigation.json'))),actorStep:vm.runInContext('actorStep',scope),networkStep:vm.runInContext('actorNetworkStep',scope),floorAt:vm.runInContext('actorFloorAt',scope),penetration:vm.runInContext('combatPenetration',scope)};
  shared.set(map,world);return world;
}
module.exports={loadWorld,config,B,root};
