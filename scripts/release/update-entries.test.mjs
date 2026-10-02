import assert from 'node:assert/strict';

import { test } from 'vitest';

import { changesetsMissingUpdateLines } from './check-changeset-update-lines.mjs';
import {
  addReleaseEntries,
  missingReleaseEntries,
  parseCsv,
  readUpdateLine,
  stringifyCsv,
  stripUpdateLine,
  userNotesFor,
} from './update-entries.mjs';

const architect = { name: '@codaco/architect', type: 'patch' };
const interviewer = { name: '@codaco/interviewer', type: 'patch' };
const frescoUi = { name: '@codaco/fresco-ui', type: 'patch' };

test('reads and strips the Update line of a changeset', () => {
  const summary =
    'Import no longer fails on rosters.\n\nUpdate: Importing a protocol with a roster works again.\n\nMore detail for developers.';

  assert.equal(
    readUpdateLine(summary),
    'Importing a protocol with a roster works again.',
  );
  assert.equal(
    stripUpdateLine(summary),
    'Import no longer fails on rosters.\n\nMore detail for developers.',
  );
  assert.equal(readUpdateLine('No line here.'), null);
});

test('collects one note per app, preferring the Update line', () => {
  const notes = userNotesFor([
    {
      releases: [architect, interviewer],
      summary: 'Developer note.\n\nUpdate: Both apps load faster.',
    },
    {
      releases: [architect],
      summary: 'A changeset written before Update lines.\nIt wraps.\n\nMore.',
    },
    {
      releases: [interviewer],
      summary: 'Internal refactor.\n\nUpdate: none',
    },
    {
      releases: [frescoUi],
      summary: 'Update: A library change no app names.',
    },
  ]);

  assert.deepEqual(notes.get('architect'), [
    'Both apps load faster.',
    'A changeset written before Update lines. It wraps.',
  ]);
  assert.deepEqual(notes.get('interviewer'), ['Both apps load faster.']);
  assert.deepEqual(notes.get('fresco'), []);
});

test('round-trips quoted multi-line CSV fields', () => {
  const rows = [
    {
      id: 'a',
      date: '2026-10-14',
      kind: 'fix',
      versions: 'architect@8.3.1',
      title: 'Architect 8.3.1',
      summary: '- Says "hello", twice.\n- Second line.',
      details: '',
      link: '',
    },
  ];

  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
});

test('adds a release entry per app and fills in pending launch versions', () => {
  const rows = [
    {
      id: 'big-launch',
      date: '2026-10-01',
      kind: 'launch',
      versions: 'architect|interviewer',
      title: 'Big launch',
      summary: 'Something new.',
      details: '',
      link: '',
    },
  ];
  const notes = new Map([
    ['architect', ['Faster loading.', 'Fixed import.']],
    ['interviewer', []],
  ]);

  const result = addReleaseEntries(rows, {
    released: [
      { app: 'architect', version: '8.3.1' },
      { app: 'interviewer', version: '8.3.1' },
    ],
    notes,
    date: '2026-10-14',
  });

  assert.deepEqual(
    result.added.map(({ id, title, summary }) => ({ id, title, summary })),
    [
      {
        id: 'architect-8-3-1',
        title: 'Architect 8.3.1',
        summary: '- Faster loading.\n- Fixed import.',
      },
      {
        id: 'interviewer-8-3-1',
        title: 'Interviewer 8.3.1',
        summary: '- Maintenance and stability improvements.',
      },
    ],
  );
  assert.equal(
    result.rows.find(({ id }) => id === 'big-launch')?.versions,
    'architect@8.3.1|interviewer@8.3.1',
  );
  assert.equal(result.rows[0]?.kind, 'fix');
  assert.equal(result.rows[0]?.versions, 'architect@8.3.1');
});

test('treats a minor or major release as a feature update', () => {
  const { added } = addReleaseEntries([], {
    released: [
      { app: 'architect', version: '8.4.0' },
      { app: 'interviewer', version: '9.0.0' },
      { app: 'fresco', version: '4.2.1' },
    ],
    notes: new Map(),
    date: '2026-10-14',
  });

  assert.deepEqual(
    added.map(({ kind }) => kind),
    ['feature', 'feature', 'fix'],
  );
});

test('does not add a release entry twice', () => {
  const first = addReleaseEntries([], {
    released: [{ app: 'fresco', version: '4.2.1' }],
    notes: new Map(),
    date: '2026-10-14',
  });
  const second = addReleaseEntries(first.rows, {
    released: [{ app: 'fresco', version: '4.2.1' }],
    notes: new Map(),
    date: '2026-10-15',
  });

  assert.equal(second.added.length, 0);
  assert.equal(second.rows.length, 1);
});

test('reports released versions no entry covers', () => {
  const rows = [
    { versions: 'architect@8.3.1|interviewer' },
    { versions: 'fresco@4.2.0' },
  ];

  assert.deepEqual(
    missingReleaseEntries(rows, [
      { app: 'architect', version: '8.3.1' },
      { app: 'interviewer', version: '8.3.1' },
      { app: 'fresco', version: '4.2.0' },
    ]),
    [{ app: 'interviewer', version: '8.3.1' }],
  );
});

test('requires an Update line only on changesets that name an app', () => {
  const offenders = changesetsMissingUpdateLines([
    { file: 'a.md', releases: [architect], summary: 'No line.' },
    { file: 'b.md', releases: [architect], summary: 'Note.\n\nUpdate: none' },
    { file: 'c.md', releases: [frescoUi], summary: 'Library only.' },
    {
      file: 'd.md',
      releases: [{ name: 'fresco', type: 'minor' }],
      summary: 'Update: Fresco sends fewer emails.',
    },
  ]);

  assert.deepEqual(
    offenders.map(({ file }) => file),
    ['a.md'],
  );
});
