// ─── Strudel Music Panel — scenes, toggle, drag, resize, fade ───
import '@strudel/repl';
import { getSuperdoughAudioController } from 'superdough';
import { SOUND_OPTIONS, applySoundSwap, isSwappableSynth } from './patchParser.js';

export const MUSIC_SCENE_SYNC_EVENT = 'oceangang:music-scene-sync';
export const MUSIC_PLAYBACK_EVENT = 'oceangang:music-playback';
const SCENE_OVERRIDES_URL = '/music-scene-overrides.json';
const SCENE_SAVE_URL = '/__save_music_scene';

export const SCENES = {
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

stack(surf, ocarina, pad, chimes)`,

  'Night Voyage': `// dark water, distant melody, deep mystery
setcps(0.2)

let nightSurf = sound("<brown pink>")
  .gain(perlin.slow(32).range(0.04, 0.12))
  .lpf(sine.slow(20).range(60, 300))
  .hpf(25)
  .room(0.97).roomsize(0.95)

let nightOcarina = note("eb4 ~ ~ g4 ~ bb4 ~ ~ ab4 ~ ~ eb4 ~ ~ ~ ~")
  .s("sine").vib(4).vibmod(0.08)
  .slow(6).lpf(1400)
  .attack(0.25).decay(0.8).sustain(0.3).release(2)
  .delay(0.55).delaytime(0.5).delayfeedback(0.55)
  .room(0.95).gain(0.12)

let abyss = note("<[eb2,bb2] [ab2,eb3] [gb2,db3] [bb1,f2]>")
  .s("gm_pad_halo").slow(4)
  .lpf(perlin.range(200, 600).slow(24))
  .gain(0.22).room(0.9).roomsize(0.85)

let stars = note("~ ~ g6 ~ ~ ~ c7 ~ ~ ~ ~ eb6 ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(12)
  .gain(0.1)
  .delay(0.6).delaytime(0.625).delayfeedback(0.6)
  .room(0.98)

stack(nightSurf, nightOcarina, abyss, stars)`,

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

stack(tropicWaves, tropicFlute, tropicPad, tropicBells)`,

  'Storm Approaching': `// heavy swells, urgent melody, rumbling depths
setcps(0.35)

let stormSurf = s("bd bd")
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

stack(stormSurf, stormOcarina, thunder, stormWind, candy, crackles)`,

  // ─── Ambient Pirate Soundscapes ───

  'Drifting Shanty': `// slow accordion pads, gentle concertina melody, creaking hull
setcps(0.22)

let concertina = note("g4 ~ a4 b4 ~ d5 b4 ~ a4 ~ g4 ~ e4 ~ d4 ~")
  .s("sawtooth").slow(4)
  .lpf(sine.slow(12).range(600, 1400))
  .vib(5).vibmod(0.12)
  .attack(0.12).decay(0.4).sustain(0.5).release(1.2)
  .delay(0.35).delaytime(0.375).delayfeedback(0.35)
  .room(0.8).gain(0.14)

let accordionPad = note("<[g2,b2,d3] [c3,e3,g3] [d3,f#3,a3] [e3,g3,b3]>")
  .s("sawtooth").slow(3)
  .lpf(perlin.range(300, 900).slow(16))
  .attack(0.8).release(1.5)
  .gain(0.18).room(0.75).roomsize(0.7)

let hull = sound("brown")
  .gain(perlin.slow(20).range(0.02, 0.07))
  .lpf(sine.slow(14).range(60, 280))
  .hpf(25)
  .room(0.92).roomsize(0.85)

let creak = note("~ ~ c3 ~ ~ ~ ~ ~ ~ e3 ~ ~ ~ ~ ~ ~")
  .s("triangle").slow(8)
  .lpf(400).hpf(100)
  .attack(0.3).decay(1.5).sustain(0).release(0.5)
  .gain(0.06).room(0.9)

stack(concertina, accordionPad, hull, creak)`,

  'Harbor Bells': `// distant port bells, lapping water, warm lantern glow
setcps(0.18)

let harborWater = sound("<brown pink>")
  .gain(perlin.slow(28).range(0.04, 0.12))
  .lpf(sine.slow(18).range(100, 500))
  .hpf(40)
  .room(0.93).roomsize(0.88)

let bells = note("e5 ~ ~ ~ ~ b5 ~ ~ ~ ~ g5 ~ ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(6)
  .gain(perlin.slow(8).range(0.05, 0.16))
  .delay(0.55).delaytime(0.5).delayfeedback(0.5)
  .room(0.95)

let lantern = note("<[e3,g#3,b3] [a3,c#4,e4] [f#3,a3,c#4] [b2,d#3,f#3]>")
  .s("gm_pad_warm").slow(4)
  .lpf(perlin.range(350, 850).slow(20))
  .gain(0.21).room(0.85).roomsize(0.8)

let rigging = s("hh*4?0.08")
  .gain(rand.range(0.01, 0.05))
  .lpf(rand.range(2000, 6000)).hpf(1000)
  .delay(0.4).room(0.85)

stack(harborWater, bells, lantern, rigging)`,

  'Moonlit Cove': `// still water, sparse crystal drips, deep mystery
setcps(0.15)

let stillWater = sound("brown")
  .gain(perlin.slow(40).range(0.03, 0.09))
  .lpf(sine.slow(24).range(50, 250))
  .hpf(20)
  .room(0.97).roomsize(0.95)

let drips = note("~ c6 ~ ~ ~ ~ e6 ~ ~ ~ ~ ~ g5 ~ ~ ~")
  .s("gm_fx_crystal").slow(10)
  .gain(perlin.slow(6).range(0.05, 0.14))
  .delay(0.65).delaytime(0.625).delayfeedback(0.6)
  .room(0.98)

let moonPad = note("<[c3,e3,b3] [a2,e3,g3] [f2,c3,a3] [g2,d3,b3]>")
  .s("gm_pad_halo").slow(6)
  .lpf(perlin.range(200, 550).slow(28))
  .gain(0.21).room(0.95).roomsize(0.9)

let deepPulse = note("<c1 ~ g1 ~>/4")
  .s("sine").slow(8)
  .attack(3).release(5)
  .lpf(100)
  .gain(perlin.slow(20).range(0.06, 0.15))
  .room(0.97)

stack(stillWater, drips, moonPad, deepPulse)`,

  'Rum & Reverie': `// warm plucked strings, mellow bass, tavern afterglow
setcps(0.28)

let pluck = note("d4 ~ a4 ~ f#4 ~ e4 ~ d4 ~ b3 ~ a3 ~ ~ ~")
  .s("triangle").slow(4)
  .lpf(1800)
  .attack(0.005).decay(0.6).sustain(0.1).release(1)
  .delay(0.3).delaytime(0.25).delayfeedback(0.3)
  .room(0.7).gain(0.12)

let bassWarm = note("d2 ~ ~ a2 ~ ~ f#2 ~ ~ ~ e2 ~ ~ ~ ~ ~")
  .s("triangle").slow(4)
  .lpf(400)
  .attack(0.05).decay(0.4).sustain(0.6).release(0.8)
  .gain(0.22).room(0.5)

let warmPad = note("<[d3,f#3,a3] [g3,b3,d4] [a2,c#3,e3] [b2,d3,f#3]>")
  .s("gm_pad_warm").slow(3)
  .lpf(sine.range(400, 1000).slow(16))
  .gain(0.14).room(0.75).roomsize(0.65)

let murmur = sound("pink")
  .gain(perlin.slow(16).range(0.01, 0.03))
  .lpf(perlin.range(200, 800).slow(10))
  .hpf(80)
  .room(0.7)

stack(pluck, bassWarm, warmPad, murmur)`,

  'Foghorn Drift': `// deep foghorn drones, distant bells, ghostly atmosphere
setcps(0.12)

let foghorn = note("<c1 ~ ~ eb1 ~ ~ g1 ~ ~ ~ ~ ~>/2")
  .s("sawtooth").slow(8)
  .lpf(sine.slow(16).range(40, 120))
  .attack(3).release(5)
  .room(0.98).roomsize(0.97)
  .gain(perlin.slow(20).range(0.07, 0.2))

let ghostPad = note("<[c3,g3,bb3] [eb3,bb3,db4] [ab2,eb3,gb3] [bb2,f3,ab3]>")
  .s("gm_pad_halo").slow(6)
  .lpf(perlin.range(150, 500).slow(24))
  .gain(0.16).room(0.96).roomsize(0.92)

let fog = sound("<brown pink>")
  .gain(perlin.slow(32).range(0.04, 0.1))
  .lpf(sine.slow(20).range(60, 350))
  .hpf(20)
  .room(0.97).roomsize(0.95)

let distantBell = note("~ ~ ~ ~ ~ eb6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(12)
  .gain(0.08)
  .delay(0.7).delaytime(0.75).delayfeedback(0.6)
  .room(0.98)

stack(foghorn, ghostPad, fog, distantBell)`,

  'Treasure Map': `// music box melody — flowing adventure with gentle evolving sections
setcps(0.50)

// Main melody: the original phrase, then gentle variations that stay in E minor
// Each variation keeps the same rhythm and contour, just explores new notes
let musicBox = note("<[e5 g5 b5 a5 g5 f#5 e5 d5 e5 b4 d5 e5 a4 b4 g4 ~] [e5 g5 b5 a5 g5 f#5 e5 d5 e5 b4 d5 e5 a4 b4 g4 ~] [e5 a5 b5 g5 a5 f#5 e5 d5 e5 b4 d5 g5 a4 b4 e5 ~] [e5 g5 b5 d6 b5 a5 g5 e5 d5 b4 d5 e5 a4 b4 g4 ~]>")
  .s("sine").slow(4)
  .lpf(3000)
  .attack(0.003).decay(0.5).sustain(0.05).release(1.2)
  .delay(0.4).delaytime(0.375).delayfeedback(0.4)
  .room(0.85).gain(0.11)

// Counter-melody: weaves around the main melody, same key throughout
let musicBox2 = note("<[~ b5 ~ e6 d6 ~ b5 a5 ~ g5 a5 b5 ~ e5 ~ d5] [~ b5 ~ e6 d6 ~ b5 a5 ~ g5 a5 b5 ~ e5 ~ d5] [~ a5 ~ d6 b5 ~ a5 g5 ~ e5 g5 a5 ~ d5 ~ b4] [~ d6 ~ e6 d6 ~ b5 g5 ~ e5 g5 b5 ~ a5 ~ g5]>")
  .s("sine").slow(4)
  .lpf(2500)
  .attack(0.003).decay(0.4).sustain(0.05).release(1)
  .delay(0.45).delaytime(0.25).delayfeedback(0.35)
  .room(0.85).gain(0.07)

// Bass: stays rooted in E minor, gentle movement between E, B, A, D
let bassPluck = note("e3 ~ ~ b2 ~ ~ a2 ~ ~ ~ d3 ~ ~ ~ g2 ~")
  .s("triangle").slow(4)
  .lpf(600)
  .attack(0.005).decay(0.4).sustain(0.2).release(0.8)
  .gain(0.15).room(0.6)

// Pads: original progression, very slow cycling for smooth drift
let mysteryPad = note("<[e3,g3,b3] [c3,e3,a3] [d3,f#3,a3] [b2,e3,g3]>")
  .s("gm_pad_halo").slow(3)
  .lpf(perlin.range(300, 800).slow(16))
  .gain(0.12).room(0.8).roomsize(0.75)

// Sparkle: sparse deeper blips, warm and round
let sparkle = note("~ ~ b5 ~ ~ e6 ~ ~ g5 ~ ~ ~ d6 ~ a5 ~")
  .s("gm_fx_crystal").slow(8)
  .lpf(2500)
  .gain(0.05)
  .delay(0.5).delaytime(0.5).delayfeedback(0.55)
  .room(0.92)

// Sea breeze atmosphere
let seaBreeze = sound("pink")
  .gain(perlin.slow(24).range(0.01, 0.04))
  .lpf(sine.slow(14).range(120, 600))
  .hpf(60)
  .room(0.88).roomsize(0.8)

// Deep sub drone on E — very slow, barely perceptible, adds warmth
let drone = note("e2")
  .s("sine").slow(16)
  .attack(4).release(6)
  .lpf(perlin.range(60, 150).slow(20))
  .gain(perlin.slow(16).range(0.03, 0.07))
  .room(0.95).roomsize(0.9)

// Gentle high pad — slowly evolving color, appears and fades over long cycles
let shimmer = note("<[b4,e5] [a4,d5] [g4,b4] [e4,a4]>")
  .s("sine").slow(8)
  .lpf(sine.slow(20).range(800, 2000))
  .attack(1).decay(2).sustain(0.3).release(3)
  .gain(perlin.slow(24).range(0.02, 0.06))
  .delay(0.4).delaytime(0.5).delayfeedback(0.45)
  .room(0.9).roomsize(0.85)

stack(musicBox, musicBox2, bassPluck, mysteryPad, sparkle, seaBreeze, drone, shimmer)`,

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
  .gain(0.34)

let deepDrone = note("<c1 g1 eb1 bb0>")
  .s("sine").slow(8)
  .attack(4).release(6)
  .lpf(perlin.range(60, 200).slow(24))
  .gain(perlin.slow(16).range(0.04, 0.12))
  .room(0.98).roomsize(0.95)

let shimmer = note("~ c6 ~ ~ g5 ~ ~ eb6 ~ ~ ~ bb5 ~ ~ ~ ~")
  .s("gm_fx_crystal").slow(10)
  .gain(0.05)
  .delay(0.6).delaytime(0.625).delayfeedback(0.65)
  .room(0.97)

let haze = sound("<brown pink>")
  .gain(sine.slow(32).range(0.02, 0.06))
  .lpf(perlin.slow(16).range(80, 400))
  .hpf(30)
  .room(0.95).roomsize(0.9)

stack(filterBass, deepDrone, shimmer, haze)`,

  'Lo-Fi Horizon': `// Lo-fi chill beat with layered atmosphere
// Source: Nicholas Griffin — nicholasgriffin.dev
// "Creating Strudel Live Coding Patterns with AI" (2025)
// Adapted: swapped sample banks for built-in GM/synth sounds

setcps(0.34)

// dusty drums with subtle swing
let drums = s("bd*4,hh*8,[~ cp]!2")
  .bank("RolandTR707")
  .sometimesBy(0.2, x => x.gain(0.8))
  .room(0.4).gain(0.16)

// warm chord pads — gentle variation every 4 bars
let chords = note("<[c3,e3,g3,b3] [f3,a3,c4,e4] [a2,c3,e3,g3] [g2,b2,d3,f3]>")
  .s("gm_pad_warm").slow(2)
  .lpf(800)
  .room(0.7).gain(0.12)

// mellow bass with subtle movement
let bass = note("c2 ~ e2 ~ g2 ~ e2 ~")
  .s("triangle").slow(2)
  .lpf(200)
  .attack(0.05).decay(0.3).sustain(0.6).release(0.4)
  .gain(0.14)

// soft synth pad with filter automation
let pad = note("<[c3,g3] [f3,c4] [a2,e3] [g2,d3]>")
  .s("sawtooth").slow(4)
  .lpf(sine.range(200, 800).slow(16))
  .attack(1).release(2)
  .room(0.8).gain(0.07)

// vinyl crackle atmosphere
let crackle = sound("white")
  .lpf(perlin.range(800, 2000).slow(8))
  .hpf(400)
  .gain(perlin.slow(12).range(0.005, 0.02))
  .room(0.6)

stack(drums, chords, bass, pad, crackle)`,

  'Dark Frequencies': `// Dense electronic layers with atmospheric texture
// Source: Nicholas Griffin — nicholasgriffin.dev
// "Creating Strudel Live Coding Patterns with AI" (2025)
// Adapted: replaced unavailable samples with GM/synth equivalents

setcps(0.27)

// punchy kick foundation with syncopated accents
let kick = s("bd*4")
  .bank("RolandTR909")
  .gain("0.2 0.18 0.2 [0.18 0.22]")
  .shape(0.3).room(0.1)

// deep rolling bassline with filter modulation
let sub = note("c2 [c2 g2] eb2 [f2 eb2] c2 [c2 bb2] f2 [g2 f2]")
  .s("sawtooth").slow(2)
  .lpf(sine.slow(4).range(80, 400))
  .shape(0.4).distort(0.15)
  .lpf(perlin.slow(16).range(80, 1200))
  .gain(0.1)

// evolving hats with perlin gain
let hats = s("hh*8")
  .bank("RolandTR909")
  .gain(perlin.slow(8).range(0.06, 0.14))
  .hpf(8000)
  .pan(sine.slow(3).range(0.3, 0.7))
  .room(0.2)

// rhythmic stabs with filter sweep
let lead = note("<[d4 ~] [~ f4] [~ ~] [g4 ab4]>*2")
  .s("square")
  .gain(0.07)
  .shape(0.5).crush(6)
  .lpf(perlin.slow(8).range(400, 4000))
  .delay(0.125).delayfeedback(0.4)
  .room(0.4)
  .pan(cosine.slow(2).range(0.2, 0.8))

// clap accents with fills
let claps = s("[~ cp] ~ [~ cp] <~ [cp sd]*2>")
  .bank("RolandTR909")
  .gain(0.11)
  .shape(0.2).room(0.3).hpf(200)

// dark atmospheric noise layer
let atmosphere = sound("<brown pink>")
  .gain(sine.slow(32).range(0.01, 0.03))
  .lpf(perlin.slow(16).range(100, 600))
  .hpf(40)
  .room(0.9).roomsize(0.8)

stack(kick, sub, hats, lead, claps, atmosphere)`,
};

export function initMusicPanel(shipAudio, instrumentRegistry) {
  const panel = document.getElementById('music-panel');
  const nowPlaying = document.getElementById('music-now-playing');
  const nowPlayingTitle = document.getElementById('music-now-playing-title');
  const nowPlayingLabel = document.getElementById('music-now-playing-label');
  const prevBtn = document.getElementById('music-prev');
  const nextBtn = document.getElementById('music-next');
  const sceneScrubber = document.getElementById('music-scene-scrubber');
  const titlebar = document.getElementById('music-titlebar');
  const saveBtn = document.getElementById('music-save');
  const closeBtn = document.getElementById('music-close');
  const resizeHandle = document.getElementById('music-resize-handle');
  const editorWrap = document.getElementById('music-editor-wrap');
  const sceneSelect = document.getElementById('music-scene-select');
  const presetGrid = document.getElementById('music-preset-grid');
  const musicVolSlider = document.getElementById('music-vol');
  const sfxVolSlider = document.getElementById('sfx-vol');
  const instrumentsPanel = document.getElementById('music-instruments');

  let panelMode = 'hidden';
  let embeddedRepl = null;
  let replReadyPromise = null;
  let currentScene = null;
  let musicVolume = 1.0;
  let isPlaying = false;
  let isLoading = false;
  let suppressEditorSync = false;
  let loadSceneRequestId = 0;
  const sceneDrafts = Object.fromEntries(Object.entries(SCENES));

  const saveVariationBtn = document.getElementById('music-save-variation');
  const deleteVariationBtn = document.getElementById('music-delete-variation');

  // ── Variation tracking: each scene has an array of code strings ──
  const VARIATIONS_STORAGE_KEY = 'oceanGang_variations_v1';
  const sceneVariations = {};    // sceneName -> [code, code, ...]
  const sceneVariationIdx = {};  // sceneName -> current index

  const sceneNames = Object.keys(SCENES);
  sceneScrubber.max = Math.max(sceneNames.length - 1, 0);

  for (const name of sceneNames) {
    sceneVariations[name] = [SCENES[name]];
    sceneVariationIdx[name] = 0;
  }

  function saveVariations() {
    try {
      const data = {};
      for (const name of sceneNames) {
        const vars = sceneVariations[name];
        // Only persist scenes that have extra variations beyond the default
        if (vars && vars.length > 1) {
          data[name] = { variations: vars, idx: sceneVariationIdx[name] || 0 };
        } else if (vars && vars.length === 1 && vars[0] !== SCENES[name]) {
          // Edited default — persist it too
          data[name] = { variations: vars, idx: 0 };
        }
      }
      localStorage.setItem(VARIATIONS_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save variations:', err);
    }
  }

  function loadVariations() {
    try {
      const raw = localStorage.getItem(VARIATIONS_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const name of sceneNames) {
        if (!data[name]) continue;
        const { variations, idx } = data[name];
        if (Array.isArray(variations) && variations.length > 0) {
          sceneVariations[name] = variations;
          sceneVariationIdx[name] = Math.min(idx || 0, variations.length - 1);
          sceneDrafts[name] = variations[sceneVariationIdx[name]];
        }
      }
    } catch (err) {
      console.warn('Failed to load variations:', err);
    }
  }

  loadVariations();

  function getSceneCode(name) {
    const idx = sceneVariationIdx[name] || 0;
    return sceneVariations[name]?.[idx] || sceneDrafts[name] || SCENES[name];
  }

  function currentVariationCount(name) {
    return sceneVariations[name]?.length || 1;
  }

  function currentVariationIndex(name) {
    return (sceneVariationIdx[name] || 0) + 1;
  }

  function cycleVariation(name, direction) {
    const vars = sceneVariations[name];
    if (!vars || vars.length <= 1) return;
    const idx = sceneVariationIdx[name] || 0;
    sceneVariationIdx[name] = (idx + direction + vars.length) % vars.length;
    sceneDrafts[name] = vars[sceneVariationIdx[name]];
    saveVariations();
    updateCardStates();
    if (name === currentScene) {
      loadScene(name);
    }
  }

  async function loadProjectSceneDrafts() {
    try {
      const res = await fetch(SCENE_OVERRIDES_URL, { cache: 'no-store' });
      if (!res.ok) return;
      const saved = await res.json();
      for (const name of Object.keys(SCENES)) {
        if (typeof saved[name] === 'string') sceneDrafts[name] = saved[name];
      }
    } catch (err) {
      console.warn('Failed to load project scene overrides:', err);
    }
  }

  async function saveCurrentSceneDraft() {
    const sceneName = currentScene || sceneSelect.value;
    if (!sceneName || !embeddedRepl?.editor) return;
    const code = embeddedRepl.editor.code;
    const res = await fetch(SCENE_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneName, code }),
    });
    if (!res.ok) {
      throw new Error(`Save failed (${res.status})`);
    }
    sceneDrafts[sceneName] = code;
    emitMusicSceneSync(sceneName, sceneDrafts[sceneName], { source: 'music-save', playing: isPlaying });
    updateNowPlayingUi();
  }

  function syncMusicVolume() {
    const controller = getSuperdoughAudioController?.();
    const gainParam = controller?.output?.destinationGain?.gain;
    const audioContext = controller?.audioContext;
    if (!gainParam || !audioContext) return;
    gainParam.setTargetAtTime(musicVolume, audioContext.currentTime, 0.05);
  }

  function getSceneIndex(name = currentScene) {
    const index = sceneNames.indexOf(name);
    return index >= 0 ? index : 0;
  }

  function updateNowPlayingUi() {
    const activeName = currentScene || sceneNames[0] || 'No Scene';
    nowPlayingTitle.textContent = activeName;
    nowPlayingLabel.textContent = isLoading ? 'Loading' : isPlaying ? 'Now Playing' : 'Ready';
    sceneScrubber.value = String(getSceneIndex(activeName));
  }

  function emitMusicSceneSync(sceneName, code, { source, playing } = {}) {
    document.dispatchEvent(new CustomEvent(MUSIC_SCENE_SYNC_EVENT, {
      detail: {
        sceneName,
        code,
        source: source || 'music-panel',
        playing: !!playing,
      },
    }));
  }

  function emitPlaybackState(sceneName, playing, source = 'music-panel') {
    document.dispatchEvent(new CustomEvent(MUSIC_PLAYBACK_EVENT, {
      detail: {
        sceneName,
        playing,
        source,
      },
    }));
  }

  function persistEditorDraft(sceneName = currentScene) {
    if (embeddedRepl?.editor && sceneName) {
      sceneDrafts[sceneName] = embeddedRepl.editor.code;
    }
  }

  function syncEditorState(sceneName, code, playing) {
    if (!sceneName) return;
    sceneDrafts[sceneName] = code;
    isPlaying = playing;
    isLoading = false;
    emitMusicSceneSync(sceneName, code, { source: 'repl', playing });
    emitPlaybackState(sceneName, playing, 'repl');
    updateCardStates();
    updateNowPlayingUi();
  }

  function installReplHooks(repl) {
    const editor = repl.editor;
    if (!editor || editor.__oceanGangHooked) return;

    const originalStop = editor.stop.bind(editor);
    const originalEvaluate = editor.evaluate.bind(editor);
    editor.evaluate = async (autostart = true) => {
      const code = editor.code;
      const sceneName = currentScene || sceneSelect.value;
      currentScene = sceneName;
      sceneSelect.value = sceneName;
      isLoading = true;
      updateCardStates();
      try {
        if (autostart) {
          suppressEditorSync = true;
          await originalStop();
          suppressEditorSync = false;
        }
        const result = await originalEvaluate(autostart);
        syncEditorState(sceneName, code, autostart);
        return result;
      } catch (err) {
        suppressEditorSync = false;
        sceneDrafts[sceneName] = code;
        isPlaying = false;
        isLoading = false;
        emitMusicSceneSync(sceneName, code, { source: 'repl-error', playing: false });
        emitPlaybackState(sceneName, false, 'repl-error');
        updateCardStates();
        updateNowPlayingUi();
        throw err;
      }
    };

    editor.stop = async () => {
      const sceneName = currentScene;
      const result = await originalStop();
      if (!suppressEditorSync) {
        syncEditorState(sceneName, editor.code, false);
      }
      return result;
    };

    editor.__oceanGangHooked = true;
  }

  async function ensureEmbeddedRepl() {
    if (embeddedRepl?.editor) return embeddedRepl;
    if (replReadyPromise) return replReadyPromise;

    replReadyPromise = customElements.whenDefined('strudel-editor').then(async () => {
      if (!embeddedRepl) {
        embeddedRepl = document.createElement('strudel-editor');
        embeddedRepl.className = 'music-strudel-editor';
        editorWrap.replaceChildren(embeddedRepl);
      }

      const deadline = performance.now() + 5000;
      while (!embeddedRepl.editor) {
        if (performance.now() > deadline) {
          throw new Error('Timed out while booting embedded Strudel REPL');
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      embeddedRepl.nextElementSibling?.classList.add('music-repl-root');
      installReplHooks(embeddedRepl);
      // Enable hover tooltips (Ctrl+hover shows function docs)
      embeddedRepl.editor.changeSetting('isTooltipEnabled', true);
      syncMusicVolume();
      return embeddedRepl;
    });

    return replReadyPromise;
  }

  async function stopEmbeddedRepl() {
    if (embeddedRepl?.editor) {
      try {
        await embeddedRepl.editor.stop();
      } catch (err) {
        console.warn('Failed to stop embedded Strudel REPL:', err);
      }
    }
  }

  // ── Populate scene dropdown from SCENES ──
  sceneSelect.innerHTML = '';
  for (const name of sceneNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sceneSelect.appendChild(opt);
  }

  // ── Extract description from first comment line of each scene ──
  function getSceneDesc(name) {
    const code = SCENES[name];
    const match = code.match(/^\/\/\s*(.+)/);
    return match ? match[1] : '';
  }

  // ── Build preset grid ──
  function buildGrid() {
    presetGrid.innerHTML = '';
    for (const name of sceneNames) {
      const card = document.createElement('div');
      card.className = 'music-preset-card';
      if (name === currentScene) card.classList.add('playing');

      const title = document.createElement('div');
      title.className = 'music-preset-name';
      title.textContent = name;

      const desc = document.createElement('div');
      desc.className = 'music-preset-desc';
      desc.textContent = getSceneDesc(name);

      // ── Variation row: up/down + counter ──
      const varRow = document.createElement('div');
      varRow.className = 'music-var-row';

      const varDown = document.createElement('button');
      varDown.className = 'music-var-btn';
      varDown.textContent = '\u25BC';
      varDown.title = 'Previous variation';
      varDown.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleVariation(name, -1);
      });

      const varLabel = document.createElement('span');
      varLabel.className = 'music-var-label';
      const total = currentVariationCount(name);
      varLabel.textContent = total > 1 ? `${currentVariationIndex(name)}/${total}` : '1';

      const varUp = document.createElement('button');
      varUp.className = 'music-var-btn';
      varUp.textContent = '\u25B2';
      varUp.title = 'Next variation';
      varUp.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleVariation(name, 1);
      });

      varRow.appendChild(varDown);
      varRow.appendChild(varLabel);
      varRow.appendChild(varUp);

      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(varRow);

      card.addEventListener('click', () => toggleScene(name));

      presetGrid.appendChild(card);
    }
  }

  function updateCardStates() {
    for (const card of presetGrid.children) {
      const cardName = card.querySelector('.music-preset-name').textContent;
      const isActive = cardName === currentScene;
      card.classList.toggle('playing', isActive && isPlaying);
      card.classList.toggle('loading', isActive && isLoading);
      // Update variation label
      const varLabel = card.querySelector('.music-var-label');
      if (varLabel) {
        const total = currentVariationCount(cardName);
        varLabel.textContent = total > 1 ? `${currentVariationIndex(cardName)}/${total}` : '1';
      }
    }
    updateNowPlayingUi();
    refreshInstruments();
  }

  // ── Instruments panel for current scene ──
  function refreshInstruments() {
    if (!instrumentRegistry || !currentScene) {
      instrumentsPanel.innerHTML = '';
      return;
    }
    const sceneInstruments = instrumentRegistry.getScene(currentScene);
    if (!sceneInstruments.length) {
      instrumentsPanel.innerHTML = '';
      return;
    }

    const groups = {};
    for (const opt of SOUND_OPTIONS) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push(opt);
    }

    instrumentsPanel.innerHTML = `
      <div class="music-inst-header">Instruments</div>
      ${sceneInstruments.map((inst) => {
        const unlocked = instrumentRegistry.isUnlocked(currentScene, inst.varName);
        const swappable = unlocked && isSwappableSynth(inst.synthType);

        let actionHtml;
        if (swappable) {
          const currentSynth = inst.synthType;
          const optionsHtml = Object.entries(groups).map(([group, opts]) =>
            `<optgroup label="${group}">${opts.map((o) =>
              `<option value="${o.value}"${o.value === currentSynth ? ' selected' : ''}>${o.label}</option>`
            ).join('')}</optgroup>`
          ).join('');
          actionHtml = `<select class="music-inst-select" data-var="${inst.varName}">${optionsHtml}</select>`;
        } else if (unlocked) {
          actionHtml = `<span class="music-inst-owned">Owned</span>`;
        } else {
          actionHtml = `<span class="music-inst-locked">Locked</span>`;
        }

        return `
          <div class="music-inst-row${unlocked ? '' : ' music-inst-locked-row'}">
            <span class="music-inst-name">${unlocked ? '\u2713' : '\u266A'} ${inst.displayName}</span>
            ${actionHtml}
          </div>`;
      }).join('')}
    `;

    // Wire up sound swap selects
    instrumentsPanel.querySelectorAll('.music-inst-select').forEach((select) => {
      select.addEventListener('change', () => {
        const varName = select.dataset.var;
        const newSynth = select.value;
        const currentCode = instrumentRegistry.getSceneCode(currentScene);
        const newCode = applySoundSwap(currentCode, varName, newSynth);
        instrumentRegistry.setSceneCode(currentScene, newCode);
        document.dispatchEvent(new CustomEvent('oceangang:sound-swap', {
          detail: { sceneName: currentScene, code: newCode },
        }));
      });
    });
  }

  // ── Toggle play/stop for a scene via Strudel player ──
  async function toggleScene(name) {
    if (isLoading) return;

    if (currentScene === name && isPlaying) {
      await stopEmbeddedRepl();
      emitPlaybackState(currentScene, false, 'shared-repl');
      isPlaying = false;
      updateCardStates();
      return;
    }

    sceneSelect.value = name;
    await loadScene(name);
    isLoading = true;
    isPlaying = false;
    updateCardStates();

    try {
      const repl = await ensureEmbeddedRepl();
      await repl.editor.evaluate();
    } catch (err) {
      console.error('Strudel error:', err);
      isPlaying = false;
      isLoading = false;
      emitPlaybackState(name, false, 'shared-repl-error');
      updateNowPlayingUi();
    }
  }

  const initialScene = sceneNames.includes('Treasure Map') ? 'Treasure Map' : sceneNames[0];

  // ── Load scene into embedded REPL ──
  async function loadScene(name) {
    const requestId = ++loadSceneRequestId;
    const previousScene = currentScene;
    persistEditorDraft(previousScene);
    suppressEditorSync = true;
    await stopEmbeddedRepl();
    suppressEditorSync = false;
    if (requestId !== loadSceneRequestId) return;
    currentScene = name;
    sceneSelect.value = name;
    const repl = await ensureEmbeddedRepl();
    if (requestId !== loadSceneRequestId) return;
    repl.setAttribute('code', getSceneCode(name));
    isPlaying = false;
    isLoading = false;
    updateCardStates();
    updateNowPlayingUi();
  }

  async function stepScene(direction) {
    const currentIndex = getSceneIndex();
    const nextIndex = (currentIndex + direction + sceneNames.length) % sceneNames.length;
    const nextScene = sceneNames[nextIndex];
    await toggleScene(nextScene);
  }

  // ── Scene selector ──
  sceneSelect.addEventListener('change', (e) => {
    loadScene(e.target.value);
  });

  saveBtn.addEventListener('click', async () => {
    try {
      await saveCurrentSceneDraft();
      // Also update the current variation slot
      const name = currentScene || sceneSelect.value;
      if (name && sceneVariations[name]) {
        const idx = sceneVariationIdx[name] || 0;
        sceneVariations[name][idx] = sceneDrafts[name];
        saveVariations();
      }
      saveBtn.textContent = 'Saved';
      setTimeout(() => { saveBtn.textContent = 'Save'; }, 1000);
    } catch (err) {
      console.error(err);
      saveBtn.textContent = 'Error';
      setTimeout(() => { saveBtn.textContent = 'Save'; }, 1200);
    }
  });

  saveVariationBtn.addEventListener('click', async () => {
    const name = currentScene || sceneSelect.value;
    if (!name || !embeddedRepl?.editor) return;
    const code = embeddedRepl.editor.code;
    if (!sceneVariations[name]) sceneVariations[name] = [SCENES[name]];
    sceneVariations[name].push(code);
    sceneVariationIdx[name] = sceneVariations[name].length - 1;
    sceneDrafts[name] = code;
    saveVariations();
    updateCardStates();
    saveVariationBtn.textContent = 'Saved!';
    setTimeout(() => { saveVariationBtn.textContent = 'Save As Variation'; }, 1000);
  });

  deleteVariationBtn.addEventListener('click', () => {
    const name = currentScene || sceneSelect.value;
    if (!name || !sceneVariations[name]) return;
    const vars = sceneVariations[name];
    if (vars.length <= 1) return; // can't delete the only variation
    const idx = sceneVariationIdx[name] || 0;
    vars.splice(idx, 1);
    sceneVariationIdx[name] = Math.min(idx, vars.length - 1);
    sceneDrafts[name] = vars[sceneVariationIdx[name]];
    saveVariations();
    updateCardStates();
    loadScene(name);
  });

  // ── Volume sliders ──
  sfxVolSlider.addEventListener('input', (e) => {
    shipAudio.setVolume(e.target.value / 100);
  });

  musicVolSlider.addEventListener('change', async (e) => {
    musicVolume = e.target.value / 100;
    syncMusicVolume();
  });

  function applyPanelMode() {
    panel.classList.toggle('hidden', panelMode === 'hidden');
    panel.classList.toggle('music-panel-mini', panelMode === 'mini');
    if (panelMode !== 'hidden') panel.classList.remove('faded');
    updateNowPlayingUi();
  }

  function cyclePanelMode() {
    panelMode = panelMode === 'hidden' ? 'mini' : panelMode === 'mini' ? 'full' : 'hidden';
    applyPanelMode();
  }

  window.addEventListener('keydown', (e) => {
    if (isInsidePanel(e.target)) return;
    if (e.code === 'KeyM' && !e.repeat) {
      cyclePanelMode();
    }
  });

  closeBtn.addEventListener('click', () => {
    panelMode = 'hidden';
    applyPanelMode();
  });

  prevBtn.addEventListener('click', () => {
    stepScene(-1);
  });

  nextBtn.addEventListener('click', () => {
    stepScene(1);
  });

  sceneScrubber.addEventListener('input', (e) => {
    const index = Number(e.target.value) || 0;
    nowPlayingTitle.textContent = sceneNames[index] || '';
  });

  sceneScrubber.addEventListener('change', async (e) => {
    const index = Number(e.target.value) || 0;
    const nextScene = sceneNames[index];
    if (nextScene) await toggleScene(nextScene);
  });

  // ── Auto-play current scene on first forward press ──
  let autoPlayed = false;
  window.addEventListener('keydown', function onFirstForward(e) {
    if (autoPlayed) return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      autoPlayed = true;
      window.removeEventListener('keydown', onFirstForward);
      toggleScene(currentScene || sceneSelect.value || 'Treasure Map');
    }
  });

  // ── Block ALL game input while interacting with panel ──
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); });
  panel.addEventListener('keyup', (e) => { e.stopPropagation(); });
  panel.addEventListener('mousedown', (e) => { e.stopPropagation(); });
  panel.addEventListener('wheel', (e) => { e.stopPropagation(); });

  // ── Fade panel when clicking back to game ──
  window.addEventListener('mousedown', (e) => {
    if (panelMode === 'hidden') return;
    if (isInsidePanel(e.target)) {
      panel.classList.remove('faded');
    } else {
      panel.classList.add('faded');
    }
  });
  // Un-fade on hover
  panel.addEventListener('mouseenter', () => {
    if (panelMode !== 'hidden') panel.classList.remove('faded');
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
    if (panelMode === 'mini') return;
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
    if (panelMode === 'mini') return;
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

  async function initScenes() {
    await loadProjectSceneDrafts();
    buildGrid();
    if (initialScene) {
      currentScene = initialScene;
      sceneSelect.value = initialScene;
      await loadScene(initialScene);
    }
    updateNowPlayingUi();
  }

  // ── Refresh instruments when registry changes (e.g., bought at island) ──
  instrumentRegistry.subscribe(() => {
    refreshInstruments();
  });

  // ── Sound swap from trading UI ──
  document.addEventListener('oceangang:sound-swap', async (event) => {
    const { sceneName, code } = event.detail || {};
    if (!sceneName || !code) return;
    sceneDrafts[sceneName] = code;
    if (currentScene === sceneName) {
      const repl = await ensureEmbeddedRepl();
      repl.setAttribute('code', code);
      if (isPlaying) {
        try { await repl.editor.evaluate(); } catch (err) {
          console.warn('Sound swap re-evaluate failed:', err);
        }
      }
    }
  });

  applyPanelMode();
  initScenes();
}

function isInsidePanel(el) {
  return el && el.closest && el.closest('#music-panel');
}
