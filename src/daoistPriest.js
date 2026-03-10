import * as THREE from 'three';

export function createDaoistPriest() {
  const priest = new THREE.Group();

  const robeMat = new THREE.MeshStandardMaterial({ color: 0x30465b, roughness: 0.9 });
  const innerRobeMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc9, roughness: 0.95 });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0x7a2430, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b48d, roughness: 0.95 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1f1a1a, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.8 });

  const outerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.78, 2.4, 10), robeMat);
  outerRobe.position.y = 1.2;
  priest.add(outerRobe);

  const innerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.95, 8), innerRobeMat);
  innerRobe.position.set(0, 1.16, 0.22);
  priest.add(innerRobe);

  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 18), sashMat);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 1.02;
  priest.add(sash);

  const sleeveGeo = new THREE.CapsuleGeometry(0.13, 0.68, 4, 8);
  const leftArm = new THREE.Mesh(sleeveGeo, robeMat);
  leftArm.position.set(-0.58, 1.45, 0.04);
  leftArm.rotation.z = 0.55;
  priest.add(leftArm);

  const rightArm = new THREE.Mesh(sleeveGeo, robeMat);
  rightArm.position.set(0.58, 1.45, 0.04);
  rightArm.rotation.z = -0.55;
  priest.add(rightArm);

  const handGeo = new THREE.SphereGeometry(0.1, 12, 10);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(-0.87, 1.15, 0.08);
  priest.add(leftHand);

  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.set(0.87, 1.15, 0.08);
  priest.add(rightHand);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 16), skinMat);
  head.position.y = 2.58;
  priest.add(head);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 16), hairMat);
  hairBack.position.set(0, 2.61, -0.05);
  priest.add(hairBack);

  const topknot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), hairMat);
  topknot.position.set(0, 2.96, 0);
  priest.add(topknot);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.05, 20), capMat);
  hatBrim.position.y = 2.97;
  priest.add(hatBrim);

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.4, 16), capMat);
  hatCrown.position.y = 3.16;
  priest.add(hatCrown);

  const hatTag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.03), innerRobeMat);
  hatTag.position.set(0, 3.1, 0.23);
  priest.add(hatTag);

  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 10), hairMat);
  beard.position.set(0, 2.28, 0.23);
  priest.add(beard);

  const legGeo = new THREE.CapsuleGeometry(0.1, 0.8, 4, 8);
  const leftLeg = new THREE.Mesh(legGeo, innerRobeMat);
  leftLeg.position.set(-0.18, 0.38, 0);
  priest.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, innerRobeMat);
  rightLeg.position.set(0.18, 0.38, 0);
  priest.add(rightLeg);

  priest.userData.parts = {
    outerRobe,
    leftArm,
    rightArm,
    leftHand,
    rightHand,
    head,
    beard,
    leftLeg,
    rightLeg,
  };

  return priest;
}

export function updateDaoistPriest(priest, time, walkStrength = 1) {
  const parts = priest.userData.parts;
  if (!parts) return;

  const stride = Math.sin(time * 2.6) * 0.42 * walkStrength;
  const sway = Math.sin(time * 1.3) * 0.06;

  parts.leftArm.rotation.x = stride * 0.6;
  parts.rightArm.rotation.x = -stride * 0.6;
  parts.leftArm.rotation.z = 0.55 + sway;
  parts.rightArm.rotation.z = -0.55 - sway;

  parts.leftHand.position.y = 1.15 - Math.max(0, stride) * 0.08;
  parts.rightHand.position.y = 1.15 - Math.max(0, -stride) * 0.08;

  parts.leftLeg.rotation.x = -stride;
  parts.rightLeg.rotation.x = stride;
  parts.outerRobe.rotation.z = sway * 0.35;
  parts.head.rotation.z = -sway * 0.45;
  parts.head.rotation.y = Math.sin(time * 0.7) * 0.1;
  parts.beard.rotation.x = 0.1 + Math.abs(stride) * 0.12;

}
