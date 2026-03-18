// ─── Multiplayer (SpacetimeDB) ───
// Syncs boat positions, object state, and presets between players.

import { createBoat } from './boat.js';
import { initChat } from './chat.js';
import { buildUnifiedState, applyUnifiedState, splitState } from './objectState.js';

const SPACETIME_URI = 'ws://localhost:3000';
const MODULE_NAME = 'ocean-gang';
const SEND_INTERVAL = 50; // ms between position updates (~20Hz)

const remotePlayers = new Map(); // identity hex → { boat, target, lastObjectState }
let scene = null;
let localBoat = null;
let connection = null;
let myIdentity = null;
let initialized = false;
let lastSendTime = 0;
let stats = { status: 'Disconnected', updatesSent: 0, updatesReceived: 0, connectedAt: null };

const SAIL_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];
let colorIndex = 0;

// ─── Init ───

export async function initMultiplayer(sceneRef, boat, cameraRef) {
  scene = sceneRef;
  localBoat = boat;

  let DbConnection;
  try {
    const bindings = await import('./module_bindings/index.ts');
    DbConnection = bindings.DbConnection;
    if (!DbConnection) {
      console.warn('Multiplayer: SpacetimeDB not configured.');
      return;
    }
  } catch (err) {
    console.warn('Multiplayer: module bindings not found.', err);
    return;
  }

  return new Promise((resolve) => {
    connection = DbConnection.builder()
      .withUri(SPACETIME_URI)
      .withDatabaseName(MODULE_NAME)
      .withToken(sessionStorage.getItem('spacetime_token') || undefined)
      .onConnect((conn, identity, token) => {
        sessionStorage.setItem('spacetime_token', token);
        myIdentity = identity;
        stats.status = 'Connected';
        stats.connectedAt = Date.now();
        stats.identity = identity.toHexString().substring(0, 8);
        console.log('Multiplayer: connected as', stats.identity);

        // ── Player callbacks ──

        conn.db.player.onInsert((_ctx, player) => {
          if (player.identity.isEqual(myIdentity)) return;
          if (!player.online) return;
          spawnRemoteBoat(conn, player);
        });

        conn.db.player.onUpdate((_ctx, _old, player) => {
          if (player.identity.isEqual(myIdentity)) return;
          stats.updatesReceived++;
          const key = player.identity.toHexString();
          const remote = remotePlayers.get(key);
          if (remote) {
            if (!player.online) {
              scene.remove(remote.boat);
              remotePlayers.delete(key);
            } else {
              remote.target = {
                x: player.x, y: player.y, z: player.z,
                rx: player.rx, ry: player.ry, rz: player.rz,
              };
            }
          } else if (player.online) {
            spawnRemoteBoat(conn, player);
          }
        });

        conn.db.player.onDelete((_ctx, player) => {
          const key = player.identity.toHexString();
          const remote = remotePlayers.get(key);
          if (remote) {
            scene.remove(remote.boat);
            remotePlayers.delete(key);
          }
        });

        // ── Object state callbacks (for live editing sync) ──

        conn.db.playerObject.onInsert((_ctx, po) => {
          applyPlayerObjectToBoat(po);
        });

        conn.db.playerObject.onUpdate((_ctx, _old, po) => {
          applyPlayerObjectToBoat(po);
        });

        // ── Chat ──
        initChat(conn, identity, scene, cameraRef, boat, remotePlayers);

        // ── Subscribe ──
        conn.subscriptionBuilder()
          .onApplied(() => {
            console.log('Multiplayer: subscription applied');

            // Seed "ship" base state if it doesn't exist yet
            seedShipBaseState(conn);

            // Apply our own saved state from DB if it exists
            applyLocalPlayerState(conn);

            initialized = true;
            resolve();
          })
          .subscribe([
            'SELECT * FROM player WHERE online = true',
            'SELECT * FROM chat_message',
            'SELECT * FROM game_object',
            'SELECT * FROM player_object',
            'SELECT * FROM player_preset',
          ]);
      })
      .onDisconnect(() => {
        console.log('Multiplayer: disconnected');
        initialized = false;
        stats.status = 'Disconnected';
      })
      .onConnectError((_ctx, err) => {
        console.warn('Multiplayer: connection failed.', err);
        stats.status = 'Error';
        resolve();
      })
      .build();
  });
}

// ─── Position sync ───

export function sendLocalState(boat) {
  if (!initialized || !connection) return;
  const now = performance.now();
  if (now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;

  connection.reducers.updatePosition({
    x: boat.position.x, y: boat.position.y, z: boat.position.z,
    rx: boat.rotation.x, ry: boat.rotation.y, rz: boat.rotation.z,
  });
  stats.updatesSent++;
}

// ─── Remote player interpolation ───

export function updateRemotePlayers(time) {
  if (!initialized) return;

  for (const [, remote] of remotePlayers) {
    const t = remote.target;
    if (!t) continue;

    const b = remote.boat;
    const lerp = 0.15;
    b.position.x += (t.x - b.position.x) * lerp;
    b.position.y += (t.y - b.position.y) * lerp;
    b.position.z += (t.z - b.position.z) * lerp;
    b.rotation.x += (t.rx - b.rotation.x) * lerp;
    b.rotation.y += shortAngleLerp(b.rotation.y, t.ry, lerp);
    b.rotation.z += (t.rz - b.rotation.z) * lerp;

    animateRemoteSails(b, time);
    lerpShipTargets(b);
  }
}

export function getRemotePlayerCount() {
  return remotePlayers.size;
}

// ─── Object state API (called by editor) ───

// Update the live state of an object (e.g. "ship") in SpacetimeDB
export function updateObjectState(objectId, unifiedState) {
  if (!initialized || !connection) return;
  connection.reducers.updateLiveState({
    objectId,
    liveState: JSON.stringify(unifiedState),
  });
}

// Restore object to base default
export function restoreObjectDefault(objectId) {
  if (!initialized || !connection) return;
  connection.reducers.restoreDefault({ objectId });
}

// Save current state as a named preset
export function saveObjectPreset(objectId, name) {
  if (!initialized || !connection) return;
  const editableObjects = localBoat?.userData?.editableObjects;
  if (!editableObjects) return;
  const state = JSON.stringify(buildUnifiedState(editableObjects));
  connection.reducers.savePreset({ objectId, name, state });
}

// Load a saved preset
export function loadObjectPreset(presetId) {
  if (!initialized || !connection) return;
  connection.reducers.loadPreset({ presetId });
}

// Delete a saved preset
export function deleteObjectPreset(presetId) {
  if (!initialized || !connection) return;
  connection.reducers.deletePreset({ presetId });
}

// Get all presets for an object type (from local cache)
export function getPresets(objectId) {
  if (!initialized || !connection) return [];
  const presets = [];
  for (const p of connection.db.playerPreset.iter()) {
    if (p.owner.isEqual(myIdentity) && p.objectId === objectId) {
      presets.push({ id: p.id, name: p.name, state: p.state });
    }
  }
  return presets;
}

// ─── Internal helpers ───

function seedShipBaseState(conn) {
  // Only seed if "ship" doesn't exist yet
  let exists = false;
  for (const go of conn.db.gameObject.iter()) {
    if (go.id === 'ship') { exists = true; break; }
  }
  if (exists) return;

  // Build base state from the local boat's current (default) positions
  const editableObjects = localBoat?.userData?.editableObjects;
  if (!editableObjects) return;
  const baseState = JSON.stringify(buildUnifiedState(editableObjects));
  conn.reducers.seedGameObject({ id: 'ship', category: 'vessel', baseState });
  console.log('Multiplayer: seeded "ship" base state');
}

function applyLocalPlayerState(conn) {
  // Find our playerObject for "ship"
  for (const po of conn.db.playerObject.iter()) {
    if (po.owner.isEqual(myIdentity) && po.objectId === 'ship') {
      try {
        const unified = JSON.parse(po.liveState);
        applyUnifiedState(localBoat, unified);
        console.log('Multiplayer: applied saved ship state');
      } catch {}
      return;
    }
  }
  // No saved state — first time player, they get code defaults
}

function applyPlayerObjectToBoat(po) {
  if (po.objectId !== 'ship') return;

  // Local player — apply to own boat
  if (po.owner.isEqual(myIdentity)) {
    try {
      const unified = JSON.parse(po.liveState);
      applyUnifiedState(localBoat, unified);
    } catch {}
    return;
  }

  // Remote player — set lerp targets
  const key = po.owner.toHexString();
  const remote = remotePlayers.get(key);
  if (!remote) return;

  try {
    const unified = JSON.parse(po.liveState);
    const { editor, designer } = splitState(unified);
    setShipTargets(remote.boat, editor, designer);
  } catch {}
}

function spawnRemoteBoat(conn, player) {
  const key = player.identity.toHexString();
  if (remotePlayers.has(key)) return;

  const boat = createBoat(scene);
  boat.position.set(player.x, player.y, player.z);
  boat.rotation.set(player.rx, player.ry, player.rz);

  const color = SAIL_COLORS[colorIndex % SAIL_COLORS.length];
  colorIndex++;
  tintSails(boat, color);

  // Apply their saved object state if available
  for (const po of conn.db.playerObject.iter()) {
    if (po.owner.isEqual(player.identity) && po.objectId === 'ship') {
      try {
        applyUnifiedState(boat, JSON.parse(po.liveState));
      } catch {}
      break;
    }
  }

  remotePlayers.set(key, {
    boat,
    target: {
      x: player.x, y: player.y, z: player.z,
      rx: player.rx, ry: player.ry, rz: player.rz,
    },
  });
}

// Store lerp targets for smooth remote object state updates
function setShipTargets(boat, editor, designer) {
  if (!boat.userData._shipTargets) boat.userData._shipTargets = {};
  const targets = boat.userData._shipTargets;
  const editableObjects = boat.userData.editableObjects || [];

  if (editor) {
    for (const obj of editableObjects) {
      const pos = editor[obj.name];
      if (pos) {
        if (!targets[obj.name]) targets[obj.name] = {};
        targets[obj.name].pos = pos;
      }
    }
  }

  if (designer) {
    for (const obj of editableObjects) {
      const objState = designer[obj.name];
      if (!objState) continue;
      if (!targets[obj.name]) targets[obj.name] = {};
      targets[obj.name].children = objState;
    }
  }
}

function lerpShipTargets(boat) {
  const targets = boat.userData._shipTargets;
  if (!targets) return;
  const editableObjects = boat.userData.editableObjects || [];
  const t = 0.2;

  for (const obj of editableObjects) {
    const tgt = targets[obj.name];
    if (!tgt) continue;

    if (tgt.pos) {
      obj.position.x += (tgt.pos.x - obj.position.x) * t;
      obj.position.y += (tgt.pos.y - obj.position.y) * t;
      obj.position.z += (tgt.pos.z - obj.position.z) * t;
    }

    if (tgt.children) {
      let idx = 0;
      obj.traverse((child) => {
        if (child === obj) return;
        const key = `_${idx}`;
        idx++;
        const cp = tgt.children[key];
        if (cp) {
          child.position.x += (cp.x - child.position.x) * t;
          child.position.y += (cp.y - child.position.y) * t;
          child.position.z += (cp.z - child.position.z) * t;
        }
      });
    }
  }
}

function shortAngleLerp(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff * t;
}

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
    const billow = 0.6;

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

  if (boat.userData.flag) {
    boat.userData.flag.rotation.y = -Math.PI / 2 + Math.sin(time * 4) * 0.12;
  }
}

// ─── Multiplayer Info Panel ───

export function createMultiplayerPanel() {
  const panel = document.createElement('div');
  panel.className = 'mp-panel mp-hidden';

  panel.innerHTML = `
    <div class="mp-title">Multiplayer</div>
    <div class="mp-grid">
      <span class="mp-label">Status</span><span class="mp-val" id="mp-status">--</span>
      <span class="mp-label">Identity</span><span class="mp-val" id="mp-identity">--</span>
      <span class="mp-label">Players</span><span class="mp-val" id="mp-players">--</span>
      <span class="mp-label">Uptime</span><span class="mp-val" id="mp-uptime">--</span>
    </div>
    <div class="mp-section">Network</div>
    <div class="mp-grid">
      <span class="mp-label">Send rate</span><span class="mp-val" id="mp-sendrate">--</span>
      <span class="mp-label">Recv rate</span><span class="mp-val" id="mp-recvrate">--</span>
      <span class="mp-label">Total sent</span><span class="mp-val" id="mp-sent">--</span>
      <span class="mp-label">Total recv</span><span class="mp-val" id="mp-recv">--</span>
    </div>
    <div class="mp-section">Remote Players</div>
    <div id="mp-player-list" class="mp-player-list"></div>
  `;

  document.body.appendChild(panel);
  panel.addEventListener('keydown', e => e.stopPropagation());
  panel.addEventListener('keyup', e => e.stopPropagation());
  panel.addEventListener('mousedown', e => e.stopPropagation());
  panel.addEventListener('wheel', e => e.stopPropagation());

  const elStatus = panel.querySelector('#mp-status');
  const elIdentity = panel.querySelector('#mp-identity');
  const elPlayers = panel.querySelector('#mp-players');
  const elUptime = panel.querySelector('#mp-uptime');
  const elSendRate = panel.querySelector('#mp-sendrate');
  const elRecvRate = panel.querySelector('#mp-recvrate');
  const elSent = panel.querySelector('#mp-sent');
  const elRecv = panel.querySelector('#mp-recv');
  const elPlayerList = panel.querySelector('#mp-player-list');

  let visible = false;
  let lastSent = 0;
  let lastRecv = 0;
  let lastTick = Date.now();

  function toggle() {
    visible = !visible;
    panel.classList.toggle('mp-hidden', !visible);
    return visible;
  }

  function update() {
    if (!visible) return;
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    const statusColors = { Connected: '#2ecc71', Disconnected: '#e74c3c', Error: '#e74c3c' };
    elStatus.textContent = stats.status;
    elStatus.style.color = statusColors[stats.status] || '#fff';
    elIdentity.textContent = stats.identity || '--';

    const total = remotePlayers.size + (initialized ? 1 : 0);
    elPlayers.textContent = total;

    if (stats.connectedAt) {
      const secs = Math.floor((now - stats.connectedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      elUptime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    } else {
      elUptime.textContent = '--';
    }

    if (dt > 0) {
      elSendRate.textContent = ((stats.updatesSent - lastSent) / dt).toFixed(0) + '/s';
      elRecvRate.textContent = ((stats.updatesReceived - lastRecv) / dt).toFixed(0) + '/s';
    }
    lastSent = stats.updatesSent;
    lastRecv = stats.updatesReceived;
    elSent.textContent = stats.updatesSent.toLocaleString();
    elRecv.textContent = stats.updatesReceived.toLocaleString();

    if (remotePlayers.size === 0) {
      elPlayerList.textContent = 'No other players';
    } else {
      let html = '';
      for (const [key, remote] of remotePlayers) {
        const b = remote.boat;
        html += `<div class="mp-player-row">
          <span class="mp-player-id">${key.substring(0, 8)}</span>
          <span class="mp-player-pos">${b.position.x.toFixed(0)}, ${b.position.z.toFixed(0)}</span>
        </div>`;
      }
      elPlayerList.innerHTML = html;
    }
  }

  setInterval(update, 500);
  return { toggle };
}
