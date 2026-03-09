import * as THREE from 'three';
import { createOcean } from './ocean.js';
import { createBoat, createBoatController } from './boat.js';
import { createCrateManager } from './crates.js';

let camera, scene, renderer;
let water, boat, boatController, crateManager;

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
  renderer.toneMappingExposure = 0.5;
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xaaddff, 0.00005);

  // Camera
  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    1,
    20000
  );
  camera.position.set(0, 15, 35);

  // Lightingd
  const ambientLight = new THREE.AmbientLight(0x445566, 0.4);
  scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  directionalLight.position.set(1, 3, 1);
  scene.add(directionalLight);

  // Ocean + Sky
  const ocean = createOcean(scene, renderer);
  water = ocean.water;

  // Boat
  boat = createBoat(scene);
  boatController = createBoatController();

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
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Update boat
  boatController.update(boat, delta, time);

  // Update water time
  water.material.uniforms['time'].value += delta;

  // Update crates
  crateManager.update(boat.position, time);

  // Camera follow
  updateCamera(delta);

  renderer.render(scene, camera);
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
