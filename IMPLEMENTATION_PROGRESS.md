# Ocean Gang Implementation Progress

Updated: 2026-07-03

## Completed

### Music runtime
- Replaced the remote `strudel.cc` iframe with a local embedded `@strudel/repl` instance.
- Unified music playback onto the embedded REPL runtime (no separate `@strudel/web` path).
- Wired Ctrl+Enter / REPL evaluate into app state via `oceangang:music-scene-sync` and `oceangang:music-playback`.
- Music volume slider drives the shared Strudel output gain.
- **Fixed (issue #1):** switching preset buttons no longer bleeds audio from the previous scene. Stopping now calls superdough's `resetGlobalEffects()`, which hard-kills all voices *and* effect tails (reverb/delay) instead of suspending every AudioContext on the page (which also silenced ship SFX). The AudioContext monkey-patch in `index.html` is gone.

### Instrument economy (tickets #13, #14)
- `src/patchParser.js` — parses Strudel patches into instruments (every `let` block = one instrument), auto-generates costs from complexity + stack position, builds gated code.
- **Fixed:** the block parser previously truncated every instrument to its first line (`\s*$` lookahead matched every line end), so synth types, params, complexity, and costs were wrong for multi-line instruments.
- `src/instruments.js` — registry with unlock state, scene-code sync, `buildSceneCode()` (gated playback code), persistence in localStorage.
- **Playback is gated by unlock state:** all evaluation paths (preset cards, Ctrl+Enter, scrubber) play only unlocked layers; the editor still shows the full scene. Buying a layer while its scene plays re-evaluates live, so the new instrument audibly joins.
- **Trading menu has Industry / Instruments tabs:** each island stocks the layers of its stably-assigned scene; Buy deducts materials and unlocks; owned swappable instruments get a sound-swap dropdown.
- Preset cards show an "n/m layers" unlock badge.
- Materials, island development levels, and stored production persist in localStorage (`oceanGang_trading_v1`).

### Infrastructure
- `vitest` test suite (`npm test`) covering the patch parser, cost tiers, gated-code builder, sound swap, and the instrument registry (24 tests). `vitest.config.js` is standalone so tests do not load the dev-server plugins.
- **Fixed:** `vite build` (and therefore the GitHub Pages deploy) had been broken since the SpacetimeDB refactor — `multiplayer.js` statically imported the gitignored generated bindings. Now loaded via `import.meta.glob`, so builds succeed without bindings and multiplayer degrades gracefully.
- CI runs `npm test` before building.
- Scene library extracted from `music.js` into `src/scenes.js`.
- Removed dead `src/strudelSoundfonts.js` (orphaned by the "single strudel" refactor) and the unused `@strudel/web` / `@strudel/soundfonts` dependencies; `superdough` is now an explicit dependency.

## Next Steps

- Per-instrument parameter override UI (registry `setOverride` exists; no sliders yet — ticket #25).
- Live craft/diff flow for new REPL `let` blocks (crafting costs — ticket #23).
- Deeper parser coverage for exotic nested Strudel expressions.
- Purchase toasts / unlock animations (ticket #39).

## Known Gaps

- Param overrides are stored but not yet applied to generated code.
- The parser is intentionally regex-based and may miss pathological nested expressions (covered scenes all parse correctly — see tests).
- Crates (the invest currency) are not persisted; materials and island levels are.
