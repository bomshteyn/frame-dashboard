-- First time each album photo was indexed, and when it was last sent to a frame.
-- Existing photos are backfilled with added = 0 so they count as "older".
CREATE TABLE IF NOT EXISTS photo_seen (
  album TEXT NOT NULL,
  id TEXT NOT NULL,
  added INTEGER NOT NULL,
  served INTEGER,
  PRIMARY KEY (album, id)
);
INSERT OR IGNORE INTO photo_seen (album, id, added) SELECT DISTINCT album, id, 0 FROM album_photo;
