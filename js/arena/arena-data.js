/* EARTH 2049: SAVE SEED 7 — ARENA content: guns, enemies, sponsor perks, chat, ranks, lines.
 *
 * Tuning lives here so the feel can be iterated without touching systems code.
 * Angles are degrees, speeds m/s, times seconds.
 */
'use strict';

AR.VERSION = '20261111-arena-gf';

/* ====================================================================== GUNS */
AR.GUNS = {
  pistol: {
    name: 'VOLT-9', cls: 'pistol', sfx: 'pistol', tag: 'SIDEARM // INFINITE RESERVE',
    dmg: 30, pellets: 1, rpm: 400, mag: 12, reserve: Infinity, reload: 0.95,
    spread: 0.45, adsSpread: 0.05, bloom: 0.55, bloomMax: 2.4, bloomRecover: 7,
    kick: 1.7, kickYaw: 0.45, recover: 9, shake: 0.07, fovKick: 1.2, vmKick: 0.09, vmRot: 0.22,
    knock: 3, head: 2.2, falloff: [35, 70, 0.6], tracer: 0xfff2a0, ads: 0.82, adsTime: 0.12,
  },
  smg: {
    name: 'VX-2 RIPPER', cls: 'smg', sfx: 'smg', tag: 'SMG // 950 RPM // SPRAY AND PRAY',
    dmg: 15, pellets: 1, rpm: 950, mag: 42, reserve: 294, reload: 1.35,
    spread: 1.5, adsSpread: 0.6, bloom: 0.22, bloomMax: 4.2, bloomRecover: 9,
    kick: 0.62, kickYaw: 0.55, recover: 11, shake: 0.035, fovKick: 0.4, vmKick: 0.035, vmRot: 0.07,
    knock: 1.3, head: 1.6, falloff: [16, 36, 0.55], tracer: 0x9bffef, ads: 0.85, adsTime: 0.12, tracerEvery: 2,
  },
  shotgun: {
    name: 'RIPTIDE-12', cls: 'shotgun', sfx: 'shotgun', tag: 'SHOTGUN // 10 PELLETS // DELETES PEOPLE',
    dmg: 13, pellets: 10, rpm: 82, mag: 6, reserve: 42, reload: 0.42, shellReload: true, reloadOpen: 0.3,
    spread: 5.4, adsSpread: 3.6, bloom: 0, bloomMax: 0, bloomRecover: 1,
    kick: 6.5, kickYaw: 1.2, recover: 6, shake: 0.34, fovKick: 6, vmKick: 0.22, vmRot: 0.55,
    knock: 9.5, head: 1.35, falloff: [9, 24, 0.3], tracer: 0xffc070, ads: 0.88, adsTime: 0.14, tracerEvery: 3,
  },
  ar: {
    name: 'M-52 REVENANT', cls: 'ar', sfx: 'ar', tag: 'RIFLE // 640 RPM // LEARN THE KICK',
    dmg: 26, pellets: 1, rpm: 640, mag: 30, reserve: 210, reload: 1.55,
    spread: 0.8, adsSpread: 0.12, bloom: 0.16, bloomMax: 3, bloomRecover: 8,
    kick: 1.0, kickYaw: 0.35, pattern: true, recover: 7.5, shake: 0.06, fovKick: 0.7, vmKick: 0.05, vmRot: 0.1,
    knock: 2.2, head: 1.9, falloff: [32, 70, 0.7], tracer: 0xffe080, ads: 0.75, adsTime: 0.16, tracerEvery: 2,
  },
  dmr: {
    name: 'LRX-7 HARBINGER', cls: 'dmr', sfx: 'dmr', tag: 'MARKSMAN // PIERCES 4 // HEADSHOTS x2.6',
    dmg: 150, pellets: 1, rpm: 54, mag: 5, reserve: 35, reload: 2.0,
    spread: 1.4, adsSpread: 0.0, bloom: 0, bloomMax: 0, bloomRecover: 1,
    kick: 7.5, kickYaw: 0.9, recover: 5, shake: 0.42, fovKick: 5, vmKick: 0.26, vmRot: 0.5,
    knock: 8, head: 2.6, pierce: 4, falloff: [90, 140, 0.8], tracer: 0xff5bd6, ads: 0.36, adsTime: 0.2, scope: true, tracerEvery: 1,
  },
  energy: {
    name: 'PLASMA LANCER', cls: 'energy', sfx: 'energy', tag: 'PLASMA // BOUNCING BOLTS // SPLASH',
    dmg: 34, pellets: 1, rpm: 430, mag: 32, reserve: 192, reload: 1.45,
    spread: 0.7, adsSpread: 0.2, bloom: 0.12, bloomMax: 2, bloomRecover: 8,
    kick: 0.9, kickYaw: 0.4, recover: 9, shake: 0.05, fovKick: 0.6, vmKick: 0.05, vmRot: 0.12,
    knock: 2.6, head: 1.5, proj: { speed: 72, grav: 0, splash: 1.7, splashDmg: 0.55, bounce: 1, size: 0.22, color: 0x37f5ff, life: 2.2 },
    ads: 0.82, adsTime: 0.14,
  },
  rocket: {
    name: 'MGL-6 THUNDERER', cls: 'rocket', sfx: 'rocket', tag: 'GRENADE LAUNCHER // ROCKET JUMPS',
    dmg: 165, pellets: 1, rpm: 95, mag: 6, reserve: 30, reload: 0.5, shellReload: true, reloadOpen: 0.3,
    spread: 0.6, adsSpread: 0.2, bloom: 0, bloomMax: 0, bloomRecover: 1,
    kick: 4.5, kickYaw: 0.8, recover: 6, shake: 0.24, fovKick: 3, vmKick: 0.18, vmRot: 0.4,
    knock: 14, head: 1, proj: { speed: 34, grav: -20, splash: 4.8, splashDmg: 1, bounce: 3, size: 0.26, color: 0xffb020, life: 1.7, grenade: true, selfKnock: 13 },
    ads: 0.85, adsTime: 0.14,
  },
  lmg: {
    name: 'COMPLIANCE SAW', cls: 'lmg', sfx: 'lmg', tag: 'LMG // BELT-FED // 100 ROUNDS OF OPINIONS',
    dmg: 18, pellets: 1, rpm: 740, mag: 80, reserve: 320, reload: 2.5,
    spread: 2.0, adsSpread: 0.7, bloom: 0.1, bloomMax: 3.2, bloomRecover: 6,
    kick: 0.75, kickYaw: 0.5, recover: 8, shake: 0.06, fovKick: 0.5, vmKick: 0.045, vmRot: 0.08,
    knock: 2.2, head: 1.5, falloff: [28, 60, 0.6], tracer: 0xff8c00, ads: 0.8, adsTime: 0.24, tracerEvery: 2,
  },
};
AR.PRIMARIES = ['smg', 'shotgun', 'ar', 'dmr', 'energy', 'rocket', 'lmg'];

/* ====================================================================== ENEMIES */
AR.ENEMIES = {
  serverless: {
    name: 'THE SERVERLESS', models: ['serverless_m', 'serverless_f'], hp: 34, walk: 1.5, run: 4.4, r: 0.36, h: 1.72,
    dmg: 9, reach: 1.7, atkCd: 1.1, ai: 'swarm', score: 40, chips: [0, 1], knock: 1.5, flinch: 1, gib: [0x6b7d92, 0xb9a48a, 0x2a2f3a],
    voice: 'groan', blurb: 'Zombified users. Offline, unpaid, unstoppable in bulk.',
  },
  shill: {
    name: 'SHILL', models: ['shill_m', 'shill_f'], type: 'shill', hp: 72, walk: 3.0, run: 6.6, r: 0.38, h: 1.76,
    dmg: 13, reach: 1.9, atkCd: 0.9, ai: 'rusher', score: 100, chips: [1, 2], knock: 1.2, flinch: 0.7, gib: [0xffd400, 0xd9a066, 0x2a2416],
    blurb: 'Fake rebels. Real fists.',
  },
  streamer: {
    name: 'STREAMER', models: ['shill_m', 'shill_f'], type: 'streamer', hp: 62, walk: 3.4, run: 4.6, r: 0.38, h: 1.76,
    dmg: 9, ai: 'ranged', range: [9, 22], burst: 3, burstGap: 0.16, fireCd: [2.0, 3.0], tele: 0.6, boltSpeed: 24,
    score: 150, chips: [1, 3], knock: 1.2, flinch: 0.8, gib: [0xffd400, 0xff60d0, 0x2a2416], blurb: 'Ring light on. Aim off. Usually.',
  },
  hypebeast: {
    name: 'HYPEBEAST', models: ['hypebeast_m'], hp: 460, walk: 2.6, run: 3.6, r: 0.62, h: 1.76, scale: 1.32,
    dmg: 26, reach: 2.6, atkCd: 1.6, ai: 'charger', chargeSpeed: 16, chargeTele: 0.95, slam: [3.8, 20],
    score: 450, chips: [4, 7], knock: 0.25, flinch: 0.2, gib: [0xffd400, 0xff8c00, 0x101010], blurb: 'Telegraphs the charge. Sidestep, then empty a mag into his back.',
  },
  drone: {
    name: 'SPONSORED DRONE', models: ['cdrone_x'], hp: 48, run: 7.5, r: 0.5, h: 0.9, fly: [3.2, 6.5], ai: 'flyer', unit: true, scale: 1.1,
    dmg: 8, fireCd: [1.4, 2.4], tele: 0.35, boltSpeed: 28, score: 120, chips: [1, 2], knock: 2.4, flinch: 1, gib: [0xffd700, 0x00c853, 0x222222],
    blurb: 'Brought to you by someone. Pops like a balloon full of ads.',
  },
  moderator: {
    name: 'MODERATOR', models: ['enforcer_x'], hp: 720, walk: 2.2, run: 2.8, r: 0.7, h: 2.1, scale: 1.0,
    dmg: 24, reach: 2.4, atkCd: 1.4, ai: 'tank', shieldArc: 1.25, shieldMult: 0.2, lob: [3.2, 24], fireCd: [2.6, 3.6], tele: 1.0,
    score: 650, chips: [6, 9], knock: 0.15, flinch: 0.1, gib: [0x4da6ff, 0xdfefff, 0x202630], blurb: 'Front shield. Ban hammer. Flank it or blow it up.',
  },
};

/* ====================================================================== SPONSOR PERKS (roguelike picks) */
// rarity: 0 common, 1 rare, 2 legendary. stack: max picks. fx applied to the run's stat block.
AR.PERKS = [
  { id: 'hollow', n: 'HOLLOW POINTS', s: 'BULLET HELL™', r: 0, stack: 4, d: '+18% weapon damage.', fx: S => { S.dmg += 0.18; } },
  { id: 'overclock', n: 'FIRMWARE OVERCLOCK', s: 'GIGACORP LABS', r: 0, stack: 4, d: '+15% fire rate.', fx: S => { S.rate += 0.15; } },
  { id: 'algorithm', n: 'THE ALGORITHM', s: 'FEED™', r: 0, stack: 3, d: '+12% crit chance. Crits deal x1.75.', fx: S => { S.crit += 0.12; } },
  { id: 'magdump', n: 'MAG DUMP', s: 'EXTENDO CLUB', r: 0, stack: 3, d: '+40% magazine size.', fx: S => { S.mag += 0.4; } },
  { id: 'speedrun', n: 'SPEEDRUN STRATS', s: 'ANY% WEEKLY', r: 0, stack: 3, d: 'Reload 30% faster.', fx: S => { S.reload *= 0.7; } },
  { id: 'grass', n: 'TOUCH GRASS', s: 'OUTSIDE+', r: 0, stack: 4, d: 'Heal 4 HP per kill.', fx: S => { S.leech += 4; } },
  { id: 'vital', n: 'BIG BACK ENERGY', s: 'BUG PROTEIN', r: 0, stack: 3, d: '+35 max HP and heal it.', fx: (S, P) => { P.maxHp += 35; P.hp += 35; } },
  { id: 'plating', n: 'PARASOCIAL ARMOR', s: 'STANS UNITED', r: 0, stack: 3, d: '+40 max armor. Armor refilled.', fx: (S, P) => { P.maxArmor += 40; P.armor = P.maxArmor; } },
  { id: 'reflex', n: 'COLD BREW IV', s: 'CLOUT COFFEE', r: 0, stack: 3, d: '+10% move speed.', fx: S => { S.speed += 0.10; } },
  { id: 'paywall', n: 'PAYWALL', s: 'NFT PAWN', r: 0, stack: 3, d: '+50% GigaTech chips from kills.', fx: S => { S.chips += 0.5; } },
  { id: 'fomo', n: 'FOMO', s: 'HYPE DOGS', r: 0, stack: 2, d: 'Style drains 45% slower.', fx: S => { S.styleDrain *= 0.55; } },
  { id: 'hops', n: 'BUNNY HOP SUBSCRIPTION', s: 'JUMP+ PREMIUM', r: 1, stack: 2, d: '+1 air jump.', fx: S => { S.airJumps += 1; } },
  { id: 'dash', n: 'DASH CHARGE', s: 'ZOOMER FUEL', r: 1, stack: 2, d: '+1 dash charge. Dashes recharge 20% faster.', fx: S => { S.dashes += 1; S.dashCd *= 0.8; } },
  { id: 'ricochet', n: 'COMMENT SECTION', s: 'REPLY GUYS LLC', r: 1, stack: 3, d: 'Hits bounce to a nearby enemy for 45% damage.', fx: S => { S.ricochet += 1; } },
  { id: 'clickbait', n: 'CLICKBAIT', s: 'YOU WONT BELIEVE', r: 1, stack: 2, d: 'Kills explode for 40 damage in 3.5 m.', fx: S => { S.volatile += 1; } },
  { id: 'ragebait', n: 'RAGE BAIT', s: 'OUTRAGE.FM', r: 1, stack: 2, d: 'Each kill within 2.5 s of another: +8% damage (stacks to x10).', fx: S => { S.ragebait += 1; } },
  { id: 'engage', n: 'ENGAGEMENT FARMING', s: 'SHILLZ X GIGACORP', r: 1, stack: 2, d: 'Headshot kills refund 4 rounds into the mag.', fx: S => { S.headRefund += 4; } },
  { id: 'boot', n: 'BIG BOOT', s: 'KICKSTARTER', r: 1, stack: 2, d: 'Kick deals x3 damage and resets a dash charge on hit.', fx: S => { S.kick += 2; S.kickDash = true; } },
  { id: 'slidedm', n: 'SLIDE INTO DMS', s: 'THIRST TRAP INC', r: 1, stack: 1, d: 'Sliding through enemies deals 45 damage and launches them.', fx: S => { S.slideHit = true; } },
  { id: 'copium', n: 'COPIUM', s: 'DENIAL WELLNESS', r: 1, stack: 1, d: 'Below 35% HP: +40% damage and 2x kill heals.', fx: S => { S.copium = true; } },
  { id: 'hottake', n: 'HOT TAKE', s: 'SPICY OPINIONS', r: 1, stack: 2, d: 'Hits set enemies on fire (12 dmg/s for 3 s).', fx: S => { S.burn += 12; } },
  { id: 'splittest', n: 'A/B TEST', s: 'GROWTH HACKERS', r: 2, stack: 1, d: 'Every shot fires a second bullet at 50% damage.', fx: S => { S.split = true; } },
  { id: 'cancel', n: 'CANCEL CULTURE', s: 'THE TIMELINE', r: 2, stack: 1, d: 'Killing a VERIFIED enemy refills HP, armor and both mags.', fx: S => { S.cancel = true; } },
  { id: 'deadnet', n: 'DEAD INTERNET', s: 'BOTS UNION', r: 2, stack: 1, d: 'A drone buddy orbits you and shoots what you shoot.', fx: S => { S.buddy += 1; } },
  { id: 'viral', n: 'GOING VIRAL', s: 'THE ALGORITHM', r: 2, stack: 1, d: 'At S rank or higher, every hit is a crit.', fx: S => { S.viral = true; } },
  { id: 'irony', n: 'SHIELD OF IRONY', s: 'POST-POST-IRONY', r: 2, stack: 1, d: 'Overshield: 60 that regenerates after 4 s without damage.', fx: S => { S.overshield = 60; } },
];

/* ====================================================================== STYLE RANKS */
AR.RANKS = [
  { k: 'D', n: 'LURKER', mult: 1.0, col: '#8a8aa0' },
  { k: 'C', n: 'FOLLOWER', mult: 1.25, col: '#5bd6ff' },
  { k: 'B', n: 'SUBSCRIBER', mult: 1.5, col: '#39ff8a' },
  { k: 'A', n: 'SUPERFAN', mult: 2.0, col: '#ffd400' },
  { k: 'S', n: 'VIRAL', mult: 3.0, col: '#ff7a1a' },
  { k: 'SS', n: 'MAIN CHARACTER', mult: 4.0, col: '#ff2bd6' },
];
AR.RESULT_GRADES = [[0, 'LURKER'], [30000, 'FOLLOWER'], [60000, 'SUBSCRIBER'], [100000, 'SUPERFAN'], [160000, 'VIRAL'], [240000, 'MAIN CHARACTER']];

/* ====================================================================== CHAT */
AR.CHAT_USERS = ['xX_shill4life_Xx', 'grindset_gary', 'NPC_8812', 'bot_or_not', 'riyastan99', 'deleted_user', 'GigaCorpIntern', 'lurker_9000',
  'clip_farmer', 'ratio_king', 'touchgrass_pls', 'OGdevice_truther', 'mod_ShillZ', 'couch_surfer_44', 'not_a_fed', 'brb_mining',
  'serverless_steve', 'hype_dog_vendor', 'vibe_auditor', 'mom', 'buy_the_dip', 'muskfan2049', 'sponsored_bot', 'ok_boomer_2.0', 'pixel_witch'];
AR.CHAT = {
  start: ['WE ARE SO LIVE RN', 'who is this guy', 'first', 'is this scripted?', 'RIYA HI RIYA', 'new rebel just dropped', 'he looks cringe ngl'],
  kill: ['W', 'oof', 'LMAO', 'clipped', 'he got DELETED', 'unsubbed', 'ratio', 'that was rude', 'L + ratio', 'RIP bozo', 'GG', 'outplayed'],
  head: ['HEADSHOT', 'aim bot?', 'BRO HIT THE BUTTON', 'right in the content', 'clean', 'CLIP IT', 'thats a highlight'],
  multi: ['MULTI KILL', 'WTF', 'bro is cooking', 'this is not on brand', 'CHAT IS THIS REAL', 'riya pls', 'turn it off TURN IT OFF'],
  air: ['AIRSHOT', 'he is FLYING', 'parkour arc', 'gravity is optional'],
  slide: ['slide kill lmao', 'he slid in the DMs', 'disrespectful'],
  kick: ['HE KICKED HIM', 'boot to the face', 'sparta energy'],
  hurt: ['he is cooked', 'skill issue', 'DOWN BAD', 'he is getting farmed', 'big L'],
  low: ['he is one shot', 'call an ambulance', 'NOT LIKE THIS', 'heal bro', 'pray'],
  rankUp: ['chat is turning', 'ok he is kinda good', 'is riya losing?', 'NEW MAIN CHARACTER', 'subscribed', 'notifications ON'],
  rankS: ['RIYA FELL OFF', 'this stream is his now', 'REBEL ARC', 'UNSUBSCRIBE FROM RIYA', 'chat flipped', 'GOATED'],
  relay: ['the signal is dropping', 'stream lagging?', 'buffering...', 'who unplugged it', 'RIYA YOUR RELAY'],
  boss: ['RIYA IS HERE', 'queen arrived', 'she is going to cook him', 'boss music', 'ITS HAPPENING'],
  bossHurt: ['riya is losing', 'GET HER', 'this is a brand crisis', 'PR team in shambles'],
  bossDead: ['STREAM ENDED', 'RIYA GOT DEPLATFORMED', 'chat we are FREE', 'unsubscribed forever', 'what do we watch now'],
  death: ['F', 'F', 'F in chat', 'he is gone', 'L', 'back to the lobby lmao', 'run it back'],
  idle: ['is he lost', 'hello???', 'boring', 'fast forward', 'someone tell him the objective', 'lag'],
  pick: ['sponsored', 'nice pick', 'ad read time', 'he sold out lol', 'we love a brand deal'],
  elite: ['VERIFIED?? on our stream??', 'blue check spotted', 'thats a real one', 'paid for verification lmao'],
};

/* ====================================================================== VOICES (subtitled) */
AR.LINES = {
  intro: [
    ['COMMANDER', 'Cast confirmed. You are standing on Riya Vex\'s billboard. She is streaming a fake riot to make us look like monsters.'],
    ['COMMANDER', 'Every kill is content. Make it bad content for her. Hold the plaza, then cut her signal relays.'],
    ['RIYA', 'Heyyy chat! Oh my god. We have a VISITOR. Fans? Give him a warm welcome.'],
  ],
  act2: [['COMMANDER', 'Her uplink runs through three signal relays. Backstage, the garage roof, the mall mezzanine. Burn all three.'],
    ['RIYA', 'Do NOT touch my relays. Those are sponsored.']],
  relayDown: [['COMMANDER', 'Relay down. Her picture just got worse.'], ['RIYA', 'Chat, ignore the lag. That is a creative choice.'], ['COMMANDER', 'Last one is offline. She is broadcasting naked now. Brace.']],
  act3: [['RIYA', 'Okay. OKAY. Moderators? Ban him. Ban him with hammers.'], ['COMMANDER', 'GigaCorp moderators inbound. Shields up front. Hit them from the side or blow them up.']],
  boss: [['RIYA', 'You want content? I AM the content. Stay hydrated, besties.'], ['COMMANDER', 'Her ring-light drones are shielding her. Pop the drones, then dump everything into her.']],
  boss2: [['RIYA', 'Controlled riot, chat! Everybody hype! Watch the floor, babe.']],
  boss3: [['RIYA', 'You don\'t get to cancel ME. I cancel YOU. Turn the lights OFF.']],
  bossDead: [['RIYA', 'Chat... chat? Why is the viewer count... no. NO. I had a brand.'], ['COMMANDER', 'She is deplatformed. Log-off point is open in the Fan Zone. Get out before the Serverless flood it.']],
  extract: [['COMMANDER', 'Move. The log-off point will not stay open.']],
  win: [['COMMANDER', 'Clean cast. The plaza is ours tonight. Turing will notice. Good.']],
  death: [['RIYA', 'Aaand that is a wrap. Thanks for watching, besties!']],
};
