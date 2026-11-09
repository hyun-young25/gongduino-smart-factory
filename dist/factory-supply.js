(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/three.min.js'),require('./factory-arm.js'));
  else root.FactorySupply=factory(root.THREE,root.FactoryArm);
})(typeof globalThis!=='undefined'?globalThis:this,function(THREE,Arm){
  'use strict';
  const V=(x,y,z)=>new THREE.Vector3(x,y,z),smooth=t=>t*t*(3-2*t);
  function create({scene,robots,slots,carton,canAccept,accept,onEvent=()=>{}}){
    const stock=slots.map(s=>({...s,item:null,reserved:false}));
    const state={picked:0,fed:0};
    function refill(){
      let added=0;
      for(const slot of stock){if(slot.item||slot.reserved)continue;const it=carton();it.origin=slot.id;it.cell=slot.cell;it.mesh.position.set(slot.x,slot.y,slot.z);scene.add(it.mesh);slot.item=it;added++;}
      return added;
    }
    function local(a,world){a.g.updateMatrixWorld(true);return a.g.worldToLocal(world.clone());}
    function begin(a,kind){
      a.g.rotation.y=kind==='rack-pick'?-Math.PI/2:0;a.g.updateMatrixWorld(true);
      const target=kind==='rack-pick'?local(a,a.job.item.mesh.getWorldPosition(new THREE.Vector3())):local(a,V(a.cellX,1.21,6.4));
      const near=target.clone();near.z*=.8;near.y+=.08;
      const lift=target.clone();lift.y+=.06;
      const retract=target.clone();retract.z*=.62;retract.y+=.08;
      a.phases=kind==='rack-pick'?[
        {label:'랙 상자로 팔 뻗기',to:near,open:1,duration:.85},
        {label:'랙 집기 위치 맞추기',to:target,open:1,duration:.7},
        {label:'랙 상자 잡기',to:target,open:0,duration:.55,event:'rack-grasp'},
        {label:'선반에서 들어 올리기',to:lift,open:0,duration:.55},
        {label:'랙에서 상자 꺼내기',to:retract,open:0,duration:.85},
        {label:'랙 운반 자세',to:Arm.CARRY.clone(),open:0,duration:.8}
      ]:[
        {label:'컨베이어 위로 팔 뻗기',to:near,open:0,duration:.85},
        {label:'컨베이어에 상자 놓기',to:target,open:0,duration:.75},
        {label:'투입 집게 열기',to:target,open:1,duration:.55,event:'rack-release'},
        {label:'투입 후 팔 회수',to:near,open:1,duration:.65},
        {label:'다음 랙 작업 준비',to:Arm.CARRY.clone(),open:1,duration:.7}
      ];
      a.state=kind;a.phaseIndex=0;a.phaseTime=0;a.phaseFrom=a.arm.goal.clone();a.openFrom=a.arm.opening;
    }
    function manipulate(a,dt){
      while(dt>0&&(a.state==='rack-pick'||a.state==='belt-place')){
        const p=a.phases[a.phaseIndex],used=Math.min(dt,p.duration-a.phaseTime);a.phaseTime+=used;dt-=used;
        const t=smooth(Math.min(1,a.phaseTime/p.duration));Arm.pose(a.arm,a.phaseFrom.clone().lerp(p.to,t),a.openFrom+(p.open-a.openFrom)*t);a.label=p.label;
        if(a.phaseTime+1e-8<p.duration)break;
        if(p.event==='rack-grasp'){
          const item=a.job.item;a.arm.grip.attach(item.mesh);a.cargo=item.mesh;a.job.slot.item=null;state.picked++;
          onEvent({event:p.event,id:item.id,robot:a.index,origin:item.origin});
        }else if(p.event==='rack-release'){
          const item=a.job.item;scene.attach(item.mesh);accept(item,a.cell);a.cargo=null;state.fed++;
          onEvent({event:p.event,id:item.id,robot:a.index,origin:item.origin});
        }
        a.phaseIndex++;a.phaseTime=0;
        if(a.phaseIndex===a.phases.length){
          if(a.state==='rack-pick'){a.path=[{x:a.cellX-.3,z:5.35},{x:a.cellX,z:5.35,act:'place'}];a.state='rack-move';a.label='연결 컨베이어로 운반';}
          else{a.job.slot.reserved=false;a.job=null;a.state='rack-idle';a.label='다음 랙 상자 대기';}
          break;
        }
        a.phaseFrom=a.arm.goal.clone();a.openFrom=a.arm.opening;
      }
    }
    function step(dt){
      for(const a of robots){
        if(!a.arm)continue;
        if(a.state==='rack-idle'){
          const slot=stock.find(s=>s.cell===a.cell&&s.item&&!s.reserved);
          if(!slot){a.label='랙 재입고 대기';continue;}
          slot.reserved=true;a.job={slot,item:slot.item};a.path=[{x:a.cellX-.3,z:5.35},{x:a.cellX-.3,z:slot.z,act:'pick'}];a.state='rack-move';a.label='랙 상자에 접근';
        }
        if(a.state==='rack-pick'||a.state==='belt-place'){manipulate(a,dt);continue;}
        if(a.state==='belt-wait'){
          a.label='컨베이어 투입 순서 대기';if(canAccept(a.cell))begin(a,'belt-place');continue;
        }
        if(a.state!=='rack-move')continue;
        let budget=2.2*dt;
        while(budget>0&&a.path.length){
          const w=a.path[0],p=a.g.position,dx=w.x-p.x,dz=w.z-p.z,d=Math.hypot(dx,dz);
          if(d>.001){let diff=Math.atan2(dx,dz)-a.g.rotation.y;diff=Math.atan2(Math.sin(diff),Math.cos(diff));a.g.rotation.y+=diff*Math.min(1,dt*8);}
          if(d>budget){p.x+=dx/d*budget;p.z+=dz/d*budget;break;}
          p.x=w.x;p.z=w.z;budget-=d;a.path.shift();
          if(w.act==='pick'){begin(a,'rack-pick');break;}
          if(w.act==='place'){a.state='belt-wait';break;}
        }
      }
    }
    function reset(){
      for(const slot of stock){if(slot.item)slot.item.mesh.parent?.remove(slot.item.mesh);slot.item=null;slot.reserved=false;}
      for(const a of robots){a.cargo?.parent?.remove(a.cargo);a.cargo=null;a.job=null;a.path=[];a.state='rack-idle';a.label='랙 상자 대기';a.g.position.set(a.cellX,0,5.35);a.g.rotation.y=0;if(a.arm)Arm.pose(a.arm,Arm.CARRY,1);}
      state.picked=0;state.fed=0;refill();
    }
    reset();
    return {state,stock,step,reset,refill,get remaining(){return stock.filter(s=>s.item).length;},get refillable(){return stock.filter(s=>!s.item&&!s.reserved).length;}};
  }
  return {create};
});
