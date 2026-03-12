import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createOcean } from './ocean.js';
import { createBoat, createBoatController } from './boat.js';
import { createCrateManager } from './crates.js';
import { createIslands } from './islands.js';
import { createWindEffect } from './windEffect.js';
import { createWakeSystem } from './wake.js';
import { initMusicPanel, MUSIC_SCENE_SYNC_EVENT, SCENES } from './music.js';
import { createShipAudio } from './shipAudio.js';
import { initSkySettings } from './skySettings.js';
import { createTradingSystem } from './trading.js';
import { createPerfTracker } from './perfTracker.js';
import { createTitleScreen } from './titleScreen.js';
import { createInstrumentRegistry } from './instruments.js';
import { createCompass } from './compass.js';
import { createCreatures } from './creatures.js';
import { createTouchControls } from './touchControls.js';

let camera, scene, renderer;
let water, boat, boatController, crateManager, windEffect, wakeSystem;
let shipAudio, ocean, tradingSystem, perfTracker, instrumentRegistry, compass, creatures;
let compassCamera, compassRenderer;
let islandGroups = [], islandPositions = [];
let wasJumping = false;
let wasSplashing = false;
let shipEditor = null;
const ISLAND_VISIBLE_DIST = 3000;
const ISLAND_HIDE_DIST = 3200;

const clock = new THREE.Clock();

// Camera follow settings
let zoomLevel = 1.0;
const zoomMin = 0.3;
const zoomMax = 3.0;
const baseCameraDistance = 65;
let cameraYaw = 0;       // horizontal orbit angle (radians)
let cameraPitch = 0.55;   // vertical angle (radians) — 0 = level, PI/2 = top-down
const pitchMin = 0.1;
const pitchMax = 1.4;
let isMouseDragging = false;
let cameraFollowHeading = true; // true = chase cam, false = free orbit

// Floating camera mode toast
const cameraToast = document.createElement('div');
Object.assign(cameraToast.style, {
  position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
  padding: '8px 20px', borderRadius: '16px',
  background: 'rgba(0,0,0,0.55)', color: '#fff', fontFamily: 'sans-serif',
  fontSize: '14px', pointerEvents: 'none', opacity: '0',
  transition: 'opacity 0.3s ease', zIndex: '100', whiteSpace: 'nowrap',
});
document.body.appendChild(cameraToast);
let toastTimeout;
function showCameraToast(text) {
  cameraToast.textContent = text;
  cameraToast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { cameraToast.style.opacity = '0'; }, 1500);
}

init();

function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.00003);

  // Camera
  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    1,
    20000
  );
  camera.position.set(0, 15, 35);
  scene.add(camera);

  compassCamera = new THREE.PerspectiveCamera(36, 1, 1, 1200);
  compassCamera.up.set(0, 0, -1);
  scene.add(compassCamera);

  // Wind boost effect (3D streaks in world space)
  windEffect = createWindEffect(scene);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x6688aa, 0.8);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x886633, 0.6);
  scene.add(hemiLight);

  const directionalLight = new THREE.DirectionalLight(0xfff4e5, 2.0);
  directionalLight.position.set(1, 3, 1);
  scene.add(directionalLight);

  // Ocean + Sky
  ocean = createOcean(scene, renderer);
  water = ocean.water;
  scene.environmentIntensity = 0.4;

  // Boat
  boat = createBoat(scene);
  boatController = createBoatController();
  createTouchControls(boatController.keys);
  shipEditor = initShipEditor();

  // Islands
  const islandsResult = createIslands(scene);
  islandGroups = islandsResult.groups;
  islandPositions = islandsResult.islandData;

  // Wake / spray
  wakeSystem = createWakeSystem(scene);
  wakeSystem.attachToBoat(boat);

  // Crates
  crateManager = createCrateManager(scene);
  crateManager.init(boat.position);

  // Underwater creatures
  creatures = createCreatures(scene);
  creatures.init(boat.position);

  // Zoom (scroll wheel)
  window.addEventListener('wheel', (e) => {
    zoomLevel += e.deltaY * 0.001;
    zoomLevel = Math.max(zoomMin, Math.min(zoomMax, zoomLevel));
  });

  // Mouse drag to orbit camera
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 || e.button === 2) isMouseDragging = true;
  });
  window.addEventListener('mouseup', () => {
    isMouseDragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isMouseDragging) return;
    if (shipEditor?.editorActive && !shipEditor.isDragging) {
      shipEditor.handleMouseMove(e.movementX, e.movementY);
    } else if (!shipEditor?.editorActive) {
      cameraYaw -= e.movementX * 0.005;
      cameraPitch = Math.max(pitchMin, Math.min(pitchMax, cameraPitch - e.movementY * 0.005));
    }
  });
  // Prevent context menu on right-click so right-drag works
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // Toggle camera mode with C
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat) {
      cameraFollowHeading = !cameraFollowHeading;
      showCameraToast(cameraFollowHeading ? 'Chase Cam' : 'Free Orbit');
    }
  });

  // Resize
  window.addEventListener('resize', onWindowResize);

  // Ship water audio (Web Audio synthesis tied to boat speed)
  shipAudio = createShipAudio();
  instrumentRegistry = createInstrumentRegistry(SCENES);
  document.addEventListener(MUSIC_SCENE_SYNC_EVENT, (event) => {
    const { sceneName, code } = event.detail || {};
    if (sceneName && typeof code === 'string') {
      instrumentRegistry.setSceneCode(sceneName, code);
    }
  });

  // Music panel (Strudel) — needs shipAudio for SFX volume slider
  initMusicPanel(shipAudio, instrumentRegistry);

  // Trading system (island barriers + trading menu)
  tradingSystem = createTradingSystem(scene, islandsResult.islandData, crateManager, instrumentRegistry);

  // Sky/ocean settings popup (G key)
  initSkySettings(ocean, renderer);

  // Performance tracker (P key)
  perfTracker = createPerfTracker(renderer);

  // Compass + speed gauge
  compass = createCompass();
  initCompassCameraInset();

  // Title screen
  createTitleScreen();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (compassRenderer && compass?.insetSize) {
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassRenderer.setSize(compass.insetSize, compass.insetSize);
  }
}

function animate() {
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  perfTracker.begin();

  // Update boat (skip in editor mode — WASD controls camera instead)
  perfTracker.markStart('boat');
  if (!shipEditor?.editorActive) {
    boatController.update(boat, delta, time);
  }
  perfTracker.markEnd('boat');

  // Update water time
  water.material.uniforms['time'].value += delta;

  // Update crates
  perfTracker.markStart('crates');
  const crateCollected = crateManager.update(boat.position, time);
  perfTracker.markEnd('crates');
  if (crateCollected) perfTracker.logEvent('crate_collected', { score: crateManager.getScore() });

  // Underwater creatures
  perfTracker.markStart('creatures');
  creatures.update(boat.position, time, delta);
  perfTracker.markEnd('creatures');

  // Wake / spray
  perfTracker.markStart('wake');
  wakeSystem.update(delta, time, boat, boatController);
  perfTracker.markEnd('wake');

  // Wind boost visual
  perfTracker.markStart('wind');
  windEffect.update(time, boatController.boostAmount, boat, camera);
  perfTracker.markEnd('wind');

  // Distance-cull islands to cap draw calls
  const bx = boat.position.x, bz = boat.position.z;
  for (let i = 0; i < islandGroups.length; i++) {
    const ip = islandPositions[i];
    const dx = bx - ip.x, dz = bz - ip.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Hysteresis: show at VISIBLE_DIST, hide at HIDE_DIST
    if (islandGroups[i].visible) {
      if (dist > ISLAND_HIDE_DIST) islandGroups[i].visible = false;
    } else {
      if (dist < ISLAND_VISIBLE_DIST) islandGroups[i].visible = true;
    }
  }

  // Island barriers + trading
  perfTracker.markStart('trading');
  tradingSystem.update(boat, delta, boatController, time);
  perfTracker.markEnd('trading');

  // Ship water audio
  shipAudio.update(boatController.velocity.forward, boatController.boostAmount);
  if (boatController.isJumping && !wasJumping) {
    shipAudio.playJump();
  }
  if (boatController.splashActive && !wasSplashing) {
    const speedImpact = Math.min(Math.abs(boatController.velocity.forward) / 45, 1);
    shipAudio.playSplash(0.8 + speedImpact * 0.4);
  }
  wasJumping = boatController.isJumping;
  wasSplashing = boatController.splashActive;

  // Compass + speed gauge
  compass.update(boat, boatController);

  // Camera follow / free camera in editor mode
  perfTracker.markStart('camera');
  if (shipEditor?.editorActive) {
    shipEditor.updateFreeCamera(delta, boatController.keys);
  } else if (!shipEditor?.isDragging) {
    updateCamera(delta);
  }
  perfTracker.markEnd('camera');

  if (shipEditor?.helper && shipEditor.selectedObject) {
    shipEditor.helper.update();
  }
  if (shipEditor?.renderDesigner) shipEditor.renderDesigner();

  // Set perf context (before render so it captures current frame state)
  let visibleIslandCount = 0;
  for (let i = 0; i < islandGroups.length; i++) {
    if (islandGroups[i].visible) visibleIslandCount++;
  }
  perfTracker.setContext({
    speed: boatController.velocity.forward,
    boost: boatController.boostAmount,
    position: [boat.position.x, boat.position.z],
    heading: boat.rotation.y,
    jumping: boatController.isJumping,
    splashActive: boatController.splashActive,
    visibleIslands: visibleIslandCount,
    cameraMode: cameraFollowHeading ? 'chase' : 'orbit',
    zoom: zoomLevel,
    tradingMenu: tradingSystem.isMenuOpen,
    mouseDragging: isMouseDragging,
    crateScore: crateManager.getScore(),
    input: {
      fwd: !!(boatController.keys['w'] || boatController.keys['arrowup']),
      rev: !!(boatController.keys['s'] || boatController.keys['arrowdown']),
      left: !!(boatController.keys['a'] || boatController.keys['arrowleft']),
      right: !!(boatController.keys['d'] || boatController.keys['arrowright']),
      boost: !!boatController.keys['shift'],
      jump: !!boatController.keys[' '],
    },
  });

  // Render
  perfTracker.markStart('render');
  renderer.render(scene, camera);
  renderCompassCamera();
  perfTracker.markEnd('render');

  perfTracker.end(delta);
}

function updateCamera(delta) {
  // Spherical offset relative to boat heading
  const dist = baseCameraDistance * zoomLevel;
  const angle = cameraFollowHeading ? cameraYaw + boat.rotation.y : cameraYaw;
  const offset = new THREE.Vector3(
    dist * Math.sin(angle) * Math.cos(cameraPitch),
    dist * Math.sin(cameraPitch),
    dist * Math.cos(angle) * Math.cos(cameraPitch)
  );

  const desiredPosition = boat.position.clone().add(offset);

  // Smooth follow
  camera.position.lerp(desiredPosition, 1 - Math.exp(-5 * delta));

  // Look at boat
  camera.lookAt(boat.position);
}

function initCompassCameraInset() {
  if (!compass?.insetElement || !compass?.insetSize) return;
  compassRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  compassRenderer.setPixelRatio(window.devicePixelRatio);
  compassRenderer.setSize(compass.insetSize, compass.insetSize);
  compassRenderer.toneMapping = renderer.toneMapping;
  compassRenderer.toneMappingExposure = renderer.toneMappingExposure;
  Object.assign(compassRenderer.domElement.style, {
    width: '100%',
    height: '100%',
    display: 'block',
  });
  compass.insetElement.appendChild(compassRenderer.domElement);
}

function renderCompassCamera() {
  if (!compassRenderer || !compassCamera || !boat) return;

  compassCamera.aspect = 1;
  compassCamera.position.set(
    boat.position.x,
    boat.position.y + 92,
    boat.position.z + 30
  );
  compassCamera.lookAt(
    boat.position.x,
    boat.position.y + 8,
    boat.position.z
  );
  compassCamera.updateProjectionMatrix();

  compassRenderer.render(scene, compassCamera);
}

function initShipEditor() {
  const editableObjects = boat?.userData?.editableObjects || [];
  if (!editableObjects.length) return null;

  let editorActive = false;

  // ── Render thumbnails for each object ──
  const thumbSize = 96;
  const thumbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  thumbRenderer.setSize(thumbSize, thumbSize);
  thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  thumbRenderer.toneMappingExposure = 0.8;

  const thumbScene = new THREE.Scene();
  thumbScene.add(new THREE.AmbientLight(0x8899bb, 0.8));
  const thumbDirLight = new THREE.DirectionalLight(0xfff4e5, 2.5);
  thumbDirLight.position.set(2, 4, 3);
  thumbScene.add(thumbDirLight);

  const thumbCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  function renderThumbnail(object) {
    // Clone or directly add to thumb scene temporarily
    const clone = object.clone(true);
    // Reset position for rendering
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0.4, 0);
    thumbScene.add(clone);

    // Fit camera to object bounds
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 1.8;

    thumbCamera.position.set(center.x + dist * 0.5, center.y + dist * 0.3, center.z + dist);
    thumbCamera.lookAt(center);

    thumbRenderer.render(thumbScene, thumbCamera);
    const dataUrl = thumbRenderer.domElement.toDataURL();
    thumbScene.remove(clone);
    return dataUrl;
  }

  const thumbnails = editableObjects.map((obj) => renderThumbnail(obj));
  thumbRenderer.dispose();

  // ── Panel ──
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    top: '20px',
    left: '20px',
    width: '320px',
    maxHeight: 'calc(100vh - 40px)',
    padding: '14px',
    borderRadius: '12px',
    background: 'rgba(10, 18, 24, 0.88)',
    color: '#f5ead7',
    fontFamily: 'Georgia, serif',
    zIndex: '250',
    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(10px)',
    pointerEvents: 'auto',
    display: 'none',
    overflowY: 'auto',
  });

  const title = document.createElement('div');
  title.textContent = 'Ship Editor';
  Object.assign(title.style, {
    fontSize: '18px',
    letterSpacing: '0.06em',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const titleHint = document.createElement('span');
  titleHint.textContent = 'WASD fly · E close';
  Object.assign(titleHint.style, { fontSize: '11px', color: 'rgba(245,234,215,0.4)', fontWeight: 'normal' });
  title.appendChild(titleHint);
  panel.appendChild(title);

  // ── Object button grid ──
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
    gap: '8px',
    marginBottom: '12px',
  });
  panel.appendChild(grid);

  const buttons = [];
  editableObjects.forEach((obj, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    Object.assign(btn.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 4px',
      borderRadius: '8px',
      border: '2px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.04)',
      color: '#f5ead7',
      cursor: 'pointer',
      transition: 'border-color 0.15s, background 0.15s',
    });

    const img = document.createElement('img');
    img.src = thumbnails[index];
    Object.assign(img.style, {
      width: '64px',
      height: '64px',
      objectFit: 'contain',
      borderRadius: '4px',
      pointerEvents: 'none',
    });
    btn.appendChild(img);

    const label = document.createElement('span');
    label.textContent = obj.name || `Object ${index + 1}`;
    Object.assign(label.style, {
      fontSize: '10px',
      lineHeight: '1.2',
      textAlign: 'center',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '80px',
    });
    btn.appendChild(label);

    btn.addEventListener('click', () => selectObject(obj));
    btn.addEventListener('dblclick', () => { focusCameraOn(obj); lockObject(obj); });
    grid.appendChild(btn);
    buttons.push({ btn, obj });
  });

  // ── Settings section (hidden until selection) ──
  const settingsDiv = document.createElement('div');
  settingsDiv.style.display = 'none';
  panel.appendChild(settingsDiv);

  const settingsTitle = document.createElement('div');
  Object.assign(settingsTitle.style, {
    fontSize: '14px',
    marginBottom: '8px',
    color: 'rgba(245,234,215,0.8)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: '10px',
  });
  settingsDiv.appendChild(settingsTitle);

  const coords = document.createElement('div');
  Object.assign(coords.style, {
    display: 'grid',
    gridTemplateColumns: '20px 1fr',
    gap: '6px 10px',
    alignItems: 'center',
  });
  settingsDiv.appendChild(coords);

  const fields = {};
  ['x', 'y', 'z'].forEach((axis) => {
    const label = document.createElement('label');
    label.textContent = axis.toUpperCase();
    Object.assign(label.style, { fontSize: '13px' });
    coords.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    Object.assign(input.style, {
      width: '100%',
      padding: '6px 8px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(255,255,255,0.06)',
      color: '#f5ead7',
      fontSize: '13px',
    });
    fields[axis] = input;
    coords.appendChild(input);
  });

  // ── Tabs: Parts / Designer ──
  const tabBar = document.createElement('div');
  Object.assign(tabBar.style, {
    display: 'flex', gap: '0', marginBottom: '10px',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
  });
  const tabBtnStyle = (active) => ({
    flex: '1', padding: '7px 0', textAlign: 'center', cursor: 'pointer',
    fontSize: '12px', letterSpacing: '0.05em',
    background: 'none', border: 'none', color: active ? '#f5c542' : 'rgba(245,234,215,0.5)',
    borderBottom: active ? '2px solid #f5c542' : '2px solid transparent',
  });
  const partsTab = document.createElement('button');
  partsTab.textContent = 'Parts';
  Object.assign(partsTab.style, tabBtnStyle(true));
  const designerTab = document.createElement('button');
  designerTab.textContent = 'Designer';
  Object.assign(designerTab.style, tabBtnStyle(false));
  tabBar.appendChild(partsTab);
  tabBar.appendChild(designerTab);
  panel.insertBefore(tabBar, grid);

  const designerDiv = document.createElement('div');
  designerDiv.style.display = 'none';
  panel.appendChild(designerDiv);

  let activeTab = 'parts';
  function switchTab(tab) {
    activeTab = tab;
    Object.assign(partsTab.style, tabBtnStyle(tab === 'parts'));
    Object.assign(designerTab.style, tabBtnStyle(tab === 'designer'));
    grid.style.display = tab === 'parts' ? '' : 'none';
    settingsDiv.style.display = tab === 'parts' && editor.selectedObject ? '' : 'none';
    designerDiv.style.display = tab === 'designer' ? '' : 'none';
    if (tab === 'designer') openDesigner();
  }
  partsTab.addEventListener('click', () => switchTab('parts'));
  designerTab.addEventListener('click', () => switchTab('designer'));

  // ── Designer: isolated 3D preview + child part editing ──
  const DESIGNER_STORAGE_KEY = 'oceanGang_designer_v1';

  function loadDesignerState() {
    try {
      const raw = localStorage.getItem(DESIGNER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveDesignerState(state) {
    try { localStorage.setItem(DESIGNER_STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // Apply persisted child positions on startup
  function applyPersistedPositions() {
    const state = loadDesignerState();
    for (const obj of editableObjects) {
      const objState = state[obj.name];
      if (!objState) continue;
      obj.traverse((child) => {
        if (child === obj) return;
        const key = child.name || child.uuid;
        if (objState[key]) {
          const p = objState[key];
          child.position.set(p.x, p.y, p.z);
        }
      });
    }
  }
  applyPersistedPositions();

  // Designer viewport
  const designerCanvas = document.createElement('canvas');
  Object.assign(designerCanvas.style, {
    width: '100%', height: '200px', borderRadius: '8px',
    background: 'rgba(0,0,0,0.4)', marginBottom: '8px', cursor: 'grab',
  });
  designerDiv.appendChild(designerCanvas);

  const dRenderer = new THREE.WebGLRenderer({ canvas: designerCanvas, alpha: true, antialias: true });
  dRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  dRenderer.toneMappingExposure = 0.9;
  const dScene = new THREE.Scene();
  dScene.add(new THREE.AmbientLight(0x8899bb, 1.0));
  const dDirLight = new THREE.DirectionalLight(0xfff4e5, 2.5);
  dDirLight.position.set(2, 4, 3);
  dScene.add(dDirLight);
  const dHemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x886633, 0.6);
  dScene.add(dHemiLight);
  const dCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  let dClone = null;
  let dSourceObj = null;
  let dChildMap = new Map(); // clone child -> source child
  let dSelectedChild = null;
  let dOrbitYaw = 0.4, dOrbitPitch = 0.3, dOrbitDist = 10;
  let dOrbitCenter = new THREE.Vector3();

  // Designer child list
  const dChildList = document.createElement('div');
  Object.assign(dChildList.style, {
    maxHeight: '180px', overflowY: 'auto', marginBottom: '8px',
  });
  designerDiv.appendChild(dChildList);

  // Designer child position fields
  const dFieldsDiv = document.createElement('div');
  dFieldsDiv.style.display = 'none';
  designerDiv.appendChild(dFieldsDiv);

  const dFieldsTitle = document.createElement('div');
  Object.assign(dFieldsTitle.style, { fontSize: '12px', marginBottom: '6px', color: 'rgba(245,234,215,0.7)' });
  dFieldsDiv.appendChild(dFieldsTitle);

  const dCoords = document.createElement('div');
  Object.assign(dCoords.style, {
    display: 'grid', gridTemplateColumns: '20px 1fr', gap: '4px 8px', alignItems: 'center',
  });
  dFieldsDiv.appendChild(dCoords);

  const dFields = {};
  ['x', 'y', 'z'].forEach((axis) => {
    const label = document.createElement('label');
    label.textContent = axis.toUpperCase();
    Object.assign(label.style, { fontSize: '12px' });
    dCoords.appendChild(label);
    const input = document.createElement('input');
    input.type = 'number'; input.step = '0.05';
    Object.assign(input.style, {
      width: '100%', padding: '4px 6px', borderRadius: '5px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(255,255,255,0.06)', color: '#f5ead7', fontSize: '12px',
    });
    input.addEventListener('input', () => {
      if (!dSelectedChild) return;
      const val = Number.parseFloat(input.value);
      if (!Number.isFinite(val)) return;
      // Update clone child
      dSelectedChild.position[axis] = val;
      // Update source child
      const srcChild = dChildMap.get(dSelectedChild);
      if (srcChild) srcChild.position[axis] = val;
      persistDesignerChild();
    });
    dFields[axis] = input;
    dCoords.appendChild(input);
  });

  function persistDesignerChild() {
    if (!dSourceObj || !dSelectedChild) return;
    const srcChild = dChildMap.get(dSelectedChild);
    if (!srcChild) return;
    const state = loadDesignerState();
    if (!state[dSourceObj.name]) state[dSourceObj.name] = {};
    const key = srcChild.name || srcChild.uuid;
    state[dSourceObj.name][key] = {
      x: srcChild.position.x, y: srcChild.position.y, z: srcChild.position.z,
    };
    saveDesignerState(state);
  }

  function syncDFields() {
    if (!dSelectedChild) return;
    dFields.x.value = dSelectedChild.position.x.toFixed(3);
    dFields.y.value = dSelectedChild.position.y.toFixed(3);
    dFields.z.value = dSelectedChild.position.z.toFixed(3);
  }

  // Highlight selected child in preview
  const dBoxHelper = new THREE.BoxHelper(new THREE.Mesh(), 0x42c5f5);
  dBoxHelper.visible = false;
  dScene.add(dBoxHelper);

  function selectDesignerChild(cloneChild) {
    dSelectedChild = cloneChild;
    if (cloneChild) {
      dBoxHelper.setFromObject(cloneChild);
      dBoxHelper.visible = true;
      dFieldsDiv.style.display = '';
      dFieldsTitle.textContent = cloneChild.name || 'Part';
      syncDFields();
    } else {
      dBoxHelper.visible = false;
      dFieldsDiv.style.display = 'none';
    }
    // Highlight in list
    for (const row of dChildList.children) {
      const isActive = row._cloneChild === cloneChild;
      row.style.background = isActive ? 'rgba(66,197,245,0.15)' : 'transparent';
      row.style.borderColor = isActive ? 'rgba(66,197,245,0.4)' : 'rgba(255,255,255,0.06)';
    }
  }

  function openDesigner() {
    const obj = editor.selectedObject;
    if (!obj) {
      if (dClone) { dScene.remove(dClone); dClone = null; }
      dChildList.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(245,234,215,0.4)">Select a part first</div>';
      dFieldsDiv.style.display = 'none';
      dBoxHelper.visible = false;
      dSelectedChild = null;
      return;
    }

    // Clean up previous clone
    if (dClone) { dScene.remove(dClone); dClone = null; }
    dChildMap.clear();
    dSelectedChild = null;
    dBoxHelper.visible = false;
    dFieldsDiv.style.display = 'none';

    dSourceObj = obj;
    dClone = obj.clone(true);
    dClone.position.set(0, 0, 0);
    dClone.rotation.set(0, 0, 0);
    dScene.add(dClone);

    // Build clone->source mapping
    const srcChildren = [];
    obj.traverse((child) => { if (child !== obj && child.isMesh) srcChildren.push(child); });
    const cloneChildren = [];
    dClone.traverse((child) => { if (child !== dClone && child.isMesh) cloneChildren.push(child); });
    for (let i = 0; i < cloneChildren.length && i < srcChildren.length; i++) {
      dChildMap.set(cloneChildren[i], srcChildren[i]);
      if (!cloneChildren[i].name) cloneChildren[i].name = srcChildren[i].name || `Part ${i + 1}`;
    }

    // Fit camera
    const box = new THREE.Box3().setFromObject(dClone);
    box.getCenter(dOrbitCenter);
    const size = box.getSize(new THREE.Vector3());
    dOrbitDist = Math.max(size.x, size.y, size.z) * 2;

    // Build child list
    dChildList.innerHTML = '';
    if (cloneChildren.length <= 1) {
      const msg = document.createElement('div');
      Object.assign(msg.style, { padding: '8px', fontSize: '11px', color: 'rgba(245,234,215,0.4)', textAlign: 'center' });
      msg.textContent = 'Single mesh — no sub-parts to edit';
      dChildList.appendChild(msg);
    } else {
      for (const cc of cloneChildren) {
        const row = document.createElement('div');
        row._cloneChild = cc;
        Object.assign(row.style, {
          padding: '5px 8px', fontSize: '11px', cursor: 'pointer',
          borderRadius: '5px', marginBottom: '2px',
          border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.1s',
        });
        row.textContent = cc.name || 'Part';
        row.addEventListener('click', () => selectDesignerChild(cc));
        dChildList.appendChild(row);
      }
    }

    renderDesigner();
  }

  // Designer orbit controls
  let dDragging = false;
  designerCanvas.addEventListener('mousedown', (e) => {
    dDragging = true;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dDragging) return;
    dOrbitYaw -= e.movementX * 0.008;
    dOrbitPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1,
      dOrbitPitch - e.movementY * 0.008));
  });
  window.addEventListener('mouseup', () => { dDragging = false; });
  designerCanvas.addEventListener('wheel', (e) => {
    dOrbitDist = Math.max(1, dOrbitDist + e.deltaY * 0.01);
    e.preventDefault();
  }, { passive: false });

  // Click to select child in viewport
  const dRaycaster = new THREE.Raycaster();
  const dPointer = new THREE.Vector2();
  designerCanvas.addEventListener('click', (e) => {
    if (!dClone) return;
    const rect = designerCanvas.getBoundingClientRect();
    dPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    dPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    dRaycaster.setFromCamera(dPointer, dCamera);
    const cloneChildren = [];
    dClone.traverse((c) => { if (c !== dClone && c.isMesh) cloneChildren.push(c); });
    const hits = dRaycaster.intersectObjects(cloneChildren, false);
    if (hits.length) {
      selectDesignerChild(hits[0].object);
    } else {
      selectDesignerChild(null);
    }
  });

  // Block events from propagating
  designerCanvas.addEventListener('keydown', (e) => e.stopPropagation());
  designerDiv.addEventListener('keydown', (e) => e.stopPropagation());
  designerDiv.addEventListener('keyup', (e) => e.stopPropagation());

  function renderDesigner() {
    if (activeTab !== 'designer' || !dClone) return;
    const rect = designerCanvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w < 1 || h < 1) return;
    dRenderer.setSize(w, h, false);
    dCamera.aspect = w / h;
    dCamera.updateProjectionMatrix();
    dCamera.position.set(
      dOrbitCenter.x + Math.sin(dOrbitYaw) * Math.cos(dOrbitPitch) * dOrbitDist,
      dOrbitCenter.y + Math.sin(dOrbitPitch) * dOrbitDist,
      dOrbitCenter.z + Math.cos(dOrbitYaw) * Math.cos(dOrbitPitch) * dOrbitDist,
    );
    dCamera.lookAt(dOrbitCenter);
    if (dSelectedChild && dBoxHelper.visible) dBoxHelper.setFromObject(dSelectedChild);
    dRenderer.render(dScene, dCamera);
  }

  document.body.appendChild(panel);

  // ── Gizmo + helper ──
  const transform = new TransformControls(camera, renderer.domElement);
  transform.setMode('translate');
  transform.setSpace('local');
  transform.enabled = false;
  const transformHelper = transform.getHelper();
  transformHelper.visible = false;
  scene.add(transformHelper);

  const helper = new THREE.BoxHelper(editableObjects[0], 0xf5c542);
  helper.visible = false;
  scene.add(helper);

  // ── Free camera state for editor mode ──
  const freeCam = {
    yaw: 0,
    pitch: 0,
    speed: 80,
    fastSpeed: 240,
  };

  const editor = {
    panel,
    transform,
    helper,
    selectedObject: null,
    isDragging: false,
    editorActive: false,
    renderDesigner,
  };

  // ── Selection logic ──
  function syncFields() {
    if (!editor.selectedObject) return;
    fields.x.value = editor.selectedObject.position.x.toFixed(2);
    fields.y.value = editor.selectedObject.position.y.toFixed(2);
    fields.z.value = editor.selectedObject.position.z.toFixed(2);
  }

  let locked = false; // true = gizmo attached, object can be dragged

  function highlightButtons(object) {
    buttons.forEach(({ btn, obj }) => {
      const active = obj === object;
      btn.style.borderColor = active ? 'rgba(245, 196, 66, 0.7)' : 'rgba(255,255,255,0.08)';
      btn.style.background = active ? 'rgba(245, 196, 66, 0.12)' : 'rgba(255,255,255,0.04)';
    });
  }

  function selectObject(object) {
    // If already locked on this object, unlock
    if (locked && editor.selectedObject === object) {
      unlock();
      return;
    }
    // Select (highlight + box) but don't attach gizmo yet
    unlock();
    editor.selectedObject = object;
    helper.setFromObject(object);
    helper.visible = true;
    settingsDiv.style.display = activeTab === 'parts' ? '' : 'none';
    settingsTitle.textContent = object.name || 'Object';
    syncFields();
    highlightButtons(object);
    if (activeTab === 'designer') openDesigner();
  }

  function focusCameraOn(object) {
    const box = new THREE.Box3().setFromObject(object);
    const worldCenter = new THREE.Vector3();
    box.getCenter(worldCenter);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 3.5;

    // Try multiple camera angles, pick the one with clearest view
    const candidates = [
      new THREE.Vector3(1, 0.5, 1),
      new THREE.Vector3(-1, 0.5, 1),
      new THREE.Vector3(1, 0.5, -1),
      new THREE.Vector3(-1, 0.5, -1),
      new THREE.Vector3(0, 0.8, 1),
      new THREE.Vector3(0, 0.8, -1),
      new THREE.Vector3(1, 0.8, 0),
      new THREE.Vector3(-1, 0.8, 0),
    ];

    const occlusionRay = new THREE.Raycaster();
    const others = editableObjects.filter(o => o !== object);
    let bestPos = null;
    let bestScore = -Infinity;

    for (const dir of candidates) {
      const camPos = worldCenter.clone().addScaledVector(dir.normalize(), dist);
      const toTarget = worldCenter.clone().sub(camPos).normalize();
      occlusionRay.set(camPos, toTarget);
      const hits = occlusionRay.intersectObjects(others, true);
      // Score: prefer no occluders; tie-break by elevation (higher = nicer view)
      const occluded = hits.some(h => h.distance < camPos.distanceTo(worldCenter) - 0.5);
      const score = (occluded ? 0 : 100) + dir.y * 10;
      if (score > bestScore) {
        bestScore = score;
        bestPos = camPos;
      }
    }

    camera.position.copy(bestPos);
    const toObj = worldCenter.clone().sub(camera.position).normalize();
    freeCam.yaw = Math.atan2(toObj.x, toObj.z);
    freeCam.pitch = Math.asin(Math.max(-1, Math.min(1, toObj.y)));
    camera.lookAt(worldCenter);
  }

  function lockObject(object) {
    editor.selectedObject = object;
    locked = true;
    transform.attach(object);
    transformHelper.visible = true;
    transform.enabled = true;
    helper.setFromObject(object);
    helper.visible = true;
    settingsDiv.style.display = '';
    settingsTitle.textContent = (object.name || 'Object') + ' — drag to move';
    syncFields();
    highlightButtons(object);
  }

  function unlock() {
    locked = false;
    transform.detach();
    transformHelper.visible = false;
    transform.enabled = false;
  }

  function deselect() {
    unlock();
    editor.selectedObject = null;
    helper.visible = false;
    settingsDiv.style.display = 'none';
    highlightButtons(null);
    if (activeTab === 'designer') openDesigner();
  }

  // ── Coordinate input handlers ──
  Object.entries(fields).forEach(([axis, input]) => {
    input.addEventListener('input', () => {
      if (!editor.selectedObject) return;
      const value = Number.parseFloat(input.value);
      if (!Number.isFinite(value)) return;
      editor.selectedObject.position[axis] = value;
      helper.update();
    });
  });

  transform.addEventListener('change', () => {
    helper.update();
    syncFields();
  });

  transform.addEventListener('dragging-changed', (event) => {
    editor.isDragging = event.value;
    isMouseDragging = false;
  });

  // ── Raycaster for click/double-click in editor mode ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function raycastEditable(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(editableObjects, true);
    if (!hits.length) return null;
    let hit = hits[0].object;
    while (hit && !editableObjects.includes(hit)) hit = hit.parent;
    return hit;
  }

  // Single click = select (highlight + box helper, no gizmo)
  // If locked, clicking empty space unlocks
  renderer.domElement.addEventListener('click', (e) => {
    if (!editorActive || e.button !== 0) return;
    if (e.target !== renderer.domElement) return;
    // Skip if this was a gizmo drag
    if (editor.isDragging) return;
    const hit = raycastEditable(e);
    if (locked) {
      if (!hit) {
        // Click empty = unlock but keep selection
        unlock();
        if (editor.selectedObject) {
          settingsTitle.textContent = editor.selectedObject.name || 'Object';
        }
      }
      return;
    }
    if (hit) {
      selectObject(hit);
    } else {
      deselect();
    }
  });

  // Double-click = lock (attach gizmo so subsequent drags move the object)
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (!editorActive || e.button !== 0) return;
    if (e.target !== renderer.domElement) return;
    const hit = raycastEditable(e);
    if (hit) {
      focusCameraOn(hit);
      lockObject(hit);
    } else if (locked) {
      // Double-click empty space = unlock
      unlock();
      if (editor.selectedObject) {
        settingsTitle.textContent = editor.selectedObject.name || 'Object';
      }
    }
  });

  // ── Toggle editor with E key ──
  function showEditor() {
    editorActive = true;
    editor.editorActive = true;
    panel.style.display = '';
    // Initialize free camera orientation from current camera
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    freeCam.yaw = Math.atan2(dir.x, dir.z);
    freeCam.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if (locked && editor.selectedObject) {
      transformHelper.visible = true;
      transform.enabled = true;
    }
    if (editor.selectedObject) {
      helper.visible = true;
    }
    showCameraToast('Editor Mode — WASD to fly');
  }

  function hideEditor() {
    editorActive = false;
    editor.editorActive = false;
    panel.style.display = 'none';
    deselect();
    transformHelper.visible = false;
    transform.enabled = false;
    showCameraToast('Editor Off');
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('#music-panel') || e.target.closest('.sky-settings') || e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyE' && !e.repeat) {
      if (editorActive) hideEditor();
      else showEditor();
    }
  });

  // ── Free camera update (called from animate loop) ──
  editor.updateFreeCamera = function (delta, keys) {
    if (!editorActive) return;
    const dt = Math.min(delta, 0.05);
    const moveSpeed = keys['shift'] ? freeCam.fastSpeed : freeCam.speed;

    // Build direction vectors from yaw/pitch
    const forward = new THREE.Vector3(
      Math.sin(freeCam.yaw) * Math.cos(freeCam.pitch),
      Math.sin(freeCam.pitch),
      Math.cos(freeCam.yaw) * Math.cos(freeCam.pitch)
    );
    const right = new THREE.Vector3(
      -Math.cos(freeCam.yaw), 0, Math.sin(freeCam.yaw)
    );
    const up = new THREE.Vector3(0, 1, 0);

    // WASD movement
    if (keys['w'] || keys['arrowup']) camera.position.addScaledVector(forward, moveSpeed * dt);
    if (keys['s'] || keys['arrowdown']) camera.position.addScaledVector(forward, -moveSpeed * dt);
    if (keys['a'] || keys['arrowleft']) camera.position.addScaledVector(right, -moveSpeed * dt);
    if (keys['d'] || keys['arrowright']) camera.position.addScaledVector(right, moveSpeed * dt);
    if (keys[' ']) camera.position.addScaledVector(up, moveSpeed * dt);
    if (keys['control']) camera.position.addScaledVector(up, -moveSpeed * dt);

    // Apply look direction
    const lookTarget = camera.position.clone().add(forward);
    camera.lookAt(lookTarget);
  };

  // ── Mouse look for editor free camera ──
  editor.handleMouseMove = function (movementX, movementY) {
    if (!editorActive) return;
    freeCam.yaw -= movementX * 0.003;
    freeCam.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05,
      freeCam.pitch - movementY * 0.003));
  };

  // Block game input while interacting with panel
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); });
  panel.addEventListener('keyup', (e) => { e.stopPropagation(); });

  return editor;
}
