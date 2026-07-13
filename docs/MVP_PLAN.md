# Earth 2049 Early Access MVP Plan

This plan finishes the MVP without replacing the static Three.js/no-build architecture. Each milestone lands as a focused, green PR. `main` remains playable; incomplete co-op or authored content stays behind fallbacks/feature flags.

## Definition of done

The MVP is done only when all of these are demonstrated on the production build:

- Solo: Hub → complete five-district campaign → Turing ending → Hub, including stable death and victory returns.
- Progression: earned rewards persist; an upgrade changes the next run; old/corrupt saves migrate safely; export/import/reset work.
- Maps: no reachable void, containment escape, blocked required spawn, unreachable objective/boss, or unrecoverable optional asset failure.
- Performance: bounded entities/resources and acceptable frame pacing through repeated all-district transitions.
- Co-op beta (when enabled): private 1–4 host/join/ready/run/revive/objective/boss/transition/rewards works with reconnect; solo works with Worker offline.
- Deployment: Pages and Worker deploy successfully, live API and cache-busted browser smoke are clean.

## Delivery principles

1. Preserve current gameplay, authored layouts and Object JSON/GLB/E2049 marker contracts.
2. Extract testable seams behind existing globals; do not introduce a framework or bundler.
3. Every behavior change begins with a failing test and finishes with focused + full checks.
4. Optional maps/models/skyboxes fail soft to procedural content.
5. Co-op never blocks solo and remains feature-gated until its full acceptance matrix passes.
6. Update `CHANGELOG.md`, `docs/MVP_STATUS.md`, architecture and known issues in every major PR.

## Milestone task graph

```text
M1 Audit/baseline
  ├─> M2a SaveSystem contract
  ├─> M2b Browser acceptance harness
  └─> M2c Hub interaction contract
          └─> M2 Vertical slice (Hub→ShillZ→Riya→Hub→upgrade→run 2)
                 ├─> M3 shared runtime seams
                 │     ├─ MapRuntime + validators
                 │     ├─ ObjectiveSystem
                 │     ├─ EnemySystem/BossSystem
                 │     ├─ ProgressionSystem
                 │     └─ AssetRegistry failure policy
                 ├─> M4a Muskers/Magnus
                 ├─> M4b Bots/SPYD3R
                 ├─> M4c Cryptids/Blitz
                 └─> M4d GigaCorp/Turing/ending
                        ├─> M5 Turing Director determinism
                        ├─> M5 co-op beta acceptance
                        └─> M5 release/soak/deploy
```

## M1 — Audit and baseline

Deliverables:

- `MVP_STATUS.md`, `MVP_PLAN.md`, `ARCHITECTURE.md`, `KNOWN_ISSUES.md`.
- truthful feature/map/asset/save/co-op/deploy/performance inventories;
- exact test and risk matrix;
- baseline syntax, unit, manifest and Pages-preparation evidence.

Exit gate:

- docs merged;
- local baseline green;
- live Pages + Worker health and initial browser console captured;
- no untracked authoring asset included.

## M2 — First playable vertical slice

### M2a SaveSystem

Introduce `js/save-system.js` as a UMD module behind the existing `SAVE`/`persist()` interface.

Required behavior:

- explicit `schemaVersion` and ordered idempotent migrations;
- preserve the current localStorage key and all recognized fields;
- validate/clamp unsafe values and retain unknown fields in a backup export;
- one pre-migration backup key;
- import preview/validation, export download/copy, reset with confirmation;
- recover from invalid JSON without destroying the raw payload.

Tests (RED first):

```text
fresh save receives current schema and defaults
legacy minimal v1 fixture migrates without losing currency/upgrades/profile
migration is idempotent
invalid JSON is backed up and replaced with safe defaults
negative/NaN/oversized numeric fields are normalized
unknown future version is rejected without overwrite
export→reset→import round trip is equivalent
failed storage writes do not crash solo boot
```

### M2b Acceptance harness

Add a lightweight Node test harness for pure UMD modules and browser-smoke helpers usable from DevAPI. Keep tests dependency-free when practical.

Required probes:

- boot/title/Hub/run state;
- active scene/faction and spawn safety;
- phase/wave/boss transition controls;
- save fixtures and service actions;
- captured console errors/unhandled rejections;
- renderer memory/object/entity counts.

### M2c Hub lifecycle

Use final Hub scene/GLB. Add stable E2049 service markers or a data contract for Mission Launch, Armory, Briefing/Intel and Save Terminal. Provide keyboard/touch interaction prompts and menu fallbacks if markers are absent.

State contract:

```text
TITLE → HUB → MISSION_LOADING → RUN
RUN → DISTRICT_REWARD → (next district | HUB)
RUN → DEAD → HUB
RUN → CAMPAIGN_COMPLETE → ENDING → HUB
HUB → ARMORY/SAVE/BRIEFING → HUB
```

Tests:

- Hub is non-combat and has a safe spawn;
- each required service is reachable or opens through fallback UI;
- launch starts ShillZ once and increments run count once;
- death/victory bank once and return Hub;
- returning Hub disposes run entities and preserves reward totals;
- purchase in Hub changes the next run stats.

### M2d ShillZ vertical slice

- Keep the authored engagement square and current Riya encounter.
- Define a concrete ShillZ objective state machine (not only a random generic mission).
- Validate player start, objective, enemy spawns, boss arena, extraction/return.
- Guarantee boss death → reward summary → Hub.
- Complete a second launch after an upgrade.

Exact acceptance:

```text
new profile boots to title and enters Hub
Hub Mission Launch loads ShillZ with no Worker
player start is non-solid and inside containment
objective advances once; all waves complete; Riya spawns once
Riya death grants relic/intel/GigaTech once
reward return loads Hub; combat entities are zero
Armory purchase persists and affects run 2
run 2 starts ShillZ without stale boss/projectile/pickup state
no console errors or unhandled promises
```

## M3 — Shared runtime stabilization

Extract incrementally; retain existing public/global calls during migration.

### MapRuntime

Own scene selection, marker parsing, collision/nav/spawn/extraction contracts, procedural fallback and disposal metrics.

Tests: manifest parse; required markers; duplicate IDs; spawn non-solid; objective/boss reachability; containment samples; missing/corrupt scene fallback; repeated build/dispose resource bounds.

### ObjectiveSystem

Pure state machine for activation, progress, completion/failure, single reward, snapshot/restore. Existing HUD subscribes to state changes.

### EnemySystem and BossSystem

Own capped spawn queues, enemy identity/lifecycle and boss phase/death exactly-once semantics. Keep rendering/rig creation in existing Assets APIs.

### ProgressionSystem

Own reward calculation/banking, upgrades/intel/mastery/relics and exactly-once transaction IDs. `game.js` remains orchestrator/UI.

### AssetRegistry

Normalize manifest lookup, load timeout/error state, clone/fallback, disposal ownership and diagnostics. No optional asset can stop boot or campaign progression.

M3 exit gate: pure unit suites plus ShillZ browser regression remain green; no rewrite of renderer/input architecture.

## M4 — Complete campaign content

For each district: wire the approved production scene if available; otherwise improve and retain a validated procedural fallback. Never wire a scene only because it appears in the dev manifest.

### Muskers / Magnus

- production marker/collision package or validated procedural arena;
- faction objective and Magnus phase test;
- reward/transition contract.

### Bots / SPYD3R

- choose an explicit ordered runtime path from the four authored scenes;
- validate transitions or intentionally select one arena for MVP;
- SPYD3R objective/boss/reward tests.

### Cryptids / Blitz

- select and validate an explicit path from five v2 scenes;
- preserve risk/reward identity without unrecoverable debt states;
- Blitz objective/boss/reward tests.

### GigaCorp / Turing

- implement Omnidome → Turing Core → Turing sequence using authored content when available and procedural fallback otherwise;
- bounded final encounter and deterministic phase transitions;
- ending/credits/result summary;
- exactly-once campaign rewards and return Hub.

Per-district acceptance:

```text
load primary and forced-fallback map
spawn/objective/boss/extraction reachable
no void escape under boundary probes
phase progression cannot softlock with zero enemies
boss death/reward/transition occur once
10 repeated loads do not grow entity/renderer counters outside budget
```

## M5 — Director, co-op beta and release

### Deterministic Turing Director

Extract seeded decision logic. Cap threat, spawn requests and message frequency. Add a debug overlay showing seed, inputs, threat and last decision.

Tests: same seed+events ⇒ same decisions; finite/clamped inputs; bounded spawn count; cooldown enforced; no decisions in Hub/non-authority clients.

### Co-op beta

Add an explicit release feature flag and keep solo controls visible regardless of Worker state.

Automated Worker/DO tests:

- create/join max 4; duplicate/reconnect; ready/start host-only;
- protocol/version/input validation;
- non-host enemy mutations rejected;
- pickup claimed once;
- revive validates state/range/hold;
- host migration snapshot continuity;
- canonical caps and persistence coalescing;
- run/district/boss/complete/failed messages;
- personal rewards exactly once.

End-to-end matrix:

- one browser host + second real WebSocket client;
- two browser clients for movement/down/revive;
- district objective/waves/boss/transition/reward;
- reconnect during wave and boss;
- host disconnect/migration;
- full wipe;
- Worker unavailable while solo completes.

### Release and production

- all unit/validator/browser/co-op tests green;
- cache-busted Pages scripts and manifests;
- Pages prepared directory contains only runtime files and no >25 MiB file;
- deploy Pages and Worker independently;
- smoke HTTP headers, Worker health, room creation/WebSocket, title/Hub/run/end on live hostname;
- capture 30-minute/all-district soak metrics and release screenshots;
- update status, known issues and changelog.

## Required PR template content

Every PR description must include:

- goal and user-visible behavior;
- files/contracts changed;
- architecture compatibility/fallback behavior;
- failing test observed, passing tests and browser probes;
- asset/runtime size and performance effects;
- limitations and feature-flag state;
- screenshots for visible work;
- follow-up tasks;
- deployment/live verification when merged.
