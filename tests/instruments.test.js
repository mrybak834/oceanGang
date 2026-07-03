import { describe, it, expect, beforeEach } from 'vitest';
import { createInstrumentRegistry } from '../src/instruments.js';
import { SCENES } from '../src/scenes.js';

// instruments.js persists to localStorage — give node a minimal in-memory one
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe('createInstrumentRegistry', () => {
  it('parses all scenes into the catalog', () => {
    const registry = createInstrumentRegistry(SCENES);
    expect(registry.getSceneNames()).toEqual(Object.keys(SCENES));
    for (const name of registry.getSceneNames()) {
      expect(registry.getScene(name).length).toBeGreaterThan(1);
    }
  });

  it('auto-unlocks only the base layer of each scene', () => {
    const registry = createInstrumentRegistry(SCENES);
    for (const name of registry.getSceneNames()) {
      const [base, ...rest] = registry.getScene(name);
      expect(registry.isUnlocked(name, base.varName)).toBe(true);
      for (const inst of rest) {
        expect(registry.isUnlocked(name, inst.varName)).toBe(false);
      }
      expect(registry.countUnlocked(name)).toBe(1);
    }
  });

  it('unlock() unlocks once, notifies, and persists across registries', () => {
    const registry = createInstrumentRegistry(SCENES);
    const events = [];
    registry.subscribe((e) => events.push(e.type));

    expect(registry.unlock('Treasure Map', 'sparkle')).toBe(true);
    expect(registry.unlock('Treasure Map', 'sparkle')).toBe(false); // already owned
    expect(events).toEqual(['unlock']);
    expect(registry.countUnlocked('Treasure Map')).toBe(2);

    // a fresh registry (same localStorage) restores the unlock
    const reloaded = createInstrumentRegistry(SCENES);
    expect(reloaded.isUnlocked('Treasure Map', 'sparkle')).toBe(true);
  });

  it('buildSceneCode returns only unlocked layers', () => {
    const registry = createInstrumentRegistry(SCENES);
    const gated = registry.buildSceneCode('Treasure Map');
    expect(gated).toContain('let musicBox =');
    expect(gated).not.toContain('let bassPluck =');
    expect(gated).toMatch(/stack\(musicBox\)/);

    registry.unlock('Treasure Map', 'bassPluck');
    const gated2 = registry.buildSceneCode('Treasure Map');
    expect(gated2).toContain('let bassPluck =');
    expect(gated2).toMatch(/stack\(musicBox, bassPluck\)/);
  });

  it('buildSceneCode gates a code override (edited draft) instead of the master', () => {
    const registry = createInstrumentRegistry(SCENES);
    const draft = SCENES['Treasure Map'].replace('.gain(0.11)', '.gain(0.5)');
    const gated = registry.buildSceneCode('Treasure Map', draft);
    expect(gated).toContain('.gain(0.5)');
    expect(gated).toMatch(/stack\(musicBox\)/);
  });

  it('setSceneCode reparses the scene and keeps the base unlocked', () => {
    const registry = createInstrumentRegistry(SCENES);
    const code = 'setcps(0.4)\n\nlet lead = note("c4").s("sine").gain(0.2)\n\nstack(lead)';
    registry.setSceneCode('Treasure Map', code);
    const instruments = registry.getScene('Treasure Map');
    expect(instruments.map((i) => i.varName)).toEqual(['lead']);
    expect(registry.isUnlocked('Treasure Map', 'lead')).toBe(true);
    expect(registry.getSceneCode('Treasure Map')).toBe(code);
  });

  it('overrides merge per instrument', () => {
    const registry = createInstrumentRegistry(SCENES);
    registry.setOverride('Treasure Map', 'musicBox', { gain: 0.2 });
    registry.setOverride('Treasure Map', 'musicBox', { lpf: 800 });
    expect(registry.getOverride('Treasure Map', 'musicBox')).toEqual({ gain: 0.2, lpf: 800 });
  });

  it('survives corrupt persisted state', () => {
    localStorage.setItem('oceanGang_instruments_v1', '{not json');
    const registry = createInstrumentRegistry(SCENES);
    expect(registry.getSceneNames().length).toBeGreaterThan(0);
  });
});
