# frame-dashboard (Home HQ)

Family dashboard for the Android photo frames: Cloudflare Worker + D1 + static assets.

- `worker/index.js` – Worker (API, auth, calendars, weather, Google Photos shared-album indexer, cron).
- `public/` – built dashboard (`index.html`, `m.html` phone companion, `assets/`), local photo fallback, and the kiosk APK + `version.json` the frames update from (`public/kiosk/`). Kiosk app source: [bomshteyn/frame-kiosk](https://github.com/bomshteyn/frame-kiosk).
- `migrations/` – D1 schema (all statements are idempotent).
- `test/` – `npm test` (Node 24, uses `node:sqlite` as a D1 stand-in).

The frontend in `public/assets` is the built output recovered from the live deploy; its source was not recovered.

## Photo batches

The scheduled scan indexes the shared album into `album_photo` every 12 h. `photo_seen` remembers when each photo was first indexed and when it was last sent to a frame.

Each `/api/photos?album=main` batch is 300 photos:
- up to 100 **new** photos, picked at random: added to the album in the last 30 days or taken in the last 90 days;
- the rest are random **older** photos, preferring ones not sent in the last 24 h.

Tune with the `PHOTO_*` constants in `worker/index.js`.

## Hidden photos

On the frame, the Photos screen has a **Hide** button, and pressing and holding the screensaver for 1 s opens the same dialog (a normal tap still wakes the dashboard). A hidden photo goes into `photo_hidden` and is left out of every batch. The phone page lists hidden photos under Frame → Hidden photos with **Unhide**. Photos stay in Google Photos (Google's API doesn't allow deleting or removing photos from a shared album). Code: `public/assets/photo-hide.js`, `/api/photos/hidden|hide|unhide` in `worker/index.js`.

## Deploy

```sh
npm install
npm test
npx wrangler d1 execute frame-dashboard --remote --file migrations/000N_name.sql   # only when adding a migration
npx wrangler deploy
```

Secrets (set with `wrangler secret put`, never commit): `CALENDARS`, `FAMILY_PIN`, `SESSION_SECRET`, `PHOTOS_ALBUM_URL`, `SHABBAT_ALBUM_URL`.
