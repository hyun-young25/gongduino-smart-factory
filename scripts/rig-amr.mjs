import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, weld, prune, quantize, textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(fileURLToPath(new URL('../model-sources/amr.glb',import.meta.url)));
const scene = doc.getRoot().listScenes()[0];
const root = scene.listChildren()[0];
const buffer = doc.getRoot().listBuffers()[0];
const pivots = {
  Yaw:[0,.411,-.01], Shoulder:[0,.513,-.01], Elbow:[0,.938,-.01], Wrist:[0,.5696,.1241], JawMinus:[0,.5696,.1241], JawPlus:[0,.5696,.1241]
};
const parents = {Yaw:root,Shoulder:'Yaw',Elbow:'Shoulder',Wrist:'Elbow',JawMinus:'Wrist',JawPlus:'Wrist'};
const groups={};
for(const [key,origin] of Object.entries(pivots)){
  const parent=typeof parents[key]==='string'?groups[parents[key]]:parents[key];
  const base=typeof parents[key]==='string'?pivots[parents[key]]:[0,0,0];
  groups[key]=doc.createNode('Pivot_'+key).setTranslation(origin.map((v,i)=>v-base[i]));
  parent.addChild(groups[key]);
}
const bucket=new Map();
function addPart(group,primitive,indices,shiftZ=0){
  const key=group+'|'+primitive.getMaterial().getName()+'|'+shiftZ;
  if(!bucket.has(key)) bucket.set(key,{group,primitive,indices:[],shiftZ});
  // Each source primitive owns its own vertex accessors, so don't mix their indices.
  let entry=bucket.get(key);
  if(entry.primitive!==primitive){const k=key+'|'+bucket.size;entry={group,primitive,indices:[],shiftZ};bucket.set(k,entry);}
  entry.indices.push(...indices);
}
for(const node of [...root.listChildren()].filter(n=>n.getName().startsWith('Arm'))){
  for(const p of node.getMesh().listPrimitives()){
    const pos=p.getAttribute('POSITION'),ix=p.getIndices().getArray();
    const parent=Array.from({length:pos.getCount()},(_,i)=>i),keys=new Map();
    function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    function join(a,b){parent[find(a)]=find(b);}
    for(let i=0;i<pos.getCount();i++){const key=pos.getElement(i,[]).map(x=>Math.round(x*1e5)).join(',');if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);}
    for(let i=0;i<ix.length;i+=3){join(ix[i],ix[i+1]);join(ix[i],ix[i+2]);}
    const parts=new Map();
    for(let i=0;i<ix.length;i+=3){const key=find(ix[i]);if(!parts.has(key))parts.set(key,[]);parts.get(key).push(ix[i],ix[i+1],ix[i+2]);}
    for(const indices of parts.values()){
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const i of indices){const v=pos.getElement(i,[]);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}}
      const y=(lo[1]+hi[1])/2,z=(lo[2]+hi[2])/2,name=node.getName();
      let group,shiftZ=0;
      if(name==='Arm gripper'){
        group=lo[2]>.435?(y<.5696?'JawMinus':'JawPlus'):'Wrist'; shiftZ=-.2;
      }else if(name==='Arm label') group='Shoulder';
      else if(name==='Arm links'){
        if(z>.15)continue; // Short wrist adapter gives the fingers clearance above a carton.
        group=hi[2]<.05?'Shoulder':'Elbow';
      }else{
        if(z>.18&&z<.32)continue;
        if(z>.32){group='Wrist';shiftZ=-.2;}
        else if(z>.07)group='Wrist';
        else if(y>.85)group='Elbow';
        else if(y>.455)group='Shoulder';
        else group='Yaw';
      }
      addPart(group,p,indices,shiftZ);
    }
  }
  root.removeChild(node);
}
for(const {group,primitive,indices,shiftZ} of bucket.values()){
  const mesh=doc.createMesh('Arm_'+group);
  const p=primitive.clone().setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
  mesh.addPrimitive(p);
  const origin=pivots[group];
  groups[group].addChild(doc.createNode('ArmPart_'+group).setMesh(mesh).setTranslation([-origin[0],-origin[1],-origin[2]+shiftZ]));
}
root.setExtras({...root.getExtras(),articulated:true,sourceCentreZ:.0237645,modelScale:1.69381,toolLength:.157,restForearm:Math.atan2(.1341,-.3684)});
await doc.transform(prune(),dedup(),weld(),textureCompress({encoder:sharp,resize:[512,512],targetFormat:'webp'}),quantize());
await io.write(fileURLToPath(new URL('../dist/models/amr-rigged.glb',import.meta.url)),doc);
console.log(JSON.stringify({nodes:doc.getRoot().listNodes().length,meshes:doc.getRoot().listMeshes().length,rig:Object.keys(groups)}));
