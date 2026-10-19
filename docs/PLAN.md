# KCUT fast landing page — plan

Goal: identical look to `KCUT_PROTOTYPE/index.html`, fastest possible load, minimal maintenance.
Stack: Astro (static) + Tailwind v3 (compiled, same version as the CDN) + own admin CMS (`/admin/content`, content in `site/data/content.json`) + SQLite (orders) + one small Node API (`server/`).

## Stages
1. Port prototype to Astro, pixel-identical, content in `src/data/content.ts` (defaults = current page). Compiled CSS, optimized media.
2. Admin CMS: `/admin/content` edits `site/data/content.json` + compressed uploads; saving rebuilds into `site/releases/` and swaps `site/dist`. Replaces Sanity (the `sanity/` folder is now unused). Spec: `docs/superpowers/specs/2026-10-19-admin-cms-design.md`.
3. Orders: `server/` saves orders in SQLite with slip uploads; staff review the slip in `/admin` and confirm or reject; emails (Gmail SMTP) go out on confirm/reject.
4. Thai address autofill: bundled JSON, lazy-loaded on first focus of the search field.
5. Floating LINE button (mobile) + polish; Lighthouse pass.

## Open
- Payment method (slip upload vs PromptPay vs gateway) — manual "mark paid" until decided.
- Missing assets: cover1-6.jpg; every feature currently points at video-demo.mp4.
- Media is huge (videos 22-25 MB, PNGs 2-3 MB): compress before launch.

## Status (updated)
1. Static port — done.
2. Admin CMS — done (`server/lib/content-admin.js`, `server/admin/`); replaces the Sanity mock. Needs ffmpeg on the server for video uploads.
3. Orders — `server/` done: SQLite, manual slip review (confirm / reject, duplicate-slip warning), 9 automated tests. Mail is mock until `SMTP_PASS` is set.
4. Thai address autofill — done and tested in the browser.
5. LINE button — the prototype already has a fixed mobile bar with the LINE button, so nothing added. Remaining: Lighthouse run, tablet check, real covers/videos.

6. Checks done: Lighthouse (a11y 93 / best practices 100 / SEO 100), LCP 0.94 s on slow 4G, pixel comparison with the prototype at 1280 and 800 px.
