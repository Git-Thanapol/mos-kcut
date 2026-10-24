# KCUT — Deployment runbook for the agent on the server

You are an agent running on (or with SSH access to) the production Ubuntu server. Follow this file top to bottom. It is the **authoritative** layout; `docs/DEPLOY-UBUNTU.md` is background (its step 3, the `/var/www/kcut/current` rsync flow, is superseded by this file: the content admin builds on the server and owns the `dist` symlink).

## 0. Rules

1. **Never** print, log, commit or paste secrets (`ADMIN_PASSWORD`, `SMTP_PASS`). Put them only in `/etc/kcut/api.env` (`chmod 600`). Do not `cat` that file into the conversation; check with `sudo grep -c . /etc/kcut/api.env` or `sudo stat`.
2. Do not push to git, do not edit files under `/opt/kcut` by hand except where a step says so. Do not run `git clean`, `rm -rf` on `/opt/kcut/site/data`, `/opt/kcut/site/public/media` or `/var/lib/kcut` (owner content, orders, payment slips).
3. Do not run `npm run media` (needs originals that are not on the server; the optimized media is committed).
4. Stop and ask the human when: an input in section 1 is missing; DNS does not resolve to this server; a step's check fails twice after a fix attempt; a command would delete data or open a port other than 22/80/443.
5. Run every "Check" and report its real output. Do not claim a step is done without it.
6. User-facing text in the app is Thai; keep any text you add for the owner Thai.

## 1. Inputs to get from the human first

| Input | Notes |
|---|---|
| Git ref to deploy | `main` once the PR is merged; until then `feature/admin-cms`. Repo: `https://github.com/Git-Thanapol/mos-kcut.git` |
| Domain(s) | e.g. `example.com` + `www`. DNS A/AAAA must already point at this server |
| `ADMIN_PASSWORD` | the human chooses it (min 8 chars; it protects `/admin` and `/admin/content`). If they ask you to generate one: `openssl rand -base64 18`, store it in the env file only, tell the human once, never echo it again |
| Gmail App Password (`SMTP_PASS`), `SMTP_USER`, `SHOP_NOTIFY_EMAIL` | optional at first. Without `SMTP_PASS` mail goes to files in `/var/lib/kcut/outbox` (mock): tell the human emails are NOT being sent |
| Email for Let's Encrypt | for certbot |
| Backup destination | where nightly backups are copied off the server (or "not yet") |

## 2. Layout (fixed — the code assumes it)

| Path | What | Owner |
|---|---|---|
| `/opt/kcut` | git checkout (`server/` next to `site/`: `server.js` imports `../site/src/data/defaults.ts`) | `kcut` |
| `/opt/kcut/site/dist` | **symlink** to the live build (first run: a real folder, moved aside on first publish) | `kcut` (written by the service) |
| `/opt/kcut/site/releases/` | builds, last 3 kept | `kcut` |
| `/opt/kcut/site/data/` | `content.json` + original uploads (back up) | `kcut` |
| `/opt/kcut/site/public/media/` | compressed uploads (back up) | `kcut` |
| `/var/lib/kcut` | SQLite orders `kcut.db`, `slips/`, `outbox/` (back up) | `kcut` |
| `/etc/kcut/api.env` | secrets and config, mode 600 | `root:kcut` or `kcut` |
| `127.0.0.1:3000` | Node service `kcut-api`; only nginx is public | — |

## 3. Steps

### 3.1 Prerequisites
```bash
sudo apt update && sudo apt -y install nginx ufw fail2ban unattended-upgrades ffmpeg sqlite3 jq curl git ca-certificates
# Node 22 LTS (need >= 22.18): NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt -y install nodejs
```
Check: `node -v` prints `v22.18` or newer; `ffmpeg -version | head -1`; `command -v node` (note the path, normally `/usr/bin/node`).

### 3.2 Firewall
```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
```
Check: `sudo ufw status` shows only 22, 80, 443.

### 3.3 User, directories, code
```bash
sudo adduser --system --group --home /opt/kcut kcut
sudo mkdir -p /etc/kcut /var/lib/kcut && sudo chown kcut:kcut /var/lib/kcut
sudo -u kcut git clone https://github.com/Git-Thanapol/mos-kcut.git /opt/kcut 2>/dev/null || true   # skip if already cloned
cd /opt/kcut && sudo -u kcut git fetch origin && sudo -u kcut git checkout <REF> && sudo -u kcut git pull --ff-only
sudo -u kcut npm ci --prefix /opt/kcut/server --omit=dev
sudo -u kcut npm ci --prefix /opt/kcut/site
```
If `/opt/kcut` is a non-empty directory the clone fails: clone to a temp dir and move, do not delete anything. Check: `ls /opt/kcut/server/server.js /opt/kcut/site/package.json`; `sudo -u kcut node -e "import('sharp').then(()=>console.log('sharp ok'))"` run from `/opt/kcut/server`.

### 3.4 Tests and first build
```bash
cd /opt/kcut/server && sudo -u kcut npm test
cd /opt/kcut/site && sudo -u kcut npm run build
```
Check: all tests pass (41 at the time of writing; one more than that is fine, any failure is not); `/opt/kcut/site/dist/index.html` exists. The media tests need ffmpeg: they use `site/node_modules/ffmpeg-static`, installed by `npm ci` in `site/`.

### 3.5 Config file `/etc/kcut/api.env`
Create it with `sudo install -m 600 -o root -g kcut /dev/null /etc/kcut/api.env` then edit (use `sudoedit`). Contents (values from section 1, never commit):
```
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=1
ADMIN_PASSWORD=<from the human>
DATA_DIR=/var/lib/kcut
SITE_DIR=/opt/kcut/site
FFMPEG_PATH=/usr/bin/ffmpeg
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=<optional>
SMTP_PASS=<optional>
SHOP_NOTIFY_EMAIL=<optional>
```
- `TRUST_PROXY=1` is **required** behind nginx (otherwise all visitors share one IP and anyone can lock the owner out for 15 minutes with 5 wrong passwords). Never set it if nginx is not in front.
- Without `ADMIN_PASSWORD` the service invents a new one at every restart: always set it.
- Outbound SMTP is blocked by some providers: `timeout 5 openssl s_client -connect smtp.gmail.com:465 </dev/null | head -3`. Report the result if mail is being enabled.

### 3.6 systemd unit `/etc/systemd/system/kcut-api.service`
Use the `command -v node` path from 3.1.
```ini
[Unit]
Description=KCUT API and admin
After=network.target

[Service]
User=kcut
Group=kcut
WorkingDirectory=/opt/kcut/server
EnvironmentFile=/etc/kcut/api.env
Environment=ASTRO_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/node server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/kcut/site /var/lib/kcut
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now kcut-api
```
Check: `systemctl is-active kcut-api` = `active`; `curl -s http://127.0.0.1:3000/api/health` returns `{"ok":true,"store":"sqlite (...)","mailer":"file (mock)"}` (mailer is `smtp` when `SMTP_PASS` is set); `journalctl -u kcut-api -n 20 --no-pager` has no stack trace. If it fails with `ERR_UNKNOWN_FILE_EXTENSION` for `defaults.ts`, Node is older than 22.18.

### 3.7 nginx `/etc/nginx/sites-available/kcut`
Replace `example.com`. The `^~` on `/admin` and `/api/` is essential: without it the regex rule for `.js`/`.webp` serves `/admin/content.js` from the static root and returns 404, leaving the admin page blank.
```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    root /opt/kcut/web/home;      # spvdo.com/ = product hub (web/home); /kcut/ and /books/ are aliased below
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    gzip_min_length 1024;

    # /kcut/ = Astro build (site/dist symlink swapped on publish), /books/ = static book shop.
    # Plain prefix locations (no ^~) on purpose: the regex asset rules below must still apply to them.
    location = /kcut  { return 301 /kcut/; }
    location = /books { return 301 /books/; }
    location /kcut/  { alias /opt/kcut/site/dist/;  index index.html; add_header Cache-Control "no-cache"; }
    location /books/ { alias /opt/kcut/web/books/;  index index.html; add_header Cache-Control "no-cache"; }
    location ~* ^/kcut/(.+\.(?:webp|png|mp4|css|js|json))$ {
        alias /opt/kcut/site/dist/$1;
        expires 30d; add_header Cache-Control "public, max-age=2592000"; add_header X-Content-Type-Options nosniff;
    }
    location ~* ^/books/(.+\.(?:webp|png))$ {
        alias /opt/kcut/web/books/$1;
        expires 30d; add_header Cache-Control "public, max-age=2592000"; add_header X-Content-Type-Options nosniff;
    }
    location ~* \.(webp|mp4|woff2|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        add_header X-Content-Type-Options nosniff;
        try_files $uri =404;
    }
    location = / { try_files /index.html =404; add_header Cache-Control "no-cache"; }
    location / { try_files $uri $uri/ =404; }

    location = /api/admin/upload {
        client_max_body_size 300m; proxy_request_buffering off; proxy_read_timeout 600s;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
    }
    location ^~ /admin { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                         proxy_set_header X-Real-IP $remote_addr; client_max_body_size 8m; }
    location ^~ /api/  { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                         proxy_set_header X-Real-IP $remote_addr; client_max_body_size 8m; }

    add_header X-Frame-Options SAMEORIGIN;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
```
```bash
sudo ln -sf /etc/nginx/sites-available/kcut /etc/nginx/sites-enabled/kcut && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Check: `nginx -t` OK. nginx must be able to read the symlink target: `sudo -u www-data test -r /opt/kcut/site/dist/index.html && sudo -u www-data test -r /opt/kcut/web/books/index.html && sudo -u www-data test -r /opt/kcut/web/home/index.html && echo readable`. If it prints nothing, `chmod o+x /opt /opt/kcut /opt/kcut/site` (directories only, never the env file or data dirs).

Optional: add `limit_req_zone` for `/api/order` to slow abuse (`10r/m` per IP, burst 5).

### 3.8 HTTPS (only after DNS points here)
```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com --redirect -m <email> --agree-tos --no-eff-email
sudo systemctl status certbot.timer --no-pager
```
Check: `curl -sI http://example.com/` is a 301 to https.

### 3.9 Backups
`/etc/cron.d/kcut-backup` (as root; adjust the destination, and copy `/var/backups/kcut` off the server if the human gave a destination):
```
30 2 * * * root mkdir -p /var/backups/kcut && sqlite3 /var/lib/kcut/kcut.db ".backup /var/backups/kcut/kcut-$(date +\%F).db" && rsync -a /var/lib/kcut/slips/ /var/backups/kcut/slips/ && rsync -a /opt/kcut/site/data/ /var/backups/kcut/site-data/ && rsync -a /opt/kcut/site/public/media/ /var/backups/kcut/media/ && find /var/backups/kcut -maxdepth 1 -name 'kcut-*.db' -mtime +14 -delete
```
Check: run the command once by hand and `ls /var/backups/kcut`.

## 4. Smoke tests (run all, replace `D` and `PW`; keep `PW` out of the transcript — read it from a shell variable the human typed or `read -s PW`)
```bash
D=https://example.com; read -rs PW; H='X-Requested-With: kcut-admin'
curl -s -o /dev/null -w "home %{http_code}\n" $D/                                   # 200 (product hub)
curl -s -o /dev/null -w "kcut %{http_code}\n" $D/kcut/                              # 200 (/kcut without slash is a 301)
curl -s -o /dev/null -w "kcut img %{http_code}\n" $D/kcut/pic1.webp                 # 200
curl -s -o /dev/null -w "kcut addr %{http_code}\n" $D/kcut/thai-address.json        # 200
curl -s -o /dev/null -w "books %{http_code}\n" $D/books/                            # 200
curl -s -o /dev/null -w "books img %{http_code}\n" $D/books/assets/book1.webp       # 200
curl -sI $D/ | grep -i cache-control                                                # no-cache for html
curl -s -o /dev/null -w "admin no auth %{http_code}\n" $D/admin                     # 401
curl -s -o /dev/null -w "content.js no auth %{http_code}\n" $D/admin/content.js     # 401 (a 404 means the nginx ^~ rule is missing)
curl -s -u admin:$PW -o /dev/null -w "admin %{http_code}\n" $D/admin                # 200
curl -s -u admin:$PW -o /dev/null -w "content page %{http_code} %{content_type}\n" $D/admin/content        # 200 text/html
curl -s -u admin:$PW -o /dev/null -w "content.js %{http_code} %{content_type}\n" $D/admin/content.js       # 200 javascript
curl -s -u admin:$PW -H "$H" $D/api/admin/build                                      # {"state":"idle",...}
```
Content round trip (publishes the unchanged content, proves build + symlink swap):
```bash
curl -s -u admin:$PW -H "$H" $D/api/admin/content | jq .content > /tmp/content.json
curl -s -u admin:$PW -H "$H" -H 'Content-Type: application/json' -X PUT --data-binary @/tmp/content.json -o /dev/null -w "save %{http_code}\n" $D/api/admin/content   # 202
for i in $(seq 1 60); do s=$(curl -s -u admin:$PW -H "$H" $D/api/admin/build); echo "$s" | grep -q building || break; sleep 2; done; echo "$s"      # state ok
readlink /opt/kcut/site/dist        # now .../site/releases/<timestamp>
curl -s -o /dev/null -w "home after publish %{http_code}\n" $D/                    # 200
rm -f /tmp/content.json
```
Upload check (uses a file already in the repo; leaves one orphan file in `public/media`, harmless):
```bash
curl -s -u admin:$PW -H "$H" -H 'Content-Type: application/octet-stream' --data-binary @/opt/kcut/site/public/logo-kcut.webp "$D/api/admin/upload?kind=image"   # {"path":"/media/<uuid>.webp"}
curl -s -u admin:$PW -H "$H" --data-binary 'not an image' "$D/api/admin/upload?kind=image"                                                                       # 400 with a Thai message
```
Lockout check (optional, do it last): 6 wrong passwords against `/admin` make the 6th answer 429 and block that client IP for 15 minutes, correct password included. Run it only if you can test from a second IP afterwards: that second IP must still get 401, not 429, which proves `TRUST_PROXY=1` works. Otherwise skip it and say so in the report.

Order check (cash-on-delivery order, no slip; creates a real row and, if `SMTP_PASS` is set, sends a real email to the shop, so tell the human first):
```bash
curl -s -H 'Content-Type: application/json' -X POST $D/api/order -d '{"package":"390","payment":"cod","firstName":"ทดสอบ","lastName":"ระบบ","phone":"0800000000","email":"","address1":"ทดสอบ","subdistrict":"ทดสอบ","district":"ทดสอบ","province":"กรุงเทพมหานคร","zip":"10110","note":"TEST ลบได้"}'   # {"orderId":"KC-..."}
```
Then ask the human to open `$D/admin`, see the order, and (optionally) reject it with the note "ทดสอบ". Do not mark it paid.

Human-only checks (report them as pending, do not fake): page looks like the prototype on phone and desktop; a real transfer-slip order; the owner logs in to `/admin/content`, changes a title, saves, and sees it live.

## 5. Updating the code later
```bash
cd /opt/kcut && sudo -u kcut git fetch origin && sudo -u kcut git pull --ff-only
sudo -u kcut npm ci --prefix server --omit=dev && sudo -u kcut npm ci --prefix site
cd server && sudo -u kcut npm test            # must pass before restarting
sudo systemctl restart kcut-api
```
A code change does not rebuild the site by itself. To publish it, either press "บันทึกและเผยแพร่" in `/admin/content`, or build and swap by hand (same as the service does):
```bash
cd /opt/kcut/site && REL=releases/manual-$(date +%Y%m%d-%H%M%S)
sudo -u kcut npx astro build --outDir $REL && sudo -u kcut ln -sfn "/opt/kcut/site/$REL" dist.tmp && sudo -u kcut mv -T dist.tmp dist
```
Never touch `site/data/`, `site/public/media/`, `/var/lib/kcut` when updating.

## 6. Rollback
- **Site:** `ls -t /opt/kcut/site/releases`, then
  `cd /opt/kcut/site && sudo -u kcut ln -sfn /opt/kcut/site/releases/<older> dist.tmp && sudo -u kcut mv -T dist.tmp dist` (no nginx reload needed).
- **Bad content only:** the previous content is not versioned; restore `site/data/content.json` from `/var/backups/kcut/site-data/` and publish again.
- **Code:** `git checkout <previous-commit>`, redo the install lines of section 5, restart.

## 7. Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| `/admin/content` is a blank page | nginx serves `content.js` statically: the `/admin` location is missing `^~` (404 for `content.js`) |
| Service exits at start, `ERR_UNKNOWN_FILE_EXTENSION` | Node < 22.18 |
| Service exits, `Cannot find module 'sharp'` | `npm ci --prefix server --omit=dev` not run as `kcut`, or wrong arch |
| Everyone gets 429 on `/admin` | `TRUST_PROXY=1` missing (all clients share 127.0.0.1) — set it, restart. Or an IP is in its 15-minute block: restart the service to clear |
| Publish status `failed` | `journalctl -u kcut-api -n 50`; check `site/` is writable for `kcut` and `ReadWritePaths` includes `/opt/kcut/site`; the live site is untouched on failure |
| Video upload returns 500 | `FFMPEG_PATH` wrong or ffmpeg not installed: `sudo -u kcut /usr/bin/ffmpeg -version` |
| nginx 403/404 on the home page | `dist` symlink target not readable by `www-data` (see 3.7) |
| Upload of a large video fails at ~1 MB or 8 MB | the `location = /api/admin/upload` block is missing or after the generic one |
| Emails not arriving | `SMTP_PASS` unset (mock mailer), or outbound 465 blocked |

## 8. Final report to the human (copy this shape)

- Deployed ref and commit hash; Node, nginx versions.
- Each step in section 3 and each smoke test in section 4: pass/fail with the key output (no secrets).
- What is still mock or pending: mail mock or real; placeholder portfolio covers (`/cover1..6.webp` are generated placeholders); human-only checks; backups copied off-server or not.
- URLs: site, `/admin` (order review), `/admin/content` (page editor). Say that the login is HTTP basic auth: any username, the `ADMIN_PASSWORD`.
- Anything you changed that is not in this file.
