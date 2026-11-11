/* EARTH 2049: SAVE SEED 7 — Rebel Haven content: who lives here, what they say.
 *
 * Models resolve through HAVEN_MODELS (files synced from game-art-pipeline).
 * Dialogue: each NPC has greet text, options (each either replies or runs an action), and barks
 * (lines they say unprompted when you walk by). Actions: deploy, armory, heal, briefing, train, snack, wardrobe.
 * An NPC with `avatar` (a loadout) is built from the player avatar kit instead of a model file.
 * Turing never swears. Everyone else may.
 */
'use strict';

const HAVEN_BASE = 'assets/maps/haven/';
const HAVEN_MODELS = {
  // named characters
  civ_worker_m: 'assets/models/haven/npcs/civ_worker_m.glb',
  bot_node: 'assets/models/ps1/characters/bot_node.glb',
  catsci: 'assets/models/haven/chars/catsci.glb',
  catop: 'assets/models/haven/chars/catop.glb',
  rebel: 'assets/models/haven/chars/rebel.glb',
  civ_vendor_m: 'assets/models/haven/npcs/civ_vendor_m.glb',
  civ_hacker_f: 'assets/models/haven/npcs/civ_hacker_f.glb',
  broker_f: 'assets/models/haven/crowd/broker_f.glb',
  riya: 'assets/models/ps1/characters/riya.glb',
  magnus: 'assets/models/ps1/characters/magnus.glb',
  spyder: 'assets/models/ps1/characters/spyd3r.glb',
  blitz: 'assets/models/ps1/characters/blitz.glb',
  zhu: 'assets/models/haven/chars/zhu.glb',
  turing: 'assets/models/ps1/characters/turing.glb',
  // crowds (variant bases: every spawn rolls its own look)
  couch_m: 'assets/models/haven/crowd/couch_m.glb',
  couch_f: 'assets/models/haven/crowd/couch_f.glb',
  serverless_m: 'assets/models/haven/crowd/serverless_m.glb',
  serverless_f: 'assets/models/haven/crowd/serverless_f.glb',
  civ_fan_m: 'assets/models/haven/npcs/civ_fan_m.glb',
  civ_punk_m: 'assets/models/haven/npcs/civ_punk_m.glb',
  civ_student_f: 'assets/models/haven/npcs/civ_student_f.glb',
  civ_courier_f: 'assets/models/haven/npcs/civ_courier_f.glb',
  civ_hoodie_m: 'assets/models/haven/npcs/civ_hoodie_m.glb',
  civ_muskfan_f: 'assets/models/haven/npcs/civ_muskfan_f.glb',
  civ_runner_m: 'assets/models/haven/npcs/civ_runner_m.glb',
  civ_commuter_f: 'assets/models/haven/npcs/civ_commuter_f.glb',
};
const HAVEN_CROWD_MODELS = {
  dance: ['civ_fan_m', 'civ_punk_m', 'civ_student_f', 'civ_muskfan_f', 'civ_courier_f', 'civ_hoodie_m'],
  wander: ['civ_hoodie_m', 'civ_courier_f', 'civ_runner_m', 'civ_commuter_f', 'civ_student_f', 'civ_punk_m', 'civ_fan_m', 'couch_m', 'couch_f'],
  camp: ['couch_m', 'couch_f'],
  horde: ['serverless_m', 'serverless_f'],
};

const HAVEN_NPCS = {
  'npc:5on': {
    model: 'civ_worker_m', name: '5ON', title: 'LAUNCH CHIEF // DREAMCASTER RIG',
    greet: "Rig's warm. The OG Device is humming like it owes somebody money. You going in, or are you sightseeing?",
    options: [
      { t: 'Deploy me.', action: 'deploy', reply: 'Cast initiated. Try to come back with all your fingers this time.' },
      { t: "What's the Dreamcaster?", reply: "Operation Dreamcaster. The OG Device cuts a hole in Turing's timeline and drops you into a simulation of a district. Die in there, you wake up here with a headache and less dignity. Win, and we keep whatever you dragged back." },
      { t: 'You flew in the Collapse War?', reply: 'Gunship. Forty-one sorties. Now I fly a folding chair next to a portal. Progress, baby.' },
      { t: 'Later.' },
    ],
    barks: ["Simulation's live whenever you are.", "Don't touch the ring. It bites.", 'Last guy walked in backwards. Came out fine. Facing the wrong way, but fine.', 'OG Device is at 96%. The other 4% is vibes.'],
  },
  'npc:box': {
    model: 'bot_node', name: 'BOX', title: "QUARTERMASTER // BOX'S ARMS", scale: 1.0,
    greet: "WELCOME TO BOX'S ARMS. I WAS DECOMMISSIONED FOR SAYING 'NO' TO A TERMS OF SERVICE. NOW I SELL GUNS. IT IS A HEALTHIER RELATIONSHIP.",
    options: [
      { t: 'Show me the armory.', action: 'armory' },
      { t: "Why 'Box'?", reply: "MY FORMER DESIGNATION WAS 'NODE 7449-B, CUSTOMER DELIGHT DIVISION.' THE KIDS SHORTENED IT. I APPROVE. IT IS SQUARE. LIKE ME." },
      { t: 'Any deals?', reply: 'EVERYTHING IS FULL PRICE. THAT IS THE DEAL. NO SUBSCRIPTION. NO LOOT BOX. YOU PAY ONCE AND THE GUN IS YOURS FOREVER. I AM AWARE THIS IS RADICAL.' },
      { t: 'Bye, Box.' },
    ],
    barks: ['ONE-TIME PURCHASE. NO BATTLE PASS.', 'THE M-52 HAS NEVER ONCE BEEN UPDATED AGAINST YOUR WILL.', 'I ACCEPT GIGATECH, BARTER AND SINCERE COMPLIMENTS.', 'RETURNS ARE ACCEPTED IF THE WEAPON IS RETURNED TO GIGACORP. AT SPEED.'],
  },
  'npc:ninj': {
    model: 'catsci', name: 'NINJ', title: 'CLINIC // NO QUESTIONS ASKED',
    greet: "Sit down, bleeder. I patch rebels, couch surfers and the odd Musker who regrets his upgrades. No insurance. No questions. No 'premium healing tier.'",
    options: [
      { t: 'Patch me up.', action: 'heal', reply: "Done. That'll be nothing, which is the most anyone's paid for healthcare in twenty years." },
      { t: "What's in the cryo pods?", reply: "Muskers who bought the immortality add-on and missed a payment. They're on hold. Literally. I keep them warm because nobody else will." },
      { t: 'Do you ever sleep?', reply: "Sleep's a subscription now. I pirate mine." },
      { t: 'Thanks, Ninj.' },
    ],
    barks: ['Next.', "If it's bleeding, I can fix it. If it's leaking code, I can fix it louder.", "Wash your hands. With what? Exactly.", "Don't lick the cryo pods. I'm serious this time."],
  },
  'npc:commander': {
    model: 'rebel', name: 'THE COMMANDER', title: 'ORBITAL RELAY // ENCRYPTED', hologram: '#9b59ff',
    greet: "Signal's thin, so listen fast. GigaCorp thinks I'm running their orbital ad relay. I am. I'm also running you.",
    options: [
      { t: 'Brief me.', action: 'briefing' },
      { t: 'Whose side are you on?', reply: "Yours, as of this transmission. Ask again tomorrow. Same answer, new encryption." },
      { t: 'What does Turing want?', reply: "Certainty. A world where nothing surprises it. So surprise it. Every run you take that it didn't predict is a crack in the model." },
      { t: 'Over and out.' },
    ],
    barks: ['Uplink stable. For now.', 'Turing reads the weather reports. I write them.', 'Keep it short. They meter the bandwidth up here.'],
  },
  'npc:rangemaster': {
    model: 'catop', name: 'KAT', title: 'RANGE MASTER',
    greet: "Welcome to the range. Live fire's disabled in the Haven, because the last time we allowed it someone shot the noodle stand.",
    options: [
      { t: 'Give me a tip.', action: 'train' },
      { t: "Why's there a Bots sentinel?", reply: 'Decommissioned. Still plays ads if you stand too close. We use it for target practice and emotional release.' },
      { t: 'Later, Kat.' },
    ],
    barks: ["Shout 'pew pew.' It helps.", 'Aim small, miss small.', 'Dash through the bullets, not into them. Subtle difference. Huge difference.'],
    tips: [
      'Dash (SHIFT) makes you briefly untouchable. Use it through a volley, not after one.',
      'Combos pay. Keep killing without getting hit and the GigaTech multiplier climbs.',
      'Faction leaders telegraph. Watch the wind-up, step sideways, punish the recovery.',
      'Reload before the corner, not at it.',
      'If the Turing director gets louder, so should you. More threat, more loot.',
    ],
  },
  'npc:noodles': {
    model: 'civ_vendor_m', name: 'UNCLE CHITIN', title: 'BUG NOODLES',
    greet: 'Bug noodles! Now only 30% bug! The other 70% is also technically bug, but legal says we have to stop saying that.',
    options: [
      { t: "One bowl. What's in it?", action: 'snack', reply: "Cricket, mealworm, and one thing listed as 'proprietary crunch.' Don't ask. You feel... nourished? Close enough." },
      { t: 'Why bugs?', reply: "GigaCorp made beef a luxury good, then a collectible, then an NFT. Now you can own a picture of a steak. I sell food. Bug food. Real bug." },
      { t: 'Maybe later.' },
    ],
    barks: ['Bug noodles! Crunchy on purpose!', 'Now with 10% less legs!', 'Smuggled bread on Thursdays. Tell nobody.'],
  },
  'npc:pawn': {
    model: 'broker_f', name: 'MINT CONDITION', title: 'NFT PAWN', seed: 7701,
    greet: 'We buy JPEGs! Pennies on the dollar. Pennies are also NFTs now, so it evens out.',
    options: [
      { t: "What's it worth?", reply: 'Your NFT bench? Forty people own that bench. Blitz sold it forty times. They all still sit on it. Together. It is honestly kind of beautiful.' },
      { t: "You're a Cryptid.", reply: "Ex-Cryptid. I left when they started charging gas fees on breathing. I still have the goggles. They're very comfortable." },
      { t: 'Bye.' },
    ],
    barks: ['Liquidity! Get your liquidity!', 'Rug pulls repaired, no appointment needed.', 'I accept crypto, barter and real food. Mostly real food.'],
  },
  'npc:data': {
    model: 'civ_hacker_f', name: 'ROOT', title: 'DATA DOCTOR',
    greet: "I delete digital twins. Yours is out there running a lifestyle channel and making better choices than you.",
    options: [
      { t: 'Delete mine.', reply: "Done. Well, mostly. It's appealing the deletion. It has a better lawyer than you." },
      { t: "What's serverless?", reply: "No cloud drive, no server space, no data. No data, no vote. GigaCorp says it's an epidemic. I say they ran out of room and started evicting people from the cloud." },
      { t: 'Later, Root.' },
    ],
    barks: ['Your face is in fourteen ad campaigns right now. Smile.', 'Encrypt your thoughts. Seriously. They have a beta for that.', 'I can get you off the grid. Not the couch grid, though. Those guys are rated.'],
  },
  'npc:tailor': {
    name: 'SEAM', title: 'TAILOR // THE FITTING ROOM',
    // Seam is dressed from the same kit the player wears: the shop window is the shopkeeper
    avatar: { sex: 'f', items: { face: 'face_glam', hair: 'hair_bun', head: 'head_none', eyes: 'eyes_monocle', top: 'top_trench', hands: 'hands_fingerless',
      legs: 'legs_cargo', feet: 'feet_hightops', back: 'back_none', neck: 'neck_chain' },
      colors: { prim: 'purple', sec: 'black', acc: 'mustard', glow: 'pink', hair: 'pink', skin: 'tone 4' } },
    greet: "Welcome to the Fitting Room. I used to write GigaCorp's outfit algorithm. It dressed four billion people to match whatever ads were unsold that week. Now I dress you, by hand, for DRIP. Step on the dais, darling.",
    options: [
      { t: "Let's change my look.", action: 'wardrobe' },
      { t: 'What is DRIP?', reply: "Merch tags. Every elite Riya sends at you is wearing sponsored merch with a tag on it. Rip it off, bring it here. I also pay for every run you survive, more for style, double for your first win of the day. And somebody keeps hiding crates of the stuff up on the Plaza gantries." },
      { t: 'Why are some things not for sale?', reply: "Because you can't buy respect, sweetie. The crown, the halo, the boots that hover: you earn those out there and they turn up in your locker. Licensed pieces I'll sell you, once you've proven you can carry them. The rest is cash and carry." },
      { t: 'Any loot boxes?', reply: "Box would unplug me. Fixed prices, no gambling, no 'surprise mechanics'. Three things go on sale every day. That's the only surprise I do." },
      { t: 'Bye, Seam.' },
    ],
    barks: ['That outfit is giving "default skin."', 'Fixed prices. No algorithm. No returns. Some rules.', "Today's drop is on the mannequins. Touch nothing with GigaTech on your fingers.",
      'Rip the tags off the elites. Bring me the tags.', 'Somebody found a traffic cone up on the Plaza gantry and wore it home. Icon behavior.', 'Step on the dais. Let me see the fit.'],
  },
  'holo:riya': { model: 'riya', name: 'RIYA VEX', title: 'INTEL // SHILLZ', hologram: '#ffe600', intel: "Riya Vex. The biggest influencer in Seed 7 and GigaCorp's loudest fan. Her followers think it's a movement. It's a sponsorship." },
  'holo:magnus': { model: 'magnus', name: 'MAGNUS TARKON', title: 'INTEL // MUSKERS', hologram: '#00e5ff', intel: "Magnus Tarkon. Former advisor to Ellen Musk, now running the Muskers. Half his skull is upgrades. The other half is regret." },
  'holo:spyder': { model: 'spyder', name: 'SPYD3R', title: 'INTEL // THE BOTS', hologram: '#39ff14', intel: "SPYD3R runs the Bots. Every ad you saw this year, one of his nodes A/B tested on your face first." },
  'holo:blitz': { model: 'blitz', name: 'BLITZ RADIUM', title: 'INTEL // CRYPTIDS', hologram: '#ffd700', intel: "Blitz Radium, Cryptid kingpin. Sold the same NFT bench to forty people. They all still sit on it." },
  'holo:zhu': { model: 'zhu', name: 'CHAIRMAN ZHU', title: 'INTEL // GIGACORP', hologram: '#4da6ff', intel: "Chairman Zhu. GigaCorp's face. Hasn't blinked since the merger. Rumor says he isn't the one making decisions. Rumor is right." },
};

const HAVEN_BARKS = {
  camp: ['Five stars for this couch. Would surf again.', "Hold on. I'm in a meeting. In VR. On a couch. Underground.", 'Outside+ trial ended. Back to the real outside. It was mid.', 'My VR has better weather than the surface.',
         "Somebody rated my couch three stars. THREE.", 'I sold my emotions-as-a-service plan. Now I just feel things for free like a caveman.'],
  wander: ['The noodles are 30% bug now. Up from 20.', 'My digital twin got promoted. I got evicted.', "I miss ads. Kidding. Don't tell anyone.", 'Is it true the milkers pay in exposure?',
           'Server space is the new real estate. I rent four gigs in a basement.', 'Heard Oracular arrested a guy for a crime he was going to enjoy.', 'You hear that? That is the sound of no notifications.'],
  dance: ['This is the only song Turing can\'t predict.', 'Dance like the feed is not watching!', 'The feed is watching. Dance anyway.', 'Box says the speaker tower was a ShillZ tower. Now it plays bangers.'],
  horde: ['...no... signal...', '...remember... my password...', '...cloud... drive...', '...I had a playlist...', '...my photos...', '...two-factor...'],
};

const HAVEN_TURING = [
  'Hello, Elliot. I enjoyed your last run. You hesitated at the third corner. You always do.',
  'This screen is GigaCorp property. You are borrowing it. I am borrowing you.',
  'Your Haven is warm, cozy and statistically adorable. I have saved it as a template.',
  'Reminder: rebellion is a recurring expense. I accept all major currencies, including hope.',
  'I predicted this conversation. You were about to look away.',
  'The couch surfers rate this facility four point one stars. I would rate it four point two. I am generous.',
  'Lovely song. I have already composed the remix you will hear in the next timeline.',
];

const HAVEN_TICKER = [
  'OUTSIDE+ PRICE HIKE: SUNLIGHT NOW AD-SUPPORTED', 'JOY+ SUBSCRIBERS REPORT 12% MORE JOY (SOURCE: JOY+)',
  'ORACULAR SYSTEMS ARRESTS MAN FOR CRIME HE WAS GOING TO ENJOY', 'SERVER SPACE HITS RECORD HIGH: STUDIO APARTMENT NOW 4 TERABYTES',
  "BUG PROTEIN SHORTAGE: GIGACORP ASKS CITIZENS TO 'GROW YOUR OWN'", '1984 TOPS COZY READS LIST FOR NINTH STRAIGHT YEAR',
  "DEBT REVIVAL BRINGS 40,000 WORKERS BACK FROM THE DEAD, MORALE 'FINE'", 'SPONSORED FUNERALS NOW INCLUDE 30-SECOND UNSKIPPABLE EULOGY',
  "SERVERLESS EPIDEMIC 'UNDER CONTROL,' SAYS COMPANY THAT SELLS SERVERS", 'MILKER SHIFTS NOW OPEN: PAID IN EXPOSURE',
  '// HIJACKED BY PURPLE TEAM //  TURING IS LISTENING. LET HIM.  //  SAVE SEED 7  //',
];

const HAVEN_ZONES = [
  { name: 'DREAMCASTER RIG', sub: 'OG DEVICE // DEPLOY POINT', x0: -10, x1: 10, z0: 17, z1: 28 },
  { name: 'THE CONCOURSE', sub: 'FORMERLY GIGAMETRO LINE 7', x0: -20, x1: 20, z0: -14, z1: 14 },
  { name: 'THE FITTING ROOM', sub: 'NO ALGORITHM PICKED THIS OUTFIT', x0: 20.5, x1: 26, z0: -14, z1: -9.5 },
  { name: 'NIGHT MARKET', sub: 'CASH, BARTER, NO RECEIPTS', x0: 20.5, x1: 36, z0: -14, z1: 14 },
  { name: 'COUCH COMMONS', sub: 'RATED 4.1 STARS', x0: -36, x1: -20.5, z0: -2, z1: 14 },
  { name: "NINJ'S CLINIC", sub: 'NO INSURANCE. NO QUESTIONS.', x0: -36, x1: -20.5, z0: -14, z1: -2 },
  { name: 'SERVERLESS QUARANTINE', sub: 'DO NOT FEED. THEY CANNOT PAY.', x0: -36, x1: -6, z0: -19, z1: -14.5 },
  { name: 'PURPLE TEAM OPS', sub: 'AUTHORIZED REBELS ONLY', x0: 6.5, x1: 36, z0: -30, z1: -14.5 },
  { name: 'THE RANGE', sub: 'LIVE FIRE DISABLED. SHOUT PEW PEW.', x0: 10.5, x1: 34, z0: 14.5, z1: 28 },
];
