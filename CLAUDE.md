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
```

No test runner or linter is configured. Testing is manual in browser.

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
- `music.js` — Strudel live-coding editor embedded via iframe with preset scenes
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

Only two npm packages: **three** (r183+) and **vite** (7.3). Strudel is loaded externally via iframe.

## Performance Notes

`vite.config.js` has a custom plugin that captures perf reports POSTed to `/__perf_report` and writes `perf-report.json`. The `perfTracker` subsystem in-game profiles each subsystem's frame timing via `markStart`/`markEnd`.
