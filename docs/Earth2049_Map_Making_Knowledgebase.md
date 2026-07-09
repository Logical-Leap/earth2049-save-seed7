# Earth 2049 Map-Making Knowledgebase

This is the current working map-making bible for **Earth 2049: Save Seed7** Three.js FPS roguelike map production.

---

## 1. Core Map Philosophy

The maps are **not open-world spaces**. They are **contained FPS arenas**.

Each map should feel like a slice of a larger dystopian city, but the playable area must be physically bounded. The city can appear infinite beyond walls, screens, towers, barricades, shutters, glass, alleys, vault doors, and propaganda facades, but the player should only move through an authored combat space.

The correct structure is:

```text
contained arena
→ controlled entry
→ readable combat lanes
→ side route / flank
→ vertical route
→ objective zone
→ enemy waves
→ locked extraction gate
→ next contained arena
```

This keeps the game compatible with a browser-based Three.js FPS roguelike instead of drifting into an unmanageable open-city sim.

---

## 2. Current Scene File Format

We are now using the refactored **Three.js Editor Object JSON** format.

The base shape is:

```json
{
  "metadata": {},
  "geometries": [],
  "materials": [],
  "object": {
    "uuid": "...",
    "type": "Scene",
    "name": "...",
    "userData": {},
    "children": []
  }
}
```

The agent-refactored ShillZ sample established this structure with reusable `geometries`, reusable `materials`, and `object.children` containing scene meshes, gameplay markers, blockers, pickups, enemy spawns, colliders, and lights.

### Required Top-Level Sections

| Section | Purpose |
|---|---|
| `metadata` | Three.js Editor compatibility |
| `geometries` | Reusable primitive shapes, usually unit box and marker box |
| `materials` | Shared materials for faction palette, markers, floors, props, signs |
| `object` | The actual scene |
| `object.children` | Every mesh, marker, blocker, prop, light, route, spawn, and objective |

---

## 3. Primitive Blockout Standard

For now, maps are made from **BoxGeometry primitives**, not final GLB art assets.

That is intentional.

The current maps are **playable blockout scenes** with faction identity, collision logic, markers, and layout intent. Later, props can be replaced by actual `.glb` models while preserving the same object names and `userData`.

Use:

```json
{
  "uuid": "e2049-cover-example",
  "type": "Mesh",
  "name": "E2049_COVER_EXAMPLE",
  "geometry": "geo-unit",
  "material": "mat-metal",
  "position": [0, 0.8, 0],
  "scale": [4, 1.6, 2],
  "userData": {
    "gameplayType": "cover",
    "collider": true,
    "climb": true
  }
}
```

---

## 4. Coordinate Rules

This is the most important technical lesson so far.

In the Three.js Editor scene JSON:

```json
"position": [x, centerY, z],
"scale": [width, height, depth]
```

`position.y` is the **center** of the mesh, not the bottom.

So a grounded box must use:

```text
position.y = height / 2
```

Example:

```json
"position": [0, 0.8, 0],
"scale": [4, 1.6, 2]
```

That box sits on the ground because its height is `1.6`, and its center is at `0.8`.

---

## 5. Floor Convention

For a floor slab:

```json
"position": [0, -0.04, 0],
"scale": [78, 0.08, 64]
```

That makes the top of the floor land at `y = 0`.

Use this for arena floors:

```text
floor center y = -0.04
floor height = 0.08
```

---

## 6. Second-Level Walkway Rule

This was the major correction.

Second-level walkways must **not** be placed at ground-level center Y.

Wrong:

```json
"position": [x, 0.35, z],
"scale": [width, 0.7, depth]
```

That puts the walkway on the floor.

Correct:

```json
"position": [x, 8.35, z],
"scale": [width, 0.7, depth]
```

This means:

```text
walkway floor height ≈ 8.0
walkway thickness = 0.7
centerY = 8.0 + 0.35 = 8.35
```

For higher cross-bridges:

```text
bridge floor height ≈ 9.4
bridge thickness = 0.7
centerY = 9.75
```

For rails on elevated walkways:

```text
rail centerY should be above the deck, usually around 9.25 or 10.45 depending on deck height
```

### Important Distinction

Ground route overlays stay near ground level:

```json
"position": [x, 0.03, z],
"scale": [width, 0.03, depth]
```

These are **debug/pathing guide overlays**, not real geometry. Names like `E2049_ROUTE_UPPER_BALCONY_PROJECTION` may sit on the floor intentionally if they are route indicators. But actual meshes named `E2049_TRAVERSAL_UPPER_*` must be elevated.

---

## 7. Required Object Naming Convention

All gameplay-relevant objects should use the `E2049_` prefix.

### Core Prefixes

| Prefix | Meaning |
|---|---|
| `E2049_PROP_` | Visible set dressing or physical prop |
| `E2049_BLOCKER_` | Hard arena boundary |
| `E2049_SOFTLOCK_` | Low/visible barrier preventing escape or cheese |
| `E2049_COVER_` | Combat cover |
| `E2049_ROUTE_` | Floor overlay / route guide |
| `E2049_TRAVERSAL_` | Actual playable traversal geometry |
| `E2049_RAIL_` | Railings for elevated routes |
| `E2049_SIGN_` | Billboard, propaganda, ticker, or text surface |
| `E2049_LIGHT_` | Light source |
| `E2049_PLAYER_START` | Player spawn |
| `E2049_ENEMY_SPAWN_` | Enemy spawn marker |
| `E2049_PICKUP_SPAWN_` | Loot/pickup spawn marker |
| `E2049_OBJECTIVE_` | Main objective marker |
| `E2049_BOSS_ARENA_` | Boss/major encounter zone |
| `E2049_EXTRACTION_GATE_` | Exit to next arena |
| `E2049_DRONE_ROUTE_WAYPOINT_` | Drone path point |

---

## 8. Required `userData.gameplayType` Values

Every important object should have `userData.gameplayType`.

Use these consistently:

| `gameplayType` | Use |
|---|---|
| `floor` | Main arena floor |
| `arenaWall` | Hard containment wall |
| `softLock` | Secondary blocking barrier |
| `cover` | Player/enemy cover |
| `routeHint` | Floor overlay showing intended lane |
| `combatZone` | Primary fight space |
| `hazardZone` | Dangerous zone indicator |
| `hazard` | Actual hazard object |
| `traversal` | Walkable elevated/alternate route |
| `railing` | Elevated route railing |
| `setpiece` | Main visual/action centerpiece |
| `billboard` | Signage/screen/environmental text |
| `playerStart` | Player start marker |
| `enemySpawn` | Enemy spawn marker |
| `pickupSpawn` | Pickup/loot marker |
| `objective` | Objective marker |
| `objectiveProp` | Visible objective model |
| `bossArena` | Boss or major fight arena marker |
| `extractionGate` | Level transition marker |
| `extractionGateVisual` | Physical gate object |
| `entryGate` | Entry gate object |
| `dronePatrolWaypoint` | Drone path marker |
| `droneSpawn` | Drone prop/spawn point |
| `elevatedPosition` | Sniper/perch/trader balcony position |

---

## 9. Every Arena Needs a Gameplay Skeleton

A proper map should never just be a floor with a few props.

Each arena needs:

```text
1 player start
1 main arena floor
4+ hard containment walls
1 primary combat zone
1 objective
1 boss/major encounter zone
1 extraction gate
2–4 route options
8–20 cover pieces
5–10 enemy spawn markers
4–8 pickup spawn markers
1–2 faction-specific setpieces
several lights
environmental storytelling signage
```

---

## 10. Route Design Standard

Each arena should have at least three forms of movement.

### Main Lane

The obvious path from entry to objective. Usually the most dangerous and most readable.

Example roles:

```text
main plaza
main boulevard
sponsored lane
vault approach
exchange floor
```

### Side Route

A safer or more tactical flank route.

Examples:

```text
rebel graffiti alley
maintenance duct
Gigaverse side channel
service corridor
subway access
```

### Vertical Route

A second-level option.

Examples:

```text
upper ad catwalk
upper trading balcony
maintenance bridge
sniper perch
cross bridge
```

The vertical route must be actual elevated geometry, not a floor overlay.

---

## 11. Containment Design Standard

The player should never be able to walk into empty space or out into an unfinished city.

Use:

```text
arena walls
shutter walls
sealed storefronts
vault doors
ad tower stacks
service walls
railing
soft locks
corner stacks
glass walls
blocked alleys
```

Hard containment objects should include:

```json
"userData": {
  "gameplayType": "arenaWall",
  "collider": true,
  "blocksPlayer": true
}
```

---

## 12. Cover Design Standard

Cover should support FPS combat readability.

| Cover Type | Approx Height |
|---|---:|
| Low cover / crate | `1.2–1.6` |
| Counter / trading desk | `1.4–1.8` |
| Barricade | `2.0–2.8` |
| Full wall/blocker | `8–18` |
| Elevated deck | floorY around `8.0` |
| Railing | above deck, usually `1.2–1.5` tall |

Good cover has:

```json
"userData": {
  "gameplayType": "cover",
  "collider": true,
  "climb": true
}
```

Use cover to break sightlines, not just decorate the map.

---

## 13. Enemy Spawn Design

Enemy spawns need semantic grouping.

Examples:

```json
"userData": {
  "gameplayType": "enemySpawn",
  "faction": "shillz",
  "spawnGroup": "frontWave"
}
```

Spawn groups should describe encounter behavior:

```text
frontWave
centerWave
bazaarWave
checkoutWave
vaultApproachWave
upperBalcony
bruteWave
eliteWave
bossWave
```

Avoid spawning enemies directly behind the player unless it is an intentional ambush.

---

## 14. Pickup Design

Pickup markers should include a loot table.

Example:

```json
"userData": {
  "gameplayType": "pickupSpawn",
  "lootTable": "shillzCentralCommon"
}
```

Use pickups to reward exploration:

```text
behind kiosks
inside side route
near risky hazard zone
on upper route
after objective zone
near extraction
```

---

## 15. Objective Design

Each arena needs one clear gameplay objective.

Examples:

```text
Stage Control Node
Fake Resistance Bazaar Node
Drone Checkpoint Scanner
Liquidity Terminal
Vault Lock
Gigaverse Relay
```

The objective should have both:

```text
1 marker
1 visible prop
```

Example:

```json
{
  "name": "E2049_OBJECTIVE_MARKET_LIQUIDITY_TERMINAL",
  "userData": {
    "gameplayType": "objective",
    "objectiveType": "liquidityTerminal"
  }
}
```

---

## 16. Extraction Gate Standard

Every arena should have a clear exit to the next arena.

Use both:

```text
E2049_EXTRACTION_GATE_TO_NEXT_AREA
E2049_PROP_EXTRACTION_GATE_LOCKED_VISUAL
```

Recommended userData:

```json
"userData": {
  "gameplayType": "extractionGate",
  "targetArea": "next-map-name",
  "lockedUntilObjectiveComplete": true
}
```

This supports roguelike room sequencing.

---

## 17. Lighting Standard

Each map should have faction-colored lighting plus practical fill lights.

Use named point lights:

```text
E2049_LIGHT_KEY_*
E2049_LIGHT_OBJECTIVE_*
E2049_LIGHT_SIDE_ROUTE_*
E2049_LIGHT_ENTRY_*
E2049_LIGHT_EXTRACTION_*
```

Do not rely on one generic light. Lighting is part of faction identity.

---

## 18. Faction Map Identity

Maps must communicate faction identity through architecture, layout, materials, signs, hazards, and objectives.

### ShillZ Maps

Lore basis: ShillZ are brainwashed common people tricked into serving GigaCorp, often dangerous because they are numerous, self-righteous, and operate like a propaganda-driven horde.

Use:

```text
yellow / orange / black
high-vis hazard color
propaganda screens
fake resistance slogans
merch kiosks
rally stages
sponsor drones
checkout traps
ad towers
shuttered storefronts
crowd-control barricades
rebel graffiti side routes
```

Good ShillZ map themes:

```text
Engagement Square
Merch Alley
Drone Checkpoint
Ad-Billboard Canyon
Ration Row
Food Court
Fake Resistance Bazaar
Sponsored Riot Plaza
```

ShillZ spaces should feel cheap, loud, commercialized, and morally stupid.

### Cryptids Maps

Lore basis: Cryptids are the banking/finance faction. They control wealth, operate through finance and business, wear VR glasses, move between the Overworld and Gigaverse, and make shady virtual trades through crypto schemes and the BLOCKEDChain.

Use:

```text
black marble
gold metal
emerald crypto glow
ticker towers
private banking booths
trading desks
vault doors
liquidity terminals
Gigaverse portals
AR side channels
luxury lounges
financial hazard zones
```

Good Cryptids map themes:

```text
Liquidity Exchange Atrium
Crypto Vault
Private Banking Lounge
BLOCKEDChain Server Floor
Gigaverse Auction Hall
Margin Call Pit
Rugpull Data Center
Executive Yacht Terminal
```

Cryptids spaces should feel rich, predatory, artificial, and financialized.

### Muskers Maps

Lore basis: Muskers are cybernetic augmentation/transhuman tech obsessives. They blur human and machine through cybernetic enhancements.

Use:

```text
surgical labs
implant clinics
neon blue / purple / gunmetal
biohazard glass
operating platforms
augmentation chairs
server-spine columns
neural cables
test chambers
malfunctioning enhancement rigs
```

Good Musker map themes:

```text
Augmentation Clinic
Neural Overclock Lab
Servo Chapel
Implant Recovery Ward
Cybernetic Trial Chamber
Magnus Blacksite
```

### Bots Maps

Use:

```text
industrial metal
server racks
broken domestic appliances
ad-tech terminals
glitched billboards
service ducts
drone nests
malfunctioning assistant stations
old call-center hardware
CAPTCHA walls
```

Good Bot map themes:

```text
Bot Bay
Ad Script Recycling Plant
CAPTCHA Foundry
Service Droid Graveyard
Spam Server Farm
SPYD3R Relay Node
```

### GigaCorp Maps

Use:

```text
blue / black / white
clean corporate authoritarian architecture
security gates
compliance scanners
AI surveillance nodes
sterile towers
executive atriums
mech deployment bays
Turing interfaces
```

Good GigaCorp map themes:

```text
Compliance Lobby
Executive Security Floor
GigaCorp Campus
Turing Simulation Core
Mech Deployment Atrium
Shareholder Sanctum
```

---

## 19. Current Map Sequence

So far, the ShillZ district sequence is:

```text
Engagement Square
→ Merch Alley
→ Drone Checkpoint
→ Ad-Billboard Canyon
→ Ration Row / Food Court / Fake Resistance Bazaar
```

Created in the new JSON format so far:

```text
ShillZ Central - Engagement Square
ShillZ Central - Merch Alley
Cryptids Domain - Liquidity Exchange Atrium
```

Older blockout concepts also existed for:

```text
ShillZ Drone Checkpoint
ShillZ Ad-Billboard Canyon
```

Those should be converted to the new `.scene.json` format when needed.

---

## 20. Map Output Standard

Every generated map should output:

```text
/map-name.scene.json
/map-name.scene.zip
optional /map-name.scene.README.md
```

The `.zip` should include the JSON and README.

The README should document:

```text
area name
previous map
next map
major gameplay features
verticality note
gameplayType conventions
known targetArea / sourceArea
```

---

## 21. Scene Object Count Target

A useful map should have roughly:

```text
90–160 scene children
```

Too low means the map will feel empty. Too high means it becomes harder to debug before we have final modular art assets.

Current good targets:

```text
Engagement Square: ~96 objects
Merch Alley: ~147 objects
Cryptids Liquidity Exchange: ~147 objects
```

---

## 22. Environmental Storytelling Rule

Do not make generic FPS boxes.

Every faction map needs evidence of the world:

```text
propaganda
commerce
surveillance
fake rebellion
financial scams
Gigaverse bleedthrough
GigaCorp control
rebel counter-markings
class hierarchy
brainwashing
algorithmic manipulation
```

Signage should not just say “AREA 1.” It should reveal ideology.

Examples:

```text
SHILLZ LIVE / OBEY REPEAT
BUY THE CAUSE
THE MERCH IS A LIE
PRIVATE MARKET / MEMBERS ONLY
CONFIDENCE IS CURRENCY
VAULT ACCESS / LIQUIDITY REQUIRED
```

---

## 23. Combat Readability Rule

Maps should look cool, but gameplay clarity comes first.

A player should immediately understand:

```text
where they entered
where enemies are likely to come from
where the objective is
where cover is
where the dangerous zone is
where the side route is
where the high ground is
where extraction is
```

Use route overlays during blockout to make this explicit.

---

## 24. Do-Not-Repeat Mistakes

Do **not**:

```text
leave the map mostly blank
make second-level walkways sit on the ground
make route overlays look like actual physical platforms
forget extraction gates
forget player starts
forget enemy spawns
forget pickups
forget full containment
make a generic sci-fi room without faction identity
make open-world streets with no sealed boundaries
make all cover the same size
make every route symmetrical
hide gameplay logic only in names without userData
```

---

## 25. The Reusable Map Template

Every new map should start from this conceptual template:

```json
{
  "metadata": {
    "version": 4.5,
    "type": "Object",
    "generator": "E2049 Three.js Editor scene - [Map Name]"
  },
  "geometries": [
    {
      "uuid": "geo-unit",
      "type": "BoxGeometry",
      "width": 1,
      "height": 1,
      "depth": 1
    },
    {
      "uuid": "geo-marker",
      "type": "BoxGeometry",
      "width": 1,
      "height": 1,
      "depth": 1
    }
  ],
  "materials": [],
  "object": {
    "uuid": "scene-[map-name]",
    "type": "Scene",
    "name": "[FACTION] - [AREA NAME]",
    "userData": {
      "district": "[district-name]",
      "area": "[area-name]",
      "format": "threejs-editor-object-json",
      "faction": "[faction]",
      "sourceArea": "[previous-area]",
      "targetArea": "[next-area]",
      "containmentRule": "all sides physically sealed; only authored gates connect rooms",
      "coordinateNote": "position.y is object center; scale.y is height"
    },
    "children": []
  }
}
```

---

## 26. Bottom-Line Standard

A valid Earth 2049 map is:

```text
a sealed, faction-specific FPS arena
built in Three.js Editor Object JSON
using reusable primitive geometries/materials
with explicit gameplay markers in userData
with readable combat lanes, cover, objectives, spawns, pickups, verticality, and extraction
with environmental storytelling baked into the architecture
```

That is the standard to hold every new map to moving forward.
