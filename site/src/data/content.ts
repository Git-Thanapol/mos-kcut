import fs from 'node:fs';
import path from 'node:path';
import { defaults, type Content } from './defaults';
import { validateContent, collectPaths } from '../../../server/lib/schema.js';

// Owner content: data/content.json (written by the admin service, see server/). Missing, unreadable or invalid
// file => the defaults, so the build never breaks.
export async function getContent(): Promise<Content> {
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
