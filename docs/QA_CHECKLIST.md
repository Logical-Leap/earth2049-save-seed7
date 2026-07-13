# Early Access MVP QA checklist

Status: **release gate; most campaign/browser/co-op items are not yet accepted**. Record build SHA, tester, date, platform/browser, viewport/DPR, input type, network mode, and evidence link for every run. “Configured” is not “passed.”

## 1. Required local checks

- [ ] `node --check js/*.js js/net/*.js workers/*.js scripts/*.js tests/*.js`
- [ ] `npm test`
- [ ] `npm run scenes:manifest` and review skipped/invalid/unresolved scenes
- [ ] `npm run pages:prepare`
- [ ] prepared output has no archives and no file at/above 25 MiB
- [ ] `git diff --check`
- [ ] docs/status/changelog match the tested SHA

## 2. Boot, title, input, and solo independence

- [ ] Cold boot over HTTP reaches title without console error/unhandled rejection
- [ ] Keyboard/mouse and touch paths can start, move, look, fire, swap, interact, pause, and resume
- [ ] Fast pointer/touch look does not reset camera or redirect held movement
- [ ] Solo title/Hub/run remains available with Worker DNS/network blocked
- [ ] Missing optional game data, manifest, scene, model, and skybox each fail soft

## 3. Save schema v2

- [ ] Fresh profile creates schema v2 under `earth2049_seed7_v1`
- [ ] Legacy minimal/full fixtures migrate once and preserve expected progress
- [ ] Invalid JSON/object is backed up before safe recovery
- [ ] Negative/non-finite/oversized and unknown catalog fields normalize safely
- [ ] Future schema remains byte-for-byte untouched, read-only, and exportable
- [ ] Export → confirmed reset → import restores equivalent normalized data
- [ ] Backup/write/quota failure does not overwrite primary or crash solo boot
- [ ] Armory Save status/import/export/reset controls and confirmations work

## 4. Hub and first vertical slice — current critical blocker

- [ ] New profile enters non-combat Rebel Haven at a safe spawn
- [ ] Mission Launch, Armory, Briefing/Intel, and Save Terminal are reachable or have tested fallbacks
- [ ] Hub interaction launches ShillZ exactly once and increments run count once
- [ ] ShillZ player/objective/enemy/boss/extraction points are safe and reachable
- [ ] Objective progresses/completes once; three waves drain; Riya spawns once
- [ ] ShillZ presentation follows canon: willing pro-GigaCorp consumer loyalists, not rebels/counterfeit resistance
- [ ] Riya is presented as a pro-authority GigaCorp propagandist
- [ ] Riya death grants GigaTech/intel/relic/mastery once
- [ ] Reward summary returns to Hub with zero run entities
- [ ] Hub purchase persists, changes run-two stats, and run two has no stale entities
- [ ] Death banks once and returns Hub; retry/return cannot duplicate rewards

## 5. Maps and assets

For every district, primary and forced fallback:

- [ ] selected path is explicit in config (manifest discovery alone is not approval)
- [ ] required marker counts and unique IDs pass validator
- [ ] player start is inside containment and outside solids
- [ ] objective, boss arena, and extraction are reachable
- [ ] enemy spawns are in bounds, outside collision, and drain under cap
- [ ] traversal samples find no reachable void, escape, or unrecoverable softlock
- [ ] missing/corrupt scene/model/texture/cubemap logs one actionable warning and stays playable
- [ ] ten build/dispose transitions remain within renderer/entity budgets

## 6. Objectives, enemies, bosses, progression

- [ ] all five objective types handle progress, failure, duplicate events, and snapshot/restore
- [ ] enemy melee/dash/ranged/flying/elite behaviors remain bounded
- [ ] local enemies never exceed 13 and queue drain advances wave once
- [ ] each boss phase threshold/attack/summon/death is deterministic under test seed
- [ ] duplicate boss death cannot duplicate relic/reward/transition
- [ ] each district reward banks once; upgrades/intel/mastery/relic/tier invariants hold
- [ ] Turing defeat produces ending/credits/result, banks once, and returns Hub

## 7. Turing Director

- [ ] identical seed/event stream yields identical decisions
- [ ] NaN/infinite/out-of-range inputs clamp safely
- [ ] threat, spawn requests, and message cadence stay bounded
- [ ] no Director simulation in Hub/menus/non-authority clients
- [ ] reconnect/restore preserves RNG and cooldown state
- [ ] debug diagnostics show seed, inputs, threat, and last decision

## 8. Co-op beta (keep disabled until passed)

- [ ] release flag is explicit and solo remains visible
- [ ] create/join/ready/start supports 1–4 and rejects invalid/extra clients
- [ ] protocol/version/input and host-only mutation checks pass
- [ ] two clients agree on enemies, waves, objective, boss, pickups, and rewards
- [ ] pickup claims and personal rewards occur once
- [ ] down/revive/full wipe work; revive validates range/hold/state
- [ ] reconnect during wave/boss restores snapshot
- [ ] host disconnect migrates authority without duplicate/stale state
- [ ] Worker caps and persistence coalescing hold under load

## 9. Performance and soak

- [ ] named representative desktop/mobile matrix recorded
- [ ] cold/warm load payload and timings captured
- [ ] 30-minute/all-district soak captures FPS/frame percentiles, long frames, renderer memory, entities, heap where available, and co-op traffic
- [ ] no monotonic warm-cache geometry/texture growth
- [ ] no stale gameplay state after every Hub return
- [ ] no console errors, unhandled promises, cap violation, or non-draining queue

## 10. Deployment and release evidence

- [ ] Pages and Worker deploy independently from intended SHA
- [ ] live Pages status/headers/assets and cache-busted browser boot pass
- [ ] live Worker health, room creation, and WebSocket flow pass
- [ ] live solo completes with Worker unavailable
- [ ] known issues and feature flags are visible and accurate
- [ ] screenshots/video/logs/metrics are attached to release record
- [ ] rollback SHA and owners are recorded

## Baseline verification commands

```bash
node --check js/*.js js/net/*.js workers/*.js scripts/*.js tests/*.js
npm test
npm run scenes:manifest
npm run pages:prepare
find dist-pages -type f -size +25M -print
git diff --check
```

## Known blocking failures at this baseline

Hub service/return lifecycle, authored ShillZ objective, map validators, shared Objective/Enemy/Boss seams, deterministic Director, final ending, automated browser campaign harness, representative-device soak, and two-client co-op acceptance are missing. This checklist must not be marked release-complete until those contracts exist and evidence is captured.
# QA Checklist

Run the unified release gate before opening or merging any PR that changes scene JSON, map metadata, GLBs, textures, or asset manifests:

```bash
npm test
```

`npm test` runs `npm run qa:assets` before the unit suites. The asset gate is read-only and fails when generated scene data is stale; it never rewrites authored scenes or assets.

## Automated scene/data/asset gate

- [ ] `npm run scenes:check` confirms `assets/data/scene-manifest.json` matches discoverable non-collision scene files.
- [ ] Every manifest scene has one explicit map type in `assets/data/scene-contracts.json`.
- [ ] Direct Three.js Object JSON and editor wrappers (`object`, `scene.object`, and `scene`) parse to a scene root.
- [ ] Object, geometry, material, image, and texture UUIDs are unique in their namespace.
- [ ] Geometry/material UUID references resolve inside the scene document.
- [ ] Transform scales and matrices contain only finite numbers.
- [ ] Player, enemy, drone, and pickup spawn markers are at or above ground (`y >= 0`).
- [ ] Gameplay markers use canonical `E2049_` IDs; legacy markers are classified by canonical names.
- [ ] Required marker sets exist for the declared map type:
  - `hub`: player start.
  - `legacy-arena`: player start, boss arena, enemy spawn, pickup spawn.
  - `combat`: player start, objective, extraction, enemy spawn, pickup spawn.
  - `boss-combat`: all combat markers plus boss arena.
- [ ] Every repository-local scene URL, texture URL, GLB, and asset-manifest path exists and remains inside the repository.
- [ ] Every referenced GLB has the `glTF` magic header and a declared byte length equal to the file size.

## Deterministic generated data

`npm run scenes:manifest` preserves `generatedAt` when the generated scene list is unchanged, so routine dev/test runs do not dirty the tree. `SOURCE_DATE_EPOCH=<seconds>` supplies a reproducible timestamp when regeneration is intentionally required. CI/release checks must use the read-only `npm run scenes:check` command.

## Manual checks still required

The static validator cannot prove nav reachability, collision containment, rendering correctness, frame pacing, or gameplay completion. For release candidates, also perform the browser acceptance and map traversal checks listed in `docs/MVP_PLAN.md`, including player start clearance, objective/boss/extraction reachability, void containment, repeated transitions, and optional-asset fallback behavior.
