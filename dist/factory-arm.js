(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/three.min.js'));
  else root.FactoryArm = factory(root.THREE);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE) {
  'use strict';
  const SCALE = 1.69381, CENTRE_Z = .0237645, TOOL = .157;
  const UPPER = .425 * SCALE, LOWER = Math.hypot(.3684, .1341) * SCALE;
  const REST_FOREARM = Math.atan2(.1341, -.3684);
  const CARRY = new THREE.Vector3(0, .91, .28);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function create(source, material) {
    const model = source.clone(true);
    model.position.set(0, 0, -CENTRE_Z); model.scale.setScalar(1);
    const group = new THREE.Group(); group.scale.setScalar(SCALE); group.add(model);
    const joints = {};
    for (const name of ['Yaw', 'Shoulder', 'Elbow', 'Wrist', 'JawMinus', 'JawPlus']) {
      joints[name] = model.getObjectByName('Pivot_' + name);
      if (!joints[name]) throw new Error('Missing robot joint: ' + name);
    }
    // A cross-slide supports the original model's fingers while they open around a carton.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.045, .45, .025), material);
    rail.position.z = .105; joints.Wrist.add(rail);
    const grip = new THREE.Group(); grip.name = 'BoxGrip'; grip.position.z = TOOL;
    joints.Wrist.add(grip);
    group.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    const arm = {group, joints, grip, goal:CARRY.clone(), opening:1};
    pose(arm, CARRY, 1);
    return arm;
  }
  function pose(arm, boxCentre, opening = arm.opening) {
    const dx = boxCentre.x, dz = boxCentre.z - (-.01 - CENTRE_Z) * SCALE;
    const dy = boxCentre.y + .2 + TOOL * SCALE - .513 * SCALE;
    const r = Math.hypot(dx, dz), rawDistance = Math.hypot(r, dy);
    const distance = clamp(rawDistance, Math.abs(UPPER - LOWER) + .001, UPPER + LOWER - .001);
    const shoulder = Math.atan2(r, dy) - Math.acos(clamp((UPPER * UPPER + distance * distance - LOWER * LOWER) / (2 * UPPER * distance), -1, 1));
    const bend = Math.acos(clamp((distance * distance - UPPER * UPPER - LOWER * LOWER) / (2 * UPPER * LOWER), -1, 1));
    const forearm = shoulder + bend;
    arm.joints.Yaw.rotation.y = Math.atan2(dx, dz);
    arm.joints.Shoulder.rotation.x = shoulder;
    arm.joints.Elbow.rotation.x = forearm - shoulder - REST_FOREARM;
    arm.joints.Wrist.rotation.x = Math.PI / 2 - forearm + REST_FOREARM;
    const gap = .5 + .18 * clamp(opening, 0, 1);
    arm.joints.JawMinus.position.y = -(gap / (2 * SCALE) - .017);
    arm.joints.JawPlus.position.y = gap / (2 * SCALE) - .017;
    arm.goal.copy(boxCentre); arm.opening = opening;
    return {reachable:rawDistance < UPPER + LOWER, distance:rawDistance};
  }
  return {create, pose, CARRY, SCALE, TOOL, UPPER, LOWER};
});
