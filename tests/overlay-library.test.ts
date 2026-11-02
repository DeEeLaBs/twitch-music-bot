import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OverlayLibrary } from '../src/server/overlayLibrary.ts';
import { DEFAULT_OVERLAY_OPTIONS } from '../src/overlayOptions.ts';

function setup(t: { after: (fn: () => void) => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-library-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'overlays.json'), legacy: path.join(dir, 'overlay-config.json') };
}
test('legacy design is migrated once without changing the source or losing options', t => {
  const w = setup(t);
  const original = { ...DEFAULT_OVERLAY_OPTIONS, customCss: '.test { color: red; }', accent: '#123456' };
  fs.writeFileSync(w.legacy, JSON.stringify(original));
  const library = new OverlayLibrary(w.file, w.legacy);
  const first = library.list()[0];
  assert.equal(library.get(first.id).options.customCss, original.customCss);
  assert.equal(library.legacyId, first.id);
  assert.deepEqual(JSON.parse(fs.readFileSync(w.legacy, 'utf8')), original);
  const restarted = new OverlayLibrary(w.file, w.legacy);
  assert.deepEqual(restarted.list(), library.list());
});
test('create, duplicate, update, rename and delete stay independent across restarts', t => {
  const w = setup(t), library = new OverlayLibrary(w.file, w.legacy);
  const first = library.list()[0];
  const second = library.create('Zweites Overlay');
  library.update(second.id, { ...second.options, accent: '#123456' });
  const copy = library.create('Kopie', second.id);
  library.update(copy.id, { ...copy.options, accent: '#abcdef' });
  library.rename(second.id, 'Neuer Name');
  assert.equal(library.get(second.id).options.accent, '#123456');
  assert.equal(library.get(copy.id).options.accent, '#abcdef');
  assert.notEqual(library.get(first.id).options.accent, '#123456');
  const restarted = new OverlayLibrary(w.file, w.legacy);
  assert.equal(restarted.get(second.id).name, 'Neuer Name');
  restarted.remove(second.id);
  assert.throws(() => restarted.get(second.id), /nicht gefunden/);
  assert.equal(new OverlayLibrary(w.file, w.legacy).list().length, 2);
});
test('invalid IDs, names, designs and failed writes never replace saved designs', t => {
  const w = setup(t), library = new OverlayLibrary(w.file, w.legacy);
  const first = library.list()[0];
  for (const name of ['', ' '.repeat(3), 'x'.repeat(81), '\nBad']) assert.throws(() => library.create(name));
  assert.throws(() => library.update(first.id, []));
  assert.throws(() => library.get('../bad'));
  const before = library.get(first.id);
  fs.renameSync(w.file, w.file + '.saved'); fs.mkdirSync(w.file);
  assert.throws(() => library.update(first.id, { ...before.options, accent: '#123456' }));
  assert.deepEqual(library.get(first.id), before);
});
test('corrupt stores never silently reset user designs', t => {
  const w = setup(t); fs.writeFileSync(w.file, '{broken');
  assert.throws(() => new OverlayLibrary(w.file, w.legacy));
  assert.equal(fs.readFileSync(w.file, 'utf8'), '{broken');
});

test('deleting the migrated overlay preserves the separate legacy alert editor without reviving its OBS address', t => {
  const w = setup(t), library = new OverlayLibrary(w.file, w.legacy);
  const id = library.legacyId;
  library.remove(id);
  library.updateLegacy({ ...library.legacyOptions, accent: '#123456' });
  const restarted = new OverlayLibrary(w.file, w.legacy);
  assert.equal(restarted.legacyOptions.accent, '#123456');
  assert.equal(restarted.list().length, 0);
  assert.throws(() => restarted.get(id));
});

test('valid backup recovers a corrupt library and unreadable legacy files block migration', t => {
  const w = setup(t), library = new OverlayLibrary(w.file, w.legacy);
  const original = library.get(library.legacyId);
  fs.copyFileSync(w.file, w.file + '.backup');
  fs.writeFileSync(w.file, '{broken');
  const recovered = new OverlayLibrary(w.file, w.legacy);
  assert.deepEqual(JSON.parse(JSON.stringify(recovered.get(original.id))), original);
  assert.deepEqual(JSON.parse(fs.readFileSync(w.file + '.backup', 'utf8')).overlays[0], original);
  const other = path.join(w.dir, 'new-library.json');
  fs.writeFileSync(w.legacy, '{broken');
  assert.throws(() => new OverlayLibrary(other, w.legacy));
  assert.equal(fs.existsSync(other), false);
});
