(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/three.min.js'));
  else root.FactoryArm=factory(root.THREE);
})(typeof globalThis!=='undefined'?globalThis:this,function(THREE){
  'use strict';
  // CAD is metre-based. The factory uses a uniform 3× display scale.
  const SCALE=3, MOUNT=.45, UPPER=.175*SCALE, LOWER=.175*SCALE, TOOL=.08;
  const CARRY=new THREE.Vector3(.10,1,.75), DEG=Math.PI/180;
  const LIMITS={J1:[-160*DEG,160*DEG],J2:[-25*DEG,85*DEG],J3:[-25*DEG,105*DEG],J4:[-Math.PI*2,Math.PI*2]};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function create(source,material){
    const group=source.clone(true),joints={};
    for(const name of ['Base','J1','J2','J3','J4','ParallelLower','ParallelTop','ParallelForearm','LevelWrist']){
      joints[name]=group.getObjectByName('MG400_'+name);
      if(!joints[name])throw new Error('Missing MG400 joint: '+name);
    }
    const gripperMaterial=material.clone();gripperMaterial.color.setHex(0x23364b).convertSRGBToLinear();
    const flange=-.08725;
    function box(w,h,d,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w/SCALE,h/SCALE,d/SCALE),gripperMaterial);m.position.set(x/SCALE,flange+y/SCALE,z/SCALE);joints.J4.add(m);return m;}
    box(.74,.055,.12,0,-.015,0);
    joints.JawMinus=box(.055,.28,.12,-.27,-.18,0);
    joints.JawPlus=box(.055,.28,.12,.27,-.18,0);
    const grip=new THREE.Group();grip.name='BoxGrip';grip.position.y=flange-TOOL/SCALE;joints.J4.add(grip);
    group.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
    const arm={group,joints,grip,goal:CARRY.clone(),opening:1,angles:{}};
    pose(arm,CARRY,1);return arm;
  }
  function pose(arm,boxCentre,opening=arm.opening){
    const dx=boxCentre.x,dz=boxCentre.z+.005*SCALE,lateral=.002225*SCALE;
    const radius=Math.hypot(dx,dz);
    const yaw=Math.atan2(dx,dz)-Math.asin(clamp(lateral/Math.max(radius,.0001),-1,1));
    const r=Math.sqrt(Math.max(0,radius*radius-lateral*lateral))-(.0435+.066)*SCALE;
    const dy=boxCentre.y+.2+TOOL+.053*SCALE-(MOUNT+.228*SCALE);
    const distance=Math.hypot(r,dy),d=clamp(distance,.0001,UPPER+LOWER-.00001);
    const shoulder=Math.atan2(r,dy)-Math.acos(clamp(d/(2*UPPER),-1,1));
    const forearm=shoulder+Math.acos(clamp((d*d-UPPER*UPPER-LOWER*LOWER)/(2*UPPER*LOWER),-1,1));
    const elbow=forearm-Math.PI/2;
    arm.joints.J1.rotation.y=yaw;
    arm.joints.J2.rotation.x=shoulder;
    arm.joints.J3.rotation.x=elbow-shoulder;
    arm.joints.LevelWrist.rotation.x=-elbow;
    // Both sides of the four-bar linkage move together; the head stays level.
    arm.joints.ParallelLower.rotation.x=shoulder;
    arm.joints.ParallelTop.rotation.x=-shoulder;
    arm.joints.ParallelForearm.rotation.x=elbow;
    arm.joints.J4.rotation.y=-yaw;
    const gap=.5+.18*clamp(opening,0,1);
    arm.joints.JawMinus.position.x=-(gap+.055)/(2*SCALE);
    arm.joints.JawPlus.position.x=(gap+.055)/(2*SCALE);
    arm.angles={J1:yaw,J2:shoulder,J3:elbow,J4:-yaw};
    arm.goal.copy(boxCentre);arm.opening=opening;
    const withinLimits=Object.entries(arm.angles).every(([name,v])=>v>=LIMITS[name][0]-1e-7&&v<=LIMITS[name][1]+1e-7);
    return {reachable:distance<UPPER+LOWER&&radius>lateral&&withinLimits,withinLimits,distance,angles:arm.angles};
  }
  return {create,pose,CARRY,SCALE,TOOL,UPPER,LOWER,LIMITS};
});
