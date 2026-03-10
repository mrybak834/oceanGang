// ─── Strudel Music Panel — scenes, toggle, drag, resize, fade ───

const SCENES = {
  'Calm Shores': `// gentle surf, drifting ocarina, warm pads
setcps(0.25)

let surf = sound("brown")
  .gain(perlin.slow(32).range(0.03, 0.1))
  .lpf(sine.slow(16).range(80, 350))
  .hpf(30)
  .room(0.95).roomsize(0.9)

let ocarina = note("c5 [~ eb5] g5 ~ ab5 [g5 ~] eb5 ~")
  .s("sine").vib(5).vibmod(0.15)
  .slow(4).lpf(1600)
  .attack(0.15).decay(0.5).sustain(0.4).release(1.5)
  .delay(0.45).delaytime(0.375).delayfeedback(0.4)
  .room(0.9).gain(0.15)

let pad = note("<[c3,eb3,g3] [f3,ab3,c4] [g3,bb3,d4] [eb3,g3,bb3]>")
  .s("gm_pad_warm").slow(2)
  .lpf(perlin.range(400, 1000).slow(16))
  .gain(0.22).room(0.8).roomsize(0.7)

let chimes = note("~ c6 ~ ~ ~ e6 ~ ~ ~ ~ g6 ~ ~ ~ a5 ~")
  .s("gm_fx_crystal").slow(8)
  .gain(0.12)
  .delay(0.5).delaytime(0.5).delayfeedback(0.5)
  .room(0.95)

stack(surf, ocarina, pad, chimes)
  .pianoroll({labels:1,active:'#88ccff',background:'transparent'})`,

  'Night Voyage': `// dark water, distant melody, deep mystery
setcps(0.2)

let nightSurf = sound("<brown pink>")
  .gain(perlin.slow(32).range(0.03, 0.1))
  .lpf(sine.slow(20).range(60, 300))
  .hpf(25)
  .room(0.97).roomsize(0.95)

let nightOcarina = note("eb4 ~ ~ g4 ~ bb4 ~ ~ ab4 ~ ~ eb4 ~ ~ ~ ~")
  .s("sine").vib(4).vibmod(0.08)
  .slow(6).lpf(1400)
  .attack(0.25).decay(0.8).sustain(0.3).release(2)
  .delay(0.55).delaytime(0.5).delayfeedback(0.55)
  .room(0.95).gain(0.1)

let abyss = note("<[eb2,bb2] [ab2,eb3] [gb2,db3] [bb1,f2]>")
  .s("gm_pad_halo").slow(4)
  .lpf(perlin.range(200, 600).slow(24))
  .gain(0.18).room(0.9).roomsize(0.85)

let stars = note("~ ~ g6 ~ ~ ~ c7 ~ ~ ~ ~ eb6 ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(12)
  .gain(0.08)
  .delay(0.6).delaytime(0.625).delayfeedback(0.6)
  .room(0.98)

stack(nightSurf, nightOcarina, abyss, stars)
  .spiral({steady:0.96})`,

  'Tropical Breeze': `// bright sun, playful ocarina, dancing light
setcps(0.3)

let tropicWaves = sound("pink")
  .gain(perlin.slow(24).range(0.02, 0.08))
  .lpf(sine.slow(10).range(150, 700))
  .hpf(80)
  .room(0.85).roomsize(0.6)

let tropicFlute = note("c5 e5 g5 a5 c6 a5 g5 e5")
  .s("triangle").vib(6).vibmod(0.1)
  .slow(2).lpf(3000)
  .attack(0.08).decay(0.3).sustain(0.5).release(0.9)
  .delay(0.35).delaytime(0.25).delayfeedback(0.3)
  .room(0.75).gain(0.18)

let tropicPad = note("<[c3,e3,g3] [f3,a3,c4] [a2,c3,e3] [g2,b2,d3]>")
  .s("gm_pad_warm").slow(2)
  .lpf(sine.range(500, 1500).slow(12))
  .gain(0.2).room(0.7)

let tropicBells = note("c6 ~ e6 ~ g6 ~ a6 ~")
  .s("gm_fx_crystal").slow(4)
  .gain(0.1)
  .delay(0.4).delaytime(0.375).delayfeedback(0.4)
  .room(0.9)

stack(tropicWaves, tropicFlute, tropicPad, tropicBells)
  .pianoroll({labels:1,active:'#ffaa44',background:'transparent'})`,

  'Storm Approaching': `// heavy swells, urgent melody, rumbling depths
setcps(0.35)

let stormSurf = sound("brown brown")
  .slow(2)
  .lpf(sine.range(150, 900).slow(6))
  .gain(perlin.slow(8).range(0.06, 0.18))
  .room(0.9).roomsize(0.95)
  .distort(0.08)

let stormOcarina = note("[c5 eb5] [g5 ab5] [bb5 g5] [eb5 c5]")
  .s("sawtooth").lpf(sine.range(1200, 2500).slow(8))
  .vib(7).vibmod(0.2)
  .slow(3)
  .attack(0.06).decay(0.4).sustain(0.6).release(0.7)
  .delay(0.3).delaytime(0.25).delayfeedback(0.3)
  .room(0.85).gain(0.12)

let thunder = note("<c1 ~ eb1 ~>/2")
  .s("sawtooth").lpf(sine.range(50, 150).slow(8))
  .attack(0.8).release(3)
  .room(0.95).roomsize(0.95)
  .gain(perlin.slow(12).range(0.0, 0.08))

let stormWind = sound("white")
  .lpf(perlin.slow(5).range(600, 3000))
  .hpf(400)
  .gain(perlin.slow(6).range(0.01, 0.05))
  .room(0.9)

// random ear candy — sporadic metallic pings and ghost notes
let candy = note("~ c6 ~ ~ ~ eb7 ~ ~ ~ g5 ~ ~ ~ ~ ab6 ~")
  .s("gm_fx_crystal")
  .slow(6)
  .sometimesBy(0.6, x=>x.gain(0))
  .gain(0.08)
  .delay(0.55).delaytime(0.5).delayfeedback(0.6)
  .room(0.95)

let crackles = s("hh*16?0.15")
  .gain(rand.range(0.02, 0.06))
  .lpf(rand.range(1000, 5000))
  .delay(0.4).room(0.8)

stack(stormSurf, stormOcarina, thunder, stormWind, candy, crackles)
  .scope({color:'#ff4444',thickness:2})`,

  // ─── Community patches (credited, open-source) ───

  'Perlin Depths': `// Complex filter envelope composition
// Source: strudel.cc/learn/effects — Strudel official docs (AGPL-3.0)
// Adapted for oceanic ambient context

setcps(0.2)

let filterBass = note("[c eb g <f bb>](3,8,<0 1>)".sub(12))
  .s("<sawtooth>/64")
  .lpf(sine.range(300, 2000).slow(16))
  .lpa(0.005)
  .lpd(perlin.range(0.02, 0.2))
  .lps(perlin.range(0, 0.5).slow(3))
  .lpq(sine.range(2, 10).slow(32))
  .release(0.5)
  .lpenv(perlin.range(1, 8).slow(2))
  .ftype('24db')
  .room(1)
  .juxBy(0.5, rev)
  .sometimes(add(note(12)))
  .gain(0.4)

let deepDrone = note("<c1 g1 eb1 bb0>")
  .s("sine").slow(8)
  .attack(4).release(6)
  .lpf(perlin.range(60, 200).slow(24))
  .gain(perlin.slow(16).range(0.05, 0.15))
  .room(0.98).roomsize(0.95)

let shimmer = note("~ c6 ~ ~ g5 ~ ~ eb6 ~ ~ ~ bb5 ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(10)
  .gain(0.06)
  .delay(0.6).delaytime(0.625).delayfeedback(0.65)
  .room(0.97)

let haze = sound("<brown pink>")
  .gain(sine.slow(32).range(0.02, 0.07))
  .lpf(perlin.slow(16).range(80, 400))
  .hpf(30)
  .room(0.95).roomsize(0.9)

stack(filterBass, deepDrone, shimmer, haze)
  .pianoroll({labels:1,active:'#66ffaa',background:'transparent'})`,

  'Lo-Fi Horizon': `// Lo-fi chill beat with layered atmosphere
// Source: Nicholas Griffin — nicholasgriffin.dev
// "Creating Strudel Live Coding Patterns with AI" (2025)
// Adapted: swapped sample banks for built-in GM/synth sounds

setcps(0.34)

// dusty drums with subtle swing
let drums = s("bd*4,hh*8,[~ cp]!2")
  .bank("RolandTR707")
  .sometimesBy(0.2, x => x.gain(0.8))
  .room(0.4).gain(0.45)

// warm chord pads — gentle variation every 4 bars
let chords = note("<[c3,e3,g3,b3] [f3,a3,c4,e4] [a2,c3,e3,g3] [g2,b2,d3,f3]>")
  .s("gm_pad_warm").slow(2)
  .lpf(800)
  .room(0.7).gain(0.35)

// mellow bass with subtle movement
let bass = note("c2 ~ e2 ~ g2 ~ e2 ~")
  .s("triangle").slow(2)
  .lpf(200)
  .attack(0.05).decay(0.3).sustain(0.6).release(0.4)
  .gain(0.4)

// soft synth pad with filter automation
let pad = note("<[c3,g3] [f3,c4] [a2,e3] [g2,d3]>")
  .s("sawtooth").slow(4)
  .lpf(sine.range(200, 800).slow(16))
  .attack(1).release(2)
  .room(0.8).gain(0.2)

// vinyl crackle atmosphere
let crackle = sound("white")
  .lpf(perlin.range(800, 2000).slow(8))
  .hpf(400)
  .gain(perlin.slow(12).range(0.005, 0.02))
  .room(0.6)

stack(drums, chords, bass, pad, crackle)
  .pianoroll({labels:1,active:'#e8a87c',background:'transparent'})`,

  'Dark Frequencies': `// Dense electronic layers with atmospheric texture
// Source: Nicholas Griffin — nicholasgriffin.dev
// "Creating Strudel Live Coding Patterns with AI" (2025)
// Adapted: replaced unavailable samples with GM/synth equivalents

setcps(0.27)

// punchy kick foundation with syncopated accents
let kick = s("bd*4")
  .bank("RolandTR909")
  .gain("1 0.9 1 [0.9 1.1]")
  .shape(0.3).room(0.1)

// deep rolling bassline with filter modulation
let sub = note("c2 [c2 g2] eb2 [f2 eb2] c2 [c2 bb2] f2 [g2 f2]")
  .s("sawtooth").slow(2)
  .lpf(sine.slow(4).range(80, 400))
  .shape(0.4).distort(0.15)
  .lpf(perlin.slow(16).range(80, 1200))
  .gain(0.5)

// evolving hats with perlin gain
let hats = s("hh*8")
  .bank("RolandTR909")
  .gain(perlin.slow(8).range(0.3, 0.7))
  .hpf(8000)
  .pan(sine.slow(3).range(0.3, 0.7))
  .room(0.2)

// rhythmic stabs with filter sweep
let lead = note("<[d4 ~] [~ f4] [~ ~] [g4 ab4]>*2")
  .s("square")
  .gain(0.35)
  .shape(0.5).crush(6)
  .lpf(perlin.slow(8).range(400, 4000))
  .delay(0.125).delayfeedback(0.4)
  .room(0.4)
  .pan(cosine.slow(2).range(0.2, 0.8))

// clap accents with fills
let claps = s("[~ cp] ~ [~ cp] <~ [cp sd]*2>")
  .bank("RolandTR909")
  .gain(0.55)
  .shape(0.2).room(0.3).hpf(200)

// dark atmospheric noise layer
let atmosphere = sound("<brown pink>")
  .gain(sine.slow(32).range(0.03, 0.1))
  .lpf(perlin.slow(16).range(100, 600))
  .hpf(40)
  .room(0.9).roomsize(0.8)

stack(kick, sub, hats, lead, claps, atmosphere)
  .scope({color:'#aa44ff',thickness:2})`,
};

function makeStrudelURL(code) {
  return `https://strudel.cc/#${encodeURIComponent(btoa(unescape(encodeURIComponent(code))))}`;
}

export function initMusicPanel() {
  const panel = document.getElementById('music-panel');
  const titlebar = document.getElementById('music-titlebar');
  const closeBtn = document.getElementById('music-close');
  const resizeHandle = document.getElementById('music-resize-handle');
  const editorWrap = document.getElementById('music-editor-wrap');
  const sceneSelect = document.getElementById('music-scene-select');

  let visible = false;
  let iframe = null;
  let currentScene = Object.keys(SCENES)[0];

  // ── Populate scene dropdown from SCENES ──
  sceneSelect.innerHTML = '';
  for (const name of Object.keys(SCENES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sceneSelect.appendChild(opt);
  }

  // ── Load scene into iframe ──
  function loadScene(name) {
    currentScene = name;
    const code = SCENES[name];
    const url = makeStrudelURL(code);

    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allow = 'autoplay';
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    editorWrap.appendChild(iframe);
  }

  // ── Scene selector ──
  sceneSelect.addEventListener('change', (e) => {
    loadScene(e.target.value);
  });

  // ── Toggle with M key ──
  function show() {
    visible = true;
    panel.classList.remove('hidden');
    panel.classList.remove('faded');
    if (!iframe) loadScene(currentScene);
  }

  function hide() {
    visible = false;
    panel.classList.add('hidden');
  }

  function togglePanel() {
    if (visible) hide(); else show();
  }

  window.addEventListener('keydown', (e) => {
    if (isInsidePanel(e.target)) return;
    if (e.code === 'KeyM' && !e.repeat) {
      togglePanel();
    }
  });

  closeBtn.addEventListener('click', hide);

  // ── Block ALL game input while interacting with panel ──
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); });
  panel.addEventListener('keyup', (e) => { e.stopPropagation(); });
  panel.addEventListener('mousedown', (e) => { e.stopPropagation(); });
  panel.addEventListener('wheel', (e) => { e.stopPropagation(); });

  // ── Fade panel when clicking back to game ──
  window.addEventListener('mousedown', (e) => {
    if (!visible) return;
    if (isInsidePanel(e.target)) {
      panel.classList.remove('faded');
    } else {
      panel.classList.add('faded');
    }
  });
  // Un-fade on hover
  panel.addEventListener('mouseenter', () => {
    if (visible) panel.classList.remove('faded');
  });

  // ── Drag titlebar to move panel ──
  let dragOffset = { x: 0, y: 0 };
  let dragging = false;

  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.music-btn') || e.target.closest('select')) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (dragging) {
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y)) + 'px';
    }
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    resizing = false;
  });

  // ── Resize from bottom-left handle ──
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0, left: 0, top: 0 };

  resizeHandle.addEventListener('mousedown', (e) => {
    resizing = true;
    const rect = panel.getBoundingClientRect();
    resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, left: rect.left, top: rect.top };
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = resizeStart.x - e.clientX;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(360, resizeStart.w + dx);
    const newH = Math.max(260, resizeStart.h + dy);
    const newLeft = resizeStart.left - (newW - resizeStart.w);

    panel.style.width = newW + 'px';
    panel.style.height = newH + 'px';
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = Math.max(0, newLeft) + 'px';
    panel.style.top = resizeStart.top + 'px';
  });
}

function isInsidePanel(el) {
  return el && el.closest && el.closest('#music-panel');
}
