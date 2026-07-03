# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

3D ocean sailing game built with Three.js and vanilla JavaScript. Features procedural island generation, physics-based boat handling, resource trading, procedural audio synthesis, and a live-coding music editor (Strudel).

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server with HMR (http://localhost:5173)
npm run build        # Production build to dist/
npm run preview      # Preview production build
npm test             # Vitest unit tests (parser, instrument registry)
npm run test:watch   # Vitest in watch mode
```

Unit tests live in `tests/` and cover the pure logic (Strudel patch parser, gated-code builder, instrument registry). `vitest.config.js` is intentionally standalone — vitest must NOT load `vite.config.js`, whose plugins spawn SpacetimeDB/tunnel processes. Gameplay/rendering testing is manual in browser. No linter is configured.

## Architecture

**Entry flow:** `index.html` → `src/main.js` (scene setup + animation loop) → all subsystem modules.

Every module exports a factory function (e.g., `createBoat()`, `createOcean()`) called from `main.js`. The render loop in `main.js` calls each subsystem's update method per frame.

**Core subsystems:**
- `boat.js` — 3D boat mesh (`createBoat`) and physics controller (`createBoatController`) with arcade physics (thrust, drag, quaternion-based rotation)
- `ocean.js` — Water shader (Three.js Water addon) + sky rendering + weather
- `islands.js` — Procedural island terrain via Simplex noise
- `crates.js` — Collectible crate spawning/collection near the boat
- `trading.js` — Island trading menu UI overlay and resource economy
- `wake.js` — Foam trail particle system with custom shader
- `windEffect.js` — Boost speed visual streaks (instanced meshes)

**Audio/UI subsystems:**
- `shipAudio.js` — Web Audio API synthesis (hull noise, splash) tied to boat speed
- `music.js` — music panel UI around an embedded `@strudel/repl` editor; playback is gated to unlocked instrument layers
- `scenes.js` — the Strudel scene library (each `let` block in a scene is one instrument layer)
- `patchParser.js` — pure functions: parse Strudel patches into instruments, auto-cost, gated-code builder, sound swap
- `instruments.js` — instrument registry: unlock state, scene-code sync, persistence (localStorage)
- `skySettings.js` — Slider panel for sky/ocean parameters (elevation, turbidity, water distortion)
- `perfTracker.js` — FPS/frame time/draw calls/memory monitor; reports saved to `perf-report.json` via custom Vite plugin
- `style.css` — All UI panel styling

## Key Conventions

- ES6 modules (`"type": "module"` in package.json)
- Factory function pattern for all modules — no classes
- Direct DOM manipulation for UI panels (no UI framework)
- UI visibility toggled via `.hidden` / `.perf-hidden` CSS classes
- camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants
- Section block comments: `── Section Name ──`
- Exponential smoothing for interpolation: `lerp()` with `1 - Math.exp()`

## Game Controls

WASD/Arrows = move, Shift = boost, Space = jump, M = music panel, G = sky settings, P = perf tracker, C = toggle camera mode, mouse drag = orbit camera, scroll = zoom.

## Dependencies

Runtime: **three** (r183+), **@strudel/repl** + **superdough** (embedded live-coding music), **spacetimedb** (multiplayer; client bindings are generated into `src/module_bindings/` by the dev-server plugin and are gitignored — production builds load them via `import.meta.glob` and degrade to single-player when absent). Dev: **vite** (7.3), **vitest**.

## Performance Notes

`vite.config.js` has a custom plugin that captures perf reports POSTed to `/__perf_report` and writes `perf-report.json`. The `perfTracker` subsystem in-game profiles each subsystem's frame timing via `markStart`/`markEnd`.
