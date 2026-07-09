/* EARTH 2049: SAVE SEED 7 — local dev console */
'use strict';

const DevConsole = (() => {
  const PROCEDURAL_MAPS = [
    { id: 'd0-proc', label: 'Procedural — ShillZ Central', district: 0, sceneUrl: null },
    { id: 'd1-proc', label: 'Procedural — Musker Labs', district: 1, sceneUrl: null },
    { id: 'd2-proc', label: 'Procedural — Bot Bay', district: 2, sceneUrl: null },
    { id: 'd3-proc', label: 'Procedural — Cryptid Domain', district: 3, sceneUrl: null },
    { id: 'd4-proc', label: 'Procedural — GigaCorp Campus', district: 4, sceneUrl: null },
  ];
  let sceneMaps = [];
  let MAPS = PROCEDURAL_MAPS.slice();

  let open = false;
  let wasPaused = false;
  const logLines = [];
  const MAX_LOG = 40;

  function el(id) { return document.getElementById(id); }

  function log(msg) {
    const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    logLines.push(line);
    if (logLines.length > MAX_LOG) logLines.shift();
    const box = el('devLog');
    if (box) {
      box.textContent = logLines.join('\n');
      box.scrollTop = box.scrollHeight;
    }
    console.info('[E2049 Dev]', msg);
  }

  function mapById(id) {
    return MAPS.find(m => m.id === id) || MAPS.find(m => m.sceneUrl && m.sceneUrl.includes(id)) || null;
  }

  async function loadSceneMaps() {
    try {
      const data = await AssetLoader.fetchJson('assets/data/scene-manifest.json', { optional: true });
      sceneMaps = Array.isArray(data?.scenes) ? data.scenes : [];
      MAPS = PROCEDURAL_MAPS.concat(sceneMaps);
      return sceneMaps.length;
    } catch (err) {
      console.warn('[E2049 Dev] Failed to load scene manifest:', err);
      MAPS = PROCEDURAL_MAPS.slice();
      return 0;
    }
  }

  function syncGodToggle() {
    const cb = el('devGodMode');
    if (cb) cb.checked = DevAPI.godMode;
    const st = el('devStatus');
    if (st) st.textContent = DevAPI.godMode ? 'GOD ON' : '';
  }

  function setOpen(v) {
    open = v;
    const panel = el('devConsole');
    if (!panel) return;
    panel.classList.toggle('open', open);
    document.body.classList.toggle('dev-open', open);
    if (open) {
      wasPaused = typeof paused !== 'undefined' && paused;
      if (typeof setPaused === 'function' && !wasPaused) setPaused(true);
      syncGodToggle();
      log('Dev console opened (F1 or ` to close)');
    } else {
      if (typeof setPaused === 'function' && !wasPaused) setPaused(false);
      log('Dev console closed');
    }
  }

  function toggle() { setOpen(!open); }

  async function loadSelectedMap() {
    const sel = el('devMapSelect');
    const entry = MAPS[sel.selectedIndex];
    if (!entry) return;
    log('Loading map: ' + entry.label);
    try {
      await DevAPI.loadMap(entry);
      log('Map loaded.');
    } catch (err) {
      log('Map load failed: ' + err.message);
    }
  }

  function giveSelectedGun() {
    const id = el('devWeaponSelect').value;
    const rarity = Number(el('devRaritySelect').value);
    if (DevAPI.giveGun(id, rarity, 1)) log('Gave ' + id + ' (rarity ' + rarity + ')');
    else log('Failed to give weapon: ' + id);
  }

  function spawnSelectedEnemy() {
    const val = el('devEnemySelect').value;
    const elite = el('devEnemyElite').checked;
    if (val.startsWith('boss:')) {
      const bossId = val.slice(5);
      const e = DevAPI.spawnEnemy(null, false, bossId);
      log(e ? 'Spawned boss: ' + bossId : 'Boss spawn failed: ' + bossId);
      return;
    }
    const e = DevAPI.spawnEnemy(val, elite, null);
    log(e ? 'Spawned ' + val + (elite ? ' (elite)' : '') : 'Spawn failed: ' + val);
  }

  function runCommand(raw) {
    const line = (raw || '').trim();
    if (!line) return;
    log('> ' + line);
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        log('Commands: help | maps | map <id> | gun <id> [rarity] | spawn <enemyId> [elite] | boss <id> | god [on|off] | waves | clear | heal');
        break;
      case 'maps':
        log(MAPS.map(m => m.id + ' — ' + m.label).join(' | '));
        break;
      case 'map': {
        const entry = mapById(arg);
        if (!entry) { log('Unknown map: ' + arg); break; }
        DevAPI.loadMap(entry).then(() => log('Loaded ' + entry.id)).catch(e => log(e.message));
        break;
      }
      case 'gun':
        if (DevAPI.giveGun(rest[0], Number(rest[1]) || 6, 1)) log('Gave ' + rest[0]);
        else log('Unknown weapon: ' + (rest[0] || arg));
        break;
      case 'spawn': {
        const elite = rest.includes('elite');
        const type = rest.find(x => x !== 'elite') || arg;
        const e = DevAPI.spawnEnemy(type, elite, null);
        log(e ? 'Spawned ' + type : 'Unknown enemy: ' + type);
        break;
      }
      case 'boss': {
        const e = DevAPI.spawnEnemy(null, false, arg);
        log(e ? 'Spawned boss ' + arg : 'Unknown boss: ' + arg);
        break;
      }
      case 'god':
        if (!arg || arg === 'on' || arg === '1' || arg === 'true') DevAPI.setGodMode(true);
        else if (arg === 'off' || arg === '0' || arg === 'false') DevAPI.setGodMode(false);
        else DevAPI.setGodMode(!DevAPI.godMode);
        syncGodToggle();
        log('God mode: ' + (DevAPI.godMode ? 'ON' : 'OFF'));
        break;
      case 'waves':
        DevAPI.startWaves();
        log('Waves started.');
        break;
      case 'clear':
        log('Cleared ' + DevAPI.clearEnemies() + ' enemies.');
        break;
      case 'heal':
        if (typeof G !== 'undefined' && G?.p) { G.p.hp = G.p.maxHp; G.p.armor = G.p.maxArmor; log('Healed.'); }
        break;
      default:
        log('Unknown command. Type help.');
    }
  }

  function fillSelects() {
    const mapSel = el('devMapSelect');
    mapSel.innerHTML = '';
    for (const m of MAPS) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      mapSel.appendChild(o);
    }

    const wpnSel = el('devWeaponSelect');
    wpnSel.innerHTML = '';
    for (const id of DevAPI.weapons()) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id + ' — ' + WEAPONS[id].name;
      wpnSel.appendChild(o);
    }
    wpnSel.value = 'ar';

    const rarSel = el('devRaritySelect');
    rarSel.innerHTML = '';
    RARITIES.forEach((r, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = i + ' — ' + r.name;
      rarSel.appendChild(o);
    });
    rarSel.value = '6';

    const enemySel = el('devEnemySelect');
    enemySel.innerHTML = '';
    for (const id of DevAPI.enemies()) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id + ' — ' + ETYPES[id].fac;
      enemySel.appendChild(o);
    }
    for (const id of DevAPI.bosses()) {
      const o = document.createElement('option');
      o.value = 'boss:' + id;
      o.textContent = 'BOSS: ' + id + ' — ' + BOSSES[id].name;
      enemySel.appendChild(o);
    }
  }

  function isToggleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.code === 'Backquote' || e.code === 'IntlBackslash') return true;
    if (e.code === 'F1') return true;
    return false;
  }

  function onToggleKey(e) {
    if (!isToggleKey(e)) return;
    const cmd = el('devCmd');
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target === cmd) return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }

  function wire() {
    el('devClose').onclick = () => setOpen(false);
    el('devLoadMap').onclick = () => loadSelectedMap();
    el('devRefreshMaps')?.addEventListener('click', async () => {
      const n = await loadSceneMaps();
      fillSelects();
      log('Refreshed map list (' + n + ' scenes). Run npm run scenes:manifest after adding files.');
    });
    el('devGiveGun').onclick = () => giveSelectedGun();
    el('devSpawnEnemy').onclick = () => spawnSelectedEnemy();
    el('devStartWaves').onclick = () => { DevAPI.startWaves(); log('Waves started.'); };
    el('devKillAll').onclick = () => log('Cleared ' + DevAPI.clearEnemies() + ' enemies.');
    el('devGodMode').onchange = e => {
      DevAPI.setGodMode(e.target.checked);
      log('God mode: ' + (DevAPI.godMode ? 'ON' : 'OFF'));
    };

    const cmd = el('devCmd');
    cmd.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        runCommand(cmd.value);
        cmd.value = '';
        e.preventDefault();
      }
      if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
    });

    addEventListener('keydown', onToggleKey, true);
    el('devToggleBtn')?.addEventListener('click', e => { e.preventDefault(); toggle(); });
  }

  async function init() {
    if (!el('devConsole')) return;
    const count = await loadSceneMaps();
    fillSelects();
    wire();
    log('Loaded ' + count + ' scene maps from assets/data/scene-manifest.json');
    log('Press F1 or ` (backtick) to toggle. Type help in command line.');
    if (location.search.includes('dev=1')) setOpen(true);
  }

  return { init, loadSceneMaps, get MAPS() { return MAPS; }, toggle, log };
})();

window.DevConsole = DevConsole;
