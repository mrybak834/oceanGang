import * as THREE from 'three';

const STREAK_COUNT = 120;
const VOLUME = 70;
const HEIGHT_MIN = 1;
const HEIGHT_MAX = 14;

export function createWindEffect(scene) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateY(Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xeef4ff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, STREAK_COUNT);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const streaks = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < STREAK_COUNT; i++) {
    streaks.push({
      x: (Math.random() - 0.5) * VOLUME * 2,
      y: HEIGHT_MIN + Math.random() * (HEIGHT_MAX - HEIGHT_MIN),
      z: (Math.random() - 0.5) * VOLUME * 2,
      baseLen: 2.5 + Math.random() * 5,
      thickness: 0.04 + Math.random() * 0.1,
      speedMul: 0.6 + Math.random() * 0.8,
    });
  }

  // Smoothed wind direction (lags behind boat heading)
  let windAngle = 0;

  function update(time, boostAmount, boat) {
    const speed = boat.userData._windSpeed || 0;
    const absSpeed = Math.abs(speed);
    const speedNorm = Math.min(absSpeed / 35, 1);
    const visibility = Math.max(speedNorm * 0.35, boostAmount);

    if (visibility < 0.01) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mat.opacity = visibility * 0.45;

    const dt = 1 / 60;

    // Target angle = boat heading. Wind angle follows with lag.
    const boatAngle = boat.rotation.y;
    // Smooth follow — slight lag so turns feel natural
    let diff = boatAngle - windAngle;
    // Wrap to -PI..PI
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    windAngle += diff * 12.0 * dt;

    const dirX = Math.sin(windAngle);
    const dirZ = Math.cos(windAngle);

    // Streaks move toward camera = backward along boat direction
    // Speed proportional to boat speed + boost
    const moveSpeed = absSpeed * (1 + boostAmount * 2.5);

    for (let i = 0; i < STREAK_COUNT; i++) {
      const s = streaks[i];

      // Move streak backward (toward camera)
      s.x += dirX * moveSpeed * s.speedMul * dt;
      s.z += dirZ * moveSpeed * s.speedMul * dt;

      // Recycle when too far from boat
      const dx = s.x - boat.position.x;
      const dz = s.z - boat.position.z;
      if (dx * dx + dz * dz > VOLUME * VOLUME) {
        // Respawn ahead of boat
        const spread = (Math.random() - 0.5) * VOLUME * 1.4;
        const ahead = VOLUME * (0.3 + Math.random() * 0.7);
        s.x = boat.position.x - dirX * ahead + dirZ * spread;
        s.z = boat.position.z - dirZ * ahead - dirX * spread;
        s.y = HEIGHT_MIN + Math.random() * (HEIGHT_MAX - HEIGHT_MIN);
      }

      dummy.position.set(s.x, s.y, s.z);
      // Orient along wind direction
      dummy.rotation.set(0, windAngle, 0);
      const len = s.baseLen * (0.3 + visibility * 2.0);
      dummy.scale.set(1, s.thickness * (0.5 + visibility), len);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { update };
}
