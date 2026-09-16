// Offline tests for the release test's lane contracts.
//
// The script-driven lanes drive a browser, but what they CONCLUDE lives in
// three pure modules — the analytics payload contract, the localization
// comparison and the export reader — and those are exercised here on synthetic
// input rather than only through a running stack. Every test names the
// fail-open it prevents: each negative assertion is shown failing on a payload
// that breaks the behaviour it guards, and each positive control is shown
// failing on the empty input that would otherwise satisfy every negative
// assertion at once.
//
// Several tests bind a list in the harness to the list in the application it
// describes. Those are the ones that keep this honest as Fresco changes: a
// property renamed in the app, or an error kind added to the package, would
// otherwise leave a check looking for something nobody sends any more.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { test } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scripts = join(repoRoot, 'apps/fresco/release-test/scripts');
const require = createRequire(join(repoRoot, 'package.json'));

const {
  ELEMENT_EVENTS,
  ELEMENT_PROPERTIES,
  ENTITY_ID_PROPERTIES,
  PROTOCOL_FILE_ERROR_KINDS,
  decodeBody,
  evaluateAnalyticsContract,
} = await import(join(scripts, 'relay-payload-protocol.mjs'));

const { judgeAuthoredText, judgeInterpolated, judgeRendering, longestLiteral } =
  await import(join(scripts, 'localization-contract.mjs'));

const { readInterviewExport } = await import(
  join(scripts, 'interview-export-contract.mjs')
);

// ---------------------------------------------------------------------------
// Building payloads the way posthog does
// ---------------------------------------------------------------------------

const body = (value, { gzip = false } = {}) => {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  return (gzip ? gzipSync(json) : json).toString('base64');
};

const request = (path, value, overrides = {}) => ({
  at: '2026-09-15T12:00:00.000Z',
  method: 'POST',
  path,
  headers: { 'content-type': 'application/json' },
  bodyBytes: 10,
  truncated: false,
  bodyBase64: body(value),
  ...overrides,
});

const webEvent = (event, properties = {}) => ({
  event,
  timestamp: '2026-09-15T12:00:00.000Z',
  properties: {
    $lib: 'web',
    $current_url: 'http://localhost:3212/dashboard',
    distinct_id: 'installation-1234567890',
    ...properties,
  },
});

const interviewEvent = (event, properties = {}) =>
  webEvent(event, {
    $current_url: 'http://localhost:3212/interview/[redacted]',
    distinct_id: '8ba730b0-57ea-4efc-90b5-ceefad7f853d',
    ...properties,
  });

const serverEvent = (event, properties = {}) => ({
  event,
  timestamp: '2026-09-15T12:00:00.000Z',
  distinct_id: 'installation-1234567890',
  properties: { $lib: 'posthog-node', ...properties },
});

/** A run in which an enabled deployment behaved. */
const cleanRun = () => ({
  records: [
    request('/array/phc_key/config', {}),
    request('/flags/?v=2', {}),
    request('/e/', [
      webEvent('$pageview'),
      webEvent('ProtocolImportFailed', { reason: 'notArchive' }),
      interviewEvent('stage_entered'),
      interviewEvent('node_added', { node_id: 'pseudonym-1' }),
    ]),
    request('/batch/', { batch: [serverEvent('Interview Opened')] }),
  ],
  secrets: [
    { name: 'the interview id', value: 'cmu37z5cj000i01q94tuto8qx' },
    { name: 'node 6cca9272', value: '6cca9272-483c-42a1-90e2-8c42683f7ec6' },
  ],
  damagedImportFrom: '2026-09-15T11:00:00.000Z',
  listeningRecords: 1,
});

const failing = (input) =>
  evaluateAnalyticsContract(input)
    .checks.filter((check) => check.status !== 'pass')
    .map((check) => check.id);

// ---------------------------------------------------------------------------
// The baseline. Without it every negative test below could be passing for the
// wrong reason.
// ---------------------------------------------------------------------------

test('a clean enabled deployment satisfies every analytics check', () => {
  assert.deepEqual(failing(cleanRun()), []);
});

test('an empty capture fails every positive control', () => {
  const ids = failing({ records: [], secrets: [], listeningRecords: 1 });
  for (const id of [
    'analytics-payloads-readable',
    'analytics-initialised',
    'analytics-events-captured',
    'analytics-both-surfaces-captured',
    'analytics-server-events-captured',
    'analytics-entity-ids-reported',
    'analytics-pseudonymous-distinct-id',
    'analytics-damaged-file-not-an-error',
  ])
    assert.ok(
      ids.includes(id),
      `${id} passed over a capture with nothing in it`,
    );
});

test('a capture with no identifiers to look for proves nothing', () => {
  const run = cleanRun();
  run.secrets = [];
  assert.ok(
    failing(run).includes('analytics-no-deployment-identifiers'),
    'a leak check with nothing to look for reported a clean sweep',
  );
});

test('a sink that restarted did not watch one unbroken window', () => {
  for (const listeningRecords of [0, 2])
    assert.ok(
      failing({ ...cleanRun(), listeningRecords }).includes(
        'analytics-sink-listening',
      ),
      `${listeningRecords} announcement(s) read as one unbroken window`,
    );
});

// ---------------------------------------------------------------------------
// Each negative assertion, shown failing on the thing it forbids
// ---------------------------------------------------------------------------

test('session replay fails the run, by either path', () => {
  const byRequest = cleanRun();
  byRequest.records.push(request('/s/', { snapshots: [] }));
  assert.ok(failing(byRequest).includes('analytics-no-session-replay'));

  const byEvent = cleanRun();
  byEvent.records.push(request('/e/', [webEvent('$snapshot')]));
  assert.ok(failing(byEvent).includes('analytics-no-session-replay'));
});

test('a heatmap flush fails the run, by either path', () => {
  const byEvent = cleanRun();
  byEvent.records.push(request('/e/', [webEvent('$$heatmap')]));
  assert.ok(failing(byEvent).includes('analytics-no-heatmaps'));

  const byProperty = cleanRun();
  byProperty.records.push(
    request('/e/', [webEvent('$pageview', { $heatmap_data: { x: 1 } })]),
  );
  assert.ok(failing(byProperty).includes('analytics-no-heatmaps'));
});

test('autocapture, rageclick and dead clicks each fail the run', () => {
  for (const event of ['$autocapture', '$rageclick', '$dead_click']) {
    const run = cleanRun();
    run.records.push(request('/e/', [webEvent(event)]));
    assert.ok(
      failing(run).includes('analytics-no-autocapture'),
      `${event} was not caught`,
    );
  }
});

test('element data on any event fails the run, however deeply nested', () => {
  for (const property of ELEMENT_PROPERTIES) {
    const run = cleanRun();
    run.records.push(
      request('/e/', [
        webEvent('ProtocolInstalled', { context: { [property]: ['button'] } }),
      ]),
    );
    assert.ok(
      failing(run).includes('analytics-no-element-data'),
      `${property} was not caught`,
    );
  }
});

test('an identifier the deployment holds fails the run wherever it appears', () => {
  for (const place of [
    (id) => webEvent('Interview Opened', { interview: id }),
    (id) => webEvent('Interview Opened', { nested: { deeply: [{ id }] } }),
    (id) => interviewEvent('stage_entered', { node_id: id }),
  ]) {
    const run = cleanRun();
    run.records.push(request('/e/', [place('cmu37z5cj000i01q94tuto8qx')]));
    assert.ok(
      failing(run).includes('analytics-no-deployment-identifiers'),
      'an interview id reached the relay without failing the run',
    );
  }
});

test('a raw entity id fails the run even under a pseudonymised property name', () => {
  const run = cleanRun();
  run.records.push(
    request('/e/', [
      interviewEvent('node_added', {
        node_id: '6cca9272-483c-42a1-90e2-8c42683f7ec6',
      }),
    ]),
  );
  assert.ok(failing(run).includes('analytics-no-deployment-identifiers'));
});

test('a session id used as the distinct id fails the run', () => {
  const run = cleanRun();
  run.records = [
    request('/array/phc_key/config', {}),
    request('/e/', [
      webEvent('$pageview'),
      interviewEvent('stage_entered', {
        distinct_id: 'cmu37z5cj000i01q94tuto8qx',
      }),
      interviewEvent('node_added', {
        node_id: 'pseudonym-1',
        distinct_id: 'cmu37z5cj000i01q94tuto8qx',
      }),
    ]),
    request('/batch/', { batch: [serverEvent('Interview Opened')] }),
  ];
  const ids = failing(run);
  assert.ok(ids.includes('analytics-pseudonymous-distinct-id'));
  assert.ok(ids.includes('analytics-no-deployment-identifiers'));
});

test('a distinct id that changes per event loses what it is for', () => {
  const run = cleanRun();
  run.records.push(
    request('/e/', [
      interviewEvent('stage_exited', {
        distinct_id: '11111111-2222-3333-4444-555555555555',
      }),
    ]),
  );
  assert.ok(failing(run).includes('analytics-pseudonymous-distinct-id'));
});

test('an exception reported for a damaged file fails the run', () => {
  const run = cleanRun();
  run.records.push(
    request('/e/', [webEvent('$exception', { message: 'boom' })]),
  );
  assert.ok(failing(run).includes('analytics-damaged-file-not-an-error'));
});

test('an exception from BEFORE the damaged imports is not held against them', () => {
  const run = cleanRun();
  run.records.push(
    request('/e/', [
      {
        ...webEvent('$exception'),
        timestamp: '2026-09-15T10:00:00.000Z',
      },
    ]),
  );
  assert.ok(!failing(run).includes('analytics-damaged-file-not-an-error'));
});

test('a free-form import-failure reason fails the run', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', {
            reason: 'could not open /Users/jo/Protocols/Study One.netcanvas',
          }),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  assert.ok(failing(run).includes('analytics-damaged-file-not-an-error'));
});

test('a payload nobody could read is a violation, not a silence', () => {
  const run = cleanRun();
  run.records.push(request('/e/', {}, { truncated: true, bodyBase64: '' }));
  assert.ok(failing(run).includes('analytics-payloads-readable'));
});

// ---------------------------------------------------------------------------
// Decoding, in the shapes posthog actually sends
// ---------------------------------------------------------------------------

test('a gzip-compressed batch decodes', () => {
  const decoded = decodeBody(
    request('/e/?compression=gzip-js', [webEvent('$pageview')], {
      bodyBase64: body([webEvent('$pageview')], { gzip: true }),
    }),
  );
  assert.equal(decoded.ok, true);
  assert.equal(decoded.events.length, 1);
});

test('a form-encoded beacon decodes', () => {
  const payload = Buffer.from(
    JSON.stringify([webEvent('$pageview')]),
    'utf8',
  ).toString('base64');
  const decoded = decodeBody({
    path: '/e/',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    bodyBase64: Buffer.from(
      `data=${encodeURIComponent(payload)}`,
      'utf8',
    ).toString('base64'),
  });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.events.length, 1);
});

test('a body in no known encoding is reported, not skipped', () => {
  const decoded = decodeBody({
    path: '/e/',
    headers: {},
    bodyBase64: Buffer.from('not json at all', 'utf8').toString('base64'),
  });
  assert.equal(decoded.ok, false);
  assert.match(decoded.reason, /not JSON/);
});

// ---------------------------------------------------------------------------
// The lists this contract is written against belong to the application
// ---------------------------------------------------------------------------

/** The literal strings of one declaration, from its name to its terminator. */
const declaredStrings = (source, declaration, terminator) => {
  const from = source.indexOf(declaration);
  if (from === -1) throw new Error(`${declaration} is no longer declared`);
  const to = source.indexOf(terminator, from);
  return new Set(
    [...source.slice(from, to).matchAll(/'([$\w-]+)'/g)].map(
      (match) => match[1],
    ),
  );
};

const sorted = (values) => [...values].toSorted((a, b) => a.localeCompare(b));

test('the element events and properties are the ones Fresco drops', () => {
  const client = readFileSync(
    join(repoRoot, 'apps/fresco/lib/posthog-client.ts'),
    'utf8',
  );
  assert.deepEqual(
    sorted(declaredStrings(client, 'const ELEMENT_EVENTS', ']')),
    sorted(ELEMENT_EVENTS),
  );
  assert.deepEqual(
    sorted(declaredStrings(client, 'const ELEMENT_PROPERTIES', ']')),
    sorted(ELEMENT_PROPERTIES),
  );
});

test('the entity-id properties are the ones the interview runtime pseudonymises', () => {
  const source = readFileSync(
    join(repoRoot, 'packages/interview/src/analytics/entityIds.ts'),
    'utf8',
  );
  assert.deepEqual(
    sorted(declaredStrings(source, 'const ENTITY_ID_PROPS', ']')),
    sorted(ENTITY_ID_PROPERTIES),
  );
});

test('the import-failure vocabulary is the package’s own', () => {
  const source = readFileSync(
    join(
      repoRoot,
      'packages/protocol-validation/src/utils/protocolFileErrorKind.ts',
    ),
    'utf8',
  );
  const union = source.slice(
    source.indexOf('export type ProtocolFileErrorKind'),
    source.indexOf(';', source.indexOf('export type ProtocolFileErrorKind')),
  );
  const kinds = [...union.matchAll(/'([\w-]+)'/g)].map((match) => match[1]);
  assert.ok(kinds.length > 5, 'failed to read the union');
  assert.deepEqual(
    kinds.toSorted((a, b) => a.localeCompare(b)),
    [...PROTOCOL_FILE_ERROR_KINDS].toSorted((a, b) => a.localeCompare(b)),
  );
});

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

const catalogs = {
  english: {
    a: 'Upload and manage your interview protocols.',
    b: 'View and manage your interview data.',
    c: 'Choose the language for Fresco and built-in interview controls.',
    stored: 'Anonymous Participant',
  },
  spanish: {
    a: 'Sube y gestiona tus protocolos de entrevista.',
    b: 'Consulta y gestiona los datos de tus entrevistas.',
    c: 'Elige el idioma de Fresco y de los controles de entrevista.',
    stored: 'Participante anónimo',
  },
};
const englishPage = Object.values(catalogs.english).join('\n');

test('a page that switched language passes, and one that did not fails', () => {
  const translated = judgeRendering({
    englishText: englishPage,
    translatedText: Object.values(catalogs.spanish).join('\n'),
    english: catalogs.english,
    translated: catalogs.spanish,
  });
  assert.equal(translated.pass, true, translated.detail);

  const untranslated = judgeRendering({
    englishText: englishPage,
    translatedText: englishPage,
    english: catalogs.english,
    translated: catalogs.spanish,
  });
  assert.equal(untranslated.pass, false);
  assert.match(untranslated.detail, /still English/);
});

test('one message left in English fails a page that is otherwise translated', () => {
  const judgement = judgeRendering({
    englishText: englishPage,
    translatedText: [
      catalogs.spanish.a,
      catalogs.english.b,
      catalogs.spanish.c,
      catalogs.spanish.stored,
    ].join('\n'),
    english: catalogs.english,
    translated: catalogs.spanish,
  });
  assert.equal(judgement.pass, false);
  assert.match(judgement.detail, /still English/);
});

test('a page nobody could read fails the floor rather than passing', () => {
  const judgement = judgeRendering({
    englishText: englishPage,
    translatedText: '',
    english: catalogs.english,
    translated: catalogs.spanish,
  });
  assert.equal(judgement.pass, false);
  assert.match(judgement.detail, /positively shown|comparable message/);
});

test('a stored value rewritten by the language change fails', () => {
  const judgement = judgeRendering({
    englishText: englishPage,
    translatedText: [
      catalogs.spanish.a,
      catalogs.spanish.b,
      catalogs.spanish.c,
      catalogs.spanish.stored,
    ].join('\n'),
    english: catalogs.english,
    translated: catalogs.spanish,
    preserved: ['stored'],
  });
  assert.equal(judgement.pass, false);
  assert.match(judgement.detail, /research data, not interface copy/);
});

test('a stored value left alone passes', () => {
  const judgement = judgeRendering({
    englishText: englishPage,
    translatedText: [
      catalogs.spanish.a,
      catalogs.spanish.b,
      catalogs.spanish.c,
      catalogs.english.stored,
    ].join('\n'),
    english: catalogs.english,
    translated: catalogs.spanish,
    preserved: ['stored'],
  });
  assert.equal(judgement.pass, true, judgement.detail);
});

// The activity feed's structured details are written with placeholders, so
// they never appear verbatim and the comparison above skips them entirely.
const interpolated = {
  english: {
    'fresco.activity.detail.protocolInstalled':
      'User {username} installed protocol {protocol}.',
    'fresco.activity.detail.dataExported':
      'User {username} exported data for {count, plural, one {# interview} other {# interviews}}.',
  },
  spanish: {
    'fresco.activity.detail.protocolInstalled':
      '«{username}» instaló el protocolo {protocol}.',
    'fresco.activity.detail.dataExported':
      '«{username}» exportó los datos de {count, plural, one {# entrevista} other {# entrevistas}}.',
  },
};
const interpolatedIds = Object.keys(interpolated.english);

test('the literal run of an interpolated message is what can be looked for', () => {
  assert.equal(
    longestLiteral(interpolated.english[interpolatedIds[0]]),
    'installed protocol',
  );
  assert.equal(longestLiteral(undefined), '');
});

test('structured details that switched language pass, and ones that did not fail', () => {
  const englishFeed = 'User jo installed protocol Study One.';
  assert.equal(
    judgeInterpolated({
      englishText: englishFeed,
      translatedText: '«jo» instaló el protocolo Study One.',
      english: interpolated.english,
      translated: interpolated.spanish,
      ids: interpolatedIds,
    }).pass,
    true,
  );
  const untranslated = judgeInterpolated({
    englishText: englishFeed,
    translatedText: englishFeed,
    english: interpolated.english,
    translated: interpolated.spanish,
    ids: interpolatedIds,
  });
  assert.equal(untranslated.pass, false);
  assert.match(untranslated.detail, /still English/);
});

test('a feed with none of those messages on it proves nothing', () => {
  const judgement = judgeInterpolated({
    englishText: 'nothing has happened yet',
    translatedText: 'todavía no ha pasado nada',
    english: interpolated.english,
    translated: interpolated.spanish,
    ids: interpolatedIds,
  });
  assert.equal(judgement.pass, false);
  assert.match(judgement.detail, /nothing to compare/);
});

test('protocol-authored text that vanished fails', () => {
  assert.equal(
    judgeAuthoredText({
      translatedText: 'todo traducido',
      authored: ['Fresco release test'],
    }).pass,
    false,
  );
  assert.equal(
    judgeAuthoredText({
      translatedText: 'Fresco release test, traducido alrededor',
      authored: ['Fresco release test'],
    }).pass,
    true,
  );
  // And a check with nothing to look for is not a passing check.
  assert.equal(
    judgeAuthoredText({ translatedText: 'x', authored: [] }).pass,
    false,
  );
});

// ---------------------------------------------------------------------------
// The export reader
// ---------------------------------------------------------------------------

test('an export archive is read through its nested per-interview archives', async () => {
  const JSZip = require('jszip');
  const inner = new JSZip();
  inner.file('interview.graphml', '<graphml>Release Tester</graphml>');
  const outer = new JSZip();
  outer.file(
    'interview-1.zip',
    await inner.generateAsync({ type: 'nodebuffer' }),
  );
  outer.file('readme.txt', 'not data');
  const dir = mkdtempSync(join(tmpdir(), 'fresco-export-'));
  const path = join(dir, 'export.zip');
  writeFileSync(path, await outer.generateAsync({ type: 'nodebuffer' }));

  const found = await readInterviewExport(path);
  assert.equal(found.entries, 1);
  assert.ok(found.text.includes('Release Tester'));
});

test('an unreadable archive is reported as unreadable, not as empty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fresco-export-'));
  const path = join(dir, 'broken.zip');
  writeFileSync(path, Buffer.from('this is not a zip'));
  const found = await readInterviewExport(path);
  assert.equal(found.entries, 0);
  assert.match(found.error, /could not be read/);
});
