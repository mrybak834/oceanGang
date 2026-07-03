import * as THREE from 'three';
import { createDaoistPriest, updateDaoistPriest } from './daoistPriest.js';
import { SOUND_OPTIONS, applySoundSwap, isSwappableSynth } from './patchParser.js';

// ─── Island Trading System ───

const BARRIER_BUFFER = 18;   // distance past island radius for barrier ring
const INNER_BUFFER = 8;      // hard-stop boundary inside the barrier ring

const ISLAND_TYPES = [
  { name: 'Lumber Mill', material: 'Wood',  icon: 'W', color: '#a67c52' },
  { name: 'Quarry',      material: 'Stone', icon: 'S', color: '#8a8a8a' },
  { name: 'Mine',        material: 'Iron',  icon: 'I', color: '#b07040' },
  { name: 'Gold Mine',   material: 'Gold',  icon: 'G', color: '#daa520' },
];

const LEVELS = [
  { cost: 0,  rate: 0,   label: 'Undeveloped' },
  { cost: 3,  rate: 1,   label: 'Level 1' },
  { cost: 6,  rate: 3,   label: 'Level 2' },
  { cost: 12, rate: 6,   label: 'Level 3' },
];

const DAOIST_PRIEST_LINES = [
  'The tide brought you here before iron or gold did. That is usually a better beginning.',
  'Build lightly. Listen to the wind before you command it, and the islands will answer with more than crates.',
  'Take this harbor as a threshold. Trade if you must, but do not forget to look at the water until it speaks back.',
];

function hashCoords(x, z) {
  const a = Math.round(x * 10);
  const b = Math.round(z * 10);
  return Math.abs(((a * 73856093) ^ (b * 19349663)) >>> 0);
}

function canAfford(materials, cost) {
  return Object.entries(cost).every(([name, amount]) => (materials[name] || 0) >= amount);
}

function formatCost(cost) {
  const order = ['Wood', 'Stone', 'Iron', 'Gold'];
  return order
    .filter((name) => cost[name] > 0)
    .map((name) => `${Math.floor(cost[name])}${name[0]}`)
    .join(' ');
}

export function createTradingSystem(scene, islandData, crateManager, instrumentRegistry) {
  const sceneNames = instrumentRegistry.getSceneNames();
  // ── Per-island state ──
  const islands = islandData.map((d, i) => ({
    x: d.x,
    z: d.z,
    r: d.r,
    group: d.group,
    barrierR: d.r + BARRIER_BUFFER,
    isTiny: d.r <= 22,
    type: ISLAND_TYPES[i % ISLAND_TYPES.length],
    sceneName: sceneNames[hashCoords(d.x, d.z) % sceneNames.length],
    level: 0,
    stored: 0, // accumulated materials
    priest: null,
    priestWalkOffset: Math.random() * Math.PI * 2,
  }));

  // ── Global materials inventory ──
  const materials = { Wood: 0, Stone: 0, Iron: 0, Gold: 0 };
  let lastBoatRef = null;

  // ── Barrier ring visuals ──
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  for (const isl of islands) {
    const inner = isl.barrierR - 1.5;
    const outer = isl.barrierR + 1.5;
    const ringGeo = new THREE.RingGeometry(inner, outer, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(isl.x, 0.3, isl.z);
    scene.add(ring);
  }

  // ── Build trading menu DOM ──
  const overlay = document.createElement('div');
  overlay.id = 'trade-overlay';
  overlay.className = 'trade-overlay trade-hidden';
  overlay.innerHTML = `
    <div class="trade-card">
      <div class="trade-encounter trade-panel-hidden">
        <div class="trade-encounter-stage">
          <div class="trade-encounter-portrait">
            <div class="trade-encounter-portrait-frame">
              <div class="trade-encounter-portrait-render"></div>
            </div>
            <div class="trade-encounter-speaker">Wandering Daoist</div>
          </div>
          <div class="trade-encounter-copy">
            <div class="trade-encounter-kicker">First Landing</div>
            <div class="trade-encounter-title">A priest waits on the shore</div>
            <div class="trade-encounter-island"></div>
            <div class="trade-encounter-dialogue"></div>
            <div class="trade-encounter-actions">
              <button class="trade-encounter-next">Continue</button>
            </div>
          </div>
        </div>
      </div>
      <div class="trade-header">
        <span class="trade-island-name"></span>
        <button class="trade-close">&times;</button>
      </div>
      <div class="trade-tabs">
        <button class="trade-tab active" data-tab="industry">Industry</button>
        <button class="trade-tab" data-tab="instruments">Instruments</button>
      </div>
      <div class="trade-panel trade-panel-industry">
      <div class="trade-type"></div>
      <div class="trade-level"></div>
      <div class="trade-production"></div>
      <div class="trade-action-row">
        <button class="trade-invest-btn">Invest</button>
        <span class="trade-cost"></span>
      </div>
      </div>
      <div class="trade-panel trade-panel-instruments trade-panel-hidden">
        <div class="trade-scene-name"></div>
        <div class="trade-instrument-list"></div>
      </div>
      <div class="trade-inventory"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elName = overlay.querySelector('.trade-island-name');
  const card = overlay.querySelector('.trade-card');
  const encounterPanel = overlay.querySelector('.trade-encounter');
  const encounterIslandEl = overlay.querySelector('.trade-encounter-island');
  const encounterDialogueEl = overlay.querySelector('.trade-encounter-dialogue');
  const encounterNextBtn = overlay.querySelector('.trade-encounter-next');
  const encounterPortraitEl = overlay.querySelector('.trade-encounter-portrait-render');
  const elType = overlay.querySelector('.trade-type');
  const elLevel = overlay.querySelector('.trade-level');
  const elProd = overlay.querySelector('.trade-production');
  const elBtn = overlay.querySelector('.trade-invest-btn');
  const elCost = overlay.querySelector('.trade-cost');
  const elInv = overlay.querySelector('.trade-inventory');
  const elClose = overlay.querySelector('.trade-close');
  const elTabs = [...overlay.querySelectorAll('.trade-tab')];
  const elPanelIndustry = overlay.querySelector('.trade-panel-industry');
  const elPanelInstruments = overlay.querySelector('.trade-panel-instruments');
  const elSceneName = overlay.querySelector('.trade-scene-name');
  const elInstList = overlay.querySelector('.trade-instrument-list');

  // ── Resource Tracker HUD ──
  const tracker = document.createElement('div');
  tracker.id = 'resource-tracker';
  tracker.className = 'resource-tracker';
  tracker.innerHTML = `
    <div class="rt-row rt-crates"><span class="rt-icon rt-icon-crate"></span><span class="rt-label">Crates</span><span class="rt-value" data-res="crates">0</span></div>
    <div class="rt-divider"></div>
    <div class="rt-row"><span class="rt-icon" style="background:#a67c52"></span><span class="rt-label">Wood</span><span class="rt-value" data-res="Wood">0</span><span class="rt-rate" data-rate="Wood"></span></div>
    <div class="rt-row"><span class="rt-icon" style="background:#8a8a8a"></span><span class="rt-label">Stone</span><span class="rt-value" data-res="Stone">0</span><span class="rt-rate" data-rate="Stone"></span></div>
    <div class="rt-row"><span class="rt-icon" style="background:#b07040"></span><span class="rt-label">Iron</span><span class="rt-value" data-res="Iron">0</span><span class="rt-rate" data-rate="Iron"></span></div>
    <div class="rt-row"><span class="rt-icon" style="background:#daa520"></span><span class="rt-label">Gold</span><span class="rt-value" data-res="Gold">0</span><span class="rt-rate" data-rate="Gold"></span></div>
    <div class="rt-divider"></div>
    <div class="rt-row rt-islands-row"><span class="rt-label">Islands</span><span class="rt-value" data-res="islands">0 / ${islands.length}</span></div>
    <div class="rt-divider"></div>
    <button class="rt-cheat-btn">∞ Resources</button>
  `;
  document.body.appendChild(tracker);

  tracker.querySelector('.rt-cheat-btn').addEventListener('click', () => {
    materials.Wood = 9999;
    materials.Stone = 9999;
    materials.Iron = 9999;
    materials.Gold = 9999;
    saveState();
    hudTimer = HUD_INTERVAL;
    refreshHud(0.01);
    if (menuOpen) refreshMenu();
  });

  let menuOpen = false;
  let activeIsland = null;
  let activeTab = 'industry';
  let metDaoistPriest = false;
  let encounterStep = 0;
  let encounterActive = false;

  // ── Persistence: materials + island development ──
  const STORAGE_KEY = 'oceanGang_trading_v1';
  let stateDirty = false;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.materials) {
        for (const name of Object.keys(materials)) {
          materials[name] = Number(data.materials[name]) || 0;
        }
      }
      if (data.islands) {
        for (const isl of islands) {
          const saved = data.islands[hashCoords(isl.x, isl.z)];
          if (!saved) continue;
          isl.level = Math.min(Math.max(saved.level | 0, 0), LEVELS.length - 1);
          isl.stored = Number(saved.stored) || 0;
        }
      }
    } catch (err) {
      console.warn('Failed to load trading state:', err);
    }
  }

  function saveState() {
    stateDirty = false;
    try {
      const islandState = {};
      for (const isl of islands) {
        if (isl.level > 0 || isl.stored >= 1) {
          islandState[hashCoords(isl.x, isl.z)] = { level: isl.level, stored: Math.floor(isl.stored) };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ materials, islands: islandState }));
    } catch (err) {
      console.warn('Failed to save trading state:', err);
    }
  }

  loadState();

  // ── Tab switching ──
  function setActiveTab(tab) {
    activeTab = tab;
    for (const btn of elTabs) btn.classList.toggle('active', btn.dataset.tab === tab);
    elPanelIndustry.classList.toggle('trade-panel-hidden', tab !== 'industry');
    elPanelInstruments.classList.toggle('trade-panel-hidden', tab !== 'instruments');
    refreshMenu();
  }

  for (const btn of elTabs) {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  }

  const priestPreviewScene = new THREE.Scene();
  const priestPreviewCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  priestPreviewCamera.position.set(0, 1.8, 7.4);
  const priestPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  priestPreviewRenderer.setPixelRatio(window.devicePixelRatio);
  priestPreviewRenderer.setSize(280, 360);
  Object.assign(priestPreviewRenderer.domElement.style, {
    width: '100%',
    height: '100%',
    display: 'block',
  });
  encounterPortraitEl.appendChild(priestPreviewRenderer.domElement);

  priestPreviewScene.add(new THREE.AmbientLight(0xe9dcc4, 1.8));
  const priestKey = new THREE.DirectionalLight(0xfff3dd, 2.2);
  priestKey.position.set(3, 5, 4);
  priestPreviewScene.add(priestKey);
  const priestRim = new THREE.DirectionalLight(0x7fc2ff, 1.3);
  priestRim.position.set(-3, 2, -2);
  priestPreviewScene.add(priestRim);
  const priestStand = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.2, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0x24140d, roughness: 0.92, metalness: 0.05 })
  );
  priestStand.position.y = -1.25;
  priestPreviewScene.add(priestStand);
  const priestPreviewModel = createDaoistPriest();
  priestPreviewModel.position.y = -1.1;
  priestPreviewScene.add(priestPreviewModel);

  // ── Block game input when menu is open ──
  overlay.addEventListener('keydown', e => e.stopPropagation());
  overlay.addEventListener('keyup', e => e.stopPropagation());
  overlay.addEventListener('mousedown', e => e.stopPropagation());
  overlay.addEventListener('wheel', e => e.stopPropagation());

  function ensurePriestForIsland(isl) {
    if (isl.priest) return;
    const priest = createDaoistPriest();
    priest.scale.setScalar(1.45);
    const host = isl.group || scene;
    host.add(priest);
    isl.priest = priest;
  }

  function setEncounterState(active) {
    encounterActive = active;
    overlay.classList.toggle('trade-overlay-encounter', active);
    encounterPanel.classList.toggle('trade-panel-hidden', !active);
  }

  function refreshEncounter() {
    if (!activeIsland) return;
    encounterIslandEl.textContent = `${activeIsland.type.name} Isle`;
    encounterDialogueEl.textContent = DAOIST_PRIEST_LINES[encounterStep];
    encounterNextBtn.textContent = encounterStep < DAOIST_PRIEST_LINES.length - 1 ? 'Continue' : 'Open Harbor Ledger';
  }

  function openMenu(isl) {
    activeIsland = isl;
    menuOpen = true;
    setActiveTab('industry');
    overlay.classList.remove('trade-hidden');
    const shouldMeetPriest = !metDaoistPriest && !isl.isTiny;
    setEncounterState(shouldMeetPriest);
    if (shouldMeetPriest) {
      ensurePriestForIsland(isl);
      encounterStep = 0;
      refreshEncounter();
    }
    refreshMenu();
  }

  function closeMenu() {
    menuOpen = false;
    activeIsland = null;
    setEncounterState(false);
    card.classList.remove('trade-card-cinematic');
    overlay.classList.add('trade-hidden');
  }

  elClose.addEventListener('click', closeMenu);
  window.addEventListener('keydown', (e) => {
    if (menuOpen && e.code === 'Escape') closeMenu();
  });

  elBtn.addEventListener('click', () => {
    if (!activeIsland) return;
    const nextLevel = activeIsland.level + 1;
    if (nextLevel >= LEVELS.length) return;
    const cost = LEVELS[nextLevel].cost;
    if (crateManager.spendCrates(cost)) {
      activeIsland.level = nextLevel;
      saveState();
      refreshMenu();
    }
  });

  encounterNextBtn.addEventListener('click', () => {
    if (!encounterActive) return;
    if (encounterStep < DAOIST_PRIEST_LINES.length - 1) {
      encounterStep++;
      refreshEncounter();
      return;
    }
    metDaoistPriest = true;
    setEncounterState(false);
    refreshMenu();
  });

  // ── Instruments tab: buy scene layers with materials, swap sounds ──
  function buildSoundOptionsHtml(currentSynth) {
    const groups = {};
    for (const opt of SOUND_OPTIONS) {
      (groups[opt.group] ??= []).push(opt);
    }
    return Object.entries(groups).map(([group, opts]) =>
      `<optgroup label="${group}">${opts.map((o) =>
        `<option value="${o.value}"${o.value === currentSynth ? ' selected' : ''}>${o.label}</option>`
      ).join('')}</optgroup>`
    ).join('');
  }

  let instTabSignature = '';

  function refreshInstrumentsTab() {
    const isl = activeIsland;
    if (!isl) return;
    const sceneInstruments = instrumentRegistry.getScene(isl.sceneName);

    // Skip re-render (which would close an open dropdown) unless something changed
    const signature = [isl.sceneName, ...sceneInstruments.map((inst) =>
      `${inst.varName}:${inst.synthType}:${instrumentRegistry.isUnlocked(isl.sceneName, inst.varName) ? 1 : 0}:${canAfford(materials, inst.cost) ? 1 : 0}`
    )].join('|');
    if (signature === instTabSignature) return;
    instTabSignature = signature;

    elSceneName.textContent = `♪ ${isl.sceneName}`;

    elInstList.innerHTML = sceneInstruments.map((inst, index) => {
      const owned = instrumentRegistry.isUnlocked(isl.sceneName, inst.varName);
      const free = !Object.keys(inst.cost).length;

      let meta, action;
      if (owned) {
        meta = free ? 'Free — ambient base' : 'Owned';
        action = isSwappableSynth(inst.synthType)
          ? `<select class="trade-sound-select" data-var="${inst.varName}">${buildSoundOptionsHtml(inst.synthType)}</select>`
          : '';
      } else {
        const affordable = canAfford(materials, inst.cost);
        meta = formatCost(inst.cost);
        action = `<button class="trade-buy-btn" data-index="${index}"${affordable ? '' : ' disabled'}>Buy</button>`;
      }

      const blocked = !owned && !canAfford(materials, inst.cost);
      return `
        <div class="trade-instrument-row${blocked ? ' afford-blocked' : ''}">
          <div class="trade-instrument-copy">
            <div class="trade-instrument-name">${owned ? '✓' : '♪'} ${inst.displayName}</div>
            <div class="trade-instrument-meta">${meta}</div>
          </div>
          ${action}
        </div>`;
    }).join('');

    elInstList.querySelectorAll('.trade-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inst = sceneInstruments[Number(btn.dataset.index)];
        if (!inst || !canAfford(materials, inst.cost)) return;
        for (const [name, amount] of Object.entries(inst.cost)) {
          materials[name] -= amount;
        }
        instrumentRegistry.unlock(isl.sceneName, inst.varName);
        saveState();
        refreshMenu();
      });
    });

    elInstList.querySelectorAll('.trade-sound-select').forEach((select) => {
      select.addEventListener('change', () => {
        const newCode = applySoundSwap(instrumentRegistry.getSceneCode(isl.sceneName), select.dataset.var, select.value);
        instrumentRegistry.setSceneCode(isl.sceneName, newCode);
        document.dispatchEvent(new CustomEvent('oceangang:sound-swap', {
          detail: { sceneName: isl.sceneName, code: newCode },
        }));
      });
    });
  }

  function refreshMenu() {
    const isl = activeIsland;
    if (!isl) return;
    const lvl = LEVELS[isl.level];
    const nextLvl = isl.level + 1 < LEVELS.length ? LEVELS[isl.level + 1] : null;

    elName.textContent = isl.type.name;
    elName.style.color = isl.type.color;
    card.classList.toggle('trade-card-cinematic', encounterActive);
    elType.textContent = `Produces: ${isl.type.material}`;
    elLevel.textContent = lvl.label;
    elProd.textContent = isl.level > 0
      ? `+${lvl.rate} ${isl.type.material}/min  |  Stored: ${Math.floor(isl.stored)}`
      : 'Not yet producing';

    if (nextLvl) {
      elBtn.disabled = crateManager.getScore() < nextLvl.cost;
      elBtn.textContent = isl.level === 0 ? 'Build' : 'Upgrade';
      elCost.textContent = `${nextLvl.cost} crates  →  +${nextLvl.rate}/min`;
      elBtn.style.display = '';
      elCost.style.display = '';
    } else {
      elBtn.style.display = 'none';
      elCost.textContent = 'Max level';
    }

    if (activeTab === 'instruments') refreshInstrumentsTab();

    // Inventory
    elInv.innerHTML = Object.entries(materials)
      .map(([k, v]) => `<span class="mat-item"><b>${k}</b> ${Math.floor(v)}</span>`)
      .join('');
  }

  // Cache DOM refs once (avoid querySelector every frame)
  const hudEls = {
    crates: tracker.querySelector('[data-res="crates"]'),
    islands: tracker.querySelector('[data-res="islands"]'),
  };
  for (const mat of ['Wood', 'Stone', 'Iron', 'Gold']) {
    hudEls[mat] = tracker.querySelector(`[data-res="${mat}"]`);
    hudEls[mat + 'Rate'] = tracker.querySelector(`[data-rate="${mat}"]`);
  }

  let hudTimer = 0;
  const HUD_INTERVAL = 0.5; // seconds between DOM updates

  function refreshHud(delta) {
    hudTimer += delta;
    if (hudTimer < HUD_INTERVAL) return;
    hudTimer = 0;

    hudEls.crates.textContent = crateManager.getScore();

    let developed = 0;
    const rates = { Wood: 0, Stone: 0, Iron: 0, Gold: 0 };
    for (const isl of islands) {
      if (isl.level > 0) {
        developed++;
        rates[isl.type.material] += LEVELS[isl.level].rate;
      }
    }

    for (const mat of ['Wood', 'Stone', 'Iron', 'Gold']) {
      hudEls[mat].textContent = Math.floor(materials[mat]);
      hudEls[mat + 'Rate'].textContent = rates[mat] > 0 ? `+${rates[mat]}/m` : '';
    }

    hudEls.islands.textContent = `${developed} / ${islands.length}`;

    if (stateDirty) saveState();
  }

  // ── Per-frame update — collision + production ──
  function update(boat, delta, boatController, time = 0) {
    lastBoatRef = boat;

    for (const isl of islands) {
      if (!isl.priest) continue;
      const walkRadius = Math.min(Math.max(isl.r * 0.16, 6), 14);
      const walkAngle = time * 0.22 + isl.priestWalkOffset;
      const localX = Math.cos(walkAngle) * walkRadius;
      const localZ = Math.sin(walkAngle) * walkRadius * 0.72;
      const sampleHeight = isl.group?.userData?.sampleHeight;
      const y = sampleHeight ? sampleHeight(localX, localZ) : 3;
      const bob = Math.sin(time * 1.8 + isl.priestWalkOffset) * 0.05;
      isl.priest.position.set(localX, y + 0.12 + bob, localZ);
      isl.priest.rotation.y = walkAngle + Math.PI * 0.5;
      updateDaoistPriest(isl.priest, time + isl.priestWalkOffset, 1);
    }

    if (menuOpen) {
      priestPreviewModel.rotation.y = Math.sin(time * 0.55) * 0.28 - 0.35;
      updateDaoistPriest(priestPreviewModel, time, encounterActive ? 0.2 : 0);
      priestPreviewRenderer.render(priestPreviewScene, priestPreviewCamera);
    }

    // Production tick
    for (const isl of islands) {
      if (isl.level > 0) {
        const rate = LEVELS[isl.level].rate;
        isl.stored += (rate / 60) * delta;
      }
    }

    // Collision + barrier check
    let hitIsland = null;

    for (const isl of islands) {
      const dx = boat.position.x - isl.x;
      const dz = boat.position.z - isl.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Collect stored materials when very close
      if (isl.stored >= 1 && dist < isl.barrierR + 10) {
        const amount = Math.floor(isl.stored);
        materials[isl.type.material] += amount;
        isl.stored -= amount;
        stateDirty = true;
      }

      // Outer barrier ring — flag this island
      if (dist < isl.barrierR) {
        hitIsland = isl;
      }

      // Inner hard stop — prevent boat from reaching the actual island
      const innerR = isl.barrierR - INNER_BUFFER;
      if (dist < innerR) {
        const nx = dx / dist;
        const nz = dz / dist;
        boat.position.x = isl.x + nx * innerR;
        boat.position.z = isl.z + nz * innerR;
        boatController.stop();

        // Rotate boat sideways (tangent to island) so player can sail forward
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(boat.quaternion);
        const dot1 = fwd.x * (-nz) + fwd.z * nx;
        const dot2 = fwd.x * nz + fwd.z * (-nx);
        const tx = dot1 >= dot2 ? -nz : nz;
        const tz = dot1 >= dot2 ? nx : -nx;
        boat.rotation.y = Math.atan2(-tx, -tz);
      }
    }

    // Open menu when entering the ring
    if (hitIsland && !menuOpen) {
      openMenu(hitIsland);
      // Clear held keys + stop momentum so the boat doesn't drift out of the ring
      boatController.stop();
      for (const k in boatController.keys) delete boatController.keys[k];

      // Rotate boat sideways (tangent to island) so player faces along the coast
      const dx2 = boat.position.x - hitIsland.x;
      const dz2 = boat.position.z - hitIsland.z;
      const d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      const nx2 = dx2 / d2;
      const nz2 = dz2 / d2;
      const fwd2 = new THREE.Vector3(0, 0, -1).applyQuaternion(boat.quaternion);
      const dot1 = fwd2.x * (-nz2) + fwd2.z * nx2;
      const dot2 = fwd2.x * nz2 + fwd2.z * (-nx2);
      const tx = dot1 >= dot2 ? -nz2 : nz2;
      const tz = dot1 >= dot2 ? nx2 : -nx2;
      boat.rotation.y = Math.atan2(-tx, -tz);
    }

    // Auto-close menu when boat leaves the ring
    if (menuOpen && !hitIsland) {
      closeMenu();
    }

    // Refresh menu at same throttled rate as HUD
    if (menuOpen && hudTimer >= HUD_INTERVAL - 0.01) refreshMenu();

    refreshHud(delta);
  }

  return { update, materials, get isMenuOpen() { return menuOpen; } };
}
