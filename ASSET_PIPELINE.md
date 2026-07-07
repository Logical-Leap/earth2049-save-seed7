# Earth 2049 Asset Pipeline

Earth 2049 now supports a layered asset pipeline:

```text
Three.js Editor / GLB tools
  → assets/scenes + assets/models + assets/textures + assets/data
  → js/loader.js runtime cache
  → js/world.js marker/collision/spawn integration
  → existing gameplay systems
```

The game stays no-build and GitHub Pages friendly.

## Folder layout

```text
assets/
  scenes/
    districts/       # Three.js Editor exported scene JSON
  models/
    enemies/         # GLB enemy/body-plan assets
    bosses/          # GLB boss assets
    weapons/         # GLB weapon/viewmodel assets
    props/           # GLB props
    pickups/         # GLB pickups
    environment/     # GLB modular environment pieces
  textures/
    factions/
    props/
    ui/
  data/
    asset-manifest.json
    game-data.json   # optional overrides, absent by default
```

## GLB model manifest

Runtime GLB loading is centralized in `assets/data/asset-manifest.json` and `js/loader.js`.

Example:

```json
{
  "models": {
    "enemy.shill": "assets/models/enemies/shillz-common.glb",
    "enemy.runner": "assets/models/enemies/musker-common.glb",
    "enemy.broker": "assets/models/enemies/cryptid-common.glb",
    "weapon.ar": "assets/models/weapons/ar.glb"
  }
}
```

`Assets.preloadExternalModels()` loads this manifest first. `Assets.buildEnemy()` and `Assets.buildGun()` then prefer cached manifest GLBs and fall back to procedural rigs if loading fails.

## Naming conventions

Recommended model IDs:

| Type | Pattern | Example |
|---|---|---|
| Enemy | `enemy.<id>` | `enemy.shill` |
| Boss | `boss.<id>` | `boss.riya` |
| Weapon | `weapon.<id>` | `weapon.ar` |
| Prop | `prop.<id>` | `prop.sponsorBarrier` |
| Pickup | `pickup.<id>` | `pickup.gigatechShard` |
| Environment | `environment.<id>` | `environment.shillzKiosk` |

## Fallback behavior

If a scene/model/data file is missing or invalid:

- a clear `[E2049]` warning is logged
- procedural maps/models remain active
- run startup continues instead of crashing

This means external assets can be added incrementally without losing the playable vertical slice.

## Texture/material guidance

- Prefer embedded GLB textures for portable assets.
- Keep texture dimensions mobile-friendly (`1024px` or lower for most props/enemies).
- Avoid huge uncompressed scene JSON texture blobs; use GLB or external image files instead.
- Use emissive materials sparingly; bloom is already active.

## Performance budget

Suggested first-pass targets for GitHub Pages/mobile:

| Asset type | Guideline |
|---|---|
| District scene JSON | Keep under ~650 KB where possible; loader warns above this. |
| Common enemy GLB | Low/mid-poly; share skeleton/animations where practical. |
| Boss GLB | Can be heavier than commons, but preload cost matters. |
| Prop GLB | Merge static props in editor only when it does not hurt round-trip editing. |
| Textures | Prefer compressed/optimized images; avoid many 4K maps. |

## Data overrides

`GameData.load()` optionally reads `assets/data/game-data.json` and merges compatible overrides into existing defaults.

Supported initial override buckets:

- `CFG`
- `WEAPONS`
- `ETYPES`
- `BOSSES`
- `DISTRICTS`
- `ABILITIES`
- `METAUP`

If `game-data.json` is absent, nothing changes.

## Local testing

Use a web server for scene/model fetches:

```bash
npx --yes serve -l 8049 .
# or
python3 -m http.server 8049
```

Then open `http://localhost:8049/` and watch the console for `[E2049]` warnings and marker summary logs.
