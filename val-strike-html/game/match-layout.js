// Buy limits follow the connected floor around each source spawn. The frontier
// is visible; returning to the last allowed feet avoids a jump back to spawn.
function matchCreateBuyBoundaries() {
  const s=matchState,nav=s.nav;
  s.barrier.getChildMeshes().forEach(m=>m.dispose(false,false));s.buyDistances={};
  s.barrier.material?.dispose();
  const material=agentLuminousMaterial('buy_boundary_material','#69DDEC');material.alpha=.22;material.backFaceCulling=false;s.barrier.material=material;
  const placed=new Set();
  for(const side of ['attack','defend']) {
    const start=nav.data.layout[side],distances=nav.distances(start);
    const limit=s.authoredLayout?.buyAreaSteps?.[side]||24;
    s.buyDistances[side]={distances,limit};
    distances.forEach((distance,id)=>{
      if(distance>limit)return;
      for(const next of nav.edges[id]) {
        if(distances[next]<=limit)continue;
        const from=nav.nodes[id],to=nav.nodes[next],center=BABYLON.Vector3.Lerp(from,to,.5),key=side+':'+Math.round(center.x/1.2)+':'+Math.round(center.z/1.2)+':'+Math.round(center.y);
        if(placed.has(key))continue;placed.add(key);
        const mesh=BABYLON.MeshBuilder.CreatePlane('buy_frontier_'+side,{width:1.4,height:2.6,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
        mesh.parent=s.barrier;mesh.position.copyFrom(center).y+=1.3;mesh.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);mesh.material=material;mesh.isPickable=false;
      }
    });
  }
  s.buyLast=agentPosition();
}
function matchEnforceBuyArea() {
  const s=matchState,point=agentPosition(),side=s.human.team===s.rules.attacking?'attack':'defend',zone=s.buyDistances[side],id=s.nav.nearest(point);
  // One grid cell of tolerance prevents jitter right at a frontier plane.
  if(zone.distances[id]<=zone.limit+1)s.buyLast=point.clone();
  else {playerController.teleport(s.buyLast||s.spawn);weaponClearInput();}
}
