// Shared map registry; the server selects one map for every member of a room.
(function(root){
  const maps={
    abyss:{id:'abyss',name:'Abyss',layout:'abyss-match',root:'/assets/maps/optimized/abyss-art/',background:'/assets/menu/abyss-background.png',minimap:'abyss'},
    haven:{id:'haven',name:'Haven',layout:'haven-match',root:'/assets/maps/optimized/haven-art/',background:'/assets/menu/haven-background.png',minimap:'haven'}
  };
  const ids=Object.keys(maps),api={maps,ids,valid:id=>Object.hasOwn(maps,id),random:()=>ids[Math.floor(Math.random()*ids.length)],get:id=>maps[id]};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VSMaps=api;
})(typeof window!=='undefined'?window:globalThis);
