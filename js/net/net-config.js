/* EARTH 2049 co-op network config (UMD/no-build) */
'use strict';
(function (global) {
  const params = new URLSearchParams(location.search);
  const OFFICIAL = 'https://earth2049-coop.chandler-fac.workers.dev';
  // Every real build (GitHub Pages, pages.dev, the store builds) talks to the official co-op server.
  // Only a local dev copy may point somewhere else, from the advanced field, or anywhere with ?coopWorker=.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  const stored = (() => { try { return localStorage.getItem('e2049.coop.workerUrl') || ''; } catch (e) { return ''; } })();
  const NET_CONFIG = {
    officialWorkerUrl: OFFICIAL,
    workerUrl: params.get('coopWorker') || (local && stored) || OFFICIAL,
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
