# Player avatar system

Players customise how their character looks. There are two bodies, Body A and Body B, with about 100 items each across 10 categories. Every item has a rarity, a flavor line and an unlock condition. Six colour slots tint the whole outfit.

The models come from `Logical-Leap/game-art-pipeline` (`projects/earth2049/characters/avatar`). They are copied here by `node scripts/sync-ps1-models.js ../game-art-pipeline`. Never edit the GLBs in this repo.

## What is in this repo

| File | What it does |
|---|---|
| `assets/models/ps1/avatar/catalog.json` | Categories, items (rarity, flavor, unlock text), colour palettes, defaults and the dressing rules |
| `assets/models/ps1/avatar/avatar_<m\|f>_base.glb` | The body, plus every animation clip (Idle, Walk, Run, Shoot, Crouch*, Jump, Death, Dance, Hype, Taunt, Wave…) |
| `assets/models/ps1/avatar/avatar_<m\|f>_<kit>.glb` | Item pieces on `<item>@<bone>` nodes. Kits: faces, hair, head, tops, hands, legs, feet, back |
| `js/avatar.js` | `window.AvatarKit`: loads the kit, builds a dressed and tinted avatar, handles loadout codes, saving and unlocks |
| `js/avatar-creator.js` | `window.AvatarCreator`: the full-screen loadout screen (the "viewer") |
| `tests/avatar-kit.test.js` | Checks the catalog against the GLBs |
| `js/wardrobe.js` | `window.Wardrobe`: unlock routes, DRIP economy, feats, Daily Drop, the shop surface the creator renders |
| `tests/wardrobe.test.js` | Every item has an unlock route, economy pacing, the Fitting Room layout |

Dev console: `loadout` opens the creator with only owned items saveable. `loadout all` opens it in free mode.

## In the game: the Fitting Room and the Wardrobe

**Where:** the Fitting Room, a booth in the north-west corner of the Night Market (built in the pipeline's `maps/haven/build.py`). It has:
- **Seam**, the tailor (`npc:tailor` in `js/haven-data.js`). Seam is dressed from this kit. Talking to Seam opens `AvatarCreator` in shop mode.
- **The dais**, where your current fit stands and turns. It re-dresses when you save a new look.
- **Two mannequins** wearing today's Daily Drop pieces, with the price on a tag.

**Unlocks and economy** live in `js/wardrobe.js` (`window.Wardrobe`), saved in `SAVE.wardrobe`. Every non-default item has one route:

| Route | Count | How |
|---|---|---|
| SHOP | 20 | Buy for DRIP. Common ◆75, Uncommon ◆150, Rare ◆350, Epic ◆700 |
| LICENSE | 30 | A feat opens it for sale at its rarity price (Legendary ◆1,400, Mythic ◆2,600) |
| FEAT | 26 | Earned only, never sold. The item drops into your locker with a DRIP bounty (◆50 × tier). Every Relic is a feat |

**DRIP** is cosmetic only; GigaTech still buys power. It comes from:
- Every arena run:
  - Base: 60 for a win, 20 for a loss.
  - +12 per grade step, +8 per peak style rank, +5 per relay.
  - ×(1 + 0.15 × heat).
  - The **first win of each day pays double**.
- **DRIP tags** dropped by every elite, worth ◆10 × heat.
- **One merch crate per run**, hidden on high ground, worth ◆40 × heat.
- **The cone:** a traffic cone on the far north-east gantry. Finding it unlocks the Traffic Cone and pays ◆100.
- Feat bounties.
- **Collection milestones:** every 10 items pays ◆100 × n.

The **Daily Drop** puts three buyable items 35% off. The picks are seeded by the UTC date, so they are the same for everyone and change each day.

**Feats** track lifetime stats (`SAVE.wardrobe.stats`). They count:
- In the arena: kills by enemy and by weapon, headshots, air and boot kills, relays, bosses, flawless waves, storms, sponsors, dashes, jumps, distance, damage taken, deaths, heat won, grade, peak style, low-HP and clean wins.
- In the Haven: time spent, distance walked, time on the dance floor, people talked to.
- Overall: days played, GigaTech held and spent, DRIP earned, items owned.

Stats are bumped live, so unlocks pop mid-run as a HUD toast and are listed on the results screen. Saves from before this change are seeded from `SAVE.arena`, so veterans keep what they earned.

**Storage:**
- Once `Wardrobe` is attached, `AvatarKit.load/save/isOwned/grant` read and write `SAVE.wardrobe.look` and `SAVE.wardrobe.owned`.
- Any old localStorage loadout and unlocks are merged in once.
- The standalone creator still falls back to localStorage.

**Dev console:**
- `drip [n]` adds DRIP.
- `feat <id>` completes a feat.
- `loadout all` opens the creator in free mode.

## Still to do

- **Co-op:** send `AvatarKit.encode(loadout)` (a short base64 string) in the join/hello message. Remote players do `AvatarKit.create(AvatarKit.decode(code))` and drive `avatar.play(...)` from their movement state.
- **First person in matches:**
  - Create the local player's avatar.
  - Call `setFirstPerson(true)`.
  - Put it at the player's feet, facing their yaw.
  - Play the clip for the current state ('Idle Combat', 'Run', 'Crouch Walk'…).
  - Looking down then shows the player's own legs and shoes, Halo-style.
  - The gloved viewmodel hands in `gunfeel.js` can switch to the equipped hands item later: the pieces are the `hands_*@hand_L/R` and `@forearm_*` nodes.
- The catalog's `unlock` strings are the art team's flavor text. The game shows the Wardrobe's rule instead (`Wardrobe.FEATS`).

## API

```js
await AvatarKit.ready();                       // loads catalog + all 18 GLBs once (~3 MB), cached
const L = AvatarKit.load();                    // saved loadout, or the default Body A
const av = AvatarKit.create(L);                // { root, mixer, clips, loadout, head }
scene.add(av.root);  av.play('Idle');          // in your loop: av.update(dt)
av.apply(newLoadout);                          // re-dress in place (same body type; create a new one to swap bodies)
av.tint(L.colors);                             // colours only
av.setFirstPerson(true);                       // hide the head and everything on it; arms/legs/feet stay
av.eyeWorld(v3, lean);                         // world eye position; lean 0..1 moves it over the chest when looking down
av.dispose();

AvatarKit.defaultLoadout('m'|'f'); AvatarKit.randomLoadout(sex, { ownedOnly });
AvatarKit.encode(L) / AvatarKit.decode(code);  // decode returns null for junk and drops unknown ids
AvatarKit.save(L);
AvatarKit.isOwned(id) / AvatarKit.grant(id) / AvatarKit.lockedIn(L);
AvatarKit.catalog / AvatarKit.item(sex, id) / AvatarKit.itemsIn(sex, cat);

const saved = await AvatarCreator.open({ loadout, ownedOnly: true, title, onSave, onClose, persist: true });
// resolves to the saved loadout, or null when closed (✕ or Esc). Locked items can be tried on; SAVE stays disabled
// until every equipped item is owned.
```

A loadout is `{ sex: 'm'|'f', items: { face, hair, head, eyes, top, hands, legs, feet, back, neck }, colors: { prim, sec, acc, glow, hair, skin } }`.
Items are referenced by id, and colours by palette name.

## Dressing rules (from `catalog.rules`)

- **Wearing an item:** each `<item>@<bone>` node is cloned onto the body bone of that name.
- **`replaces`:**
  - A `b_*` entry hides that body segment.
  - A bare bone name hides that bone's pieces from items of lower-priority categories. That way gloves sit over sleeves and boots over trouser cuffs.
- **Hair under headgear:** headgear has a `hair` setting.
  - `all`: any hair shows.
  - `short`: only short hair shows; longer hair is tucked away.
  - `none`: no hair shows; the buzz scalp stays.
- **`blocks`:** an item that blocks a category hides it. The recon helmet hides face gear.
- **Tint:** image 2 of each kit is a slot mask. Each texel is multiplied by the palette tint for its slot (prim, sec, acc, glow, hair, skin). Gold, chrome and novelty prints are painted to ignore the tint.
