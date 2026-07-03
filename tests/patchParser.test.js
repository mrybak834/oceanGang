import { describe, it, expect } from 'vitest';
import { SCENES } from '../src/scenes.js';
import {
  parseStrudelPatch,
  buildGatedCode,
  applySoundSwap,
  isSwappableSynth,
  SOUND_OPTIONS,
} from '../src/patchParser.js';

const TREASURE = SCENES['Treasure Map'];

describe('parseStrudelPatch', () => {
  it('finds every layer of Treasure Map in stack order', () => {
    const instruments = parseStrudelPatch(TREASURE);
    expect(instruments.map((i) => i.varName)).toEqual([
      'musicBox', 'musicBox2', 'bassPluck', 'mysteryPad',
      'sparkle', 'seaBreeze', 'drone', 'shimmer',
    ]);
  });

  it('extracts synth type from .s() and sound()', () => {
    const byName = Object.fromEntries(parseStrudelPatch(TREASURE).map((i) => [i.varName, i]));
    expect(byName.musicBox.synthType).toBe('sine');
    expect(byName.seaBreeze.synthType).toBe('pink'); // via sound("pink")
    expect(byName.mysteryPad.synthType).toBe('gm_pad_halo');
  });

  it('detects note-based vs noise layers', () => {
    const byName = Object.fromEntries(parseStrudelPatch(TREASURE).map((i) => [i.varName, i]));
    expect(byName.musicBox.hasNotes).toBe(true);
    expect(byName.seaBreeze.hasNotes).toBe(false);
  });

  it('extracts chained params and flags dynamic values', () => {
    const byName = Object.fromEntries(parseStrudelPatch(TREASURE).map((i) => [i.varName, i]));
    expect(byName.musicBox.params.lpf.value).toBe('3000');
    expect(byName.musicBox.params.lpf.dynamic).toBe(false);
    expect(byName.mysteryPad.params.lpf.dynamic).toBe(true); // perlin.range(...)
  });

  it('generates human display names', () => {
    const byName = Object.fromEntries(parseStrudelPatch(TREASURE).map((i) => [i.varName, i]));
    expect(byName.musicBox.displayName).toBe('Music Box');
    expect(byName.seaBreeze.displayName).toBe('Sea Breeze');
  });

  it('costs follow tiers: base free, early wood/stone, late iron/gold', () => {
    const instruments = parseStrudelPatch(TREASURE);
    expect(instruments[0].cost).toEqual({});
    expect(Object.keys(instruments[1].cost).sort()).toEqual(['Stone', 'Wood']);
    expect(Object.keys(instruments[3].cost).sort()).toEqual(['Iron', 'Stone']);
    const last = instruments[instruments.length - 1];
    expect(Object.keys(last.cost).sort()).toEqual(['Gold', 'Iron']);
    expect(Object.values(last.cost).every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });

  it('parses every bundled scene into at least two layers', () => {
    for (const [name, code] of Object.entries(SCENES)) {
      const instruments = parseStrudelPatch(code);
      expect(instruments.length, name).toBeGreaterThan(1);
      // every name referenced by stack() must have a parsed block
      const varNames = new Set(instruments.map((i) => i.varName));
      const stackMatch = code.match(/^stack\(([^)]*)\)/m);
      for (const stackName of stackMatch[1].split(',').map((s) => s.trim())) {
        expect(varNames.has(stackName), `${name}: ${stackName}`).toBe(true);
      }
    }
  });
});

describe('buildGatedCode', () => {
  it('returns original code untouched when everything is unlocked', () => {
    expect(buildGatedCode(TREASURE, () => true)).toBe(TREASURE);
  });

  it('strips locked blocks and rewrites stack() to unlocked layers', () => {
    const unlocked = new Set(['musicBox', 'bassPluck']);
    const gated = buildGatedCode(TREASURE, (v) => unlocked.has(v));

    expect(gated).toContain('let musicBox =');
    expect(gated).toContain('let bassPluck =');
    expect(gated).not.toContain('let musicBox2 =');
    expect(gated).not.toContain('let sparkle =');
    expect(gated).toMatch(/stack\(musicBox, bassPluck\)/);
    expect(gated).toContain('setcps(0.50)');
  });

  it('never gates down to silence — base layer plays when nothing is unlocked', () => {
    const gated = buildGatedCode(TREASURE, () => false);
    expect(gated).toContain('let musicBox =');
    expect(gated).toMatch(/stack\(musicBox\)/);
  });

  it('gated code for every scene keeps no locked let-blocks', () => {
    for (const [name, code] of Object.entries(SCENES)) {
      const base = parseStrudelPatch(code)[0].varName;
      const gated = buildGatedCode(code, (v) => v === base);
      const remaining = parseStrudelPatch(gated).map((i) => i.varName);
      expect(remaining, name).toEqual([base]);
      expect(gated, name).toContain(`stack(${base})`);
    }
  });

  it('handles empty/garbage input gracefully', () => {
    expect(buildGatedCode('', () => true)).toBe('');
    expect(buildGatedCode('setcps(1)', () => false)).toBe('setcps(1)');
  });
});

describe('applySoundSwap', () => {
  it('swaps only the targeted instrument .s()', () => {
    const swapped = applySoundSwap(TREASURE, 'musicBox', 'gm_flute');
    const byName = Object.fromEntries(parseStrudelPatch(swapped).map((i) => [i.varName, i]));
    expect(byName.musicBox.synthType).toBe('gm_flute');
    expect(byName.musicBox2.synthType).toBe('sine'); // untouched
  });

  it('swaps sound("...") style layers', () => {
    const swapped = applySoundSwap(TREASURE, 'seaBreeze', 'brown');
    const byName = Object.fromEntries(parseStrudelPatch(swapped).map((i) => [i.varName, i]));
    expect(byName.seaBreeze.synthType).toBe('brown');
  });
});

describe('isSwappableSynth', () => {
  it('accepts simple names, rejects patterns and empties', () => {
    expect(isSwappableSynth('sine')).toBe(true);
    expect(isSwappableSynth('gm_pad_warm')).toBe(true);
    expect(isSwappableSynth('<brown pink>')).toBe(false);
    expect(isSwappableSynth(null)).toBe(false);
  });

  it('every offered sound option is itself swappable', () => {
    for (const opt of SOUND_OPTIONS) {
      expect(isSwappableSynth(opt.value), opt.value).toBe(true);
    }
  });
});
