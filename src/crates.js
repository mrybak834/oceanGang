import * as THREE from 'three';

const CRATE_COUNT = 12;
const SPAWN_RADIUS = 200;
const COLLECT_DISTANCE = 8;

export function createCrateManager(scene) {
  let score = 0;
  const pool = [];       // all crate groups (always in scene)
  const scoreEl = document.getElementById('score');

  // Shared geometry/materials
  const crateGeometry = new THREE.BoxGeometry(2, 2, 2);
  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0xcd853f,
    roughness: 0.7,
    metalness: 0.1,
  });
  const bandGeometry = new THREE.BoxGeometry(2.1, 0.3, 2.1);
  const bandMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b6914,
    roughness: 0.5,
    metalness: 0.3,
  });
  const glowGeometry = new THREE.SphereGeometry(0.3, 8, 8);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd44 });

  function createCrateGroup() {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(crateGeometry, crateMaterial));
    const band1 = new THREE.Mesh(bandGeometry, bandMaterial);
    band1.position.y = 0.5;
    group.add(band1);
    const band2 = new THREE.Mesh(bandGeometry, bandMaterial);
    band2.position.y = -0.5;
    group.add(band2);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = 1.5;
    group.add(glow);
    group.visible = false;
    scene.add(group);
    return group;
  }

  function placeCrate(group, playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * SPAWN_RADIUS;
    group.position.set(
      playerPos.x + Math.cos(angle) * dist,
      0,
      playerPos.z + Math.sin(angle) * dist
    );
    group.rotation.y = Math.random() * Math.PI * 2;
    group.visible = true;
  }

  function init(playerPos) {
    for (let i = 0; i < CRATE_COUNT; i++) {
      const group = createCrateGroup();
      placeCrate(group, playerPos);
      pool.push(group);
    }
  }

  function update(playerPos, time) {
    let collected = false;

    for (let i = 0; i < pool.length; i++) {
      const crate = pool[i];
      if (!crate.visible) continue;

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
        crate.visible = false;
        score++;
        scoreEl.textContent = `Crates: ${score}`;
        collected = true;
      } else if (dist > SPAWN_RADIUS * 2) {
        // Too far — recycle immediately
        placeCrate(crate, playerPos);
      }
    }

    // Re-activate any hidden crates
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].visible) {
        placeCrate(pool[i], playerPos);
      }
    }

    return collected;
  }

  function getScore() { return score; }

  function spendCrates(n) {
    if (score < n) return false;
    score -= n;
    scoreEl.textContent = `Crates: ${score}`;
    return true;
  }

  return { init, update, getScore, spendCrates };
}
