import * as THREE from 'three';

const CRATE_COUNT = 12;
const SPAWN_RADIUS = 200;
const COLLECT_DISTANCE = 8;

export function createCrateManager(scene) {
  let score = 0;
  const crates = [];
  const scoreEl = document.getElementById('score');

  // Crate materials
  const crateGeometry = new THREE.BoxGeometry(2, 2, 2);
  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0xcd853f,
    roughness: 0.7,
    metalness: 0.1,
  });

  // Band material for detail
  const bandGeometry = new THREE.BoxGeometry(2.1, 0.3, 2.1);
  const bandMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b6914,
    roughness: 0.5,
    metalness: 0.3,
  });

  function spawnCrate(playerPos) {
    const group = new THREE.Group();

    const box = new THREE.Mesh(crateGeometry, crateMaterial);
    group.add(box);

    // Add bands
    const band1 = new THREE.Mesh(bandGeometry, bandMaterial);
    band1.position.y = 0.5;
    group.add(band1);
    const band2 = new THREE.Mesh(bandGeometry, bandMaterial);
    band2.position.y = -0.5;
    group.add(band2);

    // Glow indicator
    const glowGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = 1.5;
    group.add(glow);

    // Random position around player
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * SPAWN_RADIUS;
    group.position.set(
      playerPos.x + Math.cos(angle) * dist,
      0,
      playerPos.z + Math.sin(angle) * dist
    );

    // Random initial rotation
    group.rotation.y = Math.random() * Math.PI * 2;

    scene.add(group);
    crates.push(group);
  }

  function init(playerPos) {
    for (let i = 0; i < CRATE_COUNT; i++) {
      spawnCrate(playerPos);
    }
  }

  function update(playerPos, time) {
    let collected = false;

    for (let i = crates.length - 1; i >= 0; i--) {
      const crate = crates[i];

      // Bob and rotate
      crate.position.y = Math.sin(time * 2 + i) * 0.5 + 0.5;
      crate.rotation.y += 0.01;

      // Glow pulse
      const glow = crate.children[3];
      if (glow) {
        glow.position.y = 1.5 + Math.sin(time * 3 + i) * 0.3;
      }

      // Check collection
      const dx = crate.position.x - playerPos.x;
      const dz = crate.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < COLLECT_DISTANCE) {
        scene.remove(crate);
        crates.splice(i, 1);
        score++;
        scoreEl.textContent = `Crates: ${score}`;
        collected = true;
      }

      // Remove crates that are too far away and respawn closer
      if (dist > SPAWN_RADIUS * 2) {
        scene.remove(crate);
        crates.splice(i, 1);
      }
    }

    // Keep crate count up
    while (crates.length < CRATE_COUNT) {
      spawnCrate(playerPos);
    }

    return collected;
  }

  return { init, update };
}
