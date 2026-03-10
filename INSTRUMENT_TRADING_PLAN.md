# Instrument Trading System — Implementation Plan

## Concept

Players trade resources (Wood, Stone, Iron, Gold) at islands to unlock instrument layers in Strudel music patches. Each patch starts sparse (only ambient layer) and grows richer as instruments are purchased. Unlocked instruments expose tweakable parameters (gain, filter, delay, reverb) as UI sliders.

---

## Data Architecture

### Instrument Registry (`src/instruments.js`)

Each instrument is defined by:

| Field | Description |
|---|---|
| `id` | Unique key, e.g. `"treasureMap.musicBox"` |
| `sceneId` | Which SCENE it belongs to |
| `varName` | The `let` variable name in the Strudel code string |
| `displayName` | Human-readable name |
| `tier` | 0 (free), 1, 2, or 3 |
| `cost` | `{ Wood: N, Stone: N, Iron: N, Gold: N }` |
| `unlocked` | Boolean, starts `true` for tier-0 |
| `tweakableParams` | Array of `{ name, label, min, max, step, default }` |
| `paramValues` | Current override values |

### Progression Tiers

- **Tier 0 (free)**: Ambient/base layers — sea breeze, surf, fog, crackle. Always playing.
- **Tier 1**: Bass and harmonic foundation. Cost: Wood + Stone.
- **Tier 2**: Primary melodies. Cost: Stone + Iron.
- **Tier 3**: Sparkle/accent layers. Cost: Iron + Gold.

### Example: Treasure Map

| Instrument | Tier | Cost |
|---|---|---|
| seaBreeze | 0 | free |
| bassPluck | 1 | 8 Wood, 4 Stone |
| mysteryPad | 1 | 6 Wood, 6 Stone |
| musicBox | 2 | 6 Stone, 8 Iron |
| musicBox2 | 2 | 8 Stone, 6 Iron |
| sparkle | 3 | 6 Iron, 10 Gold |

---

## Step-by-Step Implementation

### Step 1: Create Instrument Registry

**File**: New `src/instruments.js`

- Export `createInstrumentRegistry()` factory function
- Define `INSTRUMENT_DEFS` — flat array of all instruments across all scenes
- Assign tier 0 to each scene's ambient layer (surf, sea breeze, fog, etc.)
- Assign tiers 1-3 to remaining instruments per scene
- Return API: `{ getAll, getByScene, unlock, isUnlocked, setParam, getParams, serialize, deserialize }`

**Test**: Import module, call `getByScene('Treasure Map')`, verify 6 instruments with correct tiers.

---

### Step 2: Build Dynamic Code Generator

**File**: Inside `src/instruments.js`

- Export `buildSceneCode(sceneName, originalCode, registry)` function
- Parse the code string by splitting on `let varName =` boundaries
- For locked instruments: comment out their code block, remove from `stack()`
- For unlocked instruments with param overrides: regex-replace `.gain(N)`, `.lpf(N)`, `.delay(N)`, `.room(N)` with player values
- Rebuild `stack(...)` to only include unlocked variable names

**Parsing strategy**: Split on `/^let\s+(\w+)\s*=/m`. Each block runs until the next `let` or `stack(`. The `stack(...)` line is always last.

**Test**: With only `seaBreeze` unlocked, verify output code has one instrument in stack and others commented out. Evaluate in Strudel — should hear only pink noise ambient.

---

### Step 3: Wire Registry into Music System

**File**: Modify `src/music.js`

- Change `initMusicPanel(shipAudio)` → `initMusicPanel(shipAudio, instrumentRegistry)`
- In `toggleScene(name)`: use `buildSceneCode()` instead of raw `SCENES[name]`
- Same for volume slider handler and `loadScene()`
- Add unlock count badge on preset grid cards (e.g., "2/6")
- Register an `onUnlock` listener that re-evaluates the current scene when a new instrument is purchased

**File**: Modify `src/main.js`

- Import and create `instrumentRegistry`
- Pass it to both `initMusicPanel` and `createTradingSystem`

**Test**: Open music panel, play Treasure Map. Should hear only the ambient layer (sparse). Verify badge shows "1/6".

---

### Step 4: Add Instruments Tab to Trading Menu

**File**: Modify `src/trading.js`

- Accept `instrumentRegistry` as a 4th parameter
- Assign each island a scene: `sceneNames[islandIndex % sceneNames.length]`
- Add tab bar to trade card: "Industry | Instruments"
- Instruments tab lists all instruments for the island's assigned scene
- Each row shows: lock icon, name, cost (resources), Buy button
- Buy button checks `materials[resource] >= cost[resource]` for all resources

**File**: Add CSS to `src/style.css`

- `.trade-tab-bar` — flex row for tabs
- `.trade-tab` / `.trade-tab.active` — tab button styling
- `.trade-instrument-row` — instrument list row
- `.trade-instrument-locked` — dimmed locked styling
- `.trade-instrument-cost` — resource cost text

**Test**: Sail to island. Verify Instruments tab appears with correct scene. Verify locked instruments show costs. Buy button disabled when can't afford.

---

### Step 5: Implement Purchase Flow + Live Audio Update

**File**: `src/trading.js`

- Buy handler: deduct resources from `materials`, call `registry.unlock(id)`
- Refresh the menu after purchase

**File**: `src/instruments.js`

- `unlock()` calls registered `onUnlock` callbacks
- Music system's callback re-evaluates current scene code if it matches

**Cross-module communication**: Registry holds `onUnlock` callback array. Music registers a listener; trading triggers it via `registry.unlock()`. No direct imports between music.js and trading.js.

**Test**: Play Treasure Map (ambient only). Sail to island, buy Bass Pluck. Hear the bass layer appear in the live music without restart.

---

### Step 6: Instrument Parameter Panel

**File**: `src/music.js` + `src/style.css`

- Add "Configure" button on preset cards (visible when instruments are unlocked)
- Clicking opens a sub-panel replacing the preset grid (with "Back" button)
- Sub-panel lists each unlocked instrument with parameter sliders:
  - **Gain** — always available (0.0–0.5)
  - **Filter (lpf)** — if instrument has `.lpf(N)` (100–8000)
  - **Delay mix** — if instrument has `.delay(N)` (0.0–0.8)
  - **Reverb (room)** — if instrument has `.room(N)` (0.0–1.0)
- Slider `change` → `registry.setParam(id, name, value)` → debounced re-evaluate (300ms)
- Locked instruments shown dimmed with "(locked)" label

**Parameter application in `buildSceneCode`**:
- Static gain `.gain(0.15)` → direct replace
- Dynamic gain `.gain(perlin.range(0.03, 0.1))` → scale range endpoints by multiplier
- Same approach for lpf, delay, room

**Test**: Open configure panel, move gain slider. Verify audio level changes. Move filter slider. Verify timbre changes.

---

### Step 7: Persistence (localStorage)

**File**: `src/instruments.js`

- On every unlock and param change: `localStorage.setItem('oceanGang_instruments', JSON.stringify(registry.serialize()))`
- On init: load from localStorage, call `registry.deserialize(data)`

**File**: `src/trading.js`

- Persist `materials` to localStorage on change
- Load on init

**Test**: Unlock instrument, refresh page. Verify still unlocked. Tweak a parameter, refresh. Verify value persists.

---

### Step 8: Visual Polish + Feedback

**Files**: `src/trading.js`, `src/music.js`, `src/style.css`

- Toast notification on purchase: "Unlocked: Music Box"
- Progress bar on preset cards showing unlock fraction
- Locked instruments dimmed, unlocked instruments glow
- New instrument fades in (gain 0 → target over 2s) when purchased during playback
- Smooth CSS transitions on tab switching and panel state

---

## Module Dependency Graph

```
                    instruments.js (shared state)
                   /              \
           music.js              trading.js
          (reads registry,      (reads/writes registry,
           builds code,          handles purchases,
           param UI)             deducts resources)
                   \              /
                    main.js (wires everything)
```

## Progression Balance

- **46 purchasable instruments** (13 scenes × ~3-5 per scene, minus free tier-0)
- **Tier 1** (16 instruments): 6-10 Wood + 4-8 Stone → early game
- **Tier 2** (17 instruments): 6-10 Stone + 6-10 Iron → mid game
- **Tier 3** (13 instruments): 6-10 Iron + 8-12 Gold → late game

Musical journey mirrors gameplay: ambient → bass/harmony → melodies → sparkle/accents.

## Risk Areas

1. **Code parsing**: Instrument blocks reliably start with `let varName =`. Split on that regex.
2. **Dynamic gain expressions**: Detect static vs. dynamic patterns with separate regexes. Scale range endpoints for dynamic.
3. **Hot-reload**: `strudelEvaluate(newCode)` seamlessly transitions mid-playback. Already used by the volume slider.
4. **Island-scene mapping**: 32 islands, 13 scenes → some scenes at 2 islands, some at 3. Fine for exploration incentive.
