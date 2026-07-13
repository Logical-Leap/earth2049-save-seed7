# MVP asset pipeline and failure policy

Status: **fallback-capable, incompletely validated**. Audited at `7653b97` on 2026-07-13. The root `ASSET_PIPELINE.md` is legacy overview material; this file is the MVP contract.

## Current pipeline

```text
Three.js Editor / DCC tools
  → assets/scenes, assets/models, assets/textures, assets/data
  → js/loader.js caches
  → js/world.js / js/assets.js / js/skybox.js
  → procedural fallback where implemented
```

The application is static and no-build. Browser script order in `index.html` is authoritative. Pages preparation copies runtime files to `dist-pages/` and excludes authoring archives (`.zip`, `.7z`, `.rar`).

### Registries

- `assets/data/asset-manifest.json`: external GLB bindings. Current bindings cover three common enemies and one weapon; other rigs remain procedural.
- `assets/data/scene-manifest.json`: generated development discovery list. It does not select campaign scenes.
- `DISTRICTS` / `REBEL_HAVEN_HUB` in `js/config.js`: production scene selection.
- Skybox registry in `js/skybox.js`: faction cubemaps with procedural Dead Zone/sky fallback.
- Optional `assets/data/game-data.json`: config overrides; absence is supported.

### Loader behavior

`AssetLoader.fetchJson()` caches successful JSON, warns above 650,000 text characters, and returns `null` on fetch/parse failure. `loadScene()` catches ObjectLoader parse errors. `loadModel()` records failures; enemy and weapon builders prefer cloned external models and fall back to procedural rigs. There is no general timeout, explicit lifecycle state, retry API, or complete resource ownership registry.

## IDs and placement

Use stable IDs: `enemy.<id>`, `boss.<id>`, `weapon.<id>`, `prop.<id>`, `pickup.<id>`, and `environment.<id>`. Use relative, case-correct URLs. Prefer embedded GLB textures; optimize most enemy/prop textures to 1024 px or less. Do not add generated or source-only assets to the runtime just because they exist locally.

Do not modify or publish `assets/models/environments/` as part of documentation work; untracked authoring output is explicitly outside this baseline.

## Required MVP target contract

Each registry record should eventually report `idle | loading | ready | failed | fallback`, source URL, error/timeout diagnostic, clone owner, and disposable resources. Optional asset failure must emit one actionable warning and may not prevent title, Hub, mission, boss, reward, or ending progression. Primary and fallback presentations must share gameplay collision/marker contracts.

A production candidate is accepted only after:

1. license/provenance and source location are recorded;
2. runtime filename/case and manifest key are validated;
3. primary load and forced failure are tested over HTTP;
4. geometry/material/texture disposal ownership is known;
5. prepared Pages output is inspected for archives and oversized files;
6. campaign behavior remains playable without the asset.

These are target gates, not claims that the current registry enforces them.

## Verification

```bash
node --check js/loader.js js/assets.js js/skybox.js scripts/*.js
npm run scenes:manifest
npm test
npm run pages:prepare
find dist-pages -type f -size +25M -print
find dist-pages -type f \( -name '*.zip' -o -name '*.7z' -o -name '*.rar' \) -print
git diff --check
python3 -m http.server 8049
```

Browser probes must cover valid and missing scene JSON, GLB, cubemap face, asset manifest, and optional game-data paths; collect console warnings and verify the run still reaches its boss.

## Current blockers

- No asset failure/timeout unit suite or browser fault-injection harness.
- No complete boss, weapon, prop, pickup, or environment GLB inventory.
- No automated prepared-output size/allowlist gate.
- Cache ownership can share source resources while cloned materials are disposed by gameplay rigs; repeated transition memory behavior is unmeasured.
- The 650 KB scene warning and 25 MiB Pages file limit are thresholds, not measured device performance budgets.
