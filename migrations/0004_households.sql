CREATE TABLE IF NOT EXISTS household (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
);
INSERT OR IGNORE INTO household (id, name, created) VALUES (1, 'Bomshteyn', unixepoch() * 1000);
CREATE TABLE IF NOT EXISTS household_music_auth (
  hid INTEGER PRIMARY KEY,
  token TEXT,
  device_id TEXT NOT NULL,
  profile_json TEXT,
  email TEXT,
  updated INTEGER NOT NULL
);
INSERT OR IGNORE INTO household_music_auth (hid, token, device_id, profile_json, email, updated)
SELECT 1, token, device_id, profile_json, email, updated FROM music_auth;
