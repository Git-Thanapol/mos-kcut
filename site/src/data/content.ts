import fs from 'node:fs';
import path from 'node:path';
import { defaults, type Content } from './defaults';
import { validateContent, collectPaths } from '../../../server/lib/schema.js';

// Owner content: data/content.json (written by the admin service, see server/). Missing, unreadable or invalid
// file => the defaults, so the build never breaks.
export async function getContent(): Promise<Content> {
  return rebase(await readContent());
}

async function readContent(): Promise<Content> {
  const file = path.resolve(process.cwd(), 'data/content.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (validateContent(parsed, collectPaths(defaults)).ok) return parsed as Content;
    console.warn('[content] data/content.json ไม่ผ่านการตรวจสอบ ใช้ค่าเริ่มต้นแทน');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[content] อ่าน data/content.json ไม่ได้ ใช้ค่าเริ่มต้นแทน');
  }
  return defaults;
}

// The site is served under a base path (astro.config.mjs `base`), but root-relative strings in the markup and in
// content.json are not rewritten by Astro. Everything that points into public/ goes through here.
export function asset(p: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return p.startsWith('/') && !p.startsWith('//') ? base + p : p;
}

const MEDIA = /\.(webp|png|jpe?g|svg|mp4)$/i;
function rebase<T>(v: T): T {
  if (typeof v === 'string') return (MEDIA.test(v) ? asset(v) : v) as T;
  if (Array.isArray(v)) return v.map(rebase) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x)])) as T;
  return v;
}
