/* EARTH 2049 — accounts and cloud saves (docs/ACCOUNTS.md).
 *
 * Mounted under /api on the earth2049-coop Worker. One account holds every save of both titles:
 *   fps   Save Seed 7
 *   grid  the idle game inside Save Seed 7 (the city grid)
 *   idle  Earth 2049 Idle, standalone
 *
 * Sign-in: a one-time code sent by email (Cloudflare Email Service binding EMAIL, sender MAIL_FROM), or a Steam
 * session ticket checked with the Steamworks Web API (secrets STEAM_WEB_API_KEY, STEAM_APP_ID). Sessions are bearer
 * tokens; only their SHA-256 is stored. Saves carry a revision number and an upload must name the revision it was
 * based on, so an older device can never silently overwrite a newer save. The last 10 versions of each slot are kept.
 */
'use strict';

export const SLOTS = ['fps', 'grid', 'idle'];
export const LIMITS = {
  saveBytes: 64 * 1024, metaBytes: 2 * 1024, history: 10,
  codeTtl: 10 * 60 * 1000, codeTries: 5, sessionTtl: 90 * 24 * 3600 * 1000,
  perEmailHour: 5, perIpHour: 30, savesPerMinute: 30,
};
const DEFAULT_ORIGINS = ['https://logical-leap.github.io', 'https://earth2049-save-seed7.pages.dev'];

/* ------------------------------------------------------------------ helpers */
const enc = new TextEncoder();
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode() {
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}
function newId() { return 'acc_' + randomToken(12); }
function cleanEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = DEFAULT_ORIGINS.concat(list);
  if (ok.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  if (/^https:\/\/earth2049-idle-real[a-z0-9-]*\.vercel\.app$/.test(origin)) return origin;
  return null;
}
export function corsHeaders(request, env) {
  const h = new Headers();
  const o = allowedOrigin(request.headers.get('origin'), env);
  if (o) {
    h.set('access-control-allow-origin', o);
    h.set('vary', 'origin');
    h.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    h.set('access-control-allow-headers', 'authorization,content-type,x-e2049-device');
    h.set('access-control-max-age', '600');
  }
  return h;
}
function json(request, env, data, status = 200) {
  const h = corsHeaders(request, env);
  h.set('content-type', 'application/json');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
}
const err = (request, env, status, code, extra = {}) => json(request, env, { error: code, ...extra }, status);
async function body(request, max = LIMITS.saveBytes * 2) {
  const t = await request.text();
  if (t.length > max) throw Object.assign(new Error('too_large'), { status: 413 });
  try { return t ? JSON.parse(t) : {}; } catch { throw Object.assign(new Error('bad_json'), { status: 400 }); }
}
function ip(request) { return request.headers.get('cf-connecting-ip') || 'local'; }

/** fixed-window limiter; true when the call is allowed */
async function limit(env, key, max, windowMs) {
  const w = Math.floor(Date.now() / windowMs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key, win, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN win = ?2 THEN count + 1 ELSE 1 END, win = ?2
     RETURNING count`).bind(key, w).first();
  return (row?.count || 1) <= max;
}

/* ------------------------------------------------------------------ sessions */
async function newSession(env, accountId) {
  const token = randomToken(32), now = Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash, account_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), accountId, now, now + LIMITS.sessionTtl).run();
  return token;
}
async function who(request, env) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const h = await sha256(m[1]), now = Date.now();
  const row = await env.DB.prepare('SELECT account_id, expires FROM sessions WHERE token_hash = ?1').bind(h).first();
  if (!row || row.expires < now) return null;
  // sliding expiry, written at most once a day
  if (row.expires - now < LIMITS.sessionTtl - 24 * 3600 * 1000) {
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET expires = ?2 WHERE token_hash = ?1').bind(h, now + LIMITS.sessionTtl),
      env.DB.prepare('UPDATE accounts SET last_seen = ?2 WHERE id = ?1').bind(row.account_id, now),
    ]);
  }
  return { id: row.account_id, tokenHash: h };
}
async function accountView(env, id) {
  const acc = await env.DB.prepare('SELECT id, created FROM accounts WHERE id = ?1').bind(id).first();
  if (!acc) return null;
  const { results } = await env.DB.prepare('SELECT provider, subject FROM logins WHERE account_id = ?1 ORDER BY created').bind(id).all();
  const logins = results.map(l => ({ provider: l.provider, label: l.provider === 'email' ? maskEmail(l.subject) : 'Steam ' + l.subject.slice(-4) }));
  return { id: acc.id, created: acc.created, logins };
}
function maskEmail(e) { const [u, d] = e.split('@'); return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d; }

/** find the account for a login, or make one; a signed-in caller links the login to their own account instead */
async function signInWith(env, provider, subject, current) {
  const now = Date.now();
  const found = await env.DB.prepare('SELECT account_id FROM logins WHERE provider = ?1 AND subject = ?2').bind(provider, subject).first();
  if (current) {
    if (found && found.account_id !== current.id) return { error: 'login_in_use' };
    if (!found) await env.DB.prepare('INSERT INTO logins(provider, subject, account_id, created) VALUES (?1, ?2, ?3, ?4)').bind(provider, subject, current.id, now).run();
    return { accountId: current.id, linked: !found, created: false };
  }
  if (found) return { accountId: found.account_id, created: false };
  const id = newId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO accounts(id, created, last_seen) VALUES (?1, ?2, ?2)').bind(id, now),
    env.DB.prepare('INSERT INTO logins(provider, subject, account_id, created) VALUES (?1, ?2, ?3, ?4)').bind(provider, subject, id, now),
  ]);
  return { accountId: id, created: true };
}

/* ------------------------------------------------------------------ email codes */
async function sendCode(env, email, code) {
  if (env.EMAIL && env.MAIL_FROM) {
    await env.EMAIL.send({
      to: email,
      from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || 'Earth 2049' },
      subject: `Your Earth 2049 sign-in code: ${code}`,
      text: `Your Earth 2049 sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.\n`,
      html: `<div style="font-family:Consolas,Menlo,monospace;background:#07050f;color:#e8e2ff;padding:28px;border-radius:10px">
        <div style="letter-spacing:.3em;color:#9b59ff;font-size:12px">EARTH 2049</div>
        <p style="font-size:14px">Your sign-in code:</p>
        <div style="font-size:34px;letter-spacing:.4em;color:#ffe14d;font-weight:bold">${code}</div>
        <p style="font-size:12px;opacity:.7">It works for 10 minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.</p></div>`,
    });
    return 'sent';
  }
  if (env.DEV_ECHO_CODES === '1') return 'echo';          // local development only: wrangler.jsonc never sets this
  throw Object.assign(new Error('mail_not_configured'), { status: 503 });
}

/* ------------------------------------------------------------------ Steam */
async function steamId(env, ticket) {
  if (!env.STEAM_WEB_API_KEY || !env.STEAM_APP_ID) throw Object.assign(new Error('steam_not_configured'), { status: 503 });
  if (!/^[0-9a-fA-F]{20,4096}$/.test(String(ticket || ''))) throw Object.assign(new Error('bad_ticket'), { status: 400 });
  const u = new URL('https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/');
  u.searchParams.set('key', env.STEAM_WEB_API_KEY);
  u.searchParams.set('appid', env.STEAM_APP_ID);
  u.searchParams.set('ticket', ticket);
  u.searchParams.set('identity', 'earth2049-api');
  const r = await fetch(u);
  const j = await r.json().catch(() => null);
  const p = j?.response?.params;
  if (!r.ok || p?.result !== 'OK' || !/^\d{17}$/.test(String(p?.steamid || ''))) throw Object.assign(new Error('steam_rejected'), { status: 401 });
  return String(p.steamid);
}

/* ------------------------------------------------------------------ saves */
function cleanMeta(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return '{}';
  const out = {};
  for (const [k, v] of Object.entries(m).slice(0, 16)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[String(k).slice(0, 24)] = v;
    else if (typeof v === 'string') out[String(k).slice(0, 24)] = v.slice(0, 80);
  }
  const s = JSON.stringify(out);
  return s.length <= LIMITS.metaBytes ? s : '{}';
}
const parseMeta = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

async function putSave(env, acc, slot, b, device) {
  const data = b.data;
  if (typeof data !== 'string' || !data.length) return { status: 400, body: { error: 'no_data' } };
  if (data.length > LIMITS.saveBytes) return { status: 413, body: { error: 'save_too_large', max: LIMITS.saveBytes } };
  try { const p = JSON.parse(data); if (!p || typeof p !== 'object') throw 0; } catch { return { status: 400, body: { error: 'save_not_json' } }; }
  const meta = cleanMeta(b.meta), now = Date.now();
  const cur = await env.DB.prepare('SELECT rev, meta, updated, device FROM saves WHERE account_id = ?1 AND slot = ?2').bind(acc.id, slot).first();
  const curRev = cur ? cur.rev : 0;
  const base = Number.isInteger(b.baseRev) ? b.baseRev : -1;
  if (!b.force && base !== curRev) {
    return { status: 409, body: { error: 'conflict', rev: curRev, updated: cur?.updated || 0, meta: parseMeta(cur?.meta), device: cur?.device || '' } };
  }
  const rev = curRev + 1;
  const stmts = [
    cur
      ? env.DB.prepare('UPDATE saves SET rev = ?3, data = ?4, meta = ?5, device = ?6, updated = ?7 WHERE account_id = ?1 AND slot = ?2 AND rev = ?8')
          .bind(acc.id, slot, rev, data, meta, device, now, curRev)
      : env.DB.prepare('INSERT INTO saves(account_id, slot, rev, data, meta, device, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
          .bind(acc.id, slot, rev, data, meta, device, now),
    env.DB.prepare('INSERT OR REPLACE INTO save_history(account_id, slot, rev, data, meta, device, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(acc.id, slot, rev, data, meta, device, now),
    env.DB.prepare('DELETE FROM save_history WHERE account_id = ?1 AND slot = ?2 AND rev <= ?3').bind(acc.id, slot, rev - LIMITS.history),
  ];
  let res;
  try { res = await env.DB.batch(stmts); } catch { return { status: 409, body: { error: 'conflict', rev: curRev } }; }  // a racing insert
  if (cur && !res[0].meta.changes) return { status: 409, body: { error: 'conflict', rev: curRev } };                   // a racing update
  return { status: 200, body: { ok: true, rev, updated: now } };
}

/* ------------------------------------------------------------------ router */
export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (!env.DB) return err(request, env, 503, 'accounts_not_configured');
  const device = String(request.headers.get('x-e2049-device') || '').slice(0, 40);
  try {
    if (path === '/health') return json(request, env, { ok: true, service: 'earth2049-accounts', mail: !!((env.EMAIL && env.MAIL_FROM) || env.DEV_ECHO_CODES === '1'), steam: !!(env.STEAM_WEB_API_KEY && env.STEAM_APP_ID) });

    /* ---- email sign-in ---- */
    if (path === '/auth/email/start' && request.method === 'POST') {
      const b = await body(request, 2048);
      const email = cleanEmail(b.email);
      if (!email) return err(request, env, 400, 'bad_email');
      if (!(await limit(env, 'code:ip:' + ip(request), LIMITS.perIpHour, 3600e3)) ||
          !(await limit(env, 'code:em:' + email, LIMITS.perEmailHour, 3600e3))) return err(request, env, 429, 'slow_down');
      const code = randomCode();
      await env.DB.prepare(`INSERT INTO login_codes(email, code_hash, expires, tries) VALUES (?1, ?2, ?3, 0)
        ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires = ?3, tries = 0`)
        .bind(email, await sha256(email + ':' + code), Date.now() + LIMITS.codeTtl).run();
      const how = await sendCode(env, email, code);
      return json(request, env, how === 'echo' ? { ok: true, devCode: code } : { ok: true });
    }
    if (path === '/auth/email/verify' && request.method === 'POST') {
      const b = await body(request, 2048);
      const email = cleanEmail(b.email), code = String(b.code || '').replace(/\D/g, '');
      if (!email || code.length !== 6) return err(request, env, 400, 'bad_code');
      const row = await env.DB.prepare('SELECT code_hash, expires, tries FROM login_codes WHERE email = ?1').bind(email).first();
      if (!row || row.expires < Date.now() || row.tries >= LIMITS.codeTries) return err(request, env, 401, 'code_expired');
      if (row.code_hash !== await sha256(email + ':' + code)) {
        await env.DB.prepare('UPDATE login_codes SET tries = tries + 1 WHERE email = ?1').bind(email).run();
        return err(request, env, 401, 'wrong_code', { triesLeft: Math.max(0, LIMITS.codeTries - row.tries - 1) });
      }
      await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
      const current = await who(request, env);
      const r = await signInWith(env, 'email', email, current);
      if (r.error) return err(request, env, 409, r.error);
      const token = current ? null : await newSession(env, r.accountId);
      return json(request, env, { ok: true, token, created: r.created, linked: !!r.linked, account: await accountView(env, r.accountId) });
    }

    /* ---- Steam sign-in (desktop builds) ---- */
    if (path === '/auth/steam' && request.method === 'POST') {
      const b = await body(request, 10000);
      if (!(await limit(env, 'steam:ip:' + ip(request), LIMITS.perIpHour, 3600e3))) return err(request, env, 429, 'slow_down');
      const sid = await steamId(env, b.ticket);
      const current = await who(request, env);
      const r = await signInWith(env, 'steam', sid, current);
      if (r.error) return err(request, env, 409, r.error);
      const token = current ? null : await newSession(env, r.accountId);
      return json(request, env, { ok: true, token, created: r.created, linked: !!r.linked, account: await accountView(env, r.accountId) });
    }

    /* ---- everything below needs a session ---- */
    const acc = await who(request, env);
    if (!acc) return err(request, env, 401, 'signed_out');

    if (path === '/me' && request.method === 'GET') return json(request, env, { account: await accountView(env, acc.id) });
    if (path === '/auth/logout' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(acc.tokenHash).run();
      return json(request, env, { ok: true });
    }
    if (path === '/account' && request.method === 'DELETE') {
      await env.DB.batch(['save_history', 'saves', 'sessions', 'logins'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE account_id = ?1`).bind(acc.id))
        .concat(env.DB.prepare('DELETE FROM accounts WHERE id = ?1').bind(acc.id)));
      return json(request, env, { ok: true, deleted: true });
    }
    if (path === '/account/export' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT slot, rev, data, meta, updated FROM saves WHERE account_id = ?1').bind(acc.id).all();
      return json(request, env, { account: await accountView(env, acc.id), exportedAt: Date.now(),
        saves: results.map(r => ({ slot: r.slot, rev: r.rev, updated: r.updated, meta: parseMeta(r.meta), data: r.data })) });
    }
    if (path === '/saves' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT slot, rev, meta, device, updated FROM saves WHERE account_id = ?1').bind(acc.id).all();
      return json(request, env, { saves: results.map(r => ({ slot: r.slot, rev: r.rev, updated: r.updated, device: r.device, meta: parseMeta(r.meta) })) });
    }
    const m = /^\/saves\/([a-z]+)(\/history(?:\/(\d+))?)?$/.exec(path);
    if (m) {
      const slot = m[1];
      if (!SLOTS.includes(slot)) return err(request, env, 404, 'no_such_slot');
      if (m[2]) {
        if (request.method !== 'GET') return err(request, env, 405, 'method');
        if (m[3]) {
          const r = await env.DB.prepare('SELECT rev, data, meta, created FROM save_history WHERE account_id = ?1 AND slot = ?2 AND rev = ?3').bind(acc.id, slot, +m[3]).first();
          return r ? json(request, env, { rev: r.rev, updated: r.created, meta: parseMeta(r.meta), data: r.data }) : err(request, env, 404, 'no_such_rev');
        }
        const { results } = await env.DB.prepare('SELECT rev, meta, device, created FROM save_history WHERE account_id = ?1 AND slot = ?2 ORDER BY rev DESC').bind(acc.id, slot).all();
        return json(request, env, { history: results.map(r => ({ rev: r.rev, updated: r.created, device: r.device, meta: parseMeta(r.meta) })) });
      }
      if (request.method === 'GET') {
        const r = await env.DB.prepare('SELECT rev, data, meta, device, updated FROM saves WHERE account_id = ?1 AND slot = ?2').bind(acc.id, slot).first();
        return r ? json(request, env, { rev: r.rev, updated: r.updated, device: r.device, meta: parseMeta(r.meta), data: r.data }) : json(request, env, { rev: 0, data: null });
      }
      if (request.method === 'PUT') {
        if (!(await limit(env, 'save:' + acc.id, LIMITS.savesPerMinute, 60e3))) return err(request, env, 429, 'slow_down');
        const r = await putSave(env, acc, slot, await body(request), device);
        return json(request, env, r.body, r.status);
      }
      return err(request, env, 405, 'method');
    }
    return err(request, env, 404, 'not_found');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('[accounts]', e && e.stack || e);
    return err(request, env, status, status === 500 ? 'server_error' : e.message);
  }
}
