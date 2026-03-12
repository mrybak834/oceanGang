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
    waterColor: 0x006699,
    distortionScale: 3.7,
    alpha: 1.0,
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
  skyUniforms['rayleigh'].value = 1.5;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;

  // Sun position
  const parameters = { elevation: 24, azimuth: 78 };
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  let renderTarget;

  // Generate a neutral fallback environment for devices where PMREM fails (iPhones etc.)
  function makeFallbackEnv() {
    const size = 4;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      // Warm sky-ish neutral tone so PBR materials aren't black
      data[i * 4 + 0] = 180; // R
      data[i * 4 + 1] = 200; // G
      data[i * 4 + 2] = 220; // B
      data[i * 4 + 3] = 255; // A
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return pmremGenerator.fromEquirectangular(tex).texture;
  }

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

    // Verify the PMREM worked — on some mobile GPUs fromScene() returns a black texture.
    // If so, fall back to a neutral environment so MeshStandardMaterial isn't black.
    try {
      const gl = renderer.getContext();
      const fb = gl.createFramebuffer();
      const webglTex = renderer.properties.get(renderTarget.texture).__webglTexture;
      if (webglTex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, webglTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          const pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
            console.warn('PMREM envmap is black — using fallback environment');
            scene.environment = makeFallbackEnv();
          }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.deleteFramebuffer(fb);
    } catch (_) {
      // readPixels not available — use fallback to be safe on mobile
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile) {
        console.warn('Cannot verify envmap — using fallback environment on mobile');
        scene.environment = makeFallbackEnv();
      }
    }
  }

  updateSun();

  // Clouds — procedural canvas texture billboards that stay at the horizon
  function makeCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Draw several overlapping soft ellipses to form a cloud
    const puffs = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < puffs; i++) {
      const x = 60 + Math.random() * 136;
      const y = 40 + Math.random() * 48;
      const rx = 30 + Math.random() * 50;
      const ry = 15 + Math.random() * 25;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, rx);
      gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(0.7, 'rgba(240,240,255,0.2)');
      gradient.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  const clouds = new THREE.Group();

  for (let i = 0; i < 20; i++) {
    const texture = makeCloudTexture();
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.55 + Math.random() * 0.3,
      depthWrite: false,
      fog: true,
    });
    const sprite = new THREE.Sprite(spriteMat);

    // Place in a ring around origin, far away and high up
    const angle = Math.random() * Math.PI * 2;
    const dist = 3000 + Math.random() * 4000;
    const height = 500 + Math.random() * 600;
    sprite.position.set(
      Math.cos(angle) * dist,
      height,
      Math.sin(angle) * dist
    );
    const s = 400 + Math.random() * 500;
    sprite.scale.set(s * 2, s, 1);
    clouds.add(sprite);
  }
  scene.add(clouds);

  return { water, sky, sun, clouds, updateSun, parameters, skyUniforms };
}
