# KCUT — Deployment plan (Ubuntu server)

Target: Ubuntu 22.04/24.04 LTS, single VPS. The public page is static files served by nginx; the only running process is a small Node service for orders (added in stage 3).

## What gets deployed

| Part | Status | Runs as |
|---|---|---|
| Static site (`site/dist`) | built (stage 1) | nginx serves files, no process |
| Order API (`server/`: `POST /api/order`, `/admin`, paid emails) | built; mock store/mail until env vars are set | Node service via systemd, behind nginx |
| Content admin (`/admin/content`: edit text/media, upload, rebuild + publish) | built (stage 2, replaces Sanity) | same Node service; writes `site/data/content.json`, `site/public/media/`, builds into `site/releases/`, swaps the `site/dist` symlink |
| Orders + payment slips | SQLite file `kcut.db` and `slips/` in `/var/lib/kcut` | inside the API service, back them up |

The API (step 6) is ready to deploy. It needs Node 22.18+ (built-in SQLite, and native TypeScript stripping for `site/src/data/defaults.ts`). Mail stays on the mock outbox until `SMTP_PASS` is set, so set it before go-live. The content admin (step 7) rebuilds the site on the server, so the server needs the whole repo, `site/` dev dependencies and ffmpeg.

## 0. Before you start (decisions / inputs)
- Domain name and DNS A record pointing at the server IP (also AAAA if IPv6).
- Server: 1 vCPU / 1 GB RAM is enough. Open ports 22, 80, 443 only.
- Static IP or provider firewall available.
- Later: Sanity project id, Gmail App Password (env vars only, never in git).

## 1. Server hardening (once)
```bash
adduser deploy && usermod -aG sudo deploy        # then log in as deploy with an SSH key
# /etc/ssh/sshd_config: PermitRootLogin no, PasswordAuthentication no
sudo systemctl restart ssh
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx ufw unattended-upgrades fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 2. Build (first build on your PC or CI; later builds by the content admin on the server)
The first deploy can ship a PC-built `dist`. Once the content admin is enabled (step 7) the server itself builds, so it needs Node, `npm ci` in `site/` and `server/`, and `apt install ffmpeg`.
```bash
cd site
npm ci
npm run media        # only if media changed; needs the originals folder
npm run build        # -> site/dist
```
Check: `dist/index.html` exists, `dist/*.mp4` about 2 MB each.

## 3. First deploy of the static site
```bash
# on server
sudo mkdir -p /var/www/kcut/releases && sudo chown -R deploy:deploy /var/www/kcut
# from PC
REL=$(date +%Y%m%d-%H%M%S)
rsync -az --delete site/dist/ deploy@SERVER:/var/www/kcut/releases/$REL/
ssh deploy@SERVER "ln -sfn /var/www/kcut/releases/$REL /var/www/kcut/current"
```
Each deploy is a new release directory plus an atomic symlink switch.
**Rollback:** `ln -sfn /var/www/kcut/releases/<previous> /var/www/kcut/current` (no reload needed). Keep the last 5 releases, delete older ones.

## 4. nginx (performance-focused)
`/etc/nginx/sites-available/kcut`:
```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    root /opt/kcut/site/dist;   # symlink swapped by the content admin (step 7)
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    gzip_min_length 1024;

    # fingerprinted/static media: cache hard
    location ~* \.(webp|mp4|woff2|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        add_header X-Content-Type-Options nosniff;
        try_files $uri =404;
    }
    # html: always revalidate so new releases show immediately
    location = /index.html { add_header Cache-Control "no-cache"; }
    location / { try_files $uri $uri/ /index.html; }

    # mp4 seeking / streaming
    location ~* \.mp4$ { mp4; add_header Accept-Ranges bytes; }

    # ^~ so the regex rules above (.js, .webp, .mp4) never catch /admin/content.js or /admin/slips/*.webp
    location ^~ /admin { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                         proxy_set_header X-Real-IP $remote_addr; client_max_body_size 8m; }
    location ^~ /api/  { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                         proxy_set_header X-Real-IP $remote_addr; client_max_body_size 8m; }

    add_header X-Frame-Options SAMEORIGIN;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
```
```bash
sudo ln -s /etc/nginx/sites-available/kcut /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Notes: `.js` files (`checkout.js`, `modals.js`) are not fingerprinted, so if they change, either rename them per release or lower their cache time to `1h`. Enable `http2` and brotli after TLS if the nginx build supports it.

## 5. HTTPS
```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com --redirect -m you@example.com --agree-tos
sudo systemctl status certbot.timer     # auto-renewal
```

## 6. Order API service (`server/` in this repo)
- Check the whole repo out to `/opt/kcut` and run `npm ci --omit=dev` in `server/` (`server.js` imports `../site/src/data/defaults.ts`, so `site/` must sit next to `server/`); run by a dedicated `kcut` user; `ExecStart` is `node server.js` with `WorkingDirectory=/opt/kcut/server`. Set `DATA_DIR=/var/lib/kcut` (owned by `kcut`); the SQLite file and the slips live there. Node 22 LTS from NodeSource (`apt`).
- Variables are listed in `server/.env.example`. Secrets in `/etc/kcut/api.env` (`chmod 600`, owner `kcut`): `ADMIN_PASSWORD` (required: otherwise a random one per restart), `TRUST_PROXY=1` (required behind nginx: otherwise every visitor looks like 127.0.0.1 and five wrong passwords from anyone lock the owner out; never set it without nginx in front, clients could spoof `X-Real-IP`), `DATA_DIR`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SHOP_NOTIFY_EMAIL`, `WEBHOOK_SECRET`. Never in the repo or the logs.
- `/etc/systemd/system/kcut-api.service`:
  ```ini
  [Unit]
  Description=KCUT order API
  After=network.target
  [Service]
  User=kcut
  WorkingDirectory=/opt/kcut/server
  EnvironmentFile=/etc/kcut/api.env
  ExecStart=/usr/bin/node server.js
  Restart=on-failure
  NoNewPrivileges=true
  ProtectSystem=strict
  PrivateTmp=true
  [Install]
  WantedBy=multi-user.target
  ```
  `sudo systemctl enable --now kcut-api`, logs via `journalctl -u kcut-api -f`.
- Bind to `127.0.0.1:3000` only; nginx is the only public entry. Add `limit_req_zone` on `/api/order` to slow abuse.
- Staff mark orders paid at `https://example.com/admin` (HTTP basic auth with `ADMIN_PASSWORD`, so keep HTTPS on); that call sends both emails. Proxy `/api/` and `/admin` to 127.0.0.1:3000 in nginx.
- Outbound SMTP: many VPS providers block port 465/25. Test `openssl s_client -connect smtp.gmail.com:465` before go-live.

## 7. Content admin (stage 2)
The owner opens `https://example.com/admin/content` (same HTTP basic auth password as `/admin`), edits the hero, 10 features, 6 clips and 3 reviews, uploads images/videos (compressed on the server: WebP max 1600 px, mp4 max 720p) and presses "บันทึกและเผยแพร่". The service writes `site/data/content.json`, runs `astro build --outDir site/releases/<timestamp>` and then atomically repoints the `site/dist` symlink; a failed build leaves the live site untouched. The last 3 releases are kept.
- Check out the repo on the server (e.g. `/opt/kcut`), run `npm ci` in `site/` and `server/`, set `SITE_DIR=/opt/kcut/site` in `/etc/kcut/api.env`, and point nginx `root` at `/opt/kcut/site/dist` (symlink, nginx follows it).
- The `kcut` user must own `site/` (writes `dist`, `releases/`, `data/`, `public/media/`). With `ProtectSystem=strict` add `ReadWritePaths=/opt/kcut/site` and `Environment=FFMPEG_PATH=/usr/bin/ffmpeg` and `Environment=ASTRO_TELEMETRY_DISABLED=1` to the unit. A build that runs longer than 10 minutes is killed and reported as failed.
- nginx: the `/admin` and `/api/` locations must be `^~` prefix locations (as in step 4) so the regex rule for `.js`/`.webp` files does not swallow `/admin/content.js` or `/admin/slips/*.webp`. Uploads are up to 300 MB, so add before the generic proxy block:
  ```nginx
  location = /api/admin/upload { client_max_body_size 300m; proxy_request_buffering off; proxy_read_timeout 600s;
    proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
  ```
- Rollback: `ln -sfn /opt/kcut/site/releases/<older> /opt/kcut/site/dist.tmp && mv -T /opt/kcut/site/dist.tmp /opt/kcut/site/dist`.
- The first publish moves an existing real `dist/` folder to `releases/initial-<time>`.
- Wrong admin password 5 times from one IP gives 429 for 15 minutes (applies to `/admin` too). Back up `site/data/` (content + original uploads) with the orders data.

## 8. Monitoring and backups
- Uptime check on `https://example.com/` (UptimeRobot or similar, free).
- `logrotate` is default for nginx; keep access logs 14 days.
- Backups: the static site is rebuildable from git; orders and slips are in `/var/lib/kcut`: nightly `sqlite3 /var/lib/kcut/kcut.db ".backup /backup/kcut-$(date +%F).db"` plus `rsync -a /var/lib/kcut/slips/ /backup/slips/`, copied off the server; keep `/etc/kcut/api.env` in a password manager.
- Unattended security upgrades stay on; reboot window monthly.

## 9. Go-live checklist
- [ ] DNS resolves, HTTPS valid, HTTP redirects to HTTPS
- [ ] `curl -I https://example.com/` shows 200 and `Cache-Control: no-cache` for html
- [ ] Videos play and seek, images are WebP and cached (`expires 30d`)
- [ ] Mobile and desktop screens compared against the prototype
- [ ] Missing `cover1–6.jpg` supplied (currently 404)
- [ ] Lighthouse mobile run, performance score recorded as a baseline
- [ ] Rollback tested once (switch the symlink back and forth)
- [ ] Test order with a slip -> appears in /admin as รอตรวจสลิป -> confirm -> both emails received; reject -> customer email received
- [ ] No secrets in the repo (`git grep -i "pass\|secret\|service_role"`)

## Open questions
1. Domain name and who controls its DNS?
2. Server provider and region (Thailand/Singapore recommended for Thai visitors)?
3. Content rebuild method (step 7): server-side build or GitHub Action?
4. Do you want a CDN (Cloudflare free) in front for the 4 MB of video? It reduces server bandwidth, at the cost of one more account.
