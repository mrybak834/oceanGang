// ─── Ship Water Audio — Web Audio synthesis tied to boat speed ───
// Brown noise hull wash + splash bubbles

export function createShipAudio() {
  let ctx = null;
  let initialized = false;
  let userHasInteracted = false;
  let pendingVolume = 0.35;

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
  // Ocean wave layers
  let closeWaveSrc, closeWaveLPF, closeWaveGain, closeWaveLFO, closeWaveLFOGain;
  let farWaveSrc, farWaveLPF, farWaveGain, farWaveLFO, farWaveLFOGain;
  let rumbleSrc, rumbleLPF, rumbleGain;
  let foamSrc, foamBPF, foamGain, foamLFO, foamLFOGain;
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

    // ── Ocean waves: 4-layer synthesis (close, far, rumble, foam) ──
    // Technique: filtered noise with asymmetric LFO amplitude modulation
    // Ref: syntherjack.net/ocean-noise-generator

    const brownBuf2 = makeBrownNoise(ctx, 6);
    const brownBuf3 = makeBrownNoise(ctx, 8);
    const whiteBuf2 = makeWhiteNoise(ctx, 5);

    // Layer 1 — Close waves: brown noise → LPF 800Hz, AM by ~0.14Hz triangle LFO
    // Simulates nearby waves crashing and receding
    closeWaveSrc = ctx.createBufferSource();
    closeWaveSrc.buffer = brownBuf2;
    closeWaveSrc.loop = true;

    closeWaveLPF = ctx.createBiquadFilter();
    closeWaveLPF.type = 'lowpass';
    closeWaveLPF.frequency.value = 800;
    closeWaveLPF.Q.value = 0.5;

    closeWaveGain = ctx.createGain();
    closeWaveGain.gain.value = 0.03; // base level

    closeWaveLFO = ctx.createOscillator();
    closeWaveLFO.type = 'triangle';
    closeWaveLFO.frequency.value = 0.14; // ~7 sec per wave

    closeWaveLFOGain = ctx.createGain();
    closeWaveLFOGain.gain.value = 0.05; // swells 0.03 ± 0.05

    closeWaveLFO.connect(closeWaveLFOGain);
    closeWaveLFOGain.connect(closeWaveGain.gain);

    closeWaveSrc.connect(closeWaveLPF);
    closeWaveLPF.connect(closeWaveGain);
    closeWaveGain.connect(masterGain);
    closeWaveSrc.start();
    closeWaveLFO.start();

    // Layer 2 — Far waves: brown noise → LPF 250Hz, AM by ~0.06Hz triangle LFO
    // Deep distant rumbling swells
    farWaveSrc = ctx.createBufferSource();
    farWaveSrc.buffer = brownBuf3;
    farWaveSrc.loop = true;

    farWaveLPF = ctx.createBiquadFilter();
    farWaveLPF.type = 'lowpass';
    farWaveLPF.frequency.value = 250;
    farWaveLPF.Q.value = 0.3;

    farWaveGain = ctx.createGain();
    farWaveGain.gain.value = 0.02; // base level

    farWaveLFO = ctx.createOscillator();
    farWaveLFO.type = 'triangle';
    farWaveLFO.frequency.value = 0.06; // ~16 sec per wave

    farWaveLFOGain = ctx.createGain();
    farWaveLFOGain.gain.value = 0.04; // swells 0.02 ± 0.04

    farWaveLFO.connect(farWaveLFOGain);
    farWaveLFOGain.connect(farWaveGain.gain);

    farWaveSrc.connect(farWaveLPF);
    farWaveLPF.connect(farWaveGain);
    farWaveGain.connect(masterGain);
    farWaveSrc.start();
    farWaveLFO.start();

    // Layer 3 — Background rumble: brown noise → LPF 150Hz, constant gain
    // The always-present ocean floor
    rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = brownBuf;
    rumbleSrc.loop = true;

    rumbleLPF = ctx.createBiquadFilter();
    rumbleLPF.type = 'lowpass';
    rumbleLPF.frequency.value = 150;
    rumbleLPF.Q.value = 0.3;

    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.04;

    rumbleSrc.connect(rumbleLPF);
    rumbleLPF.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleSrc.start();

    // Layer 4 — Foam/spray: white noise → BPF 3kHz, AM by ~0.1Hz LFO
    // High-frequency fizz of breaking wave foam
    foamSrc = ctx.createBufferSource();
    foamSrc.buffer = whiteBuf2;
    foamSrc.loop = true;

    foamBPF = ctx.createBiquadFilter();
    foamBPF.type = 'bandpass';
    foamBPF.frequency.value = 3000;
    foamBPF.Q.value = 0.5;

    foamGain = ctx.createGain();
    foamGain.gain.value = 0.005; // base — very subtle

    foamLFO = ctx.createOscillator();
    foamLFO.type = 'triangle';
    foamLFO.frequency.value = 0.1;

    foamLFOGain = ctx.createGain();
    foamLFOGain.gain.value = 0.012; // swells with close waves

    foamLFO.connect(foamLFOGain);
    foamLFOGain.connect(foamGain.gain);

    foamSrc.connect(foamBPF);
    foamBPF.connect(foamGain);
    foamGain.connect(masterGain);
    foamSrc.start();
    foamLFO.start();

    // ── Water laps: noise bursts with filter sweeps, randomly triggered ──
    // Technique: white noise → sweeping lowpass + bandpass body → gain envelope
    // Creates "shhhh" swoosh sounds like water lapping against the hull
    waterNoiseBuf = makeWhiteNoise(ctx, 2);
    startWaterLaps();

    initialized = true;
  }

  function ensureReady() {
    if (!initialized) {
      if (!userHasInteracted) return false;
      init();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return true;
  }

  let waterNoiseBuf = null;

  function startWaterLaps() {
    scheduleLap();
  }

  function scheduleLap() {
    const delay = 2 + Math.random() * 4; // 2–6 sec between laps
    setTimeout(() => {
      if (!ctx || ctx.state === 'closed') return;
      triggerWaterLap();
      scheduleLap();
    }, delay * 1000);
  }

  function triggerWaterLap() {
    const now = ctx.currentTime;
    const duration = 0.4 + Math.random() * 0.8; // 400–1200ms
    const vol = 0.02 + Math.random() * 0.03;    // subtle

    // ─ Layer 1: swoosh — noise through sweeping lowpass (the "shhhh") ─
    const swooshSrc = ctx.createBufferSource();
    swooshSrc.buffer = waterNoiseBuf;
    swooshSrc.playbackRate.value = 0.7 + Math.random() * 0.6;

    const swooshLPF = ctx.createBiquadFilter();
    swooshLPF.type = 'lowpass';
    swooshLPF.Q.value = 0.7;
    // Filter opens then closes — simulates wave washing in and receding
    swooshLPF.frequency.setValueAtTime(150, now);
    swooshLPF.frequency.linearRampToValueAtTime(800 + Math.random() * 600, now + duration * 0.3);
    swooshLPF.frequency.linearRampToValueAtTime(100, now + duration);

    const swooshGain = ctx.createGain();
    // Amplitude: ramp up, hold, fade out
    swooshGain.gain.setValueAtTime(0.0001, now);
    swooshGain.gain.linearRampToValueAtTime(vol, now + duration * 0.15);
    swooshGain.gain.setValueAtTime(vol, now + duration * 0.35);
    swooshGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    swooshSrc.connect(swooshLPF);
    swooshLPF.connect(swooshGain);
    swooshGain.connect(masterGain);

    // ─ Layer 2: body — noise through bandpass for midrange wet character ─
    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = waterNoiseBuf;
    bodySrc.playbackRate.value = 0.5 + Math.random() * 0.5;

    const bodyBPF = ctx.createBiquadFilter();
    bodyBPF.type = 'bandpass';
    bodyBPF.frequency.value = 300 + Math.random() * 200;
    bodyBPF.Q.value = 1.2;

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(vol * 0.7, now + duration * 0.2);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.8);

    bodySrc.connect(bodyBPF);
    bodyBPF.connect(bodyGain);
    bodyGain.connect(masterGain);

    // ─ Layer 3: hiss — high-freq fizz for foam on the crest ─
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = waterNoiseBuf;
    hissSrc.playbackRate.value = 1 + Math.random() * 0.5;

    const hissHPF = ctx.createBiquadFilter();
    hissHPF.type = 'highpass';
    hissHPF.frequency.value = 2000;
    hissHPF.Q.value = 0.3;

    const hissLPF = ctx.createBiquadFilter();
    hissLPF.type = 'lowpass';
    hissLPF.frequency.value = 5000;

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, now);
    hissGain.gain.linearRampToValueAtTime(vol * 0.25, now + duration * 0.25);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.6);

    hissSrc.connect(hissHPF);
    hissHPF.connect(hissLPF);
    hissLPF.connect(hissGain);
    hissGain.connect(masterGain);

    // Start and stop all layers
    const stopTime = now + duration + 0.05;
    swooshSrc.start(now);
    swooshSrc.stop(stopTime);
    bodySrc.start(now);
    bodySrc.stop(stopTime);
    hissSrc.start(now);
    hissSrc.stop(stopTime);
  }

  function playJump() {
    if (!ensureReady()) return;

    const now = ctx.currentTime;
    const duration = 0.22;

    const whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = waterNoiseBuf;
    whooshSrc.playbackRate.setValueAtTime(1.15, now);
    whooshSrc.playbackRate.exponentialRampToValueAtTime(0.72, now + duration);

    const whooshHPF = ctx.createBiquadFilter();
    whooshHPF.type = 'highpass';
    whooshHPF.frequency.setValueAtTime(450, now);
    whooshHPF.frequency.exponentialRampToValueAtTime(1800, now + duration * 0.7);

    const whooshLPF = ctx.createBiquadFilter();
    whooshLPF.type = 'lowpass';
    whooshLPF.frequency.setValueAtTime(4200, now);
    whooshLPF.frequency.exponentialRampToValueAtTime(1400, now + duration);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const chirpOsc = ctx.createOscillator();
    chirpOsc.type = 'triangle';
    chirpOsc.frequency.setValueAtTime(180, now);
    chirpOsc.frequency.exponentialRampToValueAtTime(320, now + 0.06);
    chirpOsc.frequency.exponentialRampToValueAtTime(110, now + duration);

    const chirpGain = ctx.createGain();
    chirpGain.gain.setValueAtTime(0.0001, now);
    chirpGain.gain.exponentialRampToValueAtTime(0.018, now + 0.02);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    whooshSrc.connect(whooshHPF);
    whooshHPF.connect(whooshLPF);
    whooshLPF.connect(whooshGain);
    whooshGain.connect(masterGain);

    chirpOsc.connect(chirpGain);
    chirpGain.connect(masterGain);

    const stopTime = now + duration + 0.05;
    whooshSrc.start(now);
    whooshSrc.stop(stopTime);
    chirpOsc.start(now);
    chirpOsc.stop(stopTime);
  }

  function playSplash(intensity = 1) {
    if (!ensureReady()) return;

    const clamped = Math.max(0.35, Math.min(intensity, 1.4));
    const now = ctx.currentTime;
    const duration = 0.45 + clamped * 0.18;

    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = waterNoiseBuf;
    bodySrc.playbackRate.setValueAtTime(0.65 + Math.random() * 0.1, now);

    const bodyBPF = ctx.createBiquadFilter();
    bodyBPF.type = 'bandpass';
    bodyBPF.frequency.setValueAtTime(500 + clamped * 220, now);
    bodyBPF.Q.value = 0.9;

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.08 * clamped, now + 0.03);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const spraySrc = ctx.createBufferSource();
    spraySrc.buffer = waterNoiseBuf;
    spraySrc.playbackRate.setValueAtTime(1.2 + Math.random() * 0.2, now);

    const sprayHPF = ctx.createBiquadFilter();
    sprayHPF.type = 'highpass';
    sprayHPF.frequency.setValueAtTime(1400, now);

    const sprayLPF = ctx.createBiquadFilter();
    sprayLPF.type = 'lowpass';
    sprayLPF.frequency.setValueAtTime(5200, now);
    sprayLPF.frequency.exponentialRampToValueAtTime(1800, now + duration);

    const sprayGain = ctx.createGain();
    sprayGain.gain.setValueAtTime(0.0001, now);
    sprayGain.gain.exponentialRampToValueAtTime(0.05 * clamped, now + 0.02);
    sprayGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.85);

    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(95 + clamped * 15, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(42, now + duration * 0.45);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.03 * clamped, now + 0.015);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.35);

    bodySrc.connect(bodyBPF);
    bodyBPF.connect(bodyGain);
    bodyGain.connect(masterGain);

    spraySrc.connect(sprayHPF);
    sprayHPF.connect(sprayLPF);
    sprayLPF.connect(sprayGain);
    sprayGain.connect(masterGain);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(masterGain);

    const stopTime = now + duration + 0.05;
    bodySrc.start(now);
    bodySrc.stop(stopTime);
    spraySrc.start(now);
    spraySrc.stop(stopTime);
    thumpOsc.start(now);
    thumpOsc.stop(stopTime);
  }

  function update(speed, boost) {
    if (!ensureReady()) return;

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
  }

  function setVolume(v) {
    pendingVolume = v;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  return { update, setVolume, playJump, playSplash };
}
