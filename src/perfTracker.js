// ─── Performance Tracker — toggle with P ───

export function createPerfTracker(renderer) {
  // Timing state
  let fps = 60;
  let frameTime = 16.67;
  let framesThisSecond = 0;
  let lastFpsUpdate = performance.now();
  let frameBeginTime = 0;

  const FPS_ALPHA = 0.25;
  const FT_ALPHA = 0.1;

  // GPU info (one-time)
  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugExt
    ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
    : 'Unknown';

  // Build DOM
  const panel = document.createElement('div');
  panel.id = 'perf-panel';
  panel.className = 'perf-panel perf-hidden';
  panel.innerHTML = `
    <div class="perf-title">Performance <span class="perf-hint">P to close</span></div>
    <div class="perf-grid">
      <span class="perf-label">FPS</span><span class="perf-val" id="perf-fps">--</span>
      <span class="perf-label">Frame</span><span class="perf-val" id="perf-ft">--</span>
      <span class="perf-label">Draw calls</span><span class="perf-val" id="perf-dc">--</span>
      <span class="perf-label">Triangles</span><span class="perf-val" id="perf-tri">--</span>
      <span class="perf-label">Geometries</span><span class="perf-val" id="perf-geo">--</span>
      <span class="perf-label">Textures</span><span class="perf-val" id="perf-tex">--</span>
      <span class="perf-label">Programs</span><span class="perf-val" id="perf-prog">--</span>
      ${performance.memory ? '<span class="perf-label">JS Heap</span><span class="perf-val" id="perf-mem">--</span>' : ''}
      <span class="perf-label">GPU</span><span class="perf-val perf-gpu" id="perf-gpu">--</span>
    </div>
  `;
  document.body.appendChild(panel);

  // Cache refs
  const elFps = panel.querySelector('#perf-fps');
  const elFt = panel.querySelector('#perf-ft');
  const elDc = panel.querySelector('#perf-dc');
  const elTri = panel.querySelector('#perf-tri');
  const elGeo = panel.querySelector('#perf-geo');
  const elTex = panel.querySelector('#perf-tex');
  const elProg = panel.querySelector('#perf-prog');
  const elMem = panel.querySelector('#perf-mem');
  const elGpu = panel.querySelector('#perf-gpu');

  if (elGpu) elGpu.textContent = gpuName;

  // Toggle
  let visible = false;
  let displayTimer = 0;
  const DISPLAY_INTERVAL = 0.25; // seconds

  panel.addEventListener('keydown', e => e.stopPropagation());
  panel.addEventListener('keyup', e => e.stopPropagation());
  panel.addEventListener('mousedown', e => e.stopPropagation());

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('#perf-panel') || e.target.closest('#music-panel')) return;
    if (e.code === 'KeyP' && !e.repeat) {
      visible = !visible;
      panel.classList.toggle('perf-hidden', !visible);
    }
  });

  function begin() {
    frameBeginTime = performance.now();
  }

  function end(delta) {
    const now = performance.now();
    const rawFt = now - frameBeginTime;

    // EMA smoothing
    frameTime = FT_ALPHA * rawFt + (1 - FT_ALPHA) * frameTime;

    framesThisSecond++;
    if (now > lastFpsUpdate + 1000) {
      fps = FPS_ALPHA * framesThisSecond + (1 - FPS_ALPHA) * fps;
      lastFpsUpdate = now;
      framesThisSecond = 0;
    }

    // Throttled DOM update
    if (!visible) return;
    displayTimer += delta;
    if (displayTimer < DISPLAY_INTERVAL) return;
    displayTimer = 0;

    const info = renderer.info;
    elFps.textContent = Math.round(fps);
    elFt.textContent = frameTime.toFixed(1) + ' ms';
    elDc.textContent = info.render.calls;
    elTri.textContent = formatNum(info.render.triangles);
    elGeo.textContent = info.memory.geometries;
    elTex.textContent = info.memory.textures;
    elProg.textContent = info.programs ? info.programs.length : 0;
    if (elMem && performance.memory) {
      elMem.textContent = (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB';
    }
  }

  return { begin, end };
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}
