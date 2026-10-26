// Production-like static server mirroring the nginx layout: /kcut -> site/dist, /books -> web/books, everything else -> web/home
// (for local checks / Lighthouse; production uses nginx).
// gzip for text, long cache for assets, no-cache for HTML, Range for video, /api + /admin proxied to the order API.
// Run: npm run build && npm run serve   (PORT=4400 API=http://127.0.0.1:3000 to change)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve('dist');
const MOUNTS = [['/kcut', ROOT], ['/books', path.resolve('../web/books')], ['/media', path.resolve('public/media')], ['', path.resolve('../web/home')]];
const PORT = Number(process.env.PORT || 4400);
const API = new URL(process.env.API || 'http://127.0.0.1:3000');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg']);
const gz = new Map();   // path+mtime -> gzipped buffer

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
    const up = http.request({ host: API.hostname, port: API.port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end('API not running'); });
    return req.pipe(up);
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/kcut' || p === '/books') { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const [prefix, root] = MOUNTS.find(([pre]) => p === pre || p.startsWith(pre + '/'));
  let file = path.join(root, p.slice(prefix.length));
  const live = file.replace(/index\.html$/, 'index.live.html');   // written by the content admin for home and books
  if (live !== file && prefix !== '/kcut' && fs.existsSync(live)) file = live;
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(file), size = fs.statSync(file).size;
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=2592000', 'Accept-Ranges': 'bytes' };

  if (GZIP.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    const key = file + ':' + fs.statSync(file).mtimeMs;
    if (!gz.has(key)) gz.set(key, zlib.gzipSync(fs.readFileSync(file), { level: 9 }));
    const body = gz.get(key);
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': body.length, Vary: 'Accept-Encoding' });
    return res.end(body);
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serving dist on http://localhost:${PORT}`));
