# Map authoring contract

Status: **partially implemented**. Audited against `origin/main` at `7653b97` on 2026-07-13.

This document distinguishes what the runtime consumes today from the contract required for MVP acceptance. A scene appearing in `assets/data/scene-manifest.json` is discoverable, not approved or runtime-selected.

## Current runtime

- Three.js Editor Object JSON lives under `assets/scenes/districts/*.scene.json`.
- `DISTRICTS` in `js/config.js` is the production selector. It currently selects authored ShillZ only; Muskers, Bots, Cryptids, and GigaCorp use procedural maps.
- Rebel Haven is selected separately by `REBEL_HAVEN_HUB`.
- `AssetLoader.loadScene()` returns `null` on fetch/parse failure; `World.build()` then generates a procedural layout.
- External scenes use a coarse open 17×17 enemy-navigation grid. Authored prop colliders affect collision and spawn filtering, but do not build a navmesh.
- `World.build()` disposes the previous world group and resets marker/collider collections. Automated repeated-transition resource validation does not exist.

## Current marker vocabulary

Markers must be meshes; matching is case-insensitive and an optional `E2049_` prefix is removed. Current gameplay consumers are:

| Purpose | Name prefix / metadata | Current behavior |
|---|---|---|
| Player start | `E2049_PLAYER_START*` | First/last traversal match supplies X/Z; fallback is a free grid cell. |
| Boss arena | `E2049_BOSS_ARENA*` | Supplies X/Z; fallback is arena center. |
| Enemy spawn | `E2049_ENEMY_SPAWN*` | Added to spawn pool; faction may be inferred from marker name. |
| Pickup spawn | `E2049_PICKUP_SPAWN*` | Parsed and exposed, but normal pickup drops do not currently select these points. |
| Collider | `E2049_COLLIDER*`, `COVER*`, `BLOCKER*`, `TRAVERSAL*`, `SOFTLOCK*`; `userData.collider` / `blocksPlayer`; selected `gameplayType` values | Axis-aligned world-space box registered from the mesh bounding box. |
| Objective/extraction/route | objective, extraction, route, hazard and waypoint names or `gameplayType` | Hidden/visible metadata is recognized, but there is no objective/extraction position API or acceptance validator. |

Recognized hidden `gameplayType` values include `playerStart`, `enemySpawn`, `pickupSpawn`, `bossArena`, `objective`, `extractionGate`, `dronePatrolWaypoint`, `droneSpawn`, `routeHint`, `combatZone`, and `hazardZone`. Visible types include `floor`, `arenaWall`, `softLock`, `cover`, `traversal`, `railing`, `setpiece`, `billboard`, `objectiveProp`, `extractionGateVisual`, `entryGate`, `hazard`, and `elevatedPosition`.

Marker rotation does not define oriented collision: registered colliders are world-axis-aligned bounds. Authoring must account for that limitation.

## Required MVP map contract (target, not current capability)

Each campaign arena must declare or deterministically generate:

1. exactly one safe player start;
2. at least one safe enemy spawn, with faction compatibility where required;
3. one reachable boss arena;
4. objective and extraction locations required by its objective type;
5. collision/containment that prevents reachable void and required-route escape;
6. a route from player start to objective, boss, and extraction;
7. a playable procedural fallback governed by the same checks.

Hub maps additionally require reachable Mission Launch, Armory, Briefing/Intel, and Save Terminal services or a tested menu fallback. Those live service interactions are not implemented on the baseline.

## Authoring workflow

1. Author in meters with Y-up and export Three.js Object JSON.
2. Put production candidates in `assets/scenes/districts/`; keep source archives outside the Pages runtime.
3. Add marker meshes and explicit `object.userData.faction` / `skyboxFaction`; Hub sets `gameMode: "hubLobby"`.
4. Keep collision metadata in Object JSON even when a GLB supplies production visuals. Parse metadata before hiding blockout meshes.
5. Run `npm run scenes:manifest`; inspect warnings for invalid JSON or unresolved faction.
6. Explicitly wire an approved scene in `DISTRICTS` or `REBEL_HAVEN_HUB`. Do not infer approval from the manifest.
7. Serve over HTTP and exercise primary and intentionally missing-scene paths.

## Verification

```bash
npm run scenes:manifest
node --check js/world.js js/loader.js scripts/build-scene-manifest.js
npm test
npm run pages:prepare
git diff --check
python3 -m http.server 8049
```

Browser checks: load each selected scene, confirm `[E2049] Editor scene markers`, spawn inside containment and outside colliders, complete waves, reach boss arena, then force an invalid `sceneUrl` and confirm procedural fallback.

## Blockers / acceptance gaps

- No static marker-schema, duplicate-ID, reachability, containment, void, or soft-lock validator.
- Objective and extraction markers are not surfaced as runtime queries.
- External-scene enemy navigation ignores authored obstacle topology.
- Bots/Cryptids candidates are manifest-only; Muskers/GigaCorp production scenes are absent from selected config.
- No automated primary/fallback browser test or ten-transition disposal test.
