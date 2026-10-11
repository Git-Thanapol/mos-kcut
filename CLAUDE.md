# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands (run in `site/`)

- `npm run dev` / `npm run build` / `npm run preview` — Astro static site (Tailwind v3, same version as the prototype CDN).
- `npm run media` — regenerates `public/` WebP images and 720p videos from the originals in `KCUT_PROTOTYPE/` (needs those originals; do not hand-edit `public/` media).
- Plan and stages: `docs/PLAN.md`. Stage 1 (static port) is done; Sanity, orders/email and address autofill are not built yet.

## Current state

`site/` is the new Astro port (components in `src/components`, fallback content in `src/data/defaults.ts`, read through `getContent()` in `src/data/content.ts`, browser scripts in `public/checkout.js` and `public/modals.js`). `KCUT_PROTOTYPE/` is the untouched reference and must keep matching it visually (section heights were verified identical at 1280px). There is no test suite or linter. The repo holds:

- `KCUT_PROTOTYPE/index.html` — the entire existing product: a single-file Thai-language (`lang="th"`) landing page for KCUT (a video-clip-cutting service), ~1100 lines.
- `KCUT_PROTOTYPE/*.png|jpg|mp4` — media referenced by relative path from `index.html` (hero video/images, chat screenshots, ad images, QR code, business cards, logo).
- `CMS.md` — the English spec/prompt for the planned work: convert the page to Next.js (App Router, TS) + Tailwind + Supabase (Postgres, Auth, Storage), deployed on Vercel. Read it before starting any migration work. It defines the stages, acceptance criteria and required env vars.
- `KCUT_PROTOTYPE/KCUT_PROMPT_TH.md` — an earlier, shorter Thai/English version of the same request. `CMS.md` supersedes it.

To view the prototype, open `KCUT_PROTOTYPE/index.html` directly in a browser (any static server works too). There is nothing to build.

## Prototype architecture (`index.html`)

- Tailwind is loaded via the CDN script (`cdn.tailwindcss.com`) with no config file. Font is Prompt (Google Fonts). Custom CSS is only the body style and `.gradient-text`.
- Sections in order: sticky navbar, hero + video demo (`#video-demo`), 10 feature cards, portfolio (6 clips), reviews (3 cards), `#register` checkout form, a final section, then the video and image modals.
- Content is hard-coded in the markup. These are exactly the pieces `CMS.md` wants moved into the DB: hero video/image, the 10 features (title, description, popup video), the 6 portfolio clips (cover, view count, title), the 3 reviews (text, stars, name, chat screenshot).
- Inline scripts (three `<script>` blocks, no modules):
  - Checkout script: `updateSummary()` re-styles the selected package/payment radio cards by toggling Tailwind classes and updates the summary, bank box and button label. `submitCheckout()` is a **stub**: it fakes a 1 s delay and redirects to the LINE link, so no order is saved or sent. `copyAccount()` copies the bank account number.
  - Video modal: `openVideoModal(url)` / `closeVideoModal()` drive `#videoModal` / `#popupVideoPlayer`.
  - Image modal: `openImageModal(src)` / `closeImageModal()` drive `#imageModal` for enlarged review screenshots.
- Business data is duplicated in the markup and JS and must stay in sync when edited: the LINE URL `https://lin.ee/YmWfY9Kv` (navbar, redirect after checkout), and the bank account number `243-7-01662-5` (HTML `#accountNumber` and `copyAccount()`).
- Package prices come from the `value` of `input[name="package"]` radios. `data-name` holds the display name. The default is the 1-month package at 390 THB. Payment methods are `transfer` (needs slip upload, `#slipInput`) or cash on delivery.

## Working conventions

- `CMS.md` requires the migrated landing page to look identical to the prototype. Reuse the existing Tailwind classes and markup rather than redesigning.
- UI copy is Thai. Keep new user-facing text, including admin and error messages, in Thai.
- `CMS.md` says to ask the user which payment method to support (bank transfer + slip, PromptPay QR, Omise, Stripe) before building the real payment step. Until then, admins mark orders paid manually.
- Secrets (Supabase service role key, Gmail SMTP App Password) must come from env vars. Only a placeholder `.env.example` may be committed.
