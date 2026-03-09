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
  const indices = [];
  const normals = [];

  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    for (let si = 0; si <= segmentsPerFrame; si++) {
      const t = si / segmentsPerFrame; // 0 = port top, 0.5 = keel, 1 = starboard top
      let x, y;
      if (t <= 0.5) {
        // Port side: top-left down to keel
        const angle = Math.PI * (1 - t * 2); // PI to 0
        x = -f.hw * Math.sin(angle);
        y = f.dy - f.depth * (1 - Math.cos(angle)) * 0.5 - f.depth * (1 - Math.cos(angle)) * 0.5;
        // Simpler: use cos/sin to sweep from port gunwale to keel
        x = -f.hw * Math.cos(t * Math.PI);
        y = f.dy - f.depth * Math.sin(t * Math.PI);
      } else {
        // Starboard side: keel up to top-right
        const angle = (t - 0.5) * 2; // 0 to 1
        x = f.hw * Math.cos((1 - angle) * Math.PI);
        y = f.dy - f.depth * Math.sin((1 - angle) * Math.PI);
      }
      vertices.push(x, y, f.z);
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

  // --- Materials ---
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3317,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const hullDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a1508,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8a46e,
    roughness: 0.85,
    metalness: 0.0,
  });
  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3015,
    roughness: 0.65,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2b1a,
    roughness: 0.7,
  });
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xfdf5e6,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // --- Hull (single continuous mesh) ---
  const hullGeo = buildHullGeometry();
  const hull = new THREE.Mesh(hullGeo, hullMaterial);
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
  const deck = new THREE.Mesh(deckGeo, deckMaterial);
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
  const sternDeck = new THREE.Mesh(sternDeckGeo, deckMaterial);
  sternDeck.position.set(0, 1.35, 3.2);
  boat.add(sternDeck);

  // Step up to stern deck
  const stepGeo = new THREE.BoxGeometry(2.0, 0.3, 0.15);
  const step = new THREE.Mesh(stepGeo, new THREE.MeshStandardMaterial({ color: 0x8b6b3e, roughness: 0.8 }));
  step.position.set(0, 1.2, 1.65);
  boat.add(step);

  // Cabin
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b3e26,
    roughness: 0.7,
    metalness: 0.05,
  });
  const cabinGeo = new THREE.BoxGeometry(1.8, 1.1, 2.0);
  const cabin = new THREE.Mesh(cabinGeo, cabinMaterial);
  cabin.position.set(0, 1.95, 3.5);
  boat.add(cabin);

  // Cabin roof (slightly wider, angled)
  const roofGeo = new THREE.BoxGeometry(2.0, 0.1, 2.2);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
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
  const mainMast = new THREE.Mesh(mainMastGeo, mastMaterial);
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
  const foreMast = new THREE.Mesh(foreMastGeo, mastMaterial);
  foreMast.position.set(0, 4.6, -3.5);
  boat.add(foreMast);

  // --- Main Sail (subdivided for wind deformation) ---
  const mainSailGeo = new THREE.PlaneGeometry(3.5, 6.5, 10, 14);
  const mainSail = new THREE.Mesh(mainSailGeo, sailMaterial);
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
  mainSailGeo.userData = { basePositions: new Float32Array(msPos.array) };
  boat.add(mainSail);

  // --- Fore Sail (subdivided) ---
  const foreSailGeo = new THREE.PlaneGeometry(2.5, 4.5, 8, 10);
  const foreSail = new THREE.Mesh(foreSailGeo, sailMaterial);
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
  foreSailGeo.userData = { basePositions: new Float32Array(fsPos.array) };
  boat.add(foreSail);

  // --- Jib (triangular, subdivided) ---
  const jibGeo = new THREE.PlaneGeometry(2.2, 5.0, 7, 12);
  const jib = new THREE.Mesh(jibGeo, sailMaterial);
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
  jibGeo.userData = { basePositions: new Float32Array(jPos.array) };
  boat.add(jib);

  // --- Boom ---
  const boomGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 6);
  const boom = new THREE.Mesh(boomGeo, mastMaterial);
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
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0, 10.8, -0.5);
  flag.rotation.y = -Math.PI / 2;
  boat.add(flag);

  // --- Rudder ---
  const rudderGeo = new THREE.BoxGeometry(0.1, 1.4, 0.6);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.8 });
  const rudder = new THREE.Mesh(rudderGeo, rudderMat);
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
      trouserColor = 0x2b3d5e,
      hatType = 'bandana',
      hatColor = 0xaa2222,
      hasBeard = false,
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

    // Belt / sash
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.7 });
    const beltGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 8);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.45;
    person.add(belt);

    // Arms
    for (const side of [-1, 1]) {
      const armGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.32, 5);
      const arm = new THREE.Mesh(armGeo, shirtMat);
      arm.position.set(side * 0.15, 0.55, 0);
      arm.rotation.z = side * 0.15;
      person.add(arm);
      // Hands
      const handGeo = new THREE.SphereGeometry(0.035, 5, 5);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(side * 0.17, 0.38, 0);
      person.add(hand);
    }

    // Head
    const headGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.87;
    person.add(head);

    // Beard
    if (hasBeard) {
      const beardMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
      const beardGeo = new THREE.SphereGeometry(0.07, 6, 4, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.5);
      const beard = new THREE.Mesh(beardGeo, beardMat);
      beard.position.set(0, 0.82, 0.04);
      person.add(beard);
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
    }

    person.position.set(x, 1.1, z);
    person.rotation.y = rotY;
    return person;
  }

  // Captain at the helm (tricorn hat, dark vest, beard)
  boat.add(createSailor(0, 3.8, 0, {
    hatType: 'tricorn', hatColor: 0x1a1a2e, vestColor: 0x2a1a0a,
    shirtColor: 0xe8dcc8, trouserColor: 0x1a1a2e, hasBeard: true,
  }));
  // First mate lookout at bow (bandana, weathered)
  boat.add(createSailor(0, -4.5, Math.PI, {
    hatType: 'bandana', hatColor: 0xcc3333, vestColor: 0x4a3520,
    shirtColor: 0xd4c8b0, skinColor: 0xc4915a,
  }));
  // Deckhand by the main mast
  boat.add(createSailor(0.5, 0.5, -0.3, {
    hatType: 'bandana', hatColor: 0x2255aa,
    shirtColor: 0xccc4b0, trouserColor: 0x3a3a2e,
  }));
  // Bosun near fore mast (cap, sturdy)
  boat.add(createSailor(-0.4, -1.5, 0.5, {
    hatType: 'cap', hatColor: 0x3a3a3a,
    shirtColor: 0xbbb8a8, trouserColor: 0x2a2a20, hasBeard: true, skinColor: 0xc89870,
  }));

  // --- Scale up ---
  boat.scale.set(2.5, 2.5, 2.5);

  // Store references for animation
  boat.userData.flag = flag;
  boat.userData.mainSail = mainSail;
  boat.userData.foreSail = foreSail;
  boat.userData.jib = jib;

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
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function update(boat, delta, time) {
    // Clamp delta to avoid physics explosion on tab-away
    const dt = Math.min(delta, 0.05);

    // --- Forward / backward thrust ---
    if (keys['w'] || keys['arrowup']) {
      speed += thrust * dt;
    } else if (keys['s'] || keys['arrowdown']) {
      speed -= reverseThrust * dt;
    }

    // --- Quadratic drag on forward speed ---
    speed -= forwardDrag * speed * Math.abs(speed) * dt;

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

    // --- Wave bobbing ---
    const waveY = Math.sin(time * 1.5) * 0.4 + Math.sin(time * 2.3) * 0.2;
    boat.position.y = baseY + waveY;

    // Combine wave tilt with visual heel
    boat.rotation.z = visualRoll + Math.sin(time * 1.8) * 0.03;
    boat.rotation.x = Math.sin(time * 1.2) * 0.02;

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

      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        // Normalized position: nx = 0 at mast, 1 at far edge; ny = 0 at bottom, 1 at top
        const nx = (bx + halfW) / geo.parameters.width;
        const ny = (by + halfH) / geo.parameters.height;
        // Billow: pushes outward (z in local sail space), strongest at center
        const curve = Math.sin(nx * Math.PI) * Math.sin(ny * Math.PI);
        // Add ripple waves traveling along the sail
        const ripple = Math.sin(ny * 6 + time * 3) * 0.08 * nx;
        const flutter = Math.sin(ny * 10 + nx * 4 + time * 8) * 0.03 * nx * windStrength;
        pos.setZ(i, (curve * amplitude * billow + ripple + flutter));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
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

  return { update, keys, get velocity() { return { forward: speed, turn: yawRate }; } };
}
