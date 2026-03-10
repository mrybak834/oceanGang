// ─── Soundfont registration using @strudel/web's module instance ───
// This ensures registerSound hits the same registry as evaluate().
// We import webaudio functions from @strudel/web (which re-exports them)
// and only the GM data map from @strudel/soundfonts.

import {
  noteToMidi, freqToMidi, getSoundIndex,
  registerSound, getAudioContext,
  getParamADSR, getADSRValues,
  getPitchEnvelope, getVibratoOscillator,
  onceEnded, releaseAudioNode,
} from '@strudel/web';

import gm from '@strudel/soundfonts/gm.mjs';

const SOUNDFONT_URL = 'https://felixroos.github.io/webaudiofontdata/sound';

let loadCache = {};
async function loadFont(name) {
  if (loadCache[name]) return loadCache[name];
  loadCache[name] = (async () => {
    const url = `${SOUNDFONT_URL}/${name}.js`;
    const preset = await fetch(url).then(r => r.text());
    let [, data] = preset.split('={');
    return eval('{' + data);
  })();
  return loadCache[name];
}

function findZone(preset, pitch) {
  return preset.find(z => z.keyRangeLow <= pitch && z.keyRangeHigh + 1 >= pitch);
}

async function getBuffer(zone, ac) {
  if (zone.file) {
    const decoded = atob(zone.file);
    const buf = new ArrayBuffer(decoded.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < decoded.length; i++) view[i] = decoded.charCodeAt(i);
    return new Promise(resolve => ac.decodeAudioData(buf, resolve));
  }
}

let bufferCache = {};
async function getFontPitch(name, pitch, ac) {
  const key = `${name}:::${pitch}`;
  if (bufferCache[key]) return bufferCache[key];
  bufferCache[key] = (async () => {
    const preset = await loadFont(name);
    const zone = findZone(preset, pitch);
    if (!zone) throw new Error(`no zone for ${name} pitch ${pitch}`);
    const buffer = await getBuffer(zone, ac);
    if (!buffer) throw new Error(`no buffer for ${name} pitch ${pitch}`);
    return { buffer, zone };
  })();
  return bufferCache[key];
}

async function getFontBufferSource(names, value, ac) {
  let { note = 'c3', freq } = value;
  let midi;
  if (freq) midi = freqToMidi(freq);
  else if (typeof note === 'string') midi = noteToMidi(note);
  else if (typeof note === 'number') midi = note;
  else throw new Error(`unexpected note type "${typeof note}"`);

  const fontNames = Array.isArray(names) ? names : [names];
  let lastError = null;

  for (const name of fontNames) {
    try {
      const { buffer, zone } = await getFontPitch(name, midi, ac);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const baseDetune = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;
      src.playbackRate.value = Math.pow(2, (100 * midi - baseDetune) / 1200);
      if (zone.loopStart > 1 && zone.loopStart < zone.loopEnd) {
        src.loop = true;
        src.loopStart = zone.loopStart / zone.sampleRate;
        src.loopEnd = zone.loopEnd / zone.sampleRate;
      }
      return src;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`no playable soundfont found for pitch ${midi}`);
}

export function registerSoundfontsLocal() {
  Object.entries(gm).forEach(([name, fonts]) => {
    registerSound(
      name,
      async (time, value, onended) => {
        const [attack, decay, sustain, release] = getADSRValues([
          value.attack, value.decay, value.sustain, value.release,
        ]);
        const { duration } = value;
        const n = getSoundIndex(value.n, fonts.length);
        const orderedFonts = [fonts[n], ...fonts.filter((_, i) => i !== n)];
        const ctx = getAudioContext();
        const bufferSource = await getFontBufferSource(orderedFonts, value, ctx);
        bufferSource.start(time);
        const envGain = ctx.createGain();
        const node = bufferSource.connect(envGain);
        const holdEnd = time + duration;
        getParamADSR(node.gain, attack, decay, sustain, release, 0, 0.3, time, holdEnd, 'linear');
        const envEnd = holdEnd + release + 0.01;
        const vibratoHandle = getVibratoOscillator(bufferSource.detune, value, time);
        getPitchEnvelope(bufferSource.detune, value, time, holdEnd);
        bufferSource.stop(envEnd);
        const stop = () => {};
        onceEnded(bufferSource, () => {
          releaseAudioNode(bufferSource);
          vibratoHandle?.stop();
          onended();
        });
        return { node, stop, nodes: { source: [bufferSource], ...vibratoHandle?.nodes } };
      },
      { type: 'soundfont', prebake: true, fonts },
    );
  });
}
