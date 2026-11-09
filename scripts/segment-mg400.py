"""Segment the supplied fused CAD using official MG400 link surfaces as guides.

pip install numpy scipy trimesh fast-simplification
python scripts/segment-mg400.py '/path/to/DOBOT MG400.stl' /path/to/output
node scripts/rig-mg400.mjs /path/to/output/parts.json

Only triangles from the supplied STL enter the result. Official meshes are
nearest-surface labels, not substitute output geometry. Raw CAD is not included.
"""
import sys, pathlib, hashlib, json, urllib.request, xml.etree.ElementTree as ET
import numpy as np
import trimesh
import fast_simplification
from scipy.spatial import cKDTree

source=pathlib.Path(sys.argv[1]);root=pathlib.Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=True)
expected='36b674656149361d2e2f5b25c039dc0a5d3a6e33a2673e87a3b12fd6f6f0a8fc'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:
 raise ValueError('This segmentation recipe targets the supplied 257853-triangle MG400 STL.')
names=['base_link','link1','link2_1','link2_2','link3_1','link3_2','link4_1','link4_2','link5']
base='https://raw.githubusercontent.com/Dobot-Arm/MG400_ROS/main/mg400_description/'
files=[('mg400.urdf','urdf/mg400_description.urdf')]+[(n+'.STL','meshes/'+n+'.STL') for n in names]
for local,remote in files:
 if not (root/local).exists():urllib.request.urlretrieve(base+remote,root/local)
robot=ET.parse(root/'mg400.urdf').getroot();positions={'base_link':np.zeros(3)};pending=list(robot.findall('joint'))
while pending:
 progressed=False
 for j in pending[:]:
  parent=j.find('parent').get('link');child=j.find('child').get('link')
  if parent not in positions:continue
  origin=j.find('origin');delta=np.fromstring(origin.get('xyz'),sep=' ') if origin is not None else np.zeros(3)
  positions[child]=positions[parent]+delta;pending.remove(j);progressed=True
 if not progressed:raise ValueError('Unresolved reference joint hierarchy')
np.random.seed(400);mesh=trimesh.load(source,force='mesh')
triangles=[];sample_points=[];sample_faces=[];face_labels=[]
for label,name in enumerate(names):
 ref=trimesh.load(root/(name+'.STL'),force='mesh')
 ref.vertices=(ref.vertices+positions[name])@np.diag([-1000,-1000,1000])
 pts,faces=trimesh.sample.sample_surface(ref,160000)
 sample_points.append(pts);sample_faces.append(faces+sum(len(t) for t in triangles))
 triangles.append(ref.triangles);face_labels.extend([label]*len(ref.faces))
triangles=np.concatenate(triangles);sample_faces=np.concatenate(sample_faces);face_labels=np.array(face_labels)
centres=mesh.triangles_center;_,idx=cKDTree(np.concatenate(sample_points)).query(centres,k=6)
candidate=sample_faces[idx];points=np.repeat(centres,6,axis=0)
closest=trimesh.triangles.closest_point(triangles[candidate.flatten()],points)
dist=np.linalg.norm(closest-points,axis=1).reshape(-1,6)
labels=face_labels[candidate[np.arange(len(candidate)),dist.argmin(axis=1)]]
for component in trimesh.graph.connected_components(mesh.face_adjacency,min_len=1,nodes=np.arange(len(mesh.faces))):
 if len(component)<6000:labels[component]=np.bincount(labels[component],minlength=len(names)).argmax()
parts=[]
for i,name in enumerate(names):
 part=trimesh.Trimesh(mesh.vertices,mesh.faces[labels==i],process=True)
 target=min(18000,max(1200,int(len(part.faces)*.28)))
 v,f=fast_simplification.simplify(part.vertices,part.faces,target_count=target,agg=5)
 part=trimesh.Trimesh(v,f,process=False)
 parts.append({'name':name,'positions':part.vertices.round(5).tolist(),'normals':part.vertex_normals.round(6).tolist(),'indices':part.faces.tolist()})
(root/'parts.json').write_text(json.dumps(parts,separators=(',',':')))
print('Wrote nine segmented CAD parts to',root/'parts.json')
