// ─── Multiplayer (SpacetimeDB) ───
// Syncs boat positions between players so everyone can see each other's ships.
// Connects to a local SpacetimeDB server started automatically by the Vite plugin.

import { createBoat } from './boat.js';

const SPACETIME_URI = 'ws://localhost:3000';
const MODULE_NAME = 'ocean-gang';
const SEND_INTERVAL = 50; // ms between position updates (~20Hz)

const remotePlayers = new Map(); // identity hex string → { boat, pos }
let scene = null;
let connection = null;
let myIdentity = null;
let initialized = false;
let lastSendTime = 0;
let stats = { status: 'Disconnected', updatesSent: 0, updatesReceived: 0, connectedAt: null };

// Sail colors for remote players (cycle through these)
const SAIL_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];
let colorIndex = 0;

export async function initMultiplayer(sceneRef) {
  scene = sceneRef;

  // Import generated bindings (created by Vite plugin at startup, or stub if unavailable)
  let DbConnection;
  try {
    const bindings = await import('./module_bindings/index.ts');
    DbConnection = bindings.DbConnection;
    if (!DbConnection) {
      console.warn('Multiplayer: SpacetimeDB not configured. Run with SpacetimeDB to enable multiplayer.');
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

        // Subscribe to all online players
        // Register table callbacks BEFORE subscribing
        // so we catch all events including initial subscription results

        // New player appears
        conn.db.player.onInsert((_ctx, player) => {
          console.log('Multiplayer: onInsert', player.identity.toHexString().substring(0, 8), 'online:', player.online);
          if (player.identity.isEqual(myIdentity)) return;
          if (!player.online) return;
          spawnRemoteBoat(player);
        });

        // Player position updated
        conn.db.player.onUpdate((_ctx, _old, player) => {
          if (player.identity.isEqual(myIdentity)) return;
          stats.updatesReceived++;
          const key = player.identity.toHexString();
          const remote = remotePlayers.get(key);
          if (remote) {
            if (!player.online) {
              // Player went offline
              scene.remove(remote.boat);
              remotePlayers.delete(key);
            } else {
              // Update target position for interpolation
              remote.target = {
                x: player.x, y: player.y, z: player.z,
                rx: player.rx, ry: player.ry, rz: player.rz,
              };
            }
          } else if (player.online) {
            // Player came back online
            spawnRemoteBoat(player);
          }
        });

        // Player removed from subscription (went offline)
        conn.db.player.onDelete((_ctx, player) => {
          const key = player.identity.toHexString();
          const remote = remotePlayers.get(key);
          if (remote) {
            scene.remove(remote.boat);
            remotePlayers.delete(key);
          }
        });

        // Now subscribe — callbacks above will fire for initial + future data
        conn.subscriptionBuilder()
          .onApplied(() => {
            console.log('Multiplayer: subscription applied, players in DB:', conn.db.player.count());
            initialized = true;
            resolve();
          })
          .subscribe('SELECT * FROM player WHERE online = true');
      })
      .onDisconnect(() => {
        console.log('Multiplayer: disconnected');
        initialized = false;
        stats.status = 'Disconnected';
      })
      .onConnectError((_ctx, err) => {
        console.warn('Multiplayer: connection failed.', err);
        stats.status = 'Error';
        resolve(); // Don't block game startup
      })
      .build();
  });
}

// Call each frame after updating local boat physics
export function sendLocalState(boat) {
  if (!initialized || !connection) return;

  // Throttle sends to ~20Hz
  const now = performance.now();
  if (now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;

  connection.reducers.updatePosition({
    x: boat.position.x,
    y: boat.position.y,
    z: boat.position.z,
    rx: boat.rotation.x,
    ry: boat.rotation.y,
    rz: boat.rotation.z,
  });
  stats.updatesSent++;
}

// Call each frame to interpolate remote boats toward their latest state
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
  }
}

export function getRemotePlayerCount() {
  return remotePlayers.size;
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

    // Status
    const statusColors = { Connected: '#2ecc71', Disconnected: '#e74c3c', Error: '#e74c3c' };
    elStatus.textContent = stats.status;
    elStatus.style.color = statusColors[stats.status] || '#fff';

    // Identity
    elIdentity.textContent = stats.identity || '--';

    // Players (including self)
    const total = remotePlayers.size + (initialized ? 1 : 0);
    elPlayers.textContent = total;

    // Uptime
    if (stats.connectedAt) {
      const secs = Math.floor((now - stats.connectedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      elUptime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    } else {
      elUptime.textContent = '--';
    }

    // Rates
    if (dt > 0) {
      const sendRate = (stats.updatesSent - lastSent) / dt;
      const recvRate = (stats.updatesReceived - lastRecv) / dt;
      elSendRate.textContent = sendRate.toFixed(0) + '/s';
      elRecvRate.textContent = recvRate.toFixed(0) + '/s';
    }
    lastSent = stats.updatesSent;
    lastRecv = stats.updatesReceived;

    // Totals
    elSent.textContent = stats.updatesSent.toLocaleString();
    elRecv.textContent = stats.updatesReceived.toLocaleString();

    // Player list
    if (remotePlayers.size === 0) {
      elPlayerList.textContent = 'No other players';
    } else {
      let html = '';
      for (const [key, remote] of remotePlayers) {
        const b = remote.boat;
        const dist = scene ? Math.sqrt(
          (b.position.x) ** 2 + (b.position.z) ** 2
        ) : 0;
        html += `<div class="mp-player-row">
          <span class="mp-player-id">${key.substring(0, 8)}</span>
          <span class="mp-player-pos">${b.position.x.toFixed(0)}, ${b.position.z.toFixed(0)}</span>
        </div>`;
      }
      elPlayerList.innerHTML = html;
    }
  }

  // Update at 2Hz when visible
  setInterval(update, 500);

  return { toggle };
}

// ─── Helpers ───

function spawnRemoteBoat(player) {
  const key = player.identity.toHexString();
  if (remotePlayers.has(key)) return;

  const boat = createBoat(scene);
  boat.position.set(player.x, player.y, player.z);
  boat.rotation.set(player.rx, player.ry, player.rz);

  // Give each remote player a unique sail color
  const color = SAIL_COLORS[colorIndex % SAIL_COLORS.length];
  colorIndex++;
  tintSails(boat, color);

  remotePlayers.set(key, {
    boat,
    target: {
      x: player.x, y: player.y, z: player.z,
      rx: player.rx, ry: player.ry, rz: player.rz,
    },
  });
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
