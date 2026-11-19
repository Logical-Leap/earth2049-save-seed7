# GigaLeague: competitive PvP

The design lives in the claude.ai project doc `claude/multiplayer.md`. This file says how it is built.

## Playing it

- **Title screen:** GigaLeague (PvP).
- **Rebel Haven:** talk to 5ON at the Dreamcaster rig and pick "Put me in the GigaLeague."

The menu has three tabs:

- **PLAY**
  - Quickplay by playlist (Core, Classic Arena, Party).
  - Offline against bots: any mode on any map, with no connection needed.
  - Private or public rooms with a code.
  - The open-room list.
  - The lobby: host settings, custom rules, the map vote and text chat.
- **CLASSES:** create-a-class (custom slots open at level 4) and the three scorestreaks you carry.
- **PROGRESS:** level, prestige, weapon levels, camos, lifetime stats, today's GigaTech against the cap.

**Controls**

Every button prompt in the menu, the HUD, the respawn screen and the pause menu shows the button of the device in hand (`js/input-glyphs.js`): keyboard keys on mouse and keyboard, the controller's own labels on a controller (Xbox, PlayStation or Switch, read from the pad's name). Settings > Button Prompts (also on the GigaLeague PLAY tab) pins one: AUTO, KEYBOARD, XBOX, PLAYSTATION or SWITCH.

| Action | Keyboard and mouse | Controller (Xbox labels) |
|---|---|---|
| Lethal grenade | `G` | LB |
| Tactical | `Q` | D-pad down |
| Melee | `F` | RB or R3 |
| Use, plant, defuse, pick up (hold) | `E` | X when there is something to use, else X reloads |
| Swap weapon | `1` / `2` / wheel | Y (never the D-pad) |
| Scorestreaks 1 / 2 / 3 | `3` `4` `5` | D-pad left / up / right |
| Scoreboard | `TAB` (hold) | VIEW (hold) |
| Pause, change class | `ESC` | MENU |
| Skip killcam (dead) | `SPACE` | A |
| Change class (dead) | arrow keys or click | LB / RB or D-pad left / right |

A class picked from the respawn screen applies next life. A class picked from the pause menu in the first 6 seconds of a life, before firing, applies at once (the CoD rule); otherwise next life. The GigaLeague menu works on a controller: the D-pad moves the focus, A presses, B backs out, LB / RB flip tabs, and left / right step through a dropdown.

Touch screens get extra buttons for TACTICAL, STREAK and SCORE.

## What a match sounds and feels like

Multiplayer never plays music: not in the menu, the lobby, a match or its results. `game.js`'s music director stops music while the GigaLeague is up, and the arena asks for no cue. So every footstep can be heard.

`js/arena/arena-pvp-audio.js` (`AR.PvpAudio`) places other players' sounds in the world. Each player has one emitter (an HRTF panner with a distance and wall low-pass); each kind of sound sets its own distance curve.

- **Gunfire.** Snapshots carry each player's rounds-fired counter (row index 13), so the client plays every round at the gun's rate, not one sound per burst. Every gun has its own voice (`PVP.GUN_SND`, recipes in `js/gunaudio.js`), even where two guns share a model, and the local player hears the same voice, so a gun is learned by using it. Past 45 m a gun is heard as its distant boom (`GunAudio.distant`); a sniper carries further than an SMG. Through a wall it is muffled. A suppressor (row flag 16384) makes it quieter and shorter-range.
- **Rounds passing close** to your head crack and whip past, so you know you are the one being shot at.
- **Footsteps** are loud and placed: enemy steps louder than a teammate's, sprinting loudest, crouch-walking near silent, a landing thuds. The NOISE-CANCELLING perk silences them. Most bot classes skip that perk, so bots can be heard coming.
- **Pain and death.** A grunt when anyone loses health, a cry and a body hitting the floor when they die. A teammate dying within 45 m also gives a short chirp.
- **Melee swings** whoosh (row index 14 counts them).

What you see:

- **Bodies fall and stay.** The avatar plays its Death clip once and holds it, knocked a little away from the shot. The body stays 8 seconds, then sinks. Each remote player has at most two avatars, swapped between the living player and the body. A teammate's death is marked on the minimap with a fading X for 6 seconds.
- **Kill feed.** Bigger (15 px, 8 seconds, 7 lines). Your kills are gold, your death red, a teammate's death blue. Four of your kills in a row with nobody else's in between is a QUAD FEED: the entries glow.
- **Points and kill confirms.** Under the crosshair, a running total for the current burst of play, with ELIMINATED lines and the reasons (HEADSHOT, ASSIST, HILL TIME…) under it.
- **Medals** (`PVP.MEDALS`): multikills, kill streaks, QUAD FEED, revenge, objective plays and more, in the GigaLeague's voice. They pop up a moment apart with a rising sound. The results screen lists the medals of the match.
- **Objective status** under the crosshair says whether you are playing the objective: IN THE HILL // SCORING (with +10 a second and a tick each point), CONTESTED, CAPTURING B with a progress bar, PLANTING / DEFUSING, YOU HAVE THEIR FLAG. It also prompts what can be used right there: hold to plant or defuse, a weapon to pick up. Flags changing hands have their own sounds, and team scores bump when they go up, with a bar toward the limit.

The quick match vote counts down on its own: the server sends the seconds left with each room update, and the menu counts down between updates.

Bots carry every core gun (`PVP.BOT_CLASSES`) and pick a new class each life.

## Pieces

| File | What it does |
|---|---|
| `js/pvp/pvp-data.js` | All content and tuning. It's plain data shared by server and client. Covers playlists, the 12 modes, the 10 maps, health models, movement profiles, guns (core and Classic Arena), attachments, perks, lethals, tacticals, scorestreaks, premade classes, XP, unlocks, camos, rewards, commendations, the host's callouts and bot skill. |
| `js/pvp/pvp-sim.js` | **The match simulation**, the single source of truth. Covers collision and raycasts (a port of `arena-core`), lag-compensated hits, movement and fire checks, every mode, bots, grenades and tacticals, scorestreak entities, pickups, results and rewards. No DOM and no THREE. It runs in the Worker and in the browser. |
| `workers/pvp-match.js` | `PvpMatchDurableObject`: one per room. It owns the lobby and runs the sim at 30 ticks a second, sending each player a snapshot 20 times a second plus their events. |
| `workers/pvp-maps.generated.js` | The server's copy of every map. Build it with `npm run pvp:maps`; `npm test` fails if it is stale. |
| `workers/coop-worker.js` | Routes: `POST /pvp/rooms`, `GET /pvp/rooms`, `POST /pvp/matchmake {playlist}`, `/pvp/<code>/ws`, `/pvp/<code>/state`. |
| `workers/lobby-directory.js` | The same open-room directory as co-op, under the name `pvp-directory`. PvP entries hold up to 16 players and carry their playlist. |
| `js/pvp/pvp-net.js` | Transports. `PvpNet.local(opts)` runs the sim in this browser; `PvpNet.online(code, who)` connects over a WebSocket. The client code is the same either way. |
| `js/arena/arena-pvp-audio.js` | `AR.PvpAudio`: other players' sounds placed in the world (gunfire, close rounds, footsteps, pain, death, melee) and the flat cues for scoring, captures, medals and kill confirms. |
| `js/input-glyphs.js` | `Glyph`: button prompts for the device in hand, and the BUTTON PROMPTS setting. |
| `js/arena/arena-pvp.js` | `AR.PvpMission` stands in for `AR.Mission` during a match, and `AR.Pvp` is what `arena-player` calls. It covers remote avatars with 100 ms interpolation, items, streaks, projectiles, smoke and objectives, and the HUD: score bar, kill feed, minimap, streaks, respawn screen with class change, killcam, scoreboard, flash, stun and blackout, the host's lines, and the results screen with the podium. |
| `js/pvp/pvp-progress.js` | `SAVE.pvp`: level, prestige, weapon XP, camos, classes, stats and the daily GigaTech cap. Cloud saves sync it with the rest of the save. |
| `js/pvp/pvp-menu.js` | The GigaLeague menu. |

**Changes to existing files**

- **`arena-player.js`:**
  - movement profiles (sprint, jump fatigue, slide cooldown, mantle, no double jump)
  - a loadout from the match
  - server-owned shots, reloads, swaps, melee and grenades
  - bursts, sprint-to-fire, guns without zoom
  - aim assist over remote players
- **`arena-main.js`:** starts a PvP match and swaps the mission object. In an online match, pausing doesn't stop the game.
- **`arena-enemies.js`:** "ghost" projectiles. Your own rockets fly locally while the match owns the real ones.
- **`gunfeel.js`:** `GunFeel.setFair()`. In PvP, rarity is a look only: handling uses tier 0, and the magazine comes from the match's table.
- **`game.js`:** `startPvpMatch`, `openPvpMenu`, the title button and the Haven action.

## Authority

- **Movement:** the client predicts its own movement. The sim rejects any move faster than `PVP.MAX_HSPEED`, any move through a wall (tested at knee and chest height), and anything outside the map bounds, then snaps the player back.
- **What the sim decides:** health, damage, kills, score, ammo and reloads, fire rate, grenades, pickups, spawns, streaks, objectives and rewards.
- **Lag compensation:** each player keeps 40 ticks (1.3 s) of position history. A shot's `rt`, the server time the shooter was looking at, is rewound at most 200 ms.
- **Hit marker:** it shows at once from the local picture. The match's `hit` event confirms it and plays the sound.
- **Not covered yet:** aimbots. Progression is banked on the client, with the server computing the rewards. Ranked needs server-side progression first.

## Modes and maps

**Core**
- Team Deathmatch
- Domination
- Free-for-all
- "Data Harvest" (Kill Confirmed)
- Hardpoint
- "Hostile Takeover" (Search and Destroy)

**Classic Arena:** Slayer, Capture the Flag, "Hot Take" (Oddball).

**Party:** "Serverless Epidemic" (Infection), "Influencer" (Juggernaut), "Rarity Climb" (Gun Game).

Every district map is a PvP map: Plaza, Block 9, Downtown, Tech, Government Quarter, Industrial, Harbor, the Upgrade Basilica, the $COOM Pyramid and The Web.

**Where the mode pieces come from**
- **Spawn sides:** the axis between the map's two farthest spawn points splits the spawns into two team sides.
- **Objectives:** the map's three relay markers become flags A, B and C, the bomb sites and the hills. Each is snapped to the nearest walkable nav node.
- **Classic Arena pickups:** these sit on perches, pad targets and the middle of the map. Power weapons go nearest the middle.

## Bots

- They walk the map's nav graph with A\* and trust its edges.
- They pick targets they can see, hear, or were shot by. Each skill level has a reaction time, and aim error shrinks while a bot tracks its target.
- They fire in bursts, throw grenades now and then, and push objectives (one in four stays to fight).
- They fill every empty slot and step aside when a person joins.
- **Check:** `node --test tests/pvp-sim.test.js` plays every mode to a finish.
- **Full run:** every mode on every map takes about 3 minutes.

## Rewards

| Reward | Rule |
|---|---|
| XP | Score + 300 for finishing + 500 for a win. The first win of the day doubles it. |
| DRIP | 30 for a loss, 45 for a win, +5 per commendation. |
| GigaTech | About 6–10 a match, at most 18. Capped at 75 per UTC day. None from Party modes, matches with no other humans, or custom games. |
| Bots-only matches | 75% XP, half DRIP, no GigaTech. |
| Custom games | Nothing. |
| Bot kills | Count toward weapon levels, never toward camos. |

## Deploying

The match server ships with the co-op Worker. `npm run coop:deploy` deploys it, including the `v3` migration that adds `PvpMatchDurableObject`. Until that runs, online PvP answers `pvp_unavailable`; offline matches work without it.

To test locally:
1. `npm run coop:dev`.
2. In the browser console, run `NetConfig.setWorkerUrl('http://localhost:8787')`.

## Not built yet (see the design doc's phases)

- **Art:** the 5 new guns use stand-in models (marked "STAND-IN" in the class editor); the gunship is a placeholder shape; infected players are avatars, not the Serverless model.
- **Gunship:** AI-flown. A player-flown gunship is still to come.
- **Voice:** party voice chat comes after launch, as decided.
- **Host:** text callouts under the placeholder name THE HOST, with no recorded voice.
- **"Outage":** the horde co-op mode is planned for after launch.
- **Fitting Room:** new feats and items need art. PvP already counts `pvpMatches`, `pvpWins` and `pvpKills` in the wardrobe stats.
- **Other:** colorblind team-colour presets, binary snapshots, server-side progression and ranked, and logging match data to D1 for balancing.
