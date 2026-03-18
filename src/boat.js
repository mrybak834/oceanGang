import * as THREE from 'three';

// Build a proper boat hull as a single continuous mesh from cross-section frames
function buildHullGeometry() {
  // Define hull cross-sections from bow (z = -6) to stern (z = 5)
  // Each frame: { z, halfWidth, depth, deckY }
  const frames = [
    { z: -6.5, hw: 0.0,  depth: 0.0, dy: 0.6 },   // bow tip
    { z: -5.5, hw: 0.3,  depth: 0.5, dy: 0.6 },
    { z: -4.5, hw: 0.7,  depth: 1.0, dy: 0.7 },
    { z: -3.5, hw: 1.0,  depth: 1.4, dy: 0.8 },
    { z: -2.5, hw: 1.25, depth: 1.6, dy: 0.85 },
    { z: -1.5, hw: 1.4,  depth: 1.7, dy: 0.85 },
    { z: -0.5, hw: 1.5,  depth: 1.8, dy: 0.85 },
    { z:  0.5, hw: 1.5,  depth: 1.8, dy: 0.85 },
    { z:  1.5, hw: 1.45, depth: 1.7, dy: 0.85 },
    { z:  2.5, hw: 1.35, depth: 1.6, dy: 0.9 },
    { z:  3.5, hw: 1.2,  depth: 1.4, dy: 1.0 },
    { z:  4.5, hw: 0.9,  depth: 1.0, dy: 1.1 },
    { z:  5.0, hw: 0.6,  depth: 0.6, dy: 1.15 },    // stern
  ];

  // For each frame, generate points around the cross-section (half-circle bottom + straight sides)
  const segmentsPerFrame = 12;
  const vertices = [];
  const uvs = [];
  const indices = [];

  const zMin = frames[0].z;
  const zMax = frames[frames.length - 1].z;

  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    const u = (f.z - zMin) / (zMax - zMin); // 0..1 along hull length
    for (let si = 0; si <= segmentsPerFrame; si++) {
      const t = si / segmentsPerFrame; // 0 = port top, 0.5 = keel, 1 = starboard top
      let x, y;
      if (t <= 0.5) {
        x = -f.hw * Math.cos(t * Math.PI);
        y = f.dy - f.depth * Math.sin(t * Math.PI);
      } else {
        const angle = (t - 0.5) * 2;
        x = f.hw * Math.cos((1 - angle) * Math.PI);
        y = f.dy - f.depth * Math.sin((1 - angle) * Math.PI);
      }
      vertices.push(x, y, f.z);
      uvs.push(u, t); // u = along hull, v = around cross-section
    }
  }

  // Create faces between adjacent frames
  const vertsPerFrame = segmentsPerFrame + 1;
  for (let fi = 0; fi < frames.length - 1; fi++) {
    for (let si = 0; si < segmentsPerFrame; si++) {
      const a = fi * vertsPerFrame + si;
      const b = fi * vertsPerFrame + si + 1;
      const c = (fi + 1) * vertsPerFrame + si;
      const d = (fi + 1) * vertsPerFrame + si + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

// Build hull side walls (gunwale strip) so the hull has visible sides above water
function buildGunwaleGeometry() {
  const frames = [
    { z: -6.5, hw: 0.0,  dy: 0.6,  topY: 0.6 },
    { z: -5.5, hw: 0.3,  dy: 0.6,  topY: 0.9 },
    { z: -4.5, hw: 0.7,  dy: 0.7,  topY: 1.0 },
    { z: -3.5, hw: 1.0,  dy: 0.8,  topY: 1.05 },
    { z: -2.5, hw: 1.25, dy: 0.85, topY: 1.05 },
    { z: -1.5, hw: 1.4,  dy: 0.85, topY: 1.05 },
    { z: -0.5, hw: 1.5,  dy: 0.85, topY: 1.05 },
    { z:  0.5, hw: 1.5,  dy: 0.85, topY: 1.05 },
    { z:  1.5, hw: 1.45, dy: 0.85, topY: 1.1 },
    { z:  2.5, hw: 1.35, dy: 0.9,  topY: 1.15 },
    { z:  3.5, hw: 1.2,  dy: 1.0,  topY: 1.25 },
    { z:  4.5, hw: 0.9,  dy: 1.1,  topY: 1.35 },
    { z:  5.0, hw: 0.6,  dy: 1.15, topY: 1.4 },
  ];

  const vertices = [];
  const indices = [];

  // Port side wall + starboard side wall
  for (const side of [-1, 1]) {
    const offset = vertices.length / 3;
    for (const f of frames) {
      // Bottom point (at gunwale/deck edge)
      vertices.push(side * f.hw, f.dy, f.z);
      // Top point (raised gunwale)
      vertices.push(side * f.hw, f.topY, f.z);
    }
    for (let i = 0; i < frames.length - 1; i++) {
      const a = offset + i * 2;
      const b = offset + i * 2 + 1;
      const c = offset + (i + 1) * 2;
      const d = offset + (i + 1) * 2 + 1;
      if (side === -1) {
        indices.push(a, b, c);
        indices.push(b, d, c);
      } else {
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
  }

  // Stern transom (flat back)
  const sternF = frames[frames.length - 1];
  const offset = vertices.length / 3;
  vertices.push(-sternF.hw, sternF.dy, sternF.z);
  vertices.push(-sternF.hw, sternF.topY, sternF.z);
  vertices.push(sternF.hw, sternF.dy, sternF.z);
  vertices.push(sternF.hw, sternF.topY, sternF.z);
  // Bottom triangle
  const keelY = sternF.dy - sternF.hw * 0.4; // approximate keel depth at stern
  vertices.push(0, keelY, sternF.z);
  indices.push(offset, offset + 2, offset + 4); // bottom triangle
  indices.push(offset, offset + 1, offset + 2);
  indices.push(offset + 1, offset + 3, offset + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export function createBoat(scene) {
  const boat = new THREE.Group();
  const editableObjects = [];

  function registerEditable(name, object) {
    object.name = name;
    editableObjects.push(object);
    return object;
  }

  // --- Procedural wood color texture ---
  function makeWoodTexture(baseR, baseG, baseB, opts = {}) {
    const w = opts.width || 256;
    const h = opts.height || 256;
    const grainCount = opts.grainCount || 40;
    const knotCount = opts.knots || 3;
    const plankLines = opts.planks || 0;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Base fill
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    ctx.fillRect(0, 0, w, h);

    // Wood grain — strong, visible lines with good contrast
    for (let i = 0; i < grainCount; i++) {
      const y = Math.random() * h;
      const dark = Math.random() > 0.5;
      const shift = dark ? -(20 + Math.random() * 30) : (10 + Math.random() * 20);
      const r = Math.max(0, Math.min(255, baseR + shift));
      const g = Math.max(0, Math.min(255, baseG + shift * 0.7));
      const b = Math.max(0, Math.min(255, baseB + shift * 0.5));
      ctx.strokeStyle = `rgba(${r|0},${g|0},${b|0},${0.4 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.5 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 6) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i * 0.8) * (1 + Math.random() * 3));
      }
      ctx.stroke();
    }

    // Knots
    for (let i = 0; i < knotCount; i++) {
      const kx = 20 + Math.random() * (w - 40);
      const ky = 20 + Math.random() * (h - 40);
      const kr = 5 + Math.random() * 10;
      const dark = Math.max(0, baseR - 50);
      const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      grad.addColorStop(0, `rgba(${dark},${dark * 0.5 | 0},${dark * 0.2 | 0},0.9)`);
      grad.addColorStop(0.6, `rgba(${dark + 15},${(dark + 10) * 0.6 | 0},${dark * 0.3 | 0},0.5)`);
      grad.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 0.6, Math.random() * 0.5, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 2; r < kr; r += 2) {
        ctx.strokeStyle = `rgba(${dark * 0.8 | 0},${dark * 0.4 | 0},${dark * 0.15 | 0},0.2)`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r, r * 0.6, Math.random() * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Plank dividers
    if (plankLines > 0) {
      const gap = h / plankLines;
      ctx.setLineDash([]);
      for (let i = 1; i < plankLines; i++) {
        const py = i * gap;
        // Dark seam
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
        // Highlight edge below
        ctx.strokeStyle = `rgba(${Math.min(255, baseR + 25)},${Math.min(255, baseG + 20)},${Math.min(255, baseB + 15)},0.2)`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, py + 2); ctx.lineTo(w, py + 2); ctx.stroke();
      }
    }

    // Fine noise
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 14;
      d[i] = Math.max(0, Math.min(255, d[i] + noise));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
    return tex;
  }

  // --- Materials ---
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b3a1a,
    map: makeWoodTexture(100, 60, 28, { grainCount: 55, knots: 4, planks: 10, repeatX: 2 }),
    roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
  });
  const hullDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a1a08,
    map: makeWoodTexture(45, 25, 10, { grainCount: 40, knots: 2 }),
    roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide,
  });
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xb08040,
    map: makeWoodTexture(195, 160, 105, { grainCount: 65, knots: 4, planks: 12, repeatY: 2 }),
    roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
  });
  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a3215,
    map: makeWoodTexture(80, 52, 24, { width: 128, height: 256, grainCount: 45, knots: 2, repeatY: 3 }),
    roughness: 0.85, metalness: 0.0,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2a12,
    map: makeWoodTexture(65, 45, 28, { width: 128, height: 128, grainCount: 30, knots: 1 }),
    roughness: 0.88, metalness: 0.0,
  });
  // --- Patchwork sail texture ---
  function makePatchworkTexture(w, h, patchCols, patchRows) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const patchW = w / patchCols;
    const patchH = h / patchRows;

    // Patch colors — aged canvas, linen, repaired cloth
    const patchColors = [
      '#f5edd5', '#e8dcc0', '#f0e4c8', '#ddd2b8',
      '#ebe0c4', '#d8cab0', '#f2e8d0', '#e0d4bc',
      '#c8bca4', '#eee2ca', '#d5c8ae', '#f8f0da',
      '#cfc2a8', '#e5d8be', '#daceB4', '#f0e6cc',
    ];

    for (let r = 0; r < patchRows; r++) {
      for (let c = 0; c < patchCols; c++) {
        const color = patchColors[Math.floor(Math.random() * patchColors.length)];
        ctx.fillStyle = color;
        ctx.fillRect(c * patchW, r * patchH, patchW, patchH);

        // Subtle grain noise per patch
        ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`;
        for (let n = 0; n < 20; n++) {
          const nx = c * patchW + Math.random() * patchW;
          const ny = r * patchH + Math.random() * patchH;
          ctx.fillRect(nx, ny, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }
      }
    }

    // Draw stitch lines between patches
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]); // dashed stitch pattern

    // Horizontal stitches
    for (let r = 1; r < patchRows; r++) {
      const y = r * patchH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical stitches
    for (let c = 1; c < patchCols; c++) {
      const x = c * patchW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Occasional repair patches (darker, overlaid)
    for (let p = 0; p < 2; p++) {
      const px = Math.random() * (w - 40) + 10;
      const py = Math.random() * (h - 40) + 10;
      const ps = 20 + Math.random() * 25;
      ctx.fillStyle = `rgba(160,140,110,0.4)`;
      ctx.fillRect(px, py, ps, ps * 0.7);
      ctx.strokeStyle = '#7a6a50';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.strokeRect(px, py, ps, ps * 0.7);
      ctx.setLineDash([]);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { texture, patchCols, patchRows };
  }

  const mainSailTex = makePatchworkTexture(512, 512, 4, 5);
  const foreSailTex = makePatchworkTexture(384, 384, 3, 4);
  const jibSailTex = makePatchworkTexture(320, 384, 3, 4);

  function makeSailMaterial(texInfo) {
    return new THREE.MeshStandardMaterial({
      map: texInfo.texture,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  const mainSailMat = makeSailMaterial(mainSailTex);
  const foreSailMat = makeSailMaterial(foreSailTex);
  const jibSailMat = makeSailMaterial(jibSailTex);

  // --- Hull (single continuous mesh) ---
  const hullGeo = buildHullGeometry();
  const hull = registerEditable('Hull', new THREE.Mesh(hullGeo, hullMaterial));
  boat.add(hull);

  // Hull upper sides / gunwale
  const gunwaleGeo = buildGunwaleGeometry();
  const gunwale = new THREE.Mesh(gunwaleGeo, hullMaterial);
  boat.add(gunwale);

  // Waterline dark stripe (at hull sides, just above water)
  for (const side of [-1, 1]) {
    const stripeGeo = new THREE.BoxGeometry(0.04, 0.15, 11);
    const stripe = new THREE.Mesh(stripeGeo, hullDarkMaterial);
    stripe.position.set(side * 1.48, 0.75, -0.5);
    boat.add(stripe);
  }

  // --- Deck (follows hull shape) ---
  const deckShape = new THREE.Shape();
  // Trace the deck outline matching hull frames
  deckShape.moveTo(0, -6.5);
  deckShape.lineTo(0.3, -5.5);
  deckShape.lineTo(0.7, -4.5);
  deckShape.lineTo(1.0, -3.5);
  deckShape.lineTo(1.25, -2.5);
  deckShape.lineTo(1.4, -1.5);
  deckShape.lineTo(1.5, -0.5);
  deckShape.lineTo(1.5, 0.5);
  deckShape.lineTo(1.45, 1.5);
  deckShape.lineTo(1.35, 2.5);
  deckShape.lineTo(1.2, 3.5);
  deckShape.lineTo(0.9, 4.5);
  deckShape.lineTo(0.6, 5.0);
  // Return along other side
  deckShape.lineTo(-0.6, 5.0);
  deckShape.lineTo(-0.9, 4.5);
  deckShape.lineTo(-1.2, 3.5);
  deckShape.lineTo(-1.35, 2.5);
  deckShape.lineTo(-1.45, 1.5);
  deckShape.lineTo(-1.5, 0.5);
  deckShape.lineTo(-1.5, -0.5);
  deckShape.lineTo(-1.4, -1.5);
  deckShape.lineTo(-1.25, -2.5);
  deckShape.lineTo(-1.0, -3.5);
  deckShape.lineTo(-0.7, -4.5);
  deckShape.lineTo(-0.3, -5.5);
  deckShape.lineTo(0, -6.5);

  const deckGeo = new THREE.ShapeGeometry(deckShape, 1);
  deckGeo.rotateZ(Math.PI); // flip 180° in-plane before laying flat
  const deck = registerEditable('Main Deck', new THREE.Mesh(deckGeo, deckMaterial));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 1.05;
  boat.add(deck);

  // Deck plank lines
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xa08050, roughness: 1.0 });
  for (let z = -5; z <= 4.5; z += 0.8) {
    // Approximate hull width at this z
    const t = (z + 6.5) / 11.5;
    const w = Math.sin(t * Math.PI) * 2.8;
    if (w > 0.3) {
      const plankGeo = new THREE.BoxGeometry(w, 0.015, 0.04);
      const plank = new THREE.Mesh(plankGeo, plankMat);
      plank.position.set(0, 1.06, z);
      boat.add(plank);
    }
  }

  // --- Cabin / Quarterdeck (raised stern) ---
  // Raised stern deck
  const sternDeckGeo = new THREE.BoxGeometry(2.4, 0.15, 3.0);
  const sternDeck = registerEditable('Quarterdeck', new THREE.Mesh(sternDeckGeo, deckMaterial));
  sternDeck.position.set(0, 1.35, 3.2);
  boat.add(sternDeck);

  // Step up to stern deck
  const stepGeo = new THREE.BoxGeometry(2.0, 0.3, 0.15);
  const step = registerEditable('Quarterdeck Step', new THREE.Mesh(stepGeo, new THREE.MeshStandardMaterial({
    color: 0x7a4a22,
    map: makeWoodTexture(140, 108, 64, { width: 128, height: 64, grainCount: 20, knots: 1 }),
    roughness: 0.9, metalness: 0.0,
  })));
  step.position.set(0, 1.2, 1.65);
  boat.add(step);

  // Cabin
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b3820,
    map: makeWoodTexture(110, 65, 40, { grainCount: 45, knots: 3, planks: 6 }),
    roughness: 0.9, metalness: 0.0,
  });
  const cabinGeo = new THREE.BoxGeometry(1.8, 1.1, 2.0);
  const cabin = registerEditable('Cabin', new THREE.Mesh(cabinGeo, cabinMaterial));
  cabin.position.set(0, 1.95, 3.5);
  boat.add(cabin);

  // Cabin roof (slightly wider, angled)
  const roofGeo = new THREE.BoxGeometry(2.0, 0.1, 2.2);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x7a4528,
    map: makeWoodTexture(140, 95, 62, { width: 128, height: 128, grainCount: 35, knots: 2, planks: 4 }),
    roughness: 0.9, metalness: 0.0,
  });
  const roof = registerEditable('Cabin Roof', new THREE.Mesh(roofGeo, roofMat));
  roof.position.set(0, 2.55, 3.5);
  boat.add(roof);

  // Cabin windows
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x88ccee,
    roughness: 0.2,
    metalness: 0.4,
    emissive: 0x224466,
    emissiveIntensity: 0.3,
  });
  for (const side of [-1, 1]) {
    for (let wz = 2.8; wz <= 4.2; wz += 0.7) {
      const winGeo = new THREE.BoxGeometry(0.05, 0.35, 0.3);
      const win = new THREE.Mesh(winGeo, windowMat);
      win.position.set(side * 0.92, 1.95, wz);
      boat.add(win);
    }
  }
  // Stern window
  const sternWinGeo = new THREE.BoxGeometry(0.6, 0.35, 0.05);
  const sternWin = new THREE.Mesh(sternWinGeo, windowMat);
  sternWin.position.set(0, 1.95, 4.52);
  boat.add(sternWin);

  // --- Main Mast ---
  const mainMastGeo = new THREE.CylinderGeometry(0.1, 0.14, 10, 8);
  const mainMast = registerEditable('Main Mast', new THREE.Mesh(mainMastGeo, mastMaterial));
  mainMast.position.set(0, 6.1, -0.5);
  boat.add(mainMast);

  // Crow's nest
  const platformGeo = new THREE.CylinderGeometry(0.5, 0.45, 0.15, 12);
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, 9.8, -0.5);
  boat.add(platform);

  // --- Fore Mast ---
  const foreMastGeo = new THREE.CylinderGeometry(0.08, 0.11, 7, 8);
  const foreMast = registerEditable('Fore Mast', new THREE.Mesh(foreMastGeo, mastMaterial));
  foreMast.position.set(0, 4.6, -3.5);
  boat.add(foreMast);

  // --- Main Sail (subdivided for wind deformation) ---
  const mainSailGeo = new THREE.PlaneGeometry(3.5, 6.5, 10, 14);
  const mainSail = registerEditable('Main Sail', new THREE.Mesh(mainSailGeo, mainSailMat));
  mainSail.position.set(0, 6.0, -0.5);
  mainSail.rotation.y = -Math.PI / 2;
  // Taper: make it triangular by pulling top-right vertices toward mast
  const msPos = mainSailGeo.attributes.position;
  for (let i = 0; i < msPos.count; i++) {
    const x = msPos.getX(i); // horizontal (becomes depth via rotation)
    const y = msPos.getY(i); // vertical
    // Normalize y from -3.25 to 3.25 -> 0 to 1
    const ny = (y + 3.25) / 6.5;
    // Taper width: full at bottom, narrow at top
    const taper = 1.0 - ny * 0.7;
    // Only allow positive x (billowing outward), clamp left edge to mast
    const nx = (x + 1.75) / 3.5; // 0=left(mast), 1=right(outward)
    const newX = -1.75 + nx * taper * 3.5;
    msPos.setX(i, Math.max(-1.75, newX));
  }
  msPos.needsUpdate = true;
  mainSailGeo.computeVertexNormals();
  // Store base positions for animation
  mainSailGeo.userData = { basePositions: new Float32Array(msPos.array), patchCols: mainSailTex.patchCols, patchRows: mainSailTex.patchRows };
  boat.add(mainSail);

  // --- Fore Sail (subdivided) ---
  const foreSailGeo = new THREE.PlaneGeometry(2.5, 4.5, 8, 10);
  const foreSail = registerEditable('Fore Sail', new THREE.Mesh(foreSailGeo, foreSailMat));
  foreSail.position.set(0, 4.0, -3.5);
  foreSail.rotation.y = -Math.PI / 2;
  const fsPos = foreSailGeo.attributes.position;
  for (let i = 0; i < fsPos.count; i++) {
    const x = fsPos.getX(i);
    const y = fsPos.getY(i);
    const ny = (y + 2.25) / 4.5;
    const taper = 1.0 - ny * 0.75;
    const nx = (x + 1.25) / 2.5;
    fsPos.setX(i, Math.max(-1.25, -1.25 + nx * taper * 2.5));
  }
  fsPos.needsUpdate = true;
  foreSailGeo.computeVertexNormals();
  foreSailGeo.userData = { basePositions: new Float32Array(fsPos.array), patchCols: foreSailTex.patchCols, patchRows: foreSailTex.patchRows };
  boat.add(foreSail);

  // --- Jib (triangular, subdivided) ---
  const jibGeo = new THREE.PlaneGeometry(2.2, 5.0, 7, 12);
  const jib = registerEditable('Jib Sail', new THREE.Mesh(jibGeo, jibSailMat));
  jib.position.set(0, 4.0, -5.5);
  jib.rotation.y = -Math.PI / 2;
  const jPos = jibGeo.attributes.position;
  for (let i = 0; i < jPos.count; i++) {
    const x = jPos.getX(i);
    const y = jPos.getY(i);
    const ny = (y + 2.5) / 5.0;
    const taper = 1.0 - ny * 0.85;
    const nx = (x + 1.1) / 2.2;
    jPos.setX(i, Math.max(-1.1, -1.1 + nx * taper * 2.2));
  }
  jPos.needsUpdate = true;
  jibGeo.computeVertexNormals();
  jibGeo.userData = { basePositions: new Float32Array(jPos.array), patchCols: jibSailTex.patchCols, patchRows: jibSailTex.patchRows };
  boat.add(jib);

  // --- Boom ---
  const boomGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 6);
  const boom = registerEditable('Boom', new THREE.Mesh(boomGeo, mastMaterial));
  boom.rotation.z = Math.PI / 2;
  boom.position.set(1.5, 2.7, -0.5);
  boat.add(boom);

  // --- Railings (follow hull shape) ---
  for (const side of [-1, 1]) {
    // Build railing from bow to stern step
    const railPoints = [];
    const railFrames = [
      { z: -5.0, hw: 0.55 }, { z: -4.0, hw: 0.85 }, { z: -3.0, hw: 1.12 },
      { z: -2.0, hw: 1.32 }, { z: -1.0, hw: 1.45 }, { z: 0, hw: 1.5 },
      { z: 1.0, hw: 1.48 }, { z: 1.5, hw: 1.42 },
    ];
    for (const rf of railFrames) {
      railPoints.push(new THREE.Vector3(side * rf.hw, 1.55, rf.z));
    }
    const railCurve = new THREE.CatmullRomCurve3(railPoints);
    const railTubeGeo = new THREE.TubeGeometry(railCurve, 20, 0.04, 6, false);
    const railTube = new THREE.Mesh(railTubeGeo, railMaterial);
    boat.add(railTube);

    // Railing posts
    for (const rf of railFrames) {
      if (Math.abs(rf.z) % 2 < 1.5) {
        const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
        const post = new THREE.Mesh(postGeo, railMaterial);
        post.position.set(side * rf.hw, 1.3, rf.z);
        boat.add(post);
      }
    }
  }

  // Stern railing
  for (const side of [-1, 1]) {
    const sternRailPoints = [
      new THREE.Vector3(side * 1.15, 1.85, 2.2),
      new THREE.Vector3(side * 1.1, 1.85, 3.5),
      new THREE.Vector3(side * 0.9, 1.85, 4.5),
    ];
    const sternCurve = new THREE.CatmullRomCurve3(sternRailPoints);
    const sternRailGeo = new THREE.TubeGeometry(sternCurve, 10, 0.035, 6, false);
    const sternRail = new THREE.Mesh(sternRailGeo, railMaterial);
    boat.add(sternRail);
  }
  // Stern cross rail
  const sternCrossGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6);
  const sternCross = new THREE.Mesh(sternCrossGeo, railMaterial);
  sternCross.rotation.z = Math.PI / 2;
  sternCross.position.set(0, 1.85, 4.5);
  boat.add(sternCross);

  // --- Helm wheel ---
  const wheelGroup = registerEditable('Helm Wheel', new THREE.Group());
  const wheelRingGeo = new THREE.TorusGeometry(0.28, 0.03, 8, 18);
  const wheelHubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8);
  const wheelRing = new THREE.Mesh(wheelRingGeo, railMaterial);
  const wheelHub = new THREE.Mesh(wheelHubGeo, railMaterial);
  wheelHub.rotation.x = Math.PI / 2;
  wheelGroup.add(wheelRing);
  wheelGroup.add(wheelHub);
  for (let i = 0; i < 8; i++) {
    const spokeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
    const spoke = new THREE.Mesh(spokeGeo, railMaterial);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 8) * Math.PI * 2;
    const angle = (i / 8) * Math.PI * 2;
    spoke.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0);
    wheelGroup.add(spoke);

    const handleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6);
    const handle = new THREE.Mesh(handleGeo, mastMaterial);
    handle.rotation.z = Math.PI / 2;
    handle.rotation.y = spoke.rotation.y;
    handle.position.set(Math.cos(angle) * 0.31, Math.sin(angle) * 0.31, 0);
    wheelGroup.add(handle);
  }
  const wheelStandGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
  const wheelStand = new THREE.Mesh(wheelStandGeo, mastMaterial);
  wheelStand.position.set(0, -0.35, 0);
  wheelGroup.add(wheelStand);
  wheelGroup.position.set(0, 1.85, 1.95);
  wheelGroup.rotation.x = -0.32;
  wheelGroup.rotation.z = Math.PI / 2;
  boat.add(wheelGroup);

  // --- Bowsprit ---
  const bowspritGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6);
  const bowsprit = new THREE.Mesh(bowspritGeo, mastMaterial);
  bowsprit.rotation.x = Math.PI / 2 + 0.2;
  bowsprit.position.set(0, 1.2, -7.0);
  boat.add(bowsprit);

  // --- Flag ---
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(1.2, 0.2);
  flagShape.quadraticCurveTo(1.0, 0.45, 1.2, 0.7);
  flagShape.lineTo(0, 0.5);
  flagShape.lineTo(0, 0);
  const flagGeo = new THREE.ShapeGeometry(flagShape, 6);
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0xcc2222,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const flag = registerEditable('Flag', new THREE.Mesh(flagGeo, flagMat));
  flag.position.set(0, 10.8, -0.5);
  flag.rotation.y = -Math.PI / 2;
  boat.add(flag);

  // --- Rudder ---
  const rudderGeo = new THREE.BoxGeometry(0.1, 1.4, 0.6);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.8 });
  const rudder = registerEditable('Rudder', new THREE.Mesh(rudderGeo, rudderMat));
  rudder.position.set(0, 0.0, 5.2);
  boat.add(rudder);

  // --- Rope shrouds ---
  const ropeMaterial = new THREE.LineBasicMaterial({ color: 0x8b7355 });

  for (const side of [-1, 1]) {
    // Main mast shrouds
    const pts1 = [new THREE.Vector3(0, 9.8, -0.5), new THREE.Vector3(side * 1.4, 1.1, 1.0)];
    boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), ropeMaterial));

    // Fore mast shrouds
    const pts2 = [new THREE.Vector3(0, 7.3, -3.5), new THREE.Vector3(side * 1.2, 1.1, -2.5)];
    boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), ropeMaterial));
  }

  // Forestay
  const forestayPts = [new THREE.Vector3(0, 9.8, -0.5), new THREE.Vector3(0, 1.5, -8.0)];
  boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(forestayPts), ropeMaterial));

  // Backstay
  const backstayPts = [new THREE.Vector3(0, 9.8, -0.5), new THREE.Vector3(0, 2.6, 4.5)];
  boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(backstayPts), ropeMaterial));

  // --- Anchor ring ---
  const anchorRingGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 12);
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 });
  const anchorRing = new THREE.Mesh(anchorRingGeo, anchorMat);
  anchorRing.position.set(1.45, 0.5, -3.0);
  anchorRing.rotation.y = Math.PI / 2;
  boat.add(anchorRing);

  // --- Crew members (sailors) ---
  function createSailor(x, z, rotY, opts = {}) {
    const person = new THREE.Group();
    const {
      skinColor = 0xd4a574,
      shirtColor = 0xe8e0d0,
      vestColor = null,
      coatColor = null,
      capeColor = null,
      capeTrimColor = null,
      sashColor = null,
      trouserColor = 0x2b3d5e,
      hatType = 'bandana',
      hatColor = 0xaa2222,
      plumeColor = null,
      hasBeard = false,
      beardColor = 0x3a2a1a,
      beardStyle = 'short',
      armPose = 'neutral',
    } = opts;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.75 });

    // Boots
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    for (const side of [-0.055, 0.055]) {
      const bootGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.18, 5);
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(side, 0.09, 0);
      person.add(boot);
    }

    // Trousers / legs
    const trouserMat = new THREE.MeshStandardMaterial({ color: trouserColor, roughness: 0.85 });
    for (const side of [-0.055, 0.055]) {
      const legGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.25, 5);
      const leg = new THREE.Mesh(legGeo, trouserMat);
      leg.position.set(side, 0.3, 0);
      person.add(leg);
    }

    // Shirt / tunic
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
    const bodyGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.35, 6);
    const body = new THREE.Mesh(bodyGeo, shirtMat);
    body.position.y = 0.6;
    person.add(body);

    // Vest / waistcoat (if provided)
    if (vestColor) {
      const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.7 });
      const vestGeo = new THREE.CylinderGeometry(0.115, 0.135, 0.3, 6);
      const vest = new THREE.Mesh(vestGeo, vestMat);
      vest.position.y = 0.6;
      person.add(vest);
    }

    if (coatColor) {
      const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.82 });
      const coatGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.4, 8, 1, true);
      const coat = new THREE.Mesh(coatGeo, coatMat);
      coat.position.y = 0.58;
      person.add(coat);

      for (const side of [-1, 1]) {
        const tailGeo = new THREE.BoxGeometry(0.09, 0.22, 0.18);
        const tail = new THREE.Mesh(tailGeo, coatMat);
        tail.position.set(side * 0.07, 0.38, -0.08);
        tail.rotation.x = 0.2;
        person.add(tail);
      }
    }

    if (capeColor) {
      const capeMat = new THREE.MeshStandardMaterial({
        color: capeColor,
        roughness: 0.86,
        side: THREE.DoubleSide,
      });
      // Draped cape — wide plane with curved vertex positions
      const capeGeo = new THREE.PlaneGeometry(0.38, 0.55, 8, 6);
      const capePos = capeGeo.attributes.position;
      for (let i = 0; i < capePos.count; i++) {
        const x = capePos.getX(i);
        const y = capePos.getY(i);
        // Curve outward at the back for drape
        const t = (y + 0.275) / 0.55; // 0 at bottom, 1 at top
        const sideT = Math.abs(x) / 0.19;
        // Push Z back more at bottom and edges for a flowing shape
        const z = -0.06 * (1 - t) * (1 + sideT * 0.5);
        // Widen at the bottom
        const widen = 1 + (1 - t) * 0.35;
        capePos.setX(i, x * widen);
        capePos.setZ(i, z);
      }
      capeGeo.computeVertexNormals();
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, 0.53, -0.1);
      person.add(cape);

      if (capeTrimColor) {
        const trimMat = new THREE.MeshStandardMaterial({ color: capeTrimColor, roughness: 0.65 });
        // Shoulder clasps
        const claspGeo = new THREE.SphereGeometry(0.025, 6, 6);
        for (const side of [-1, 1]) {
          const clasp = new THREE.Mesh(claspGeo, trimMat);
          clasp.position.set(side * 0.1, 0.73, -0.06);
          person.add(clasp);
        }
        // Bottom trim — a thin strip along cape bottom edge
        const trimGeo = new THREE.BoxGeometry(0.52, 0.02, 0.02);
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.position.set(0, 0.26, -0.13);
        person.add(trim);
      }
    }

    // Belt / sash
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.7 });
    const beltGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 8);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.45;
    person.add(belt);

    if (sashColor) {
      const sashMat = new THREE.MeshStandardMaterial({ color: sashColor, roughness: 0.65 });
      const sashGeo = new THREE.TorusGeometry(0.135, 0.02, 6, 14);
      const sash = new THREE.Mesh(sashGeo, sashMat);
      sash.position.y = 0.47;
      sash.rotation.x = Math.PI / 2;
      person.add(sash);
    }

    // Arms
    for (const side of [-1, 1]) {
      const armGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.32, 5);
      const arm = new THREE.Mesh(armGeo, shirtMat);
      arm.position.set(side * 0.15, 0.55, 0);
      if (armPose === 'helm') {
        arm.rotation.z = side * 1.1;
        arm.rotation.x = -0.9;
        arm.position.z = 0.1;
      } else {
        arm.rotation.z = side * 0.15;
      }
      person.add(arm);
      // Hands
      const handGeo = new THREE.SphereGeometry(0.035, 5, 5);
      const hand = new THREE.Mesh(handGeo, skinMat);
      if (armPose === 'helm') {
        hand.position.set(side * 0.26, 0.5, 0.18);
      } else {
        hand.position.set(side * 0.17, 0.38, 0);
      }
      person.add(hand);
    }

    // Head
    const headGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.87;
    person.add(head);

    // Beard
    if (hasBeard) {
      const beardMat = new THREE.MeshStandardMaterial({ color: beardColor, roughness: 0.9 });
      if (beardStyle === 'longCurly') {
        const beardBaseGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.24, 7);
        const beardBase = new THREE.Mesh(beardBaseGeo, beardMat);
        beardBase.position.set(0, 0.72, 0.05);
        beardBase.rotation.x = 0.12;
        person.add(beardBase);

        for (const side of [-1, 1]) {
          const curlGeo = new THREE.TorusGeometry(0.045, 0.015, 5, 10, Math.PI * 1.35);
          const curl = new THREE.Mesh(curlGeo, beardMat);
          curl.position.set(side * 0.05, 0.57, 0.08);
          curl.rotation.z = side * 0.8;
          curl.rotation.x = Math.PI / 2;
          person.add(curl);
        }
      } else {
        const beardGeo = new THREE.SphereGeometry(0.07, 6, 4, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.5);
        const beard = new THREE.Mesh(beardGeo, beardMat);
        beard.position.set(0, 0.82, 0.04);
        person.add(beard);
      }
    }

    // Hat
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7 });
    if (hatType === 'bandana') {
      const bandanaGeo = new THREE.SphereGeometry(0.105, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const bandana = new THREE.Mesh(bandanaGeo, hatMat);
      bandana.position.y = 0.9;
      person.add(bandana);
    } else if (hatType === 'tricorn') {
      // Brim
      const brimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 3);
      const brim = new THREE.Mesh(brimGeo, hatMat);
      brim.position.y = 0.96;
      brim.rotation.y = Math.PI / 6;
      person.add(brim);
      // Crown
      const crownGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.1, 6);
      const crown = new THREE.Mesh(crownGeo, hatMat);
      crown.position.y = 1.02;
      person.add(crown);
      if (plumeColor) {
        const plumeMat = new THREE.MeshStandardMaterial({ color: plumeColor, roughness: 0.75 });
        const plumeGeo = new THREE.ConeGeometry(0.03, 0.22, 6);
        const plume = new THREE.Mesh(plumeGeo, plumeMat);
        plume.position.set(0.08, 1.14, 0);
        plume.rotation.z = -0.45;
        person.add(plume);
      }
    } else if (hatType === 'cap') {
      const capGeo = new THREE.SphereGeometry(0.11, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.45);
      const cap = new THREE.Mesh(capGeo, hatMat);
      cap.position.y = 0.91;
      person.add(cap);
      // Visor
      const visorGeo = new THREE.BoxGeometry(0.1, 0.015, 0.08);
      const visor = new THREE.Mesh(visorGeo, hatMat);
      visor.position.set(0, 0.92, 0.1);
      person.add(visor);
    } else if (hatType === 'noble') {
      const brimMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7 });
      const brimGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.02, 20);
      const brim = new THREE.Mesh(brimGeo, brimMat);
      brim.position.y = 0.98;
      person.add(brim);

      const crownGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.18, 12);
      const crown = new THREE.Mesh(crownGeo, brimMat);
      crown.position.y = 1.08;
      person.add(crown);

      const bandMat = new THREE.MeshStandardMaterial({ color: 0xb99133, roughness: 0.55 });
      const bandGeo = new THREE.TorusGeometry(0.115, 0.012, 4, 14);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 1.03;
      band.rotation.x = Math.PI / 2;
      person.add(band);

      if (plumeColor) {
        const plumeMat = new THREE.MeshStandardMaterial({ color: plumeColor, roughness: 0.72 });
        const plumeStemGeo = new THREE.CylinderGeometry(0.01, 0.012, 0.22, 5);
        const plumeStem = new THREE.Mesh(plumeStemGeo, plumeMat);
        plumeStem.position.set(0.1, 1.17, 0.01);
        plumeStem.rotation.z = -0.5;
        person.add(plumeStem);

        const plumeTipGeo = new THREE.ConeGeometry(0.035, 0.18, 6);
        const plumeTip = new THREE.Mesh(plumeTipGeo, plumeMat);
        plumeTip.position.set(0.15, 1.25, 0.01);
        plumeTip.rotation.z = -0.78;
        plumeTip.rotation.x = 0.2;
        person.add(plumeTip);
      }
    }

    person.position.set(x, 1.1, z);
    person.rotation.y = rotY;
    return person;
  }

  // True Osmodius at the helm (facing bow = -Z = Math.PI), behind the wheel
  const trueOsmodius = registerEditable('True Osmodius', createSailor(0, 2.3, Math.PI, {
    hatType: 'noble',
    hatColor: 0x17131f,
    plumeColor: 0x8c1c13,
    coatColor: 0x12343b,
    capeColor: 0x8c1c13,
    capeTrimColor: 0xd7b25d,
    vestColor: 0x3a2414,
    sashColor: 0xc89b3c,
    shirtColor: 0xf1e2c4,
    trouserColor: 0x221b2f,
    skinColor: 0xc99661,
    hasBeard: true,
    beardColor: 0x1d1a18,
    beardStyle: 'longCurly',
    armPose: 'helm',
  }));
  boat.add(trueOsmodius);
  // First mate lookout at bow (bandana, weathered)
  boat.add(registerEditable('First Mate', createSailor(0, -4.5, Math.PI, {
    hatType: 'bandana', hatColor: 0xcc3333, vestColor: 0x4a3520,
    shirtColor: 0xd4c8b0, skinColor: 0xc4915a,
  })));
  // Deckhand by the main mast
  boat.add(registerEditable('Deckhand', createSailor(0.5, 0.5, -0.3, {
    hatType: 'bandana', hatColor: 0x2255aa,
    shirtColor: 0xccc4b0, trouserColor: 0x3a3a2e,
  })));
  // Bosun near fore mast (cap, sturdy)
  boat.add(registerEditable('Bosun', createSailor(-0.4, -1.5, 0.5, {
    hatType: 'cap', hatColor: 0x3a3a3a,
    shirtColor: 0xbbb8a8, trouserColor: 0x2a2a20, hasBeard: true, skinColor: 0xc89870,
  })));

  // --- Scale up ---
  boat.scale.set(2.5, 2.5, 2.5);

  // Store references for animation
  boat.userData.flag = flag;
  boat.userData.mainSail = mainSail;
  boat.userData.foreSail = foreSail;
  boat.userData.jib = jib;
  boat.userData.editableObjects = editableObjects;

  // Apply editor state (object positions on the ship)
  function applyEditorState(state) {
    if (!state || typeof state !== 'object') return;
    for (const obj of editableObjects) {
      const pos = state[obj.name];
      if (pos) obj.position.set(pos.x, pos.y, pos.z);
    }
  }

  fetch('./editorState.json')
    .then(r => r.ok ? r.json() : null)
    .then(state => {
      if (state && Object.keys(state).length) {
        applyEditorState(state);
      } else {
        try {
          const raw = localStorage.getItem('oceanGang_editor_v1');
          if (raw) applyEditorState(JSON.parse(raw));
        } catch {}
      }
    })
    .catch(() => {
      try {
        const raw = localStorage.getItem('oceanGang_editor_v1');
        if (raw) applyEditorState(JSON.parse(raw));
      } catch {}
    });

  // Apply designer state (child part positions within objects)
  function applyDesignerState(state) {
    if (!state || typeof state !== 'object') return;
    for (const obj of editableObjects) {
      const objState = state[obj.name];
      if (!objState) continue;
      let idx = 0;
      obj.traverse((child) => {
        if (child === obj) return;
        const key = `_${idx}`;
        idx++;
        if (objState[key]) {
          const p = objState[key];
          child.position.set(p.x, p.y, p.z);
        }
      });
    }
  }

  fetch('./designerState.json')
    .then(r => r.ok ? r.json() : null)
    .then(state => {
      if (state && Object.keys(state).length) {
        applyDesignerState(state);
      } else {
        // Fallback to localStorage
        try {
          const raw = localStorage.getItem('oceanGang_designer_v1');
          if (raw) applyDesignerState(JSON.parse(raw));
        } catch {}
      }
    })
    .catch(() => {
      try {
        const raw = localStorage.getItem('oceanGang_designer_v1');
        if (raw) applyDesignerState(JSON.parse(raw));
      } catch {}
    });

  // Expose apply functions for multiplayer sync
  boat.userData.applyEditorState = applyEditorState;
  boat.userData.applyDesignerState = applyDesignerState;

  scene.add(boat);
  return boat;
}

export function createBoatController() {
  const keys = {};

  // Physics state
  let speed = 0;          // forward speed
  let lateralSpeed = 0;   // sideways speed (drift)
  let yawRate = 0;        // angular velocity (rad/s)
  let visualRoll = 0;     // cosmetic heel angle
  let boostAmount = 0;    // smooth 0-1 ramp for boost visual

  // Dolphin jump state
  let isJumping = false;
  let jumpVelocity = 0;
  let jumpY = 0;
  let isSubmerged = false;
  let submersionY = 0;
  let jumpCooldown = 0;
  let jumpQueued = false;
  const jumpLaunchSpeed = 35;
  const jumpGravityAccel = 30;
  const maxSubmersionDepth = -4;
  const submersionRecoveryRate = 5;

  // Splash particle system
  let splashParticles = null;
  let splashVelocities = null;
  let splashActive = false;
  let splashElapsed = 0;
  const SPLASH_COUNT = 120;
  const SPLASH_LIFE = 1.5;

  // Tuning — arcade boat feel
  const thrust = 80;              // forward force (ramps to full speed in ~2s)
  const reverseThrust = 40;     // backward force
  const forwardDrag = 0.035;    // quadratic drag — terminal speed ~48
  const lateralDrag = 3.0;      // high lateral drag — resists sideways slide
  const angularDrag = 4.0;      // damps rotation when not turning
  const maxTurnRate = 3.0;      // rad/s at full speed
  const minTurnRate = 0.6;      // rad/s at zero speed (so you're not stuck)
  const turnThrust = 12.0;      // angular acceleration
  const rollMax = 0.18;         // max visual heel (radians, ~10 degrees)
  const rollSmooth = 8.0;       // how fast roll catches up
  const baseY = -.5;            // water at waterline stripe level

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      jumpQueued = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function update(boat, delta, time) {
    // Clamp delta to avoid physics explosion on tab-away
    const dt = Math.min(delta, 0.05);

    // --- Boost (shift) ---
    const boosting = keys['shift'];
    const boostTarget = boosting ? 1 : 0;
    boostAmount += (boostTarget - boostAmount) * Math.min(1, (boosting ? 6 : 3) * dt);
    const boostMul = 1 + boostAmount * 1.8; // up to 2.8x thrust
    const dragMul = 1 / (1 + boostAmount * 1.2); // less drag while boosting

    // --- Forward / backward thrust ---
    if (keys['w'] || keys['arrowup']) {
      speed += thrust * boostMul * dt;
    } else if (keys['s'] || keys['arrowdown']) {
      speed -= reverseThrust * dt;
    }

    // --- Quadratic drag on forward speed ---
    speed -= forwardDrag * dragMul * speed * Math.abs(speed) * dt;

    // --- Turning ---
    // Turn rate scales with speed (sqrt curve) with a minimum
    const absSpeed = Math.abs(speed);
    const speedRatio = Math.min(absSpeed / 40, 1);
    const effectiveTurnRate = minTurnRate + (maxTurnRate - minTurnRate) * Math.sqrt(speedRatio);

    if (keys['a'] || keys['arrowleft']) {
      yawRate += turnThrust * dt;
    } else if (keys['d'] || keys['arrowright']) {
      yawRate -= turnThrust * dt;
    }

    // Clamp yaw rate to effective max
    yawRate = Math.max(-effectiveTurnRate, Math.min(effectiveTurnRate, yawRate));

    // Angular drag — damps rotation when not pressing turn keys
    if (!(keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright'])) {
      yawRate -= angularDrag * yawRate * Math.abs(yawRate) * dt;
      // Also add a small linear drag to stop completely
      yawRate *= Math.max(0, 1 - 3.0 * dt);
    }

    // Apply rotation
    boat.rotation.y += yawRate * dt;

    // --- Anisotropic movement ---
    // Decompose: boat has forward speed and lateral drift
    // When turning, some forward momentum becomes lateral (drift)
    lateralSpeed += yawRate * speed * 0.04; // turning generates lateral force
    lateralSpeed -= lateralDrag * lateralSpeed * Math.abs(lateralSpeed) * dt;
    lateralSpeed *= Math.max(0, 1 - 2.0 * dt); // extra linear damping

    // Apply movement in boat's local axes
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(boat.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(boat.quaternion);
    boat.position.addScaledVector(forward, speed * dt);
    boat.position.addScaledVector(right, lateralSpeed * dt);

    // --- Visual heel (lean into turn) ---
    const targetRoll = -yawRate / maxTurnRate * rollMax;
    visualRoll += (targetRoll - visualRoll) * Math.min(1, rollSmooth * dt);

    // --- Dolphin Jump ---
    if (jumpQueued && !isJumping && !isSubmerged && jumpCooldown <= 0) {
      isJumping = true;
      jumpVelocity = jumpLaunchSpeed;
      jumpY = 0;
    }
    jumpQueued = false;

    if (isJumping) {
      jumpVelocity -= jumpGravityAccel * dt;
      jumpY += jumpVelocity * dt;
      if (jumpY <= 0 && jumpVelocity < 0) {
        isJumping = false;
        jumpY = 0;
        isSubmerged = true;
        const impactRatio = Math.min(Math.abs(jumpVelocity) / jumpLaunchSpeed, 1);
        submersionY = maxSubmersionDepth * impactRatio;
        jumpCooldown = 1.2;
        triggerSplash(boat);
      }
    }

    if (isSubmerged) {
      submersionY += submersionRecoveryRate * dt;
      if (submersionY >= 0) {
        submersionY = 0;
        isSubmerged = false;
      }
    }
    if (jumpCooldown > 0) jumpCooldown -= dt;

    // --- Wave bobbing ---
    const waveY = Math.sin(time * 1.5) * 0.4 + Math.sin(time * 2.3) * 0.2;
    const waveFactor = isJumping ? 0 : (isSubmerged ? 0.3 : 1);
    boat.position.y = baseY + waveY * waveFactor + jumpY + submersionY;

    // Combine wave tilt with visual heel + jump pitch
    let jumpPitch = 0;
    if (isJumping) {
      jumpPitch = (jumpVelocity / jumpLaunchSpeed) * 0.45;
    } else if (isSubmerged) {
      jumpPitch = submersionY * 0.08;
    }
    boat.rotation.z = visualRoll + Math.sin(time * 1.8) * 0.03 * waveFactor;
    boat.rotation.x = Math.sin(time * 1.2) * 0.02 * waveFactor + jumpPitch;

    // Update splash particles
    updateSplash(dt);

    // Expose speed for other systems (wind effect etc.)
    boat.userData._windSpeed = speed;

    // --- Sail wind animation ---
    const windStrength = Math.min(Math.abs(speed) / 30, 1.0); // 0 to 1 based on speed
    const windBase = 0.35; // ambient wind billow even when still
    const billow = windBase + windStrength * 0.85;

    function animateSail(mesh, amplitude) {
      const geo = mesh.geometry;
      if (!geo.userData || !geo.userData.basePositions) return;
      const pos = geo.attributes.position;
      const base = geo.userData.basePositions;
      const halfW = geo.parameters.width / 2;
      const halfH = geo.parameters.height / 2;
      const pCols = geo.userData.patchCols || 4;
      const pRows = geo.userData.patchRows || 5;

      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        // Normalized 0-1
        const nx = (bx + halfW) / geo.parameters.width;
        const ny = (by + halfH) / geo.parameters.height;

        // Which patch does this vertex belong to
        const pc = Math.min(Math.floor(nx * pCols), pCols - 1);
        const pr = Math.min(Math.floor(ny * pRows), pRows - 1);
        // Unique phase offset per patch (deterministic from grid position)
        const patchPhase = (pc * 7.3 + pr * 13.1) % (Math.PI * 2);
        const patchFreq = 0.8 + ((pc * 3 + pr * 5) % 7) * 0.15;

        // Overall billow shape
        const curve = Math.sin(nx * Math.PI) * Math.sin(ny * Math.PI);

        // Per-patch independent flutter — each patch has its own timing
        const patchFlutter = Math.sin(time * (2.5 + patchFreq) + patchPhase) * 0.12 * nx;
        // Fast edge flutter (loose fabric flapping)
        const edgeFlap = Math.sin(time * (7 + patchFreq * 2) + patchPhase + ny * 5) * 0.05 * nx * billow;
        // Traveling wave ripple across the sail
        const ripple = Math.sin(ny * 5 + nx * 3 + time * 3.5) * 0.06 * nx;

        const z = curve * amplitude * billow + patchFlutter * billow + edgeFlap + ripple;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    if (boat.userData.mainSail) animateSail(boat.userData.mainSail, 1.2);
    if (boat.userData.foreSail) animateSail(boat.userData.foreSail, 0.8);
    if (boat.userData.jib) animateSail(boat.userData.jib, 0.7);

    // --- Flag flutter ---
    if (boat.userData.flag) {
      boat.userData.flag.rotation.y = -Math.PI / 2 + Math.sin(time * 4) * 0.2 * billow;
      boat.userData.flag.position.x = Math.sin(time * 5) * 0.08 * billow;
    }

    return { forward: speed, turn: yawRate };
  }

  function triggerSplash(boat) {
    const scene = boat.parent;
    if (!splashParticles) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(SPLASH_COUNT * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xccddff,
        size: 2.5,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      splashParticles = new THREE.Points(geo, mat);
      splashParticles.renderOrder = 10;
      splashParticles.frustumCulled = false;
      splashVelocities = new Float32Array(SPLASH_COUNT * 3);
      scene.add(splashParticles);
    }

    // Boat's forward direction for carrying splash momentum
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(boat.quaternion);
    const carryX = fwd.x * speed * 0.6;
    const carryZ = fwd.z * speed * 0.6;

    const pos = splashParticles.geometry.attributes.position.array;
    const bx = boat.position.x, bz = boat.position.z;

    for (let i = 0; i < SPLASH_COUNT; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 8;
      pos[i3] = bx + Math.cos(angle) * radius;
      pos[i3 + 1] = 0; // water surface
      pos[i3 + 2] = bz + Math.sin(angle) * radius;

      const spd = 5 + Math.random() * 18;
      splashVelocities[i3] = Math.cos(angle) * spd * 0.7 + carryX;
      splashVelocities[i3 + 1] = 8 + Math.random() * 20;
      splashVelocities[i3 + 2] = Math.sin(angle) * spd * 0.7 + carryZ;
    }

    splashParticles.geometry.attributes.position.needsUpdate = true;
    splashParticles.visible = true;
    splashActive = true;
    splashElapsed = 0;
  }

  function updateSplash(dt) {
    if (!splashActive || !splashParticles) return;

    splashElapsed += dt;
    if (splashElapsed > SPLASH_LIFE) {
      splashActive = false;
      splashParticles.visible = false;
      return;
    }

    const progress = splashElapsed / SPLASH_LIFE;
    const pos = splashParticles.geometry.attributes.position.array;

    for (let i = 0; i < SPLASH_COUNT; i++) {
      const i3 = i * 3;
      pos[i3] += splashVelocities[i3] * dt;
      pos[i3 + 1] += splashVelocities[i3 + 1] * dt;
      pos[i3 + 2] += splashVelocities[i3 + 2] * dt;

      splashVelocities[i3 + 1] -= 25 * dt;

      if (pos[i3 + 1] < 0) {
        pos[i3 + 1] = 0;
        splashVelocities[i3 + 1] = 0;
        splashVelocities[i3] *= 0.9;
        splashVelocities[i3 + 2] *= 0.9;
      }
    }

    splashParticles.geometry.attributes.position.needsUpdate = true;
    splashParticles.material.opacity = 0.9 * (1 - progress * progress);
  }

  function stop() {
    speed = 0;
    lateralSpeed = 0;
  }

  return {
    update, stop, keys,
    get velocity() { return { forward: speed, turn: yawRate }; },
    get boostAmount() { return boostAmount; },
    get isJumping() { return isJumping; },
    get splashActive() { return splashActive; },
  };
}
