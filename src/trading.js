import * as THREE from 'three';

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

export function createTradingSystem(scene, islandData, crateManager) {
  // ── Per-island state ──
  const islands = islandData.map((d, i) => ({
    x: d.x,
    z: d.z,
    r: d.r,
    barrierR: d.r + BARRIER_BUFFER,
    type: ISLAND_TYPES[i % ISLAND_TYPES.length],
    level: 0,
    stored: 0, // accumulated materials
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
      <div class="trade-header">
        <span class="trade-island-name"></span>
        <button class="trade-close">&times;</button>
      </div>
      <div class="trade-type"></div>
      <div class="trade-level"></div>
      <div class="trade-production"></div>
      <div class="trade-action-row">
        <button class="trade-invest-btn">Invest</button>
        <span class="trade-cost"></span>
      </div>
      <div class="trade-inventory"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elName = overlay.querySelector('.trade-island-name');
  const elType = overlay.querySelector('.trade-type');
  const elLevel = overlay.querySelector('.trade-level');
  const elProd = overlay.querySelector('.trade-production');
  const elBtn = overlay.querySelector('.trade-invest-btn');
  const elCost = overlay.querySelector('.trade-cost');
  const elInv = overlay.querySelector('.trade-inventory');
  const elClose = overlay.querySelector('.trade-close');

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
  `;
  document.body.appendChild(tracker);

  let menuOpen = false;
  let activeIsland = null;
  let tradeCooldown = 0; // prevents instant reopen after close

  // ── Block game input when menu is open ──
  overlay.addEventListener('keydown', e => e.stopPropagation());
  overlay.addEventListener('keyup', e => e.stopPropagation());
  overlay.addEventListener('mousedown', e => e.stopPropagation());
  overlay.addEventListener('wheel', e => e.stopPropagation());

  function openMenu(isl) {
    if (tradeCooldown > 0) return;
    activeIsland = isl;
    menuOpen = true;
    overlay.classList.remove('trade-hidden');
    refreshMenu();
  }

  function closeMenu() {
    menuOpen = false;
    activeIsland = null;
    overlay.classList.add('trade-hidden');
    tradeCooldown = 0.5;
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
      refreshMenu();
    }
  });

  function refreshMenu() {
    const isl = activeIsland;
    if (!isl) return;
    const lvl = LEVELS[isl.level];
    const nextLvl = isl.level + 1 < LEVELS.length ? LEVELS[isl.level + 1] : null;

    elName.textContent = isl.type.name;
    elName.style.color = isl.type.color;
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
  }

  // ── Per-frame update — collision + production ──
  function update(boat, delta, boatController) {
    lastBoatRef = boat;
    // Tick cooldown
    if (tradeCooldown > 0) tradeCooldown -= delta;

    // Production tick
    for (const isl of islands) {
      if (isl.level > 0) {
        const rate = LEVELS[isl.level].rate;
        isl.stored += (rate / 60) * delta;
      }
    }

    // Collect stored materials when near a producing island
    // + collision / barrier check
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
      }

      // Outer barrier ring — open trading menu
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
      }
    }

    // Open menu when entering the ring
    if (hitIsland && !menuOpen) {
      openMenu(hitIsland);
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
