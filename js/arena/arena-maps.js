/* EARTH 2049: SAVE SEED 7 — ARENA maps. Every district in the city grid is a map in the field.
 *
 * A map entry names its level files (built by game-art-pipeline projects/earth2049/maps/<id>), its words (banners,
 * objectives, voice lines, the jumbotron), which spawn areas each beat of the mission draws from, and whether it is a
 * faction HEADQUARTERS. The rule that keeps headquarters special:
 *
 *   DISTRICT   a street that a faction happens to hold. The mission runs Act I to Act III and ends at the log-off.
 *              Who holds it today decides who you fight (AR.ROSTERS): the city grid reshuffles owners every loop.
 *   HQ         a faction's seat. Never changes hands, has its own set pieces, and its leader waits at the end.
 *              An HQ whose leader has no fight yet sets noLeader: true and ends at the log-off until it does.
 *
 * AR.pickMap(op, id) chooses the map for a run: an explicit id, else the field op's district, else the plaza.
 */
'use strict';

AR.FAC_NAMES = { shillz: 'ShillZ', muskers: 'the Muskers', cryptids: 'the Cryptids', bots: 'the Bots', gigacorp: 'GigaCorp' };

/* Who you fight in a district depends on who holds it. Every faction keeps the same six behaviours (rusher, ranged,
 * charger, flyer, tank, the Serverless swarm), wearing its own models. Only the looks change, never the tuning, so
 * a district's difficulty does not depend on the board. */
AR.ROSTERS = {
  shillz: {},
  muskers: { shill: { models: ['runner_m', 'runner_f'], type: 'runner' }, streamer: { models: ['lancer_m', 'lancer_f'], type: 'lancer' } },
  cryptids: { shill: { models: ['broker_m', 'broker_f'], type: 'broker' }, streamer: { models: ['broker_m', 'broker_f'], type: 'broker' } },
  bots: { shill: { models: ['node_x'], type: 'node' }, streamer: { models: ['sentinel_x'], type: 'sentinel' } },
  gigacorp: { shill: { models: ['trooper_x'], type: 'trooper' }, streamer: { models: ['trooper_x'], type: 'trooper' } },
};

AR.MAPS = {
  /* ShillZ Central's seat: Riya Vex's stage. The first map, and the only HQ in the field so far. */
  plaza: {
    id: 'plaza', dist: 'shillzC', hq: true, owner: 'shillz', dir: 'assets/maps/plaza/', file: 'plaza',
    load: 'CASTING INTO SHILLZ CENTRAL…', place: 'ENGAGEMENT PLAZA', region: 'SHILLZ CENTRAL', title: 'OPERATION: UNSUBSCRIBE',
    act1: ['ACT I — THE PREGAME', 'HOLD THE PLAZA'], act1Obj: 'HOLD THE PLAZA',
    act2: ['ACT II — SIGNAL JAM', 'BURN HER THREE RELAYS'], act2Obj: 'BURN THE RELAYS', relayWord: 'SIGNAL RELAY',
    act3: ['ACT III — HYPE STORM', 'SURVIVE 75 SECONDS'], act3Obj: 'HYPE STORM',
    waveSubs: null,
    head: { act1: ['WE HAVE A VISITOR', 'FANS: WELCOME HIM'], act2: ['STREAM QUALITY: 4K', 'SPONSORED BY SIGNAL RELAYS'], act3: ['HYPE STORM', 'MODERATORS DEPLOYED'] },
    jumbo: { live: 'RIYA VEX // CONTROLLED RIOT', sub: 'LIKE // SHARE // COMPLY', dead: ['STREAM ENDED', 'RIYA VEX HAS BEEN DEPLATFORMED'], deadOn: 'boss' },
    chatTitle: 'RIYA VEX // CONTROLLED RIOT',
    areas: {
      summon: ['plaza', 'backstage', 'gantry', 'fan'], mod1: ['plaza', 'backstage'], mod2: ['plaza', 'garage'],
      flood: ['fan', 'backstage', 'plaza'], extract: ['plaza', 'fan', 'backstage'], trickle: ['fan', 'plaza'],
    },
    lines: null, chat: null, lostTitle: 'STREAM ENDED', lostSub: 'RIYA THANKS YOU FOR WATCHING',
    winResult: 'RIYA DEPLATFORMED // EXTRACTED', cone: [43, 4.6, -39],
    sky: ['#05030c', '#1a0c2a', '#4a1838', '#120a18'], rain: 900, fogDensity: 0.016,
    dyn: ['stage_key', 'stage_w', 'stage_e', 'logoff'],
  },

  /* Downtown: Fifth & Feed. The first district off the Purple Cell's front line. Not a seat, just a street that
   * films itself. Three tiers: the canyon street, the roofs / monorail / gantry ring, the subway concourse. */
  downtown: {
    id: 'downtown', dist: 'downtown', hq: false, owner: 'shillz', dir: 'assets/maps/downtown/', file: 'downtown',
    load: 'CASTING INTO DOWNTOWN…', place: 'FIFTH & FEED', region: 'DOWNTOWN', title: 'DISTRICT OP: DOWNTOWN',
    act1: ['ACT I — RUSH HOUR', 'CLEAR FIFTH & FEED'], act1Obj: 'CLEAR THE STREET',
    act2: ['ACT II — BLIND THE FEED', 'BURN THREE CAMERA UPLINKS'], act2Obj: 'BLIND THE FEED', relayWord: 'CAM UPLINK',
    act3: ['ACT III — LOCKDOWN', 'SURVIVE 75 SECONDS'], act3Obj: 'LOCKDOWN',
    waveSubs: ['THE SERVERLESS ARE ONLINE', 'SHOOTERS ON THE ROOFS', 'THE BIG ONE IS ON FIFTH'],
    head: { act1: ['CITIZEN NOT SMILING', 'PLEASE SMILE FOR CAM 04'], act2: ['COVERAGE: 100%', 'EVERY BILLBOARD HAS A CAMERA'], act3: ['LOCKDOWN', 'COMPLIANCE DISPATCHED'] },
    jumbo: { live: 'DOWNTOWN CIVIC FEED // CAM 04', sub: 'SMILE // YOU ARE ON FEED', dead: ['NO SIGNAL', 'DOWNTOWN IS OFF THE GRID'], deadOn: 'relays' },
    chatTitle: 'DOWNTOWN CIVIC FEED // CAM 04',
    areas: {
      summon: ['scramble', 'avenue_n', 'avenue_s', 'camp', 'checkpoint'], mod1: ['avenue_n', 'checkpoint'], mod2: ['avenue_s', 'scramble'],
      flood: ['camp', 'checkpoint', 'avenue_n', 'avenue_s'], extract: ['avenue_s', 'concourse', 'scramble'], trickle: ['concourse', 'avenue_s'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Cast confirmed. Downtown, Fifth and Feed. Every billboard down there has a camera in it.'],
        ['COMMANDER', '{OWNER} hold this block. Clear the street, then blind their cameras. Ground nobody can see is ground we can take.'],
        ['THE FEED', 'GOOD EVENING, CITIZEN. YOU ARE NOT SMILING. THIS HAS BEEN NOTED.'],
      ],
      act2: [['COMMANDER', 'Three camera uplinks feed that tower. The billboard on the north gantry, the stalled monorail, the subway concourse. Burn them.'],
        ['THE FEED', 'TAMPERING WITH CIVIC INFRASTRUCTURE IS A CONTENT VIOLATION. PLEASE HOLD STILL.']],
      relayDown: [['COMMANDER', 'Uplink down. One less eye.'], ['THE FEED', 'COVERAGE AT SIXTY PERCENT. REMAIN CALM. REMAIN VISIBLE.'],
        ['COMMANDER', 'That was the last one. Downtown is blind. Now they send everything.']],
      act3: [['THE FEED', 'COVERAGE LOST. DISPATCHING MODERATION TO YOUR LOCATION. ALL OF IT.'],
        ['COMMANDER', 'Moderators on the avenue. Shields up front. Flank them, or drop on them from the roofs.']],
      extract: [['COMMANDER', 'Lockdown is breaking. The cell\'s door is open in the subway concourse. Get underground.']],
      win: [['COMMANDER', 'You\'re out. Downtown went dark and nobody filmed it. That block is ours to take.']],
      death: [['THE FEED', 'CITIZEN DOWN. THANK YOU FOR YOUR ENGAGEMENT.']],
    },
    chat: {
      start: ['cam 04 is LIVE', 'who is this on fifth', 'is that a rebel?', 'report him lol', 'he is not smiling', 'first', 'the eye sees all fr'],
      relay: ['cam down??', 'my feed is static', 'who blinded the billboard', 'coverage dropping', 'i cant see fifth anymore', 'THE TOWER IS FLICKERING'],
      idle: ['is he hiding from the cameras', 'hello???', 'boring', 'cam 07 has nothing', 'someone check the subway'],
    },
    lostTitle: 'CITIZEN DOWN', lostSub: 'THE FEED THANKS YOU FOR YOUR ENGAGEMENT', winResult: 'DOWNTOWN BLINDED // EXTRACTED',
    cone: [-24.5, 6.5, 44.5],
    sky: ['#03050c', '#0c1424', '#20304a', '#0a0e18'], rain: 1300, fogDensity: 0.0145,
    dyn: ['tower_key', 'camp_fire', 'checkpoint', 'lobby', 'tube', 'logoff'],
  },
};

/** The map for a run: an explicit id wins, then the field op's district (if it has a map), then the plaza.
 *  A leader fight always plays the leader's HQ. */
AR.pickMap = (op, id) => {
  if (id && AR.MAPS[id]) return AR.MAPS[id];
  if (op?.kind !== 'leader' && op?.dist) {
    const m = Object.values(AR.MAPS).find(x => x.dist === op.dist);
    if (m) return m;
  }
  return AR.MAPS.plaza;
};

/** Fill {OWNER} in a map's lines with the faction that holds the district today. */
AR.mapLines = (map, owner) => {
  const name = AR.FAC_NAMES[owner] || AR.FAC_NAMES[map.owner] || 'They';
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const out = {};
  for (const [k, v] of Object.entries({ ...AR.LINES, ...(map.lines || {}) })) out[k] = v.map(([w, t]) => [w, t.replace(/\{OWNER\}/g, cap)]);
  return out;
};
