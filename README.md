# mos-kcut — KCUT sales landing page

Fast, static landing page for KCUT (Thai video-clip-cutting service). Built with Astro and Tailwind CSS v3. The look matches the original single-file prototype, with compiled CSS and compressed media.

## Quick start

```bash
cd site
npm ci
npm run dev        # http://localhost:4321
npm run build      # static output in site/dist
npm run preview    # serve the build
```

Requires Node 20+.

## Layout

| Path | What |
|---|---|
| `site/src/components/` | page sections (Hero, Steps, Portfolio, Reviews, Packages, Checkout, Contact, Modals) |
| `site/src/data/defaults.ts` | current page content; `content.ts` is where Sanity data will be merged in |
| `site/public/` | optimized WebP images, MP4 videos, `checkout.js`, `modals.js` |
| `site/scripts/optimize-media.mjs` | rebuilds `public/` media from the original files |
| `docs/PLAN.md` | staged plan |
| `docs/DEPLOY-UBUNTU.md` | Ubuntu server deployment plan |
| `CMS.md` | original CMS requirements |

## Media

`public/` already contains the optimized media (videos about 2 MB each, images 3–240 KB). To regenerate it from the originals, put the original files in `../KCUT_PROTOTYPE/` (not committed because of size) and run `npm run media` in `site/`.

## Status

| Feature | State |
|---|---|
| Static page, identical to prototype, optimized media | done |
| Thai address autofill (postal code / sub-district search, manual selects) | done, data bundled (`site/public/thai-address.json`, from [earthchie/jquery.Thailand.js](https://github.com/earthchie/jquery.Thailand.js)) |
| Mobile LINE button | already in the prototype (fixed bottom bar), kept as is |
| Orders + manual slip review (`server/`, SQLite) | done, 9 automated tests; the customer uploads the transfer slip, staff confirm or reject it in `/admin` |
| Gmail SMTP | code written, switches on with `SMTP_PASS`; email is **mock** (files in `server/data/outbox`) until then; untested against a real account |
| Sanity content editing | schema + loader written, **mock** until `SANITY_PROJECT_ID` is set; untested |
| Portfolio covers | **placeholders** (`public/cover1-6.webp`) |
| Payment gateway | not used: bank transfer + slip review by hand (cash on delivery also possible) |

## Run everything locally

```bash
cd server && npm ci && ADMIN_PASSWORD=choose-one npm start     # API on :3000 (SQLite, mock mail); needs Node 22.18+
cd site   && npm ci && npm run dev                              # page on :4321, /api and /admin are proxied
```
- Review slips at http://localhost:4321/admin (any user name, the ADMIN_PASSWORD): tabs รอตรวจสลิป / ชำระแล้ว / สลิปไม่ผ่าน, slip thumbnails, a warning when the same slip image was used before. "ยืนยันว่าชำระแล้ว" or "สลิปไม่ผ่าน" sends the emails (mock: files in `server/data/outbox/`).
- Edit the page content at http://localhost:4321/admin/content (same login): hero, 10 features, 6 clips, 3 reviews, with image/video upload (videos need ffmpeg: set `FFMPEG_PATH`, e.g. `site/node_modules/ffmpeg-static/ffmpeg.exe` on Windows). "บันทึกและเผยแพร่" writes `site/data/content.json`, rebuilds into `site/releases/` and swaps `site/dist`. Wrong password 5 times = locked 15 min.
- `astro preview` does not proxy `/api`; use `npm run dev`, or put nginx in front (docs/DEPLOY-UBUNTU.md).

## Replacing the mocks

1. **Orders**: nothing to replace. They live in SQLite (`DATA_DIR/kcut.db`) with slips in `DATA_DIR/slips`; back both up.
2. **Gmail**: set `SMTP_PASS` (App Password) in the server environment; `SMTP_USER`/`SHOP_NOTIFY_EMAIL` default to spmarketgo@gmail.com.
3. **Sanity**: follow `sanity/README.md`, then build the site with `SANITY_PROJECT_ID` set.
4. **Covers / feature videos**: replace `site/public/cover1-6.webp` (600x800, 3:4) or upload them in Sanity. All 10 features still use `video-demo.mp4`.
5. All variables are listed in `server/.env.example`.

The checkout form has one field the prototype lacked: an optional e-mail (needed to send the customer's confirmation).

## Checks

- `cd server && npm test`: 41 tests (content schema, media processing, build queue, release swap, content admin API, validation and server-side prices, slip upload, admin auth, confirm/reject flow, no duplicate emails, duplicate-slip warning, HTML escaping, rate limit, oversized upload).
- `cd site && npm run build && npm run serve`: production-like static server (gzip, cache headers, video range requests, proxies /api and /admin to the API on :3000).
- `node site/scripts/compare-shots.mjs proto.png site.png <registerTop>`: pixel comparison of two full-page screenshots.
- Last measured (mobile emulation, slow 4G, 4x CPU): LCP 0.94 s, CLS 0.00; Lighthouse accessibility 93, best practices 100, SEO 100. The remaining accessibility finding is low text contrast in a few colours copied from the prototype, left as is to keep the look identical.
- Compared with the prototype at 1280 px and 800 px: identical apart from the checkout section (+98 px for the e-mail field) and the portfolio covers (placeholders). The mobile layout was checked by section heights only.

## Secrets

Never commit credentials. Use environment variables and keep only a placeholder `.env.example` in git.
