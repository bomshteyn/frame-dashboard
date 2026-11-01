CREATE TABLE IF NOT EXISTS music_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT,
  device_id TEXT NOT NULL,
  profile_json TEXT,
  email TEXT,
  updated INTEGER NOT NULL
);
