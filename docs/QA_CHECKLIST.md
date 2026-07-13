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
