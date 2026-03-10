import * as THREE from 'three';

// ── Seeded PRNG ──────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── 2D Simplex noise ─────────────────────────────────────────────────────
// Compact implementation based on Stefan Gustavson's simplex noise
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPermTable(rand) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

function simplex2D(x, y, perm) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;

  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n = 0;
  let d;

  d = 0.5 - x0 * x0 - y0 * y0;
  if (d > 0) {
    const gi = perm[ii + perm[jj]] & 7;
    n += d * d * d * d * (grad2[gi][0] * x0 + grad2[gi][1] * y0);
  }
  d = 0.5 - x1 * x1 - y1 * y1;
  if (d > 0) {
    const gi = perm[ii + i1 + perm[jj + j1]] & 7;
    n += d * d * d * d * (grad2[gi][0] * x1 + grad2[gi][1] * y1);
  }
  d = 0.5 - x2 * x2 - y2 * y2;
  if (d > 0) {
    const gi = perm[ii + 1 + perm[jj + 1]] & 7;
    n += d * d * d * d * (grad2[gi][0] * x2 + grad2[gi][1] * y2);
  }

  return 70 * n; // range roughly -1..1
}

// Fractional Brownian Motion — layer multiple octaves for natural terrain
function fbm(x, y, perm, octaves, lacunarity, gain) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * simplex2D(x * freq, y * freq, perm);
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / max; // normalized -1..1
}

// ── Island placement ─────────────────────────────────────────────────────
export function createIslands(scene) {
  const rand = mulberry32(42);
  const islands = [];

  const configs = [
    { rMin: 60, rMax: 120, count: 6,  distMin: 1200, distMax: 3800 },
    { rMin: 25, rMax: 55,  count: 10, distMin: 600,  distMax: 3500 },
    { rMin: 8,  rMax: 22,  count: 16, distMin: 400,  distMax: 4000 },
  ];

  const positions = [];

  // ── Starting island — straight ahead from spawn ──
  {
    const sx = 0, sz = -280, sRadius = 40;
    const noiseSeed = (rand() * 0x7fffffff) | 0;
    const group = buildIsland(sRadius, rand, noiseSeed);
    group.position.set(sx, 0, sz);
    group.userData.r = sRadius;
    scene.add(group);
    islands.push(group);
    positions.push({ x: sx, z: sz, r: sRadius, group });
  }

  function tooClose(x, z, minGap) {
    for (const p of positions) {
      const dx = x - p.x, dz = z - p.z;
      if (Math.sqrt(dx * dx + dz * dz) < minGap + p.r) return true;
    }
    return false;
  }

  for (const cfg of configs) {
    for (let i = 0; i < cfg.count; i++) {
      const radius = cfg.rMin + rand() * (cfg.rMax - cfg.rMin);

      let x, z, attempts = 0;
      do {
        const angle = rand() * Math.PI * 2;
        const dist = cfg.distMin + rand() * (cfg.distMax - cfg.distMin);
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
        attempts++;
      } while (tooClose(x, z, radius + 80) && attempts < 50);

      // Each island gets its own noise seed
      const noiseSeed = (rand() * 0x7fffffff) | 0;
      const group = buildIsland(radius, rand, noiseSeed);
      group.position.set(x, 0, z);
      group.userData.r = radius;
      scene.add(group);
      islands.push(group);
      positions.push({ x, z, r: radius, group });
    }
  }

  return { groups: islands, islandData: positions };
}

// ── Build a single island ────────────────────────────────────────────────
function buildIsland(radius, rand, noiseSeed) {
  const group = new THREE.Group();
  const perm = buildPermTable(mulberry32(noiseSeed));

  // Grid resolution scales with island size
  const res = Math.max(24, Math.round(radius * 0.8));
  const size = radius * 2.4; // plane extends a bit beyond radius for gentle shores

  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2); // lay flat

  const pos = geo.attributes.position;
  const peakHeight = radius * (0.15 + rand() * 0.08);
  const noiseScale = 1.8 / radius; // noise frequency relative to island size

  // Heightmap array for placing trees later
  const heights = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.sqrt(x * x + z * z);

    // Radial falloff — smooth blend to zero at edges
    const t = dist / radius;
    // Use a nice smooth falloff: 1 at center, 0 at t>=1
    // Combining a polynomial with a slight plateau in the middle
    let falloff = Math.max(0, 1 - t * t);
    falloff = falloff * falloff; // sharpen the drop at edges
    // Slight plateau so tops aren't too pointy
    falloff = Math.sqrt(falloff) * falloff; // sqrt blends it back a bit

    // Multi-octave noise for terrain detail
    const nx = x * noiseScale;
    const nz = z * noiseScale;
    const terrain = fbm(nx, nz, perm, 5, 2.2, 0.48);

    // Additional low-freq warping for asymmetric shape
    const warp = fbm(nx * 0.4 + 7.3, nz * 0.4 + 3.1, perm, 2, 2.0, 0.5);

    // Combine: base dome shape + noise detail + warped shore
    const edgeWarp = 1 + warp * 0.35;
    const warpedT = dist / (radius * edgeWarp);
    let warpedFalloff = Math.max(0, 1 - warpedT * warpedT);
    warpedFalloff = warpedFalloff * warpedFalloff;
    warpedFalloff = Math.sqrt(warpedFalloff) * warpedFalloff;

    let h = warpedFalloff * peakHeight;
    // Add noise detail scaled by falloff (so edges stay clean)
    h += terrain * peakHeight * 0.35 * warpedFalloff;
    // Slight ridges at medium-high areas
    h += Math.max(0, fbm(nx * 2.5, nz * 2.5, perm, 3, 2.0, 0.5)) * peakHeight * 0.12 * warpedFalloff;

    // Push underwater parts down and keep shore near water level
    if (h < 0.3) h = Math.min(h, -0.5); // cut off below waterline cleanly
    heights[i] = h;
    pos.setY(i, h);
  }

  group.userData.sampleHeight = (x, z) => sampleHeight(x, z, radius, peakHeight, perm);

  geo.computeVertexNormals();

  // ── Vertex colors based on height and slope ──
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const sandColor = new THREE.Color(0xd4b683);
  const wetSand = new THREE.Color(0xb8976a);
  const grassColor = new THREE.Color(0x4a8c3f);
  const darkGrass = new THREE.Color(0x2d6b28);
  const rockColor = new THREE.Color(0x7a7a6a);
  const snowColor = new THREE.Color(0xc8c8bf);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const h = heights[i];
    const ny = normals.getY(i); // upward component of normal — indicates slope
    const steepness = 1 - ny;   // 0 = flat, 1 = vertical

    if (h < 0.3) {
      // Below or at waterline — skip (these vertices will be culled/hidden)
      tmpColor.copy(wetSand);
    } else if (h < 1.5) {
      // Beach
      tmpColor.copy(wetSand).lerp(sandColor, (h - 0.3) / 1.2);
    } else if (h < 3.0) {
      // Sand to grass transition
      tmpColor.copy(sandColor).lerp(grassColor, (h - 1.5) / 1.5);
    } else if (steepness > 0.4) {
      // Steep slope — rocky
      tmpColor.copy(rockColor).lerp(grassColor, Math.max(0, 1 - steepness * 2));
    } else if (h > peakHeight * 0.85) {
      // High altitude — lighter rock / bare ground
      const ht = (h - peakHeight * 0.85) / (peakHeight * 0.15);
      tmpColor.copy(darkGrass).lerp(snowColor, Math.min(1, ht));
    } else {
      // Main vegetation
      const variation = fbm(
        pos.getX(i) * 0.1,
        pos.getZ(i) * 0.1,
        perm, 2, 2.0, 0.5
      );
      tmpColor.copy(grassColor).lerp(darkGrass, variation * 0.5 + 0.5);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const landMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
  const landMesh = new THREE.Mesh(geo, landMat);
  group.add(landMesh);

  // ── Palm trees on medium+ islands ──
  if (radius > 18) {
    const treeCount = Math.floor(radius * 0.1) + 2;
    for (let i = 0; i < treeCount; i++) {
      const tree = buildPalmTree(rand);
      // Place on the island surface by sampling random grid positions
      const gx = (rand() - 0.5) * radius * 1.2;
      const gz = (rand() - 0.5) * radius * 1.2;
      const dist = Math.sqrt(gx * gx + gz * gz);
      if (dist > radius * 0.85) continue; // skip if too close to edge
      const h = sampleHeight(gx, gz, radius, peakHeight, perm);
      if (h < 2.0) continue; // don't place in water/beach
      tree.position.set(gx, h, gz);
      tree.rotation.y = rand() * Math.PI * 2;
      const s = 0.7 + rand() * 0.6;
      tree.scale.setScalar(s);
      group.add(tree);
    }
  }

  // ── Rocks along shore ──
  const rockCount = Math.floor(radius * 0.08) + 1;
  for (let i = 0; i < rockCount; i++) {
    const rock = buildRock(rand);
    const a = rand() * Math.PI * 2;
    const d = radius * (0.6 + rand() * 0.35);
    const rx = Math.cos(a) * d;
    const rz = Math.sin(a) * d;
    const h = sampleHeight(rx, rz, radius, peakHeight, perm);
    if (h < 0) continue;
    rock.position.set(rx, h, rz);
    rock.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
    const s = 1 + rand() * 2.5;
    rock.scale.set(s, s * (0.4 + rand() * 0.5), s);
    group.add(rock);
  }

  return group;
}

// Sample terrain height at arbitrary (x,z) for object placement
function sampleHeight(x, z, radius, peakHeight, perm) {
  const noiseScale = 1.8 / radius;
  const dist = Math.sqrt(x * x + z * z);
  const nx = x * noiseScale;
  const nz = z * noiseScale;

  const warp = fbm(nx * 0.4 + 7.3, nz * 0.4 + 3.1, perm, 2, 2.0, 0.5);
  const edgeWarp = 1 + warp * 0.35;
  const warpedT = dist / (radius * edgeWarp);
  let falloff = Math.max(0, 1 - warpedT * warpedT);
  falloff = falloff * falloff;
  falloff = Math.sqrt(falloff) * falloff;

  const terrain = fbm(nx, nz, perm, 5, 2.2, 0.48);
  let h = falloff * peakHeight;
  h += terrain * peakHeight * 0.35 * falloff;
  h += Math.max(0, fbm(nx * 2.5, nz * 2.5, perm, 3, 2.0, 0.5)) * peakHeight * 0.12 * falloff;
  return h;
}

// ── Palm tree ────────────────────────────────────────────────────────────
function buildPalmTree(rand) {
  const group = new THREE.Group();

  const trunkHeight = 8 + rand() * 7;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(rand() * 1.5 - 0.75, trunkHeight * 0.4, rand() * 1.5 - 0.75),
    new THREE.Vector3(rand() * 2 - 1, trunkHeight * 0.75, rand() * 2 - 1),
    new THREE.Vector3(rand() * 1 - 0.5, trunkHeight, rand() * 1 - 0.5),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 8, 0.4, 6, false);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x8B6914,
    roughness: 0.95,
    metalness: 0.0,
  });
  group.add(new THREE.Mesh(trunkGeo, trunkMat));

  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x3a7a2a,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const topPos = curve.getPointAt(1);
  const frondCount = 5 + Math.floor(rand() * 3);

  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + rand() * 0.3;
    const length = 4 + rand() * 3;
    const droop = 0.5 + rand() * 0.6;

    const frondShape = new THREE.Shape();
    frondShape.moveTo(0, 0);
    frondShape.quadraticCurveTo(length * 0.3, 0.8, length, 0.15);
    frondShape.lineTo(length, -0.15);
    frondShape.quadraticCurveTo(length * 0.3, -0.8, 0, 0);

    const frondGeo = new THREE.ShapeGeometry(frondShape, 4);
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.copy(topPos);
    frond.rotation.set(-droop, angle, 0);
    group.add(frond);
  }

  return group;
}

// ── Rock ─────────────────────────────────────────────────────────────────
function buildRock(rand) {
  const geo = new THREE.DodecahedronGeometry(1.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (rand() - 0.5) * 0.5);
    pos.setY(i, pos.getY(i) + (rand() - 0.5) * 0.4);
    pos.setZ(i, pos.getZ(i) + (rand() - 0.5) * 0.5);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x777770,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  return new THREE.Mesh(geo, mat);
}
