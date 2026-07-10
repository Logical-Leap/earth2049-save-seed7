/* EARTH 2049 co-op network config (UMD/no-build) */
'use strict';
(function (global) {
  const params = new URLSearchParams(location.search);
  const stored = (() => { try { return localStorage.getItem('e2049.coop.workerUrl') || ''; } catch (e) { return ''; } })();
  const officialWorkerUrl = location.hostname === 'earth2049-save-seed7.pages.dev' ? 'https://earth2049-coop.chandler-fac.workers.dev' : '';
  const NET_CONFIG = {
    // The official Pages deployment must not be hijacked by a stale localhost or
    // retired Worker URL saved before production was configured. A query-string
    // override remains available for explicit diagnostics.
    workerUrl: params.get('coopWorker') || officialWorkerUrl || stored,
    protocolVersion: 2,
    maxPlayers: 4,
    snapshotHz: 15,
    enemySnapshotHz: 5,
    reconnectMs: 2500,
    roomCodeLength: 5,
    devMock: params.get('coopMock') === '1',
    partyScaling: {
      1: { enemyHp: 1.00, enemyCount: 1.00 },
      2: { enemyHp: 1.45, enemyCount: 1.25 },
      3: { enemyHp: 1.85, enemyCount: 1.45 },
      4: { enemyHp: 2.25, enemyCount: 1.65 }
    },
    mentorSync: { effectiveLevelCapOverMission: 10 },
  };
  function setWorkerUrl(url) {
    NET_CONFIG.workerUrl = String(url || '').trim();
    try { localStorage.setItem('e2049.coop.workerUrl', NET_CONFIG.workerUrl); } catch (e) {}
  }
  function httpUrl(path) {
    const base = NET_CONFIG.workerUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
    return base + path;
  }
  function wsUrl(path) {
    const base = NET_CONFIG.workerUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '');
    return base + path;
  }
  global.NET_CONFIG = NET_CONFIG;
  global.NetConfig = { NET_CONFIG, setWorkerUrl, httpUrl, wsUrl };
})(window);
