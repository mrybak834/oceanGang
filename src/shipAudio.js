// ─── Ship Water Audio — Web Audio synthesis tied to boat speed ───
// Brown noise hull wash + splash bubbles + wind whistle at boost

export function createShipAudio() {
  let ctx = null;
  let initialized = false;
  let userHasInteracted = false;
  let pendingVolume = 1.0;

  // Only allow AudioContext creation after a user gesture
  function onInteraction() {
    userHasInteracted = true;
    window.removeEventListener('pointerdown', onInteraction);
    window.removeEventListener('keydown', onInteraction);
  }
  window.addEventListener('pointerdown', onInteraction);
  window.addEventListener('keydown', onInteraction);

  // Nodes
  let hullNoiseSource, hullFilter, hullGain;
  let splashNoiseSource, splashFilter, splashGain;
  let windNoiseSource, windHPF, windLPF, windGain;
  let masterGain;

  function makeBrownNoise(audioCtx, lengthSec) {
    const bufLen = lengthSec * audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  function makeWhiteNoise(audioCtx, lengthSec) {
    const bufLen = lengthSec * audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = ctx.createGain();
    masterGain.gain.value = pendingVolume;
    masterGain.connect(ctx.destination);

    // ── Hull wash: brown noise → lowpass → gain ──
    const brownBuf = makeBrownNoise(ctx, 4);
    hullNoiseSource = ctx.createBufferSource();
    hullNoiseSource.buffer = brownBuf;
    hullNoiseSource.loop = true;

    hullFilter = ctx.createBiquadFilter();
    hullFilter.type = 'lowpass';
    hullFilter.frequency.value = 60;
    hullFilter.Q.value = 0.5;

    hullGain = ctx.createGain();
    hullGain.gain.value = 0;

    hullNoiseSource.connect(hullFilter);
    hullFilter.connect(hullGain);
    hullGain.connect(masterGain);
    hullNoiseSource.start();

    // ── Splash layer: white noise → bandpass → gain (higher freqs at speed) ──
    const whiteBuf = makeWhiteNoise(ctx, 4);
    splashNoiseSource = ctx.createBufferSource();
    splashNoiseSource.buffer = whiteBuf;
    splashNoiseSource.loop = true;

    splashFilter = ctx.createBiquadFilter();
    splashFilter.type = 'bandpass';
    splashFilter.frequency.value = 2000;
    splashFilter.Q.value = 0.3;

    splashGain = ctx.createGain();
    splashGain.gain.value = 0;

    splashNoiseSource.connect(splashFilter);
    splashFilter.connect(splashGain);
    splashGain.connect(masterGain);
    splashNoiseSource.start();

    // ── Wind whistle: white noise → highpass → lowpass (narrow band) → gain ──
    windNoiseSource = ctx.createBufferSource();
    windNoiseSource.buffer = whiteBuf;
    windNoiseSource.loop = true;

    windHPF = ctx.createBiquadFilter();
    windHPF.type = 'highpass';
    windHPF.frequency.value = 800;
    windHPF.Q.value = 1.0;

    windLPF = ctx.createBiquadFilter();
    windLPF.type = 'lowpass';
    windLPF.frequency.value = 2000;
    windLPF.Q.value = 2.0;

    windGain = ctx.createGain();
    windGain.gain.value = 0;

    windNoiseSource.connect(windHPF);
    windHPF.connect(windLPF);
    windLPF.connect(windGain);
    windGain.connect(masterGain);
    windNoiseSource.start();

    initialized = true;
  }

  function update(speed, boost) {
    if (!initialized) {
      if (!userHasInteracted) return;
      init();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const absSpeed = Math.abs(speed);
    const t = Math.min(absSpeed / 40, 1); // 0–1 normalized speed
    const now = ctx.currentTime;
    const smooth = 0.12; // smoothing time constant

    // Hull wash: louder and brighter with speed
    hullFilter.frequency.setTargetAtTime(60 + t * 500, now, smooth);
    hullGain.gain.setTargetAtTime(t * 0.12, now, smooth);

    // Splash: appears at medium speed, gets brighter
    const splashT = Math.max(0, (t - 0.2) / 0.8); // kicks in at 20% speed
    splashFilter.frequency.setTargetAtTime(1500 + splashT * 3000, now, smooth);
    splashGain.gain.setTargetAtTime(splashT * 0.04, now, smooth);

    // Wind whistle: only during boost
    const windT = Math.max(0, boost);
    windHPF.frequency.setTargetAtTime(600 + windT * 1200, now, smooth);
    windLPF.frequency.setTargetAtTime(1500 + windT * 2500, now, smooth);
    windGain.gain.setTargetAtTime(windT * 0.035, now, smooth);
  }

  function setVolume(v) {
    pendingVolume = v;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  return { update, setVolume };
}
