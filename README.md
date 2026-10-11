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

- Done: static port of the prototype, performance work (WebP, 720p video, lazy loading, compiled CSS).
- Not built yet: Sanity content editing, order saving and emails (Supabase + Gmail SMTP), Thai postal-code autofill, floating LINE button.
- Missing assets: `cover1.jpg`–`cover6.jpg` for the portfolio clips (currently 404).

## Secrets

Never commit credentials. Use environment variables and keep only a placeholder `.env.example` in git.
