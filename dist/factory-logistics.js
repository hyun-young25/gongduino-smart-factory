(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/three.min.js'), require('./factory-arm.js'),require('./factory-supply.js'));
  else root.FactoryLogistics = factory(root.THREE, root.FactoryArm, root.FactorySupply);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE, Arm, Supply) {
  'use strict';
  const V = (x,y,z) => new THREE.Vector3(x,y,z);
  const smooth = t => t*t*(3-2*t);
  function create({scene, live, robots, docks, colors, makeItem, beltY, lineLength, parkZ, scanX=15,feeders=[],rackSlots=[],cellX=[], onRead, onEvent = () => {}}) {
    const state = {items:[], feedBelts:[], deliveries:[], elapsed:0, readCount:0, lastVerdict:null, dockCount:Object.fromEntries(docks.map(d=>[d.key,0]))};
    let pickupOwner=null, serial=0;
    function carton(){
      const c=colors[serial%colors.length],d=docks[Math.floor(serial/colors.length)%docks.length];
      return {id:++serial,c,d,mesh:makeItem(c),read:false,claimed:false,waiting:false,distance:0};
    }
    const supply=Supply.create({scene,robots:feeders,slots:rackSlots,carton,
      canAccept:cell=>!state.feedBelts.some(it=>it.cell===cell&&it.distance<.9),
      accept:(item,cell)=>{item.cell=cell;item.distance=0;item.mesh.position.set(cellX[cell],beltY,6.4);item.mesh.rotation.set(0,0,0);state.feedBelts.push(item);},
      onEvent:e=>onEvent({...e,time:state.elapsed})
    });
    const dockOwners = new Map();
    const pickupX = lineLength/2-.25;
    const pickupWorld = () => live.g.localToWorld(V(pickupX,beltY,0));
    function emit(a,event){onEvent({robot:a.index,event,id:a.job?.id,time:state.elapsed});}
    function routeToPickup(a) {
      const p=pickupWorld();
      return [{x:a.px,z:14},{x:14,z:14},{x:14,z:p.z},{x:p.x+1.05,z:p.z,act:'load'}];
    }
    function routeToDock(a) {
      const d=a.job.d;
      return [{x:16,z:a.g.position.z},{x:18,z:a.g.position.z},{x:18,z:d.z+2.2},{x:21.5+a.index*.9,z:d.z+2.2,act:'dock'}];
    }
    function routeToPark(a) {
      return [{x:24,z:a.job.d.z-2.1},{x:18,z:a.job.d.z-2.1},{x:18,z:14},{x:a.px,z:14},{x:a.px,z:parkZ,act:'park'}];
    }
    function localBox(a, mesh) { a.g.updateMatrixWorld(true); return a.g.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())); }
    function beginManipulation(a, kind) {
      a.g.rotation.y = kind==='load' ? -Math.PI/2 : Math.PI/2;
      a.g.updateMatrixWorld(true);
      const target = kind==='load' ? localBox(a,a.job.mesh) : a.g.worldToLocal(V(27.85,1.07,a.job.d.z));
      const near = target.clone(); near.x*=.8; near.z*=.8; near.y+=.12;
      const lifted = target.clone(); lifted.x*=.65; lifted.z*=.65; lifted.y+=.14;
      const carry=Arm.CARRY.clone();
      a.phases = kind==='load' ? [
        {label:'팔 뻗기',to:near,open:1,duration:.9},
        {label:'집기 위치 맞추기',to:target,open:1,duration:.7},
        {label:'집게 닫기',to:target,open:0,duration:.55,event:'grasp'},
        {label:'상자 들어 올리기',to:lifted,open:0,duration:.85},
        {label:'운반 자세',to:carry,open:0,duration:.9}
      ] : [
        {label:'내려놓기 위치로 이동',to:near,open:0,duration:1},
        {label:'상자 내려놓기',to:target,open:0,duration:.8},
        {label:'집게 열기',to:target,open:1,duration:.55,event:'release'},
        {label:'팔 회수',to:lifted,open:1,duration:.6},
        {label:'복귀 자세',to:carry,open:1,duration:.8}
      ];
      a.state=kind; a.phaseIndex=0; a.phaseTime=0;
      a.phaseFrom=a.arm.goal.clone(); a.openFrom=a.arm.opening;
      emit(a,kind+'-start');
    }
    function finishEvent(a,event) {
      if(event==='grasp') {
        // Reparent the same carton with its world transform preserved: no disappearing copy.
        a.g.updateMatrixWorld(true);
        a.arm.grip.attach(a.job.mesh);
        a.cargo=a.job.mesh;
        state.items.splice(state.items.indexOf(a.job),1);
      } else if(event==='release') {
        scene.attach(a.cargo);
        a.cargo.position.set(27.85,1.07,a.job.d.z);
        a.cargo.rotation.set(0,0,0);
        state.deliveries.push({mesh:a.cargo,dock:a.job.d,id:a.job.id});
        state.dockCount[a.job.d.key]++;
        a.cargo=null;
      }
      emit(a,event);
    }
    function manipulate(a,dt) {
      while(dt>0 && (a.state==='load'||a.state==='unload')) {
        const phase=a.phases[a.phaseIndex], used=Math.min(dt,phase.duration-a.phaseTime);
        a.phaseTime+=used; dt-=used;
        const t=smooth(Math.min(1,a.phaseTime/phase.duration));
        Arm.pose(a.arm,a.phaseFrom.clone().lerp(phase.to,t),a.openFrom+(phase.open-a.openFrom)*t);
        a.label=phase.label;
        if(a.phaseTime+1e-8<phase.duration)break;
        if(phase.event)finishEvent(a,phase.event);
        a.phaseIndex++; a.phaseTime=0;
        if(a.phaseIndex===a.phases.length) {
          if(a.state==='load') {pickupOwner=null;a.path=routeToDock(a);a.label='도크로 운반 중';}
          else {dockOwners.delete(a.job.d.key);a.path=routeToPark(a);a.label='대기 위치로 복귀';}
          a.state='move'; break;
        }
        a.phaseFrom=a.arm.goal.clone();a.openFrom=a.arm.opening;
      }
    }
    function step(dt) {
      if(dt<=0)return;
      state.elapsed+=dt;supply.step(dt);
      // The leading carton stops at the pickup point; the following cartons queue on the belt.
      let stop=pickupX;
      const beltMoving=!(pickupOwner?.state==='load' && pickupOwner.cargo);
      for(const it of state.items) {
        const before=it.mesh.position.x;
        it.mesh.position.x=Math.min(stop,before+(beltMoving?dt*2.3:0));
        it.waiting=Math.abs(it.mesh.position.x-stop)<.001;
        stop=it.mesh.position.x-.8;
        if(!it.read && it.mesh.position.x>scanX) {it.read=true;state.readCount++;state.lastVerdict=it;onRead(it);}
      }
      // Cell belts stop at the main line until a carton-sized merge gap is available.
      for(let cell=0;cell<cellX.length;cell++){
        let stop=4.6;
        const queue=state.feedBelts.filter(it=>it.cell===cell).sort((a,b)=>b.distance-a.distance);
        for(const it of queue){it.distance=Math.min(stop,it.distance+dt*1.4);stop=it.distance-.8;it.mesh.position.set(cellX[cell],beltY,6.4+it.distance);}
        const first=queue[0],entryX=cellX[cell]-live.g.position.x;
        if(first&&first.distance>=4.6-.001&&!state.items.some(it=>Math.abs(it.mesh.position.x-entryX)<.82)){
          live.g.attach(first.mesh);first.mesh.position.set(entryX,beltY,0);
          state.feedBelts.splice(state.feedBelts.indexOf(first),1);state.items.push(first);state.items.sort((a,b)=>b.mesh.position.x-a.mesh.position.x);
          onEvent({event:'rack-merged',id:first.id,origin:first.origin,time:state.elapsed});
        }
      }
      const head=state.items[0];
      if(!pickupOwner && head && !head.claimed && head.mesh.position.x>=pickupX-.001) {
        const a=robots.find(r=>r.state==='idle'&&r.arm);
        if(a){pickupOwner=a;head.claimed=true;a.job=head;a.path=routeToPickup(a);a.state='move';a.label='컨베이어 접근';emit(a,'assigned');}
      }
      for(const a of robots) {
        if(a.state==='load'||a.state==='unload'){manipulate(a,dt);continue;}
        if(a.state==='dock-wait') {
          if(dockOwners.has(a.job.d.key))continue;
          dockOwners.set(a.job.d.key,a);
          a.path=[{x:25,z:a.job.d.z},{x:26.8,z:a.job.d.z,act:'unload'}];
          a.state='move';a.label='출하 컨베이어 접근';
        }
        if(a.state!=='move')continue;
        let budget=5.5*dt;
        while(budget>0&&a.path.length) {
          const wp=a.path[0],p=a.g.position,dx=wp.x-p.x,dz=wp.z-p.z,dist=Math.hypot(dx,dz);
          if(dist>.001){const heading=Math.atan2(dx,dz);let diff=heading-a.g.rotation.y;diff=Math.atan2(Math.sin(diff),Math.cos(diff));a.g.rotation.y+=diff*Math.min(1,dt*8);}
          if(dist>budget){p.x+=dx/dist*budget;p.z+=dz/dist*budget;break;}
          p.x=wp.x;p.z=wp.z;budget-=dist;a.path.shift();
          if(wp.act==='load'||wp.act==='unload'){beginManipulation(a,wp.act);break;}
          if(wp.act==='dock'){a.state='dock-wait';a.label='출하 순서 대기';break;}
          if(wp.act==='park'){a.state='idle';a.label='대기 중';a.job=null;a.g.rotation.y=0;emit(a,'park');break;}
        }
      }
      for(let i=state.deliveries.length-1;i>=0;i--){const d=state.deliveries[i];d.mesh.position.x+=dt*.8;if(d.mesh.position.x>30.5){scene.remove(d.mesh);state.deliveries.splice(i,1);onEvent({event:'shipped',id:d.id,time:state.elapsed});}}
    }
    function reset() {
      for(const it of state.items)it.mesh.parent?.remove(it.mesh);
      for(const it of state.feedBelts)it.mesh.parent?.remove(it.mesh);
      for(const d of state.deliveries)d.mesh.parent?.remove(d.mesh);
      for(const a of robots){if(a.cargo)a.cargo.parent?.remove(a.cargo);a.cargo=null;a.job=null;a.state='idle';a.label='대기 중';a.path=[];a.phases=[];a.g.position.set(a.px,0,parkZ);a.g.rotation.y=0;if(a.arm)Arm.pose(a.arm,Arm.CARRY,1);}
      state.items.length=0;state.feedBelts.length=0;state.deliveries.length=0;state.elapsed=0;state.readCount=0;state.lastVerdict=null;
      for(const d of docks)state.dockCount[d.key]=0;
      serial=0;pickupOwner=null;dockOwners.clear();supply.reset();
    }
    return {state,supply,step,reset};
  }
  return {create};
});
