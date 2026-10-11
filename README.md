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
| Orders + admin + emails (`server/`) | works end to end with **mock** storage (JSON file) and **mock** email (files in `data/outbox`) |
| Supabase storage, Gmail SMTP | code written, switches on by environment variables, **untested** against real accounts |
| Sanity content editing | schema + loader written, **mock** until `SANITY_PROJECT_ID` is set; untested |
| Portfolio covers | **placeholders** (`public/cover1-6.webp`) |
| Payment gateway | not chosen; admin marks orders paid by hand |

## Run everything locally

```bash
cd server && npm ci && ADMIN_PASSWORD=choose-one npm start     # API on :3000 (mock store/mail)
cd site   && npm ci && npm run dev                              # page on :4321, /api and /admin are proxied
```
- Orders: http://localhost:4321/admin (any user name, the ADMIN_PASSWORD) -> "ยืนยันว่าชำระแล้ว" sends the emails (written to `server/data/outbox/`).
- `astro preview` does not proxy `/api`; use `npm run dev`, or put nginx in front (docs/DEPLOY-UBUNTU.md).

## Replacing the mocks

1. **Supabase**: run `server/supabase.sql`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the server.
2. **Gmail**: set `SMTP_PASS` (App Password) in the server environment; `SMTP_USER`/`SHOP_NOTIFY_EMAIL` default to spmarketgo@gmail.com.
3. **Sanity**: follow `sanity/README.md`, then build the site with `SANITY_PROJECT_ID` set.
4. **Covers / feature videos**: replace `site/public/cover1-6.webp` (600x800, 3:4) or upload them in Sanity. All 10 features still use `video-demo.mp4`.
5. All variables are listed in `server/.env.example`.

The checkout form has one field the prototype lacked: an optional e-mail (needed to send the customer's confirmation).

## Secrets

Never commit credentials. Use environment variables and keep only a placeholder `.env.example` in git.
