CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_fail (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_fail_ip_ts ON login_fail (ip, ts);
CREATE TABLE IF NOT EXISTS album_photo (album TEXT NOT NULL, gen INTEGER NOT NULL, id TEXT NOT NULL, src TEXT NOT NULL, date TEXT, o TEXT, PRIMARY KEY (album, gen, id));
CREATE TABLE IF NOT EXISTS album_scan (album TEXT PRIMARY KEY, live_gen INTEGER, scan_gen INTEGER, token TEXT, sid TEXT, bl TEXT, aid TEXT, akey TEXT, started INTEGER, finished INTEGER, count INTEGER);
