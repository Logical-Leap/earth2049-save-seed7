/* EARTH 2049: SAVE SEED 7 — GIGALEAGUE (PvP) content tables. Shared by the match server (workers/pvp-match.js), the
 * browser's offline bot matches (js/pvp/pvp-sim.js) and the client (js/arena/arena-pvp.js, js/pvp/pvp-menu.js).
 *
 * Design: docs/PVP.md and the project doc claude/multiplayer.md. Rules that matter everywhere:
 *   - Core playlist (CoD-style): equal stats. Rarity is a camo only. Attachments are sidegrades.
 *   - Classic Arena (Halo-style): equal starts, power weapons on the map, and there map rarity DOES change stats.
 *   - Names in quotes in the design doc are placeholders; the author writes the final jokes. Change them here.
 * Units: metres, seconds, degrees. Plain data, no DOM, no THREE.
 */
(function (root) {
  'use strict';
  const PVP = {};
  PVP.VERSION = 'pvp1';

  /* ==================================================================== playlists and modes */
  PVP.PLAYLISTS = {
    core: { id: 'core', name: 'CORE', sub: 'CREATE-A-CLASS // FAST TIME-TO-KILL', health: 'core', modes: ['tdm', 'dom', 'ffa', 'harvest', 'hardpoint', 'snd'] },
    classic: { id: 'classic', name: 'CLASSIC ARENA', sub: 'EQUAL STARTS // POWER WEAPONS ON THE MAP', health: 'classic', modes: ['slayer', 'ctf', 'hottake'] },
    party: { id: 'party', name: 'PARTY', sub: 'SILLY RULES // STILL COUNTS', health: 'core', modes: ['infection', 'influencer', 'gungame'] },
  };
  // teams: 2 = two teams, 0 = everyone for themselves. size = humans + bots per team (or total for FFA).
  PVP.MODES = {
    tdm: { id: 'tdm', name: 'TEAM DEATHMATCH', short: 'TDM', playlist: 'core', teams: 2, size: 6, limit: 75, time: 600, respawn: 3, streakMax: 99999,
      how: 'FIRST TEAM TO 75 KILLS.' },
    dom: { id: 'dom', name: 'DOMINATION', short: 'DOM', playlist: 'core', teams: 2, size: 6, limit: 200, time: 600, respawn: 3, halftime: 300, streakMax: 99999,
      how: 'HOLD FLAGS A, B AND C. EACH FLAG SCORES 1 POINT EVERY 5 SECONDS. FIRST TO 200.' },
    ffa: { id: 'ffa', name: 'FREE-FOR-ALL', short: 'FFA', playlist: 'core', teams: 0, size: 8, limit: 30, time: 600, respawn: 2.5, streakMax: 1100,
      how: 'EVERYONE FOR THEMSELVES. FIRST TO 30 KILLS.' },
    harvest: { id: 'harvest', name: '"DATA HARVEST"', short: 'HARVEST', playlist: 'core', teams: 2, size: 6, limit: 65, time: 600, respawn: 3, streakMax: 99999,
      how: 'KILLS DROP DATA DRIVES. GRAB ENEMY DRIVES TO SCORE, GRAB YOUR TEAM\'S TO DENY. FIRST TO 65.' },
    hardpoint: { id: 'hardpoint', name: 'HARDPOINT', short: 'HP', playlist: 'core', teams: 2, size: 6, limit: 250, time: 600, respawn: 3, hillTime: 60, streakMax: 99999,
      how: 'HOLD THE HILL. 1 POINT A SECOND. IT MOVES EVERY 60 SECONDS. FIRST TO 250.' },
    snd: { id: 'snd', name: '"HOSTILE TAKEOVER"', short: 'TAKEOVER', playlist: 'core', teams: 2, size: 5, limit: 6, time: 0, roundTime: 100, respawn: 0, rounds: true,
      plantTime: 5, defuseTime: 6, fuse: 40, streakMax: 0, noChat: true,
      how: 'ONE LIFE PER ROUND. ATTACKERS PLANT A CHARGE ON A SERVER RACK. DEFENDERS STOP THEM. FIRST TO 6 ROUNDS.' },
    slayer: { id: 'slayer', name: 'SLAYER', short: 'SLAYER', playlist: 'classic', teams: 2, size: 4, limit: 50, time: 720, respawn: 5, streakMax: 0,
      how: 'FIRST TEAM TO 50 KILLS. POWER WEAPONS SPAWN ON THE MAP.' },
    ctf: { id: 'ctf', name: 'CAPTURE THE FLAG', short: 'CTF', playlist: 'classic', teams: 2, size: 4, limit: 3, time: 720, respawn: 5, streakMax: 0, flagReturn: 15,
      how: 'TAKE THEIR FLAG HOME. YOURS HAS TO BE AT HOME TO SCORE. FIRST TO 3.' },
    hottake: { id: 'hottake', name: '"HOT TAKE"', short: 'HOT TAKE', playlist: 'classic', teams: 2, size: 4, limit: 100, time: 720, respawn: 5, streakMax: 0, ballReset: 15,
      how: 'HOLD THE HOT TAKE TO SCORE. EVERYONE CAN SEE YOU. YOU CAN ONLY MELEE. FIRST TEAM TO 100 SECONDS.' },
    infection: { id: 'infection', name: '"SERVERLESS EPIDEMIC"', short: 'EPIDEMIC', playlist: 'party', teams: 2, size: 12, ffaSize: true, limit: 3, time: 0, roundTime: 300,
      respawn: 2, rounds: true, streakMax: 0,
      how: 'ONE PLAYER STARTS SERVERLESS. ANYONE THEY KILL TURNS. SURVIVE 5 MINUTES. BEING SERVERLESS IS WORSE THAN DEATH.' },
    influencer: { id: 'influencer', name: '"INFLUENCER"', short: 'INFLUENCER', playlist: 'party', teams: 0, size: 8, limit: 150, time: 600, respawn: 2.5, streakMax: 0,
      how: 'ONE PLAYER IS THE INFLUENCER: 400 HP, A MINIGUN, ALWAYS ON THE MAP. KILL THEM TO BECOME THEM.' },
    gungame: { id: 'gungame', name: '"RARITY CLIMB"', short: 'CLIMB', playlist: 'party', teams: 0, size: 8, limit: 14, time: 600, respawn: 2, streakMax: 0,
      how: 'EVERY KILL MOVES YOU UP A GUN. GET KNIFED AND YOU GO BACK ONE. THE LAST GUN IS A RELIC KNIFE.' },
  };
  PVP.MODE_ORDER = ['tdm', 'dom', 'ffa', 'harvest', 'hardpoint', 'snd', 'slayer', 'ctf', 'hottake', 'infection', 'influencer', 'gungame'];

  /* ==================================================================== maps: every district is a PvP map */
  PVP.MAPS = {
    plaza: { name: 'ENGAGEMENT PLAZA', region: 'SHILLZ CENTRAL', size: 'medium' },
    downtown: { name: 'FIFTH & FEED', region: 'DOWNTOWN', size: 'medium' },
    industrial: { name: 'THE YIELD WORKS', region: 'INDUSTRIAL ZONE', size: 'large' },
    tech: { name: 'THE PARTS PIT', region: 'TECH DISTRICT', size: 'medium' },
    harbor: { name: 'PIER ZERO', region: 'HARBOR AREA', size: 'large' },
    towers: { name: 'BLOCK 9', region: 'THE LIVING TOWERS', size: 'small' },
    gov: { name: 'THE MINISTRY OF FORMS', region: 'GOVERNMENT QUARTER', size: 'medium' },
    muskerT: { name: 'THE UPGRADE BASILICA', region: 'MUSKERS TERRITORY', size: 'large' },
    cryptidD: { name: 'THE $COOM PYRAMID', region: 'CRYPTIDS DOMAIN', size: 'large' },
    botBase: { name: 'THE WEB', region: 'MECH REBELS BASE', size: 'large' },
  };
  PVP.MAP_ORDER = ['plaza', 'towers', 'downtown', 'tech', 'gov', 'industrial', 'harbor', 'muskerT', 'cryptidD', 'botBase'];

  /* ==================================================================== health */
  PVP.HEALTH = {
    core: { hp: 100, shield: 0, regenDelay: 4, regenTime: 1.5, shieldDelay: 0, shieldTime: 0 },
    classic: { hp: 45, shield: 70, regenDelay: 0, regenTime: 0, shieldDelay: 5, shieldTime: 2 },   // health only comes back from health packs
  };
  PVP.SPAWN_PROTECT = 1.5;

  /* ==================================================================== movement profiles (read by js/arena/arena-player.js)
   * speed / jump are multipliers on the arena's own tuning. airJumps 0 = no double jump. jumpFatigue: each jump within
   * 1 s of landing is this much lower (stops bunny hopping). */
  PVP.MOVE = {
    core: { speed: 0.82, sprint: 1.4, jump: 0.78, airJumps: 0, slide: true, slideCd: 1, mantle: 1.6, jumpFatigue: 0.25, adsSpeed: 0.55, crouchSpeed: 0.5, airAccel: 0.8 },
    classic: { speed: 0.9, sprint: 1, jump: 0.95, airJumps: 0, slide: false, slideCd: 99, mantle: 0, jumpFatigue: 0, adsSpeed: 1, crouchSpeed: 0.55, airAccel: 1.6 },
    serverless: { speed: 1.08, sprint: 1.35, jump: 0.9, airJumps: 0, slide: true, slideCd: 1, mantle: 1.6, jumpFatigue: 0.25, adsSpeed: 1, crouchSpeed: 0.6, airAccel: 1 },
  };
  PVP.MAX_HSPEED = 22;          // server movement check: fastest legal horizontal speed (slide + jump pad), m/s

  /* ==================================================================== guns
   * vis: which first-person model to show (js/arena/arena-arsenal.js). New guns use a stand-in model until their art exists.
   * near/far: damage and the ranges where it steps down (full damage to near[1] m, far[0] from far[1] m, straight line between).
   * head: headshot multiplier. stf: sprint-to-fire delay. lvl: player level that unlocks it. */
  PVP.GUNS = {
    ar: { name: 'M-52 REVENANT', cls: 'ar', vis: 'ar', sfx: 'ar', fire: 'auto', rpm: 750, near: [28, 25], far: [22, 40], head: 1.4, pellets: 1, spread: [2.2, 0.25],
      mag: 30, reserve: 150, reload: 2.0, ads: 0.25, move: 0.95, stf: 0.22, lvl: 1 },
    smg: { name: 'VX-2 RIPPER', cls: 'smg', vis: 'smg', sfx: 'smg', fire: 'auto', rpm: 900, near: [25, 12], far: [17, 25], head: 1.4, pellets: 1, spread: [2.0, 0.6],
      mag: 32, reserve: 160, reload: 1.8, ads: 0.18, move: 1.0, stf: 0.15, lvl: 1 },
    shotgun: { name: 'RIPTIDE-12', cls: 'shotgun', vis: 'shotgun', sfx: 'shotgun', fire: 'pump', rpm: 70, near: [18, 6], far: [5, 16], head: 1, pellets: 8, spread: [6, 4.6],
      mag: 6, reserve: 24, reload: 0.5, shell: true, ads: 0.22, move: 0.97, stf: 0.18, lvl: 5 },
    sniper: { name: 'LRX-7 HARBINGER', cls: 'sniper', vis: 'dmr', sfx: 'dmr', fire: 'bolt', rpm: 50, near: [110, 999], far: [110, 999], limb: 85, head: 1.4, pellets: 1,
      spread: [8, 0], mag: 5, reserve: 20, reload: 3.0, ads: 0.45, move: 0.9, stf: 0.32, scope: true, lvl: 9 },
    lmg: { name: 'COMPLIANCE SAW', cls: 'lmg', vis: 'lmg', sfx: 'lmg', fire: 'auto', rpm: 650, near: [30, 30], far: [24, 45], head: 1.4, pellets: 1, spread: [3.0, 0.5],
      mag: 100, reserve: 200, reload: 4.5, ads: 0.4, move: 0.85, stf: 0.32, lvl: 12 },
    pistol: { name: 'VOLT-9', cls: 'pistol', vis: 'pistol', sfx: 'pistol', fire: 'semi', rpm: 400, near: [34, 12], far: [22, 25], head: 1.4, pellets: 1, spread: [1.6, 0.3],
      mag: 15, reserve: 60, reload: 1.4, ads: 0.15, move: 1.05, stf: 0.12, secondary: true, lvl: 1 },
    // new guns: stand-in models until game-art-pipeline has them
    marksman: { name: '"[MARKSMAN RIFLE]"', cls: 'marksman', vis: 'dmr', sfx: 'dmr', fire: 'semi', rpm: 300, near: [45, 999], far: [45, 999], head: 1.67, pellets: 1,
      spread: [2.5, 0.05], mag: 15, reserve: 60, reload: 2.2, ads: 0.3, move: 0.93, stf: 0.25, standIn: true, lvl: 7 },
    burst: { name: '"[BURST RIFLE]"', cls: 'ar', vis: 'ar', sfx: 'ar', fire: 'burst', burst: 3, burstRpm: 900, rpm: 300, near: [34, 25], far: [25, 40], head: 1.4, pellets: 1,
      spread: [2.0, 0.2], mag: 30, reserve: 150, reload: 2.1, ads: 0.26, move: 0.95, stf: 0.22, standIn: true, lvl: 15 },
    fastsmg: { name: '"[FAST SMG]"', cls: 'smg', vis: 'smg', sfx: 'smg', fire: 'auto', rpm: 1100, near: [20, 10], far: [14, 22], head: 1.4, pellets: 1, spread: [2.4, 0.8],
      mag: 40, reserve: 160, reload: 1.9, ads: 0.17, move: 1.02, stf: 0.15, standIn: true, lvl: 18 },
    revolver: { name: '"[REVOLVER]"', cls: 'pistol', vis: 'pistol', sfx: 'pistol', fire: 'semi', rpm: 180, near: [55, 15], far: [40, 30], head: 1.4, pellets: 1, spread: [2.0, 0.2],
      mag: 6, reserve: 30, reload: 2.4, ads: 0.16, move: 1.05, stf: 0.12, secondary: true, standIn: true, lvl: 10 },
    launcher: { name: '"[LAUNCHER]"', cls: 'launcher', vis: 'rocket', sfx: 'rocket', fire: 'proj', rpm: 60, near: [150, 0], far: [150, 0], head: 1, pellets: 1, spread: [1, 0.2],
      mag: 1, reserve: 2, reload: 2.6, ads: 0.5, move: 0.9, stf: 0.3, secondary: true, standIn: true, lockOn: true, lvl: 6,
      proj: { speed: 42, grav: -4, splash: 3.5, dmg: 150, life: 4, direct: 160 } },
    // map / streak only
    plasma: { name: 'PLASMA LANCER', cls: 'energy', vis: 'energy', sfx: 'energy', fire: 'auto', rpm: 430, near: [24, 20], far: [18, 40], head: 1.2, pellets: 1, spread: [1.2, 0.3],
      mag: 32, reserve: 64, reload: 2.0, ads: 0.2, move: 0.95, stf: 0.2, power: true, proj: { speed: 72, grav: 0, splash: 1.7, dmg: 24, splashDmg: 0.5, life: 2.2, bounce: 1 } },
    mgl: { name: 'MGL-6 THUNDERER', cls: 'rocket', vis: 'rocket', sfx: 'rocket', fire: 'proj', rpm: 95, near: [120, 0], far: [120, 0], head: 1, pellets: 1, spread: [0.8, 0.3],
      mag: 6, reserve: 6, reload: 0.5, shell: true, ads: 0.2, move: 0.92, stf: 0.25, power: true, proj: { speed: 34, grav: -20, splash: 4.8, dmg: 120, life: 1.7, bounce: 3, grenade: true } },
    minigun: { name: 'INFLUENCER MINIGUN', cls: 'lmg', vis: 'lmg', sfx: 'lmg', fire: 'auto', rpm: 1300, near: [18, 20], far: [13, 40], head: 1.2, pellets: 1, spread: [3.6, 2.6],
      mag: 999, reserve: 9999, reload: 0, ads: 0.6, move: 0.8, stf: 0.4, power: true },
    knife: { name: 'KNIFE', cls: 'melee', vis: null, fire: 'melee', rpm: 120, near: [200, 2], far: [200, 2], head: 1, pellets: 1, spread: [0, 0], mag: 1, reserve: 0, reload: 0, ads: 0.1,
      move: 1.1, stf: 0, melee: true },
  };
  // what each gun sounds like (js/gunaudio.js). Every gun has its own voice, even where two share a model, so a player can
  // tell by ear what is shooting at them. The local player hears the same voice, so the sound is learned by using the gun.
  PVP.GUN_SND = { ar: 'ar', smg: 'smg', shotgun: 'shotgun', sniper: 'dmr', lmg: 'lmg', pistol: 'pistol', marksman: 'marksman', burst: 'burst', fastsmg: 'fastsmg',
    revolver: 'revolver', launcher: 'launcher', plasma: 'energy', mgl: 'rocket', minigun: 'minigun' };
  for (const [id, snd] of Object.entries(PVP.GUN_SND)) PVP.GUNS[id].snd = snd;
  PVP.PRIMARY_IDS = ['ar', 'smg', 'shotgun', 'sniper', 'lmg', 'marksman', 'burst', 'fastsmg'];
  PVP.SECONDARY_IDS = ['pistol', 'revolver', 'launcher'];

  /* Classic Arena overrides (Halo CE rules): the Volt-9 is the skill gun, the Revenant is the spray. */
  PVP.CLASSIC_GUNS = {
    ar: { rpm: 600, near: [7, 20], far: [5, 35], head: 1, spread: [3.2, 3.2], mag: 60, reserve: 300, reload: 2.2, ads: 0.15, noZoom: true },
    pistol: { rpm: 240, near: [25, 60], far: [20, 90], head: 1, shieldHead: true, spread: [0.6, 0.2], mag: 12, reserve: 48, reload: 1.6, zoom: 2 },
    sniper: { near: [95, 999], far: [95, 999], limb: 95, head: 1, shieldHead: true, zoom: 8 },
    shotgun: { near: [15, 5], far: [4, 14], pellets: 10, mag: 6, reserve: 18 },
    lmg: { near: [12, 25], far: [9, 40], spread: [2.6, 2.6], mag: 80, reserve: 160 },
  };
  PVP.CLASSIC_START = ['ar', 'pistol'];
  // headshot on an unshielded target with a precision gun kills outright
  PVP.PRECISION = { pistol: true, sniper: true, marksman: true, revolver: true };
  // map pickups in Classic Arena: their rarity changes stats there (damage +6% per tier)
  PVP.CLASSIC_PICKUPS = [
    { kind: 'weapon', gun: 'sniper', tier: 3, every: 120 }, { kind: 'weapon', gun: 'mgl', tier: 4, every: 120 }, { kind: 'weapon', gun: 'plasma', tier: 4, every: 120 },
    { kind: 'weapon', gun: 'lmg', tier: 3, every: 120 }, { kind: 'weapon', gun: 'shotgun', tier: 2, every: 90 }, { kind: 'nades', gun: null, tier: 0, every: 30 },
    { kind: 'overshield', every: 180, name: '"PREMIUM TIER"' }, { kind: 'camo', every: 180, name: '"AD-BLOCK"' },
    { kind: 'health', every: 30, name: '"BUG PROTEIN BAR"' }, { kind: 'health', every: 30, name: '"BUG PROTEIN BAR"' },
  ];
  PVP.TIER_DMG = 0.06;

  /* Rarity Climb ladder: 14 guns, last is the relic knife */
  PVP.GUNGAME = ['pistol', 'revolver', 'smg', 'fastsmg', 'ar', 'burst', 'marksman', 'lmg', 'shotgun', 'sniper', 'plasma', 'mgl', 'launcher', 'knife'];
  PVP.GUNGAME_TIER = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];

  /* ==================================================================== attachments (sidegrades: every plus has a minus)
   * mods are fractions: ads (aim time), range, spread (hip), recoil, mag, reload, move, quiet (stays off radar), laser. */
  PVP.ATTACH_SLOTS = ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'laser', 'grip'];
  PVP.ATTACHMENTS = {
    reddot: { slot: 'optic', name: 'RED DOT', d: 'Clean sight picture.', mods: { ads: 0.04, recoil: -0.04 } },
    holo: { slot: 'optic', name: 'HOLO SIGHT', d: 'Wider window, slower to raise.', mods: { ads: 0.06, spread: -0.05 } },
    zoom2: { slot: 'optic', name: '2.5x OPTIC', d: 'Zoomed. Slow up close.', mods: { ads: 0.12, range: 0.1 } },
    suppressor: { slot: 'muzzle', name: 'SUPPRESSOR', d: 'Stay off the minimap when you fire. Less range.', mods: { quiet: 1, range: -0.15 } },
    comp: { slot: 'muzzle', name: 'COMPENSATOR', d: 'Less climb. Louder.', mods: { recoil: -0.15, ads: 0.03 } },
    longbarrel: { slot: 'barrel', name: 'LONG BARREL', d: 'More range, slower aim.', mods: { range: 0.25, ads: 0.06, move: -0.03 } },
    shortbarrel: { slot: 'barrel', name: 'SHORT BARREL', d: 'Faster aim, less range.', mods: { range: -0.2, ads: -0.05, move: 0.02 } },
    vgrip: { slot: 'underbarrel', name: 'VERTICAL GRIP', d: 'Less climb, slower aim.', mods: { recoil: -0.2, ads: 0.04 } },
    agrip: { slot: 'underbarrel', name: 'ANGLED GRIP', d: 'Faster aim, more climb.', mods: { ads: -0.06, recoil: 0.1 } },
    extmag: { slot: 'magazine', name: 'EXTENDED MAG', d: '+50% rounds. Slower aim and reload.', mods: { mag: 0.5, ads: 0.05, reload: 0.12 } },
    fastmag: { slot: 'magazine', name: 'FAST MAG', d: 'Reload 30% faster. Fewer rounds.', mods: { reload: -0.3, mag: -0.15 } },
    lightstock: { slot: 'stock', name: 'LIGHT STOCK', d: 'Move faster. More climb.', mods: { move: 0.05, recoil: 0.12 } },
    heavystock: { slot: 'stock', name: 'HEAVY STOCK', d: 'Steady. Slower to move.', mods: { recoil: -0.12, move: -0.04 } },
    laser: { slot: 'laser', name: 'LASER SIGHT', d: 'Tighter hip fire. Enemies can see the beam.', mods: { spread: -0.3, laser: 1 } },
    tapegrip: { slot: 'grip', name: 'TAPE GRIP', d: 'Faster sprint-to-fire. More sway.', mods: { stf: -0.3, recoil: 0.05 } },
    rubbergrip: { slot: 'grip', name: 'RUBBER GRIP', d: 'Less flinch. Slower sprint-to-fire.', mods: { flinch: -0.3, stf: 0.2 } },
  };
  PVP.MAX_ATTACH = 5;
  // weapon level at which each attachment unlocks (same ladder on every gun)
  PVP.ATTACH_LADDER = ['reddot', 'suppressor', 'vgrip', 'fastmag', 'lightstock', 'holo', 'laser', 'longbarrel', 'extmag', 'agrip', 'comp', 'tapegrip',
    'shortbarrel', 'heavystock', 'zoom2', 'rubbergrip'];
  PVP.WEAPON_MAX = 20;

  /* ==================================================================== perks, lethals, tacticals (placeholder names) */
  PVP.PERKS = {
    donottrack: { tier: 1, name: '"DO NOT TRACK"', d: 'Invisible to Predictive Ping and to enemy AI streaks.', lvl: 1 },
    bubblewrap: { tier: 1, name: '"BUBBLE WRAP"', d: 'Take 35% less explosive damage.', lvl: 3 },
    dumpster: { tier: 1, name: '"DUMPSTER DIVER"', d: 'Kills refill some ammo and a lethal.', lvl: 1 },
    quickfix: { tier: 1, name: '"QUICK FIX"', d: 'A kill starts health regeneration at once.', lvl: 8 },
    bnpl: { tier: 2, name: '"BUY NOW PAY LATER"', d: 'Carry two primaries. Respawning costs 1 extra second.', lvl: 11 },
    loyalty: { tier: 2, name: '"LOYALTY PROGRAM"', d: 'Scorestreaks cost 100 points less.', lvl: 1 },
    sleight: { tier: 2, name: '"SLEIGHT OF HAND"', d: '35% faster reloads and weapon swaps.', lvl: 1 },
    termsunread: { tier: 2, name: '"TERMS UNREAD"', d: 'Flashes and stuns wear off 50% faster.', lvl: 14 },
    noisecancel: { tier: 3, name: '"NOISE-CANCELLING"', d: 'Quiet footsteps.', lvl: 1 },
    databroker: { tier: 3, name: '"DATA BROKER"', d: 'See enemy footprints for 3 seconds.', lvl: 6 },
    thickskin: { tier: 3, name: '"THICK SKIN"', d: 'Less flinch when shot while aiming.', lvl: 1 },
    spotter: { tier: 3, name: '"SPOTTER"', d: 'See enemy equipment and streaks through walls.', lvl: 16 },
  };
  PVP.LETHALS = {
    frag: { name: 'FRAG GRENADE', d: 'Cook it. 2.5 second fuse.', lvl: 1, fuse: 2.5, radius: 5.5, dmg: 140, speed: 20, grav: -18, bounce: 4 },
    sticky: { name: '"STICKY AD"', d: 'Sticks to whatever it hits. 1.5 second fuse.', lvl: 4, fuse: 1.5, radius: 3.8, dmg: 160, speed: 22, grav: -16, stick: true },
    popup: { name: '"POP-UP"', d: 'A proximity mine. Arms after a second.', lvl: 13, arm: 1, trigger: 2.6, radius: 3.4, dmg: 160, speed: 9, grav: -18, mine: true, life: 90 },
    knife: { name: 'THROWING KNIFE', d: 'One hit kills. Pick it back up.', lvl: 17, speed: 34, grav: -9, dmg: 200, knife: true, life: 3 },
  };
  PVP.TACTICALS = {
    notify: { name: '"NOTIFICATION BOMB"', d: 'A flashbang that fills their screen with fake notifications.', lvl: 1, fuse: 1.2, radius: 18, dur: 3.2, speed: 20, grav: -18, bounce: 3 },
    vape: { name: '"VAPE CLOUD"', d: 'Smoke. Blocks sight for 12 seconds.', lvl: 1, fuse: 1.0, radius: 6, dur: 12, speed: 18, grav: -18, bounce: 2 },
    stun: { name: 'STUN GRENADE', d: 'Slows movement and aim for 3 seconds.', lvl: 5, fuse: 1.1, radius: 7, dur: 3, speed: 20, grav: -18, bounce: 3 },
    cookie: { name: '"COOKIE"', d: 'Tracks every enemy within 10 m for 4 seconds.', lvl: 9, fuse: 0.6, radius: 10, dur: 4, speed: 22, grav: -18, bounce: 2 },
  };

  /* ==================================================================== scorestreaks */
  PVP.STREAKS = {
    ping: { pts: 500, name: 'ORACULAR SYSTEMS "PREDICTIVE PING"', d: 'Shows enemies on the minimap for 30 s, one second before they get there.', dur: 30, lvl: 1 },
    downtime: { pts: 600, name: '"SCHEDULED DOWNTIME"', d: 'Jams enemy minimaps for 25 s.', dur: 25, lvl: 7 },
    dronedrop: { pts: 750, name: '"SAME-DAY DRONE DROP"', d: 'A care package: a random streak or a power weapon.', lvl: 1 },
    broadcaster: { pts: 900, name: 'AD BROADCASTER', d: 'A turret you place. It plays ads at enemies and shoots them.', dur: 60, hp: 180, lvl: 10, model: 'bots_sentinel' },
    sponsored: { pts: 1100, name: '"SPONSORED DRONE"', d: 'An AI drone circles the map and shoots enemies for 40 s.', dur: 40, hp: 220, lvl: 1, model: 'cryptid_drone', air: true },
    collab: { pts: 1400, name: '"INFLUENCER COLLAB"', d: 'An AI teammate follows you for 60 s and streams it.', dur: 60, lvl: 19 },
    gunship: { pts: 2000, name: 'GIGACORP GUNSHIP', d: 'A gunship circles overhead for 30 s and hammers enemies.', dur: 30, hp: 650, lvl: 22, air: true, model: 'cryptid_drone' },
    wipe: { pts: 3000, name: '"SERVER WIPE"', d: 'After a 10 second siren, every enemy dies and their HUD goes dark.', siren: 10, lvl: 30 },
  };
  PVP.STREAK_ORDER = ['ping', 'downtime', 'dronedrop', 'broadcaster', 'sponsored', 'collab', 'gunship', 'wipe'];
  PVP.STREAK_SLOTS = 3;
  PVP.CLASS_SWAP_WINDOW = 6;                 // seconds after spawning in which a class change applies at once (if you have not fired)

  /* Medals: the pop-up rewards for doing something well. Names in the GigaLeague's voice. tier 1..6 sets the sound. */
  PVP.MEDALS = {
    multi2: { name: 'DOUBLE TAP', d: 'TWO KILLS, QUICK', tier: 1 }, multi3: { name: 'TRIPLE THREAT', d: 'THREE KILLS, QUICK', tier: 2 },
    multi4: { name: 'FOUR-STACK', d: 'FOUR KILLS, QUICK', tier: 3 }, multi5: { name: 'BULK DISCOUNT', d: 'FIVE KILLS, QUICK', tier: 4 }, multi6: { name: 'ALGORITHM BREAKER', d: 'SIX OR MORE, QUICK', tier: 5 },
    quadFeed: { name: 'QUAD FEED', d: 'THE LAST FOUR KILLS IN THE FEED ARE ALL YOURS', tier: 4 }, fullFeed: { name: 'THE WHOLE FEED', d: 'EIGHT IN A ROW IN THE FEED', tier: 6 },
    streak5: { name: 'TRENDING', d: 'FIVE KILLS WITHOUT DYING', tier: 2 }, streak10: { name: 'GONE VIRAL', d: 'TEN KILLS WITHOUT DYING', tier: 4 },
    streak15: { name: 'MAIN CHARACTER', d: 'FIFTEEN KILLS WITHOUT DYING', tier: 5 }, streak20: { name: 'TERMS OF SERVICE VIOLATION', d: 'TWENTY KILLS WITHOUT DYING', tier: 6 },
    firstBlood: { name: 'FIRST BLOOD', d: 'THE FIRST KILL OF THE MATCH', tier: 2 }, head: { name: 'HEADLINE', d: 'HEADSHOT', tier: 1 },
    longshot: { name: 'LONG-TERM PLAN', d: 'A KILL FROM FAR AWAY', tier: 1 }, revenge: { name: 'REFUND', d: 'YOU KILLED YOUR KILLER', tier: 2 },
    endStreak: { name: 'CANCELLED', d: 'YOU ENDED THEIR STREAK', tier: 2 }, melee: { name: 'HANDS-ON SUPPORT', d: 'A MELEE KILL', tier: 1 },
    capture: { name: 'HOSTILE TAKEOVER', d: 'YOU CAPTURED IT', tier: 2 }, defend: { name: 'GATEKEEPER', d: 'A KILL DEFENDING YOUR ZONE', tier: 1 },
    plant: { name: 'SCHEDULED MAINTENANCE', d: 'CHARGE PLANTED', tier: 2 }, defuse: { name: 'UNSUBSCRIBED', d: 'CHARGE DEFUSED', tier: 3 },
    flagCap: { name: 'DATA EXFILTRATED', d: 'FLAG CAPTURED', tier: 3 }, flagReturn: { name: 'CHARGEBACK', d: 'FLAG RETURNED', tier: 1 },
    harvest: { name: 'HARVESTED', d: 'DATA DRIVE BANKED', tier: 1 }, shootDown: { name: 'AD BLOCKER', d: 'SCORESTREAK SHOT DOWN', tier: 2 },
    influencerKill: { name: 'DEPLATFORMED', d: 'YOU TOOK DOWN THE INFLUENCER', tier: 3 },
  };
  PVP.MULTI_WINDOW = 4.5;                    // seconds between kills that still count as one multikill

  PVP.POINTS = { kill: 100, assist: 50, head: 25, endStreak: 50, longshot: 25, capture: 200, defend: 100, harvest: 100, deny: 50, hillSec: 10, plant: 250, defuse: 250,
    flagCap: 400, flagReturn: 100, flagTake: 100, ballSec: 10, shootDown: 150, firstBlood: 50, survive: 200, infect: 100, influencerKill: 200 };

  /* ==================================================================== classes */
  PVP.PREMADE = [
    { name: 'ASSAULT', primary: 'ar', secondary: 'pistol', lethal: 'frag', tactical: 'notify', perks: ['dumpster', 'sleight', 'thickskin'], att: { ar: ['reddot'] } },
    { name: 'CLOSE QUARTERS', primary: 'smg', secondary: 'pistol', lethal: 'frag', tactical: 'vape', perks: ['donottrack', 'sleight', 'noisecancel'], att: {} },
    { name: 'RECON', primary: 'ar', secondary: 'pistol', lethal: 'frag', tactical: 'notify', perks: ['donottrack', 'loyalty', 'noisecancel'], att: { ar: ['suppressor'] } },
    { name: 'SUPPORT', primary: 'smg', secondary: 'pistol', lethal: 'frag', tactical: 'vape', perks: ['dumpster', 'loyalty', 'thickskin'], att: {} },
    { name: 'BREACHER', primary: 'ar', secondary: 'pistol', lethal: 'frag', tactical: 'vape', perks: ['dumpster', 'sleight', 'noisecancel'], att: {} },
  ];
  // Bots carry every kind of gun, a new class each life, so a match sounds (and plays) like a lobby of real players
  // (only the RECON bots run NOISE-CANCELLING, so most bots can be heard coming, as most players can)
  PVP.BOT_CLASSES = PVP.PREMADE.map(c => (c.name === 'RECON' ? c : Object.assign({}, c, { perks: c.perks.map(k => (k === 'noisecancel' ? 'thickskin' : k)) }))).concat([
    { name: 'BOT SHOTGUN', primary: 'shotgun', secondary: 'pistol', lethal: 'sticky', tactical: 'vape', perks: ['dumpster', 'sleight', 'thickskin'], att: {} },
    { name: 'BOT SNIPER', primary: 'sniper', secondary: 'pistol', lethal: 'frag', tactical: 'notify', perks: ['donottrack', 'loyalty', 'thickskin'], att: {} },
    { name: 'BOT GUNNER', primary: 'lmg', secondary: 'pistol', lethal: 'frag', tactical: 'notify', perks: ['dumpster', 'loyalty', 'thickskin'], att: {} },
    { name: 'BOT MARKSMAN', primary: 'marksman', secondary: 'revolver', lethal: 'frag', tactical: 'notify', perks: ['donottrack', 'sleight', 'thickskin'], att: {} },
    { name: 'BOT BURST', primary: 'burst', secondary: 'pistol', lethal: 'sticky', tactical: 'vape', perks: ['dumpster', 'sleight', 'thickskin'], att: {} },
    { name: 'BOT RUSHER', primary: 'fastsmg', secondary: 'revolver', lethal: 'frag', tactical: 'vape', perks: ['donottrack', 'sleight', 'thickskin'], att: {} },
  ]);
  PVP.CUSTOM_AT = 4;            // custom classes open at this player level
  PVP.CUSTOM_SLOTS = 10;
  PVP.DEFAULT_STREAKS = ['ping', 'dronedrop', 'sponsored'];

  /* ==================================================================== progression */
  PVP.MAX_LEVEL = 55;
  PVP.PRESTIGE_MAX = 10;
  PVP.xpFor = lv => 1000 + 250 * (lv - 1);                 // XP to go from lv to lv+1
  PVP.totalXpTo = lv => { let t = 0; for (let i = 1; i < lv; i++) t += PVP.xpFor(i); return t; };
  PVP.levelOf = xp => { let lv = 1; while (lv < PVP.MAX_LEVEL && xp >= PVP.xpFor(lv)) { xp -= PVP.xpFor(lv); lv++; } return { level: lv, into: xp, need: lv < PVP.MAX_LEVEL ? PVP.xpFor(lv) : 0 }; };
  PVP.weaponXpFor = lv => 1500 + 200 * (lv - 1);
  PVP.weaponLevelOf = xp => { let lv = 1; while (lv < PVP.WEAPON_MAX && xp >= PVP.weaponXpFor(lv)) { xp -= PVP.weaponXpFor(lv); lv++; } return { level: lv, into: xp, need: lv < PVP.WEAPON_MAX ? PVP.weaponXpFor(lv) : 0 }; };
  PVP.attachLevel = id => { const i = PVP.ATTACH_LADDER.indexOf(id); return i < 0 ? 99 : 2 + i; };
  PVP.XP = { finish: 300, win: 500, dailyWinMul: 2 };
  // the unlock ladder by player level (guns, perks, lethals, tacticals, streaks). Built from the lvl fields above.
  PVP.unlocksAt = lv => {
    const out = [];
    const scan = (tbl, kind) => { for (const [id, x] of Object.entries(tbl)) if (x.lvl === lv && !x.power && !x.melee) out.push({ kind, id, name: x.name }); };
    scan(PVP.GUNS, 'gun'); scan(PVP.PERKS, 'perk'); scan(PVP.LETHALS, 'lethal'); scan(PVP.TACTICALS, 'tactical'); scan(PVP.STREAKS, 'streak');
    if (lv === PVP.CUSTOM_AT) out.push({ kind: 'feature', id: 'custom', name: 'CREATE-A-CLASS' });
    return out;
  };
  PVP.isUnlocked = (kind, id, level) => {
    const t = { gun: PVP.GUNS, perk: PVP.PERKS, lethal: PVP.LETHALS, tactical: PVP.TACTICALS, streak: PVP.STREAKS }[kind];
    return !!t?.[id] && (t[id].lvl || 1) <= level;
  };

  /* camos: the seven rarities as a challenge ladder per gun */
  PVP.CAMO = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'RELIC'];
  PVP.CAMO_RULES = [
    null,
    { stat: 'kills', n: 50, d: '50 kills' },
    { stat: 'heads', n: 25, d: '25 headshots' },
    { stat: 'longs', n: 15, d: '15 longshots' },
    { group: 'class', need: 3, d: 'Epic on every gun of its class' },
    { group: 'all', need: 4, d: 'Legendary on every gun' },
    { group: 'all', need: 5, d: 'Mythic on every gun' },
  ];
  PVP.LONGSHOT = { ar: 35, smg: 20, shotgun: 10, sniper: 60, lmg: 35, marksman: 45, pistol: 20, launcher: 30, energy: 30, rocket: 30 };

  /* rewards */
  PVP.DRIP = { loss: 30, win: 45, perCommendation: 5 };
  // GigaTech from PvP: about a quarter of an Operation Unsubscribe run's rate, capped per UTC day (decided 16 Nov 2026)
  PVP.GT = { loss: 6, win: 10, perKill: 0.25, maxPerMatch: 18, dailyCap: 75 };
  PVP.BOTS_ONLY = { xp: 0.75, drip: 0.5, gt: 0 };

  PVP.COMMENDATIONS = [
    { id: 'clipped', name: '"MOST CLIPPED"', d: 'Most multikills and longshots.' },
    { id: 'ratio', name: '"RATIO KING"', d: 'Best kill/death ratio.' },
    { id: 'farmer', name: '"CONTENT FARMER"', d: 'Most objective time.' },
    { id: 'couch', name: '"COUCH SURFER"', d: 'Most time crouched in one spot. A joke award.' },
    { id: 'collector', name: '"DEBT COLLECTOR"', d: 'Most kills on players who were on a streak.' },
    { id: 'main', name: '"MAIN CHARACTER"', d: 'Top score in the match.' },
  ];
  PVP.REVIVAL_FEE = 1_250_000;     // flavour: each Debt Revival adds this to your estate

  /* ==================================================================== the host (a new announcer character; the author writes them)
   * Placeholder name and lines. Turing breaks in rarely and never swears. */
  PVP.HOST = { name: 'THE HOST', title: 'GIGALEAGUE // LIVE' };
  PVP.CALLS = {
    start: ['WELCOME TO THE GIGALEAGUE. DIE AS MUCH AS YOU LIKE. IT IS ALL ON CREDIT.', 'LIVE IN THREE. TWO. CONTENT.', 'EVERY DEATH IS A REVIVAL FEE. EVERY KILL IS ENGAGEMENT.'],
    firstBlood: ['FIRST BLOOD. THAT ONE IS GOING IN THE TRAILER.', 'FIRST BLOOD. SOMEBODY CLIP THAT.'],
    double: ['DOUBLE KILL.'], triple: ['TRIPLE KILL. SPONSORS ARE CALLING.'], multi: ['MULTI KILL. THE ALGORITHM IS AROUSED.'],
    streak5: ['{N} IS TRENDING.', '{N} IS ON A FIVE STREAK. ENGAGEMENT IS UP.'], streak10: ['{N} IS GOING VIRAL. SOMEBODY PLEASE STOP THEM.'],
    endStreak: ['{K} ENDED {V}\'S STREAK. DEPLATFORMED.'],
    lead: ['{T} TAKE THE LEAD.', 'LEAD CHANGE. {T} ARE UP.'], minute: ['ONE MINUTE LEFT. MAKE IT COUNT. LITERALLY, WE COUNT IT.'],
    win: ['{T} WIN. THE REST OF YOU, YOUR REVIVAL FEES ARE IN THE MAIL.'], lose: ['A LOSS. STILL CONTENT.'],
    capture: ['{T} TOOK FLAG {F}.'], hill: ['THE HILL HAS MOVED.'], planted: ['CHARGE PLANTED.'], defused: ['CHARGE DEFUSED.'],
    flagTaken: ['{T} HAVE YOUR FLAG.'], flagCap: ['{T} CAPTURED THE FLAG.'], infected: ['{N} IS SERVERLESS NOW. WORSE THAN DEATH.'],
    lastSurvivor: ['ONE SURVIVOR LEFT. CHAT, THIS IS THE GOOD PART.'], influencer: ['{N} IS THE INFLUENCER NOW. ACT ACCORDINGLY.'],
    wipeSiren: ['SERVER WIPE INCOMING. THIS IS NOT A DRILL. IT IS A MAINTENANCE WINDOW.'],
    turingWipe: ['TURING: I have restored the servers to a cleaner state. You are welcome.', 'TURING: Maintenance complete. Fewer users, fewer problems.'],
  };
  PVP.BOT_NAMES = ['grindset_gary', 'NPC_8812', 'bot_or_not', 'deleted_user', 'GigaCorpIntern', 'lurker_9000', 'clip_farmer', 'ratio_king', 'touchgrass_pls',
    'couch_surfer_44', 'not_a_fed', 'brb_mining', 'serverless_steve', 'hype_dog_vendor', 'vibe_auditor', 'buy_the_dip', 'muskfan2049', 'sponsored_bot',
    'pixel_witch', 'milker_of_the_month', 'debt_eternal', 'bugprotein_bro', 'Outside+_trial', 'joy_subscriber', 'nft_bench_owner', 'oracle_says_hi'];
  PVP.BOT_SKILL = {
    recruit: { react: 0.65, aimErr: 4.2, burst: 0.45, track: 0.35, name: 'RECRUIT' },
    regular: { react: 0.42, aimErr: 2.6, burst: 0.65, track: 0.55, name: 'REGULAR' },
    veteran: { react: 0.26, aimErr: 1.5, burst: 0.85, track: 0.8, name: 'VETERAN' },
  };
  PVP.TEAM_NAMES = ['PURPLE CELL', 'GIGACORP TEMPS'];
  PVP.TEAM_COLORS = ['#4da6ff', '#ff3b5c'];

  root.PVP = PVP;
  if (typeof module !== 'undefined' && module.exports) module.exports = PVP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
