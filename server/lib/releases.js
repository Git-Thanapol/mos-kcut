import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function makeBuild({ siteDir, releasesDir, timeoutMs = 10 * 60 * 1000, command }) {
  return async () => {
    await fsp.mkdir(releasesDir, { recursive: true });
    const dir = path.join(releasesDir, new Date().toISOString().replace(/[:.]/g, '-'));
    const astro = path.join(siteDir, 'node_modules', 'astro', 'astro.js');
    await new Promise((resolve, reject) => {
      const [exe, args] = command ?? [process.execPath, [astro, 'build', '--outDir', dir]];
      const p = spawn(exe, args, { cwd: siteDir, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
      let err = '';
      const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`astro build timed out after ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
      p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`astro build exited ${code}: ${err}`)); });
    });
    return dir;
  };
}

export function makePublish({ siteDir, releasesDir, keep = 3 }) {
  const link = path.join(siteDir, 'dist');
  return async (dir) => {
    const st = await fsp.lstat(link).catch(() => null);
    if (st && !st.isSymbolicLink()) await fsp.rename(link, path.join(releasesDir, `initial-${Date.now()}`));

    const tmp = `${link}.tmp`;
    await fsp.rm(tmp, { force: true, recursive: true });
    await fsp.symlink(path.resolve(dir), tmp, 'junction');
    try {
      await fsp.rename(tmp, link);            // atomic on Linux
    } catch {
      await fsp.rm(link, { force: true, recursive: true });   // Windows dev fallback
      await fsp.rename(tmp, link);
    }

    const live = await fsp.realpath(link);
    const entries = await Promise.all((await fsp.readdir(releasesDir)).map(async (name) => {
      const full = path.join(releasesDir, name);
      return { full, mtime: (await fsp.stat(full)).mtimeMs };
    }));
    entries.sort((a, b) => b.mtime - a.mtime);
    for (const e of entries.slice(keep)) {
      if (path.resolve(e.full) !== path.resolve(live)) await fsp.rm(e.full, { recursive: true, force: true });
    }
  };
}
