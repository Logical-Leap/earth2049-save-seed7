# Earth 2049 Faction Skybox Integration

## Runtime

`js/skybox.js` owns the reusable registry, faction detection, six-face loading, source/rotated cubemap caches, yaw resolution, safe fallback colors, and faction fog. `World.build()` applies it after scene/layout discovery and before gameplay begins.

Cubemap order is always `px, nx, py, ny, pz, nz`. Textures use the Three.js r147 equivalent of sRGB (`texture.encoding = THREE.sRGBEncoding`), mipmaps, trilinear minification, and linear magnification. Skyboxes remain backgrounds only; `scene.environment` is deliberately `null`.

Three.js r147 predates `scene.backgroundRotation`. Arbitrary map yaw is therefore applied once into a cached `WebGLCubeRenderTarget`; the resulting rotated `CubeTexture` remains assigned to `scene.background`. Source faces are never swapped, mirrored, flipped, or edited.

## Faction registry

| Faction | Prefix | Fallback | Fog / density |
|---|---|---:|---|
| Dead Zone / Rebels | `earth2049_deadzone` | `#59616a` | `#6e7477` / `0.0030` |
| ShillZ | `earth2049_shillz` | `#423616` | `#52451f` / `0.0023` |
| Muskers | `earth2049_muskers` | `#172a22` | `#21342d` / `0.0025` |
| GigaCorp | `earth2049_gigacorp` | `#172735` | `#263846` / `0.0021` |
| Bots | `earth2049_bots` | `#101b13` | `#16271b` / `0.0028` |
| Cryptids | `earth2049_cryptids` | `#21152b` | `#241b30` / `0.0024` |

Resolution priority: `skyboxFaction` → root faction/district/area metadata → level filename → configured runtime faction → Dead Zone warning fallback.

Orientation priority: `skyboxYawDegrees` → player start to objective/boss → player start to extraction/travel gate → runtime procedural start to boss → zero degrees.

## Authored scene mapping

| Scene | Skybox | Orientation source | Yaw |
|---|---|---|---:|
| `bots-assembly-crucible.scene.json` | `earth2049_bots` | playerStart → objective | 180° |
| `bots-broadcast-nexus.scene.json` | `earth2049_bots` | playerStart → central spire/uplink objective | 180° |
| `bots-corruption-core.scene.json` | `earth2049_bots` | playerStart → objective | 180° |
| `bots-data-harvest-plaza.scene.json` | `earth2049_bots` | wrapper/file inference fallback | 0° |
| `cryptids-crypto-vault.v2.scene.json` | `earth2049_cryptids` | playerStart → objective | 180° |
| `cryptids-executive-skybridge.v2.scene.json` | `earth2049_cryptids` | playerStart → objective | 95.440° |
| `cryptids-gigaverse-access-node.v2.scene.json` | `earth2049_cryptids` | playerStart → objective | 147.171° |
| `cryptids-liquidity-exchange-atrium.v2.scene.json` | `earth2049_cryptids` | playerStart → objective | 180° |
| `cryptids-private-banking-suites.v2.scene.json` | `earth2049_cryptids` | playerStart → objective | 180° |
| `rebel-hub-haven-commons-final.scene.json` | `earth2049_deadzone` | playerStart → travel/extraction | -176.424° |
| `rebel-hub-haven-commons-v3.scene.json` | `earth2049_deadzone` | playerStart → travel/extraction | -176.424° |
| `shillz-central.scene.json` | `earth2049_shillz` | runtime configured faction | 0° |
| Procedural Musker Labs | `earth2049_muskers` | runtime start → boss | calculated per layout |
| Procedural Bot Bay | `earth2049_bots` | runtime start → boss | calculated per layout |
| Procedural Cryptid Domain | `earth2049_cryptids` | runtime start → boss | calculated per layout |
| Procedural GigaCorp Campus | `earth2049_gigacorp` | runtime start → boss | calculated per layout |

## Validation

Run:

```bash
python3 scripts/validate-faction-skyboxes.py
npm run pages:prepare
```

Browser verification reads `World.group.userData.skybox` and `Skyboxes.diagnostics()` to confirm selected faction, yaw source/value, six loaded faces, and cache reuse. Diagnostic labels are not shipped.
