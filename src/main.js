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

let camera, scene, renderer;
let water, boat, boatController, crateManager, windEffect, wakeSystem;
let shipAudio, ocean, tradingSystem, perfTracker, instrumentRegistry;
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

  // Wind boost effect (3D streaks in world space)
  windEffect = createWindEffect(scene);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfff4e5, 2.0);
  directionalLight.position.set(1, 3, 1);
  scene.add(directionalLight);

  // Ocean + Sky
  ocean = createOcean(scene, renderer);
  water = ocean.water;

  // Boat
  boat = createBoat(scene);
  boatController = createBoatController();
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
    cameraYaw -= e.movementX * 0.005;
    cameraPitch = Math.max(pitchMin, Math.min(pitchMax, cameraPitch - e.movementY * 0.005));
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
  initMusicPanel(shipAudio);

  // Trading system (island barriers + trading menu)
  tradingSystem = createTradingSystem(scene, islandsResult.islandData, crateManager, instrumentRegistry);

  // Sky/ocean settings popup (G key)
  initSkySettings(ocean, renderer);

  // Performance tracker (P key)
  perfTracker = createPerfTracker(renderer);

  // Title screen
  createTitleScreen();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  perfTracker.begin();

  // Update boat
  perfTracker.markStart('boat');
  boatController.update(boat, delta, time);
  perfTracker.markEnd('boat');

  // Update water time
  water.material.uniforms['time'].value += delta;

  // Update crates
  perfTracker.markStart('crates');
  const crateCollected = crateManager.update(boat.position, time);
  perfTracker.markEnd('crates');
  if (crateCollected) perfTracker.logEvent('crate_collected', { score: crateManager.getScore() });

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
  tradingSystem.update(boat, delta, boatController);
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

  // Camera follow
  perfTracker.markStart('camera');
  if (!shipEditor?.isDragging) updateCamera(delta);
  perfTracker.markEnd('camera');

  if (shipEditor?.helper && shipEditor.selectedObject) {
    shipEditor.helper.update();
  }

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
  titleHint.textContent = 'E to close';
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
    btn.addEventListener('dblclick', () => lockObject(obj));
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

  const editor = {
    panel,
    transform,
    helper,
    selectedObject: null,
    isDragging: false,
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
    settingsDiv.style.display = '';
    settingsTitle.textContent = object.name || 'Object';
    syncFields();
    highlightButtons(object);
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
    panel.style.display = '';
    if (locked && editor.selectedObject) {
      transformHelper.visible = true;
      transform.enabled = true;
    }
    if (editor.selectedObject) {
      helper.visible = true;
    }
  }

  function hideEditor() {
    editorActive = false;
    panel.style.display = 'none';
    deselect();
    transformHelper.visible = false;
    transform.enabled = false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('#music-panel') || e.target.closest('.sky-settings') || e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyE' && !e.repeat) {
      if (editorActive) hideEditor();
      else showEditor();
    }
  });

  // Block game input while interacting with panel
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); });
  panel.addEventListener('keyup', (e) => { e.stopPropagation(); });

  return editor;
}
