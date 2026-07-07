# EARTH 2049: SAVE SEED 7

**▶ PLAY NOW: https://logical-leap.github.io/earth2049-save-seed7/** — desktop or phone, no install.

A first-person roguelike shooter set in the Earth 2049 universe. You are **Punished Elliot**,
casting combat simulations through the OG Device to find the timeline where Turing falls.

Built with Three.js — runs in any modern browser, desktop or mobile. No install, no build step.

## How to Play

**Desktop:** double-click `index.html` (or run `PLAY.bat`). Click the screen to lock the mouse.

**Phone:** the game needs to be served over the network. From this folder run:

```
npx --yes serve -l 8049 .
```

then open `http://<your-pc-ip>:8049` on your phone (same Wi-Fi). Landscape recommended.
Touch controls: left thumb = move stick, right thumb = aim, plus FIRE / DASH / SWAP buttons
and an AUTO toggle that fires automatically when your crosshair is on a target.

### Desktop Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim / LMB fire |
| Shift | Dash (i-frames) |
| Space | Jump |
| Q / 1 / 2 | Swap weapon |
| E | Take weapon from crate |
| Esc | Pause |

## The Run

1. Fight through 5 districts: **ShillZ Central → Musker Labs → Bot Bay → Cryptid Domain → GigaCorp Campus**
2. Clear waves, then break the district's faction leader: Riya Vex, Magnus, SPYD3R.exe, Blitz Radium — and finally **Turing**
3. Between districts the OG Device offers a choice of 3 augments (build your run)
4. Chain kills to build **combo** — higher combo multiplies GigaTech pickups
5. Bosses and elites drop weapon cores in 7 rarity tiers: Common → Uncommon → Rare → Epic → Legendary → Mythic → Relic
6. Death banks your GigaTech. Spend it in the **Armory** on permanent upgrades, then cast again

**Turing is watching.** The AI Director tracks your performance — dominate and it deploys
assassin squads; struggle and it toys with you.

## Arsenal (Global Arsenal standard issue)

Volt-9 Pistol · VX-2 Ripper SMG · Riptide-12 Shotgun · M-52 Revenant AR ·
LRX-7 Harbinger Sniper · Compliance Saw LMG · Plasma Lancer · MGL-6 Thunderer

## Tech Notes

- No-build static Three.js r147 (UMD) + UnrealBloom postprocessing, local copies in `lib/`
- `js/loader.js` provides a runtime asset/data layer for Three.js Editor scene JSON, GLB manifests, and optional external data overrides
- Districts can reference editor-authored scenes under `assets/scenes/districts/`; ShillZ Central includes a small sample scene with player start, boss arena, enemy spawn, pickup, and collider markers
- Core gameplay remains code-driven: waves, AI, weapons, abilities, upgrades, Turing Director, HUD, saves, and mobile controls
- Procedural districts, pickups, projectiles, and fallback enemies remain available when external scenes/models fail or are omitted
- Selected finished GLB enemies are loaded for matching faction commons: ShillZ common, Musker runner, and Cryptid broker
- The finished AR GLB is loaded as the M-52 Revenant assault-rifle viewmodel via `assets/data/asset-manifest.json`
- Save data (GigaTech, upgrades, stats, options) persists in browser localStorage
- Adaptive quality: resolution and bloom scale down automatically on slower devices

## Editor / Asset Workflow

- Use the official Three.js Editor: https://threejs.org/editor/
- Export scene JSON into `assets/scenes/districts/`
- Add gameplay markers named `E2049_PLAYER_START`, `E2049_BOSS_ARENA`, `E2049_ENEMY_SPAWN`, `E2049_PICKUP_SPAWN`, `E2049_COLLIDER`, `E2049_COVER`, or `E2049_BLOCKER`
- Reference the scene with `sceneUrl` in `DISTRICTS`
- Put GLBs under `assets/models/` and reference them from `assets/data/asset-manifest.json`

See:

- [`THREEJS_EDITOR_WORKFLOW.md`](THREEJS_EDITOR_WORKFLOW.md)
- [`ASSET_PIPELINE.md`](ASSET_PIPELINE.md)

*This revolution brought to you by GigaCorp.*
