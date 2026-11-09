(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/three.min.js'));
  else root.FactoryLayout=factory(root.THREE);
})(typeof globalThis!=='undefined'?globalThis:this,function(THREE){
  'use strict';
  const CELL_X=[-19,-11,-3,5];
  const INBOUND=[[-14.5,-11.8],[-27,-11.8],[-27,11],[-25.6,11]];
  function create({scene,M,mats,box}){
    const root=new THREE.Group();root.name='WarehouseLayout';scene.add(root);
    const blue=M(0x1259aa),binBlue=M(0x246bb6),binLight=M(0x4789cb),orange=M(0xf08320);
    const yellow=M(0xf4c82e),steel=M(0x63717c),meshDark=M(0x29343e),green=M(0x2c8064),paint=M(0xe3e8e6);
    const buckets=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
    const solids=[],fenceSegments=[],wire=[],rackSlots=[];
    function block(mat,w,h,d,x,y,z,rot=0){
      if(!buckets.has(mat))buckets.set(mat,[]);
      matrix.compose(new THREE.Vector3(x,y,z),q.setFromAxisAngle(up,rot),new THREE.Vector3(w,h,d));
      buckets.get(mat).push(matrix.clone());
    }
    function localBlock(mat,w,h,d,lx,y,lz,x,z,rot){
      block(mat,w,h,d,x+lx*Math.cos(rot)+lz*Math.sin(rot),y,z-lx*Math.sin(rot)+lz*Math.cos(rot),rot);
    }
    function rack(x,z,bays,bayWidth,depth,height,levels,totes=false,rot=0,pickCell=null){
      const length=bays*bayWidth;
      const add=(mat,w,h,d,lx,y,lz)=>localBlock(mat,w,h,d,lx,y,lz,x,z,rot);
      for(let b=0;b<=bays;b++)for(const side of [-1,1]){
        const lx=-length/2+b*bayWidth;
        add(blue,.14,height,.14,lx,height/2,side*depth/2);
        add(meshDark,.3,.08,.3,lx,.04,side*depth/2);
      }
      for(const y of levels){
        add(steel,length,.045,depth,0,y,0);
        for(const side of [-1,1])add(orange,length,.15,.1,0,y,side*depth/2);
        for(let b=0;b<bays;b++){
          const middle=-length/2+(b+.5)*bayWidth;
          const count=totes?2:3;
          for(let k=0;k<count;k++){
            const lx=middle+(k-(count-1)/2)*(totes?1.32:1.7);
            if(totes){
              if(pickCell!==null && y===levels[0] && b<3){
                add(blue,1.12,.08,.97,lx,y+.06,0);
                rackSlots.push({cell:pickCell,x:CELL_X[pickCell]-1.55,y:.7,z:z-lx,id:'R'+(pickCell+1)+'-'+(b*2+k+1)});
                continue;
              }
              const bm=(b+k+Math.round(y*10))%3?binBlue:binLight;
              add(bm,1.12,.63,.97,lx,y+.34,0);
              add(blue,1.18,.055,1.03,lx,y+.68,0);
              add(steel,.36,.08,.018,lx,y+.48,depth/2+.01);
              add(paint,.18,.12,.019,lx+.32,y+.3,depth/2+.012);
            }else{
              const h=.88+((b+k)%3)*.17;
              add((b+k)%2?mats.card:mats.card2,1.35,h,1.35,lx,y+.09+h/2,0);
              add(mats.wood,1.48,.12,1.45,lx,y+.09,0);
              add(paint,.3,.18,.019,lx,y+.35,depth/2+.012);
              add(mats.wood,.055,h+.02,1.36,lx,y+.09+h/2,0);
            }
          }
        }
      }
      const halfX=rot?depth/2:length/2,halfZ=rot?length/2:depth/2;
      solids.push({minX:x-halfX,maxX:x+halfX,minZ:z-halfZ,maxZ:z+halfZ,name:'rack'});
    }
    // High pallet racking at the back, and low tote racking in four work cells.
    rack(1.2,-15.7,8,5.8,1.9,5.2,[.22,1.85,3.48]);
    CELL_X.forEach((x,i)=>{for(const dx of [-1.8,1.8])rack(x+dx,-2,4,3,1.15,2.65,[.35,1.55],true,Math.PI/2,dx<0?i:null);});
    function fence(x1,z1,x2,z2){
      fenceSegments.push({x1,z1,x2,z2});
      const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx),panels=Math.ceil(length/2.7);
      for(let i=0;i<=panels;i++){const t=i/panels;block(yellow,.11,2.5,.11,x1+dx*t,1.25,z1+dz*t);block(meshDark,.24,.07,.24,x1+dx*t,.035,z1+dz*t);}
      for(const y of [.18,2.32])block(yellow,length,.07,.07,(x1+x2)/2,y,(z1+z2)/2,rot);
      const point=(d,y)=>[x1+dx*d/length,y,z1+dz*d/length];
      for(let d=.18;d<length;d+=.27)wire.push(...point(d,.25),...point(d,2.25));
      for(let y=.25;y<2.3;y+=.27)wire.push(...point(0,y),...point(length,y));
    }
    const boundaries=[-23.6,-15.4,-7.4,.6,9.6];
    fence(boundaries[0],-10.5,boundaries[4],-10.5);
    for(const x of boundaries)fence(x,-10.5,x,8.7);
    for(let i=0;i<4;i++){
      const x=CELL_X[i];
      fence(boundaries[i],8.7,x-1.15,8.7);fence(x+1.15,8.7,boundaries[i+1],8.7);
      for(const dx of [-1.15,1.15])block(yellow,.14,2.9,.14,x+dx,1.45,8.7);
      block(yellow,2.44,.14,.14,x,2.9,8.7);
      // Local workbench, terminal and stack light stand beside the belt aperture.
      block(blue,1.25,.85,.85,x+2.45,.425,6.4);
      block(steel,1.4,.09,.95,x+2.45,.9,6.4);
      block(meshDark,.1,1.7,.1,x+2.65,.85,7.35);
      block(meshDark,.78,.5,.1,x+2.65,1.75,7.35);
      block(M(0x5cadc4,{emissive:0x0e2935,emissiveIntensity:.25}),.63,.34,.025,x+2.65,1.76,7.41);
      block(steel,.07,2.3,.07,x+2.8,1.15,7.8);
      block(i===0?mats.orange:mats.grey,.18,.35,.18,x+2.8,2.32,7.8);
    }
    const wireGeometry=new THREE.BufferGeometry();wireGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));
    root.add(new THREE.LineSegments(wireGeometry,new THREE.LineBasicMaterial({color:0x26313a,transparent:true,opacity:.62,depthWrite:false})));
    // Pedestrian aisle and separate robot travel lanes.
    block(green,39,.018,1.65,-8.5,.015,15.5);
    for(const z of [14.6,16.4])block(paint,39,.025,.08,-8.5,.028,z);
    for(let x=-26;x<=9;x+=5){block(paint,.8,.03,.1,x,.04,15.5);block(paint,.4,.03,.1,x+.3,.04,15.32,-Math.PI/4);block(paint,.4,.03,.1,x+.3,.04,15.68,Math.PI/4);}
    for(const x of [13,18.8])block(yellow,.085,.025,26,x,.025,1);
    for(const d of [-9,0,9])for(const z of [d-1.8,d+1.8])block(yellow,10.5,.025,.07,24.2,.025,z);
    // Receiving shutters on the left and a compact mezzanine control booth.
    for(const z of [-7,1]){
      block(meshDark,.1,4.0,4.5,-29.77,2,z);
      block(mats.plate,.13,3.5,3.9,-29.68,1.8,z);
      for(let y=.25;y<3.5;y+=.27)block(steel,.15,.025,3.9,-29.58,y,z);
      block(blue,.16,.45,4.5,-29.56,4,z);
      for(const dz of [-2.3,2.3])block(yellow,.22,.9,.22,-29.2,.45,z+dz);
    }
    const cx=-26.6,cz=-15.2;
    block(steel,4.3,.2,3.7,cx,2.8,cz);
    for(const dx of [-2,2])for(const dz of [-1.7,1.7])block(meshDark,.15,5.1,.15,cx+dx,2.55,cz+dz);
    block(mats.white,4.25,.17,3.7,cx,5.1,cz);
    block(mats.glass,4.1,1.65,.045,cx,4.05,cz+1.7);
    block(mats.glass,.045,1.65,3.4,cx+2,4.05,cz);
    block(blue,3.2,.7,.8,cx,3.2,cz+.2);
    // Incoming pallet buffer, outside the fenced cells.
    for(const [x,z] of [[-25.2,-7],[-25.2,-4],[-25.2,-1]]){
      block(mats.wood,1.25,.14,1.2,x,.07,z);
      block(mats.card,1,.85,.95,x,.57,z);
    }
    for(const [mat,transforms] of buckets){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,transforms.length);transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;root.add(mesh);}
    // These straight segments and the front sorting line form the perimeter U.
    const conveyors=[];
    function segment(x,z,length,rotation=0){
      const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
      const fallback=new THREE.Group();g.add(fallback);
      box(fallback,length,.12,1.12,mats.belt,0,.9,0);
      for(const side of [-1,1])box(fallback,length,.14,.09,blue,0,.88,side*.6);
      for(let p=-length/2+.4;p<length/2;p+=2.5)for(const side of [-1,1])box(fallback,.08,.84,.08,steel,p,.42,side*.45);
      conveyors.push({g,fallback,length});return g;
    }
    segment(-20.15,-11.8,12.3);
    segment(-27,-.4,21.4,Math.PI/2);
    segment(-19,8.2,4.4,Math.PI/2);
    for(const z of [-11.8,11]){
      box(root,2.05,.13,2.05,mats.belt,-27,.895,z);
      for(const dx of [-.58,.58])for(const dz of [-.58,.58])box(root,.1,.83,.1,steel,-27+dx,.415,z+dz);
      for(let offset=-.9;offset<=.9;offset+=.16)box(root,1.85,.025,.055,mats.alu,-27,.974,z+offset,false);
    }
    return {root,conveyors,solids,fenceSegments,rackSlots,inboundPath:INBOUND.map(([x,z])=>({x,z})),cellX:CELL_X};
  }
  return {create,CELL_X,INBOUND};
});
