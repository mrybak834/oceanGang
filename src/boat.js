import * as THREE from 'three';

export function createBoat(scene) {
  const boat = new THREE.Group();

  // --- Hull (curved shape using lathe) ---
  const hullProfile = [];
  // Create a half-cross-section of the hull that we'll extrude
  // We'll use a custom approach: build hull from a shaped box + tapered ends
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.5, 0);
  hullShape.quadraticCurveTo(-1.6, -0.8, -1.2, -1.4);
  hullShape.quadraticCurveTo(0, -1.8, 1.2, -1.4);
  hullShape.quadraticCurveTo(1.6, -0.8, 1.5, 0);
  hullShape.lineTo(-1.5, 0);

  const extrudeSettings = {
    steps: 20,
    depth: 9,
    bevelEnabled: false,
  };
  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, extrudeSettings);
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3a1e,
    roughness: 0.75,
    metalness: 0.05,
  });
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  hull.rotation.y = Math.PI;
  hull.position.set(0, 0.8, -4.5);
  boat.add(hull);

  // Hull dark bottom (keel stripe)
  const keelGeometry = new THREE.BoxGeometry(0.3, 0.6, 8.5);
  const keelMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a1a0a,
    roughness: 0.9,
  });
  const keel = new THREE.Mesh(keelGeometry, keelMaterial);
  keel.position.set(0, -0.6, 0);
  boat.add(keel);

  // --- Bow taper (pointed front) ---
  const bowGeometry = new THREE.ConeGeometry(1.5, 3.5, 4);
  const bow = new THREE.Mesh(bowGeometry, hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.1, -5.8);
  boat.add(bow);

  // --- Stern (flat back with slight curve) ---
  const sternGeometry = new THREE.CylinderGeometry(1.5, 1.3, 0.4, 16, 1, false, 0, Math.PI);
  const stern = new THREE.Mesh(sternGeometry, hullMaterial);
  stern.rotation.x = Math.PI / 2;
  stern.rotation.z = Math.PI;
  stern.position.set(0, 0.1, 4.6);
  boat.add(stern);

  // --- Deck ---
  const deckGeometry = new THREE.BoxGeometry(2.8, 0.15, 8.2);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8a46e,
    roughness: 0.85,
    metalness: 0.0,
  });
  const deck = new THREE.Mesh(deckGeometry, deckMaterial);
  deck.position.y = 0.85;
  boat.add(deck);

  // Deck planks (subtle lines)
  for (let i = -3.5; i <= 3.5; i += 0.7) {
    const plankLine = new THREE.BoxGeometry(2.7, 0.02, 0.04);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0xa08050, roughness: 1.0 });
    const plank = new THREE.Mesh(plankLine, plankMat);
    plank.position.set(0, 0.94, i);
    boat.add(plank);
  }

  // --- Cabin / Quarterdeck ---
  const cabinGeometry = new THREE.BoxGeometry(2.0, 1.2, 2.5);
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b3e26,
    roughness: 0.7,
    metalness: 0.05,
  });
  const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
  cabin.position.set(0, 1.5, 2.5);
  boat.add(cabin);

  // Cabin roof
  const roofGeometry = new THREE.BoxGeometry(2.2, 0.12, 2.7);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5e3c,
    roughness: 0.6,
  });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(0, 2.15, 2.5);
  boat.add(roof);

  // Cabin windows (port + starboard)
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x88ccee,
    roughness: 0.2,
    metalness: 0.4,
    emissive: 0x224466,
    emissiveIntensity: 0.3,
  });
  for (const side of [-1, 1]) {
    for (let wz = 1.6; wz <= 3.4; wz += 0.9) {
      const windowGeo = new THREE.BoxGeometry(0.05, 0.4, 0.35);
      const win = new THREE.Mesh(windowGeo, windowMat);
      win.position.set(side * 1.02, 1.5, wz);
      boat.add(win);
    }
  }

  // --- Main Mast ---
  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3015,
    roughness: 0.65,
  });

  const mainMastGeo = new THREE.CylinderGeometry(0.1, 0.14, 10, 8);
  const mainMast = new THREE.Mesh(mainMastGeo, mastMaterial);
  mainMast.position.set(0, 5.85, -1.0);
  boat.add(mainMast);

  // Crow's nest / mast top platform
  const platformGeo = new THREE.CylinderGeometry(0.5, 0.45, 0.15, 12);
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, 9.5, -1.0);
  boat.add(platform);

  // --- Fore Mast (smaller, front) ---
  const foreMastGeo = new THREE.CylinderGeometry(0.08, 0.11, 7, 8);
  const foreMast = new THREE.Mesh(foreMastGeo, mastMaterial);
  foreMast.position.set(0, 4.35, -3.5);
  boat.add(foreMast);

  // --- Main Sail (large, curved) ---
  const mainSailShape = new THREE.Shape();
  mainSailShape.moveTo(0, 0);
  mainSailShape.lineTo(0, 6.5);
  mainSailShape.quadraticCurveTo(2.0, 5.5, 3.5, 2.0);
  mainSailShape.quadraticCurveTo(2.5, 0.5, 0, 0);

  const mainSailGeo = new THREE.ShapeGeometry(mainSailShape, 12);
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xfaf0e6,
    roughness: 0.7,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const mainSail = new THREE.Mesh(mainSailGeo, sailMaterial);
  mainSail.position.set(0, 2.5, -1.0);
  mainSail.rotation.y = -Math.PI / 2;
  boat.add(mainSail);

  // --- Fore Sail (smaller, triangular) ---
  const foreSailShape = new THREE.Shape();
  foreSailShape.moveTo(0, 0);
  foreSailShape.lineTo(0, 4.5);
  foreSailShape.quadraticCurveTo(1.5, 3.5, 2.5, 1.0);
  foreSailShape.quadraticCurveTo(1.5, 0.2, 0, 0);

  const foreSailGeo = new THREE.ShapeGeometry(foreSailShape, 10);
  const foreSail = new THREE.Mesh(foreSailGeo, sailMaterial);
  foreSail.position.set(0, 1.5, -3.5);
  foreSail.rotation.y = -Math.PI / 2;
  boat.add(foreSail);

  // --- Jib Sail (front triangle, from bow to fore mast) ---
  const jibShape = new THREE.Shape();
  jibShape.moveTo(0, 0);
  jibShape.lineTo(-0.3, 5.0);
  jibShape.quadraticCurveTo(1.2, 3.5, 2.2, 0.3);
  jibShape.lineTo(0, 0);

  const jibGeo = new THREE.ShapeGeometry(jibShape, 8);
  const jibMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5efe0,
    roughness: 0.7,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  const jib = new THREE.Mesh(jibGeo, jibMaterial);
  jib.position.set(0, 1.5, -5.5);
  jib.rotation.y = -Math.PI / 2;
  boat.add(jib);

  // --- Boom (horizontal pole under main sail) ---
  const boomGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 6);
  const boom = new THREE.Mesh(boomGeo, mastMaterial);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(1.5, 2.4, -1.0);
  boat.add(boom);

  // --- Railings ---
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2b1a,
    roughness: 0.7,
  });

  // Side railings (port and starboard)
  for (const side of [-1, 1]) {
    // Top rail
    const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 7.5, 6);
    const rail = new THREE.Mesh(railGeo, railMaterial);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * 1.35, 1.5, -0.5);
    boat.add(rail);

    // Railing posts
    for (let z = -3.8; z <= 3.2; z += 1.2) {
      const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6);
      const post = new THREE.Mesh(postGeo, railMaterial);
      post.position.set(side * 1.35, 1.23, z);
      boat.add(post);
    }
  }

  // --- Bowsprit (front pole) ---
  const bowspritGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6);
  const bowsprit = new THREE.Mesh(bowspritGeo, mastMaterial);
  bowsprit.rotation.x = Math.PI / 2 + 0.25;
  bowsprit.position.set(0, 1.3, -6.5);
  boat.add(bowsprit);

  // --- Flag at top of main mast ---
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(1.2, 0.2);
  flagShape.quadraticCurveTo(1.0, 0.45, 1.2, 0.7);
  flagShape.lineTo(0, 0.5);
  flagShape.lineTo(0, 0);

  const flagGeo = new THREE.ShapeGeometry(flagShape, 6);
  const flagMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc2222,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(flagGeo, flagMaterial);
  flag.position.set(0, 10.5, -1.0);
  flag.rotation.y = -Math.PI / 2;
  boat.add(flag);

  // --- Rudder (back) ---
  const rudderGeo = new THREE.BoxGeometry(0.12, 1.5, 0.7);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.8 });
  const rudder = new THREE.Mesh(rudderGeo, rudderMat);
  rudder.position.set(0, -0.2, 4.7);
  boat.add(rudder);

  // --- Rope details (shrouds from mast to hull sides) ---
  const ropeMaterial = new THREE.LineBasicMaterial({ color: 0x8b7355, linewidth: 1 });

  for (const side of [-1, 1]) {
    const ropePoints = [
      new THREE.Vector3(0, 9.5, -1.0),
      new THREE.Vector3(side * 1.4, 1.0, 1.5),
    ];
    const ropeGeo = new THREE.BufferGeometry().setFromPoints(ropePoints);
    const rope = new THREE.Line(ropeGeo, ropeMaterial);
    boat.add(rope);

    // Fore mast ropes
    const foreRopePoints = [
      new THREE.Vector3(0, 7.0, -3.5),
      new THREE.Vector3(side * 1.3, 1.0, -2.0),
    ];
    const foreRopeGeo = new THREE.BufferGeometry().setFromPoints(foreRopePoints);
    const foreRope = new THREE.Line(foreRopeGeo, ropeMaterial);
    boat.add(foreRope);
  }

  // Forestay (rope from main mast top to bowsprit)
  const forestayPoints = [
    new THREE.Vector3(0, 9.5, -1.0),
    new THREE.Vector3(0, 1.8, -7.5),
  ];
  const forestayGeo = new THREE.BufferGeometry().setFromPoints(forestayPoints);
  const forestay = new THREE.Line(forestayGeo, ropeMaterial);
  boat.add(forestay);

  // --- Anchor (small, on side of hull) ---
  const anchorRingGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 12);
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 });
  const anchorRing = new THREE.Mesh(anchorRingGeo, anchorMat);
  anchorRing.position.set(1.5, 0.5, -3.5);
  anchorRing.rotation.y = Math.PI / 2;
  boat.add(anchorRing);

  // Store flag reference for animation
  boat.userData.flag = flag;
  boat.userData.mainSail = mainSail;
  boat.userData.foreSail = foreSail;
  boat.userData.jib = jib;

  scene.add(boat);
  return boat;
}

export function createBoatController() {
  const keys = {};
  const velocity = { forward: 0, turn: 0 };
  const maxSpeed = 40;
  const acceleration = 20;
  const deceleration = 10;
  const turnSpeed = 4.0;
  const turnDeceleration = 8.0;

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function update(boat, delta, time) {
    // Forward / backward
    if (keys['w'] || keys['arrowup']) {
      velocity.forward = Math.min(velocity.forward + acceleration * delta, maxSpeed);
    } else if (keys['s'] || keys['arrowdown']) {
      velocity.forward = Math.max(velocity.forward - acceleration * delta, -maxSpeed * 0.5);
    } else {
      if (velocity.forward > 0) {
        velocity.forward = Math.max(velocity.forward - deceleration * delta, 0);
      } else {
        velocity.forward = Math.min(velocity.forward + deceleration * delta, 0);
      }
    }

    // Turning
    if (keys['a'] || keys['arrowleft']) {
      velocity.turn = Math.min(velocity.turn + turnSpeed * delta, turnSpeed);
    } else if (keys['d'] || keys['arrowright']) {
      velocity.turn = Math.max(velocity.turn - turnSpeed * delta, -turnSpeed);
    } else {
      if (velocity.turn > 0) {
        velocity.turn = Math.max(velocity.turn - turnDeceleration * delta, 0);
      } else {
        velocity.turn = Math.min(velocity.turn + turnDeceleration * delta, 0);
      }
    }

    // Apply rotation
    boat.rotation.y += velocity.turn * delta;

    // Apply movement in boat's forward direction
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(boat.quaternion);
    boat.position.addScaledVector(direction, velocity.forward * delta);

    // Bob on waves
    boat.position.y = Math.sin(time * 1.5) * 0.5 + Math.sin(time * 2.3) * 0.3;

    // Tilt with waves
    boat.rotation.z = Math.sin(time * 1.8) * 0.04;
    boat.rotation.x = Math.sin(time * 1.2) * 0.03;

    // Animate flag flutter
    if (boat.userData.flag) {
      boat.userData.flag.rotation.y = -Math.PI / 2 + Math.sin(time * 4) * 0.15;
      boat.userData.flag.position.x = Math.sin(time * 5) * 0.05;
    }

    return velocity;
  }

  return { update, keys, velocity };
}
