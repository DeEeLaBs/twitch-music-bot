import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('portable builds exclude the restart UI and native IPC implementation', async () => {
  const [renderer, desktop] = await Promise.all([
    build({ entryPoints: ['src/App.tsx'], loader: { '.css': 'empty' }, bundle: true, write: false, platform: 'browser', define: { __LOCAL_RESTART__: 'false' } }),
    build({ entryPoints: ['desktop/main.cjs'], bundle: true, write: false, platform: 'node', external: ['electron'], define: { __MUSICBOT_RELEASE__: 'true' } })
  ]);
  for (const result of [renderer, desktop]) {
    const code = result.outputFiles[0].text;
    assert.ok(!code.includes('desktop:restart-local'));
    assert.ok(!code.includes('desktop:can-restart-local'));
    assert.ok(!code.includes('desktop:request-restart-local'));
  }
});
