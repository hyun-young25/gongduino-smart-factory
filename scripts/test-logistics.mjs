import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const require=createRequire(import.meta.url);
const THREE=require('../dist/vendor/three.min.js');
const Arm=require('../dist/factory-arm.js');
const Logistics=require('../dist/factory-logistics.js');
const Layout=require('../dist/factory-layout.js');
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(fileURLToPath(new URL('../dist/models/amr-rigged.glb',import.meta.url)));
function nodeTree(n){const o=new THREE.Group();o.name=n.getName();o.position.fromArray(n.getTranslation());o.quaternion.fromArray(n.getRotation());o.scale.fromArray(n.getScale());for(const child of n.listChildren())o.add(nodeTree(child));return o;}
const source=new THREE.Group();for(const n of doc.getRoot().listScenes()[0].listChildren())source.add(nodeTree(n));
const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial();
const robots=Array.from({length:4},(_,i)=>{const g=new THREE.Group();g.position.set(14.5+i*2.8,0,15.5);scene.add(g);const arm=Arm.create(source,material);g.add(arm.group);return {index:i,g,px:g.position.x,arm,cargo:null,state:'idle',path:[],label:'대기 중'};});
const live={g:new THREE.Group()};live.g.position.set(-8,0,11);scene.add(live.g);
const warehouse=Layout.create({scene,M:()=>material,mats:new Proxy({},{get:()=>material}),box:(parent,w,h,d,mat,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}});
const feeders=warehouse.cellX.map((cellX,cell)=>{const g=new THREE.Group();scene.add(g);const arm=Arm.create(source,material);g.add(arm.group);return {index:4+cell,cell,cellX,g,arm,cargo:null,state:'rack-idle',path:[]};});
const docks=[{key:'seoul',z:-9},{key:'daejeon',z:0},{key:'busan',z:9}],colors=[{key:'red'},{key:'yellow'},{key:'green'}];
const events=[];
const sim=Logistics.create({scene,live,robots,docks,colors,makeItem:()=>new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),material),beltY:1.21,lineLength:36,parkZ:15.5,feeders,rackSlots:warehouse.rackSlots,cellX:warehouse.cellX,onRead:()=>{},onEvent:e=>events.push(e)});
function distanceToFence(p,f){const dx=f.x2-f.x1,dz=f.z2-f.z1,t=Math.max(0,Math.min(1,((p.x-f.x1)*dx+(p.z-f.z1)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-f.x1-t*dx,p.z-f.z1-t*dz);}
const world=new THREE.Vector3(),expected=new THREE.Vector3();
// Test the authored GLB hierarchy, not a substitute kinematic skeleton.
for(const a of robots){for(const target of [Arm.CARRY,new THREE.Vector3(0,1.21,1.05),new THREE.Vector3(0,1.33,.84),new THREE.Vector3(0,1.07,1.05)]){
  assert.equal(Arm.pose(a.arm,target,0).reachable,true,'reachable task pose');
  scene.updateMatrixWorld(true);a.arm.grip.getWorldPosition(world);expected.copy(target);expected.y+=.2;a.g.localToWorld(expected);
  assert.ok(world.distanceTo(expected)<.0001,'gripper reaches carton without teleport');
}}
sim.reset();
const seen=new Set();let holdSamples=0;
for(const dt of [.05,.15]){
  sim.reset();events.length=0;
  const originals=new Map(sim.supply.stock.map(s=>[s.item.id,s.item.mesh]));
  assert.equal(originals.size,24,'24 actual pickable cartons on the racks');
  for(let t=0;t<300;t+=dt){
    sim.step(dt);scene.updateMatrixWorld(true);
    for(const a of [...robots,...feeders]){
      for(const f of warehouse.fenceSegments)assert.ok(distanceToFence(a.g.position,f)>.85,'robot footprint clears safety fences');
      for(const r of warehouse.solids)assert.ok(a.g.position.x<r.minX-.85||a.g.position.x>r.maxX+.85||a.g.position.z<r.minZ-.85||a.g.position.z>r.maxZ+.85,'robot footprint clears storage racks');
      seen.add(a.state);seen.add(a.label);
      if(a.cargo){
        assert.equal(a.cargo.parent,a.arm.grip,'one original carton attached to gripper');
        a.cargo.getWorldPosition(world);expected.copy(a.arm.goal);a.g.localToWorld(expected);
        assert.ok(world.distanceTo(expected)<.002,'held carton follows wrist exactly');holdSamples++;
      }
      if(a.arm){assert.equal(Arm.pose(a.arm,a.arm.goal,a.arm.opening).reachable,true,'every interpolated pose is reachable');}
    }
    for(let i=1;i<sim.state.items.length;i++)assert.ok(sim.state.items[i-1].mesh.position.x-sim.state.items[i].mesh.position.x>=.7999,'queued boxes do not overlap');
    for(const cell of warehouse.cellX.keys()){
      const queue=sim.state.feedBelts.filter(it=>it.cell===cell).sort((a,b)=>b.distance-a.distance);
      for(let i=1;i<queue.length;i++)assert.ok(queue[i-1].distance-queue[i].distance>=.7999,'cell belt cartons stay spaced');
    }
    for(const it of [...sim.state.items,...sim.state.feedBelts])assert.equal(it.mesh,originals.get(it.id),'same rack carton reaches the conveyor');
    const grasped=events.filter(e=>e.event==='grasp').map(e=>e.id),released=events.filter(e=>e.event==='release').map(e=>e.id);
    assert.equal(new Set(grasped).size,grasped.length,'each box picked once');
    assert.equal(new Set(released).size,released.length,'each box released once');
    for(const id of released)assert.ok(grasped.includes(id),'release follows grasp');
    assert.equal(Object.values(sim.state.dockCount).reduce((a,b)=>a+b,0),released.length,'count changes on release only');
  }
  for(const d of docks)assert.ok(sim.state.dockCount[d.key]>0,'all destinations receive boxes');
  assert.equal(sim.supply.remaining,0,'all rack stock removed through the gripper');
  assert.equal(sim.supply.state.picked,24);assert.equal(sim.supply.state.fed,24);
  assert.equal(sim.state.readCount,24,'all rack cartons reach the scanner');
  assert.equal(events.filter(e=>e.event==='shipped').length,24,'all 24 original cartons reach trucks');
  for(const id of originals.keys())for(const event of ['rack-grasp','rack-release','rack-merged','grasp','release','shipped'])assert.equal(events.filter(e=>e.id===id&&e.event===event).length,1,'every carton completes each handoff once');
  assert.ok(events.some(e=>e.event==='shipped'),'outbound conveyor transfers into truck');
  console.log(JSON.stringify({dt,counts:sim.state.dockCount,events:events.length}));
}
for(const resetPhase of ['랙 상자 잡기','랙에서 상자 꺼내기','투입 집게 열기','집게 닫기','상자 들어 올리기','집게 열기']){
  sim.reset();let found=false;
  for(let t=0;t<120;t+=.05){sim.step(.05);scene.updateMatrixWorld(true);if([...robots,...feeders].some(a=>a.label===resetPhase)){found=true;break;}}
  assert.ok(found,'reset phase reached');sim.reset();
  assert.equal(sim.state.items.length,0);assert.equal(sim.state.feedBelts.length,0);assert.equal(sim.state.deliveries.length,0);assert.equal(sim.supply.remaining,24);
  for(const a of robots){assert.equal(a.cargo,null);assert.equal(a.state,'idle');assert.equal(a.arm.grip.children.length,0,'reset removes held carton');}
  for(const a of feeders){assert.equal(a.cargo,null);assert.equal(a.state,'rack-idle');assert.equal(a.arm.grip.children.length,0);}
}
sim.reset();assert.equal(sim.supply.refill(),0,'restock never duplicates occupied shelves');
for(let t=0;t<30;t+=.05){sim.step(.05);scene.updateMatrixWorld(true);}
const refillable=sim.supply.refillable,remaining=sim.supply.remaining;
assert.ok(refillable>0);assert.equal(sim.supply.refill(),refillable);assert.equal(sim.supply.remaining,remaining+refillable);
assert.ok(seen.has('load')&&seen.has('unload')&&seen.has('dock-wait'));
console.log(JSON.stringify({passed:true,holdSamples,states:[...seen]}));
