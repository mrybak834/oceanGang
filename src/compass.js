// ─── Nautical Compass HUD ───
// Faux-3D compass overlay with a live camera inset and integrated speed ring

export function createCompass() {
  const SIZE = 220;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const OUTER_R = 102;
  const BEZEL_R = 90;
  const TICK_R = 80;
  const VIEW_R = 62;
  const SPEED_START = Math.PI * 0.78;
  const SPEED_END = Math.PI * 2.22;
  const MAX_SPEED = 90;

  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    bottom: '22px',
    left: '22px',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    zIndex: '50',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.28))',
  });
  document.body.appendChild(root);

  const inset = document.createElement('div');
  Object.assign(inset.style, {
    position: 'absolute',
    left: `${CX - VIEW_R}px`,
    top: `${CY - VIEW_R}px`,
    width: `${VIEW_R * 2}px`,
    height: `${VIEW_R * 2}px`,
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#1f6379',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.14), inset 0 10px 20px rgba(255,255,255,0.12)',
    zIndex: '0',
  });
  root.appendChild(inset);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE * 2;
  canvas.height = SIZE * 2;
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    pointerEvents: 'none',
    zIndex: '1',
  });
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const gctx = grainCanvas.getContext('2d');
  gctx.fillStyle = '#59361c';
  gctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 256;
    gctx.strokeStyle = `rgba(${35 + Math.random() * 20}, ${18 + Math.random() * 10}, ${8 + Math.random() * 6}, ${0.12 + Math.random() * 0.22})`;
    gctx.lineWidth = 0.7 + Math.random() * 1.7;
    gctx.beginPath();
    gctx.moveTo(0, y);
    for (let x = 0; x < 256; x += 6) {
      gctx.lineTo(x, y + Math.sin(x * 0.028 + i * 0.7) * (2 + Math.random() * 2));
    }
    gctx.stroke();
  }
  const woodPattern = ctx.createPattern(grainCanvas, 'repeat');

  function draw(heading, speed, boostAmount) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    drawBaseShadow();
    drawOuterBezel();
    drawSpeedRing(speed, boostAmount);
    drawCompassRing();
    drawLabels();
    punchInsetHole();
    drawInsetTrim();
    drawGlass();
    drawReadout(speed);
  }

  function drawBaseShadow() {
    const shadowGrad = ctx.createRadialGradient(CX, CY + 26, OUTER_R * 0.25, CX, CY + 26, OUTER_R * 1.08);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.24)');
    shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(CX, CY + 10, OUTER_R + 10, 0, Math.PI * 2);
    ctx.fillStyle = shadowGrad;
    ctx.fill();
  }

  function drawOuterBezel() {
    ctx.save();

    const rimGrad = ctx.createLinearGradient(CX, CY - OUTER_R, CX, CY + OUTER_R);
    rimGrad.addColorStop(0, '#8e6338');
    rimGrad.addColorStop(0.22, '#5f3c1f');
    rimGrad.addColorStop(0.58, '#3e2412');
    rimGrad.addColorStop(1, '#9d7244');
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    ctx.arc(CX, CY, BEZEL_R + 8, 0, Math.PI * 2, true);
    ctx.fillStyle = rimGrad;
    ctx.fill('evenodd');

    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R - 8, 0, Math.PI * 2);
    ctx.arc(CX, CY, BEZEL_R + 6, 0, Math.PI * 2, true);
    ctx.fillStyle = woodPattern;
    ctx.fill('evenodd');

    const brassEdge = ctx.createLinearGradient(CX - OUTER_R, CY - OUTER_R, CX + OUTER_R, CY + OUTER_R);
    brassEdge.addColorStop(0, 'rgba(255,224,170,0.65)');
    brassEdge.addColorStop(0.2, 'rgba(170,115,48,0.15)');
    brassEdge.addColorStop(0.5, 'rgba(92,56,18,0.55)');
    brassEdge.addColorStop(1, 'rgba(245,202,120,0.45)');
    ctx.lineWidth = 3;
    ctx.strokeStyle = brassEdge;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R - 2, 0, Math.PI * 2);
    ctx.stroke();

    const insetShadow = ctx.createRadialGradient(CX, CY, BEZEL_R - 8, CX, CY, OUTER_R);
    insetShadow.addColorStop(0, 'rgba(0,0,0,0)');
    insetShadow.addColorStop(0.75, 'rgba(0,0,0,0.12)');
    insetShadow.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.lineWidth = 16;
    ctx.strokeStyle = insetShadow;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R - 8, 0, Math.PI * 2);
    ctx.stroke();

    const nailAngles = [0.1, 1.15, 2.2, 3.18, 4.3, 5.35];
    for (const angle of nailAngles) {
      const nx = CX + Math.cos(angle) * (OUTER_R - 10);
      const ny = CY + Math.sin(angle) * (OUTER_R - 10);
      const pinGrad = ctx.createRadialGradient(nx - 1, ny - 1, 0, nx, ny, 5);
      pinGrad.addColorStop(0, '#f0cb72');
      pinGrad.addColorStop(0.5, '#9e7128');
      pinGrad.addColorStop(1, '#4a2e12');
      ctx.beginPath();
      ctx.arc(nx, ny, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = pinGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSpeedRing(speed, boostAmount) {
    const speedPct = Math.min(Math.abs(speed) / MAX_SPEED, 1);

    ctx.save();
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(CX, CY, 84, SPEED_START, SPEED_END);
    ctx.lineWidth = 13;
    ctx.strokeStyle = 'rgba(10,18,25,0.55)';
    ctx.stroke();

    const fillGrad = ctx.createLinearGradient(CX - 84, CY - 84, CX + 84, CY + 84);
    if (boostAmount > 0.3) {
      fillGrad.addColorStop(0, '#ffb14f');
      fillGrad.addColorStop(0.45, '#ff7135');
      fillGrad.addColorStop(1, '#ff3b2f');
    } else {
      fillGrad.addColorStop(0, '#d6c26f');
      fillGrad.addColorStop(0.45, '#4aa96c');
      fillGrad.addColorStop(1, '#1c87a6');
    }

    ctx.beginPath();
    ctx.arc(CX, CY, 84, SPEED_START, SPEED_START + (SPEED_END - SPEED_START) * speedPct);
    ctx.lineWidth = 9;
    ctx.strokeStyle = fillGrad;
    ctx.shadowColor = boostAmount > 0.3 ? 'rgba(255,90,40,0.4)' : 'rgba(96,200,160,0.25)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = SPEED_START + (SPEED_END - SPEED_START) * t;
      const major = i % 2 === 0;
      const r1 = major ? 71 : 74;
      const r2 = 80;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(angle) * r1, CY + Math.sin(angle) * r1);
      ctx.lineTo(CX + Math.cos(angle) * r2, CY + Math.sin(angle) * r2);
      ctx.lineWidth = major ? 2.2 : 1.1;
      ctx.strokeStyle = major ? 'rgba(244,212,155,0.75)' : 'rgba(244,212,155,0.38)';
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCompassRing() {
    ctx.save();

    const ringGrad = ctx.createLinearGradient(CX, CY - BEZEL_R, CX, CY + BEZEL_R);
    ringGrad.addColorStop(0, '#f7e9c7');
    ringGrad.addColorStop(0.55, '#dbc18c');
    ringGrad.addColorStop(1, '#a88856');
    ctx.beginPath();
    ctx.arc(CX, CY, BEZEL_R, 0, Math.PI * 2);
    ctx.arc(CX, CY, VIEW_R + 14, 0, Math.PI * 2, true);
    ctx.fillStyle = ringGrad;
    ctx.fill('evenodd');

    for (let d = 0; d < 360; d += 5) {
      const rad = (d * Math.PI) / 180 - Math.PI / 2;
      const isMajor = d % 30 === 0;
      const isCardinal = d % 90 === 0;
      const tickLen = isCardinal ? 11 : isMajor ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(rad) * (TICK_R - tickLen), CY + Math.sin(rad) * (TICK_R - tickLen));
      ctx.lineTo(CX + Math.cos(rad) * TICK_R, CY + Math.sin(rad) * TICK_R);
      ctx.lineWidth = isCardinal ? 2.4 : isMajor ? 1.3 : 0.7;
      ctx.strokeStyle = isCardinal ? '#50381d' : 'rgba(80,56,29,0.58)';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(CX, CY, VIEW_R + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(88,59,27,0.78)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CX, CY, VIEW_R + 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,205,142,0.48)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  function drawLabels() {
    const cardinals = [
      { letter: 'N', angle: -Math.PI / 2, color: '#9b2418' },
      { letter: 'E', angle: 0, color: '#4b351d' },
      { letter: 'S', angle: Math.PI / 2, color: '#4b351d' },
      { letter: 'W', angle: Math.PI, color: '#4b351d' },
    ];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 20px 'Cinzel', Georgia, serif";
    for (const c of cardinals) {
      const dist = 64;
      const x = CX + Math.cos(c.angle) * dist;
      const y = CY + Math.sin(c.angle) * dist;
      ctx.fillStyle = c.color;
      ctx.shadowColor = 'rgba(255,240,210,0.35)';
      ctx.shadowBlur = 3;
      ctx.fillText(c.letter, x, y);
    }

    ctx.shadowBlur = 0;
    ctx.font = "bold 11px 'Cinzel', Georgia, serif";
    ctx.fillStyle = 'rgba(88,59,27,0.72)';
    ctx.fillText('SPD', CX, CY + 87);
    ctx.restore();
  }

  function punchInsetHole() {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(CX, CY, VIEW_R + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawInsetTrim() {
    const trimGrad = ctx.createLinearGradient(CX, CY - VIEW_R, CX, CY + VIEW_R);
    trimGrad.addColorStop(0, 'rgba(255,255,255,0.24)');
    trimGrad.addColorStop(0.5, 'rgba(120,190,220,0.08)');
    trimGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(CX, CY, VIEW_R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = trimGrad;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function drawGlass() {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(CX - 26, CY - 30, 34, 14, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(CX + 12, CY + 18, 66, 48, 0.35, 0, Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawReadout(speed) {
    const readoutW = 54;
    const readoutH = 24;
    const x = CX - readoutW / 2;
    const y = CY + 72;

    roundRect(ctx, x, y, readoutW, readoutH, 8);
    const plateGrad = ctx.createLinearGradient(x, y, x, y + readoutH);
    plateGrad.addColorStop(0, 'rgba(46,27,12,0.9)');
    plateGrad.addColorStop(1, 'rgba(18,10,4,0.95)');
    ctx.fillStyle = plateGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,185,110,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.font = "bold 14px 'Cinzel', Georgia, serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3d98b';
    ctx.fillText(Math.round(Math.abs(speed)).toString(), CX, y + readoutH / 2 + 1);
    ctx.restore();
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  return {
    insetElement: inset,
    insetSize: VIEW_R * 2,
    update(boat, boatController) {
      draw(boat.rotation.y, boatController.velocity.forward, boatController.boostAmount);
    },
  };
}
