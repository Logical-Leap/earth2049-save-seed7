# EARTH 2049: SAVE SEED 7

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

- All assets are generated procedurally in code (canvas textures, rigged low-poly enemies,
  synthesized WebAudio SFX/music) in the established faction art direction
- Three.js r147 (UMD) + UnrealBloom postprocessing, local copies in `lib/` — fully offline
- Save data (GigaTech, upgrades, stats, options) persists in browser localStorage
- Adaptive quality: resolution and bloom scale down automatically on slower devices

*This revolution brought to you by GigaCorp.*
