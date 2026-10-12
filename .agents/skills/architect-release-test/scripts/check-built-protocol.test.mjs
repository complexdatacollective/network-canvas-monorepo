import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { test } from 'vitest';

import { checkBuiltProtocol } from './check-built-protocol.mjs';

const VIDEO = Buffer.from('video bytes');
const VIDEO_SOURCE = `${createHash('sha256').update(VIDEO).digest('hex')}.mov`;

const valid = () => ({
  lastModified: '2026-10-12T09:30:00.000Z',
  assetManifest: {
    a: { name: '01.mov', type: 'video', source: VIDEO_SOURCE },
    k: { name: 'Mapbox', type: 'apikey', value: 'token' },
  },
  codebook: {
    node: {
      p: { color: 'node-color-seq-2' },
      q: { color: 'node-color-seq-1' },
    },
    edge: { f: { color: 'edge-color-seq-1' } },
  },
  stages: [
    { form: { fields: [{ id: 'f1' }, { id: 'f2' }] } },
    { form: { fields: [{ id: 'f3' }] } },
    {},
  ],
});

const files = { [VIDEO_SOURCE]: VIDEO };
const readAsset = (source) => files[source] ?? null;

test('passes a protocol whose generated fields are well formed', () => {
  assert.deepEqual(checkBuiltProtocol(valid(), readAsset), []);
});

test('rejects a missing modification stamp', () => {
  const built = valid();
  delete built.lastModified;
  assert.match(checkBuiltProtocol(built, readAsset)[0], /lastModified/);
});

test('rejects asset sources that are not named by their contents', () => {
  const built = valid();
  built.assetManifest.a.source = '01.mov';
  assert.match(
    checkBuiltProtocol(built, readAsset)[0],
    /not a content-addressed name/,
  );
});

test('rejects an asset whose bytes do not match its name', () => {
  const built = valid();
  const problems = checkBuiltProtocol(built, () => Buffer.from('other'));
  assert.match(problems[0], /does not match the hash/);
});

test('rejects an asset missing from the export', () => {
  assert.match(
    checkBuiltProtocol(valid(), () => null)[0],
    /is not in the export/,
  );
});

test('rejects a source whose extension contradicts its type', () => {
  const built = valid();
  built.assetManifest.a.type = 'image';
  assert.match(
    checkBuiltProtocol(built, readAsset)[0],
    /does not carry a image extension/,
  );
});

test('rejects repeated entity colours', () => {
  const built = valid();
  built.codebook.node.p.color = 'node-color-seq-1';
  assert.match(
    checkBuiltProtocol(built, readAsset)[0],
    /codebook.node colours/,
  );
});

test('rejects missing and reused form field ids', () => {
  const built = valid();
  built.stages[0].form.fields[1] = {};
  built.stages[1].form.fields[0].id = 'f1';
  const problems = checkBuiltProtocol(built, readAsset);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /field with no id/);
  assert.match(problems[1], /f1 is reused/);
});
