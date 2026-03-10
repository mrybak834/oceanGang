import * as THREE from 'three';
import { createOcean } from './ocean.js';
import { createBoat, createBoatController } from './boat.js';
import { createCrateManager } from './crates.js';
import { createIslands } from './islands.js';
import { createWindEffect } from './windEffect.js';
import { createWakeSystem } from './wake.js';
import { initMusicPanel } from './music.js';
import { createShipAudio } from './shipAudio.js';
import { initSkySettings } from './skySettings.js';
import { createTradingSystem } from './trading.js';
import { createPerfTracker } from './perfTracker.js';

let camera, scene, renderer;
let water, boat, boatController, crateManager, windEffect, wakeSystem;
let shipAudio, ocean, tradingSystem, perfTracker;
let islandGroups = [], islandPositions = [];
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

  // Music panel (Strudel)
  initMusicPanel();

  // Trading system (island barriers + trading menu)
  tradingSystem = createTradingSystem(scene, islandsResult.islandData, crateManager);

  // Ship water audio (Web Audio synthesis tied to boat speed)
  shipAudio = createShipAudio();

  // Sky/ocean settings popup (G key)
  initSkySettings(ocean, renderer);

  // Performance tracker (P key)
  perfTracker = createPerfTracker(renderer);
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

  // Camera follow
  perfTracker.markStart('camera');
  updateCamera(delta);
  perfTracker.markEnd('camera');

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
