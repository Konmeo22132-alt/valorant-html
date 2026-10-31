"""Restore structural stair faces from the original map, before simplification."""
import json, math, struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'val-strike-html/assets/maps/raw/abyss_raw.glb'
with source.open('rb') as stream:
    stream.seek(12);length=struct.unpack('<I',stream.read(4))[0]
    stream.seek(20);doc=json.loads(stream.read(length));base=28+length
    def attribute(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
        n={'VEC3':3,'SCALAR':1}[a['type']];kind,size={5126:('f',4),5125:('I',4),5123:('H',2)}[a['componentType']]
        stream.seek(base+v.get('byteOffset',0));data=stream.read(v['byteLength']);stride=v.get('byteStride',n*size)
        return [struct.unpack_from('<'+kind*n,data,a.get('byteOffset',0)+i*stride) for i in range(a['count'])]
    def transform(p,node):
        scale=node.get('scale',[1,1,1]);scale=[v/.0067138671875 for v in scale] if max(map(abs,scale))<.05 else scale
        x,y,z=[v*s for v,s in zip(p,scale)];qx,qy,qz,qw=node.get('rotation',[0,0,0,1]);t=node.get('translation',[0,0,0])
        tx,ty,tz=2*(qy*z-qz*y),2*(qz*x-qx*z),2*(qx*y-qy*x)
        return [-(x+qw*tx+qy*tz-qz*ty+t[0]),y+qw*ty+qz*tx-qx*tz+t[1],z+qw*tz+qx*ty-qy*tx+t[2]]
    triangles=[];ranges=[];audit=[]
    for node in doc['nodes']:
        name=node.get('name','')
        if 'mesh' not in node or not name.startswith('Shell_') or 'Vista' in name:continue
        if not any(part in name for part in ('Stairs','SlopeFloor','FloorRamp','PathBRamp')):continue
        start=len(triangles)//9;tops=0
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            positions=[transform(p,node) for p in attribute(primitive['attributes']['POSITION'])]
            indices=[v[0] for v in attribute(primitive['indices'])]
            for i in range(0,len(indices),3):
                a,b,c=[positions[v] for v in indices[i:i+3]]
                u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
                normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                size=math.hypot(*normal)
                if size<1e-8:continue
                triangles.extend(a+b+c)
                if abs(normal[1])/size>.98:
                    tops+=1
                    # Original stairs have thin open treads. Close their sides
                    # beneath each tread so lateral movement and bullets hit a
                    # solid riser instead of passing between render triangles.
                    for p,q in ((a,b),(b,c),(c,a)):
                        p0=[p[0],p[1]-.34,p[2]];q0=[q[0],q[1]-.34,q[2]]
                        triangles.extend(p+q+q0+p+q0+p0)
        end=len(triangles)//9
        ranges.append({'start':start,'end':end,'name':name,'surface':'concrete','stair':True})
        audit.append({'name':name,'triangles':end-start,'walkableFaces':tops})
result={'version':1,'coordinateSpace':'abyss-meters-v1','triangles':triangles,'ranges':ranges,'audit':audit}
target=ROOT/'val-strike-html/assets/maps/optimized/abyss-art/stair-collision.json'
target.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
print(json.dumps({'stairs':len(ranges),'triangles':len(triangles)//9,'bytes':target.stat().st_size,'objects':audit}))
