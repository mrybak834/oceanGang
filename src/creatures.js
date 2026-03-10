import * as THREE from 'three';

// ── Constants ──
const SPAWN_RADIUS = 300;
const DESPAWN_RADIUS = 550;
const DOLPHIN_COUNT = 5;
const TURTLE_COUNT = 3;
const FLYFISH_COUNT = 4;

// ── Dolphin model ──
function buildDolphin() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a8aa8, roughness: 0.25, metalness: 0.05 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xb8cdd8, roughness: 0.3 });

  // Body
  const bodyGeo = new THREE.SphereGeometry(1, 18, 12);
  bodyGeo.scale(0.5, 0.45, 1.7);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Belly
  const bGeo = new THREE.SphereGeometry(0.9, 14, 10);
  bGeo.scale(0.42, 0.35, 1.5);
  const belly = new THREE.Mesh(bGeo, bellyMat);
  belly.position.y = -0.07;
  group.add(belly);

  // Snout
  const snoutGeo = new THREE.SphereGeometry(0.22, 10, 8);
  snoutGeo.scale(0.5, 0.45, 1.5);
  const snout = new THREE.Mesh(snoutGeo, bodyMat);
  snout.position.set(0, -0.03, 1.65);
  group.add(snout);

  // Melon
  const melonGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const melon = new THREE.Mesh(melonGeo, bodyMat);
  melon.position.set(0, 0.15, 1.2);
  group.add(melon);

  // Dorsal fin
  const dShape = new THREE.Shape();
  dShape.moveTo(0, 0);
  dShape.quadraticCurveTo(-0.05, 0.55, -0.12, 0.58);
  dShape.lineTo(0.4, 0);
  const dGeo = new THREE.ExtrudeGeometry(dShape, { depth: 0.04, bevelEnabled: false });
  const dorsal = new THREE.Mesh(dGeo, bodyMat);
  dorsal.position.set(-0.02, 0.32, -0.15);
  group.add(dorsal);

  // Pectoral fins
  const pfGeo = new THREE.SphereGeometry(0.28, 8, 6);
  pfGeo.scale(0.15, 0.08, 1);
  for (const s of [-1, 1]) {
    const pf = new THREE.Mesh(pfGeo, bodyMat);
    pf.position.set(s * 0.4, -0.18, 0.4);
    pf.rotation.z = s * 0.5;
    group.add(pf);
  }

  // Tail stock
  const tsGeo = new THREE.CylinderGeometry(0.2, 0.09, 1.1, 8);
  tsGeo.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(tsGeo, bodyMat));
  group.children[group.children.length - 1].position.set(0, 0, -1.65);

  // Flukes
  const fGeo = new THREE.SphereGeometry(0.3, 8, 6);
  fGeo.scale(1, 0.08, 0.5);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(fGeo, bodyMat);
    f.position.set(s * 0.22, 0, -2.15);
    group.add(f);
  }

  // Eye
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(s * 0.35, 0.1, 1.3);
    group.add(eye);
  }

  const scale = 1.6 + Math.random() * 1.0;
  group.scale.setScalar(scale);
  return group;
}

// ── Sea Turtle model ──
function buildTurtle() {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x4a7a3b, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a8a4a, roughness: 0.55 });

  // Shell dome
  const shellGeo = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
  group.add(new THREE.Mesh(shellGeo, shellMat));

  // Base
  const baseGeo = new THREE.CircleGeometry(1, 20);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xc0b070, roughness: 0.6, side: THREE.DoubleSide });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.rotation.x = -Math.PI / 2;
  group.add(base);

  // Head
  const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
  headGeo.scale(0.85, 0.8, 1.1);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.05, 1.08);
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(s * 0.15, 0.12, 1.22);
    group.add(eye);
  }

  // Flippers
  const flipGeo = new THREE.SphereGeometry(0.4, 8, 6);
  flipGeo.scale(0.35, 0.1, 1);
  const flips = [
    { x: -0.85, z: 0.5, ry: 0.5 },
    { x: 0.85, z: 0.5, ry: -0.5 },
    { x: -0.7, z: -0.5, ry: 2.5 },
    { x: 0.7, z: -0.5, ry: -2.5 },
  ];
  for (const p of flips) {
    const f = new THREE.Mesh(flipGeo, skinMat);
    f.position.set(p.x, -0.05, p.z);
    f.rotation.y = p.ry;
    group.add(f);
  }

  const scale = 1.0 + Math.random() * 0.6;
  group.scale.setScalar(scale);
  return group;
}

// ── Flying Fish model ──
function buildFlyingFish() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5588aa, roughness: 0.3, metalness: 0.15 });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x88bbdd,
    roughness: 0.2,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.2, 10, 8);
  bodyGeo.scale(0.5, 0.6, 1.6);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Large pectoral "wings"
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.6, 0.15, 1.0, 0.05);
  wingShape.lineTo(0.8, -0.2);
  wingShape.quadraticCurveTo(0.3, -0.1, 0, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.01, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.x = s;
    w.position.set(s * 0.08, 0, 0);
    w.rotation.z = s * -0.1;
    w.userData.isWing = true;
    w.userData.side = s;
    group.add(w);
  }

  // Tail
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0);
  tShape.lineTo(-0.08, 0.12);
  tShape.lineTo(-0.18, 0);
  tShape.lineTo(-0.08, -0.12);
  const tGeo = new THREE.ExtrudeGeometry(tShape, { depth: 0.01, bevelEnabled: false });
  const tail = new THREE.Mesh(tGeo, bodyMat);
  tail.position.set(0, 0, -0.32);
  group.add(tail);

  const scale = 1.2 + Math.random() * 0.8;
  group.scale.setScalar(scale);
  return group;
}

// ── Breach animation configs ──
const BREACH_CONFIGS = {
  dolphin: {
    build: buildDolphin,
    cooldownMin: 8,
    cooldownMax: 20,
    arcHeight: 5,
    arcDuration: 1.2,
    tiltAmount: 0.6,
  },
  turtle: {
    build: buildTurtle,
    cooldownMin: 12,
    cooldownMax: 30,
    arcHeight: 1.2,       // barely surfaces
    arcDuration: 2.5,     // slow rise and sink
    tiltAmount: 0.15,
  },
  flyfish: {
    build: buildFlyingFish,
    cooldownMin: 5,
    cooldownMax: 14,
    arcHeight: 2.5,
    arcDuration: 1.8,
    tiltAmount: 0.2,
  },
};

// ── Creature manager ──
export function createCreatures(scene) {
  const pool = [];

  function spawnCreature(playerPos, type) {
    const config = BREACH_CONFIGS[type];
    const model = config.build();
    model.visible = false;

    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * SPAWN_RADIUS;
    model.position.set(
      playerPos.x + Math.cos(angle) * dist,
      -5,
      playerPos.z + Math.sin(angle) * dist
    );
    scene.add(model);

    pool.push({
      model,
      type,
      cooldown: config.cooldownMin + Math.random() * (config.cooldownMax - config.cooldownMin),
      breaching: false,
      progress: 0,
      swimAngle: Math.random() * Math.PI * 2,
      swimSpeed: 2 + Math.random() * 3,
    });
  }

  function init(playerPos) {
    for (let i = 0; i < DOLPHIN_COUNT; i++) spawnCreature(playerPos, 'dolphin');
    for (let i = 0; i < TURTLE_COUNT; i++) spawnCreature(playerPos, 'turtle');
    for (let i = 0; i < FLYFISH_COUNT; i++) spawnCreature(playerPos, 'flyfish');
  }

  function respawn(entry, playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * (SPAWN_RADIUS - 80);
    entry.model.position.x = playerPos.x + Math.cos(angle) * dist;
    entry.model.position.z = playerPos.z + Math.sin(angle) * dist;
    entry.model.position.y = -5;
    entry.model.visible = false;
    entry.breaching = false;
    entry.progress = 0;
    entry.swimAngle = Math.random() * Math.PI * 2;
  }

  function update(playerPos, time, delta) {
    for (let i = 0; i < pool.length; i++) {
      const entry = pool[i];
      const m = entry.model;
      const config = BREACH_CONFIGS[entry.type];

      const dx = m.position.x - playerPos.x;
      const dz = m.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > DESPAWN_RADIUS) {
        respawn(entry, playerPos);
        continue;
      }

      if (entry.breaching) {
        entry.progress += delta / config.arcDuration;

        if (entry.progress >= 1) {
          // Done breaching — hide and start cooldown
          m.visible = false;
          m.position.y = -5;
          entry.breaching = false;
          entry.progress = 0;
          entry.cooldown = config.cooldownMin + Math.random() * (config.cooldownMax - config.cooldownMin);
          continue;
        }

        // Arc: y = sin(progress * PI) * height
        const arc = Math.sin(entry.progress * Math.PI);
        m.position.y = arc * config.arcHeight - 0.5;

        // Show only when above water
        m.visible = m.position.y > -0.2;

        // Forward motion during breach
        m.position.x += Math.sin(entry.swimAngle) * entry.swimSpeed * 2 * delta;
        m.position.z += Math.cos(entry.swimAngle) * entry.swimSpeed * 2 * delta;
        m.rotation.y = entry.swimAngle;

        // Tilt with arc
        const tiltPhase = (entry.progress - 0.5) * 2; // -1 to 1
        m.rotation.x = -tiltPhase * config.tiltAmount;

        // Flying fish: spread wings at apex
        if (entry.type === 'flyfish') {
          for (const child of m.children) {
            if (child.userData.isWing) {
              child.rotation.z = child.userData.side * (-0.1 - arc * 0.4);
            }
          }
        }

      } else {
        // Waiting underwater — drift position slowly so breach locations vary
        entry.cooldown -= delta;
        m.position.x += Math.sin(entry.swimAngle) * entry.swimSpeed * 0.3 * delta;
        m.position.z += Math.cos(entry.swimAngle) * entry.swimSpeed * 0.3 * delta;

        if (entry.cooldown <= 0) {
          entry.breaching = true;
          entry.progress = 0;
          entry.swimAngle = Math.random() * Math.PI * 2;
        }
      }
    }
  }

  return { init, update };
}
