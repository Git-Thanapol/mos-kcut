# KCUT Stage 2 — Admin CMS (replaces Sanity)

Date: 2026-10-19. Supersedes the Sanity item in `docs/PLAN.md` stage 2.

## Goal
The owner (single user, not a developer) edits the landing-page content from a Thai-language `/admin` page. Saving rebuilds the static site. The public page stays static and looks identical to the prototype.

Editable: hero (video, image, poster), 10 features (title, desc, popup video), 6 clips (cover, views, title, subtitle), 3 reviews (rating, headline, name, body, chat image).

Out of scope: orders/payments (stage 3), address autofill (stage 4), multiple users, edit history, changing the number of features/clips/reviews.

## Decisions (agreed with the owner)
- No Sanity. Content lives in `site/data/content.json`.
- Owner uploads original images/videos; the server compresses them (sharp -> WebP, ffmpeg -> 720p mp4). `ffmpeg` is installed on the server.
- Publish = build into a fresh directory, then atomically swap a `dist` symlink. A failed build leaves the live site untouched.
- Single admin password from env `ADMIN_PASSWORD`; session via signed cookie.

## Architecture
- `site/data/content.json` — owner content. `getContent()` (`src/data/content.ts`) reads it at build time and merges over `defaults.ts`; a missing or invalid file falls back to the defaults.
- `site/data/uploads/` — original uploads (kept for re-processing). `site/public/media/` — compressed output referenced by `content.json`.
- `site/server/` — Node service (Fastify + `@fastify/multipart`), run by systemd, reached through nginx for `/api/*` only. It shares the process with the stage 3 order API.
- `site/public/admin.html` + `admin.js` — plain HTML/JS form (no Astro/Tailwind build needed). The page holds no secrets; all protection is in the API.

## API
All routes except login require a valid session cookie.
- `POST /api/admin/login` — body `{password}`; constant-time compare with `ADMIN_PASSWORD`; sets cookie (httpOnly, Secure, SameSite=Strict, 12 h). Rate limit: 5 failures per IP per 15 min, then 429.
- `POST /api/admin/logout`
- `GET /api/admin/content` — current content (json merged with defaults).
- `POST /api/admin/upload?kind=image|video` — multipart, one file. Limits: image 15 MB, video 300 MB; MIME and magic-byte check. Original saved to `data/uploads/`, compressed copy to `public/media/<uuid>.webp|mp4`. Returns `{path}`.
- `PUT /api/admin/content` — validates the schema (exactly 10 features, 6 clips, 3 reviews; strings length-limited; media paths must start with `/media/` or be an existing default asset; rating 1-5). Writes `content.json` atomically (temp file + rename), enqueues a build.
- `GET /api/admin/build` — `{state: idle|building|ok|failed, message, finishedAt}`.

## Build and publish
1. Queue: a save while building sets a "dirty" flag; one more build runs afterwards (never more than one in flight).
2. `astro build --outDir releases/<timestamp>`; on success, repoint symlink `dist -> releases/<timestamp>` (atomic rename of a temp symlink); keep the last 3 releases, delete older ones.
3. On failure keep the old symlink, record the error tail in build state.
4. Rollback = repoint the symlink to a previous release (documented, manual).

## Admin page (Thai UI)
- Login screen: password field + button; wrong password shows "รหัสผ่านไม่ถูกต้อง".
- After login, one page with collapsible sections: ภาพหลัก (Hero), ฟีเจอร์ (10), ผลงาน (6), รีวิว (3). Each item shows the current thumbnail/video name plus text inputs; "เปลี่ยนรูป/วิดีโอ" uploads immediately and shows a progress bar and the new preview.
- Sticky bar: "บันทึกและเผยแพร่" button, unsaved-changes indicator, build status ("กำลังเผยแพร่…" / "เผยแพร่แล้ว" / "เผยแพร่ไม่สำเร็จ: <reason>"), link "ดูหน้าเว็บ".
- "คืนค่าเดิม" per section resets to defaults after a confirm.
- Warn before leaving with unsaved changes.

## Errors
- Upload rejected (type/size/corrupt): inline Thai message, form state unchanged.
- ffmpeg/sharp failure: upload returns 500 with a Thai message; temp files removed.
- Validation failure on save: 400 with the failing field; the page highlights it.
- Build failure: shown in the status bar; the live site is unchanged; the owner can fix and save again.
- Session expired: the page returns to the login screen without losing the unsaved form (kept in memory).

## Security
- Password and cookie secret (`SESSION_SECRET`) only from env; `.env.example` has placeholders.
- CSRF: SameSite=Strict cookie plus a custom header required on mutating requests.
- Uploads never executed or served from `data/uploads/`; only `public/media/` is exposed. Filenames are generated (uuid), never taken from the client.
- nginx: `client_max_body_size 300m` for `/api/admin/upload` only; proxy only `/api/*`.

## Testing
No test suite exists today; add Node's built-in test runner for the server only.
- Unit: schema validation (good/bad payloads), `getContent()` merge and fallback, password compare, rate limiter.
- Integration (Fastify `inject`): login/logout, auth required on every route, content round trip, upload of a tiny image and a tiny video, build queue coalescing (build command stubbed).
- Manual checklist: edit text -> save -> public page changes; failed build keeps site; section heights at 1280px still match the prototype.

## Docs to update
`docs/PLAN.md` (stage 2 = admin CMS), `docs/DEPLOY-UBUNTU.md` (ffmpeg, systemd unit, nginx `/api/*` proxy, releases/symlink, env vars), `CLAUDE.md` (current state, commands), `.env.example`.
