/* EARTH 2049: SAVE SEED 7 — the GigaLeague codex: plain-language explanations for everything in create-a-class.
 *
 * Every gun, attachment, perk, lethal, tactical and scorestreak gets: what it is, how it plays, PROS, CONS and what it
 * is best for. The numbers (shots to kill, fire rate, aim time, ...) are worked out here from js/pvp/pvp-data.js, so the
 * screen can never disagree with the match. Attachment pros and cons are written from their mods, for the same reason.
 * Client-only text; the match never reads this file. No DOM, no THREE (tests load it in node).
 */
(function (root) {
  'use strict';
  const PVP = root.PVP;

  /* ------------------------------------------------------------------ guns */
  const GUNS = {
    ar: { role: 'ASSAULT RIFLE', blurb: 'The reference rifle. Good at every distance, best at none. If you are new, start here and learn the kick.',
      pros: ['Steady from close range out to long range', 'Easy recoil once you learn it', '30 rounds is enough for two fights'],
      cons: ['Loses to a shotgun or SMG up close', 'Loses to a sniper across the map'], best: 'Holding lanes and middle-distance fights' },
    smg: { role: 'SUBMACHINE GUN', blurb: 'Fast, light and built for running. Melts people up close, sprays at a distance.',
      pros: ['Fastest kill up close of the full-auto guns', 'Quick to aim and quick out of a sprint', 'Full speed while you carry it'],
      cons: ['Damage falls off hard past 12 m', 'Bullets spread at long range'], best: 'Rushing objectives and clearing rooms' },
    shotgun: { role: 'SHOTGUN', blurb: 'Eight pellets per pump. One shot kills inside 6 m if most pellets land. Useless across a street.',
      pros: ['One-shot kills up close', 'Forgiving: you do not need perfect aim', 'Shells load one at a time, so you can top up'],
      cons: ['Pump action: miss and you wait', 'Almost no damage past 16 m', 'Only 6 shells'], best: 'Tight interiors, corners and doorways' },
    sniper: { role: 'SNIPER RIFLE', blurb: 'A bolt-action that kills with one hit to the head or chest. Arms and legs take two.',
      pros: ['One-shot kill to the upper body at any range', 'Huge zoom', 'Controls long sightlines on its own'],
      cons: ['Slowest gun to aim and to fire', 'Hip fire goes anywhere', 'Slow on your feet'], best: 'Long lanes, rooftops and holding angles' },
    lmg: { role: 'LIGHT MACHINE GUN', blurb: 'A 100-round belt. Lays down fire for as long as you hold the trigger. Reloading takes forever.',
      pros: ['100 rounds: win several fights without reloading', 'Hits harder than the rifle at range', 'Great for locking down an objective'],
      cons: ['4.5 second reload', 'Slowest to aim and the slowest to move with', 'Slow out of a sprint'], best: 'Defending a zone and suppressing a lane' },
    marksman: { role: 'MARKSMAN RIFLE', blurb: 'Semi-automatic: one shot per pull. Three body shots kill at any distance. A headshot kills in two.',
      pros: ['Damage never falls off', 'Three shots kill at any range, two to the head', 'Very accurate when aimed'],
      cons: ['You have to pull the trigger for every shot', 'Slow kill if you miss', 'Clumsy in close quarters'], best: 'Picking people off from mid to long range' },
    burst: { role: 'BURST RIFLE', blurb: 'Three rounds per pull, fired very fast. Land a whole burst and the fight is over: every shot in triplicate.',
      pros: ['One full burst kills up close', 'Fastest kill in the game when every round lands', 'Recoil resets between bursts'],
      cons: ['A missed burst costs a lot of time', 'Needs good aim', 'Unlocks late (level 15)'], best: 'Players with steady aim at mid range' },
    fastsmg: { role: 'SUBMACHINE GUN', blurb: '1,100 rounds per minute and 40 in the mag. Every round is cheap; the price is volume. A flash sale on bullets.',
      pros: ['Highest fire rate of any class gun', 'Fastest gun to aim and to move with', 'Big 40-round magazine'],
      cons: ['Weakest bullet: five to kill up close', 'Useless past 20 m', 'Kicks sideways'], best: 'Sprinting into close fights' },
    pistol: { role: 'PISTOL', blurb: 'The sidearm. Faster to pull out than to reload your primary. Three shots kill up close.',
      pros: ['Quickest weapon to draw and aim', 'You move fastest with it out', 'Plenty of spare ammo'],
      cons: ['Weak past 12 m', 'Semi-auto: you pull for every shot'], best: 'Finishing a fight when your primary runs dry' },
    revolver: { role: 'REVOLVER', blurb: 'A hand cannon. Two shots kill up close, three far away. Six rounds, one package.',
      pros: ['Two-shot kill up close', 'Strong at range for a sidearm', 'Fast to aim'],
      cons: ['Only six rounds', 'Slow 2.4 second reload', 'Slow between shots'], best: 'Players who hit their shots' },
    launcher: { role: 'LAUNCHER', blurb: 'One rocket at a time. Locks on to enemy scorestreaks when you aim at them. An offer they did not ask for.',
      pros: ['Kills a player with one direct hit', 'Locks on to drones and gunships', 'Splash damage hits around corners'],
      cons: ['One rocket, two spares', 'Slow, visible rocket', 'Slowest secondary to aim'], best: 'Shooting down scorestreaks' },
  };

  /* ------------------------------------------------------------------ attachments: a line on what it is */
  const ATTACH = {
    reddot: 'A small glass sight with a red dot. A clear picture with less of the gun in the way.',
    holo: 'A wide holographic window with a ring reticle. Easier to track a moving target.',
    zoom2: 'A 2.5x scope. You see further and hit further, but you look through a tube.',
    suppressor: 'A silencer. Firing does not put a red dot on the enemy minimap. You lose some range.',
    comp: 'A compensator. It vents gas upward, so the barrel climbs less. Louder and a touch slower.',
    longbarrel: 'A heavy, longer barrel. Bullets keep their damage further out.',
    shortbarrel: 'A cut-down barrel. Snappier to aim and lighter to carry; damage drops off sooner.',
    vgrip: 'A vertical foregrip. A firmer hold, so less climb when you hold the trigger.',
    agrip: 'An angled foregrip. Brings the gun up faster, holds it a little looser.',
    extmag: 'A longer magazine with half again as many rounds. Heavier, so slower to aim and reload.',
    fastmag: 'A short magazine with a pull tab. Much faster reloads, a few rounds fewer.',
    lightstock: 'A skeleton stock. You move faster with the gun up; it kicks more.',
    heavystock: 'A solid, padded stock. The gun sits still; you move a little slower.',
    laser: 'A laser on the side rail. Hip fire is far tighter, but enemies can see the beam.',
    tapegrip: 'Grip tape. You can shoot sooner after a sprint. A little more kick.',
    rubbergrip: 'A rubber sleeve on the grip. Getting shot knocks your aim less. Slower out of a sprint.',
  };
  // how each mod reads, and whether more of it is good
  const MOD = {
    ads: { up: false, f: v => `Aim down sights ${pct(v)} ${v > 0 ? 'slower' : 'faster'}` },
    range: { up: true, f: v => `${pct(v)} ${v > 0 ? 'more' : 'less'} range before damage drops` },
    spread: { up: false, f: v => `Hip fire ${pct(v)} ${v > 0 ? 'wider' : 'tighter'}` },
    recoil: { up: false, f: v => `${pct(v)} ${v > 0 ? 'more' : 'less'} recoil` },
    mag: { up: true, f: v => `${pct(v)} ${v > 0 ? 'more' : 'fewer'} rounds per magazine` },
    reload: { up: false, f: v => `Reload ${pct(v)} ${v > 0 ? 'slower' : 'faster'}` },
    move: { up: true, f: v => `Move ${pct(v)} ${v > 0 ? 'faster' : 'slower'} with it out` },
    quiet: { up: true, f: () => 'Your shots do not show on the enemy minimap' },
    laser: { up: false, f: () => 'Enemies can see your laser beam' },
    stf: { up: false, f: v => `Shoot ${pct(v)} ${v > 0 ? 'later' : 'sooner'} after a sprint` },
    flinch: { up: false, f: v => `${pct(v)} ${v > 0 ? 'more' : 'less'} flinch when you are hit` },
  };
  const pct = v => Math.round(Math.abs(v) * 100) + '%';
  /** an attachment's PROS and CONS, written from its mods */
  function attachProsCons(id) {
    const A = PVP.ATTACHMENTS[id], pros = [], cons = [];
    if (!A) return { pros, cons };
    for (const [k, v] of Object.entries(A.mods)) {
      const m = MOD[k]; if (!m || !v) continue;
      const good = k === 'laser' ? false : m.up ? v > 0 : v < 0;
      (good ? pros : cons).push(m.f(v));
    }
    return { pros, cons };
  }

  /* ------------------------------------------------------------------ perks, equipment, streaks */
  const PERKS = {
    donottrack: { pros: ['Hidden from enemy Predictive Ping', 'Enemy drones, turrets and gunships ignore you'], cons: ['Does nothing against players looking at you'],
      best: 'Flanking and staying alive late in a match' },
    bubblewrap: { pros: ['Grenades, rockets and mines do 35% less to you'], cons: ['No help in a gunfight'], best: 'Objective modes where explosives fly' },
    dumpster: { pros: ['Every kill gives back half a magazine of spare ammo', 'Every kill gives your lethal back'], cons: ['Only pays out when you get kills'],
      best: 'Long streaks with guns that eat ammo' },
    quickfix: { pros: ['Health starts coming back the moment you get a kill'], cons: ['No help if you are losing fights'], best: 'Chaining fights back to back' },
    bnpl: { pros: ['Your secondary slot can hold any primary', 'Two full guns for every range'], cons: ['Respawning takes 1 second longer'],
      best: 'Pairing a close-range gun with a long-range one' },
    loyalty: { pros: ['Every scorestreak costs 100 points less'], cons: ['Does nothing until you earn points'], best: 'Getting streaks out sooner' },
    sleight: { pros: ['Reload 35% faster', 'Swap weapons 35% faster'], cons: ['Takes the tier 2 slot from bigger perks'], best: 'Small magazines and slow reloads' },
    termsunread: { pros: ['Flashes and stuns wear off twice as fast'], cons: ['No use if nobody throws them'], best: 'Pushing into rooms that get flashed' },
    noisecancel: { pros: ['Your footsteps are quiet', 'Players with headphones cannot hear you coming'], cons: ['Your gunshots are still loud'],
      best: 'Flanking and rushing' },
    databroker: { pros: ['Enemy footprints show for 3 seconds', 'Shows where people just ran'], cons: ['Footprints, not live positions'], best: 'Hunting and chasing' },
    thickskin: { pros: ['Getting shot knocks your aim half as much'], cons: ['No help if you are not aiming'], best: 'Snipers and anyone who holds an angle' },
    spotter: { pros: ['See enemy equipment and streaks through walls'], cons: ['Does not show players'], best: 'Clearing mines and turrets' },
  };
  const LETHALS = {
    frag: { pros: ['Big blast (5.5 m)', 'Cook it so it explodes on landing', 'Bounces round corners'], cons: ['2.5 s fuse gives people time to run'],
      best: 'Flushing people out of cover' },
    sticky: { pros: ['Sticks to walls, floors and players', 'Short 1.5 s fuse'], cons: ['Smaller blast (3.8 m)'], best: 'Precise throws and objectives' },
    popup: { pros: ['Sits on the floor and waits', 'Kills or badly hurts whoever walks past'], cons: ['Smaller blast', 'SPOTTER players see it through walls'],
      best: 'Guarding your back and objective doors' },
    knife: { pros: ['One hit kills', 'Silent', 'Pick it back up'], cons: ['Needs a direct hit', 'Short flight with drop'], best: 'Showing off; finishing wounded players' },
  };
  const TACTICALS = {
    notify: { pros: ['Blinds everyone who looks at it for up to 3 s', 'Large radius'], cons: ['Can blind you too if you look'], best: 'Before you push a room' },
    vape: { pros: ['A smoke wall for 12 s', 'Blocks snipers and turrets'], cons: ['Blocks your view too'], best: 'Crossing open ground and planting' },
    stun: { pros: ['Slows enemy movement and aim for 3 s'], cons: ['Smaller radius than the flash'], best: 'Rushing a defended spot' },
    cookie: { pros: ['Tracks every enemy within 10 m for 4 s'], cons: ['Short range', 'Unlocks at level 9'], best: 'Finding the player behind the wall' },
  };
  const STREAKS = {
    ping: { pros: ['Enemies show on your minimap for 30 s', 'Shows where they are about to be'], cons: ['DO NOT TRACK players do not show'], best: 'Your first streak every match' },
    downtime: { pros: ['Enemy minimaps go dark for 25 s'], cons: ['Does not hurt anyone'], best: 'Countering an enemy Predictive Ping' },
    dronedrop: { pros: ['A care package: a random streak or a power weapon'], cons: ['Random', 'Enemies can steal it'], best: 'A gamble that often pays' },
    broadcaster: { pros: ['A turret you place that shoots enemies for 60 s'], cons: ['Can be destroyed (180 HP)', 'Covers one area'], best: 'Guarding an objective' },
    sponsored: { pros: ['A drone circles the map and shoots enemies for 40 s'], cons: ['Can be shot down (220 HP)'], best: 'Map-wide pressure' },
    collab: { pros: ['An AI teammate follows you for 60 s'], cons: ['It can die', 'Unlocks at level 19'], best: 'Playing objectives alone' },
    gunship: { pros: ['A gunship hammers enemies from the sky for 30 s'], cons: ['Launchers can lock on to it (650 HP)'], best: 'Turning a match around' },
    wipe: { pros: ['After a 10 s siren every enemy dies', 'Their HUD goes dark'], cons: ['3,000 points without dying', 'The siren gives everyone a 10 s warning'],
      best: 'Ending the match on your terms' },
  };

  /* ------------------------------------------------------------------ numbers */
  const HP = 100;
  // arena recoil per shot (js/arena/arena-data.js), used for the CONTROL bar; node tests fall back to these
  const KICK = { ar: 1.0, smg: 0.62, shotgun: 6.5, dmr: 7.5, lmg: 0.75, pistol: 1.7, marksman: 3.4, burst: 1.25, fastsmg: 0.5, revolver: 4.2, launcher: 5.5 };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lin = (v, a, b) => clamp01((v - a) / (b - a));
  const logk = (v, a, b) => clamp01(Math.log(v / a) / Math.log(b / a));

  /**
   * Everything the stat panel shows for a gun with attachments (core playlist).
   * bars: 0..1 (higher is always better). num: the real figures.
   */
  function gunStats(id, att) {
    const S = root.PvpSim?.gunStats ? root.PvpSim.gunStats(id, 'core', att || []) : fallbackStats(id, att);
    if (!S) return null;
    const M = S.mods, pel = S.pellets || 1;
    const nearD = S.proj ? (S.proj.direct || S.proj.dmg) : S.near[0] * pel, farD = S.proj ? S.proj.dmg : S.far[0] * pel;
    const stk = d => Math.max(1, Math.ceil(HP / Math.max(1, d)));
    const stkN = stk(nearD), stkF = stk(farD);
    const burst = S.fire === 'burst' ? S.burst : 0;
    const shotGap = burst ? 60 / S.burstRpm : 60 / S.rpm, burstGap = 60 / S.rpm;
    const ttk = n => {
      if (n <= 1) return 0;
      if (!burst) return (n - 1) * shotGap;
      const bursts = Math.floor((n - 1) / burst), inBurst = (n - 1) % burst;
      return bursts * (burstGap + (burst - 1) * shotGap) + inBurst * shotGap;
    };
    const rangeN = S.near[1] >= 999 ? Infinity : S.near[1] * S.rangeK;
    const kickBase = (root.AR?.GUNS?.[S.vis]?.kick) ?? KICK[S.vis] ?? 1;
    const kick = kickBase * (1 + M.recoil);
    const hip = S.spread[0] * (1 + M.spread);
    const adsT = S.ads * (1 + M.ads), move = S.move * (1 + M.move), stf = S.stf * (1 + M.stf);
    const effRpm = burst ? Math.round(60 / ((burstGap + (burst - 1) * shotGap) / burst)) : S.rpm;
    const bars = {
      damage: logk(nearD, 14, 150),
      range: S.proj ? null : rangeN === Infinity ? 1 : lin(rangeN, 4, 46),     // a rocket has no drop-off: no bar
      rate: logk(effRpm, 45, 1150),
      accuracy: 1 - logk(hip, 1.2, 9),
      control: 1 - logk(kick, 0.4, 8),
      mobility: lin(move, 0.82, 1.1),
      handling: 1 - lin(adsT + stf * 0.5, 0.2, 0.68),
    };
    const num = {
      stkNear: stkN, stkFar: stkF, ttkNear: Math.round(ttk(stkN) * 1000), ttkFar: Math.round(ttk(stkF) * 1000),
      headStk: S.proj ? 1 : stk(nearD * (S.head || 1)), limbOneShot: !!S.limb && S.limb * pel < HP,
      rpm: S.rpm, burst, mag: S.magSize, reserve: S.reserve, reload: +S.reloadT.toFixed(2), ads: Math.round(adsT * 1000), move: Math.round(move * 100),
      stf: Math.round(stf * 1000), range: rangeN === Infinity ? null : Math.round(rangeN), falloffTo: S.far[1] >= 999 ? null : Math.round(S.far[1] * S.rangeK),
      pellets: pel, fire: S.fire, quiet: !!M.quiet, laser: !!M.laser, lockOn: !!S.lockOn, splash: S.proj?.splash || 0,
    };
    return { bars, num, S };
  }
  // the same arithmetic as PvpSim.gunStats, for pages that do not load the sim
  function fallbackStats(id, att) {
    const base = PVP.GUNS[id]; if (!base) return null;
    const g = Object.assign({ id }, base);
    const mods = { ads: 0, range: 0, spread: 0, recoil: 0, mag: 0, reload: 0, move: 0, quiet: 0, laser: 0, stf: 0, flinch: 0 };
    for (const a of att || []) { const A = PVP.ATTACHMENTS[a]; if (A) for (const [k, v] of Object.entries(A.mods)) mods[k] += v; }
    g.mods = mods; g.magSize = Math.max(1, Math.round(g.mag * (1 + mods.mag))); g.reloadT = g.reload * (1 + mods.reload); g.rangeK = 1 + mods.range;
    return g;
  }
  const BAR_NAMES = { damage: 'DAMAGE', range: 'RANGE', rate: 'FIRE RATE', accuracy: 'HIP ACCURACY', control: 'RECOIL CONTROL', mobility: 'MOBILITY', handling: 'HANDLING' };
  const BAR_HELP = {
    damage: 'How hard one shot (or one full shotgun blast) hits up close.',
    range: 'How far bullets keep their full damage.',
    rate: 'Rounds per minute. A burst gun counts its average.',
    accuracy: 'How tight your shots are without aiming.',
    control: 'How little the gun kicks per shot.',
    mobility: 'How fast you move with it out.',
    handling: 'How fast you aim down sights and shoot after a sprint.',
  };

  /** plain-language lines for a gun's numbers ("4 shots close, 5 far", ...) */
  function gunLines(id, att) {
    const st = gunStats(id, att); if (!st) return [];
    const n = st.num, out = [];
    if (n.fire === 'proj') out.push(`One direct hit kills. Splash: ${n.splash} m.${n.lockOn ? ' Locks on to scorestreaks.' : ''}`);
    else if (n.pellets > 1) out.push(`${n.pellets} pellets. Up close, one blast kills if most land; ${n.stkFar} blasts far away.`);
    else if (n.stkNear === n.stkFar) out.push(`${n.stkNear} shot${n.stkNear > 1 ? 's' : ''} to kill at any range${n.headStk < n.stkNear ? `; ${n.headStk} with headshots` : ''}.`);
    else out.push(`${n.stkNear} shots to kill up close, ${n.stkFar} far away${n.headStk < n.stkNear ? `; ${n.headStk} with headshots` : ''}.`);
    if (n.limbOneShot) out.push('Head or chest: one shot. Arms and legs: two.');
    if (n.burst) out.push(`${n.burst}-round burst per pull.`);
    if (n.range) out.push(`Full damage to ${n.range} m${n.falloffTo ? `, lowest from ${n.falloffTo} m` : ''}.`);
    else if (n.fire !== 'proj') out.push('No damage drop-off at any range.');
    return out;
  }

  /** the text block for any item: { title, role, blurb, pros, cons, best, lines } */
  function entry(kind, id, att) {
    if (kind === 'gun') {
      const G = PVP.GUNS[id], T = GUNS[id] || {};
      return { title: clean(G?.name), role: T.role || '', blurb: T.blurb || '', pros: T.pros || [], cons: T.cons || [], best: T.best || '', lines: gunLines(id, att), lvl: G?.lvl || 1 };
    }
    if (kind === 'attach') {
      const A = PVP.ATTACHMENTS[id], pc = attachProsCons(id);
      return { title: A?.name || id, role: (A?.slot || '').toUpperCase(), blurb: ATTACH[id] || A?.d || '', pros: pc.pros, cons: pc.cons, best: '', lines: [], lvl: 0 };
    }
    const TBL = { perk: [PVP.PERKS, PERKS], lethal: [PVP.LETHALS, LETHALS], tactical: [PVP.TACTICALS, TACTICALS], streak: [PVP.STREAKS, STREAKS] }[kind];
    if (!TBL) return null;
    const D = TBL[0][id], T = TBL[1][id] || {};
    const role = kind === 'perk' ? 'PERK ' + D?.tier : kind === 'streak' ? `SCORESTREAK // ${D?.pts} POINTS` : kind.toUpperCase();
    return { title: clean(D?.name), role, blurb: D?.d || '', pros: T.pros || [], cons: T.cons || [], best: T.best || '', lines: [], lvl: D?.lvl || 1 };
  }
  const clean = s => String(s || '').replace(/"/g, '');

  const api = { GUNS, ATTACH, PERKS, LETHALS, TACTICALS, STREAKS, gunStats, gunLines, attachProsCons, entry, BAR_NAMES, BAR_HELP };
  root.PvpCodex = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
