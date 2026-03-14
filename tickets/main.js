// ── Data ──

let issues = [];
let byNumber = {};

async function loadData() {
  const res = await fetch('./data.json');
  issues = await res.json();
  byNumber = Object.fromEntries(issues.map(i => [i.number, i]));
}

// ── Config ──

const epicColors = {
  9: '#7c3aed', 10: '#16a34a', 11: '#dc2626', 12: '#2563eb', 2: '#ea580c',
};

const epicBgs = {
  9: 'rgba(124, 58, 237, 0.07)',
  10: 'rgba(22, 163, 74, 0.07)',
  11: 'rgba(220, 38, 38, 0.07)',
  12: 'rgba(37, 99, 235, 0.07)',
  2: 'rgba(234, 88, 12, 0.07)',
};

const epicLabels = {
  9: 'Instruments', 10: 'Songs', 11: 'Cultural Worlds',
  12: 'Story', 2: 'Design Mode',
};

const epicTickets = {
  9: [13, 14, 15, 16, 17, 18, 19, 25, 38, 39],
  10: [20, 21, 22, 23, 24],
  11: [26, 27, 28, 29],
  12: [30, 31, 32, 33, 34, 35, 36, 37],
  2: [3, 4, 5, 6, 7, 8],
};

const ticketEpic = {};
for (const [epic, tickets] of Object.entries(epicTickets)) {
  for (const t of tickets) ticketEpic[t] = parseInt(epic);
}

// ── Dependencies (including cross-epic) ──

const hardDeps = {
  // Instruments epic
  14: [13], 16: [15], 17: [16], 18: [14], 19: [18],
  38: [14], 39: [14, 16],
  // Songs epic
  21: [20, 27], 23: [20],
  // Cultural Worlds epic
  27: [26], 28: [29],
  // Story epic
  34: [33],
  // Design Mode epic
  6: [5], 8: [3, 6, 7],
};

// Instruments → Songs / Cultural Worlds form the core dependency chain
// Story and Design Mode are independent

// "Core chain" epics: tickets that form the main dependency DAG
const coreEpics = [9, 10, 11];
// "Anytime" epics: fully independent, can work on whenever
const anytimeEpics = [12, 2];

function computeDepth(num, memo = {}) {
  if (memo[num] !== undefined) return memo[num];
  const deps = hardDeps[num] || [];
  if (deps.length === 0) { memo[num] = 0; return 0; }
  memo[num] = 1 + Math.max(...deps.map(d => computeDepth(d, memo)));
  return memo[num];
}

// ── Helpers ──

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function closeExpanded() {
  document.querySelectorAll('.card.expanded, .epic-card.expanded').forEach(c => c.classList.remove('expanded'));
  document.querySelector('.backdrop')?.remove();
}

function showBackdrop() {
  if (document.querySelector('.backdrop')) return;
  const b = document.createElement('div');
  b.className = 'backdrop';
  b.addEventListener('click', closeExpanded);
  document.body.appendChild(b);
}

function scrollToCard(num) {
  const t = document.querySelector(`.card[data-issue="${num}"]`);
  if (!t) return;
  closeExpanded();
  t.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  t.classList.add('highlighted');
  setTimeout(() => t.classList.remove('highlighted'), 1500);
}

// ── Render: unified DAG ticket view ──

function renderTickets() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // Compute depths for ALL tickets
  const memo = {};
  const allTickets = Object.values(epicTickets).flat();
  for (const t of allTickets) computeDepth(t, memo);

  // ── Core chain section: Instruments → Songs → Cultural Worlds ──
  const coreLabel = document.createElement('div');
  coreLabel.className = 'section-label';
  coreLabel.textContent = 'Core chain — read left → right, same column = parallel';
  board.appendChild(coreLabel);

  const coreDag = document.createElement('div');
  coreDag.className = 'dag';

  // Gather all core tickets and find max depth
  const coreTicketList = coreEpics.flatMap(e => epicTickets[e]);
  const maxDepth = Math.max(...coreTicketList.map(t => memo[t] || 0), 0);
  const numCols = maxDepth + 1;

  // Set up CSS grid: rows = epics, cols = depth levels
  coreDag.style.gridTemplateColumns = `repeat(${numCols}, minmax(230px, 1fr))`;
  coreDag.style.gridTemplateRows = `repeat(${coreEpics.length}, auto)`;

  // Render cells: one per epic × depth
  for (let ei = 0; ei < coreEpics.length; ei++) {
    const epicNum = coreEpics[ei];
    const color = epicColors[epicNum];

    for (let d = 0; d <= maxDepth; d++) {
      const tickets = epicTickets[epicNum].filter(t => (memo[t] || 0) === d);

      const cell = document.createElement('div');
      cell.className = 'dag-cell' + (tickets.length > 0 ? ' has-cards' : '');
      cell.style.gridRow = `${ei + 1}`;
      cell.style.gridColumn = `${d + 1}`;
      cell.style.background = tickets.length > 0 ? epicBgs[epicNum] : 'transparent';

      if (tickets.length > 0) {
        const label = document.createElement('div');
        label.className = 'dag-cell-label';
        label.style.color = color;
        label.textContent = epicLabels[epicNum];
        cell.appendChild(label);

        for (const tNum of tickets) {
          const issue = byNumber[tNum];
          if (!issue) continue;
          cell.appendChild(createCard(issue, color));
        }
      }

      coreDag.appendChild(cell);
    }
  }

  board.appendChild(coreDag);

  // ── Anytime section: Story + Design Mode ──
  const anyLabel = document.createElement('div');
  anyLabel.className = 'section-label';
  anyLabel.textContent = 'Independent — can work on anytime, in parallel with everything above';
  board.appendChild(anyLabel);

  const anySection = document.createElement('div');
  anySection.className = 'anytime-section';

  for (const epicNum of anytimeEpics) {
    const color = epicColors[epicNum];
    const tickets = epicTickets[epicNum];

    const group = document.createElement('div');
    group.className = 'anytime-group';
    group.style.background = epicBgs[epicNum];
    group.style.borderColor = color + '20';

    group.innerHTML = `
      <div class="anytime-group-header">
        <span class="anytime-group-title" style="color:${color}">${epicLabels[epicNum]}</span>
        <span class="anytime-group-badge">${tickets.length} tickets · no blockers</span>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'anytime-group-body';

    // Sort by internal dep depth
    const sorted = [...tickets].sort((a, b) => (memo[a] || 0) - (memo[b] || 0));
    for (const tNum of sorted) {
      const issue = byNumber[tNum];
      if (!issue) continue;
      body.appendChild(createCard(issue, color));
    }

    group.appendChild(body);
    anySection.appendChild(group);
  }

  board.appendChild(anySection);

  // Draw arrows after DOM settles
  requestAnimationFrame(() => requestAnimationFrame(drawArrows));
}

// ── Card ──

function createCard(issue, epicColor) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.borderLeftColor = epicColor;
  card.dataset.issue = issue.number;

  const proxyUrl = `/__github_proxy?url=${encodeURIComponent(issue.html_url)}`;

  card.innerHTML = `
    <div class="card-num">#${issue.number}</div>
    <div class="card-title">${escHtml(issue.title)}</div>
    <div class="card-expand">
      <iframe class="gh-iframe" data-src="${proxyUrl}"></iframe>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.tagName === 'IFRAME' || e.target.classList.contains('dep-pill')) return;
    const was = card.classList.contains('expanded');
    closeExpanded();
    if (!was) {
      card.classList.add('expanded');
      showBackdrop();
      const iframe = card.querySelector('.gh-iframe');
      if (iframe && !iframe.src) iframe.src = iframe.dataset.src;
    }
  });

  return card;
}

// ── Draw SVG arrows between cards ──

function drawArrows() {
  const svg = document.getElementById('arrows');
  if (!svg) return;
  svg.innerHTML = '';

  const wrapper = document.getElementById('board-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();
  svg.style.width = wrapper.scrollWidth + 'px';
  svg.style.height = wrapper.scrollHeight + 'px';
  svg.setAttribute('viewBox', `0 0 ${wrapper.scrollWidth} ${wrapper.scrollHeight}`);

  // Build card element lookup
  const cardEls = {};
  document.querySelectorAll('.card[data-issue]').forEach(el => {
    cardEls[el.dataset.issue] = el;
  });

  for (const [numStr, deps] of Object.entries(hardDeps)) {
    const toEl = cardEls[numStr];
    if (!toEl) continue;
    const toNum = parseInt(numStr);

    for (const depNum of deps) {
      const fromEl = cardEls[depNum];
      if (!fromEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Coordinates relative to wrapper
      const fx = fromRect.right - wrapperRect.left;
      const fy = fromRect.top + fromRect.height / 2 - wrapperRect.top;
      const tx = toRect.left - wrapperRect.left;
      const ty = toRect.top + toRect.height / 2 - wrapperRect.top;

      const isCross = ticketEpic[depNum] !== ticketEpic[toNum];
      const cls = isCross ? ' cross-epic' : '';

      // Bezier curve
      const dx = Math.abs(tx - fx);
      const cpx = Math.max(30, dx * 0.4);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${fx},${fy} C${fx + cpx},${fy} ${tx - cpx},${ty} ${tx},${ty}`);
      path.setAttribute('class', 'arrow-line' + cls);
      svg.appendChild(path);

      // Arrowhead
      const angle = Math.atan2(ty - fy, tx - fx);
      const hl = 7;
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const p1 = `${tx},${ty}`;
      const p2 = `${tx - hl * Math.cos(angle - 0.35)},${ty - hl * Math.sin(angle - 0.35)}`;
      const p3 = `${tx - hl * Math.cos(angle + 0.35)},${ty - hl * Math.sin(angle + 0.35)}`;
      head.setAttribute('points', `${p1} ${p2} ${p3}`);
      head.setAttribute('class', 'arrow-head' + cls);
      svg.appendChild(head);
    }
  }
}

// ── Epic view ──

function renderEpics() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const svg = document.getElementById('arrows');
  if (svg) svg.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'epic-list';

  const epicDescs = {
    9: 'Core mechanic — instruments are tradable, visual, musical, and gameplay-affecting objects. Parser + registry already built. This is the foundation that Songs and Cultural Worlds depend on.',
    10: 'Songs unlock as you explore. Cross-cultural swapping, variations as gameplay, player creation. Depends on Instruments gating system.',
    11: 'Continents as distinct cultural regions with unique instruments, NPCs, and interactions. Depends on Instruments 3D models and world map.',
    12: 'Detective story: True Osmodius sailing the world, finding clues to Chinese John. Colonialism allegory. Fully independent — can be worked on anytime.',
    2: 'Full object editing, creation, and composition in the game world. Fully independent — can be worked on anytime.',
  };

  const crossEpicDeps = {
    10: [{ from: 11, desc: 'Cross-cultural swapping needs culture-specific instruments (#27)' }],
    11: [],
  };

  for (const epicNum of [9, 10, 11, 12, 2]) {
    const issue = byNumber[epicNum];
    if (!issue) continue;
    const color = epicColors[epicNum];
    const tickets = epicTickets[epicNum];
    const crossDeps = crossEpicDeps[epicNum] || [];
    const crossHtml = crossDeps.map(d =>
      `<span class="cross-dep-label">Depends on ${epicLabels[d.from]}: ${d.desc}</span>`
    ).join('');

    const proxyUrl = `/__github_proxy?url=${encodeURIComponent(issue.html_url)}`;
    const card = document.createElement('div');
    card.className = 'epic-card';
    card.style.borderLeftColor = color;

    card.innerHTML = `
      <div class="epic-card-header">
        <span class="epic-card-title" style="color:${color}">${epicLabels[epicNum]}</span>
        <span class="epic-card-badge">${tickets.length} tickets</span>
        <span class="epic-card-badge">#${epicNum}</span>
      </div>
      <div class="epic-card-desc">${epicDescs[epicNum]}</div>
      ${crossHtml ? `<div class="epic-cross-deps">${crossHtml}</div>` : ''}
      <div class="epic-card-expand">
        <iframe class="gh-iframe" data-src="${proxyUrl}"></iframe>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.tagName === 'IFRAME') return;
      const was = card.classList.contains('expanded');
      closeExpanded();
      if (!was) {
        card.classList.add('expanded');
        showBackdrop();
        const iframe = card.querySelector('.gh-iframe');
        if (iframe && !iframe.src) iframe.src = iframe.dataset.src;
      }
    });

    list.appendChild(card);
  }

  board.appendChild(list);
}

// ── View switching ──

function setupViewSwitcher() {
  document.getElementById('view-epics').addEventListener('click', () => {
    document.getElementById('view-epics').classList.add('active');
    document.getElementById('view-tickets').classList.remove('active');
    renderEpics();
  });
  document.getElementById('view-tickets').addEventListener('click', () => {
    document.getElementById('view-tickets').classList.add('active');
    document.getElementById('view-epics').classList.remove('active');
    renderTickets();
  });
}

// ── Init ──

async function init() {
  await loadData();
  setupViewSwitcher();
  renderEpics();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExpanded(); });
  window.addEventListener('resize', () => requestAnimationFrame(drawArrows));
}

init();
