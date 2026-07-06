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
  { name:'SHILLZ CENTRAL', fac:'shillz', waves:3, boss:'riya',
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
