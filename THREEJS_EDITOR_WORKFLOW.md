# Three.js Editor Workflow for Earth 2049

Earth 2049 remains a no-build, browser-native Three.js FPS. The official [Three.js Editor](https://threejs.org/editor/) is used for visual map/layout authoring; gameplay systems stay in JavaScript/data.

## Recommended workflow

1. Open <https://threejs.org/editor/>.
2. Create or import map pieces, GLB props, lights, signs, cameras, and placeholder marker objects.
3. Name gameplay marker objects with the `E2049_` conventions below.
4. Add optional `userData` on marker objects for gameplay metadata such as `{ "climb": true, "gameplayType": "cover" }`.
5. Export the scene as Three.js JSON (`File → Export Scene`).
6. Save the exported file under:
   - `assets/scenes/districts/<district-name>.scene.json`
7. Reference that file in `DISTRICTS` in `js/config.js` with `sceneUrl`:
   ```js
   {
     name: 'SHILLZ CENTRAL',
     fac: 'shillz',
     sceneUrl: 'assets/scenes/districts/shillz-central.scene.json',
     fallbackMap: 'engagementSquare'
   }
   ```
8. Run locally with a server when loading external files:
   ```bash
   npx --yes serve -l 8049 .
   ```
9. Verify player start, collision, enemy spawns, pickups, boss arena, and console warnings.

## Supported marker names

Markers are parsed by object name. Any object whose name starts with `E2049_` is hidden at runtime unless `userData.visibleMarker === true`.

| Marker | Runtime behavior |
|---|---|
| `E2049_PLAYER_START` | Sets player spawn position. Optional object Y rotation can be used later for authored yaw. |
| `E2049_BOSS_ARENA` | Sets boss spawn/arena anchor. |
| `E2049_ENEMY_SPAWN` | Adds a generic enemy spawn point. |
| `E2049_ENEMY_SPAWN_SHILLZ` | Spawn point preferred for ShillZ enemies. Also supports `MUSKERS`, `BOTS`, `CRYPTIDS`, `GIGACORP`. |
| `E2049_PICKUP_SPAWN` | Registers a pickup spawn marker for future pickup placement rules. |
| `E2049_COLLIDER` | Registers a hidden box collider from the object bounding box. |
| `E2049_COVER` | Registers a hidden cover/collider box. Use a separate visible prop if needed. |
| `E2049_BLOCKER` | Registers a hidden blocking collider. |
| `E2049_TRIGGER_EXIT` | Reserved marker name for future exit/extraction triggers. |
| `E2049_TRIGGER_OBJECTIVE` | Reserved marker name for future objective triggers. |
| `E2049_LIGHT_KEY` | Normal Three.js light; marker naming is documented for consistency. |
| `E2049_PROP_*` | Visible prop/layout object. Not gameplay parsed unless another marker prefix matches. |
| `E2049_LORE_SIGN_*` | Reserved marker/prop naming for lore signage. |

## Collider rules

- Use simple box objects for collision in the editor.
- Name them `E2049_COLLIDER_*`, `E2049_COVER_*`, or `E2049_BLOCKER_*`.
- Runtime collision uses the object's world-space bounding box.
- Optional user data:
  ```json
  {
    "climb": true,
    "gameplayType": "cover"
  }
  ```
- Complex mesh-accurate collision is intentionally not supported yet. Use explicit simple collider boxes around authored geometry.

## Round-trip notes

- The source of truth for layout should be the editor-exported scene JSON.
- If you manually edit exported JSON, re-importing/exporting through the editor may overwrite those edits.
- Prefer storing gameplay metadata in object names or `userData`, or in external `assets/data/*.json` config.

## Limitations

- Three.js Editor is not Unity/Unreal; combat, AI, roguelike progression, upgrades, saves, weapons, HUD, and mobile controls remain in JS.
- Scene JSON controls layout, props, markers, lights, cameras, and placement.
- Animated characters and weapons should usually be GLB assets referenced from `assets/data/asset-manifest.json`.
- Large scene JSON or unoptimized GLBs can slow GitHub Pages/mobile load times.
- External asset loading needs a local web server on many browsers; double-clicking `index.html` is still best for procedural fallback/offline checks.

## Current sample

`assets/scenes/districts/shillz-central.scene.json` is a tiny editor-compatible scene used by ShillZ Central. It demonstrates:

- player start marker
- boss arena marker
- faction enemy spawn marker
- pickup marker
- box collider marker with `userData.climb`
- a visible cover prop separate from the collider marker
