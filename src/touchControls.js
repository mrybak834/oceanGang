// ── Mobile Touch D-Pad ──────────────────────────────────────────────────
// Injects virtual key presses into the boatController's `keys` object.
// Only shows on touch-capable devices.

export function createTouchControls(keys) {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;

  // ── D-Pad container (left side) ──
  const pad = document.createElement('div');
  Object.assign(pad.style, {
    position: 'fixed',
    bottom: '30px',
    left: '24px',
    width: '150px',
    height: '150px',
    zIndex: '300',
    pointerEvents: 'none',
    userSelect: 'none',
    touchAction: 'none',
  });
  document.body.appendChild(pad);

  // ── Action buttons (right side) ──
  const actions = document.createElement('div');
  Object.assign(actions.style, {
    position: 'fixed',
    bottom: '30px',
    right: '24px',
    zIndex: '300',
    pointerEvents: 'none',
    userSelect: 'none',
    touchAction: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'center',
  });
  document.body.appendChild(actions);

  const btnStyle = {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    touchAction: 'none',
    backdropFilter: 'blur(4px)',
  };

  // D-pad buttons: up, down, left, right
  const dpadButtons = [
    { label: '\u25B2', key: 'w', x: 47, y: 0 },    // up
    { label: '\u25BC', key: 's', x: 47, y: 94 },   // down
    { label: '\u25C0', key: 'a', x: 0, y: 47 },    // left
    { label: '\u25B6', key: 'd', x: 94, y: 47 },   // right
  ];

  for (const cfg of dpadButtons) {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      ...btnStyle,
      position: 'absolute',
      left: cfg.x + 'px',
      top: cfg.y + 'px',
    });
    btn.textContent = cfg.label;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      keys[cfg.key] = true;
      btn.style.background = 'rgba(255,255,255,0.35)';
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      keys[cfg.key] = false;
      btn.style.background = 'rgba(255,255,255,0.12)';
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      keys[cfg.key] = false;
      btn.style.background = 'rgba(255,255,255,0.12)';
    });

    pad.appendChild(btn);
  }

  // Action buttons: boost, jump
  const actionButtons = [
    { label: 'BOOST', key: 'shift' },
    { label: 'JUMP', key: ' ' },
  ];

  for (const cfg of actionButtons) {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      ...btnStyle,
      width: '64px',
      height: '64px',
      fontSize: '11px',
    });
    btn.textContent = cfg.label;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      keys[cfg.key] = true;
      btn.style.background = 'rgba(255,255,255,0.35)';
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      keys[cfg.key] = false;
      btn.style.background = 'rgba(255,255,255,0.12)';
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      keys[cfg.key] = false;
      btn.style.background = 'rgba(255,255,255,0.12)';
    });

    actions.appendChild(btn);
  }
}
