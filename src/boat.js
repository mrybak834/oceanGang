import * as THREE from 'three';

export function createBoat(scene) {
  const boat = new THREE.Group();

  // Hull
  const hullGeometry = new THREE.BoxGeometry(3, 1.5, 8);
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.8,
    metalness: 0.1,
  });
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  hull.position.y = 0.5;
  boat.add(hull);

  // Deck
  const deckGeometry = new THREE.BoxGeometry(2.6, 0.2, 7);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xdeb887,
    roughness: 0.9,
  });
  const deck = new THREE.Mesh(deckGeometry, deckMaterial);
  deck.position.y = 1.3;
  boat.add(deck);

  // Mast
  const mastGeometry = new THREE.CylinderGeometry(0.1, 0.1, 8, 8);
  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.7,
  });
  const mast = new THREE.Mesh(mastGeometry, mastMaterial);
  mast.position.set(0, 5.3, -0.5);
  boat.add(mast);

  // Sail
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 5);
  sailShape.lineTo(2.5, 1);
  sailShape.lineTo(0, 0);
  const sailGeometry = new THREE.ShapeGeometry(sailShape);
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f5dc,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const sail = new THREE.Mesh(sailGeometry, sailMaterial);
  sail.position.set(0, 2.3, -0.5);
  sail.rotation.y = -Math.PI / 2;
  boat.add(sail);

  // Bow (pointed front)
  const bowGeometry = new THREE.ConeGeometry(1.5, 3, 4);
  const bow = new THREE.Mesh(bowGeometry, hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.5, -5);
  boat.add(bow);

  scene.add(boat);

  return boat;
}

export function createBoatController() {
  const keys = {};
  const velocity = { forward: 0, turn: 0 };
  const maxSpeed = 40;
  const acceleration = 20;
  const deceleration = 10;
  const turnSpeed = 2.0;
  const turnDeceleration = 4.0;

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
      // Decelerate
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

    return velocity;
  }

  return { update, keys, velocity };
}
