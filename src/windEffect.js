import * as THREE from 'three';

const STREAK_COUNT = 150;
const HEIGHT_MIN = 1;
const HEIGHT_MAX_BASE = 15;

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
      // Normalized offsets -1..1, scaled by volume each frame
      nx: (Math.random() - 0.5) * 2,
      ny: Math.random(),
      nz: (Math.random() - 0.5) * 2,
      baseLenN: 0.03 + Math.random() * 0.06,   // length as fraction of volume
      thicknessN: 0.001 + Math.random() * 0.002, // thickness as fraction of volume
      speedMul: 0.6 + Math.random() * 0.8,
    });
  }

  let windAngle = 0;

  function update(time, boostAmount, boat, camera) {
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

    // Scale volume to camera distance so streaks always fill the view
    const camDist = camera.position.distanceTo(boat.position);
    const vol = Math.max(80, camDist * 1.6);
    const heightMax = Math.max(HEIGHT_MAX_BASE, camDist * 0.25);

    // Smooth-follow boat heading
    const boatAngle = boat.rotation.y;
    let diff = boatAngle - windAngle;
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    windAngle += diff * 12.0 * dt;

    const dirX = Math.sin(windAngle);
    const dirZ = Math.cos(windAngle);

    const moveSpeed = absSpeed * (1 + boostAmount * 2.5);

    for (let i = 0; i < STREAK_COUNT; i++) {
      const s = streaks[i];

      // Move in world space along wind direction
      s.nx += (dirX * moveSpeed * s.speedMul * dt) / vol;
      s.nz += (dirZ * moveSpeed * s.speedMul * dt) / vol;

      // Recycle when out of bounds (-1..1 normalized)
      if (s.nx > 1 || s.nx < -1 || s.nz > 1 || s.nz < -1) {
        // Respawn ahead of boat (upwind side)
        const spread = (Math.random() - 0.5) * 1.8;
        const ahead = 0.3 + Math.random() * 0.7;
        s.nx = -dirX * ahead + dirZ * spread;
        s.nz = -dirZ * ahead - dirX * spread;
        s.ny = Math.random();
      }

      // Convert normalized to world position centered on boat
      const wx = boat.position.x + s.nx * vol;
      const wy = HEIGHT_MIN + s.ny * (heightMax - HEIGHT_MIN);
      const wz = boat.position.z + s.nz * vol;

      dummy.position.set(wx, wy, wz);
      dummy.rotation.set(0, windAngle, 0);
      const len = s.baseLenN * vol * (0.3 + visibility * 2.0);
      const thick = s.thicknessN * vol * (0.5 + visibility);
      dummy.scale.set(1, thick, len);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { update };
}
