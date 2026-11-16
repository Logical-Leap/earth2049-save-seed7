-- Earth 2049 accounts and cloud saves (workers/account-api.js). One account holds every save of both titles.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
-- a way to sign in: an email address or a Steam ID; an account can have both
CREATE TABLE IF NOT EXISTS logins (
  provider TEXT NOT NULL,            -- 'email' | 'steam'
  subject TEXT NOT NULL,             -- lower-cased email, or the 64-bit Steam ID
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS logins_account ON logins(account_id);
-- sessions: only a SHA-256 of the token is stored
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
-- one-time sign-in codes: hashed, short-lived, limited tries
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
-- the current save per account and slot ('fps' | 'grid' | 'idle')
CREATE TABLE IF NOT EXISTS saves (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  device TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL,
  PRIMARY KEY (account_id, slot)
);
-- the last versions of every slot, for rollback
CREATE TABLE IF NOT EXISTS save_history (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  device TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  PRIMARY KEY (account_id, slot, rev)
);
-- fixed-window rate limits (key = what is limited, e.g. 'code:ip:1.2.3.4')
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  win INTEGER NOT NULL,
  count INTEGER NOT NULL
);
