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
import { initMultiplayer, sendLocalState, updateRemotePlayers } from './multiplayer.js';

let camera, scene, renderer;
let water, boat, boatController, crateManager, windEffect, wakeSystem;
let shipAudio, ocean, tradingSystem, perfTracker, instrumentRegistry, compass, creatures, skySettings;
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

  // Zoom (scroll wheel, ctrl = slow)
  window.addEventListener('wheel', (e) => {
    const speed = e.ctrlKey ? 0.0002 : 0.001;
    zoomLevel += e.deltaY * speed;
    zoomLevel = Math.max(zoomMin, Math.min(zoomMax, zoomLevel));
  });

  // Mouse drag to orbit camera (skip when interacting with designer panel)
  window.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('[data-designer-panel]')) return;
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

  // Sky/ocean settings popup
  skySettings = initSkySettings(ocean, renderer);

  // Performance tracker
  perfTracker = createPerfTracker(renderer);

  // Compass + speed gauge
  compass = createCompass();
  initCompassCameraInset();

  // Collapsible menu bar (top-right)
  initMenuBar();

  // Title screen
  createTitleScreen();

  // Multiplayer — connect and sync boats with other players
  initMultiplayer(scene).catch(err => console.warn('Multiplayer init failed:', err));
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
  sendLocalState(boat);
  updateRemotePlayers(time);
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
  title.textContent = 'Editor';
  Object.assign(title.style, {
    fontSize: '18px',
    letterSpacing: '0.06em',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const titleHint = document.createElement('span');
  titleHint.textContent = 'WASD fly · Q/E down/up';
  Object.assign(titleHint.style, { fontSize: '11px', color: 'rgba(245,234,215,0.4)', fontWeight: 'normal' });
  title.appendChild(titleHint);
  panel.appendChild(title);

  // ── Object button grid ──
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px',
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
      width: '100%',
      aspectRatio: '1',
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
      width: '100%',
    });
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      if (editor.selectedObject === obj) { deselect(); return; }
      selectObject(obj);
    });
    btn.addEventListener('dblclick', () => { focusCameraOn(obj); lockObject(obj); });
    grid.appendChild(btn);
    buttons.push({ btn, obj });
  });

  // Designer toggle button
  const designerToggleBtn = document.createElement('button');
  designerToggleBtn.type = 'button';
  designerToggleBtn.textContent = 'Open Designer';
  Object.assign(designerToggleBtn.style, {
    width: '100%', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
    border: '1px solid rgba(245,196,66,0.4)', background: 'rgba(245,196,66,0.1)',
    color: '#f5c542', cursor: 'pointer', transition: 'background 0.15s',
    marginBottom: '8px',
  });
  designerToggleBtn.addEventListener('mouseenter', () => {
    designerToggleBtn.style.background = 'rgba(245,196,66,0.25)';
  });
  designerToggleBtn.addEventListener('mouseleave', () => {
    designerToggleBtn.style.background = 'rgba(245,196,66,0.1)';
  });
  designerToggleBtn.addEventListener('click', () => {
    if (designerPanel.style.display !== 'none') {
      closeDesigner();
      designerToggleBtn.textContent = 'Open Designer';
    } else {
      if (editor.selectedObject) {
        openDesigner();
        designerToggleBtn.textContent = 'Close Designer';
      }
    }
  });
  panel.appendChild(designerToggleBtn);

  // Editor save button — persists object positions on the ship
  const editorSaveBtn = document.createElement('button');
  editorSaveBtn.type = 'button';
  editorSaveBtn.textContent = 'Save';
  Object.assign(editorSaveBtn.style, {
    width: '100%', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
    border: '1px solid rgba(245,196,66,0.4)', background: 'rgba(245,196,66,0.1)',
    color: '#f5c542', cursor: 'pointer', transition: 'background 0.15s',
  });
  editorSaveBtn.addEventListener('mouseenter', () => {
    editorSaveBtn.style.background = 'rgba(245,196,66,0.25)';
  });
  editorSaveBtn.addEventListener('mouseleave', () => {
    editorSaveBtn.style.background = 'rgba(245,196,66,0.1)';
  });

  function buildEditorState() {
    const state = {};
    for (const obj of editableObjects) {
      state[obj.name] = {
        x: +obj.position.x.toFixed(4),
        y: +obj.position.y.toFixed(4),
        z: +obj.position.z.toFixed(4),
      };
    }
    return state;
  }

  async function saveEditorState() {
    const state = buildEditorState();
    try { localStorage.setItem('oceanGang_editor_v1', JSON.stringify(state)); } catch {}
    try {
      const res = await fetch('/__save_editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      return (await res.json()).ok;
    } catch { return true; }
  }

  editorSaveBtn.addEventListener('click', async () => {
    editorSaveBtn.textContent = 'Saving...';
    const ok = await saveEditorState();
    if (ok) {
      editorSaveBtn.textContent = 'Saved!';
      editorSaveBtn.style.background = 'rgba(34,197,94,0.2)';
      editorSaveBtn.style.borderColor = 'rgba(34,197,94,0.6)';
      editorSaveBtn.style.color = '#4ade80';
    } else {
      editorSaveBtn.textContent = 'Error';
      editorSaveBtn.style.background = 'rgba(220,38,38,0.2)';
      editorSaveBtn.style.borderColor = 'rgba(220,38,38,0.6)';
      editorSaveBtn.style.color = '#f87171';
    }
    setTimeout(() => {
      editorSaveBtn.textContent = 'Save';
      editorSaveBtn.style.background = 'rgba(245,196,66,0.1)';
      editorSaveBtn.style.borderColor = 'rgba(245,196,66,0.4)';
      editorSaveBtn.style.color = '#f5c542';
    }, 1500);
  });
  panel.appendChild(editorSaveBtn);

  document.body.appendChild(panel);

  // ── Designer side panel (appears to the right when a part is selected) ──

  const designerPanel = document.createElement('div');
  designerPanel.setAttribute('data-designer-panel', '');
  Object.assign(designerPanel.style, {
    position: 'fixed',
    top: '20px',
    left: '354px',
    right: '20px',
    bottom: '20px',
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
    flexDirection: 'column',
    overflow: 'hidden',
  });

  const designerHeader = document.createElement('div');
  Object.assign(designerHeader.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '10px', flexShrink: '0',
  });
  designerPanel.appendChild(designerHeader);

  const designerTitle = document.createElement('div');
  Object.assign(designerTitle.style, {
    fontSize: '14px', color: '#f5c542', fontWeight: 'bold',
  });
  designerHeader.appendChild(designerTitle);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  Object.assign(saveBtn.style, {
    padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
    border: '1px solid rgba(245,196,66,0.4)', background: 'rgba(245,196,66,0.1)',
    color: '#f5c542', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
  });
  saveBtn.addEventListener('mouseenter', () => {
    saveBtn.style.background = 'rgba(245,196,66,0.25)';
    saveBtn.style.borderColor = 'rgba(245,196,66,0.7)';
  });
  saveBtn.addEventListener('mouseleave', () => {
    saveBtn.style.background = 'rgba(245,196,66,0.1)';
    saveBtn.style.borderColor = 'rgba(245,196,66,0.4)';
  });
  saveBtn.addEventListener('click', async () => {
    if (!dSourceObj) return;
    saveBtn.textContent = 'Saving...';
    const ok = await saveDesignerState();
    if (ok) {
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = 'rgba(34,197,94,0.2)';
      saveBtn.style.borderColor = 'rgba(34,197,94,0.6)';
      saveBtn.style.color = '#4ade80';
    } else {
      saveBtn.textContent = 'Error';
      saveBtn.style.background = 'rgba(220,38,38,0.2)';
      saveBtn.style.borderColor = 'rgba(220,38,38,0.6)';
      saveBtn.style.color = '#f87171';
    }
    setTimeout(() => {
      saveBtn.textContent = 'Save';
      saveBtn.style.background = 'rgba(245,196,66,0.1)';
      saveBtn.style.borderColor = 'rgba(245,196,66,0.4)';
      saveBtn.style.color = '#f5c542';
    }, 1500);
  });
  designerHeader.appendChild(saveBtn);

  // Designer viewport
  const designerCanvas = document.createElement('canvas');
  Object.assign(designerCanvas.style, {
    width: '100%', flex: '1 1 0', minHeight: '0', borderRadius: '8px',
    background: '#3a4f5f', marginBottom: '8px', cursor: 'grab',
  });
  designerPanel.appendChild(designerCanvas);

  const dRenderer = new THREE.WebGLRenderer({ canvas: designerCanvas, antialias: true });
  dRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  dRenderer.toneMappingExposure = 1.4;
  dRenderer.setClearColor(0x3a4f5f, 1);
  const dScene = new THREE.Scene();
  dScene.background = new THREE.Color(0x3a4f5f);
  dScene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const dDirLight = new THREE.DirectionalLight(0xffffff, 4.0);
  dDirLight.position.set(3, 6, 4);
  dScene.add(dDirLight);
  const dDirLight2 = new THREE.DirectionalLight(0xaabbcc, 2.0);
  dDirLight2.position.set(-3, 3, -4);
  dScene.add(dDirLight2);
  const dDirLight3 = new THREE.DirectionalLight(0xccbbaa, 1.5);
  dDirLight3.position.set(0, -2, 3);
  dScene.add(dDirLight3);
  const dHemiLight = new THREE.HemisphereLight(0xddeeff, 0x998866, 1.5);
  dScene.add(dHemiLight);
  const dCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  let dSourceObj = null;
  let dChildren = []; // direct mesh children of the source object
  let dSelectedChild = null;
  let dSavedPos = new THREE.Vector3();
  let dSavedRot = new THREE.Euler();
  let dOrbitYaw = 0.4, dOrbitPitch = 0.3, dOrbitDist = 10;
  let dOrbitCenter = new THREE.Vector3();

  // Designer child list (compact grid)
  const dChildList = document.createElement('div');
  Object.assign(dChildList.style, {
    flexShrink: '0', maxHeight: '25%', overflowY: 'auto', marginBottom: '4px',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '3px',
  });
  designerPanel.appendChild(dChildList);

  // ── Redesign UI ──
  let dCompareObj = null;
  let dCompareMode = false;

  const redesignRow = document.createElement('div');
  Object.assign(redesignRow.style, {
    display: 'flex', gap: '6px', flexShrink: '0', marginBottom: '6px',
  });
  designerPanel.appendChild(redesignRow);

  const redesignInput = document.createElement('input');
  redesignInput.type = 'text';
  redesignInput.placeholder = 'Describe redesign...';
  Object.assign(redesignInput.style, {
    flex: '1', padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
    border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)',
    color: '#f5ead7',
  });
  redesignRow.appendChild(redesignInput);

  const redesignBtn = document.createElement('button');
  redesignBtn.type = 'button';
  redesignBtn.textContent = 'Redesign';
  Object.assign(redesignBtn.style, {
    padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
    border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)',
    color: '#c084fc', cursor: 'pointer', flexShrink: '0',
  });
  redesignRow.appendChild(redesignBtn);


  const redesignStatus = document.createElement('div');
  Object.assign(redesignStatus.style, {
    fontSize: '10px', color: 'rgba(245,234,215,0.5)', flexShrink: '0', marginBottom: '4px',
    minHeight: '14px',
  });
  designerPanel.appendChild(redesignStatus);

  // Accept/Discard buttons (hidden until comparison)
  const compareRow = document.createElement('div');
  Object.assign(compareRow.style, {
    display: 'none', gap: '8px', flexShrink: '0', marginBottom: '6px',
  });
  designerPanel.appendChild(compareRow);

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.textContent = 'Accept';
  Object.assign(acceptBtn.style, {
    flex: '1', padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.15)',
    color: '#4ade80', cursor: 'pointer',
  });
  compareRow.appendChild(acceptBtn);

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.textContent = 'Discard';
  Object.assign(discardBtn.style, {
    flex: '1', padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    border: '1px solid rgba(220,38,38,0.5)', background: 'rgba(220,38,38,0.15)',
    color: '#f87171', cursor: 'pointer',
  });
  compareRow.appendChild(discardBtn);

  // Serialize object for AI
  function serializeObjectForAI(obj) {
    const children = [];
    obj.traverse((child) => {
      if (child === obj || !child.isMesh) return;
      const geo = child.geometry;
      const mat = child.material;
      const geoInfo = geo.parameters
        ? { type: geo.type, parameters: geo.parameters }
        : { type: geo.type, approximateSize: (() => {
            const b = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
            const s = b.getSize(new THREE.Vector3());
            return [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)];
          })() };
      children.push({
        name: child.name || undefined,
        geometry: geoInfo,
        material: {
          color: mat.color ? '#' + mat.color.getHexString() : '#888888',
          metalness: mat.metalness ?? 0.3,
          roughness: mat.roughness ?? 0.7,
        },
        position: [+child.position.x.toFixed(4), +child.position.y.toFixed(4), +child.position.z.toFixed(4)],
        rotation: [+child.rotation.x.toFixed(4), +child.rotation.y.toFixed(4), +child.rotation.z.toFixed(4)],
        scale: [+child.scale.x.toFixed(4), +child.scale.y.toFixed(4), +child.scale.z.toFixed(4)],
      });
    });
    return { name: obj.name, children };
  }

  // Build Three.js object from AI design JSON
  function buildObjectFromDesign(design) {
    const group = new THREE.Group();
    const geoTypes = {
      BoxGeometry: THREE.BoxGeometry,
      SphereGeometry: THREE.SphereGeometry,
      CylinderGeometry: THREE.CylinderGeometry,
      ConeGeometry: THREE.ConeGeometry,
      TorusGeometry: THREE.TorusGeometry,
      PlaneGeometry: THREE.PlaneGeometry,
      TorusKnotGeometry: THREE.TorusKnotGeometry,
    };
    for (const c of (design.children || [])) {
      const GeoClass = geoTypes[c.geometry?.type];
      if (!GeoClass) continue;
      const geo = new GeoClass(...(c.geometry.args || []));
      const mat = new THREE.MeshStandardMaterial({
        color: c.material?.color || '#888888',
        metalness: c.material?.metalness ?? 0.3,
        roughness: c.material?.roughness ?? 0.7,
      });
      const mesh = new THREE.Mesh(geo, mat);
      if (c.name) mesh.name = c.name;
      if (c.position) mesh.position.set(...c.position);
      if (c.rotation) mesh.rotation.set(...c.rotation);
      if (c.scale) mesh.scale.set(...c.scale);
      group.add(mesh);
    }
    return group;
  }

  function disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  function enterCompareMode(newObj) {
    dCompareObj = newObj;
    dCompareMode = true;
    selectDesignerChild(null);
    redesignRow.style.display = 'none';
    compareRow.style.display = 'flex';
    dChildList.style.display = 'none';
    redesignStatus.textContent = 'Comparing — choose to accept or discard';
    // Zoom out to see both
    if (dSourceObj) {
      const box = new THREE.Box3().setFromObject(dSourceObj);
      const size = box.getSize(new THREE.Vector3());
      dOrbitDist = Math.max(size.x, size.y, size.z) * 4;
      dOrbitCenter.set(0, 0, 0);
    }
  }

  function exitCompareMode() {
    if (dCompareObj) { disposeObject(dCompareObj); dCompareObj = null; }
    dCompareMode = false;
    redesignRow.style.display = 'flex';
    compareRow.style.display = 'none';
    dChildList.style.display = 'grid';
    redesignStatus.textContent = '';
    // Refit camera
    if (dSourceObj) {
      const box = new THREE.Box3().setFromObject(dSourceObj);
      const size = box.getSize(new THREE.Vector3());
      dOrbitDist = Math.max(size.x, size.y, size.z) * 2;
      dOrbitCenter.set(0, 0, 0);
    }
  }

  // Redesign button click
  redesignBtn.addEventListener('click', () => {
    const instruction = redesignInput.value.trim();
    if (!instruction) return;
    if (!dSourceObj) { redesignStatus.textContent = 'Select a part first'; return; }

    redesignBtn.disabled = true;
    redesignBtn.textContent = 'Thinking...';
    redesignStatus.textContent = 'Sending to Claude...';

    const objectData = serializeObjectForAI(dSourceObj);

    // POST the request, then read the SSE stream from the response
    fetch('/__redesign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectData, instruction }),
    }).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            redesignBtn.disabled = false;
            redesignBtn.textContent = 'Redesign';
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line
          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === 'status') {
                  redesignStatus.textContent = data.message;
                } else if (eventType === 'done') {
                  if (data.ok) {
                    const newObj = buildObjectFromDesign(data.design);
                    if (newObj.children.length === 0) {
                      redesignStatus.textContent = 'Error: Claude returned an empty design';
                      redesignStatus.style.color = '#f87171';
                    } else {
                      enterCompareMode(newObj);
                    }
                  } else {
                    redesignStatus.textContent = 'Error: ' + (data.error || 'Unknown');
                    redesignStatus.style.color = '#f87171';
                  }
                  redesignBtn.disabled = false;
                  redesignBtn.textContent = 'Redesign';
                  setTimeout(() => { redesignStatus.style.color = 'rgba(245,234,215,0.5)'; }, 5000);
                }
              } catch {}
            }
          }
          read();
        });
      }
      read();
    }).catch(err => {
      redesignStatus.textContent = 'Error: ' + err.message;
      redesignStatus.style.color = '#f87171';
      redesignBtn.disabled = false;
      redesignBtn.textContent = 'Redesign';
      setTimeout(() => { redesignStatus.style.color = 'rgba(245,234,215,0.5)'; }, 3000);
    });
  });

  redesignInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') redesignBtn.click();
  });

  // Accept: replace original's children with new design's children
  acceptBtn.addEventListener('click', () => {
    if (!dSourceObj || !dCompareObj) return;
    // Remove old mesh children
    const toRemove = [];
    dSourceObj.traverse((child) => {
      if (child !== dSourceObj && child.isMesh) toRemove.push(child);
    });
    for (const child of toRemove) {
      child.parent.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    // Move new children into source object
    while (dCompareObj.children.length > 0) {
      const child = dCompareObj.children[0];
      dSourceObj.add(child);
    }
    dCompareObj = null;
    dCompareMode = false;
    redesignRow.style.display = 'flex';
    compareRow.style.display = 'none';
    dChildList.style.display = 'grid';
    redesignStatus.textContent = 'Redesign accepted!';
    setTimeout(() => { redesignStatus.textContent = ''; }, 2000);
    // Refresh child list
    openDesigner();
  });

  // Discard
  discardBtn.addEventListener('click', () => exitCompareMode());

  // Designer TransformControls for moving parts
  const dTransform = new TransformControls(dCamera, designerCanvas);
  dTransform.setMode('translate');
  dTransform.setSpace('local');
  dTransform.setSize(0.8);
  dTransform.enabled = false;
  const dTransformHelper = dTransform.getHelper();
  dTransformHelper.visible = false;
  dScene.add(dTransformHelper);
  let dTransformDragging = false;

  dTransform.addEventListener('dragging-changed', (event) => {
    dTransformDragging = event.value;
  });

  dTransform.addEventListener('change', () => {
    if (!dSelectedChild) return;
    dBoxHelper.setFromObject(dSelectedChild);
  });

  dTransform.addEventListener('mouseUp', () => {
    // Position already synced to source in 'change' handler — save via Save button
  });

  // Build full designer state from all editables for saving to disk
  // Always use _idx keys for stable matching across reloads
  function buildDesignerState() {
    const state = {};
    for (const obj of editableObjects) {
      const children = {};
      let hasChanges = false;
      let idx = 0;
      obj.traverse((child) => {
        if (child === obj) return;
        const key = `_${idx}`;
        idx++;
        if (!child.isMesh) return;
        children[key] = {
          x: +child.position.x.toFixed(4),
          y: +child.position.y.toFixed(4),
          z: +child.position.z.toFixed(4),
        };
        hasChanges = true;
      });
      if (hasChanges) state[obj.name] = children;
    }
    return state;
  }

  async function saveDesignerState() {
    const state = buildDesignerState();
    // Always save to localStorage (works everywhere)
    try { localStorage.setItem('oceanGang_designer_v1', JSON.stringify(state)); } catch {}
    // Also try Vite dev endpoint to write to public/designerState.json
    try {
      const res = await fetch('/__save_designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      return (await res.json()).ok;
    } catch { return true; /* localStorage save succeeded */ }
  }

  // Highlight selected child in preview
  const dBoxHelper = new THREE.BoxHelper(new THREE.Mesh(), 0x42c5f5);
  dBoxHelper.visible = false;
  dScene.add(dBoxHelper);

  function selectDesignerChild(child) {
    dSelectedChild = child;
    if (child) {
      dBoxHelper.visible = true;
      dTransform.attach(child);
      dTransformHelper.visible = true;
      dTransform.enabled = true;
    } else {
      dBoxHelper.visible = false;
      dTransform.detach();
      dTransformHelper.visible = false;
      dTransform.enabled = false;
    }
    for (const btn of dChildList.children) {
      const isActive = btn._child === child;
      btn.style.borderColor = isActive ? 'rgba(66,197,245,0.6)' : 'rgba(255,255,255,0.08)';
      btn.style.background = isActive ? 'rgba(66,197,245,0.15)' : 'rgba(255,255,255,0.04)';
    }
  }

  function openDesigner() {
    const obj = editor.selectedObject;
    if (!obj) {
      closeDesigner();
      return;
    }

    selectDesignerChild(null);

    dSourceObj = obj;

    // Collect mesh children
    dChildren = [];
    obj.traverse((child) => {
      if (child !== obj && child.isMesh) {
        if (!child.name) child.name = `Part ${dChildren.length + 1}`;
        dChildren.push(child);
      }
    });

    // Fit camera to object bounds (in local space)
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Convert center to object-local space for orbiting
    dOrbitCenter.set(0, 0, 0);
    dOrbitDist = Math.max(size.x, size.y, size.z) * 2;

    designerTitle.textContent = obj.name || 'Object';

    // Build compact child button grid
    dChildList.innerHTML = '';
    if (dChildren.length <= 1) {
      const msg = document.createElement('div');
      Object.assign(msg.style, { padding: '6px', fontSize: '10px', color: 'rgba(245,234,215,0.4)', textAlign: 'center', gridColumn: '1 / -1' });
      msg.textContent = 'Single mesh';
      dChildList.appendChild(msg);
    } else {
      for (const child of dChildren) {
        const btn = document.createElement('button');
        btn._child = child;
        btn.type = 'button';
        Object.assign(btn.style, {
          padding: '4px 6px', fontSize: '9px', cursor: 'pointer',
          borderRadius: '5px', textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.08)', transition: 'background 0.1s, border-color 0.1s',
          background: 'rgba(255,255,255,0.04)', color: '#f5ead7',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        btn.textContent = child.name || 'Part';
        btn.title = child.name || 'Part';
        btn.addEventListener('click', () => selectDesignerChild(child));
        dChildList.appendChild(btn);
      }
    }

    designerPanel.style.display = 'flex';
    renderDesigner();
  }

  function closeDesigner() {
    if (dCompareMode) exitCompareMode();
    selectDesignerChild(null);
    dSourceObj = null;
    dChildren = [];
    dChildList.innerHTML = '';
    designerPanel.style.display = 'none';
    designerToggleBtn.textContent = 'Open Designer';
  }

  // Designer orbit controls (skip when transform gizmo is active)
  let dDragging = false;
  designerCanvas.addEventListener('mousedown', (e) => {
    if (dTransformDragging) return;
    dDragging = true;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dDragging || dTransformDragging) return;
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
    if (!dSourceObj || dTransformDragging || dCompareMode) return;
    const rect = designerCanvas.getBoundingClientRect();
    dPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    dPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Temporarily move object to origin for raycasting (matches designer camera)
    const parent = dSourceObj.parent;
    const savedPos = dSourceObj.position.clone();
    const savedRot = dSourceObj.rotation.clone();
    dSourceObj.position.set(0, 0, 0);
    dSourceObj.rotation.set(0, 0, 0);
    dSourceObj.updateMatrixWorld(true);

    dRaycaster.setFromCamera(dPointer, dCamera);
    const hits = dRaycaster.intersectObjects(dChildren, false);

    // Restore
    dSourceObj.position.copy(savedPos);
    dSourceObj.rotation.copy(savedRot);
    dSourceObj.updateMatrixWorld(true);

    if (hits.length) {
      selectDesignerChild(hits[0].object);
    } else {
      selectDesignerChild(null);
    }
  });

  // Designer keyboard controls (WASD orbit, QE up/down)
  const dKeys = {};
  designerPanel.tabIndex = 0; // make focusable
  designerPanel.style.outline = 'none';
  designerPanel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    dKeys[e.key.toLowerCase()] = true;
  });
  designerPanel.addEventListener('keyup', (e) => {
    e.stopPropagation();
    dKeys[e.key.toLowerCase()] = false;
  });
  designerCanvas.addEventListener('keydown', (e) => e.stopPropagation());
  // Focus designer panel when interacting
  designerCanvas.addEventListener('mousedown', () => designerPanel.focus());
  designerPanel.addEventListener('mousedown', () => designerPanel.focus());

  function updateDesignerKeys() {
    const panSpeed = dOrbitDist * 0.02;
    // Camera-relative directions
    const forward = new THREE.Vector3(
      -Math.sin(dOrbitYaw) * Math.cos(dOrbitPitch),
      -Math.sin(dOrbitPitch),
      -Math.cos(dOrbitYaw) * Math.cos(dOrbitPitch),
    ).normalize();
    const right = new THREE.Vector3(-Math.cos(dOrbitYaw), 0, Math.sin(dOrbitYaw)).normalize();
    if (dKeys['w']) dOrbitCenter.addScaledVector(forward, panSpeed);
    if (dKeys['s']) dOrbitCenter.addScaledVector(forward, -panSpeed);
    if (dKeys['a']) dOrbitCenter.addScaledVector(right, -panSpeed);
    if (dKeys['d']) dOrbitCenter.addScaledVector(right, panSpeed);
    if (dKeys['e']) dOrbitCenter.y += panSpeed;
    if (dKeys['q']) dOrbitCenter.y -= panSpeed;
  }

  function renderDesigner() {
    if (designerPanel.style.display === 'none' || !dSourceObj) return;
    updateDesignerKeys();
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

    // Temporarily reparent the real object into designer scene
    const parent = dSourceObj.parent;
    dSavedPos.copy(dSourceObj.position);
    dSavedRot.copy(dSourceObj.rotation);
    dSourceObj.rotation.set(0, 0, 0);

    if (dCompareMode && dCompareObj) {
      // Side-by-side: original on left, new on right
      const box = new THREE.Box3().setFromObject(dSourceObj);
      const size = box.getSize(new THREE.Vector3());
      const offset = Math.max(size.x, size.y, size.z) * 0.8;
      dSourceObj.position.set(-offset, 0, 0);
      dScene.add(dSourceObj);
      dCompareObj.position.set(offset, 0, 0);
      dScene.add(dCompareObj);
      dSourceObj.updateMatrixWorld(true);
      dCompareObj.updateMatrixWorld(true);
      dRenderer.render(dScene, dCamera);
      dScene.remove(dCompareObj);
    } else {
      dSourceObj.position.set(0, 0, 0);
      dScene.add(dSourceObj);
      dSourceObj.updateMatrixWorld(true);
      if (dSelectedChild && dBoxHelper.visible) dBoxHelper.setFromObject(dSelectedChild);
      dRenderer.render(dScene, dCamera);
    }

    // Put it back
    dSourceObj.position.copy(dSavedPos);
    dSourceObj.rotation.copy(dSavedRot);
    if (parent) parent.add(dSourceObj);
    dSourceObj.updateMatrixWorld(true);
  }

  document.body.appendChild(designerPanel);

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
    highlightButtons(object);
    // Update designer if already open
    if (designerPanel.style.display !== 'none') openDesigner();
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
    highlightButtons(object);
    // Update designer if already open
    if (designerPanel.style.display !== 'none') openDesigner();
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
    highlightButtons(null);
    closeDesigner();
  }

  transform.addEventListener('change', () => {
    helper.update();
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
      unlock();
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
    showCameraToast('Editor Mode — WASD fly, Q/E down/up');
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

  editor.toggleEditor = function () {
    if (editorActive) hideEditor();
    else showEditor();
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorActive && editor.selectedObject) {
      deselect();
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
    if (keys['e']) camera.position.addScaledVector(up, moveSpeed * dt);
    if (keys['q']) camera.position.addScaledVector(up, -moveSpeed * dt);

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

// ── Menu Bar (top-right unified bar) ──
function initMenuBar() {
  const bar = document.createElement('div');
  bar.className = 'menu-bar';

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'menu-bar-items';

  const items = [
    { icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>', title: 'Sky & Ocean', action: () => skySettings.toggle() },
    { icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', title: 'Ship Editor', action: () => shipEditor?.toggleEditor() },
    { icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', title: 'Performance', action: () => perfTracker.toggle() },
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'menu-bar-btn';
    btn.innerHTML = item.icon;
    btn.title = item.title;
    btn.addEventListener('click', () => item.action());
    itemsWrap.appendChild(btn);
  }

  bar.appendChild(itemsWrap);

  // Collapse chevron
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'menu-bar-collapse';
  collapseBtn.title = 'Collapse menu';
  collapseBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  collapseBtn.addEventListener('click', () => {
    bar.classList.toggle('menu-bar-collapsed');
  });
  bar.appendChild(collapseBtn);

  document.body.appendChild(bar);

  // Block game input
  bar.addEventListener('keydown', (e) => e.stopPropagation());
  bar.addEventListener('keyup', (e) => e.stopPropagation());
}
