# REBEL HUB — HAVEN COMMONS (Final)

Production multiplayer lobby environment for **EARTH 2049: SAVE SEED7**. The clean Three.js Object JSON retains every authoritative Hub V3 gameplay object and adds a modular visual pass for the arrival yard, Commons, Market/Salvage Lane, Workshop, customization/stash, pavilion, training garden, memorial/support area, Command Overlook, bridge, balcony, catwalk, and deployment gate.

## Scene structure
- `rebel-hub-haven-commons-final.scene.json`: directly loadable `THREE.ObjectLoader` scene; no Editor project wrapper.
- `rebel-hub-haven-commons-final.glb`: consolidated visual asset for GLTF-capable paths.
- `hub-final-collision.scene.json`: low-complexity collision-only companion.
- Original V3 names, transforms, and `userData` are retained verbatim. Added art objects use `E2049_PROP_FINAL_*`.

## Interactive zones
Markers remain in the scene for spawn, social zones, vendors/NPCs, upgrade and crafting services, customization, stash, progress/mission boards, training targets, travel/deployment, traversal, railings, arena walls, soft locks, and entry gate. Runtime marker meshes may be hidden without removing metadata. Scene metadata remains `gameMode: hubLobby` and `combatDisabled: true`.

## Material system
The supplied Hub V3 library is embedded by URL in the scene's `images`/`textures` arrays and documented by `hub-final-texture-bindings.json`. Base-color and emissive maps are sRGB; normal, roughness, metalness, AO, and alpha maps are linear. Repeating PBR families use shared materials to limit state changes. Ivy uses alpha test; water is transparent with depth writing disabled.

## Collision and traversal
Authoritative colliders are exported separately and retained in the main scene. The continuous west-to-east bridge, Market Balcony staircase, Workshop Catwalk staircase, and two-stage Command Overlook staircase are validation-gated. Decorative clutter intentionally has no collision in primary routes.

## Export procedure
```sh
python3 scripts/build-rebel-hub-final.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/export-rebel-hub-final-glb.py
python3 scripts/validate-rebel-hub-final.py
npm run scenes:manifest
```

## Runtime integration
Load `assets/scenes/districts/rebel-hub-haven-commons-final.scene.json` through `AssetLoader.loadScene`. Registering it in `assets/data/scene-manifest.json` makes it discoverable. The stock ObjectLoader resolves embedded texture/image declarations relative to the scene URL. Use the GLB only when the runtime path explicitly uses GLTFLoader; gameplay metadata remains authoritative in Object JSON. Honor `combatDisabled` before starting directors or enemy simulation.
