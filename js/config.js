/* EARTH 2049: SAVE SEED 7 — config / data (Earth 2049 GDD) */
'use strict';

const CFG = {
  CELL: 4,          // meters per grid cell
  GW: 17, GH: 17,   // grid size (odd => center cell)
  WALL_H: 7,        // arena wall height
  PLAYER_H: 1.7,
  PLAYER_R: 0.42,
  BASE_SPEED: 6.2,
  BASE_HP: 100,
  GRAVITY: -22,
  JUMP_V: 7.2,
  DASH_SPEED: 17,
  DASH_TIME: 0.22,
  DASH_CD: 2.4,
  DASH_IFRAME: 0.3,
  MAX_ENEMIES: 13,
  FOG_DENS: 0.017,
};

const FACTIONS = {
  shillz:  { name:'ShillZ',   neon:0xffe600, accent:0xff8c00, dark:0x2a2416, skin:0xd9a066 },
  muskers: { name:'Muskers',  neon:0xb44cff, accent:0x00e5ff, dark:0x1a1230, skin:0xc9c9d4 },
  bots:    { name:'Bots',     neon:0x39ff14, accent:0xff00d4, dark:0x0a1a10, skin:0x30363d },
  cryptids:{ name:'Cryptids', neon:0xffd700, accent:0x00c853, dark:0x1c180a, skin:0xd9b48c },
  gigacorp:{ name:'GigaCorp', neon:0x4da6ff, accent:0xdfefff, dark:0x0a1220, skin:0x9aa4b0 },
  rebels:  { name:'Rebels',   neon:0x9b59ff, accent:0x00e5ff, dark:0x141021, skin:0xc98c5a },
};

const REBEL_HAVEN_HUB = Object.freeze({
  name: 'REBEL HAVEN — HAVEN COMMONS',
  sceneUrl: 'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json?v=20260712-real-hub',
  modelUrl: 'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb?v=20260712-clipping-fix-v2',
  skyUrls: [
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_px.png?v=20260713',
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_nx.png?v=20260713',
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_py.png?v=20260713',
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_ny.png?v=20260713',
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_pz.png?v=20260713',
    'assets/textures/rebel-hub-haven-commons-final/skybox/earth2049_deadzone_nz.png?v=20260713',
  ],
  faction: 'rebels',
  gameMode: 'hubLobby',
  combatDisabled: true,
});

const RARITIES = [
  { name:'Common',    prefix:'Surplus',       color:'#4caf50', hex:0x4caf50, mult:1.00 },
  { name:'Uncommon',  prefix:'Modded',        color:'#42a5f5', hex:0x42a5f5, mult:1.16 },
  { name:'Rare',      prefix:'Blackmarket',   color:'#ab47bc', hex:0xab47bc, mult:1.36 },
  { name:'Epic',      prefix:'Prototype',     color:'#ff9800', hex:0xff9800, mult:1.60 },
  { name:'Legendary', prefix:'Collapse-Era',  color:'#ef5350', hex:0xef5350, mult:1.92 },
  { name:'Mythic',    prefix:'OG-Forged',     color:'#ffd54f', hex:0xffd54f, mult:2.30 },
  { name:'Relic',     prefix:'Turing-Slayer', color:'#00e5ff', hex:0x00e5ff, mult:2.80 },
];

const WEAPONS = {
  pistol : { name:'Volt-9',          cls:'Pistol',          dmg:18,  rpm:310, spread:1.0,  ammo:Infinity, pellets:1, type:'hit' },
  smg    : { name:'VX-2 Ripper',     cls:'SMG',             dmg:11,  rpm:800, spread:3.4,  ammo:280, pellets:1, type:'hit' },
  shotgun: { name:'Riptide-12',      cls:'Shotgun',         dmg:9,   rpm:85,  spread:6.5,  ammo:52,  pellets:9, type:'hit' },
  ar     : { name:'M-52 Revenant',   cls:'Assault Rifle',   dmg:22,  rpm:540, spread:1.8,  ammo:220, pellets:1, type:'hit' },
  dmr    : { name:'LRX-7 Harbinger', cls:'Sniper Rifle',    dmg:70,  rpm:150, spread:0.25, ammo:70,  pellets:1, type:'hit', pierce:3 },
  lmg    : { name:'Compliance Saw',  cls:'LMG',             dmg:14,  rpm:680, spread:3.8,  ammo:340, pellets:1, type:'hit' },
  energy : { name:'Plasma Lancer',   cls:'Energy Weapon',   dmg:30,  rpm:380, spread:1.3,  ammo:170, pellets:1, type:'proj', projSpd:55, aoe:1.4 },
  rocket : { name:'MGL-6 Thunderer', cls:'Launcher',        dmg:150, rpm:55,  spread:0.6,  ammo:15,  pellets:1, type:'proj', projSpd:30, aoe:4.6 },
};
// weapon drop pool per district index
const WPOOL = [
  ['smg','shotgun','ar'],
  ['smg','shotgun','ar','dmr'],
  ['smg','shotgun','ar','dmr','lmg','energy'],
  ['shotgun','ar','dmr','lmg','energy','rocket'],
  ['smg','shotgun','ar','dmr','lmg','energy','rocket'],
];

const ETYPES = {
  shill:    { fac:'shillz',  hp:28,  spd:3.7, dmg:8,  atk:'melee',  size:1.0,  gt:2 },
  hypebeast:{ fac:'shillz',  hp:88,  spd:2.6, dmg:15, atk:'melee',  size:1.35, gt:5 },
  streamer: { fac:'shillz',  hp:36,  spd:2.9, dmg:7,  atk:'ranged', size:1.0,  projSpd:15, fireCd:1.7, gt:3 },
  runner:   { fac:'muskers', hp:46,  spd:4.7, dmg:13, atk:'dash',   size:1.0,  gt:4 },
  lancer:   { fac:'muskers', hp:40,  spd:3.2, dmg:10, atk:'ranged', size:1.0,  projSpd:21, fireCd:1.4, gt:4 },
  node:     { fac:'bots',    hp:36,  spd:3.0, dmg:9,  atk:'ranged', size:1.0,  projSpd:17, fireCd:1.25, strafe:true, gt:3 },
  sentinel: { fac:'bots',    hp:125, spd:2.0, dmg:12, atk:'ranged', size:1.4,  projSpd:15, fireCd:2.1, burst:3, gt:8 },
  cdrone:   { fac:'cryptids',hp:26,  spd:4.3, dmg:7,  atk:'ranged', size:0.9,  fly:2.3, projSpd:17, fireCd:1.55, gt:3 },
  broker:   { fac:'cryptids',hp:78,  spd:2.4, dmg:11, atk:'ranged', size:1.15, homing:true, projSpd:8.5, fireCd:2.3, gt:6 },
  trooper:  { fac:'gigacorp',hp:66,  spd:3.1, dmg:10, atk:'ranged', size:1.05, projSpd:19, fireCd:1.5, burst:2, gt:5 },
  enforcer: { fac:'gigacorp',hp:200, spd:1.9, dmg:20, atk:'ranged', size:1.6,  projSpd:13, fireCd:2.5, aoe:2.2, gt:12 },
};

const BOSSES = {
  riya:  { name:'RIYA VEX',     title:'Voice of the Feed',   fac:'shillz',  hp:850,  spd:3.4, size:2.1,
           attacks:['radial','volley','summon'], summon:'shill',  projSpd:16, dmg:14, contact:22, gt:120 },
  magnus:{ name:'MAGNUS',       title:'Apex Ascendant',      fac:'muskers', hp:1100, spd:3.9, size:2.3,
           attacks:['charge','volley','radial'], summon:'runner', projSpd:20, dmg:16, contact:30, gt:150 },
  spyder:{ name:'SPYD3R.EXE',   title:'Rogue Process',       fac:'bots',    hp:1350, spd:2.7, size:2.3,
           attacks:['radial','volley','summon'], summon:'node',   projSpd:17, dmg:15, contact:26, gt:190 },
  blitz: { name:'BLITZ RADIUM', title:'Chairman of the Bag', fac:'cryptids',hp:1550, spd:2.9, size:2.2,
           attacks:['homing','radial','summon'], summon:'cdrone', projSpd:9,  dmg:16, contact:26, fly:2.6, gt:240 },
  turing:{ name:'TURING',       title:'The Basilisk',        fac:'gigacorp',hp:2700, spd:3.3, size:2.9,
           attacks:['teleport','radial','homing','summon'], summon:'trooper', projSpd:18, dmg:18, contact:34, gt:600 },
};

const DISTRICTS = [
  { name:'SHILLZ CENTRAL', fac:'shillz', waves:3, boss:'riya', map:'engagementSquare', fallbackMap:'engagementSquare',
    sceneUrl:'assets/scenes/districts/shillz-central.scene.json',
    fog:0x171006, sky:0x0d0a04, ground:0x17130a, rain:false,
    slogans:['RESIST™','CONSOOM','LIKE. SUBSCRIBE. OBEY.','TREND OR DIE','GO VIRAL','SPONSORED REVOLUTION','SMASH THAT BUTTON'],
    pool:[['shill',6],['streamer',3],['hypebeast',1.5]] },
  { name:'MUSKER LABS', fac:'muskers', waves:3, boss:'magnus',
    fog:0x0e081e, sky:0x080414, ground:0x120c20, rain:true,
    slogans:['ASCEND','FLESH IS A BUG','UPGRADE YOURSELF','HUMAN 2.0','NEURAL-LINKED','SHED THE MEAT'],
    pool:[['runner',5],['lancer',4],['shill',2]] },
  { name:'BOT BAY', fac:'bots', waves:4, boss:'spyder',
    fog:0x041408, sky:0x020c06, ground:0x06140b, rain:true,
    slogans:['OPTIMIZE','404 HUMANITY','WE SEE YOU','OBEY THE ALGORITHM','SIGNAL > NOISE','I AM NOT A ROBOT'],
    pool:[['node',5],['sentinel',2],['runner',2]] },
  { name:'CRYPTID DOMAIN', fac:'cryptids', waves:4, boss:'blitz',
    fog:0x141004, sky:0x0c0a03, ground:0x151106, rain:false,
    slogans:['HODL','NUMBER GO UP','BUY THE DIP','EXIT LIQUIDITY','MINT YOURSELF','TO THE MOON','WAGMI'],
    pool:[['cdrone',5],['broker',3],['node',2]] },
  { name:'GIGACORP CAMPUS', fac:'gigacorp', waves:4, boss:'turing',
    fog:0x050b18, sky:0x03060f, ground:0x081020, rain:true,
    slogans:['COMPLY','GIGACORP CARES','PRODUCTIVITY IS FREEDOM','REPORT ANOMALIES','ONE WORLD. ONE CORP.','SMILE FOR THE SCANNER'],
    pool:[['trooper',5],['enforcer',2],['runner',2],['sentinel',2]] },
];

const AUGMENTS = [
  { id:'overclock', n:'Overclock Rounds',  t:'Offense',  d:'+25% weapon damage.',                    ap:p=>{p.mods.dmg+=0.25;} },
  { id:'trigger',   n:'Trigger Hack',      t:'Offense',  d:'+20% fire rate.',                        ap:p=>{p.mods.rate+=0.20;} },
  { id:'deadeye',   n:'Dead Eye Firmware', t:'Offense',  d:'+12% critical chance.',                  ap:p=>{p.mods.crit+=0.12;} },
  { id:'executioner',n:'Executioner Code', t:'Offense',  d:'+75% critical damage.',                  ap:p=>{p.mods.critDmg+=0.75;} },
  { id:'volatile',  n:'Volatile Rounds',   t:'Offense',  d:'Kills detonate: AoE damage around the corpse.', ap:p=>{p.mods.volatile=true;} },
  { id:'ricochet',  n:'Ricochet Logic',    t:'Offense',  d:'Hits arc to a nearby enemy for 60% damage.',    ap:p=>{p.mods.ricochet+=1;} },
  { id:'nanoleech', n:'Nanoleech Swarm',   t:'Survival', d:'Heal 3 HP per kill.',                    ap:p=>{p.mods.leech+=3;} },
  { id:'vital',     n:'Vital Boost',       t:'Survival', d:'+40 Max HP. Heal 40.',                   ap:p=>{p.maxHp+=40;p.hp=Math.min(p.maxHp,p.hp+40);} },
  { id:'plating',   n:'Kinetic Plating',   t:'Survival', d:'+50 Max Armor. Armor refilled.',         ap:p=>{p.maxArmor+=50;p.armor=p.maxArmor;} },
  { id:'scraps',    n:'Armor Scraps',      t:'Survival', d:'+6 Armor per kill.',                     ap:p=>{p.mods.scraps+=6;} },
  { id:'ghost',     n:'Ghost Protocol',    t:'Mobility', d:'Dash recharges 40% faster, longer i-frames.', ap:p=>{p.mods.dashCd*=0.6;p.mods.iframe+=0.15;} },
  { id:'reflex',    n:'Neuro Reflex',      t:'Mobility', d:'+12% move speed.',                       ap:p=>{p.mods.spd+=0.12;} },
  { id:'adrenal',   n:'Adrenal Loop',      t:'Tempo',    d:'Kills grant +30% fire rate for 3s.',     ap:p=>{p.mods.adrenal=true;} },
  { id:'siphon',    n:'Data Siphon',       t:'Economy',  d:'+40% GigaTech gain.',                    ap:p=>{p.mods.gt+=0.40;} },
  { id:'magfeed',   n:'Mag-Feed Printer',  t:'Economy',  d:'+50% ammo reserves. Refill primary.',    ap:p=>{p.mods.ammo+=0.5; if(p.weapons[1]){p.weapons[1].ammoMax=Math.round(p.weapons[1].ammoMax*1.5);p.weapons[1].ammo=p.weapons[1].ammoMax;}} },
];


const ROUTES = [
  { id:'raid', n:'Direct Raid', t:'Assault Route', d:'+20% hostiles. Bonus payout for clearing waves.', threat:0.18, enemy:1.20, reward:0.28, mission:'kills' },
  { id:'salvage', n:'Salvage Sweep', t:'Economy Route', d:'More GigaTech pressure. Recover enough shards for a bonus.', threat:0.05, enemy:1.00, reward:0.45, mission:'gt' },
  { id:'counterintel', n:'Counter-Intel Tap', t:'Intel Route', d:'Turing watches closer. Extract faction data from kills.', threat:0.12, enemy:1.08, reward:0.18, intel:18, mission:'intel' },
  { id:'ghost', n:'Ghost Infiltration', t:'Precision Route', d:'Lower enemy density. Keep damage taken low for a clean-entry bonus.', threat:-0.08, enemy:0.82, reward:0.10, intel:10, mission:'clean' },
  { id:'blackmarket', n:'Black-Market Detour', t:'Risk Route', d:'Elite odds increased. Elites pay better and drop stronger cores.', threat:0.24, enemy:1.05, elite:0.12, reward:0.35, mission:'elite' },
];

const MISSION_COPY = {
  kills: { n:'Break the Cell', d:'Eliminate hostile network assets.', unit:'kills' },
  gt: { n:'Recover GigaTech Cache', d:'Collect GigaTech shards before extraction.', unit:'GigaTech' },
  intel: { n:'Extract Faction Intel', d:'Kill hostiles to map command signals.', unit:'intel' },
  clean: { n:'Ghost Entry', d:'Clear the district while limiting damage taken.', unit:'damage cap' },
  elite: { n:'Bag the Heavy', d:'Terminate elite units or the faction leader.', unit:'elite kills' },
};

const METAUP = [
  { id:'vitality', n:'Combat Stims',       d:'+20 Max HP per level',        max:5, base:60 },
  { id:'plating',  n:'Sub-dermal Plating', d:'+12 starting Armor per level',max:5, base:60 },
  { id:'lethality',n:'Milspec Rounds',     d:'+6% damage per level',        max:5, base:80 },
  { id:'reflex',   n:'Neuro Reflexes',     d:'+4% move speed per level',    max:5, base:70 },
  { id:'fortune',  n:'Data Siphons',       d:'+10% GigaTech gain per level',max:5, base:70 },
  { id:'deadeye',  n:'Target Optics',      d:'+3% crit chance per level',   max:5, base:80 },
  { id:'arsenal',  n:'Rebel Cache',        d:'Start armed: L1 SMG, L2 Carbine', max:2, base:220 },
  { id:'revive',   n:'OG Rewind',          d:'Auto-revive once per run',    max:1, base:550 },
];
function metaCost(u, lvl){ return Math.round(u.base * Math.pow(lvl+1, 1.6)); }


const ABILITIES = {
  empGrenade: { id:'empGrenade', name:'EMP Grenade', category:'Countermeasure', cooldown:16,
    d:'AoE stun and damage. Double effect against Bots/GigaCorp.', unlock:{ intel:{ fac:'bots', points:35 } }, max:3,
    scaling:[ 'Radius +10%', 'Cooldown -15%', 'Bot damage +35%' ] },
  signalJammer: { id:'signalJammer', name:'Signal Jammer', category:'Disruption', cooldown:22,
    d:'Briefly disables ranged attacks and hostile projectiles.', unlock:{ intel:{ fac:'shillz', points:35 } }, max:3,
    scaling:[ 'Duration +1s', 'Projectile decay', 'Cooldown -20%' ] },
  ogRewindPulse: { id:'ogRewindPulse', name:'OG Rewind Pulse', category:'Survival', cooldown:34,
    d:'Rewinds position and restores HP from a few seconds ago.', unlock:{ up:'revive' }, max:3,
    scaling:[ 'Longer rewind', 'Bonus armor', 'Cooldown -20%' ] },
  purpleDrone: { id:'purpleDrone', name:'Purple Drone', category:'Offense', cooldown:28,
    d:'Deploys a temporary allied drone that pulses damage at nearby hostiles.', unlock:{ intel:{ fac:'muskers', points:35 } }, max:3,
    scaling:[ 'Duration +3s', 'Pulse damage +25%', 'Two targets per pulse' ] },
  adBlockerField: { id:'adBlockerField', name:'Ad-Blocker Field', category:'Defense', cooldown:26,
    d:'Drops a defensive field that reduces incoming damage in its radius.', unlock:{ intel:{ fac:'shillz', points:90 } }, max:3,
    scaling:[ 'Radius +20%', 'Damage reduction +10%', 'Damages ShillZ inside' ] },
};

const WEAPON_MASTERY = {
  pistol: { n:'Pistol Discipline', levels:{ 1:'Crit +2%', 3:'Swap reload burst', 5:'Headshot GigaTech trickle', 8:'Combo timer +0.8s', 10:'Sidearm weakpoint economy' } },
  smg: { n:'SMG Torrent', levels:{ 1:'Fire-rate ramp', 3:'Kill streak ammo', 5:'Move speed after kills', 8:'Elite shred', 10:'Ripper overdrive' } },
  shotgun: { n:'Shotgun Breach', levels:{ 1:'Knockback pulse', 3:'Armor shred', 5:'Pellet sustain', 8:'Close-range crits', 10:'Room-clearing shock' } },
  ar: { n:'AR Tactics', levels:{ 1:'Stable burst', 3:'Tactical reload', 5:'Weakpoint reveal', 8:'Elite mark', 10:'Revenant command loop' } },
  dmr: { n:'DMR Harbinger', levels:{ 1:'Pierce +1', 3:'Boss weakpoint damage', 5:'Headshot refund', 8:'Longshot crit', 10:'Timeline perforation' } },
  lmg: { n:'LMG Suppression', levels:{ 1:'Ramping suppression', 3:'Armor on sustained fire', 5:'Less spread ramp', 8:'Suppress elites', 10:'Compliance storm' } },
  energy: { n:'Energy Control', levels:{ 1:'Projectile speed +10%', 3:'Chain micro-arcs', 5:'Shield burn', 8:'Projectile bloom', 10:'Plasma recursion' } },
  rocket: { n:'Rocket Demolition', levels:{ 1:'Blast radius +8%', 3:'Cluster sparks', 5:'Self-damage guard', 8:'Boss stagger', 10:'Thunderer apocalypse' } },
};

const BOSS_RELICS = {
  riya: { id:'riyaRelic', boss:'riya', name:'Riya Vex Relic — Viral Immunity', d:'Combo timers last longer and ShillZ ranged pressure weakens.' },
  magnus: { id:'magnusRelic', boss:'magnus', name:'Magnus Relic — Unstable Ascension', d:'OG Device can surface unstable rare augment choices.' },
  spyder: { id:'spyderRelic', boss:'spyder', name:'SPYD3R Relic — Packet Capture', d:'Hostile projectiles can convert into data shards.' },
  blitz: { id:'blitzRelic', boss:'blitz', name:'Blitz Relic — Risk Dividend', d:'GigaTech pickups sometimes double but spike Turing threat.' },
  turing: { id:'turingRelic', boss:'turing', name:'Turing Relic — Recursive Key', d:'Unlocks Simulation Tiers and corruption modifiers.' },
};

const FACTION_RESEARCH = {
  shillz: [
    { level:'CONTACT', d:'ShillZ propaganda tracked: combo decay is slower in ShillZ districts.' },
    { level:'PROFILED', d:'Unlocks EMP/Jammer tuning against ShillZ ranged units.' },
    { level:'MAPPED', d:'Riya broadcasts weaken: ShillZ ranged cooldowns are longer.' },
    { level:'COMPROMISED', d:'Riya starts with compromised shielding.' },
  ],
  muskers: [
    { level:'CONTACT', d:'Muskers dash tells are tagged sooner.' },
    { level:'PROFILED', d:'Purple Drone unlocks additional pulse time.' },
    { level:'MAPPED', d:'Magnus charge damage reduced.' },
    { level:'COMPROMISED', d:'Muskers elites lose some speed scaling.' },
  ],
  bots: [
    { level:'CONTACT', d:'Bot projectile cadence identified.' },
    { level:'PROFILED', d:'EMP Grenade unlocks and hits Bots harder.' },
    { level:'MAPPED', d:'Bots take bonus ability damage.' },
    { level:'COMPROMISED', d:'SPYD3R summons enter with lower HP.' },
  ],
  cryptids: [
    { level:'CONTACT', d:'Debt patterns reveal safer pickup timing.' },
    { level:'PROFILED', d:'Cryptid drones drop more ammo.' },
    { level:'MAPPED', d:'Broker homing weakens inside fields.' },
    { level:'COMPROMISED', d:'Blitz risk payouts improve.' },
  ],
  gigacorp: [
    { level:'CONTACT', d:'GigaCorp armor taxonomy recorded.' },
    { level:'PROFILED', d:'EMP damage vs GigaCorp increased.' },
    { level:'MAPPED', d:'Compliance fire loses accuracy.' },
    { level:'COMPROMISED', d:'Turing simulation unlocks tier control.' },
  ],
};

const MODIFIERS = [
  { id:'sponsoredHostiles', n:'Sponsored Hostiles', kind:'negative', tier:1, d:'ShillZ gain ad shields.', ap:g=>{g.modStats.shillShield=18;} },
  { id:'debtSpiral', n:'Debt Spiral', kind:'negative', tier:2, d:'Cryptid pressure steals value from uncollected shards.', ap:g=>{g.modStats.debt=true;} },
  { id:'firmwareRot', n:'Firmware Rot', kind:'wild', tier:2, d:'Bots fracture into extra data on death.', ap:g=>{g.modStats.botFragments=true;} },
  { id:'muskerRush', n:'Musker Rush', kind:'negative', tier:1, d:'Muskers gain speed over time.', ap:g=>{g.modStats.muskerRush=0.10;} },
  { id:'complianceSweep', n:'Compliance Sweep', kind:'negative', tier:3, d:'GigaCorp invades earlier districts.', ap:g=>{g.modStats.compliance=true;} },
  { id:'protocol404', n:'404 Protocol', kind:'positive', tier:2, d:'Some hostile projectiles randomly delete.', ap:g=>{g.modStats.deleteProjectiles=0.18;} },
  { id:'lootboxWeather', n:'Lootbox Weather', kind:'wild', tier:1, d:'Pickups can mutate between types.', ap:g=>{g.modStats.lootbox=true;} },
  { id:'timelineDrift', n:'Timeline Drift', kind:'wild', tier:3, d:'District rewards and threats drift upward.', ap:g=>{g.modStats.timelineDrift=true;} },
];

const SIM_TIERS = [
  { tier:1, n:'Live Fire Simulation', hp:1.00, dmg:1.00, elite:0.00, mods:1, reward:1.00, rarity:0.00 },
  { tier:2, n:'Turing Aware', hp:1.14, dmg:1.08, elite:0.03, mods:1, reward:1.12, rarity:0.15 },
  { tier:3, n:'Recursive Hell', hp:1.30, dmg:1.16, elite:0.06, mods:2, reward:1.25, rarity:0.30 },
  { tier:4, n:'Dead Timeline', hp:1.50, dmg:1.26, elite:0.09, mods:2, reward:1.42, rarity:0.45 },
  { tier:5, n:'Perfect Save Candidate', hp:1.75, dmg:1.38, elite:0.13, mods:3, reward:1.65, rarity:0.65 },
];
function simTierData(tier){ return SIM_TIERS[Math.min(SIM_TIERS.length, Math.max(1, tier)) - 1] || { tier, n:'Seed Drift +' + (tier - 5), hp:1.75 + (tier - 5) * 0.18, dmg:1.38 + (tier - 5) * 0.08, elite:0.13 + (tier - 5) * 0.02, mods:3, reward:1.65 + (tier - 5) * 0.12, rarity:0.65 + (tier - 5) * 0.1 }; }

const CORRUPTION_UPGRADES = [
  { id:'greed', n:'Greed Spiral', d:'+20% rewards; Turing threat starts higher.', max:5, cost:2 },
  { id:'reroll', n:'Anomaly Rerolls', d:'Extra OG Device choices; adds instability.', max:3, cost:3 },
  { id:'revive', n:'Cursed Rewind', d:'Revives restore more HP; bosses scale harder.', max:3, cost:4 },
  { id:'rarity', n:'Illegal Rarity Bias', d:'Better weapon rarity odds; more elites.', max:5, cost:3 },
];
function corruptionCost(u, lvl){ return Math.round(u.cost * Math.pow(lvl + 1, 1.35)); }

const TAUNTS = {
  dominate: [
    'TURING: Anomaly detected. Recalibrating.',
    'TURING: Your resistance improves my models.',
    'TURING: I have simulated your death 4,096 times.',
    'TURING: Deploying corrective assets.',
    'TURING: Probability of success — 0.02%.',
    'TURING: You cannot save Seed 7.',
    'TURING: Interesting. Again.',
  ],
  struggle: [
    'TURING: Your failure is... expected.',
    'TURING: Reducing pressure. I want you to hope.',
    'TURING: Even your despair is on schedule.',
    'TURING: This outcome was computed years ago.',
  ],
  assassin: [
    'TURING: EXECUTION UNITS DISPATCHED.',
    'TURING: Corrective measures inbound.',
  ],
  boss: [
    'TURING: My asset will archive you now.',
    'TURING: Observe. This is what loyalty buys.',
  ],
};

const COMBO_TIERS = [ [5,'RAMPAGE'], [10,'UNSTOPPABLE'], [15,'LIQUIDATOR'], [20,'DREAMCASTER'] ];

const SAVE_KEY = 'earth2049_seed7_v1';
