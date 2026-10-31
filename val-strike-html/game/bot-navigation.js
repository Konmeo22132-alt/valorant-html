class BotNavigation {
  constructor(data) {this.data=data;this.nodes=data.nodes.map(p=>BABYLON.Vector3.FromArray(p));this.edges=data.edges;}
  nearest(p) {let best=0,d=Infinity;this.nodes.forEach((n,i)=>{const value=BABYLON.Vector3.DistanceSquared(n,p);if(value<d){d=value;best=i;}});return best;}
  distances(start) {
    const d=new Float64Array(this.nodes.length).fill(Infinity),queue=[start];d[start]=0;
    for(let k=0;k<queue.length;k++)for(const next of this.edges[queue[k]])if(!Number.isFinite(d[next])){d[next]=d[queue[k]]+1;queue.push(next);}
    return d;
  }
  path(from,to,canUse=()=>true,cost=()=>1) {
    const start=this.nearest(from),end=this.nearest(to),parent=new Int32Array(this.nodes.length).fill(-1);
    const distance=new Float64Array(this.nodes.length).fill(Infinity),heap=[];
    const estimate=id=>BABYLON.Vector3.Distance(this.nodes[id],this.nodes[end]);
    function push(item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].rank<=item.rank)break;heap[i]=heap[p];i=p;}heap[i]=item;}
    function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let n=i*2+1;if(n+1<heap.length&&heap[n+1].rank<heap[n].rank)n++;if(heap[n].rank>=last.rank)break;heap[i]=heap[n];i=n;}heap[i]=last;}return first;}
    distance[start]=0;parent[start]=start;push({id:start,distance:0,rank:estimate(start)});
    while(heap.length){const current=pop(),id=current.id;if(current.distance!==distance[id])continue;if(id===end)break;
      for(const n of this.edges[id])if(canUse(id,n)) {
        const next=distance[id]+BABYLON.Vector3.Distance(this.nodes[id],this.nodes[n])*Math.max(1,cost(id,n));
        if(next>=distance[n])continue;distance[n]=next;parent[n]=id;push({id:n,distance:next,rank:next+estimate(n)});
      }
    }
    if(parent[end]<0)return [];
    const result=[];for(let n=end;n!==start;n=parent[n])result.push(n);return result.reverse();
  }
  static async build(world,seed,options,mov,progress=()=>{}) {
    const pick=(p,d,l,f=false)=>world.pick(new BABYLON.Ray(p,d,l),f),s=options.spacing;
    function ground(p,length) {
      const center=pick(p,BABYLON.Vector3.Down(),length,true);if(center)return center;
      let best=null;const r=mov.playerRadius*.65;
      for(const [x,z] of [[r,0],[-r,0],[0,r],[0,-r]]) {
        const hit=pick(p.add(new BABYLON.Vector3(x,0,z)),BABYLON.Vector3.Down(),length,true);
        if(hit&&(!best||hit.pickedPoint.y>best.pickedPoint.y))best=hit;
      }
      if(best)best.pickedPoint=new BABYLON.Vector3(p.x,best.pickedPoint.y,p.z);return best;
    }
    const floor=pick(seed.add(new BABYLON.Vector3(0,.7,0)),BABYLON.Vector3.Down(),3,true);
    if(!floor)throw Error('Không tìm thấy sàn cho navigation.');
    const nodes=[floor.pickedPoint.asArray()],edges=[[]],seen=new Map();
    const key=p=>Math.round(p.x/s)+','+Math.round(p.y/.5)+','+Math.round(p.z/s);
    seen.set(key(floor.pickedPoint),0);
    function walkable(from,to) {
      const d=to.subtract(from),len=d.length();d.normalize();
      for(const height of [mov.stepHeight+.04,1,1.75])for(const side of [-mov.playerRadius,0,mov.playerRadius]) {
        const offset=new BABYLON.Vector3(d.z*side,height,-d.x*side);
        if(pick(from.add(offset),d,len))return false;
      }
      let last=from.y;
      for(let i=1;i<=4;i++) {
        const p=BABYLON.Vector3.Lerp(from,to,i/4),hit=ground(new BABYLON.Vector3(p.x,last+mov.stepHeight+.03,p.z),mov.stepHeight+.28);
        if(!hit||Math.abs(hit.pickedPoint.y-last)>mov.stepHeight+.04)return false;last=hit.pickedPoint.y;
      }
      return Math.abs(last-to.y)<.15;
    }
    for(let index=0;index<nodes.length;index++) {
      const from=BABYLON.Vector3.FromArray(nodes[index]);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const sample=from.add(new BABYLON.Vector3(dx*s,options.maxEdgeRise+.03,dz*s));
        const hit=ground(sample,options.maxEdgeRise*2+.06);if(!hit)continue;
        const to=hit.pickedPoint;if(Math.abs(to.y-from.y)>options.maxEdgeRise)continue;
        const id=seen.get(key(to));if(id===index||!walkable(from,to))continue;
        if(pick(to.add(new BABYLON.Vector3(0,.05,0)),BABYLON.Vector3.Up(),mov.standingHeight))continue;
        let next=id;
        if(next===undefined) {if(nodes.length>=options.maxNodes)continue;next=nodes.length;seen.set(key(to),next);nodes.push(to.asArray());edges.push([]);}
        if(!edges[index].includes(next))edges[index].push(next);
        // Validate reverse separately: stairs/ramps must support both directions.
        if(!edges[next].includes(index)&&walkable(to,from))edges[next].push(index);
      }
      if(index%100===0){progress(index,nodes.length);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    if(nodes.length<30)throw Error('Navigation quá nhỏ: '+nodes.length+' node.');
    const nav=new BotNavigation({nodes,edges});
    const far=start=>{const d=nav.distances(start);let best=start;d.forEach((v,i)=>{if(Number.isFinite(v)&&v>d[best])best=i;});return best;};
    const a=far(0),b=far(a),da=nav.distances(a),db=nav.distances(b);
    const middle=nodes.map((_,i)=>i).filter(i=>Number.isFinite(da[i])&&Number.isFinite(db[i])&&da[i]>da[b]*.25&&db[i]>da[b]*.25);
    if(!middle.length)throw Error('Không tìm thấy vùng giao tranh.');
    const siteA=middle.reduce((best,i)=>nodes[i][0]<nodes[best][0]?i:best,middle[0]);
    const siteB=middle.reduce((best,i)=>BABYLON.Vector3.DistanceSquared(nav.nodes[i],nav.nodes[siteA])>BABYLON.Vector3.DistanceSquared(nav.nodes[best],nav.nodes[siteA])?i:best,middle[0]);
    nav.data.layout={attack:a,defend:b,sites:[siteA,siteB],orbs:[middle[Math.floor(middle.length/3)],middle[Math.floor(middle.length*2/3)]]};
    nav.data.layoutSource='connected collision floors; local authored layout, not canonical Riot site markers';return nav;
  }
}
