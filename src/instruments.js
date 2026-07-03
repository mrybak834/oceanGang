import { parseStrudelPatch, buildGatedCode } from './patchParser.js';

const STORAGE_KEY = 'oceanGang_instruments_v1';

function cloneCatalog(catalog) {
  return Object.fromEntries(Object.entries(catalog).map(([scene, instruments]) => [
    scene,
    instruments.map((instrument) => ({ ...instrument, params: { ...instrument.params }, cost: { ...instrument.cost } })),
  ]));
}

export function createInstrumentRegistry(scenes) {
  const sceneCodes = { ...scenes };
  const catalog = {};
  const unlocked = new Set();
  const overrides = {};
  const listeners = new Set();

  function notify(type, detail = {}) {
    const snapshot = api.getSnapshot();
    for (const listener of listeners) {
      listener({ type, detail, snapshot });
    }
  }

  function parseScene(sceneName) {
    const code = sceneCodes[sceneName];
    const instruments = parseStrudelPatch(code);
    catalog[sceneName] = instruments;
    return instruments;
  }

  function autoUnlockBase(sceneName) {
    const first = catalog[sceneName]?.[0];
    if (!first) return;
    unlocked.add(`${sceneName}::${first.varName}`);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      unlocked: [...unlocked],
      overrides,
      sceneCodes,
    }));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.sceneCodes && typeof data.sceneCodes === 'object') {
        Object.assign(sceneCodes, data.sceneCodes);
      }
      if (Array.isArray(data.unlocked)) {
        data.unlocked.forEach((key) => unlocked.add(key));
      }
      if (data.overrides && typeof data.overrides === 'object') {
        Object.assign(overrides, data.overrides);
      }
    } catch (err) {
      console.warn('Failed to load instrument registry state:', err);
    }
  }

  load();
  Object.keys(sceneCodes).forEach((sceneName) => {
    parseScene(sceneName);
    autoUnlockBase(sceneName);
  });

  const api = {
    getScene(sceneName) {
      return catalog[sceneName] || [];
    },
    getSceneCode(sceneName) {
      return sceneCodes[sceneName] || '';
    },
    // Code that should actually play: locked layers stripped out.
    // Pass codeOverride to gate an edited/variation draft instead of the
    // registry's master copy.
    buildSceneCode(sceneName, codeOverride) {
      const code = typeof codeOverride === 'string' ? codeOverride : sceneCodes[sceneName] || '';
      return buildGatedCode(code, (varName) => api.isUnlocked(sceneName, varName));
    },
    countUnlocked(sceneName) {
      const instruments = catalog[sceneName] || [];
      return instruments.filter((inst) => unlocked.has(`${sceneName}::${inst.varName}`)).length;
    },
    getSceneNames() {
      return Object.keys(catalog);
    },
    isUnlocked(sceneName, varName) {
      return unlocked.has(`${sceneName}::${varName}`);
    },
    unlock(sceneName, varName) {
      const key = `${sceneName}::${varName}`;
      if (unlocked.has(key)) return false;
      unlocked.add(key);
      save();
      notify('unlock', { sceneName, varName });
      return true;
    },
    setSceneCode(sceneName, code) {
      if (!sceneName || typeof code !== 'string') return;
      sceneCodes[sceneName] = code;
      parseScene(sceneName);
      autoUnlockBase(sceneName);
      save();
      notify('scene-sync', { sceneName, code });
    },
    setOverride(sceneName, varName, patch) {
      const key = `${sceneName}::${varName}`;
      overrides[key] = { ...(overrides[key] || {}), ...patch };
      save();
      notify('override', { sceneName, varName, patch });
    },
    getOverride(sceneName, varName) {
      return overrides[`${sceneName}::${varName}`] || {};
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return {
        catalog: cloneCatalog(catalog),
        sceneCodes: { ...sceneCodes },
        unlocked: new Set(unlocked),
        overrides: JSON.parse(JSON.stringify(overrides)),
      };
    },
  };

  return api;
}
