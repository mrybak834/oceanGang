// ─── Performance Tracker + Profiler — toggle P, record with button ───

const DURATION_OPTIONS = [5, 10, 30, 60];

export function createPerfTracker(renderer) {
  let recordDuration = DURATION_OPTIONS[0];
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
  const subsystemSnapshot = {}; // raw values for current frame

  // ── GPU info ──
  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugExt
    ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
    : 'Unknown';

  // ── Game context (set externally each frame) ──
  let frameContext = null;

  // ── Recording state ──
  let recording = false;
  let recordStart = 0;
  let recordedFrames = [];
  let recordedEvents = [];
  let prevContext = null; // for detecting state changes

  // ── DOM ──
  const panel = document.createElement('div');
  panel.id = 'perf-panel';
  panel.className = 'perf-panel perf-hidden';
  panel.innerHTML = `
    <div class="perf-title">Performance</div>
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
    <div id="perf-context" class="perf-grid" style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px"></div>
    <div class="perf-duration-row">
      ${DURATION_OPTIONS.map(d => `<button class="perf-dur-btn${d === DURATION_OPTIONS[0] ? ' active' : ''}" data-dur="${d}">${d}s</button>`).join('')}
    </div>
    <button id="perf-record-btn" class="perf-record-btn">Record ${DURATION_OPTIONS[0]}s report</button>
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
  const elCtx = panel.querySelector('#perf-context');
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

  function toggle() {
    visible = !visible;
    panel.classList.toggle('perf-hidden', !visible);
    return visible;
  }

  // Duration selector
  panel.querySelectorAll('.perf-dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (recording) return;
      recordDuration = parseInt(btn.dataset.dur);
      panel.querySelectorAll('.perf-dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      elRecBtn.textContent = `Record ${recordDuration}s report`;
    });
  });

  // Record button
  elRecBtn.addEventListener('click', () => {
    if (recording) return;
    recording = true;
    recordStart = performance.now();
    recordedFrames = [];
    recordedEvents = [];
    prevContext = null;
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
    if (subsystems[name] === undefined) subsystems[name] = elapsed;
    else subsystems[name] = 0.15 * elapsed + 0.85 * subsystems[name];
    subsystemSnapshot[name] = elapsed;
    currentMark = null;
  }

  function setContext(ctx) {
    frameContext = ctx;
  }

  function logEvent(type, data) {
    if (!recording) return;
    const t = performance.now() - recordStart;
    const entry = { t: +t.toFixed(1), event: type };
    if (data !== undefined) entry.data = data;
    recordedEvents.push(entry);
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
      const t = now - recordStart;

      // Auto-detect events from context changes
      if (frameContext && prevContext) {
        if (frameContext.boost > 0.05 && prevContext.boost <= 0.05) logEventDirect(t, 'boost_start');
        if (frameContext.boost <= 0.05 && prevContext.boost > 0.05) logEventDirect(t, 'boost_end');
        if (frameContext.jumping && !prevContext.jumping) logEventDirect(t, 'jump');
        if (!frameContext.jumping && prevContext.jumping) logEventDirect(t, 'jump_land');
        if (frameContext.splashActive && !prevContext.splashActive) logEventDirect(t, 'splash_start');
        if (!frameContext.splashActive && prevContext.splashActive) logEventDirect(t, 'splash_end');
        if (frameContext.tradingMenu && !prevContext.tradingMenu) logEventDirect(t, 'trading_menu_open');
        if (!frameContext.tradingMenu && prevContext.tradingMenu) logEventDirect(t, 'trading_menu_close');
        if (frameContext.cameraMode !== prevContext.cameraMode) logEventDirect(t, 'camera_mode_change', { mode: frameContext.cameraMode });
        if (frameContext.crateScore > prevContext.crateScore) logEventDirect(t, 'crate_collected', { score: frameContext.crateScore });
        if (Math.abs(frameContext.zoom - prevContext.zoom) > 0.05) logEventDirect(t, 'zoom_change', { level: +frameContext.zoom.toFixed(2) });
        if (frameContext.visibleIslands !== prevContext.visibleIslands) {
          const diff = frameContext.visibleIslands - prevContext.visibleIslands;
          logEventDirect(t, diff > 0 ? 'islands_appeared' : 'islands_culled', {
            count: frameContext.visibleIslands,
            delta: diff,
          });
        }
      }
      if (frameContext) prevContext = { ...frameContext };

      recordedFrames.push({
        t,
        ft: rawFt,
        dc: info.render.calls,
        tri: info.render.triangles,
        geo: info.memory.geometries,
        tex: info.memory.textures,
        heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
        sub: { ...subsystemSnapshot },
        ctx: frameContext ? { ...frameContext } : null,
      });

      const elapsed = (now - recordStart) / 1000;
      elRecStatus.textContent = `${elapsed.toFixed(1)}s / ${recordDuration}s`;
      if (elapsed >= recordDuration) {
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

    // Game context display
    if (frameContext) {
      const c = frameContext;
      elCtx.innerHTML = [
        row('Speed', Math.abs(c.speed).toFixed(0)),
        row('Boost', (c.boost * 100).toFixed(0) + '%'),
        row('Islands vis', c.visibleIslands),
        row('Camera', c.cameraMode),
        c.jumping ? row('State', 'JUMPING') : '',
        c.tradingMenu ? row('State', 'TRADING') : '',
        row('Input', formatInput(c.input)),
      ].join('');
    }
  }

  function row(label, val) {
    return `<span class="perf-label">${label}</span><span class="perf-val">${val}</span>`;
  }

  function formatInput(input) {
    if (!input) return '-';
    const keys = [];
    if (input.fwd) keys.push('W');
    if (input.rev) keys.push('S');
    if (input.left) keys.push('A');
    if (input.right) keys.push('D');
    if (input.boost) keys.push('Sh');
    if (input.jump) keys.push('Sp');
    return keys.length > 0 ? keys.join('+') : '-';
  }

  function logEventDirect(t, type, data) {
    const entry = { t: +t.toFixed(1), event: type };
    if (data !== undefined) entry.data = data;
    recordedEvents.push(entry);
  }

  async function finishRecording() {
    recording = false;
    elRecBtn.disabled = false;
    elRecBtn.textContent = `Record ${recordDuration}s report`;

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
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'perf-report.json';
      a.click();
      elRecStatus.textContent = 'Downloaded perf-report.json';
    }

    recordedFrames = [];
    recordedEvents = [];
    prevContext = null;
  }

  function buildReport() {
    const frames = recordedFrames;
    const n = frames.length;
    if (n === 0) return { error: 'No frames recorded' };

    // ── Work time stats (JS execution per frame) ──
    const fts = frames.map(f => f.ft).sort((a, b) => a - b);
    const avgFt = fts.reduce((s, v) => s + v, 0) / n;
    const p50 = fts[Math.min(Math.floor(n * 0.5), n - 1)];
    const p95 = fts[Math.min(Math.floor(n * 0.95), n - 1)];
    const p99 = fts[Math.min(Math.floor(n * 0.99), n - 1)];
    const hitches = fts.filter(v => v > 33.33).length;
    const severeHitches = fts.filter(v => v > 50).length;
    const ftVariance = fts.reduce((s, v) => s + (v - avgFt) ** 2, 0) / n;
    const ftStdDev = Math.sqrt(ftVariance);

    // ── Real FPS from wall-clock intervals ──
    const wallIntervals = [];
    for (let i = 1; i < n; i++) {
      wallIntervals.push(frames[i].t - frames[i - 1].t);
    }
    const wallDuration = frames[n - 1].t - frames[0].t;
    const realAvgFps = wallDuration > 0 ? +((n - 1) / (wallDuration / 1000)).toFixed(1) : 0;
    const sortedIntervals = [...wallIntervals].sort((a, b) => a - b);
    const avgInterval = wallIntervals.length > 0 ? wallIntervals.reduce((s, v) => s + v, 0) / wallIntervals.length : 0;
    const worstInterval = sortedIntervals.length > 0 ? sortedIntervals[sortedIntervals.length - 1] : 0;
    const realMinFps = worstInterval > 0 ? +(1000 / worstInterval).toFixed(1) : 0;
    const bestInterval = sortedIntervals.length > 0 ? sortedIntervals[0] : 0;
    const realMaxFps = bestInterval > 0 ? +(1000 / bestInterval).toFixed(1) : 0;

    // ── Frame pacing (wall-clock based) ──
    let jankFrames = 0;
    let maxConsecutiveJank = 0;
    let currentJankStreak = 0;
    const framePacingDeltas = [];
    for (let i = 1; i < wallIntervals.length; i++) {
      const delta = Math.abs(wallIntervals[i] - wallIntervals[i - 1]);
      framePacingDeltas.push(delta);
      // Jank: interval changed by more than 50% from previous (e.g. 8ms then 16ms)
      const threshold = Math.max(4, avgInterval * 0.5);
      if (delta > threshold) {
        jankFrames++;
        currentJankStreak++;
        maxConsecutiveJank = Math.max(maxConsecutiveJank, currentJankStreak);
      } else {
        currentJankStreak = 0;
      }
    }
    const avgPacingDelta = framePacingDeltas.length > 0
      ? framePacingDeltas.reduce((s, v) => s + v, 0) / framePacingDeltas.length
      : 0;

    // ── Renderer stats ──
    const dcs = frames.map(f => f.dc);
    const tris = frames.map(f => f.tri);
    const dcStats = computeStats(dcs);
    const triStats = computeStats(tris);

    // ── Subsystem averages ──
    const subNames = Object.keys(frames[0].sub || {});
    const subAvg = {};
    const subMax = {};
    const subMin = {};
    const subStdDev = {};
    for (const name of subNames) {
      const vals = frames.map(f => f.sub[name] || 0);
      const avg = vals.reduce((s, v) => s + v, 0) / n;
      subAvg[name] = +avg.toFixed(3);
      subMax[name] = +Math.max(...vals).toFixed(3);
      subMin[name] = +Math.min(...vals).toFixed(3);
      subStdDev[name] = +Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / n).toFixed(3);
    }

    const subRanked = subNames
      .map(name => ({
        name,
        avg: subAvg[name],
        min: subMin[name],
        max: subMax[name],
        stddev: subStdDev[name],
      }))
      .sort((a, b) => b.avg - a.avg);

    const totalSubAvg = subRanked.reduce((s, r) => s + r.avg, 0);
    const topSub = subRanked[0];
    const bottleneck = topSub
      ? `${topSub.name} (${((topSub.avg / avgInterval) * 100).toFixed(1)}% of frame budget)`
      : 'unknown';

    // ── Game state summary ──
    const gameState = buildGameStateSummary(frames);

    // ── Correlations ──
    const correlations = buildCorrelations(frames);

    // ── Analysis ──
    const analysis = generateAnalysis(realAvgFps, avgInterval, avgFt, fts, ftStdDev, subRanked, totalSubAvg, dcStats, triStats, gameState, jankFrames, n);

    // ── Memory trend ──
    const heapStart = frames[0].heap;
    const heapEnd = frames[n - 1].heap;
    const heapTrend = heapStart && heapEnd
      ? { startMB: +(heapStart / 1048576).toFixed(1), endMB: +(heapEnd / 1048576).toFixed(1), deltaMB: +((heapEnd - heapStart) / 1048576).toFixed(2) }
      : null;

    return {
      meta: {
        date: new Date().toISOString(),
        duration: recordDuration + 's',
        frameCount: n,
        gpu: gpuName,
        resolution: `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: window.devicePixelRatio,
        jsHeapMB: performance.memory
          ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)
          : null,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        batteryInfo: 'check navigator.getBattery() manually',
      },
      summary: {
        avgFps: realAvgFps,
        minFps: realMinFps,
        maxFps: realMaxFps,
        avgInterval: +avgInterval.toFixed(2),
        workTime: {
          avg: +avgFt.toFixed(2),
          min: +fts[0].toFixed(2),
          max: +fts[n - 1].toFixed(2),
          stddev: +ftStdDev.toFixed(2),
          p50: +p50.toFixed(2),
          p95: +p95.toFixed(2),
          p99: +p99.toFixed(2),
          headroom: +((avgInterval - avgFt) > 0 ? (avgInterval - avgFt).toFixed(2) : '0'),
        },
        hitches_over_33ms: hitches,
        severe_hitches_over_50ms: severeHitches,
      },
      framePacing: {
        avgFrameTimeDelta: +avgPacingDelta.toFixed(2),
        jankFrames,
        jankPercent: +((jankFrames / Math.max(1, n - 1)) * 100).toFixed(1),
        maxConsecutiveJank,
        verdict: jankFrames / n > 0.15 ? 'CHOPPY' : jankFrames / n > 0.05 ? 'UNEVEN' : 'SMOOTH',
      },
      renderer: {
        drawCalls: dcStats,
        triangles: triStats,
        geometries: frames[n - 1].geo,
        textures: frames[n - 1].tex,
      },
      memory: heapTrend,
      subsystems: {
        ranked: subRanked,
        totalAvg: +totalSubAvg.toFixed(3),
        bottleneck,
      },
      gameState,
      events: recordedEvents,
      correlations,
      analysis,
      frames: frames.map(f => {
        const entry = {
          t: +f.t.toFixed(1),
          ft: +f.ft.toFixed(2),
          dc: f.dc,
          tri: f.tri,
          sub: Object.fromEntries(Object.entries(f.sub).map(([k, v]) => [k, +v.toFixed(3)])),
        };
        if (f.ctx) {
          entry.ctx = {
            spd: +Math.abs(f.ctx.speed).toFixed(1),
            bst: +f.ctx.boost.toFixed(2),
            pos: [+f.ctx.position[0].toFixed(0), +f.ctx.position[1].toFixed(0)],
            hdg: +f.ctx.heading.toFixed(2),
            jmp: f.ctx.jumping || undefined,
            spl: f.ctx.splashActive || undefined,
            vis: f.ctx.visibleIslands,
            cam: f.ctx.cameraMode === 'chase' ? 1 : 0,
            zm: +f.ctx.zoom.toFixed(2),
            mnu: f.ctx.tradingMenu || undefined,
            drg: f.ctx.mouseDragging || undefined,
            inp: compactInput(f.ctx.input),
          };
        }
        return entry;
      }),
    };
  }

  function compactInput(input) {
    if (!input) return 0;
    // Bitfield: W=1 S=2 A=4 D=8 Shift=16 Space=32
    let bits = 0;
    if (input.fwd) bits |= 1;
    if (input.rev) bits |= 2;
    if (input.left) bits |= 4;
    if (input.right) bits |= 8;
    if (input.boost) bits |= 16;
    if (input.jump) bits |= 32;
    return bits;
  }

  function computeStats(arr) {
    const n = arr.length;
    const sorted = [...arr].sort((a, b) => a - b);
    const avg = arr.reduce((s, v) => s + v, 0) / n;
    const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    return {
      min: sorted[0],
      max: sorted[n - 1],
      avg: +avg.toFixed(1),
      stddev: +Math.sqrt(variance).toFixed(1),
      p50: sorted[Math.min(Math.floor(n * 0.5), n - 1)],
      p95: sorted[Math.min(Math.floor(n * 0.95), n - 1)],
    };
  }

  function buildGameStateSummary(frames) {
    const n = frames.length;
    const ctxFrames = frames.filter(f => f.ctx);
    if (ctxFrames.length === 0) return { note: 'No game context captured' };

    const speeds = ctxFrames.map(f => Math.abs(f.ctx.speed));
    const boosts = ctxFrames.map(f => f.ctx.boost);
    const visIslands = ctxFrames.map(f => f.ctx.visibleIslands);
    const zooms = ctxFrames.map(f => f.ctx.zoom);

    const boostFrames = ctxFrames.filter(f => f.ctx.boost > 0.05).length;
    const jumpFrames = ctxFrames.filter(f => f.ctx.jumping).length;
    const splashFrames = ctxFrames.filter(f => f.ctx.splashActive).length;
    const menuFrames = ctxFrames.filter(f => f.ctx.tradingMenu).length;
    const dragFrames = ctxFrames.filter(f => f.ctx.mouseDragging).length;

    // Input breakdown
    const inputFrames = ctxFrames.filter(f => f.ctx.input);
    const inputCounts = { fwd: 0, rev: 0, left: 0, right: 0, boost: 0, jump: 0, idle: 0 };
    for (const f of inputFrames) {
      const inp = f.ctx.input;
      if (inp.fwd) inputCounts.fwd++;
      if (inp.rev) inputCounts.rev++;
      if (inp.left) inputCounts.left++;
      if (inp.right) inputCounts.right++;
      if (inp.boost) inputCounts.boost++;
      if (inp.jump) inputCounts.jump++;
      if (!inp.fwd && !inp.rev && !inp.left && !inp.right && !inp.boost && !inp.jump) inputCounts.idle++;
    }

    // Camera modes
    const chaseCamFrames = ctxFrames.filter(f => f.ctx.cameraMode === 'chase').length;

    // Position: compute total distance traveled
    let distanceTraveled = 0;
    for (let i = 1; i < ctxFrames.length; i++) {
      const dx = ctxFrames[i].ctx.position[0] - ctxFrames[i - 1].ctx.position[0];
      const dz = ctxFrames[i].ctx.position[1] - ctxFrames[i - 1].ctx.position[1];
      distanceTraveled += Math.sqrt(dx * dx + dz * dz);
    }

    const cn = ctxFrames.length;
    const pct = (v) => +((v / cn) * 100).toFixed(1);

    return {
      speed: { min: +Math.min(...speeds).toFixed(1), max: +Math.max(...speeds).toFixed(1), avg: +(speeds.reduce((s, v) => s + v, 0) / cn).toFixed(1) },
      boost: { activePercent: pct(boostFrames), avgWhenActive: boostFrames > 0 ? +(boosts.filter(b => b > 0.05).reduce((s, v) => s + v, 0) / boostFrames).toFixed(2) : 0 },
      visibleIslands: { min: Math.min(...visIslands), max: Math.max(...visIslands), avg: +(visIslands.reduce((s, v) => s + v, 0) / cn).toFixed(1) },
      zoom: { min: +Math.min(...zooms).toFixed(2), max: +Math.max(...zooms).toFixed(2), avg: +(zooms.reduce((s, v) => s + v, 0) / cn).toFixed(2) },
      jumping: { frames: jumpFrames, percent: pct(jumpFrames) },
      splash: { frames: splashFrames, percent: pct(splashFrames) },
      tradingMenu: { frames: menuFrames, percent: pct(menuFrames) },
      mouseDrag: { frames: dragFrames, percent: pct(dragFrames) },
      cameraMode: { chase: pct(chaseCamFrames) + '%', orbit: pct(cn - chaseCamFrames) + '%' },
      distanceTraveled: +distanceTraveled.toFixed(0),
      startPosition: ctxFrames[0].ctx.position.map(v => +v.toFixed(0)),
      endPosition: ctxFrames[cn - 1].ctx.position.map(v => +v.toFixed(0)),
      input: {
        forward: pct(inputCounts.fwd) + '%',
        reverse: pct(inputCounts.rev) + '%',
        left: pct(inputCounts.left) + '%',
        right: pct(inputCounts.right) + '%',
        boost: pct(inputCounts.boost) + '%',
        jump: pct(inputCounts.jump) + '%',
        idle: pct(inputCounts.idle) + '%',
      },
    };
  }

  function buildCorrelations(frames) {
    const results = [];
    const n = frames.length;
    const ctxFrames = frames.filter(f => f.ctx);
    if (ctxFrames.length < 10) return results;

    // 1. Draw calls vs frame time
    const dcCorr = pearson(frames.map(f => f.dc), frames.map(f => f.ft));
    if (Math.abs(dcCorr) > 0.3) {
      results.push({
        type: 'draw_calls_vs_frame_time',
        correlation: +dcCorr.toFixed(3),
        description: dcCorr > 0.3
          ? `Frame time increases with draw calls (r=${dcCorr.toFixed(2)}) — reducing draw calls will directly improve frame time`
          : `Weak negative correlation between draw calls and frame time (r=${dcCorr.toFixed(2)})`,
      });
    }

    // 2. Triangle count vs frame time
    const triCorr = pearson(frames.map(f => f.tri), frames.map(f => f.ft));
    if (Math.abs(triCorr) > 0.3) {
      results.push({
        type: 'triangles_vs_frame_time',
        correlation: +triCorr.toFixed(3),
        description: `Triangle count ${triCorr > 0 ? 'positively' : 'negatively'} correlated with frame time (r=${triCorr.toFixed(2)})`,
      });
    }

    // 3. Visible islands vs draw calls
    const visIslands = ctxFrames.map(f => f.ctx.visibleIslands);
    const visDcs = ctxFrames.map(f => f.dc);
    const islandDcCorr = pearson(visIslands, visDcs);
    if (Math.abs(islandDcCorr) > 0.3) {
      results.push({
        type: 'visible_islands_vs_draw_calls',
        correlation: +islandDcCorr.toFixed(3),
        description: `Visible islands strongly affect draw calls (r=${islandDcCorr.toFixed(2)}) — island LOD or geometry merging would help`,
      });
    }

    // 4. Speed vs frame time
    const spdCorr = pearson(ctxFrames.map(f => Math.abs(f.ctx.speed)), ctxFrames.map(f => f.ft));
    if (Math.abs(spdCorr) > 0.3) {
      results.push({
        type: 'speed_vs_frame_time',
        correlation: +spdCorr.toFixed(3),
        description: `Boat speed ${spdCorr > 0 ? 'increases' : 'decreases'} frame time (r=${spdCorr.toFixed(2)})`,
      });
    }

    // 5. Boost impact
    const boostFrames = ctxFrames.filter(f => f.ctx.boost > 0.5);
    const noBoostFrames = ctxFrames.filter(f => f.ctx.boost <= 0.05);
    if (boostFrames.length > 5 && noBoostFrames.length > 5) {
      const boostAvgFt = boostFrames.reduce((s, f) => s + f.ft, 0) / boostFrames.length;
      const noBoostAvgFt = noBoostFrames.reduce((s, f) => s + f.ft, 0) / noBoostFrames.length;
      const impact = boostAvgFt - noBoostAvgFt;
      if (Math.abs(impact) > 0.5) {
        results.push({
          type: 'boost_impact',
          boostAvgFt: +boostAvgFt.toFixed(2),
          noBoostAvgFt: +noBoostAvgFt.toFixed(2),
          impactMs: +impact.toFixed(2),
          description: impact > 0
            ? `Boosting adds ~${impact.toFixed(1)}ms per frame (${boostAvgFt.toFixed(1)}ms vs ${noBoostAvgFt.toFixed(1)}ms)`
            : `Boosting does not significantly impact frame time`,
        });
      }
    }

    // 6. Worst frame analysis — what was happening during the top 5% slowest frames
    const sortedByFt = [...ctxFrames].sort((a, b) => b.ft - a.ft);
    const worstFrames = sortedByFt.slice(0, Math.max(1, Math.floor(n * 0.05)));
    const worstAvgDc = worstFrames.reduce((s, f) => s + f.dc, 0) / worstFrames.length;
    const worstAvgVis = worstFrames.reduce((s, f) => s + f.ctx.visibleIslands, 0) / worstFrames.length;
    const worstAvgSpeed = worstFrames.reduce((s, f) => s + Math.abs(f.ctx.speed), 0) / worstFrames.length;
    const worstBoostPct = (worstFrames.filter(f => f.ctx.boost > 0.05).length / worstFrames.length) * 100;

    results.push({
      type: 'worst_frames_profile',
      count: worstFrames.length,
      avgFrameTime: +(worstFrames.reduce((s, f) => s + f.ft, 0) / worstFrames.length).toFixed(2),
      avgDrawCalls: +worstAvgDc.toFixed(0),
      avgVisibleIslands: +worstAvgVis.toFixed(1),
      avgSpeed: +worstAvgSpeed.toFixed(1),
      boostPercent: +worstBoostPct.toFixed(0),
      description: `Worst ${worstFrames.length} frames: avg ${worstAvgDc.toFixed(0)} draw calls, ${worstAvgVis.toFixed(0)} visible islands, speed ${worstAvgSpeed.toFixed(0)}, ${worstBoostPct.toFixed(0)}% boosting`,
    });

    return results;
  }

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 5) return 0;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    const denom = Math.sqrt(dx * dy);
    return denom > 0 ? num / denom : 0;
  }

  function generateAnalysis(realAvgFps, avgInterval, avgFt, sortedFts, ftStdDev, subRanked, totalSubAvg, dcStats, triStats, gameState, jankFrames, n) {
    const issues = [];

    // FPS target
    if (realAvgFps < 55) {
      issues.push(`Below 60fps target: ${realAvgFps} fps (avg interval ${avgInterval.toFixed(1)}ms, target: <16.67ms)`);
    }

    // Severe hitches
    if (sortedFts[n - 1] > 50) {
      issues.push(`Severe frame hitches detected: worst work time ${sortedFts[n - 1].toFixed(1)}ms`);
    }

    // Work time headroom
    const headroom = avgInterval - avgFt;
    if (headroom < 2 && avgInterval > 0) {
      issues.push(`Low headroom: work time ${avgFt.toFixed(1)}ms vs frame interval ${avgInterval.toFixed(1)}ms — only ${headroom.toFixed(1)}ms spare`);
    }

    // Work time variance
    if (ftStdDev > avgFt * 0.3) {
      issues.push(`High work time variance: stddev ${ftStdDev.toFixed(1)}ms (${((ftStdDev / avgFt) * 100).toFixed(0)}% of avg ${avgFt.toFixed(1)}ms)`);
    }

    // Jank
    if (jankFrames / n > 0.1) {
      issues.push(`Frame pacing jank: ${jankFrames} of ${n} frames (${((jankFrames / n) * 100).toFixed(0)}%) had irregular intervals`);
    }

    // CPU vs GPU bound (within work time)
    const gpuTime = avgFt - totalSubAvg;
    if (gpuTime > totalSubAvg * 2) {
      issues.push(`GPU-bound: estimated GPU time ~${gpuTime.toFixed(1)}ms vs JS subsystems ~${totalSubAvg.toFixed(1)}ms`);
    }
    if (totalSubAvg > avgInterval * 0.6 && avgInterval > 0) {
      issues.push(`CPU-bound: JS subsystems take ${totalSubAvg.toFixed(1)}ms of ${avgInterval.toFixed(1)}ms frame budget`);
    }

    // Draw call variance
    if (dcStats.stddev > dcStats.avg * 0.3) {
      issues.push(`Draw call variance is high: ${dcStats.min}–${dcStats.max} (stddev ${dcStats.stddev}) — objects popping in/out causes load spikes`);
    }
    if (dcStats.max > 500) {
      issues.push(`Peak draw calls: ${dcStats.max} — consider geometry merging, instancing, or tighter culling`);
    }

    // Triangle count variance
    if (triStats.stddev > triStats.avg * 0.3) {
      issues.push(`Triangle count variance: ${formatNum(triStats.min)}–${formatNum(triStats.max)} — geometry appearing/disappearing in large batches`);
    }

    // Expensive subsystems
    for (const sub of subRanked) {
      if (sub.avg > 4) {
        issues.push(`Subsystem "${sub.name}" is expensive: avg ${sub.avg.toFixed(2)}ms, max ${sub.max.toFixed(2)}ms (stddev ${sub.stddev.toFixed(2)}ms)`);
      }
      if (sub.stddev > sub.avg * 0.5 && sub.avg > 1) {
        issues.push(`Subsystem "${sub.name}" has high variance: stddev ${sub.stddev.toFixed(2)}ms — indicates intermittent spikes`);
      }
    }

    // Visible island impact
    if (gameState.visibleIslands && gameState.visibleIslands.max - gameState.visibleIslands.min > 10) {
      issues.push(`Visible islands ranged ${gameState.visibleIslands.min}–${gameState.visibleIslands.max} — large swings drive draw call variance`);
    }

    if (issues.length === 0) {
      issues.push('No major performance issues detected');
    }

    return issues;
  }

  return { begin, end, markStart, markEnd, setContext, logEvent, toggle };
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
