/* EARTH 2049 — CLOUD SAVE client (docs/ACCOUNTS.md). One account, every save, on every device.
 *
 * Shared by both titles. The FPS loads this file; the idle game carries a copy between its CLOUD SAVE markers
 * (keep CLOUD_SAVE_VERSION equal in both: tests/accounts-client.test.js checks it).
 *
 *   CloudSave.init({ slot, get, apply, meta, fresh, overlay })
 *     slot     'fps' | 'grid' | 'idle'
 *     get()    the save as a string (no timestamps, so an unchanged game hashes the same)
 *     apply(s) replace the running game with a downloaded save
 *     meta()   a few short numbers/strings for the "which save?" choice (loop, GT, label)
 *     fresh()  true when this device has nothing worth keeping (a cloud save then loads without asking)
 *   CloudSave.openPanel()   the account screen: sign in by emailed code, sync, versions, export, sign out, delete
 *
 * The game keeps saving locally exactly as before. Signed in, it uploads when the save has changed (every 3 minutes,
 * on demand, and when the page is hidden) and checks for a newer cloud save on start. Every upload names the cloud
 * revision it was based on; when two devices both moved on, the player chooses which save to keep.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CloudSave = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CLOUD_SAVE_VERSION = 1;
  const DEFAULT_API = 'https://earth2049-coop.chandler-fac.workers.dev/api';
  const EVERY_MS = 180000;
  const ACC_KEY = 'e2049_account', DEV_KEY = 'e2049_device';

  /* ------------------------------------------------------------------ pure helpers (tested in node) */
  function hash(s) {                       // FNV-1a, 32-bit: change detection only
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  /** what a sync should do, from the cloud revision, the last synced state and whether this device changed since */
  function plan(remoteRev, last, localHash, isFresh) {
    const lastRev = last && last.rev || 0;
    const changed = !last || last.hash !== localHash;
    if (remoteRev === 0) return 'upload';                                       // nothing in the cloud yet
    if (!last || !last.hash) return isFresh ? 'download' : 'choose';          // first time on this device
    if (remoteRev === lastRev) return changed ? 'upload' : 'none';
    if (remoteRev > lastRev) return changed ? 'choose' : 'download';          // another device saved since
    return 'choose';                                                            // the cloud went backwards (restored elsewhere)
  }
  function deviceName(ua) {
    ua = String(ua || '');
    const os = /OculusBrowser|Quest/.test(ua) ? 'Quest' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
      : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
    const br = /Electron/.test(ua) ? 'desktop app' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
    return br + ' on ' + os;
  }
  function ago(ms, now = Date.now()) {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ------------------------------------------------------------------ browser */
  const hasDom = typeof document !== 'undefined';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  const S = { opt: null, busy: false, status: '', statusAt: 0, timer: 0, panel: null, listeners: [] };

  function apiBase() {
    try {
      // ?api= points this tab at another API (local testing); the city grid's frame shares the tab's sessionStorage
      const q = new URLSearchParams(location.search).get('api');
      if (q && /^https?:\/\//.test(q)) { try { sessionStorage.setItem('e2049.api', q); } catch (e) { /* blocked */ } return q.replace(/\/$/, ''); }
      const s = sessionStorage.getItem('e2049.api') || localStorage.getItem('e2049.api');
      if (s) return s.replace(/\/$/, '');
    } catch (e) { /* default */ }
    return DEFAULT_API;
  }
  const account = () => ls.get(ACC_KEY);
  const signedIn = () => !!(account() && account().token);
  function device() {
    let d = ls.get(DEV_KEY);
    if (!d) { d = deviceName(typeof navigator !== 'undefined' && navigator.userAgent); ls.set(DEV_KEY, d); }
    return d;
  }
  const lastKey = () => 'e2049_cloud_' + S.opt.slot + '_' + (account() && account().account && account().account.id || 'x');
  function setStatus(t) { S.status = t; S.statusAt = Date.now(); paintPanel(); S.listeners.forEach(f => { try { f(t); } catch (e) { /* listener */ } }); }

  async function req(method, path, body, opts = {}) {
    const a = account();
    const headers = { 'content-type': 'application/json', 'x-e2049-device': device() };
    if (a && a.token) headers.authorization = 'Bearer ' + a.token;
    let r;
    try { r = await fetch(apiBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive: !!opts.keepalive }); }
    catch (e) { const x = new Error('offline'); x.code = 'offline'; throw x; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/auth/email/verify') { ls.set(ACC_KEY, null); }
    if (!r.ok) { const x = new Error(j.error || 'http_' + r.status); x.code = j.error || 'http_' + r.status; x.status = r.status; x.body = j; throw x; }
    return j;
  }
  const MSG = {
    offline: 'Offline. Saved on this device; it will sync when the connection is back.',
    signed_out: 'Signed out. Sign in again to keep syncing.',
    mail_not_configured: 'Email sign-in is not switched on yet.',
    slow_down: 'Too many tries. Wait a few minutes and try again.',
    bad_email: 'That email address does not look right.',
    wrong_code: 'That code is not right.',
    code_expired: 'That code has expired. Send a new one.',
    save_too_large: 'This save is too large to upload.',
    busy: 'A newer cloud save is waiting; it loads when you are back at the menu.',
  };
  const explain = e => MSG[e && e.code] || 'Something went wrong (' + (e && e.code || 'error') + ').';

  /* ---- sync ---- */
  async function download(rev) {
    const r = rev ? await req('GET', `/saves/${S.opt.slot}/history/${rev}`) : await req('GET', '/saves/' + S.opt.slot);
    if (!r.data) return false;
    await S.opt.apply(r.data);
    const cur = rev ? (await req('GET', '/saves')).saves.find(s => s.slot === S.opt.slot) : r;
    ls.set(lastKey(), { rev: rev ? 0 : r.rev, hash: rev ? '' : hash(S.opt.get()), at: Date.now() });
    if (rev) await upload(cur ? cur.rev : 0, true);          // a restored version becomes the newest
    return true;
  }
  async function upload(baseRev, force, keepalive) {
    const data = S.opt.get();
    const r = await req('PUT', '/saves/' + S.opt.slot, { baseRev, force: !!force, data, meta: safeMeta() }, { keepalive });
    ls.set(lastKey(), { rev: r.rev, hash: hash(data), at: Date.now() });
    return r;
  }
  function safeMeta() { try { return Object.assign({ device: device() }, S.opt.meta ? S.opt.meta() : {}); } catch (e) { return { device: device() }; } }

  async function sync(opts = {}) {
    if (!S.opt || !signedIn() || S.busy) return;
    S.busy = true;
    try {
      const list = (await req('GET', '/saves')).saves;
      const remote = list.find(s => s.slot === S.opt.slot) || { rev: 0 };
      const last = ls.get(lastKey());
      const local = S.opt.get();
      let what = plan(remote.rev, last, hash(local), !!(S.opt.fresh && S.opt.fresh()));
      if (what === 'choose') {
        const pick = await choose(safeMeta(), remote);
        what = pick === 'cloud' ? 'download' : pick === 'device' ? 'force' : 'none';
        if (what === 'none') { setStatus('Not synced: choose a save to keep syncing.'); return; }
      }
      if (what === 'download') { await download(); setStatus('Loaded the cloud save from ' + (remote.device || 'another device') + '.'); }
      else if (what === 'upload' || what === 'force') {
        try { await upload(remote.rev, what === 'force'); }
        catch (e) { if (e.code === 'conflict' && !opts.retried) { S.busy = false; return sync({ retried: true }); } throw e; }
        setStatus('Synced ' + ago(Date.now()) + '.');
      } else setStatus('Up to date.');
    } catch (e) { setStatus(explain(e)); }
    finally { S.busy = false; }
  }
  /** on hide: one quick upload if this device changed, without asking anything */
  function flush() {
    if (!S.opt || !signedIn()) return;
    const last = ls.get(lastKey());
    if (!last || !last.hash || last.hash === hash(S.opt.get())) return;
    upload(last.rev, false, true).catch(() => { /* next start sorts it out */ });
  }

  /* ---- sign-in ---- */
  async function startEmail(email) { return req('POST', '/auth/email/start', { email }); }
  async function verifyEmail(email, code) {
    const r = await req('POST', '/auth/email/verify', { email, code });
    if (r.token) ls.set(ACC_KEY, { token: r.token, account: r.account });
    else { const a = account(); if (a) { a.account = r.account; ls.set(ACC_KEY, a); } }
    await sync();
    return r;
  }
  async function signOut() { try { await req('POST', '/auth/logout', {}); } catch (e) { /* the session may already be gone */ } ls.set(ACC_KEY, null); setStatus(''); }
  async function deleteAccount() { await req('DELETE', '/account'); ls.set(ACC_KEY, null); setStatus('Account deleted. This device still has its own save.'); }
  async function exportAll() {
    const r = await req('GET', '/account/export');
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'earth2049-account.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }

  /* ------------------------------------------------------------------ UI */
  const esc = t => String(t == null ? '' : t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  function css() {
    if (document.getElementById('e49csCss')) return;
    const s = document.createElement('style'); s.id = 'e49csCss';
    s.textContent = `.e49cs{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:rgba(5,3,12,.92);font-family:Consolas,Menlo,"E2049 Mono",monospace;color:#e8e2ff}
.e49cs .box{width:min(520px,92vw);max-height:90vh;overflow:auto;border:1px solid rgba(155,89,255,.6);border-radius:12px;background:#0d0820;padding:22px 22px 18px;box-shadow:0 0 40px rgba(155,89,255,.25);text-align:left}
.e49cs h2{margin:0 0 4px;font-size:16px;letter-spacing:.3em;color:#c9a6ff}.e49cs .sub{font-size:11px;opacity:.6;letter-spacing:.15em;margin-bottom:14px}
.e49cs p{font-size:12.5px;line-height:1.55;margin:8px 0}.e49cs .st{font-size:12px;color:#9eb4ff;min-height:1.4em}
.e49cs input{width:100%;box-sizing:border-box;padding:11px 12px;margin:6px 0 10px;background:#07050f;border:1px solid rgba(155,89,255,.5);border-radius:8px;color:#fff;font:inherit;font-size:15px}
.e49cs .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.e49cs button{cursor:pointer;padding:10px 14px;border-radius:8px;border:1px solid rgba(155,89,255,.55);background:rgba(155,89,255,.12);color:#e8e2ff;font:inherit;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.e49cs button.primary{background:#9b59ff;color:#07050f;border-color:#9b59ff;font-weight:bold}.e49cs button.danger{border-color:#ff4d6d;color:#ff8fa3}
.e49cs button:disabled{opacity:.45;cursor:default}.e49cs .cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.e49cs .card{border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:10px;font-size:12px;line-height:1.6}.e49cs .card b{color:#ffe14d;display:block;letter-spacing:.15em;font-size:11px}
.e49cs .vers{font-size:12px;margin-top:8px}.e49cs .vers div{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)}
@media (max-width:520px){.e49cs .cards{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }
  function shell(id) {
    css();
    let o = document.getElementById(id);
    if (!o) { o = document.createElement('div'); o.id = id; document.body.appendChild(o); }
    o.className = 'e49cs ' + ((S.opt && S.opt.overlayClass) || '') + ' show';
    return o;
  }
  function metaLines(m) {
    if (!m) return '';
    return Object.entries(m).filter(([k]) => k !== 'device').slice(0, 6).map(([k, v]) => esc(k.toUpperCase()) + ': ' + esc(v)).join('<br>');
  }
  /** ask which save to keep; resolves 'device' | 'cloud' | 'later' */
  function choose(localMeta, remote) {
    if (!hasDom) return Promise.resolve('later');
    return new Promise(res => {
      const o = shell('e49csChoose');
      o.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="e49csChT"><h2 id="e49csChT">TWO SAVES</h2>
        <div class="sub">${esc(S.opt.title || 'EARTH 2049')}</div>
        <p>This device and your account both have progress. Pick the one to keep; the other stays in Previous versions for a while.</p>
        <div class="cards"><div class="card"><b>THIS DEVICE</b>${esc(localMeta.device)}<br>${metaLines(localMeta)}</div>
        <div class="card"><b>CLOUD</b>${esc(remote.device || 'another device')} · ${esc(remote.updated ? ago(remote.updated) : '')}<br>${metaLines(remote.meta)}</div></div>
        <div class="row"><button class="primary" data-k="device">Keep this device</button><button data-k="cloud">Use the cloud save</button><button data-k="later">Decide later</button></div></div>`;
      o.querySelectorAll('button').forEach(b => b.onclick = () => { o.remove(); res(b.dataset.k); });
      setTimeout(() => o.querySelector('button')?.focus(), 50);
    });
  }
  let panelMode = 'main', pendingEmail = '', versions = null, health = null;
  function openPanel() {
    if (!hasDom) return;
    panelMode = signedIn() ? 'main' : 'email'; versions = null; S.panel = shell('e49csPanel'); paintPanel();
    // email sign-in is off until a sending domain is set up on the server: say so instead of showing a form that cannot work
    if (!signedIn() && !health) req('GET', '/health').then(h => { health = h; paintPanel(); }).catch(() => { health = { offline: true }; paintPanel(); });
  }
  function closePanel() { if (S.panel) { S.panel.remove(); S.panel = null; } if (S.opt && S.opt.onClose) S.opt.onClose(); }
  function paintPanel() {
    const o = S.panel; if (!o || !document.body.contains(o)) return;
    // a repaint must never eat what the player is typing
    const typed = { em: o.querySelector('#e49csEm'), code: o.querySelector('#e49csCode'), del: o.querySelector('#e49csDel') };
    if (typed.em) pendingEmail = typed.em.value;
    const keep = { code: typed.code ? typed.code.value : '', del: typed.del ? typed.del.value : '', focus: document.activeElement && document.activeElement.id };
    const a = account(), last = S.opt ? ls.get(lastKey()) : null;
    let html = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="e49csPT"><h2 id="e49csPT">CLOUD SAVE</h2><div class="sub">ONE ACCOUNT · EVERY EARTH 2049 SAVE · EVERY DEVICE</div>`;
    if (!signedIn() && health && !health.mail) {
      html += `<p>${health.offline ? 'Cloud saves are out of reach right now.' : 'Cloud saves are coming soon.'} Your progress is saved on this device in the meantime, and the save code or export keeps a copy you can carry.</p>
        <div class="row"><button class="primary" data-a="close">Back</button></div>`;
    } else if (!signedIn() && panelMode === 'email') {
      html += `<p>Sign in to keep your progress safe and pick it up on any device. There is no password: we email you a 6-digit code.</p>
        <label for="e49csEm" style="font-size:11px;letter-spacing:.15em;opacity:.7">EMAIL</label><input id="e49csEm" type="email" autocomplete="email" inputmode="email" value="${esc(pendingEmail)}">
        <div class="st" aria-live="polite">${esc(S.status)}</div>
        <div class="row"><button class="primary" data-a="send">Send code</button><button data-a="close">Back</button></div>
        <p style="opacity:.55;font-size:11px">Your email is used only to sign you in. Playing without an account keeps working: your progress stays on this device.</p>`;
    } else if (!signedIn() && panelMode === 'code') {
      html += `<p>We sent a code to <b>${esc(pendingEmail)}</b>. It works for 10 minutes.</p>
        <label for="e49csCode" style="font-size:11px;letter-spacing:.15em;opacity:.7">CODE</label><input id="e49csCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*">
        <div class="st" aria-live="polite">${esc(S.status)}</div>
        <div class="row"><button class="primary" data-a="verify">Sign in</button><button data-a="email">Use another email</button><button data-a="close">Back</button></div>`;
    } else if (signedIn() && panelMode === 'delete') {
      html += `<p><b>Delete your account?</b> This removes the account and every cloud save of every Earth 2049 game, for good. Saves already on your devices stay there.</p>
        <label for="e49csDel" style="font-size:11px;letter-spacing:.15em;opacity:.7">TYPE DELETE TO CONFIRM</label><input id="e49csDel" autocomplete="off">
        <div class="st" aria-live="polite">${esc(S.status)}</div>
        <div class="row"><button class="danger" data-a="delete2">Delete my account</button><button data-a="main">Cancel</button></div>`;
    } else if (signedIn()) {
      const who = (a.account && a.account.logins || []).map(l => l.label).join(' · ') || 'Signed in';
      html += `<p>Signed in as <b>${esc(who)}</b>.</p>
        <p>This game syncs automatically${last && last.at ? '; last synced ' + esc(ago(last.at)) : ''}.</p>
        <div class="st" aria-live="polite">${esc(S.status)}</div>
        <div class="row"><button class="primary" data-a="sync">Sync now</button><button data-a="vers">Previous versions</button><button data-a="close">Back</button></div>`;
      if (versions) html += `<div class="vers">${versions.length ? versions.map(v => `<div><span>${esc(ago(v.updated))} · ${esc(v.device || '')}<br><span style="opacity:.6">${metaLines(v.meta)}</span></span><button data-r="${v.rev}">Restore</button></div>`).join('') : '<p>No versions yet.</p>'}</div>`;
      html += `<div class="row" style="margin-top:16px"><button data-a="export">Download my data</button><button data-a="out">Sign out</button><button class="danger" data-a="delete">Delete account</button></div>`;
    }
    o.innerHTML = html + '</div>';
    const $ = s => o.querySelector(s);
    const busy = async (fn) => { o.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); } catch (e) { setStatus(explain(e)); } paintPanel(); };
    o.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const k = b.dataset.a;
      if (k === 'close') return closePanel();
      if (k === 'main' || k === 'email') { panelMode = k; S.status = ''; return paintPanel(); }
      if (k === 'send') return busy(async () => { pendingEmail = $('#e49csEm').value.trim(); S.status = ''; await startEmail(pendingEmail); panelMode = 'code'; setStatus(''); });
      if (k === 'verify') return busy(async () => { await verifyEmail(pendingEmail, $('#e49csCode').value); panelMode = 'main'; });
      if (k === 'sync') return busy(() => sync());
      if (k === 'vers') return busy(async () => { versions = (await req('GET', `/saves/${S.opt.slot}/history`)).history; });
      if (k === 'export') return busy(exportAll);
      if (k === 'out') return busy(async () => { await signOut(); panelMode = 'email'; });
      if (k === 'delete') { panelMode = 'delete'; S.status = ''; return paintPanel(); }
      if (k === 'delete2') {
        if ($('#e49csDel').value.trim().toUpperCase() !== 'DELETE') { setStatus('Type DELETE to confirm.'); return; }
        return busy(async () => { await deleteAccount(); panelMode = 'email'; });
      }
    });
    o.querySelectorAll('[data-r]').forEach(b => b.onclick = () => busy(async () => { await download(+b.dataset.r); versions = null; setStatus('Restored that version.'); }));
    if ($('#e49csCode') && keep.code) $('#e49csCode').value = keep.code;
    if ($('#e49csDel') && keep.del) $('#e49csDel').value = keep.del;
    const first = (keep.focus && $('#' + keep.focus)) || $('input') || $('button.primary');
    if (first) setTimeout(() => first.focus(), 30);
    const enter = $('#e49csEm') || $('#e49csCode');
    if (enter) enter.onkeydown = e => { if (e.key === 'Enter') $('button.primary').click(); };
  }

  /* ------------------------------------------------------------------ init */
  function init(opt) {
    S.opt = opt;
    if (!hasDom) return;
    clearInterval(S.timer);
    S.timer = setInterval(() => sync(), opt.everyMs || EVERY_MS);
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    addEventListener('pagehide', flush);
    setTimeout(() => sync(), opt.firstDelayMs ?? 2500);
  }
  return { CLOUD_SAVE_VERSION, init, sync, flush, openPanel, closePanel, signedIn, account, startEmail, verifyEmail, signOut, deleteAccount,
    onStatus: f => S.listeners.push(f), get status() { return S.status; }, _: { hash, plan, deviceName, ago } };
});
