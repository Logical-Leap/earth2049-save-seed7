# Changelog

## 2026-11-12 — Native VR (WebXR): the whole game, fully immersive

- **New `js/vr.js`.** Press **Enter VR** (on the title screen or in pause) in the Meta Quest Browser or any WebXR browser.
  - It's a real immersive session: your head is the camera, the gun is in your right hand, the HUD is on your left wrist, and menus float in front of you and are pointed at with a laser.
  - It covers the title, the Haven (dialogue, the Fitting Room), Operation Unsubscribe, the district runs and co-op.
- **Locomotion:**
  - Left stick moves toward where you're looking; right stick snap-turns (smooth turning is in Options).
  - Walking in your room walks you in the game, through the normal collision.
  - Ducking for real crouches and slides.
- **Combat:**
  - You aim with your hand, and a red dot shows where the gun points.
  - Recoil and hits buzz the controllers, and getting hurt flashes the edges of your view red.
  - The comfort vignette while moving can be turned off in Options.
- **Menus:** every menu is mirrored onto a panel from the gamepad's menu detection, so anything that works on a controller works in VR.
- **Your body:** legs under you, and the gloves you picked at the Fitting Room on your controllers.
- **Under the hood:**
  - The game loop now runs on `renderer.setAnimationLoop`.
  - In XR each eye renders directly; bloom and the PS1 post effects stay on flat screens only.
- **Testing without a headset:** `?xremu=1` loads Meta's Immersive Web Emulation Runtime (MIT, `tools/iwer`) as a Quest 3.
- See `docs/VR.md`.
## 2026-11-12 — New title screen

- `js/title.js`: the title is now a live diorama. You stand on a rooftop in your Fitting Room look, with the city
  around you to the horizon and Turing's ring and eye hanging in the sky. Rain falls, searchlights sweep, drones
  cross, the neon pulses on the title theme's beat, and the camera cuts between three shots with a glitch.
- A GigaCorp boot log plays once per session, then PRESS ANY BUTTON. Pressing it wakes the audio, so the theme
  and the logo hit land together, and the menu slides in.
- The menu is left-aligned and grouped (Play / Squad / Prepare), with a sweep highlight, a description line,
  hover and confirm sounds, a live SEED 7 status readout and a GigaCorp LIVE propaganda ticker. Keyboard
  (arrows / W S, Enter), mouse, touch and controller all drive the same selection. Compact layout on phones.
- Button ids are unchanged, so game.js still owns what each one does.

## 2026-11-11 — Your own body, controller support, sprint, and level-ups

- **Your Fitting Room look in first person** (`js/fp-body.js`):
  - The gun hands now wear your equipped gloves and sleeves (bare forearms with a tee, mitts, cyber arm…) instead of the generic black glove.
  - Look down in the arena or the Haven and you see your top, then your legs and shoes.
  - Saving a new look in the Fitting Room re-dresses both straight away.
- **Full controller support** (`js/gamepad.js`, standard-mapping pads: Xbox, PlayStation, Switch Pro, 8BitDo).
  - **Combat:** LS move, RS look with aim assist (slowdown over targets, gentle pull), RT fire, LT aim, A jump, B crouch/slide, X pick up/reload, Y swap, RB kick, LB grenade, L3 sprint, START pause.
  - **Haven and districts:** X talks and interacts, LB/B use abilities, RB reloads.
  - **Every menu works on the pad:** title, armory, pause, Haven dialogue, the Fitting Room (LB/RB switch tabs, X buys, Y saves, RS turns the model), arena cards and results.
    - A glowing focus follows the D-pad or left stick; B backs out.
  - Rumble on shots, hits, kills, level-ups and card picks.
  - New options: Controller Look sensitivity and a Rumble toggle.
  - The pad never needs pointer lock, and prompts switch to [X].
- **SHIFT now sprints by default** (the left stick click does the same), with a sprint gun pose and a wider view while sprinting.
  - Arena: the dash is now the **JET DASH** sponsor perk. It swaps sprint for the dash and adds +8% move speed. DASH CHARGE only appears once you have it.
  - Districts: Ghost Protocol unlocks the dash.
- **Yellow chips are now XP** (Vampire Survivors style).
  - Every chip fills an XP bar; relays and flawless waves add bonus XP. Chips still bank as GigaTech and still pay for rerolls.
  - **Each level-up gets a fanfare:** slow-mo, a pillar of light, a shockwave, a full-screen LEVEL UP burst, a synthesised arpeggio and choir chord, rumble and the chat going off.
  - **Then a three-card pick.** It gets light rays, cards flipping in one after another with their own sounds, glows by rarity (Rare pulses, Legendary gets a rainbow border and a choir), and a SIGNED stamp when you choose. Sponsor breaks use the same treatment.
  - Chip pickups chime higher as you chain them.
  - The results screen shows the level you reached.

## 2026-11-11 — Avatar: eyepatch, hats fit over hair

- New Legendary Eyepatch (face gear), worn over the right eye. Unlock text: "Hide in the cardboard box in the Haven"
  (not wired yet).
- Hats no longer clip through hair: hats that cover the crown trim the hair above their rim, so any hair hangs out
  from under them (tall styles tuck away); bandanas, crowns and cat ears grow to sit on the hair; the halo and cat
  ears float above tall hair. `renderer.localClippingEnabled` is now on. Avatar kit synced from game-art-pipeline
  `c97d2da` (avatar files only).

## 2026-11-11 — The Fitting Room: avatar customisation in the Haven

- **New Haven area: the Fitting Room.** It sits in the Night Market's north-west corner, visible from the concourse, and is built by game-art-pipeline `maps/haven/build.py`. It has:
  - Seam the tailor, dressed from the avatar kit.
  - A dais where your current fit stands and turns.
  - Two mannequins wearing today's Daily Drop.
  - Clothing racks and a mirror wall.
- **Talk to Seam** to open the loadout screen as a shop. It gains:
  - A ★ TODAY tab: the Daily Drop plus your closest unlocks.
  - Price, licence and feat badges on every card, and NEW tags.
  - Progress bars and a BUY button.
- **`js/wardrobe.js`: unlock routes for all 76 non-default items.**
  - 20 are sold for DRIP.
  - 30 are licensed: a feat opens them for sale.
  - 26 are feat rewards that are never sold, including every Relic.
- **DRIP** is a new cosmetic currency (GigaTech still buys power). It comes from:
  - Every run, scaled by result, grade, style, relays and heat. The first win of the day pays double.
  - DRIP tags dropped by elites.
  - A merch crate hidden high in every run.
  - A once-only traffic cone on the far gantry.
  - Feat bounties and collection milestones.
- **Feats count lifetime stats from the arena and the Haven.** Unlocks pop mid-run, appear on the results screen, and are announced in the hub.
- Older saves are seeded from their arena record.
- The look and unlocks now live in the versioned save (`SAVE.wardrobe`).
- Dev console: `drip [n]` and `feat <id>`.

## 2026-11-11 — Player avatars and the loadout creator

- New player avatar kit from game-art-pipeline `0b943ef` (`assets/models/ps1/avatar/`): two bodies, ~100 items each
  across face, hair, headgear, face gear, top, hands, legs, feet, back and neck, each with a rarity, flavor line and
  unlock. Six colour slots tint the whole outfit. Synced by `scripts/sync-ps1-models.js`.
- `js/avatar.js` (`AvatarKit`): builds dressed, tinted, animated avatars (hats tuck hair, helmets hide face gear,
  gloves sit over sleeves), first-person mode (head hidden, arms/legs/shoes visible), loadout codes for co-op,
  saving, and unlock tracking.
- `js/avatar-creator.js` (`AvatarCreator.open()`): the loadout screen: category cards with rarity and lock state,
  colours, random, first-person check, squad lineup, share codes. Dev console: `loadout` / `loadout all`.
- The hub vendor and unlock rewards were wired in later the same day (the Fitting Room, above). Co-op and first-person bodies are still to do: see `docs/AVATAR_SYSTEM.md`.

## 2026-11-11 — Reload timing pass

- Reload times per gun (Common, quick / empty): Volt-9 1.45 / 1.85 s, VX-2 2.05 / 2.55 s, M-52 2.45 / 3.05 s,
  Harbinger 3.0 / 3.2 s (+ working the bolt when empty), Plasma Lancer 2.9 / 3.6 s, Compliance Saw 5.8 / 6.4 s
  (the slowest), Riptide 0.58 s per shell, MGL-6 0.95 s per grenade. Rarity now speeds reloads up by at most 18%
  (it was 28%), separately from aiming and drawing.
- Magazine reloads are a real sequence: grab, pull it out, then either stow it in the pouch (quick reload) or let it
  drop (empty reload: the old mag falls, tumbles and clatters on the floor), the hand goes to the pouch, a fresh mag
  comes up angled, lines up, seats and gets a tap. Plasma cells pop out of the top when empty. The LMG stows its box
  and fetches a new one; the MGL-6 brings each grenade up from the bandolier. The support hand now follows the
  magazine it's holding. New sounds: mag release, stow, pouch flap, empty mag on the floor, cell eject.

## 2026-11-11 — Gunplay pass 2: every gun works its own way

- **Riptide-12 is now a pump-action shotgun.** One huge boom per shot, then the support hand racks the pump and a red
  plastic hull flies out and bounces with its own hollow plastic sound. Reloads tilt the gun and thumb shells one at a
  time into the loading port (6 rounds, 8 with the extended tube from Rare up); a dry gun is racked at the end. Firing
  stops a reload once a shell is in. Bigger FOV punch and heavier kick.
- **LRX-7 Harbinger:** after every shot the scope drops and the firing hand leaves the grip, lifts and rips the bolt
  back (the casing flies out, the next round rises from the magazine), drives it home and locks it. Faster scope-in
  for quick-scoping and almost no spread once scoped.
- **Compliance Saw:** the belt now runs from the box/drum into the feed tray and steps forward one link per shot.
  Reloads open the cover, swap the box, lay the new belt in the tray and slap the cover shut; no charging handle.
- **Optics:** red dots and holo sights are clear glass with a red dot or an EOTech ring reticle on the sight line, so
  aiming never blocks the view. Scopes keep their zoom and overlay.
- Reload hands go where each gun's parts really are (pistol slide, SMG/AR charging handle on the visible side);
  the Plasma Lancer vents its coil instead of racking anything.
- **Explosions (new `js/boom.js`):** MGL-6 grenades go off with a flash and light pop, a boiling fireball that chars
  to smoke, ground and air shockwaves, debris and embers, a smoke column and a scorch mark, plus camera shake, an FOV
  punch and a layered explosion sound. Plasma bolts burst in hot blue. Rarity colours the fire from Epic up.
- Plasma Lancer shot rebuilt: a heavy thwump, a fat dropping bass sweep, a crackling bolt and a sizzle tail.
- Weapon models synced from game-art-pipeline `e0db064`.

## 2026-11-11 — Gunplay: weight, reloads, ADS, sound, and seven real rarities

- New `js/gunfeel.js` drives first-person weapons: one viewmodel per gun and rarity from the game-art-pipeline arsenal
  GLBs (attachments and finish per rarity), gloved hands, spring recoil (viewmodel and camera, with partial climb),
  bob/sway/strafe tilt/landing dip, draw animation, muzzle flashes coloured by rarity from Epic up, ejected casings
  that bounce and tink, and moving parts (slide, bolt, bolt-action cycle, pump, LMG feed cover, launcher drum, energy coil).
- Magazines and reloads: `R` reloads (tactical and slower empty reloads with a rack/pump/slide release/vent), the LMG
  opens its feed cover, the Plasma Lancer swaps its cell, the MGL-6 loads shell by shell (firing interrupts it).
  Empty trigger pulls auto-reload. HUD shows `clip / reserve`. The second active ability moved from `R` to `C`.
- Aim down sights on right mouse: per-optic sight lines (iron, red dot, holo, scope), FOV zoom, slower aim
  sensitivity, tighter spread; scoped optics switch to a scope overlay (thermal tinted).
- New `js/gunaudio.js`: layered synthesized gunshots (transient, crack, body, sub, signature, mechanics, convolution
  room tail) through a compressed, soft-clipped gun bus; full reload and handling foley. Rarity adds layers: more sub
  from Uncommon, bite from Rare, an energy sweep at Epic, a thunder layer at Legendary, a gold chime at Mythic and
  Turing glitch bursts at Relic.
- Rarity now changes how a gun handles: less recoil, faster reload/aim/draw, bigger magazines (per attachment), bigger
  flashes and coloured impact sparks from Epic up.
- The Compliance Saw LMG now has a PS1 model (weapon.lmg); weapon GLBs synced from game-art-pipeline `d072cac`+.

## 2026-11-08 — Every enemy is PS1

- Bots node, Bots sentinel ("Ad Broadcaster") and Cryptid drone now use new PS1 models from game-art-pipeline, so no procedural enemies remain. The node is a full humanoid15 character (face-screen smiley, all clips); the sentinel and drone are props-kit units whose `leg_*` / `spin_*` nodes the game animates (new 4-leg diagonal gait).
- Free-cursor aiming fallback when a browser frame refuses pointer lock (desktop players in embeds could not aim or fire).

## 2026-11-08 — PS1 look, PS1 cast and lighter assets

- Added a PS1 render mode (`js/ps1-mode.js`): 360-line default or 240-line authentic internal resolution, nearest-filtered textures, vertex snapping, 15-bit colour with the PS1 4x4 dither. Title-screen **Look** button switches PS1 / PS1 Authentic / Modern.
- Replaced the enemy GLBs with PS1 models from game-art-pipeline: ShillZ (shill, streamer), big ShillZ (hypebeast), Muskers (runner, lancer), Cryptid (broker), mech (trooper), mech enforcer (enforcer). Bosses Riya, Magnus, SPYD3R, Blitz and Turing now use their PS1 models. Each uses real Walk / Run / Punch Combo or Shoot / Hit React / Death clips, stepped at 15 fps in PS1 mode.
- Seven of the eight guns now use the PS1 weapon models (Volt-9, VX-2 Ripper, Riptide-12, M-52 Revenant, LRX-7 Harbinger, Plasma Lancer, MGL-6 Thunderer).
- Fixed GLB enemies staying locked in their attack animation after the first attack (the attack timer only decayed on the procedural path).
- Cut runtime textures to PS1 scale (150.8 MB → 14.4 MB; Hub GLB 25 MB → 5.3 MB) and removed the duplicate authoring zips and the old 6–8 MB enemy models from the tree. Character models went from ~21 MB to 5.9 MB. Repo working tree: 329 MB → 94 MB.

## 2026-07-13 — Milestone 2 authored-map and reward reliability

- Fixed external authored-map movement so ShillZ's authored player start no longer inherits the smaller procedural-grid boundary, and preserved authored starting yaw.
- Made authored Hub traversal surfaces walkable/supporting, normalized service marker aliases, added a reachable arrival deployment fallback, and sealed the southern corner escape gaps.
- Added persistent ShillZ terminal guidance and replaced the misleading pre-objective wave label with an objective state.
- Removed duplicate Riya GigaTech/intel reward paths and made extraction settlement atomic: failed local save writes retain the live run and rewards for a safe retry.
- Added deterministic map-runtime/reward/settlement regressions plus a localhost-only read-only observer and real-input browser smoke covering Hub entry, deployment, authored ShillZ movement, terminal activation, and wave-one spawning.

## 2026-07-13 — ShillZ loyalist canon runtime correction

- Replaced outdated counterfeit-resistance slogans in active ShillZ config, procedural fallback scenery, and character patches with approved pro-GigaCorp loyalty, authority, reporting, and consumption language.
- Identified Riya Vex in the boss HUD as **The Signal Witch — Loyalty Icon**.
- Updated the map-making knowledgebase and system docs so future authored content cannot regress to Rebel graffiti, anti-GigaCorp messaging, or fake-resistance themes.
- Added executable canon regression tests and cache-busted all affected no-build scripts.

## 2026-07-13 — Reproducible co-op deployment and cache refresh

- Pinned Wrangler 4.110.0 in the repository so `coop:deploy` and `pages:deploy` no longer depend on a globally installed CLI; the locked toolchain reports zero npm audit vulnerabilities.
- Cache-busted the co-op protocol, client, room, and game scripts so browsers immediately receive PR #40's authorization rules instead of retaining the previous one-hour JS cache entries.
- Updated the MVP status with merged QA/docs/security evidence and removed stale duplicate Milestone 2 rows.

## 2026-07-13 — Co-op protocol authorization hardening

- Replaced the Durable Object's catch-all client rebroadcast with an explicit browser-message allowlist and rejection of unknown, unhandled, and server-origin event types.
- Made `REWARD_GRANT` server-origin-only at both the browser send boundary and room server, closing forged local reward delivery through the room.
- Enforced host authority for boss/objective/district and run transition/completion/failure messages, with active-run/lobby state guards and sanitized transition payloads.
- Enforced all-connected-player ready state before server-approved run start and removed the host's optimistic local start path.
- Added 64 KiB message and 120 messages/second/player limits plus executable Node security regressions for authorization, reward forgery, ready gates, transition replay, payload sanitization, and traffic bounds.

## 2026-07-13 — Required MVP system documentation

- Published current-versus-target contracts for map authoring, assets, enemies, bosses, objectives, the Turing Director, schema-v2 saves, performance budgets, and release QA.
- Added reproducible verification commands and explicit blockers without presenting unimplemented modules, browser acceptance, deterministic simulation, performance targets, or campaign lifecycle as complete.
- Established authoritative ShillZ documentation canon: willing pro-GigaCorp consumer loyalists rather than rebels/counterfeit resistance, with Riya as a pro-authority GigaCorp propagandist; conflicting legacy strings remain tracked content debt.
- Updated the MVP status document to reference the complete documentation set and the merged save baseline; no runtime or user assets changed.

## 2026-07-13 — Hub-to-ShillZ vertical campaign loop

- Turned Rebel Haven's authored mission, workshop, vendor, stash, medical, training, commander, and scout markers into usable proximity interactions for deployment, Armory, Briefing, healing, and training feedback.
- Replaced the 10-object ShillZ sample with a deterministic 104-object Engagement Square containing sealed boundaries, three routes, elevated traversal, 20 cover islands, 12 enemy spawns, 8 pickups, a world objective, Riya arena, extraction, commercial infrastructure, and canon-correct pro-GigaCorp loyalty propaganda.
- Wired authored objective and extraction markers into runtime interaction: disable the loyalty broadcast, clear waves and Riya, extract to Rebel Haven, bank rewards, purchase a permanent upgrade, and deploy into a stronger second run.
- Added persistent, idempotent leader-defeat credit for every faction through the shared `CampaignProgression` seam and regression coverage for the Hub/ShillZ contracts.

## 2026-07-13 — Versioned save recovery and portability

- Added schema-v2 save defaults, ordered/idempotent migration, validation and bounded normalization while preserving the existing `earth2049_seed7_v1` storage key and recognized/unknown legacy fields.
- Added mandatory verified backups before recovery/import/reset can replace primary data, invalid-save recovery, exact raw export for future-version saves, current-schema normalization backup, graceful storage-failure behavior, and validated JSON export/import/reset APIs.
- Bounded catalog-controlled upgrades, corruption upgrades, relics, modifiers, mastery, abilities, intel, options, and scalar counters so malformed saves cannot inject non-finite gameplay state.
- Added an Armory **Save** tab for status, export, import, and confirmed reset, plus Node and browser-integration regression coverage.

## 2026-07-13 — Early Access MVP baseline

- Added a truthful Early Access baseline covering current player flow, completion estimate, feature matrix, map/asset/save/co-op/deployment/performance inventories, verification evidence, blockers, and next priorities.
- Added the focused milestone/task graph and exact acceptance tests for the Hub-to-ShillZ vertical slice, shared runtime seams, five-district campaign, deterministic Turing Director, private co-op beta, and production release.
- Documented the current and target no-build architecture plus prioritized MVP blockers/risks; no gameplay or user assets changed in this documentation milestone.

## 2026-07-13 — Camera look reset fix

- Bounded pointer-lock and touch look deltas so OS/browser input spikes during fast turns cannot snap the camera or abruptly redirect held movement.
- Normalized accumulated yaw and cleared queued look input across pointer-lock and pause transitions.
- Added regression coverage for extreme and non-finite look input.

## 2026-07-13 — Faction skyboxes across every district

- Added a centralized, cached faction skybox registry for ShillZ, Muskers, GigaCorp, Bots, Cryptids, and the Rebel/Dead Zone Hub.
- Added metadata/file/config faction detection, automatic start-to-objective yaw, explicit `skyboxFaction` and `skyboxYawDegrees` overrides, safe loading colors, faction fog, and r147-compatible cached cubemap rotation.
- Kept skyboxes visual-only (`scene.environment = null`) and preserved gameplay geometry, collision, spawns, objectives, and extraction metadata.
- Added automated cubemap/scene validation and a complete mapping report in `docs/faction-skybox-integration.md`.

## 2026-07-12 — Rebel Haven Hub runtime integration and production visual correction

- Added a dedicated **Enter Rebel Haven Hub** title-screen path, separate from ShillZ Central and all combat districts.
- Added a Blender-authored 599-mesh production visual scene with beveled architecture, structural ribs, windows, signs, ducts, antennas, cables, landmark framing, and embedded Hub PBR textures.
- Kept the authoritative Hub V3 Object JSON active for all gameplay metadata, interaction markers, collision, stairs, bridge, balcony, catwalk, and Command Overlook routes.
- Prevented generic faction textures, combat waves, Turing director messages, and weapon firing inside the `hubLobby` safe zone.
- Corrected Blender/Three.js axis conversion and expanded Hub movement beyond the combat grid while retaining authored prop collision.
- Fixed Hub texture flickering/z-fighting by parsing metadata first and then keeping all 430 duplicate Object JSON blockout meshes hidden whenever the production GLB is active.
- Removed the second remaining z-fighting path: the generic 300×300 district ground plane was exactly coplanar with the Hub floor. Hub builds now omit that plane, and Blender export excludes 30 invisible arena-wall/soft-lock collision volumes from the rendered GLB.
- Added Chandler's attached six-face **Earth 2049 Dead Zone Overlook** cubemap as the Rebel Haven-only skybox, with sRGB loading, procedural fallback, disposal on world rebuild, and cache-busted assets. Combat districts retain their existing procedural skies.

## 2026-07-12 — Rebel Hub: Haven Commons production package

- Added the production Haven Commons Object JSON while preserving every authoritative Hub V3 gameplay object, transform, name, and `userData` value.
- Added 221 modular settlement-art meshes spanning the arrival yard, Commons, market, workshop, customization/stash, training garden, memorial, Command Overlook, bridge, balcony, and catwalk.
- Embedded the supplied PBR material library with correct sRGB/linear map treatment and reusable texture bindings.
- Added a consolidated Blender-exported GLB, collision-only scene, asset manifest, performance/validation reports, build/export/validation scripts, and complete distributable ZIP.
- Registered the final scene in the generated scene manifest and validated stock Three.js `ObjectLoader` parsing, texture HTTP resolution, metadata, gameplay markers, collision references, and elevated routes.

## 2026-07-10 — Co-op synchronization and revives

- Made the host the sole authority for enemy AI, waves, projectiles, spawn RNG, enemy health/death, and pickup creation.
- Added ordered shared-world snapshots with enemies, pickups, wave phase, pending spawns, and director threat for reconnects and host migration.
- Added buffered interpolation for remote players and enemies to reduce snapping and visual disagreement.
- Added automatic WebSocket reconnect with authoritative room/world resynchronization.
- Added teammate revives: hold **E** or the mobile interact button near a downed teammate for 1.8 seconds.
- Added server validation for revive state, range, and hold duration.
- Added host migration when the current authority is downed or disconnected.
- Prevented non-host clients from independently generating enemy deaths, drops, waves, and director events.
- Changed co-op pause to a local menu: the shared AI, world clock, and network synchronization continue while the paused operative's controls are neutralized.
- Added an always-visible nearby teammate revive prompt with hold progress, countdown, target name, and mobile **REVIVE** button state.
- Made revive requests retry safely while the player keeps holding the interaction key and clear only after the server confirms or rejects the request.
