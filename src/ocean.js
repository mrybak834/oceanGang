import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

export function createOcean(scene, renderer) {
  const sun = new THREE.Vector3();

  // Water
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
  const water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'textures/waternormals.jpg',
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x0064b5,
    distortionScale: 1.0,
    alpha: 0.9,
    fog: scene.fog !== undefined,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // Sky
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 2;
  skyUniforms['rayleigh'].value = 1;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;

  // Sun position
  const parameters = { elevation: 45, azimuth: 180 };
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  let renderTarget;

  function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();

    if (renderTarget !== undefined) renderTarget.dispose();

    sceneEnv.add(sky);
    renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.add(sky);

    scene.environment = renderTarget.texture;
  }

  updateSun();

  // Clouds
  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  for (let i = 0; i < 25; i++) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffCount; j++) {
      const size = 40 + Math.random() * 60;
      const puffGeo = new THREE.SphereGeometry(size, 8, 6);
      const puff = new THREE.Mesh(puffGeo, cloudMaterial);
      puff.position.set(
        (Math.random() - 0.5) * size * 1.5,
        (Math.random() - 0.3) * size * 0.4,
        (Math.random() - 0.5) * size * 1.2
      );
      puff.scale.y = 0.4 + Math.random() * 0.2;
      cloud.add(puff);
    }
    cloud.position.set(
      (Math.random() - 0.5) * 6000,
      200 + Math.random() * 150,
      (Math.random() - 0.5) * 6000
    );
    clouds.add(cloud);
  }
  scene.add(clouds);

  return { water, sky, sun, clouds, updateSun };
}
