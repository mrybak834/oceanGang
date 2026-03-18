// ─── Multiplayer (Playroom Kit) ───
// Syncs boat positions between players so everyone can see each other's ships.

import { insertCoin, onPlayerJoin, myPlayer, isHost } from 'playroomkit';
import { createBoat } from './boat.js';

const remotePlayers = new Map(); // playerId → { boat, lastPos }
let scene = null;
let initialized = false;

export async function initMultiplayer(sceneRef) {
  scene = sceneRef;

  await insertCoin({
    skipLobby: true, // jump straight into the game, no lobby UI
  });

  onPlayerJoin((playerState) => {
    // Skip self — we already have our own boat
    if (playerState.id === myPlayer()?.id) return;

    // Spawn a boat for this remote player
    const remoteBoat = createBoat(scene);
    // Tint the sails so you can tell players apart
    const color = playerState.getProfile()?.color?.hex;
    if (color) {
      tintSails(remoteBoat, color);
    }

    remotePlayers.set(playerState.id, {
      boat: remoteBoat,
      state: playerState,
      lastPos: null,
    });

    // Clean up when they leave
    playerState.onQuit(() => {
      scene.remove(remoteBoat);
      remotePlayers.delete(playerState.id);
    });
  });

  initialized = true;
}

// Call each frame after updating local boat physics
export function sendLocalState(boat) {
  if (!initialized) return;
  const p = myPlayer();
  if (!p) return;

  p.setState('pos', {
    x: boat.position.x,
    y: boat.position.y,
    z: boat.position.z,
    rx: boat.rotation.x,
    ry: boat.rotation.y,
    rz: boat.rotation.z,
  });
}

// Call each frame to interpolate remote boats toward their latest state
export function updateRemotePlayers(time) {
  if (!initialized) return;

  for (const [, remote] of remotePlayers) {
    const pos = remote.state.getState('pos');
    if (!pos) continue;

    const b = remote.boat;
    // Smooth interpolation toward the networked position
    const t = 0.15;
    b.position.x += (pos.x - b.position.x) * t;
    b.position.y += (pos.y - b.position.y) * t;
    b.position.z += (pos.z - b.position.z) * t;
    b.rotation.x += (pos.rx - b.rotation.x) * t;
    b.rotation.y += shortAngleLerp(b.rotation.y, pos.ry, t);
    b.rotation.z += (pos.rz - b.rotation.z) * t;

    // Animate sails with a simple billow so remote boats look alive
    animateRemoteSails(b, time);
  }
}

export function getRemotePlayerCount() {
  return remotePlayers.size;
}

// ─── Helpers ───

// Lerp angles correctly across the -PI/PI boundary
function shortAngleLerp(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff * t;
}

// Tint sail meshes to the player's profile color
function tintSails(boat, hexColor) {
  const parts = ['mainSail', 'foreSail', 'jib'];
  for (const name of parts) {
    const sail = boat.userData[name];
    if (sail?.material) {
      sail.material = sail.material.clone();
      sail.material.color.set(hexColor);
    }
  }
}

// Minimal sail animation for remote boats (no physics, just visual billow)
function animateRemoteSails(boat, time) {
  const parts = ['mainSail', 'foreSail', 'jib'];
  const amplitudes = [1.2, 0.8, 0.7];

  for (let i = 0; i < parts.length; i++) {
    const sail = boat.userData[parts[i]];
    if (!sail) continue;
    const geo = sail.geometry;
    if (!geo.userData?.basePositions) continue;

    const pos = geo.attributes.position;
    const base = geo.userData.basePositions;
    const halfW = geo.parameters.width / 2;
    const halfH = geo.parameters.height / 2;
    const billow = 0.6; // constant moderate billow

    for (let v = 0; v < pos.count; v++) {
      const bx = base[v * 3];
      const by = base[v * 3 + 1];
      const nx = (bx + halfW) / geo.parameters.width;
      const ny = (by + halfH) / geo.parameters.height;
      const curve = Math.sin(nx * Math.PI) * Math.sin(ny * Math.PI);
      const ripple = Math.sin(ny * 5 + nx * 3 + time * 3.5) * 0.06 * nx;
      pos.setZ(v, curve * amplitudes[i] * billow + ripple);
    }
    pos.needsUpdate = true;
  }

  // Flag flutter
  if (boat.userData.flag) {
    boat.userData.flag.rotation.y = -Math.PI / 2 + Math.sin(time * 4) * 0.12;
  }
}
