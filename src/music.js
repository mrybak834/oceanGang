// ─── Strudel Music Panel — scenes, toggle, drag, resize, fade ───
import '@strudel/repl';
import { getSuperdoughAudioController, resetGlobalEffects } from 'superdough';
import { SOUND_OPTIONS, applySoundSwap, isSwappableSynth } from './patchParser.js';
import { SCENES } from './scenes.js';

export const MUSIC_SCENE_SYNC_EVENT = 'oceangang:music-scene-sync';
export const MUSIC_PLAYBACK_EVENT = 'oceangang:music-playback';
// Respect Vite's base path (/oceanGang/ on GitHub Pages) — an absolute /…
// URL would 404 whenever the app is served under a subpath.
const SCENE_OVERRIDES_URL = `${import.meta.env.BASE_URL}music-scene-overrides.json`;
const SCENE_SAVE_URL = '/__save_music_scene'; // dev-server middleware, mounted at root

export function initMusicPanel(shipAudio, instrumentRegistry) {
  const panel = document.getElementById('music-panel');
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

  // Hard-kill all Strudel audio: disconnects every orbit (voices AND effect
  // tails like reverb/delay) and rebuilds the output chain. Without this,
  // editor.stop() only halts the scheduler and already-triggered notes keep
  // ringing, which bled into the next scene when switching presets.
  function hardStopAudio() {
    try {
      resetGlobalEffects();
    } catch (err) {
      console.warn('Failed to reset Strudel audio graph:', err);
    }
    // reset recreates destinationGain at gain=1 — re-apply the volume slider
    syncMusicVolume();
  }

  async function resumeStrudelAudio() {
    const ctx = getSuperdoughAudioController?.()?.audioContext;
    if (ctx?.state === 'suspended') {
      await ctx.resume();
    }
  }

  // Code that should actually be evaluated for a scene: locked instrument
  // layers stripped, stack() rewritten to unlocked layers only.
  function gateSceneCode(sceneName, code) {
    if (!instrumentRegistry) return code;
    try {
      return instrumentRegistry.buildSceneCode(sceneName, code);
    } catch (err) {
      console.warn('Failed to gate scene code, playing full scene:', err);
      return code;
    }
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
          hardStopAudio();
          suppressEditorSync = false;
        }
        await resumeStrudelAudio();
        // The editor keeps the full scene; playback only gets unlocked layers
        const result = await editor.repl.evaluate(gateSceneCode(sceneName, code), autostart);
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
      hardStopAudio();
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
        await embeddedRepl.editor.stop(); // hooked stop also hard-kills audio
        return;
      } catch (err) {
        console.warn('Failed to stop embedded Strudel REPL:', err);
      }
    }
    hardStopAudio();
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

      const unlocks = document.createElement('div');
      unlocks.className = 'music-preset-unlocks';

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
      card.appendChild(unlocks);
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
      // Update unlock badge
      const unlocksEl = card.querySelector('.music-preset-unlocks');
      if (unlocksEl && instrumentRegistry) {
        const totalLayers = instrumentRegistry.getScene(cardName).length;
        unlocksEl.textContent = totalLayers > 1
          ? `${instrumentRegistry.countUnlocked(cardName)}/${totalLayers} layers`
          : '';
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
      await resumeStrudelAudio();
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

  // ── React to registry changes (e.g., instrument bought at an island) ──
  instrumentRegistry.subscribe(async ({ type, detail }) => {
    updateCardStates(); // also refreshes the instruments panel
    // A newly unlocked layer should join the currently playing scene live
    if (type === 'unlock' && detail.sceneName === currentScene && isPlaying && embeddedRepl?.editor) {
      try {
        await embeddedRepl.editor.evaluate();
      } catch (err) {
        console.warn('Re-evaluate after unlock failed:', err);
      }
    }
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
