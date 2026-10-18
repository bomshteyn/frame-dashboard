-- Photos hidden from the frames (tap a photo on the frame -> Hide from frame).
CREATE TABLE IF NOT EXISTS photo_hidden (
  album TEXT NOT NULL,
  id TEXT NOT NULL,
  src TEXT NOT NULL,
  date TEXT,
  mk TEXT,
  hidden INTEGER NOT NULL,
  PRIMARY KEY (album, id)
);
-- Google Photos media key, used to link a hidden photo back to Google Photos.
ALTER TABLE album_photo ADD COLUMN mk TEXT;
