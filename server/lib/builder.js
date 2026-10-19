export function createBuilder({ build, publish }) {
  let status = { state: 'idle', message: '', finishedAt: null };
  let current = null;
  let dirty = false;

  async function loop() {
    do {
      dirty = false;
      status = { state: 'building', message: '', finishedAt: null };
      try {
        const dir = await build();
        await publish(dir);
        status = { state: 'ok', message: '', finishedAt: new Date().toISOString() };
      } catch (e) {
        status = { state: 'failed', message: String(e?.message ?? e).slice(-500), finishedAt: new Date().toISOString() };
      }
    } while (dirty);
  }

  return {
    trigger() {
      dirty = true;
      if (!current) {
        dirty = false;
        status = { state: 'building', message: '', finishedAt: null };
        current = loop().finally(() => { current = null; });
      }
      return current;
    },
    status: () => status,
  };
}
