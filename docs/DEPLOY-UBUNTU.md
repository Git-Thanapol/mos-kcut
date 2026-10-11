# KCUT — Deployment plan (Ubuntu server)

Target: Ubuntu 22.04/24.04 LTS, single VPS. The public page is static files served by nginx; the only running process is a small Node service for orders (added in stage 3).

## What gets deployed

| Part | Status | Runs as |
|---|---|---|
| Static site (`site/dist`) | built (stage 1) | nginx serves files, no process |
| Order API (`POST /api/order`, paid-email trigger) | **not built yet** (stage 3) | Node service via systemd, behind nginx |
| Rebuild webhook (Sanity "Publish" -> rebuild) | **not built yet** (stage 2) | same Node service |
| Content (Sanity) / orders (Supabase) | hosted SaaS | nothing on the server |

Until stages 2–3 exist, only steps 1–4 and 7 apply.

## 0. Before you start (decisions / inputs)
- Domain name and DNS A record pointing at the server IP (also AAAA if IPv6).
- Server: 1 vCPU / 1 GB RAM is enough. Open ports 22, 80, 443 only.
- Static IP or provider firewall available.
- Later: Sanity project id, Supabase URL + service key, Gmail App Password (env vars only, never in git).

## 1. Server hardening (once)
```bash
adduser deploy && usermod -aG sudo deploy        # then log in as deploy with an SSH key
# /etc/ssh/sshd_config: PermitRootLogin no, PasswordAuthentication no
sudo systemctl restart ssh
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx ufw unattended-upgrades fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 2. Build (on your PC or CI — not on the server)
Building on the PC keeps Node, ffmpeg and sharp off the server.
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
    root /var/www/kcut/current;
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

    # stage 3 only:
    # location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
    #                  proxy_set_header X-Real-IP $remote_addr; client_max_body_size 6m; }

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

## 6. Order API service (stage 3, after it is built)
- Code in `/opt/kcut-api`, run by a dedicated `kcut` user. Node 22 LTS from NodeSource (`apt`).
- Secrets in `/etc/kcut/api.env` (`chmod 600`, owner `kcut`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SHOP_NOTIFY_EMAIL`, `WEBHOOK_SECRET`. Never in the repo or the logs.
- `/etc/systemd/system/kcut-api.service`:
  ```ini
  [Unit]
  Description=KCUT order API
  After=network.target
  [Service]
  User=kcut
  WorkingDirectory=/opt/kcut-api
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
- Supabase "paid = true" webhook -> `/api/paid` with the `WEBHOOK_SECRET` header; the API sends both emails.
- Outbound SMTP: many VPS providers block port 465/25. Test `openssl s_client -connect smtp.gmail.com:465` before go-live.

## 7. Content updates (stage 2)
Sanity Publish -> webhook -> `/api/rebuild` -> server runs `npm ci && npm run build` in a build directory and swaps the `current` symlink (needs Node on the server, but not ffmpeg because `public/` media is committed or synced). Simpler alternative: staff publish in Sanity, and a GitHub Action does the build and `rsync` on webhook. Pick one before stage 2.

## 8. Monitoring and backups
- Uptime check on `https://example.com/` (UptimeRobot or similar, free).
- `logrotate` is default for nginx; keep access logs 14 days.
- Backups: static site is rebuildable from git; orders live in Supabase (enable its daily backups, or `pg_dump` weekly if you self-host Postgres); keep `/etc/kcut/api.env` in a password manager.
- Unattended security upgrades stay on; reboot window monthly.

## 9. Go-live checklist
- [ ] DNS resolves, HTTPS valid, HTTP redirects to HTTPS
- [ ] `curl -I https://example.com/` shows 200 and `Cache-Control: no-cache` for html
- [ ] Videos play and seek, images are WebP and cached (`expires 30d`)
- [ ] Mobile and desktop screens compared against the prototype
- [ ] Missing `cover1–6.jpg` supplied (currently 404)
- [ ] Lighthouse mobile run, performance score recorded as a baseline
- [ ] Rollback tested once (switch the symlink back and forth)
- [ ] Stage 3: test order -> row in Supabase -> mark paid -> both emails received
- [ ] No secrets in the repo (`git grep -i "pass\|secret\|service_role"`)

## Open questions
1. Domain name and who controls its DNS?
2. Server provider and region (Thailand/Singapore recommended for Thai visitors)?
3. Content rebuild method (step 7): server-side build or GitHub Action?
4. Do you want a CDN (Cloudflare free) in front for the 4 MB of video? It reduces server bandwidth, at the cost of one more account.
