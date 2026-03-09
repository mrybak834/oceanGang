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
const baseCameraOffset = new THREE.Vector3(0, 40, 50);
const cameraLookOffset = new THREE.Vector3(0, 0, 0);

init();

function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x99ccff, 0.0002);

  // Camera
  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    1,
    20000
  );
  camera.position.set(0, 15, 35);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x8899aa, 2);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
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
  // Calculate desired camera position relative to boat
  const offset = baseCameraOffset.clone().multiplyScalar(zoomLevel);
  offset.applyQuaternion(boat.quaternion);
  const desiredPosition = boat.position.clone().add(offset);

  // Smooth follow
  camera.position.lerp(desiredPosition, 1 - Math.exp(-5 * delta));

  // Look at boat
  const lookTarget = boat.position.clone().add(cameraLookOffset);
  camera.lookAt(lookTarget);
}
