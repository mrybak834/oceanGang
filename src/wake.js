import * as THREE from 'three';

const MAX_POINTS = 120;
const EMIT_INTERVAL = 0.025; // seconds between trail cross-sections

export function createWakeSystem(scene) {
  // Foam texture
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 20;
    const a = 0.3 + Math.random() * 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.4, `rgba(245,250,255,${a * 0.4})`);
    grad.addColorStop(1, 'rgba(230,240,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const foamTex = new THREE.CanvasTexture(canvas);
  foamTex.wrapS = foamTex.wrapT = THREE.RepeatWrapping;

  // Pre-allocate geometry: 2 vertices per cross-section (left + right)
  const vertCount = MAX_POINTS * 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  // Index buffer: two triangles per segment
  const indices = [];
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  // Initialize positions off-screen
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3 + 1] = -100;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFoam: { value: foamTex },
      uIntensity: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIntensity;
      uniform sampler2D uFoam;

      void main() {
        float along = vUv.y; // 0 = near boat, 1 = far
        float across = (vUv.x - 0.5) * 2.0; // -1 to 1

        // Distance fade
        float fade = pow(max(0.0, 1.0 - along), 0.9);

        // Scrolling foam texture layers
        vec2 uv1 = vec2(vUv.x * 3.0, along * 5.0 - uTime * 0.5);
        vec2 uv2 = vec2(vUv.x * 2.0 + 0.3, along * 3.5 - uTime * 0.35);
        float foam = texture2D(uFoam, uv1).r * 0.6 + texture2D(uFoam, uv2).r * 0.4;

        // Soft edges
        float edgeFade = smoothstep(1.0, 0.5, abs(across));

        // Near-stern slightly more visible
        float nearBoat = smoothstep(0.1, 0.0, along);

        float alpha = foam * 0.18 * fade * edgeFade * uIntensity;
        alpha += nearBoat * uIntensity * 0.15;
        alpha = clamp(alpha, 0.0, 0.25);

        // Blend with ocean color — light foam tint over blue water
        vec3 oceanBlue = vec3(0.35, 0.55, 0.7);
        vec3 foamWhite = vec3(0.75, 0.85, 0.92);
        vec3 color = mix(oceanBlue, foamWhite, foam * 0.3 + nearBoat * 0.2);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const wakeMesh = new THREE.Mesh(geo, mat);
  wakeMesh.frustumCulled = false;
  wakeMesh.renderOrder = 1;
  scene.add(wakeMesh);

  // Trail history: each entry is a recorded stern cross-section
  const trail = [];
  let emitTimer = 0;

  const BOAT_SCALE = 2.5;
  const STERN_LOCAL_Z = -2.0;
  const BASE_HALF_WIDTH = 3.0;   // half-width at stern (world units)
  const MAX_HALF_WIDTH = 22.0;   // max half-width at full spread
  const SPREAD_SPEED = 12.0;     // width growth rate (world units/sec)

  function attachToBoat() {
    // Wake is in world space — no parenting needed
  }

  function update(delta, time, boat, controller) {
    const speed = boat.userData._windSpeed || 0;
    const absSpeed = Math.abs(speed);
    const speedNorm = Math.min(absSpeed / 25, 1);
    const boost = controller.boostAmount;
    const intensity = Math.min(speedNorm * (1 + boost * 0.8), 1.0);

    mat.uniforms.uTime.value = time;
    mat.uniforms.uIntensity.value = intensity;

    if (intensity < 0.02) {
      wakeMesh.visible = false;
      trail.length = 0;
      return;
    }
    wakeMesh.visible = true;

    // Boat stern position in world space
    const heading = boat.rotation.y;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);

    const sternX = boat.position.x + sinH * STERN_LOCAL_Z * BOAT_SCALE;
    const sternZ = boat.position.z + cosH * STERN_LOCAL_Z * BOAT_SCALE;

    // Perpendicular direction (port/starboard)
    const perpX = cosH;
    const perpZ = -sinH;

    // Emit new trail cross-section
    emitTimer += delta;
    while (emitTimer >= EMIT_INTERVAL) {
      emitTimer -= EMIT_INTERVAL;
      trail.unshift({
        x: sternX,
        z: sternZ,
        perpX,
        perpZ,
        width: BASE_HALF_WIDTH,
        speed: intensity,
        age: 0,
      });
      if (trail.length > MAX_POINTS) trail.length = MAX_POINTS;
    }

    // Age trail points and widen them (Kelvin wake spread)
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      t.age += delta;
      t.width = Math.min(
        t.width + SPREAD_SPEED * t.speed * delta,
        MAX_HALF_WIDTH
      );
    }

    // Update geometry vertices
    const posArr = geo.attributes.position.array;
    const uvArr = geo.attributes.uv.array;
    const usedPoints = trail.length;

    for (let i = 0; i < MAX_POINTS; i++) {
      const pi = i * 6; // position index (2 verts * 3 components)
      const ui = i * 4; // uv index (2 verts * 2 components)

      if (i < usedPoints) {
        const t = trail[i];
        const v = usedPoints > 1 ? i / (usedPoints - 1) : 0;

        // Left vertex
        posArr[pi + 0] = t.x - t.perpX * t.width;
        posArr[pi + 1] = 0.15;
        posArr[pi + 2] = t.z - t.perpZ * t.width;
        // Right vertex
        posArr[pi + 3] = t.x + t.perpX * t.width;
        posArr[pi + 4] = 0.15;
        posArr[pi + 5] = t.z + t.perpZ * t.width;

        // Update V coordinate (0 = near boat, 1 = far)
        uvArr[ui + 0] = 0; uvArr[ui + 1] = v;
        uvArr[ui + 2] = 1; uvArr[ui + 3] = v;
      } else {
        // Hide unused verts below world
        posArr[pi + 0] = 0; posArr[pi + 1] = -100; posArr[pi + 2] = 0;
        posArr[pi + 3] = 0; posArr[pi + 4] = -100; posArr[pi + 5] = 0;
        uvArr[ui + 0] = 0; uvArr[ui + 1] = 1;
        uvArr[ui + 2] = 1; uvArr[ui + 3] = 1;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
  }

  return { update, attachToBoat };
}
