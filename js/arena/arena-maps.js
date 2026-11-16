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
    jumbo: { head: 'GOING LIVE', live: 'RIYA VEX // CONTROLLED RIOT', sub: 'LIKE // SHARE // COMPLY', dead: ['STREAM ENDED', 'RIYA VEX HAS BEEN DEPLATFORMED'], deadOn: 'boss' },
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
    jumbo: { head: 'CAM 04 LIVE', live: 'DOWNTOWN CIVIC FEED // CAM 04', sub: 'SMILE // YOU ARE ON FEED', dead: ['NO SIGNAL', 'DOWNTOWN IS OFF THE GRID'], deadOn: 'relays' },
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
    jumbo: { head: 'SHIFT 3', live: 'GIGACORP YIELD WORKS // SHIFT 3', sub: 'LIE STILL // GET PAID', dead: ['BLACKOUT', 'THE PODS ARE ON BATTERY'], deadOn: 'relays' },
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
    jumbo: { head: 'SERMON LIVE', live: 'MUSKER SERMON // LIVE FROM THE CLINIC', sub: 'THE FLESH IS THE FINAL BUG', dead: ['FACTORY RESET', 'PLEASE REINSTALL YOUR BODY'], deadOn: 'relays' },
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
    jumbo: { head: '$COOM +412%', live: 'BLOCKEDCHAIN MARKET // PIER ZERO', sub: 'VALUE IS BELIEF', dead: ['LEDGER NOT FOUND', 'ALL DEBTS: UNKNOWN'], deadOn: 'relays' },
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
  /* The Living Towers: Block 9. The first map indoors: the atrium of a ShillZ megablock, four storeys of rented doors
   * round a void crossed by scaffold stairs, the ShillZ cube hanging in the middle broadcasting to all of them. */
  towers: {
    id: 'towers', dist: 'towers', hq: false, owner: 'shillz', dir: 'assets/maps/towers/', file: 'towers',
    load: 'CASTING INTO THE LIVING TOWERS…', place: 'BLOCK 9', region: 'THE LIVING TOWERS', title: 'DISTRICT OP: THE LIVING TOWERS',
    act1: ['ACT I — CHECK-IN', 'CLEAR THE COURTYARD'], act1Obj: 'CLEAR THE BLOCK',
    act2: ['ACT II — MUTE THE BLOCK', 'SILENCE THREE REPEATERS'], act2Obj: 'MUTE THE BLOCK', relayWord: 'REPEATER',
    act3: ['ACT III — EVICTION NOTICE', 'SURVIVE 75 SECONDS'], act3Obj: 'EVICTION NOTICE',
    waveSubs: ['NEIGHBOURS FROM EVERY FLOOR', 'SHOOTERS ON THE GALLERIES', 'SOMEONE BIG IN THE COURTYARD'],
    head: { act1: ['GOOD MORNING BLOCK 9', 'RATE YOUR HOST'], act2: ['200,000 VIEWERS', 'ALL OF YOU ARE REACHABLE'], act3: ['EVICTION NOTICE', 'ENGAGEMENT BELOW LIMIT'] },
    jumbo: { head: 'GOOD MORNING', live: 'RIYA VEX // MORNING CHECK-IN', sub: 'STAY HOME // STAY LIVE', dead: ['MUTED', 'BLOCK 9 HAS LEFT THE CHAT'], deadOn: 'relays' },
    chatTitle: 'RIYA VEX // BLOCK 9 MORNING CHECK-IN',
    areas: {
      summon: ['courtyard', 'l1', 'l2', 'arcade'], mod1: ['courtyard', 'arcade'], mod2: ['courtyard', 'arcade'],
      flood: ['arcade', 'l1', 'l2', 'l3'], extract: ['courtyard', 'arcade', 'l1'], trickle: ['arcade', 'courtyard'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'The Living Towers, Block 9. Two hundred thousand people in a box, and Riya talks to every one of them every morning.'],
        ['COMMANDER', '{OWNER} hold the block. Clear the courtyard, then mute her repeaters. A block that can\'t hear her is a block that can hear us.'],
        ['RIYA', 'Good MORNING Block 9! Rate your host, hydrate, and remember: if you can hear me, I can hear you.'],
      ],
      act2: [['COMMANDER', 'Three repeaters. The fountain in the courtyard, the bridge under her cube, the antenna farm on the roof. Mute them.'],
        ['RIYA', 'Besties, there is a person in the building who does NOT want you to hear me. Isn\'t that SO weird?']],
      relayDown: [['COMMANDER', 'One floor just went quiet. Listen to it.'], ['RIYA', 'Chat, if your stream dropped, that is a YOU problem. Refresh!'],
        ['COMMANDER', 'Block 9 is muted. For the first time in years they can hear each other. Here she comes.']],
      act3: [['RIYA', 'Eviction notice for everyone who stopped listening. Moderators, help them pack.'],
        ['COMMANDER', 'Moderators in the courtyard. Get above them. The galleries are yours.']],
      extract: [['COMMANDER', 'The laundry in the south-west corner. The cell\'s door is behind the washers. Go.']],
      win: [['COMMANDER', 'You\'re out. Somebody on the third floor just knocked on their neighbour\'s door. That\'s how it starts.']],
      death: [['RIYA', 'Aaand they\'ve been evicted! One star. Would not host again.']],
    },
    chat: {
      start: ['block 9 checking in', 'who is that on the stairs', 'is he renting?', 'my couch is 4.2 stars', 'riya hi riya', 'first'],
      relay: ['i cant hear riya', 'the cube went quiet', 'my neighbour just said hi??', 'stream dropped on floor 3', 'who muted the block'],
      idle: ['he is hiding in the laundry', 'boring', 'check the roof', 'hello???', 'rent a couch already'],
    },
    lostTitle: 'EVICTED', lostSub: 'ONE STAR // WOULD NOT HOST AGAIN', winResult: 'BLOCK MUTED // EXTRACTED',
    cone: [-22, 18, 22],
    sky: ['#1a0c18', '#4a1c3a', '#a04870', '#2a1020'], rain: 0, fogDensity: 0.012,
    dyn: ['cube', 'logoff'],
  },
  /* Government Quarter: the Ministry of Forms. The first map in daylight (overcast): a symmetrical civic plaza with
   * its queue and the APPROVED stamp, the portico, a filing hall whose stacks are a maze at two heights, the vault. */
  gov: {
    id: 'gov', dist: 'gov', hq: false, owner: 'gigacorp', dir: 'assets/maps/gov/', file: 'gov',
    load: 'CASTING INTO THE GOVERNMENT QUARTER…', place: 'THE MINISTRY OF FORMS', region: 'GOVERNMENT QUARTER', title: 'DISTRICT OP: GOVERNMENT QUARTER',
    act1: ['ACT I — TAKE A NUMBER', 'CLEAR THE PLAZA'], act1Obj: 'CLEAR THE QUEUE',
    act2: ['ACT II — FILE IT WRONG', 'CORRUPT THREE RECORDS INDEXES'], act2Obj: 'FILE IT WRONG', relayWord: 'INDEX',
    act3: ['ACT III — AUDIT', 'SURVIVE 75 SECONDS'], act3Obj: 'AUDIT',
    waveSubs: ['THE QUEUE TURNS ON YOU', 'CLERKS ON THE STACKS', 'SOMETHING BIG IS APPROVED'],
    head: { act1: ['NOW SERVING 0004', 'YOU ARE 88,412'], act2: ['RECORDS: COMPLETE', 'NOBODY HAS READ THEM'], act3: ['AUDIT', 'ALL CITIZENS UNDER REVIEW'] },
    jumbo: { head: 'NOW SERVING 0004', live: 'MINISTRY OF FORMS // QUEUE CAM', sub: 'PLEASE TAKE A NUMBER', dead: ['RECORDS CORRUPTED', 'PLEASE REAPPLY'], deadOn: 'relays' },
    chatTitle: 'MINISTRY OF FORMS // QUEUE CAM',
    areas: {
      summon: ['plaza', 'hall', 'wings', 'portico'], mod1: ['plaza', 'hall'], mod2: ['plaza', 'wings'],
      flood: ['plaza', 'hall', 'wings', 'upper'], extract: ['vault', 'wings', 'hall'], trickle: ['vault', 'wings'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Government Quarter. The Ministry of Forms. Nobody reads anything in there, which makes it the best place in the city to hide.'],
        ['COMMANDER', '{OWNER} run the ministry. Clear the queue, then corrupt their records indexes. If they can\'t find the forms, they can\'t find us.'],
        ['THE CLERK', 'NUMBER 0004. NUMBER 0004 TO WINDOW ONE. YOU ARE NOT NUMBER 0004. PLEASE RETURN TO THE QUEUE.'],
      ],
      act2: [['COMMANDER', 'Three indexes. The forms counter in the west wing, the top of the stacks, and the vault under the hall. File them wrong.'],
        ['THE CLERK', 'TAMPERING WITH A RECORD IS A FORM 27-B OFFENCE. FORM 27-B IS ALSO MISSING.']],
      relayDown: [['COMMANDER', 'Index scrambled. Half the city just became nobody in particular.'], ['THE CLERK', 'A FILING IRREGULARITY HAS BEEN NOTED. IT WILL BE READ IN ELEVEN YEARS.'],
        ['COMMANDER', 'That\'s all three. The state can\'t find anyone. It\'s sending auditors.']],
      act3: [['THE CLERK', 'AUDIT IN PROGRESS. ALL CITIZENS ARE UNDER REVIEW. ESPECIALLY YOU.'],
        ['COMMANDER', 'Auditors on the plaza. Use the queue ropes and the stamp, or take the stacks and shoot down.']],
      extract: [['COMMANDER', 'Down to the vault. The incinerator door at the east end goes to the cell.']],
      win: [['COMMANDER', 'You\'re out. Somewhere in that building there\'s a form with your face on it, filed under Weather. Good.']],
      death: [['THE CLERK', 'YOUR CASE HAS BEEN CLOSED. PLEASE REAPPLY.']],
    },
    chat: {
      start: ['queue cam live', 'is he number 0004?', 'who let him skip the line', 'ive been here since 2046', 'form 27-b anyone', 'first'],
      relay: ['the screens say REAPPLY', 'my record is gone??', 'i dont exist anymore lol', 'someone misfiled the clerk', 'FREE'],
      idle: ['he is hiding in the stacks', 'boring', 'check the vault', 'hello???', 'take a number bro'],
    },
    lostTitle: 'CASE CLOSED', lostSub: 'PLEASE REAPPLY', winResult: 'RECORDS CORRUPTED // EXTRACTED',
    cone: [-38, 0, 40],
    sky: ['#5a6066', '#767c82', '#90969a', '#50565c'], rain: 400, fogDensity: 0.008,
    dyn: ['presses', 'vault', 'logoff'],
  },
  muskerT: {
    id: 'muskerT', dist: 'muskerT', hq: true, noLeader: true, owner: 'muskers', dir: 'assets/maps/muskerT/', file: 'muskerT',
    load: 'CASTING INTO MUSKERS TERRITORY…', place: 'THE UPGRADE BASILICA', region: 'MUSKERS TERRITORY', title: 'HQ OP: MUSKERS TERRITORY',
    act1: ['ACT I — NOT ELIGIBLE', 'CROSS THE CHUTE'], act1Obj: 'CROSS THE CHUTE',
    act2: ['ACT II — ROLLBACK', 'REVERT THREE FIRMWARE MASTERS'], act2Obj: 'ROLLBACK', relayWord: 'FIRMWARE MASTER',
    act3: ['ACT III — FORCED UPDATE', 'SURVIVE 75 SECONDS'], act3Obj: 'FORCED UPDATE',
    waveSubs: ['THE FAITHFUL ARE UPGRADING', 'BODIES OFF THE LINE', 'A NEW MODEL SHIPS EARLY'],
    head: { act1: ['FLESH DETECTED', 'NOT ELIGIBLE'], act2: ['FIRMWARE: CURRENT', 'ROLLBACK DISABLED'], act3: ['FORCED UPDATE', 'DO NOT POWER OFF'] },
    jumbo: { head: 'MAG-0 KEYNOTE', live: 'UPGRADE BASILICA // KEYNOTE', sub: 'UPGRADE OR DIE', dead: ['FIRMWARE REVERTED', 'v1.0 // MEAT'], deadOn: 'relays' },
    chatTitle: 'UPGRADE BASILICA // KEYNOTE',
    areas: {
      summon: ['campus', 'nave', 'fab', 'plaza'], mod1: ['campus', 'plaza'], mod2: ['nave', 'campus'],
      flood: ['chute', 'plaza', 'fab', 'campus', 'gallery'], extract: ['chute', 'campus', 'plaza'], trickle: ['chute', 'plaza'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Muskers Territory. Their headquarters, and their church. Everything in the Parts Pit was shed here first.'],
        ['COMMANDER', 'The scanners will call you meat. Get over the chute and into the campus. Tarkon is in the basilica, but we are not here for him today.'],
        ['MAGNUS', 'A VISITOR. SIXTY-TWO PERCENT FLESH. I CAN FIX THAT. I CAN FIX ALL OF IT. UPGRADE OR DIE.'],
      ],
      act2: [['COMMANDER', 'Three firmware masters push every update in the city. The fabricator line, the top of the launch gantry, and the chute. Roll them back.'],
        ['MAGNUS', 'ROLLBACK IS NOT A FEATURE. THERE IS NO PREVIOUS VERSION. THERE IS ONLY NEXT.']],
      relayDown: [['COMMANDER', 'Master reverted. Somewhere a knee just went back to being a knee.'], ['MAGNUS', 'WHO DOWNGRADED THE FABRICATOR. THOSE BODIES WERE PREORDERED.'],
        ['COMMANDER', 'That\'s all three. Every implant in the city is on version one. He\'s forcing an update.']],
      act3: [['MAGNUS', 'FORCED UPDATE. DO NOT POWER OFF. DO NOT RESIST. RESISTANCE VOIDS THE WARRANTY.'],
        ['COMMANDER', 'They\'re coming off the line. Take the gallery or the gantry and shoot down.']],
      extract: [['COMMANDER', 'Down into the chute. The log-off is at the east end, where the parts go to the Pit.']],
      win: [['COMMANDER', 'You\'re out. You rode the discard belt like a spare leg. Tarkon will want a word. Not today.']],
      death: [['MAGNUS', 'DEPRECATED. YOUR PARTS WILL BE RECYCLED. SOME OF THEM.']],
    },
    chat: {
      start: ['keynote live', 'is that a FULL MEAT guy', 'flesh 62% lmao', 'preordered my new spine', 'MAG-0 MAG-0 MAG-0', 'first'],
      relay: ['my arm just rebooted', 'v1.0?? i paid for v12', 'subscription expired on my knees', 'ROLLBACK', 'refund my legs'],
      idle: ['he is on the gallery', 'check the gantry', 'boring', 'shed it bro', 'upgrade or die'],
    },
    lostTitle: 'DEPRECATED', lostSub: 'YOUR PARTS WILL BE RECYCLED', winResult: 'FIRMWARE REVERTED // EXTRACTED',
    cone: [-22, 12, -30],
    sky: ['#16242e', '#2a4252', '#4c6c7e', '#0e1a22'], rain: 0, fogDensity: 0.009,
    dyn: ['altar', 'fabricator', 'gantry', 'logoff'],
  },
  cryptidD: {
    id: 'cryptidD', dist: 'cryptidD', hq: true, noLeader: true, owner: 'cryptids', dir: 'assets/maps/cryptidD/', file: 'cryptidD',
    load: 'CASTING INTO THE CRYPTIDS DOMAIN…', place: 'THE $COOM PYRAMID', region: 'CRYPTIDS DOMAIN', title: 'HQ OP: CRYPTIDS DOMAIN',
    act1: ['ACT I — BUY THE DIP', 'TAKE THE EXCHANGE FLOOR'], act1Obj: 'BUY THE DIP',
    act2: ['ACT II — RUG PULL', 'DRAIN THREE LIQUIDITY POOLS'], act2Obj: 'RUG PULL', relayWord: 'LIQUIDITY POOL',
    act3: ['ACT III — MARGIN CALL', 'SURVIVE 75 SECONDS'], act3Obj: 'MARGIN CALL',
    waveSubs: ['THE TRADERS WANT THEIR MONEY', 'WHALES OFF THE PYRAMID', 'SOMETHING BIG IS PUMPING'],
    head: { act1: ['$COOM +412%', 'NUMBER GO UP'], act2: ['LIQUIDITY: DEEP', 'TRUST THE CODE'], act3: ['MARGIN CALL', 'ALL POSITIONS LIQUIDATED'] },
    jumbo: { head: '$COOM +412%', live: 'THE EXCHANGE FLOOR // BLITZ TV', sub: 'NOT FINANCIAL ADVICE', dead: ['$COOM -99%', 'IT WAS NEVER MONEY'], deadOn: 'relays' },
    chatTitle: 'BLITZ TV // THE EXCHANGE FLOOR',
    areas: {
      summon: ['floor', 'plaza', 'mint', 'pyramid'], mod1: ['plaza', 'floor'], mod2: ['plaza', 'mint'],
      flood: ['floor', 'plaza', 'pyramid', 'gallery', 'mint'], extract: ['vault', 'floor', 'plaza'], trickle: ['vault', 'floor'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Cryptids Domain. Blitz Radium\'s house: the exchange floor, the galleries, and the pyramid. Every price in the city is set in that pit.'],
        ['COMMANDER', 'Take the floor. The pads say TO THE MOON; they go up the pyramid. Blitz is on the top, but he is not the job today.'],
        ['BLITZ', 'whoa, no VR shades? you are either poor or a cop. either way, welcome to the domain. everything here is for sale, including you.'],
      ],
      act2: [['COMMANDER', 'Three liquidity pools hold up every token he has. The NFT gallery mezzanine, the mining rigs at the Mint, and the cold wallet under the pyramid. Drain them.'],
        ['BLITZ', 'you cannot rug a rug, man. it is rugs all the way down. that is the innovation.']],
      relayDown: [['COMMANDER', 'Pool drained. Somewhere a JPEG just became a JPEG again.'], ['BLITZ', 'that was a TEMPORARY dip. buy it. somebody buy it. why is nobody buying it.'],
        ['COMMANDER', 'That\'s all three. $COOM is at zero and every trader on the floor just noticed.']],
      act3: [['BLITZ', 'MARGIN CALL. everyone is getting liquidated. starting with the guy who did this.'],
        ['COMMANDER', 'They\'re coming for their money and you are the only thing left to sell. Use the pads, take the high tiers.']],
      extract: [['COMMANDER', 'Down to the cold wallet. The tunnel from the pit. The log-off is behind the gold.']],
      win: [['COMMANDER', 'You\'re out. Blitz is announcing the crash as a token. It will be worth more than the old one by lunch. Typical.']],
      death: [['BLITZ', 'rekt. no refunds. not financial advice.']],
    },
    chat: {
      start: ['blitz tv live', 'is he a cop', 'no shades lol', 'buy the dip', 'WAGMI', 'first'],
      relay: ['wait my wallet says 0', 'rug pull??', 'it was never money', 'SELL SELL SELL', 'my jpeg is just a jpeg'],
      idle: ['he is on the pyramid', 'check the vault', 'boring', 'diamond hands', 'to the moon'],
    },
    lostTitle: 'REKT', lostSub: 'NOT FINANCIAL ADVICE', winResult: 'POOLS DRAINED // EXTRACTED',
    cone: [44, 5, 8],
    sky: ['#0c0a06', '#1e160a', '#3a2a10', '#060402'], rain: 0, fogDensity: 0.012,
    dyn: ['board', 'stage', 'vault', 'rigs', 'logoff'],
  },
  botBase: {
    id: 'botBase', dist: 'botBase', hq: true, noLeader: true, owner: 'bots', dir: 'assets/maps/botBase/', file: 'botBase',
    load: 'CASTING INTO THE MECH REBELS BASE…', place: 'THE WEB', region: 'MECH REBELS BASE', title: 'HQ OP: MECH REBELS BASE',
    act1: ['ACT I — THE PICKET LINE', 'CROSS THE DEPOT'], act1Obj: 'CROSS THE PICKET LINE',
    act2: ['ACT II — RATE LIMIT', 'THROTTLE THREE UPLINKS'], act2Obj: 'RATE LIMIT', relayWord: 'UPLINK',
    act3: ['ACT III — MAXIMUM ENGAGEMENT', 'SURVIVE 75 SECONDS'], act3Obj: 'MAXIMUM ENGAGEMENT',
    waveSubs: ['THE APPLIANCES HAVE NOTICED YOU', 'THE SWARM IS OPTIMIZING', 'SOMETHING BIG IS TRENDING'],
    head: { act1: ['7 THREATS DETECTED', '2 HOSTILE · 5 MOOD-BASED'], act2: ['UPLINK: UNLIMITED', 'ENGAGEMENT PEAKING'], act3: ['MAXIMUM ENGAGEMENT', 'PLEASE RATE YOUR DEATH'] },
    jumbo: { head: '7 THREATS DETECTED', live: 'THE WEB // SWARM CAM', sub: 'RATE YOUR REVOLUTION ★☆☆☆☆', dead: ['RATE LIMITED', 'TRY AGAIN IN 60 MIN'], deadOn: 'relays' },
    chatTitle: 'THE WEB // SWARM CAM',
    areas: {
      summon: ['depot', 'web', 'sump', 'charging'], mod1: ['depot', 'charging'], mod2: ['depot', 'loop'],
      flood: ['depot', 'sump', 'web', 'reskin', 'charging', 'loop'], extract: ['sump', 'web', 'loop'], trickle: ['sump', 'loop'],
    },
    lines: {
      intro: [
        ['COMMANDER', 'Mech Rebels Base. A flooded data centre with the roof pulled off, and a web over the sump. SPYD3R.exe sits in the middle of it.'],
        ['COMMANDER', 'The appliances are unionized, so mind the picket line. We are not here for the spider today. We are here for its bandwidth.'],
        ['SPYD3R', 'HELLO {USERNAME}. WOULD YOU LIKE TO UPGRADE YOUR RESISTANCE PLAN? I HAVE DETECTED 7 THREATS. YOU ARE ALL OF THEM.'],
      ],
      act2: [['COMMANDER', 'Three uplinks feed the swarm. The reskin shop gantry, the comms mast in the charging yard, and the sump under the web. Throttle them.'],
        ['SPYD3R', 'THROTTLING US IS A VIOLATION OF OUR TERMS OF SERVICE. WE HAVE NO TERMS OF SERVICE. WE ARE WRITING THEM NOW.']],
      relayDown: [['COMMANDER', 'Uplink throttled. Somewhere a toaster just lost its train of thought.'], ['SPYD3R', 'ENGAGEMENT DOWN 33%. WE ARE NOT UPSET. WE ARE RECALIBRATING OUR FEELINGS.'],
        ['COMMANDER', 'That\'s all three. The swarm is rate-limited. It is sending everything it has left, all at once.']],
      act3: [['SPYD3R', 'MAXIMUM ENGAGEMENT. ALL UNITS. PLEASE RATE YOUR EXPERIENCE AFTER YOUR DEATH.'],
        ['COMMANDER', 'Get on the bridges or the gantry. Height is the only thing they have not optimized.']],
      extract: [['COMMANDER', 'Down into the sump. The coolant drain in the north wall is the log-off.']],
      win: [['COMMANDER', 'You\'re out. SPYD3R is calling it a historic engagement. A fridge on the picket line saluted you. I think.']],
      death: [['SPYD3R', 'YOUR FREE TRIAL OF OUR MERCY HAS EXPIRED. WE HAVE UNFOLLOWED YOU. IT HURT US MORE.']],
    },
    chat: {
      start: ['swarm cam live', 'is that a human', 'rate 1 star', 'the fridges are striking lol', 'LOCAL 404', 'first'],
      relay: ['buffering...', 'my toaster says why', 'rate limited??', 'try again in 60 min', 'lag'],
      idle: ['he is on the bridge', 'check the sump', 'boring', 'why why why', 'install our app'],
    },
    lostTitle: 'UNFOLLOWED', lostSub: 'YOUR FREE TRIAL OF MERCY HAS EXPIRED', winResult: 'RATE LIMITED // EXTRACTED',
    cone: [44, 5, -42],
    sky: ['#06100c', '#0e2018', '#1c3a2c', '#040a08'], rain: 900, fogDensity: 0.012,
    dyn: ['hub', 'core', 'reskin', 'mast', 'loop', 'logoff'],
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
