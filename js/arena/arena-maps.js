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
  /* Industrial Zone: the Yield Works. GigaCorp's plant and the city's grid. Low, wide and hot where Downtown is tall
   * and cold: the pod hall, the rail yard under the control room, the turbine deck, the runoff culvert. */
  industrial: {
    id: 'industrial', dist: 'industrial', hq: false, owner: 'gigacorp', dir: 'assets/maps/industrial/', file: 'industrial',
    load: 'CASTING INTO THE INDUSTRIAL ZONE…', place: 'THE YIELD WORKS', region: 'INDUSTRIAL ZONE', title: 'DISTRICT OP: INDUSTRIAL ZONE',
    act1: ['ACT I — SHIFT CHANGE', 'CLEAR THE YARD'], act1Obj: 'CLEAR THE YARD',
    act2: ['ACT II — BLACKOUT', 'PULL THREE BREAKERS'], act2Obj: 'PULL THE BREAKERS', relayWord: 'BREAKER',
    act3: ['ACT III — BACKUP POWER', 'SURVIVE 75 SECONDS'], act3Obj: 'BACKUP POWER',
    waveSubs: ['THE NIGHT SHIFT CLOCKS IN', 'SHOOTERS ON THE TRAIN', 'SOMETHING BIG IN THE POD HALL'],
    head: { act1: ['YIELD: 104%', 'SHIFT 3 // 0 INJURIES'], act2: ['GRID LOAD: NOMINAL', 'DO NOT TOUCH THE BREAKERS'], act3: ['BACKUP POWER', 'CONTAINMENT DISPATCHED'] },
    jumbo: { live: 'GIGACORP YIELD WORKS // SHIFT 3', sub: 'LIE STILL // GET PAID', dead: ['BLACKOUT', 'THE PODS ARE ON BATTERY'], deadOn: 'relays' },
    chatTitle: 'GIGACORP YIELD WORKS // FLOOR CAM',
    areas: {
      summon: ['yard', 'hall', 'turbines', 'lot'], mod1: ['yard', 'substation'], mod2: ['hall', 'yard'],
      flood: ['culvert', 'lot', 'south', 'hall'], extract: ['culvert', 'lot', 'south', 'yard'], trickle: ['culvert', 'south'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Industrial Zone. GigaCorp\'s plant, the city\'s grid. That hum is the Bio-Yield Pods.'],
        ['COMMANDER', '{OWNER} run the floor tonight. Clear the yard, then pull their breakers. Take the power, take the district.'],
        ['PLANT PA', 'ATTENTION SHIFT 3. AN UNSCHEDULED VISITOR IS ON THE FLOOR. PLEASE DO NOT LET IT AFFECT YOUR YIELD.'],
      ],
      act2: [['COMMANDER', 'Three breakers feed the plant. The bridge in the pod hall, the control room over the yard, the substation. Pull them.'],
        ['PLANT PA', 'REMINDER: THE PODS HAVE BACKUP BATTERIES. PROBABLY.']],
      relayDown: [['COMMANDER', 'Breaker out. Half the yard just went dark.'], ['PLANT PA', 'GRID LOAD IRREGULAR. CONTRACTORS, PLEASE CONTINUE LYING STILL.'],
        ['COMMANDER', 'That\'s the last one. The turbines are spinning for nobody. Here they come.']],
      act3: [['PLANT PA', 'BACKUP POWER ENGAGED. CONTAINMENT TO THE YARD. ALL OF IT.'],
        ['COMMANDER', 'Moderators through the yard. Use the train cars and flank the shields.']],
      extract: [['COMMANDER', 'The power\'s ours. The storm drain at the west end of the culvert runs to the cell. Get down there.']],
      win: [['COMMANDER', 'You\'re out. The plant ran on batteries for ten minutes and nobody in the pods woke up. Next time we bring them with us.']],
      death: [['PLANT PA', 'WORKPLACE INCIDENT LOGGED. INJURY COUNTER RESET. THANK YOU FOR YOUR YIELD.']],
    },
    chat: {
      start: ['shift 3 cam is live', 'who let him on the floor', 'is that a contractor?', 'my aunt is in pod 212', 'yield going down??', 'first'],
      relay: ['lights flickering on cam 2', 'the pods are beeping', 'BLACKOUT', 'who pulled the breaker', 'is my aunt ok', 'the turbines stopped??'],
      idle: ['is he hiding in the pods', 'boring', 'check the culvert', 'hello???', 'shift 3 is so slow'],
    },
    lostTitle: 'WORKPLACE INCIDENT', lostSub: 'THANK YOU FOR YOUR YIELD', winResult: 'BLACKOUT // EXTRACTED',
    cone: [44, 2.2, -40],
    sky: ['#0a0604', '#1e120a', '#4a2a14', '#120a06'], rain: 500, fogDensity: 0.0135,
    dyn: ['hall_key', 'control', 'turbines', 'arc', 'logoff'],
  },
  /* Tech District: the Parts Pit. An open salvage pit stepped down like a mine, where the Muskers' discards end up.
   * UV violet and amber; the way down is a spiral; the white spires of Muskers Territory look on from the north. */
  tech: {
    id: 'tech', dist: 'tech', hq: false, owner: 'muskers', dir: 'assets/maps/tech/', file: 'tech',
    load: 'CASTING INTO THE TECH DISTRICT…', place: 'THE PARTS PIT', region: 'TECH DISTRICT', title: 'DISTRICT OP: TECH DISTRICT',
    act1: ['ACT I — SCRAP RUN', 'CLEAR THE PIT'], act1Obj: 'CLEAR THE PIT',
    act2: ['ACT II — FACTORY RESET', 'WIPE THREE DATA SIPHONS'], act2Obj: 'FACTORY RESET', relayWord: 'SIPHON',
    act3: ['ACT III — RECALL NOTICE', 'SURVIVE 75 SECONDS'], act3Obj: 'RECALL NOTICE',
    waveSubs: ['SCAVENGERS ON THE TERRACES', 'SHOOTERS ON THE RIM', 'SOMETHING HEAVY ON THE HAUL ROAD'],
    head: { act1: ['UPGRADE OR DIE', 'TODAY ONLY: NEW KNEES'], act2: ['DATA PRIVACY: OFF', 'YOUR DATA IS AN UPGRADE'], act3: ['RECALL NOTICE', 'ALL UNITS RETURN TO SENDER'] },
    jumbo: { live: 'MUSKER SERMON // LIVE FROM THE CLINIC', sub: 'THE FLESH IS THE FINAL BUG', dead: ['FACTORY RESET', 'PLEASE REINSTALL YOUR BODY'], deadOn: 'relays' },
    chatTitle: 'MUSKER SERMON // CLINIC CAM',
    areas: {
      summon: ['t1', 't2', 'rim_e', 'rim_w'], mod1: ['rim_s', 't1'], mod2: ['t2', 'rim_n'],
      flood: ['rim_n', 'rim_e', 'rim_w', 't1'], extract: ['floor', 't2', 't1'], trickle: ['t2', 't1'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Tech District. The Parts Pit. Everything the Muskers cut off themselves ends up down there.'],
        ['COMMANDER', '{OWNER} hold the pit tonight. Clear it, then wipe their data siphons. The district\'s research runs through them.'],
        ['THE SERMON', 'BROTHER. SISTER. YOU ARE STILL MOSTLY MEAT. THE CLINIC IS OPEN. THE FIRST ARM IS FREE.'],
      ],
      act2: [['COMMANDER', 'Three siphons. The upgrade clinic on the north rim, the crane boom over the pit, the rinse vats on the floor. Wipe them.'],
        ['THE SERMON', 'DATA IS NOT STOLEN. DATA IS ASCENDED.']],
      relayDown: [['COMMANDER', 'Siphon wiped. Their research just lost a week.'], ['THE SERMON', 'A SMALL REGRESSION. WE DO NOT FEAR REGRESSION. WE PATCH IT.'],
        ['COMMANDER', 'That\'s all three. The pit\'s blind. They\'re recalling everything they\'ve got.']],
      act3: [['THE SERMON', 'RECALL NOTICE. ALL UNITS RETURN TO THE PIT. BRING THE MEAT.'],
        ['COMMANDER', 'Heavies on the haul road. Use the terraces, make them climb to you.']],
      extract: [['COMMANDER', 'Recall\'s broken. The drain by the rinse vats on the floor runs to the cell. Go down.']],
      win: [['COMMANDER', 'You\'re out. The pit\'s quiet and the sermon\'s stuck on a loading bar. Take what you can carry next time.']],
      death: [['THE SERMON', 'ANOTHER BODY RETURNED FOR PARTS. YOUR WARRANTY IS VOID.']],
    },
    chat: {
      start: ['sermon is live', 'who is that in the pit', 'is he even upgraded', 'buying left hands', 'magnus would never', 'first'],
      relay: ['the sermon is lagging', 'research DOWN', 'my upgrade download stopped??', 'factory reset lol', 'who touched the siphon'],
      idle: ['he is hiding in the limbs', 'boring', 'check the vats', 'hello???', 'the crane is right there'],
    },
    lostTitle: 'RETURNED FOR PARTS', lostSub: 'YOUR WARRANTY IS VOID', winResult: 'FACTORY RESET // EXTRACTED',
    cone: [38, 0, 38],
    sky: ['#06040e', '#140c2a', '#2c1a40', '#0c0814'], rain: 300, fogDensity: 0.012,
    dyn: ['crane', 'clinic', 'logoff'],
  },
  /* Harbor Area: Pier Zero. The Cryptids' smuggling lanes: piers into black water under teal fog and gold lamps, an
   * NFT container yard, a cargo ship nobody unloads, and the debtors' mine under the quay. */
  harbor: {
    id: 'harbor', dist: 'harbor', hq: false, owner: 'cryptids', dir: 'assets/maps/harbor/', file: 'harbor',
    load: 'CASTING INTO THE HARBOR…', place: 'PIER ZERO', region: 'HARBOR AREA', title: 'DISTRICT OP: HARBOR AREA',
    act1: ['ACT I — LOW TIDE', 'CLEAR THE PIERS'], act1Obj: 'CLEAR THE PIERS',
    act2: ['ACT II — BURN THE LEDGER', 'WIPE THREE LEDGER NODES'], act2Obj: 'BURN THE LEDGER', relayWord: 'LEDGER NODE',
    act3: ['ACT III — MARGIN CALL', 'SURVIVE 75 SECONDS'], act3Obj: 'MARGIN CALL',
    waveSubs: ['SMUGGLERS OFF THE BOATS', 'SHOOTERS ON THE SHIP', 'SOMETHING HEAVY ON THE QUAY'],
    head: { act1: ['$COOM +412%', 'NOTHING DECLARED'], act2: ['LEDGER: IMMUTABLE', 'PROBABLY'], act3: ['MARGIN CALL', 'ALL POSITIONS LIQUIDATED'] },
    jumbo: { live: 'BLOCKEDCHAIN MARKET // PIER ZERO', sub: 'VALUE IS BELIEF', dead: ['LEDGER NOT FOUND', 'ALL DEBTS: UNKNOWN'], deadOn: 'relays' },
    chatTitle: 'BLOCKEDCHAIN MARKET // PIER CAM',
    areas: {
      summon: ['quay', 'pier_m', 'pier_w', 'pier_e', 'water'], mod1: ['quay', 'pier_m'], mod2: ['quay', 'pier_e'],
      flood: ['water', 'pier_w', 'pier_e', 'quay'], extract: ['mine', 'quay'], trickle: ['mine', 'quay'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Harbor Area. Pier Zero. Nothing that comes through here gets declared, including the people.'],
        ['COMMANDER', '{OWNER} run the docks. Clear the piers, then burn their ledger. Every debt in the district is written in it.'],
        ['THE MARKET', 'WELCOME, TRADER. YOUR WALLET IS EMPTY. YOUR FUTURE EARNINGS ARE NOT. SHALL WE BEGIN?'],
      ],
      act2: [['COMMANDER', 'Three ledger nodes. The customs house on the quay, the bridge of that ship, and down in the debtors\' mine. Burn them.'],
        ['THE MARKET', 'THE LEDGER IS IMMUTABLE. PLEASE STOP SHOOTING THE IMMUTABLE LEDGER.']],
      relayDown: [['COMMANDER', 'Node down. Somebody down there just stopped owing.'], ['THE MARKET', 'MINOR DESYNC. NO DEBT HAS BEEN LOST. DEBT CANNOT BE LOST.'],
        ['COMMANDER', 'That\'s the ledger. Nobody here owes anything to anyone. They\'ll come for that.']],
      act3: [['THE MARKET', 'MARGIN CALL. ALL COLLATERAL TO THE QUAY. THAT INCLUDES YOU.'],
        ['COMMANDER', 'Heavies on the quay. Use the containers, or take the water and come up behind them.']],
      extract: [['COMMANDER', 'Get down the shaft. The debtors\' mine runs east to the cell. Bring whoever wants to come.']],
      win: [['COMMANDER', 'You\'re out. The mine\'s debt boards are blank. Some of them walked out behind you.']],
      death: [['THE MARKET', 'POSITION LIQUIDATED. YOUR ACCOUNT WILL RESUME. TIME SPENT REVIVED IS BILLED.']],
    },
    chat: {
      start: ['pier cam live', 'who is that on the pier', 'is he declared?', 'buying $COOM', 'he looks like a rug pull', 'first'],
      relay: ['LEDGER DESYNC', 'my wallet says zero??', 'is my debt gone', 'who burned the ledger', 'buy the dip', 'SELL SELL SELL'],
      idle: ['he is hiding in the water', 'boring', 'check the mine', 'hello???', 'the ship is right there'],
    },
    lostTitle: 'POSITION LIQUIDATED', lostSub: 'YOUR ACCOUNT WILL RESUME', winResult: 'LEDGER BURNED // EXTRACTED',
    cone: [42, 0, -40],
    sky: ['#020608', '#06161a', '#0c2a2c', '#030a0c'], rain: 700, fogDensity: 0.021,
    dyn: ['bridge', 'customs', 'mine', 'logoff'],
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
