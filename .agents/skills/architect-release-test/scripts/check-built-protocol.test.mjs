import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import { checkBuiltProtocol } from './check-built-protocol.mjs';

const SAMPLE = new URL(
  '../../../../packages/protocols/sample/',
  import.meta.url,
);

// The sample protocol's real files, exported the way Architect's exporter
// names them: each source is the asset id plus the uploaded file's extension.
const sample = JSON.parse(readFileSync(new URL('protocol.json', SAMPLE)));
const exported = () => {
  const files = {};
  const assetManifest = {};
  for (const [id, entry] of Object.entries(sample.assetManifest)) {
    const extension = entry.source.slice(entry.source.lastIndexOf('.'));
    assetManifest[id] = { ...entry, source: `${id}${extension}` };
    files[`${id}${extension}`] = readFileSync(
      new URL(`assets/${entry.source}`, SAMPLE),
    );
  }
  return {
    files,
    built: {
      lastModified: '2026-10-12T09:30:00.000Z',
      assetManifest,
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
    },
  };
};
const reader = (files) => (source) => files[source] ?? null;
const idOf = (built, type, extension) =>
  Object.keys(built.assetManifest).find(
    (id) =>
      built.assetManifest[id].type === type &&
      built.assetManifest[id].source.endsWith(extension),
  );

// Moves an asset's export entry to another extension, keeping its bytes.
const renameEntry = ({ built, files }, id, extension) => {
  const old = built.assetManifest[id].source;
  const next = `${id}${extension}`;
  built.assetManifest[id].source = next;
  files[next] = files[old];
  delete files[old];
};

test('passes the sample exported with well-formed generated fields', () => {
  const { built, files } = exported();
  assert.deepEqual(checkBuiltProtocol(built, reader(files)), []);
});

test('accepts the exporter’s collision suffix and a sanitised id', () => {
  const { built, files } = exported();
  const id = idOf(built, 'image', '.png');
  built.assetManifest['a/b'] = {
    ...built.assetManifest[id],
    source: 'a_b-1.png',
  };
  files['a_b-1.png'] = files[`${id}.png`];
  assert.deepEqual(checkBuiltProtocol(built, reader(files)), []);
});

test('rejects a missing modification stamp', () => {
  const { built, files } = exported();
  delete built.lastModified;
  assert.match(checkBuiltProtocol(built, reader(files))[0], /lastModified/);
});

test('rejects a source not named after its asset id', () => {
  const state = exported();
  const id = idOf(state.built, 'video', '.mov');
  state.built.assetManifest[id].source = '01.mov';
  state.files['01.mov'] = state.files[`${id}.mov`];
  assert.match(
    checkBuiltProtocol(state.built, reader(state.files))[0],
    /not named after its asset id/,
  );
});

test('rejects two assets sharing one export entry', () => {
  const { built, files } = exported();
  const id = idOf(built, 'video', '.mov');
  built.assetManifest[`${id}-1`] = { ...built.assetManifest[id] };
  const problems = checkBuiltProtocol(built, reader(files));
  assert.ok(problems.some((p) => /shared with another asset/.test(p)));
});

test('rejects an asset missing from the export', () => {
  const { built } = exported();
  assert.match(
    checkBuiltProtocol(built, () => null)[0],
    /is not in the export/,
  );
});

test('rejects a CSV roster exported as JSON', () => {
  const state = exported();
  renameEntry(state, idOf(state.built, 'network', '.csv'), '.json');
  assert.match(
    checkBuiltProtocol(state.built, reader(state.files))[0],
    /does not contain json data/,
  );
});

test('rejects an upper-case extension the interview would not parse as CSV', () => {
  const state = exported();
  renameEntry(state, idOf(state.built, 'network', '.csv'), '.CSV');
  assert.match(
    checkBuiltProtocol(state.built, reader(state.files))[0],
    /does not carry a network extension/,
  );
});

test('rejects a JSON network exported as CSV', () => {
  const { built, files } = exported();
  const id = idOf(built, 'network', '.csv');
  files[`${id}.csv`] = Buffer.from('{"nodes":[]}');
  assert.match(
    checkBuiltProtocol(built, reader(files))[0],
    /does not contain csv data/,
  );
});

test('rejects image bytes under another image extension', () => {
  const state = exported();
  renameEntry(state, idOf(state.built, 'image', '.png'), '.gif');
  assert.match(
    checkBuiltProtocol(state.built, reader(state.files))[0],
    /does not contain gif data/,
  );
});

test('rejects a source whose extension contradicts its type', () => {
  const { built, files } = exported();
  built.assetManifest[idOf(built, 'video', '.mov')].type = 'image';
  assert.match(
    checkBuiltProtocol(built, reader(files))[0],
    /does not carry a image extension/,
  );
});

test('rejects repeated entity colours', () => {
  const { built, files } = exported();
  built.codebook.node.p.color = 'node-color-seq-1';
  assert.match(
    checkBuiltProtocol(built, reader(files))[0],
    /codebook.node colours/,
  );
});

test('rejects missing and reused form field ids', () => {
  const { built, files } = exported();
  built.stages[0].form.fields[1] = {};
  built.stages[1].form.fields[0].id = 'f1';
  const problems = checkBuiltProtocol(built, reader(files));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /field with no id/);
  assert.match(problems[1], /f1 is reused/);
});
