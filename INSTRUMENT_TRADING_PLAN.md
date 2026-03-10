# Instrument Trading System — Implementation Plan

## Core Concept

The system is **fully dynamic** — it parses Strudel patch code strings to discover instruments automatically. No manual instrument definitions. Change a patch, the instrument inventory changes. The game is a roguelike of music layers.

**Key principles:**
- Every `let varName = ...` block in a patch IS an instrument
- The parser extracts: variable name, synth/sound type, note pattern, and all chained params
- Costs are auto-generated from instrument complexity (more params = more expensive)
- Islands are vendors — each island stocks instruments from a random scene
- Editing a patch in the live Strudel editor = crafting a new instrument (costs resources)
- First instrument in each patch is always free (the ambient bed)

---

## Step 1: Strudel Patch Parser

**File**: New `src/patchParser.js`

Parse a Strudel code string and return structured instrument data.

**Input**: Raw code string like `SCENES['Treasure Map']`

**Output**: Array of instrument objects:
```js
[
  {
    varName: 'musicBox',
    codeBlock: 'let musicBox = note("e5 g5...").s("sine")...',
    synthType: 'sine',           // extracted from .s("...") or sound("...")
    hasNotes: true,              // has note("...")
    params: {                    // all chained method calls found
      gain: { value: 0.15, dynamic: false },
      lpf: { value: 3000, dynamic: false },
      delay: { value: 0.4, dynamic: false },
      room: { value: 0.85, dynamic: false },
      attack: { value: 0.003, dynamic: false },
      // etc.
    },
    displayName: 'Music Box',   // varName → Title Case
    complexity: 8,               // number of chained params (drives cost)
  },
  // ...
]
```

**Parsing approach:**
1. Strip `setcps(...)` line and `stack(...)` line, extract the var names from `stack()`
2. Split remaining code on `/^let\s+/m` to get individual blocks
3. For each block: extract varName, find `.s("...")` or `sound("...")`, find `note("...")`, regex-match all `.method(value)` chains
4. Detect dynamic vs static params: if value contains `perlin`, `sine`, `rand`, `range` → dynamic
5. Compute complexity = count of chained method calls

**Test**: Parse "Treasure Map" → get 6 instruments with correct varNames and param maps.

---

## Step 2: Auto-Cost Generator

**File**: Inside `src/patchParser.js`

Generate resource costs from instrument complexity automatically.

**Algorithm:**
```
complexity = number of chained params
tier = based on position in stack():
  - index 0 → tier 0 (free, ambient base)
  - index 1-2 → tier 1 (Wood + Stone)
  - index 3-4 → tier 2 (Stone + Iron)
  - index 5+ → tier 3 (Iron + Gold)

baseCost = 4 + complexity * 2

tier 0: free
tier 1: { Wood: baseCost, Stone: baseCost * 0.6 }
tier 2: { Stone: baseCost * 0.8, Iron: baseCost }
tier 3: { Iron: baseCost * 0.6, Gold: baseCost }
```

Costs round to integers. Position in `stack()` determines tier because patches are authored with ambient first, foundation next, melody later, accents last.

**Test**: Parse any scene, verify tier-0 instrument has zero cost, tier-3 has Gold cost.

---

## Step 3: Instrument Registry (Runtime State)

**File**: New `src/instruments.js`

Thin runtime layer — calls the parser on all SCENES at init, manages unlock state and param overrides.

```js
export function createInstrumentRegistry(scenes) {
  // Parse all scenes at init
  const catalog = {};
  for (const [name, code] of Object.entries(scenes)) {
    catalog[name] = parseStrudelPatch(code); // from patchParser
  }

  const unlocked = new Set();  // set of "sceneName::varName" keys
  const paramOverrides = {};   // "sceneName::varName" → { gain: 0.2, ... }
  const listeners = [];

  // Auto-unlock tier-0 instruments
  for (const [scene, instruments] of Object.entries(catalog)) {
    if (instruments[0]) unlocked.add(`${scene}::${instruments[0].varName}`);
  }

  return {
    catalog,        // parsed instrument data per scene
    getScene(name) { return catalog[name] || []; },
    isUnlocked(scene, varName) { return unlocked.has(`${scene}::${varName}`); },
    unlock(scene, varName) { ... },
    setParam(scene, varName, param, value) { ... },
    getOverrides(scene, varName) { ... },
    onUnlock(fn) { listeners.push(fn); },
    serialize() { ... },
    deserialize(data) { ... },
  };
}
```

**Test**: Create registry from SCENES, verify all tier-0 instruments auto-unlocked.

---

## Step 4: Dynamic Code Builder

**File**: Inside `src/instruments.js`

Rebuild a Strudel code string based on unlock state and param overrides.

```js
function buildSceneCode(sceneName, originalCode, registry) {
  const instruments = registry.getScene(sceneName);
  const unlocked = instruments.filter(i => registry.isUnlocked(sceneName, i.varName));

  // Start with setcps line
  let code = originalCode.match(/^setcps\(.+\)/m)?.[0] + '\n\n';

  // Add only unlocked instrument blocks (with param overrides applied)
  for (const inst of unlocked) {
    let block = inst.codeBlock;
    const overrides = registry.getOverrides(sceneName, inst.varName);
    if (overrides) {
      for (const [param, value] of Object.entries(overrides)) {
        block = applyParamOverride(block, param, value);
      }
    }
    code += block + '\n\n';
  }

  // Rebuild stack with only unlocked varNames
  const names = unlocked.map(i => i.varName).join(', ');
  code += `stack(${names})`;

  return code;
}
```

**`applyParamOverride`**: Regex replaces `.param(staticValue)` with new value. For dynamic expressions like `.gain(perlin.range(0.03, 0.1))`, wraps as `.gain(perlin.range(${lo * scale}, ${hi * scale}))`.

**Test**: Build code for Treasure Map with 2/6 unlocked. Evaluate in Strudel — only 2 layers audible.

---

## Step 5: Wire into Music System

**File**: Modify `src/music.js`

- `initMusicPanel(shipAudio)` → `initMusicPanel(shipAudio, registry)`
- `toggleScene()` and volume handlers use `buildSceneCode()` instead of raw SCENES
- Registry `onUnlock` callback re-evaluates current scene live
- Preset grid cards show unlock badge: "2/6 layers"

**File**: Modify `src/main.js`

```js
import { createInstrumentRegistry } from './instruments.js';
const registry = createInstrumentRegistry(SCENES); // SCENES exported from music.js
// pass to both initMusicPanel and createTradingSystem
```

**Test**: Play a scene. Hear only the ambient layer. Verify sparser than before.

---

## Step 6: Instruments Tab in Trading Menu

**File**: Modify `src/trading.js`

Each island gets a scene assignment (seeded random from island position so it's stable):
```js
const sceneAssignment = sceneNames[hash(isl.x, isl.z) % sceneNames.length];
```

Trading menu gets two tabs: **Industry** (existing) | **Instruments** (new).

Instruments tab shows the parsed instruments for that island's scene:
```
┌──────────────────────────────┐
│ Quarry                  [×]  │
│ [Industry] [Instruments]     │
│                              │
│ ♪ Treasure Map               │
│                              │
│ ✓ Sea Breeze       free      │
│ ✓ Bass Pluck       owned     │
│ 🔒 Mystery Pad               │
│   6W 6S              [Buy]  │
│ 🔒 Music Box                 │
│   10S 12I             [Buy]  │
│                              │
│ W:12  S:8  I:5  G:2         │
└──────────────────────────────┘
```

- Instrument names come from the parser (varName → display name)
- Costs come from the auto-cost generator
- Buy button checks `materials >= cost`, deducts, calls `registry.unlock()`

**CSS**: Tab bar, instrument rows, lock/unlock states, cost labels.

**Test**: Sail to island, see Instruments tab, verify correct scene and parsed instruments listed.

---

## Step 7: Purchase Flow + Live Audio

**File**: `src/trading.js` buy handler

```js
buyBtn.addEventListener('click', () => {
  // Deduct resources
  for (const [res, amount] of Object.entries(inst.cost)) {
    materials[res] -= amount;
  }
  registry.unlock(sceneName, inst.varName);
  refreshMenu();
});
```

**File**: `src/music.js` listener

```js
registry.onUnlock((scene, varName) => {
  if (scene === currentScene && isPlaying) {
    // Re-evaluate with new instrument included
    const code = buildSceneCode(scene, SCENES[scene], registry);
    strudelPlay(stripViz(code));
  }
});
```

New instrument appears live in the music.

**Test**: Play Treasure Map. Buy an instrument at an island. Hear the new layer join the music.

---

## Step 8: Instrument Parameter UI

**File**: `src/music.js`

Add a "tweak" sub-panel in the music panel. Accessed via a configure button on preset cards.

For each unlocked instrument, show sliders for its **parsed** params:
- Only params that were found by the parser get sliders
- Slider range/step inferred from the parsed value:
  - `gain`: 0–0.5 (step 0.01)
  - `lpf`: 100–8000 (step 50)
  - `delay`: 0–0.8 (step 0.05)
  - `room`: 0–1.0 (step 0.05)
  - `attack`/`release`/`decay`: 0–5.0 (step 0.05)
- Locked instruments shown greyed out

On slider change → `registry.setParam()` → debounced `buildSceneCode()` + `strudelPlay()`.

**Test**: Open panel, move gain slider. Audio changes. All dynamic — add a new param to a patch, it auto-appears as a slider.

---

## Step 9: Live Editor = Crafting

**File**: Modify `src/music.js` editor mode

When the player edits a patch in the Strudel iframe/editor:
- On "evaluate" (play), re-parse the new code with `parseStrudelPatch()`
- Diff against the catalog: find new `let` blocks that didn't exist before
- Each new instrument block = **crafting** — costs resources based on auto-cost of the new block
- Show a confirmation dialog: "Craft 'myNewSynth'? Cost: 8 Stone, 12 Iron"
- If player can afford it → deduct resources, add to catalog, unlock it
- If can't afford → the new block is stripped from evaluation (plays without it)

This makes the live editor a creative tool that's gated by gameplay progression. More complex instruments you write cost more resources.

**Test**: Open editor, add a new `let myLead = note(...).s("square")...` block. Get prompted with cost. Pay it. Hear it play.

---

## Step 10: Persistence

**File**: `src/instruments.js`

```js
// Save on every state change
function save() {
  localStorage.setItem('oceanGang_instruments', JSON.stringify({
    unlocked: [...unlocked],
    overrides: paramOverrides,
  }));
}

// Load on init
function load() {
  const data = localStorage.getItem('oceanGang_instruments');
  if (data) deserialize(JSON.parse(data));
}
```

Also persist `materials` in `trading.js`.

**Test**: Unlock instruments, refresh. Still unlocked.

---

## Step 11: Visual Polish

- Toast on purchase: "Unlocked: Music Box"
- Preset cards: progress bar + "3/6" badge
- New instrument fades in over 2s (temporary gain ramp)
- Tab transitions in trading menu
- Locked instruments dimmed with lock icon
- Crafting confirmation dialog styled as parchment/pirate theme

---

## Module Dependency Graph

```
  patchParser.js (pure functions, no state)
       ↓
  instruments.js (runtime state, calls parser)
      ↙        ↘
music.js      trading.js
(plays code,  (buy/sell,
 param UI,     island vendors,
 editor)       resource deduction)
      ↘        ↙
     main.js (wires everything)
```

## Why This is Better

- **Zero manual instrument definitions** — add a `let` block to any patch, it auto-appears in the game
- **Self-balancing costs** — complex instruments cost more because they have more params
- **Roguelike feel** — each island offers a different scene's instruments, exploration reveals what's available
- **Live editor as gameplay** — writing music IS the endgame, gated by resources you earned sailing
- **Fully extensible** — add new patches, they just work. No code changes needed.
