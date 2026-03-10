# Ocean Gang Implementation Progress

Updated: 2026-03-10

## Completed

- Replaced the remote `strudel.cc` iframe with a local embedded `@strudel/repl` instance.
- Kept the Strudel REPL and preset grid visible in the music panel at the same time.
- Unified music playback onto the embedded REPL runtime so the app no longer uses a separate `@strudel/web` playback path.
- Wired Ctrl+Enter / REPL evaluate into app state updates through `oceangang:music-scene-sync` and `oceangang:music-playback`.
- Made preset clicks load the same scene into the shared REPL and play through the same runtime.
- Wired the music volume slider to the shared Strudel output gain instead of rewriting scene code.
- Fixed soundfont fallback so high `gm_fx_crystal` notes can fall through to alternate font variants instead of hard-failing on one missing pitch zone.
- Added `src/patchParser.js` for extracting scene layers, stack order, params, complexity, and base material costs.
- Added `src/instruments.js` runtime registry for parsed scene catalogs, unlocked layers, scene-code sync, and persistence.
- Wired `main.js` so live REPL scene updates feed the instrument registry.
- Added an Instruments tab to the trading menu with stable island-to-scene assignment and material-based layer unlock purchases.

## In Progress

- Instrument trading system polish and persistence validation.
- Deeper parser robustness for more complex Strudel expressions.
- Music-system rebuild from unlock state rather than plain scene drafts.

## Started In This Pass

- Added `src/patchParser.js`.
- Added `src/instruments.js`.
- Extended `src/trading.js` with:
  - Industry / Instruments tabs
  - scene assignment per island
  - instrument list rendering
  - unlock purchases using existing material inventory
- Wired registry updates from music sync events in `src/main.js`.

## Next Steps

- Rebuild scene playback from unlocked layers so buying instruments changes what is actually heard.
- Add per-instrument parameter overrides and UI.
- Persist and restore materials explicitly.
- Add better parser coverage for nested/repeated method calls.
- Add live craft/diff flow for newly created REPL `let` blocks.

## Known Gaps

- Current scene playback still plays the full edited scene; instrument unlocks are tracked in the economy layer but do not yet gate audible layers.
- The parser is intentionally lightweight and may miss edge cases in complex nested Strudel expressions.
- Purchased instruments persist through the registry layer, but materials do not yet have separate persistence.
- Per-instrument parameter editing is not implemented yet.
