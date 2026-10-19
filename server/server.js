// KCUT order API entry point. Run: node server.js   (config from environment, see .env.example)
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.js';
import { createMailer } from './lib/mailer.js';
import { createApp } from './lib/app.js';
import { createBuilder } from './lib/builder.js';
import { makeBuild, makePublish } from './lib/releases.js';
import { createContentAdmin } from './lib/content-admin.js';
import { defaults } from '../site/src/data/defaults.ts';   // Node 22.18+ strips the types

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {                                   // never run with a guessable default
  adminPassword = crypto.randomBytes(9).toString('base64url');
  console.warn(`[admin] ADMIN_PASSWORD not set — temporary password for this run: ${adminPassword}`);
}

const store = createStore();
const mailer = createMailer();
// Content admin: edits site/data/content.json, then rebuilds the static site into site/releases/<ts> and swaps site/dist.
const siteDir = path.resolve(process.env.SITE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site'));
const releasesDir = path.join(siteDir, 'releases');
const builder = createBuilder({ build: makeBuild({ siteDir, releasesDir }), publish: makePublish({ siteDir, releasesDir }) });
const contentAdmin = createContentAdmin({ siteDir, defaults, builder });
createApp({ store, mailer, adminPassword, trustProxy: process.env.TRUST_PROXY === '1', contentAdmin })
  .listen(PORT, HOST, () => console.log(`KCUT API on http://${HOST}:${PORT}  store=${store.name}  mailer=${mailer.name}`));
