import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QueuePersistence } from '../src/server/queuePersistence.ts';
import type { Track } from '../src/types.ts';

test('restart preserves a large permitted queue and an intentionally empty blacklist', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-persistence-audit-'));
  try {
    const tracks = Array.from({ length: 250 }, (_, i) => ({ id: String(i), title: `Song ${i}`, requester: { username: 'viewer' }, playbackProvider: 'spotify' } as Track));
    fs.writeFileSync(path.join(directory, 'blacklist.json'), '[]');
    new QueuePersistence(directory).saveQueue(tracks, null, null, null, []);
    const restored = new QueuePersistence(directory).load();
    assert.equal(restored.queue.length, 250);
    assert.deepEqual(restored.queue.map(track => track.id), tracks.map(track => track.id));
    assert.deepEqual(restored.blacklist, []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
