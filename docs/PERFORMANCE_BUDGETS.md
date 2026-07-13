# MVP performance budgets

Status: **provisional gates, not measured acceptance claims**. Audited at `7653b97` on 2026-07-13.

## Enforced bounds today

| Resource | Current bound | Source / meaning |
|---|---:|---|
| Concurrent client enemies | 13 | `CFG.MAX_ENEMIES`; additional wave enemies remain queued. |
| Particle slots | 700 | Fixed particle pool in `js/game.js`. |
| Co-op players | 4 | Room contract. |
| DO canonical enemies | 160 | Network abuse/snapshot cap, not a render target. |
| DO canonical pickups | 240 | Network abuse/snapshot cap. |
| Remote player snapshot buffer | 120 | Interpolation history. |
| Enemy snapshot buffer | 160 | Per-enemy interpolation history on clients. |
| Pages single runtime file | below 25 MiB | Cloudflare deployment constraint; archives are excluded by preparation. |

These bounds do not establish FPS, frame-time, memory, draw-call, or download acceptance.

## MVP target gates

Representative desktop and supported mobile targets must be named in the release evidence before numeric frame gates are finalized. Until profiling exists, the non-negotiable functional budgets are:

- zero live enemies, projectiles, pickups, effects, nameplates, Director timers, and run-only UI after Hub return;
- no monotonic `renderer.info.memory.geometries` or `.textures` growth across ten district/Hub transitions after cache warm-up;
- enemy count never exceeds 13 locally and spawn queue always drains;
- particle live count never exceeds 700;
- primary and procedural fallback maps both remain completable under their entity bounds;
- prepared Pages output contains no source archive and no file at/above provider limit;
- a 30-minute/all-district soak records FPS EMA, frame-time p50/p95/p99, long frames, renderer programs/geometries/textures, entities/projectiles/pickups/particles, JS heap when available, and WebSocket message/byte rate in co-op.

Release evidence must report hardware, OS/browser/version, viewport/DPR, quality settings, solo/co-op mode, build SHA, map path, sample duration, and cold/warm cache. Do not publish an unmeasured “60 FPS” claim.

## Collection commands and probes

```bash
npm run pages:prepare
find dist-pages -type f -size +25M -print
find dist-pages -type f \( -name '*.zip' -o -name '*.7z' -o -name '*.rar' \) -print
du -sh dist-pages assets
node --check js/*.js js/net/*.js workers/*.js scripts/*.js
npm test
git diff --check
```

In browser capture `renderer.info`, `performance.memory` where supported, `G.enemies.length`, `G.pending.length`, `G.projs.length`, `G.pickups.length`, particle diagnostics (target API), frame timestamps, and network counters. The current DevAPI does not expose the full required set, so console/manual instrumentation is presently needed.

## Failure thresholds

Any reachable void/softlock, stale run entity after Hub return, uncaught promise/console error, cap violation, non-draining queue, monotonic warm-cache renderer growth, prepared artifact above provider limits, or reproducible frame stall that prevents combat is a release blocker. Numeric FPS/frame-time thresholds remain **TBD after representative-device baseline**, not silently assumed.

## Current blockers

- No automated browser performance harness, renderer/entity diagnostic snapshot, or CI budget gate.
- No published representative-device matrix or measured all-district baseline.
- No completed Hub round trip, so zero-stale-state acceptance cannot yet be run end to end.
- Asset caches/disposal ownership and co-op message rates have not been soaked.
