# Earth 2049 MVP Architecture

## Constraints

Earth 2049 remains a static, no-build Three.js r147 application. Runtime files load directly from `index.html`; there is no framework migration, module bundler, server requirement for solo play, or replacement of authored Object JSON/GLB contracts.

The MVP architecture is an incremental separation of deterministic state/contracts from rendering and browser orchestration.

## Deployment topology

```text
Player browser
  ├─ Cloudflare Pages: HTML, UMD JavaScript, Three.js libs, scenes, GLBs, textures
  │    └─ Solo game: fully local runtime + browser localStorage
  └─ optional WebSocket/HTTP
       └─ Cloudflare Worker
            └─ RoomDurableObject per private room
                 membership / ready / snapshots / claims / revive / ordering
```

Pages and Worker are independently deployable. Worker failure must never block title, Hub, Armory, Briefing or solo campaign.

## Current runtime

`index.html` owns DOM overlays, HUD, script order and input surfaces.

- `js/config.js`: tuning and campaign data (`DISTRICTS`, bosses, enemies, weapons, upgrades, abilities, routes).
- `js/game.js`: browser/game orchestrator plus save, progression, objective, enemy, boss, director, Hub, UI and co-op adapters.
- `js/world.js`: map construction, editor marker parsing, procedural generation, collisions, flow field, spawn queries and disposal.
- `js/loader.js`: JSON/texture/GLB/data loading with caches and fallbacks.
- `js/assets.js`: procedural textures/rigs/weapons/pickups plus external model binding.
- `js/skybox.js`: faction cubemap registry, orientation and fallback.
- `js/audio.js`, `js/input-safety.js`, `js/devconsole.js`: supporting systems.
- `js/net/*`: protocol/config/client/interpolation/room bridge.
- `workers/*`: Worker router and Durable Object authority.

The game is functional but `js/game.js` combines too many stateful concerns. MVP work should extract pure/testable systems while preserving the existing globals and call sites until each migration is green.

## Target seams

All modules remain UMD scripts exposed on `window` and loaded before `game.js`.

### SaveSystem

Responsibilities:

- current schema and default factory;
- ordered idempotent migration registry;
- validation/normalization;
- raw and pre-migration backup;
- storage adapter with graceful failure;
- export/import/reset APIs.

Compatibility: `loadSave()` and `persist()` become thin adapters so existing code can continue reading `SAVE` during migration.

### ProgressionSystem

Responsibilities:

- transaction-based reward banking;
- upgrade/intel/mastery/relic/tier changes;
- exactly-once transaction ledger bounded to recent IDs;
- derived run stats and upgrade costs.

It must not touch DOM or Three.js.

### CampaignRuntime

Owns lifecycle only:

```text
TITLE | HUB | MISSION_LOADING | RUN | DISTRICT_REWARD |
DEAD | CAMPAIGN_COMPLETE | ENDING
```

It coordinates SaveSystem, MapRuntime, ObjectiveSystem, EnemySystem and BossSystem through explicit events. `game.js` renders those states and handles browser input.

### MapRuntime

Responsibilities:

- select primary scene and procedural fallback;
- parse `E2049_*` markers and `userData.gameplayType`;
- validate player/objective/enemy/boss/extraction contracts;
- collision/nav/spawn queries;
- dispose prior scene resources and report diagnostics.

Marker contract:

- required campaign arena: `E2049_PLAYER_START`, enemy spawn(s), boss arena, objective/extraction or deterministic generated equivalents;
- colliders: `E2049_COLLIDER`, `E2049_COVER`, `E2049_BLOCKER`, traversal/soft-lock types;
- Hub services: Mission Launch, Armory, Briefing/Intel, Save Terminal markers, with menu fallback.

Metadata scenes may remain loaded for gameplay while production GLBs render visuals. Parse metadata before hiding metadata meshes.

### ObjectiveSystem

Pure objective state machine:

```text
inactive → active → completed | failed
```

Owns typed progress, target, optional timeout/failure condition, reward payload and exactly-once completion. It serializes to co-op snapshots and save diagnostics. HUD is a subscriber, not an owner.

### EnemySystem / BossSystem

EnemySystem owns capped spawn queues and identity/lifecycle. BossSystem owns boss activation, phase transitions and exactly-once death result. Existing Assets rig builders and combat routines remain callable while state migrates.

### AssetRegistry

Responsibilities:

- manifest keys and URLs;
- load state (`idle/loading/ready/failed/fallback`);
- timeouts and diagnostics;
- clone ownership;
- optional fallback selection;
- disposal/resource accounting.

Boot must tolerate unavailable manifests, scene JSON, GLB and cubemap faces.

### DirectorSystem

Pure seeded logic consuming bounded event summaries and producing rate-limited decisions. Only solo or co-op authority executes it. Debug overlay reads immutable diagnostics.

## Campaign data contract

District configuration should evolve without breaking existing `DISTRICTS` consumers:

```js
{
  id, name, fac,
  map: {
    sceneUrl,
    fallbackMap,
    orderedScenes,
    requiredMarkers,
  },
  objective,
  waves,
  boss,
  rewards,
  next,
}
```

During migration, adapters expose legacy fields (`sceneUrl`, `map`, `waves`, `boss`) to current code.

## Map and asset policy

- Runtime selection is explicit in campaign config; presence in `scene-manifest.json` means discoverable for development, not production-approved.
- Optional scene/model failure logs one actionable warning and uses a playable fallback.
- All primary and fallback paths must pass the same spawn/objective/boss/extraction contract.
- Authored Hub visuals suppress generic coplanar ground/district geometry.
- Every transition disposes transient geometries/materials/textures, entities, DOM nameplates and timers owned by the previous state.

## Save contract

Retain localStorage key `earth2049_seed7_v1` for non-destructive compatibility. Add an internal `schemaVersion` rather than changing keys.

Proposed storage keys:

- `earth2049_seed7_v1`: current save;
- `earth2049_seed7_v1.backup`: pre-migration/raw recovery;
- `earth2049_seed7_v1.reset-backup`: most recent user reset backup.

Unknown future versions are read-only/rejected. Failed migration never overwrites the original. Import validates and previews before commit.

## Co-op authority

Current MVP direction is retained:

- Durable Object: membership, host, ready, event ordering, canonical registries/snapshot, atomic claims, revive validation and reconnect persistence.
- Host browser: enemy/wave/boss/director simulation for beta.
- Non-host: local player intent and authoritative remote rendering.

Required hardening:

- explicit feature flag;
- seeded host simulation actually consumes the room seed;
- run/district/objective/boss/complete messages integrated with CampaignRuntime;
- transaction IDs for personal rewards;
- tested host migration and snapshot continuity;
- server validation remains bounded and rejects non-host mutations.

## Performance budgets

Initial MVP budgets to validate and tune on representative desktop hardware:

- gameplay enemies visible/simulated: current `CFG.MAX_ENEMIES` 13 per client;
- co-op canonical registry caps: 160 enemies, 240 pickups, 4 players;
- particles: 700; remote snapshot buffers: 120; enemy snapshot buffers: 160;
- zero stale gameplay entities after Hub return;
- no monotonic renderer geometry/texture growth across 10 repeated map transitions after cache warm-up;
- no Pages runtime file above Cloudflare’s 25 MiB single-file limit;
- 30-minute/all-district soak records FPS EMA, frame-time percentiles, JS heap when available, renderer memory, entity counts and WebSocket rate.

Budgets are gates, not current claims. Record measured baselines in `MVP_STATUS.md` after the harness exists.

## Test layers

1. Pure Node unit tests: Save, Progression, Campaign, Objective, Director, protocol helpers.
2. Static validators: manifests, assets, marker contracts, reachability/containment samples, Pages output allowlist/size.
3. Browser smoke: boot/title/Hub/run, real Three.js scene loading, console, DOM and renderer diagnostics.
4. Campaign acceptance: deterministic phase shortcuts plus one unshortened end-to-end run before release.
5. Co-op: Worker/DO unit tests, two real WebSocket clients, then browser host/client.
6. Production: cache-busted Pages browser smoke and Worker health/room/WebSocket checks.

## Script order rule

Every new UMD module must be loaded explicitly by `index.html` before its first consumer, and its source query version must be bumped when behavior changes. Pages preparation copies `js/` as-is; no build step repairs script order.
