// Build the factory asset from segmented, reduced user-supplied CAD triangles.
// Usage: node scripts/rig-mg400.mjs /path/to/parts.json
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,quantize} from '@gltf-transform/functions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(fileURLToPath(new URL('../dist/models/amr-rigged.glb',import.meta.url)));
const scene=doc.getRoot().listScenes()[0],mobile=scene.listChildren()[0];
for(const n of [...mobile.listChildren()])if(n.getName()==='Pivot_Yaw'||n.getName()==='Controller box and parts tray')mobile.removeChild(n);
mobile.setName('MobilePlatform').setScale([1.3,1.3,1.3]).setTranslation([0,0,-.030894]);
const buffer=doc.getRoot().listBuffers()[0];
const cad=doc.createNode('MG400').setTranslation([0,.45,0]).setScale([3,3,3]);scene.addChild(cad);
// Pivots in the supplied Z-up CAD frame, millimetres. Y is the horizontal joint axis.
const origins={base_link:[0,0,0],link1:[5,0,109],link2_1:[-38.5,0,228],link2_2:[.471143,0,250.5],link3_1:[-38.5,0,403],link3_2:[.471143,0,425.5],link4_1:[-213.5,0,403],link4_2:[-67.425442,0,437.472],link5:[-279.5,-2.225,437.25]};
const parents={base_link:null,link1:'base_link',link2_1:'link1',link2_2:'link1',link3_1:'link2_1',link3_2:'link2_2',link4_1:'link3_1',link4_2:'link3_2',link5:'link4_1'};
const names={base_link:'MG400_Base',link1:'MG400_J1',link2_1:'MG400_J2',link2_2:'MG400_ParallelLower',link3_1:'MG400_J3',link3_2:'MG400_ParallelTop',link4_1:'MG400_LevelWrist',link4_2:'MG400_ParallelForearm',link5:'MG400_J4'};
const convert=p=>[-p[1]/1000,p[2]/1000,-p[0]/1000];
const white=doc.createMaterial('MG400 enamel').setBaseColorFactor([.68,.73,.79,1]).setMetallicFactor(.12).setRoughnessFactor(.4).setDoubleSided(true);
const dark=doc.createMaterial('MG400 graphite').setBaseColorFactor([.095,.125,.17,1]).setMetallicFactor(.45).setRoughnessFactor(.38).setDoubleSided(true);
const metal=doc.createMaterial('MG400 linkage').setBaseColorFactor([.25,.31,.38,1]).setMetallicFactor(.65).setRoughnessFactor(.32).setDoubleSided(true);
const nodes={};
for(const key of Object.keys(origins)){
 const parent=parents[key],p=convert(origins[key]),q=parent?convert(origins[parent]):[0,0,0];
 nodes[key]=doc.createNode(names[key]).setTranslation(p.map((v,i)=>v-q[i]));(parent?nodes[parent]:cad).addChild(nodes[key]);
}
const parts=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
for(const part of parts){
 const origin=convert(origins[part.name]);
 const positions=part.positions.flatMap(p=>convert(p).map((v,i)=>v-origin[i]));
 const normals=part.normals.flatMap(p=>[-p[1],p[2],-p[0]]);
 const accessor=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const material=['base_link','link2_2','link4_2','link4_1'].includes(part.name)?white:['link2_1','link3_1','link5'].includes(part.name)?metal:dark;
 const primitive=doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',new Float32Array(positions))).setAttribute('NORMAL',accessor('VEC3',new Float32Array(normals))).setIndices(accessor('SCALAR',new Uint32Array(part.indices.flat()))).setMaterial(material);
 nodes[part.name].addChild(doc.createNode('CAD_'+part.name).setMesh(doc.createMesh(part.name).addPrimitive(primitive)));
}
cad.setExtras({source:'User supplied DOBOT MG400.stl',units:'metres',displayScale:3,activeJoints:['J1','J2','J3','J4'],parallelLinkage:true,kinematics:'MG400 four-axis with coupled parallelogram',note:'Visual rig reconstructed from a fused CAD export; not a controller or collision-certified digital twin.'});
await doc.transform(prune(),dedup(),weld(),quantize());
await io.write(fileURLToPath(new URL('../dist/models/mg400-rigged.glb',import.meta.url)),doc);
console.log('MG400: nine CAD parts, four active axes and three coupled links.');
