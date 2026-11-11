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

Dev console: `loadout` opens the creator with only owned items saveable. `loadout all` opens it in free mode.

## Still to do (in-game logic, not done here)

- **Customization vendor in the hub:** an NPC or terminal that calls `AvatarCreator.open({ title: 'VENDOR NAME' })`. Pause input while it's open. It exits pointer lock on open.
- **Unlocks:** call `AvatarKit.grant(itemId)` when an `item.unlock` condition is met (boss kills, levels, Shillz purchases…). Items marked `Default` are always owned.
  - The owned list currently lives in localStorage (`e2049.avatar.owned.v1`). The saved loadout is in `e2049.avatar.v1`.
  - Move both into the versioned save (`SAVE_SCHEMA.md`) when you wire this up.
- **Prices and shop UI** for items, if the vendor sells them.
- **Co-op:** send `AvatarKit.encode(loadout)` (a short base64 string) in the join/hello message. Remote players do `AvatarKit.create(AvatarKit.decode(code))` and drive `avatar.play(...)` from their movement state.
- **First person in matches:**
  - Create the local player's avatar.
  - Call `setFirstPerson(true)`.
  - Put it at the player's feet, facing their yaw.
  - Play the clip for the current state ('Idle Combat', 'Run', 'Crouch Walk'…).
  - Looking down then shows the player's own legs and shoes, Halo-style.
  - The gloved viewmodel hands in `gunfeel.js` can switch to the equipped hands item later: the pieces are the `hands_*@hand_L/R` and `@forearm_*` nodes.

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
