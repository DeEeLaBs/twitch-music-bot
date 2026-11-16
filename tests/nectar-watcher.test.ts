import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

test('Windows Nectar watcher emits playback or disconnected status without controlling playback', { skip: process.platform !== 'win32', timeout: 12000 }, async () => {
  const child = spawn('powershell.exe', ['-NoProfile', '-File', path.resolve('scripts/nectar-watcher.ps1')], { windowsHide: true });
  let output = '';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Watcher emitted no playback status')), 8000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Watcher exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (output.split(/\r?\n/).some(line => {
          try { return ['state', 'disconnected'].includes(JSON.parse(line).type); } catch { return false; }
        })) { clearTimeout(timer); resolve(); }
      });
    });
    assert.match(output, /"type"\s*:\s*"ready"/);
  } finally { child.kill(); }
});
