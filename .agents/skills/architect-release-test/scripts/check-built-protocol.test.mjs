import assert from 'node:assert/strict';

import { test } from 'vitest';

import { checkBuiltProtocol } from './check-built-protocol.mjs';

const VIDEO_ID = '0f8b2c4e-6a1d-4f3b-9c2e-7d5a1b3c9e10';

// The shape Architect's exporter writes: each file asset's source is its id
// plus the uploaded file's extension.
const valid = () => ({
  lastModified: '2026-10-12T09:30:00.000Z',
  assetManifest: {
    [VIDEO_ID]: { name: '01.mov', type: 'video', source: `${VIDEO_ID}.mov` },
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

const inExport = () => true;

test('passes a protocol whose generated fields are well formed', () => {
  assert.deepEqual(checkBuiltProtocol(valid(), inExport), []);
});

test('accepts the exporter’s collision suffix and a sanitised id', () => {
  const built = valid();
  built.assetManifest['a/b'] = {
    name: 'second.mov',
    type: 'video',
    source: 'a_b-1.mov',
  };
  assert.deepEqual(checkBuiltProtocol(built, inExport), []);
});

test('rejects a missing modification stamp', () => {
  const built = valid();
  delete built.lastModified;
  assert.match(checkBuiltProtocol(built, inExport)[0], /lastModified/);
});

test('rejects a source not named after its asset id', () => {
  const built = valid();
  built.assetManifest[VIDEO_ID].source = '01.mov';
  assert.match(
    checkBuiltProtocol(built, inExport)[0],
    /not named after its asset id/,
  );
});

test('rejects two assets sharing one export entry', () => {
  const built = valid();
  built.assetManifest[`${VIDEO_ID}-1`] = {
    name: 'copy.mov',
    type: 'video',
    source: `${VIDEO_ID}.mov`,
  };
  const problems = checkBuiltProtocol(built, inExport);
  assert.ok(problems.some((p) => /shared with another asset/.test(p)));
});

test('rejects an asset missing from the export', () => {
  assert.match(
    checkBuiltProtocol(valid(), () => false)[0],
    /is not in the export/,
  );
});

test('rejects a source whose extension contradicts its type', () => {
  const built = valid();
  built.assetManifest[VIDEO_ID].type = 'image';
  assert.match(
    checkBuiltProtocol(built, inExport)[0],
    /does not carry a image extension/,
  );
});

test('rejects repeated entity colours', () => {
  const built = valid();
  built.codebook.node.p.color = 'node-color-seq-1';
  assert.match(checkBuiltProtocol(built, inExport)[0], /codebook.node colours/);
});

test('rejects missing and reused form field ids', () => {
  const built = valid();
  built.stages[0].form.fields[1] = {};
  built.stages[1].form.fields[0].id = 'f1';
  const problems = checkBuiltProtocol(built, inExport);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /field with no id/);
  assert.match(problems[1], /f1 is reused/);
});
