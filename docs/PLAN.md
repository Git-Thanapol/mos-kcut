# KCUT fast landing page — plan

Goal: identical look to `KCUT_PROTOTYPE/index.html`, fastest possible load, minimal maintenance.
Stack: Astro (static) + Tailwind v3 (compiled, same version as the CDN) + Sanity (content/media) + Supabase (orders only) + one serverless function (Cloudflare Pages Function).

## Stages
1. Port prototype to Astro, pixel-identical, content in `src/data/content.ts` (defaults = current page). Compiled CSS, optimized media.
2. Sanity Studio (hero, 10 features, 6 clips, 3 reviews); build fetches Sanity, falls back to defaults; publish webhook rebuilds site.
3. Orders: `functions/api/order.ts` saves to Supabase; DB webhook on `paid=true` sends emails (Gmail SMTP). Supabase table editor = order admin.
4. Thai address autofill: bundled JSON, lazy-loaded on first focus of the search field.
5. Floating LINE button (mobile) + polish; Lighthouse pass.

## Open
- Payment method (slip upload vs PromptPay vs gateway) — manual "mark paid" until decided.
- Missing assets: cover1-6.jpg; every feature currently points at video-demo.mp4.
- Media is huge (videos 22-25 MB, PNGs 2-3 MB): compress before launch.

## Status (updated)
1. Static port — done.
2. Sanity — schema (`sanity/`) and loader (`site/src/data/content.ts`) written, **mock** until a project exists.
3. Orders — `server/` done with mock store and mail, Supabase/SMTP adapters written but untested.
4. Thai address autofill — done and tested in the browser.
5. LINE button — the prototype already has a fixed mobile bar with the LINE button, so nothing added. Remaining: Lighthouse run, tablet check, real covers/videos.
