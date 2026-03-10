// ─── Performance Tracker + Profiler — toggle P, record with button ───

const RECORD_DURATION = 5; // seconds of recording

export function createPerfTracker(renderer) {
  // ── Timing state ──
  let fps = 60;
  let frameTime = 16.67;
  let framesThisSecond = 0;
  let lastFpsUpdate = performance.now();
  let frameBeginTime = 0;
  const FPS_ALPHA = 0.25;
  const FT_ALPHA = 0.1;

  // ── Subsystem timings (filled externally via markStart/markEnd) ──
  const subsystems = {};
  let currentMark = null;
  let currentMarkStart = 0;
  const subsystemSnapshot = {}; // reused object for display

  // ── GPU info ──
  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugExt
    ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
    : 'Unknown';

  // ── Recording state ──
  let recording = false;
  let recordStart = 0;
  let recordedFrames = [];

  // ── DOM ──
  const panel = document.createElement('div');
  panel.id = 'perf-panel';
  panel.className = 'perf-panel perf-hidden';
  panel.innerHTML = `
    <div class="perf-title">Performance <span class="perf-hint">P to close</span></div>
    <div class="perf-grid" id="perf-grid">
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
    <div id="perf-subsystems" class="perf-grid" style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px"></div>
    <button id="perf-record-btn" class="perf-record-btn">Record 5s report</button>
    <div id="perf-record-status" class="perf-record-status"></div>
  `;
  document.body.appendChild(panel);

  const elFps = panel.querySelector('#perf-fps');
  const elFt = panel.querySelector('#perf-ft');
  const elDc = panel.querySelector('#perf-dc');
  const elTri = panel.querySelector('#perf-tri');
  const elGeo = panel.querySelector('#perf-geo');
  const elTex = panel.querySelector('#perf-tex');
  const elProg = panel.querySelector('#perf-prog');
  const elMem = panel.querySelector('#perf-mem');
  const elGpu = panel.querySelector('#perf-gpu');
  const elSub = panel.querySelector('#perf-subsystems');
  const elRecBtn = panel.querySelector('#perf-record-btn');
  const elRecStatus = panel.querySelector('#perf-record-status');

  if (elGpu) elGpu.textContent = gpuName;

  // Toggle
  let visible = false;
  let displayTimer = 0;
  const DISPLAY_INTERVAL = 0.25;

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

  // Record button
  elRecBtn.addEventListener('click', () => {
    if (recording) return;
    recording = true;
    recordStart = performance.now();
    recordedFrames = [];
    elRecBtn.disabled = true;
    elRecBtn.textContent = 'Recording...';
    elRecStatus.textContent = '';
  });

  // ── Public API ──

  function begin() {
    frameBeginTime = performance.now();
  }

  function markStart(name) {
    currentMark = name;
    currentMarkStart = performance.now();
  }

  function markEnd(name) {
    if (currentMark !== name) return;
    const elapsed = performance.now() - currentMarkStart;
    // EMA smoothing for display
    if (subsystems[name] === undefined) subsystems[name] = elapsed;
    else subsystems[name] = 0.15 * elapsed + 0.85 * subsystems[name];
    // Raw value for recording
    subsystemSnapshot[name] = elapsed;
    currentMark = null;
  }

  function end(delta) {
    const now = performance.now();
    const rawFt = now - frameBeginTime;

    frameTime = FT_ALPHA * rawFt + (1 - FT_ALPHA) * frameTime;
    framesThisSecond++;
    if (now > lastFpsUpdate + 1000) {
      fps = FPS_ALPHA * framesThisSecond + (1 - FPS_ALPHA) * fps;
      lastFpsUpdate = now;
      framesThisSecond = 0;
    }

    // ── Recording ──
    if (recording) {
      const info = renderer.info;
      recordedFrames.push({
        t: now - recordStart,
        ft: rawFt,
        fps: Math.round(fps),
        dc: info.render.calls,
        tri: info.render.triangles,
        geo: info.memory.geometries,
        tex: info.memory.textures,
        heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
        sub: { ...subsystemSnapshot },
      });
      const elapsed = (now - recordStart) / 1000;
      elRecStatus.textContent = `${elapsed.toFixed(1)}s / ${RECORD_DURATION}s`;
      if (elapsed >= RECORD_DURATION) {
        finishRecording();
      }
    }

    // ── Display (throttled) ──
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

    // Subsystem breakdown
    const names = Object.keys(subsystems);
    if (names.length > 0) {
      elSub.innerHTML = names
        .map(n => `<span class="perf-label">${n}</span><span class="perf-val">${subsystems[n].toFixed(2)} ms</span>`)
        .join('');
    }
  }

  async function finishRecording() {
    recording = false;
    elRecBtn.disabled = false;
    elRecBtn.textContent = 'Record 5s report';

    const report = buildReport();

    try {
      const res = await fetch('/__perf_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report, null, 2),
      });
      if (res.ok) {
        elRecStatus.textContent = 'Saved to perf-report.json';
      } else {
        throw new Error('Server error');
      }
    } catch {
      // Fallback: download as file
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'perf-report.json';
      a.click();
      elRecStatus.textContent = 'Downloaded perf-report.json';
    }

    recordedFrames = [];
  }

  function buildReport() {
    const frames = recordedFrames;
    const n = frames.length;
    if (n === 0) return { error: 'No frames recorded' };

    const fts = frames.map(f => f.ft).sort((a, b) => a - b);
    const avgFt = fts.reduce((s, v) => s + v, 0) / n;
    const p50 = fts[Math.floor(n * 0.5)];
    const p95 = fts[Math.floor(n * 0.95)];
    const p99 = fts[Math.floor(n * 0.99)];
    const hitches = fts.filter(v => v > 33.33).length;
    const severeHitches = fts.filter(v => v > 50).length;

    // Subsystem averages
    const subNames = Object.keys(frames[0].sub || {});
    const subAvg = {};
    const subMax = {};
    for (const name of subNames) {
      const vals = frames.map(f => f.sub[name] || 0);
      subAvg[name] = +(vals.reduce((s, v) => s + v, 0) / n).toFixed(3);
      subMax[name] = +Math.max(...vals).toFixed(3);
    }

    // Sort subsystems by avg time descending for bottleneck identification
    const subRanked = subNames
      .map(name => ({ name, avg: subAvg[name], max: subMax[name] }))
      .sort((a, b) => b.avg - a.avg);

    // Identify bottleneck
    const topSub = subRanked[0];
    const totalSubAvg = subRanked.reduce((s, r) => s + r.avg, 0);
    const bottleneck = topSub
      ? `${topSub.name} (${((topSub.avg / avgFt) * 100).toFixed(1)}% of frame time)`
      : 'unknown';

    return {
      meta: {
        date: new Date().toISOString(),
        duration: RECORD_DURATION + 's',
        frameCount: n,
        gpu: gpuName,
        resolution: `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: window.devicePixelRatio,
        jsHeapMB: performance.memory
          ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)
          : null,
      },
      summary: {
        avgFps: +(1000 / avgFt).toFixed(1),
        minFps: +(1000 / fts[n - 1]).toFixed(1),
        avgFrameTime: +avgFt.toFixed(2),
        minFrameTime: +fts[0].toFixed(2),
        maxFrameTime: +fts[n - 1].toFixed(2),
        p50: +p50.toFixed(2),
        p95: +p95.toFixed(2),
        p99: +p99.toFixed(2),
        hitches_over_33ms: hitches,
        severe_hitches_over_50ms: severeHitches,
      },
      renderer: {
        drawCalls: frames[n - 1].dc,
        triangles: frames[n - 1].tri,
        geometries: frames[n - 1].geo,
        textures: frames[n - 1].tex,
      },
      subsystems: {
        ranked: subRanked,
        totalAvg: +totalSubAvg.toFixed(3),
        bottleneck,
      },
      analysis: generateAnalysis(avgFt, fts, subRanked, totalSubAvg, frames[n - 1]),
      frames: frames.map(f => ({
        t: +f.t.toFixed(1),
        ft: +f.ft.toFixed(2),
        dc: f.dc,
        tri: f.tri,
        sub: Object.fromEntries(Object.entries(f.sub).map(([k, v]) => [k, +v.toFixed(3)])),
      })),
    };
  }

  function generateAnalysis(avgFt, sortedFts, subRanked, totalSubAvg, lastFrame) {
    const issues = [];
    const n = sortedFts.length;

    if (1000 / avgFt < 55) {
      issues.push(`Below 60fps target — avg frame time ${avgFt.toFixed(1)}ms (target: <16.67ms)`);
    }
    if (sortedFts[n - 1] > 50) {
      issues.push(`Severe frame hitches detected — worst frame: ${sortedFts[n - 1].toFixed(1)}ms`);
    }

    const gpuTime = avgFt - totalSubAvg;
    if (gpuTime > totalSubAvg * 2) {
      issues.push(`GPU-bound: render time (~${gpuTime.toFixed(1)}ms) dominates over JS subsystems (~${totalSubAvg.toFixed(1)}ms)`);
    }
    if (totalSubAvg > avgFt * 0.6) {
      issues.push(`CPU-bound: JS subsystems take ${totalSubAvg.toFixed(1)}ms of ${avgFt.toFixed(1)}ms frame budget`);
    }

    if (lastFrame.dc > 200) {
      issues.push(`High draw call count: ${lastFrame.dc} — consider merging geometries or using instancing`);
    }
    if (lastFrame.tri > 500000) {
      issues.push(`High triangle count: ${formatNum(lastFrame.tri)} — consider LOD or geometry simplification`);
    }

    for (const sub of subRanked) {
      if (sub.avg > 4) {
        issues.push(`Subsystem "${sub.name}" is expensive: avg ${sub.avg.toFixed(2)}ms, max ${sub.max.toFixed(2)}ms`);
      }
    }

    // Variance check
    const variance = sortedFts.reduce((s, v) => s + (v - avgFt) ** 2, 0) / n;
    if (Math.sqrt(variance) > avgFt * 0.5) {
      issues.push(`High frame time variance (stddev ${Math.sqrt(variance).toFixed(1)}ms) — indicates intermittent hitches or GC pauses`);
    }

    if (issues.length === 0) {
      issues.push('No major performance issues detected');
    }

    return issues;
  }

  return { begin, end, markStart, markEnd };
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
