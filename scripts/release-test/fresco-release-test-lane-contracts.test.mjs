// Offline tests for the release test's lane contracts.
//
// The script-driven lanes drive a browser, but what they CONCLUDE lives in
// pure modules — the analytics payload contract, the localization
// comparison, the export reader, what a schema 9 export has to record, and
// what an upgrade has to leave alone in the schema 8 protocols and
// interviews a deployment holds — and those are exercised here on synthetic
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
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
  APP_DEFECT_KINDS,
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

const {
  ENCRYPTED_PLACEHOLDER,
  anythingBut,
  categoricalColumns,
  edgeAnswerProblems,
  edgeSetProblems,
  egoAnswerProblems,
  encryptedValueProblems,
  finishOutcomeProblems,
  nodeAnswerProblems,
  finishOutcomesByFormat,
  splitCsvRow,
} = await import(join(scripts, 'schema9-export-contract.mjs'));

const {
  KEPT_SCHEMA,
  familyKeptProblems,
  interviewKeptProblems,
  protocolKeptProblems,
} = await import(join(scripts, 'migration-contract.mjs'));

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

/**
 * The exception posthog-js would send for a migration that returned garbage —
 * which none of the damaged imports may send: they are schema 8 and 9, which
 * Fresco stores as they are.
 */
const upgradeException = () =>
  webEvent('$exception', {
    $exception_list: [
      { type: 'MigrationResultInvalidError', value: 'Migration resulted…' },
    ],
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

test('a migration error reported during the imports fails the run', () => {
  const run = cleanRun();
  run.records.push(request('/e/', [upgradeException()]));
  assert.ok(failing(run).includes('analytics-damaged-file-not-an-error'));
});

test('a refusal naming a failed upgrade fails the run, with no exception', () => {
  const run = cleanRun();
  run.records.push(
    request('/e/', [
      webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
    ]),
  );
  assert.ok(failing(run).includes('analytics-damaged-file-not-an-error'));
});

test('a failed upgrade does not stand in for a damaged file', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  assert.ok(failing(run).includes('analytics-damaged-file-not-an-error'));
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
    join(repoRoot, 'packages/interview/src/analytics/entityIdProperties.ts'),
    'utf8',
  );
  assert.deepEqual(
    sorted(declaredStrings(source, 'export const ENTITY_ID_PROPERTIES', ']')),
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

test('the failed-upgrade kinds are the package’s own', () => {
  const source = readFileSync(
    join(
      repoRoot,
      'packages/protocol-validation/src/utils/protocolFileErrorKind.ts',
    ),
    'utf8',
  );
  const start = source.indexOf('const APP_DEFECT_KINDS');
  const declared = source.slice(start, source.indexOf(']);', start));
  const kinds = [...declared.matchAll(/'([\w-]+)'/g)].map((match) => match[1]);
  assert.ok(kinds.length > 0, 'failed to read APP_DEFECT_KINDS');
  assert.deepEqual(
    kinds.toSorted((a, b) => a.localeCompare(b)),
    [...APP_DEFECT_KINDS].toSorted((a, b) => a.localeCompare(b)),
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

// ---------------------------------------------------------------------------
// What a schema 9 export records
// ---------------------------------------------------------------------------

// An ego CSV and a GraphML file as the exporters write them, one row and one
// graph per interview.
const egoCsv = (rows) =>
  [
    'networkCanvasEgoUUID,networkCanvasCaseID,networkCanvasSessionID,networkCanvasProtocolName,networkCanvasFinishOutcome,name',
    ...rows.map(
      ([session, outcome, name]) =>
        `e-${session},case,${session},"Protocol, with a comma",${outcome},${name}`,
    ),
  ].join('\r\n');
const graphml = (graphs) =>
  `<?xml version="1.0"?><graphml>${graphs
    .map(
      ([session, outcome]) =>
        `<graph edgedefault="undirected" nc:sessionUUID="${session}" nc:protocolUID="p"${outcome ? ` nc:finishOutcome="${outcome}"` : ''}><node id="n"/></graph>`,
    )
    .join('')}</graphml>`;
const exported = (csvRows, graphs) => [
  { name: 'a_ego.csv', text: egoCsv(csvRows) },
  { name: 'a_edgeList.csv', text: 'from,to\r\n1,2' },
  { name: 'a.graphml', text: graphml(graphs) },
];

test('a quoted CSV cell keeps its commas and doubled quotes', () => {
  assert.deepEqual(splitCsvRow('a,"b, c","say ""hi""",'), [
    'a',
    'b, c',
    'say "hi"',
    '',
  ]);
});

test('each format reports where every exported interview ended', () => {
  const files = exported(
    [
      ['s1', 'completed', 'Rosa'],
      ['s2', 'terminated', 'Declina'],
    ],
    [
      ['s1', 'completed'],
      ['s2', 'terminated'],
    ],
  );
  assert.deepEqual(finishOutcomesByFormat(files), {
    csv: { s1: 'completed', s2: 'terminated' },
    graphml: { s1: 'completed', s2: 'terminated' },
  });
  assert.deepEqual(
    finishOutcomeProblems(files, { s1: 'completed', s2: 'terminated' }),
    [],
  );
});

test('an outcome recorded wrongly in either format fails', () => {
  const wrongInCsv = exported(
    [['s1', 'terminated', 'Rosa']],
    [['s1', 'completed']],
  );
  assert.deepEqual(finishOutcomeProblems(wrongInCsv, { s1: 'completed' }), [
    'csv records interview s1 as "terminated", expected "completed"',
  ]);
  const missingInGraphml = exported([['s1', 'completed', 'Rosa']], [['s1']]);
  assert.deepEqual(
    finishOutcomeProblems(missingInGraphml, { s1: 'completed' }),
    ['graphml records interview s1 as "", expected "completed"'],
  );
});

test('an interview left out of a format is a problem, not a pass by omission', () => {
  const files = exported([['s1', 'completed', 'Rosa']], [['s1', 'completed']]);
  assert.deepEqual(
    finishOutcomeProblems(files, { s1: 'completed', s2: 'terminated' }),
    ['csv has no row for interview s2', 'graphml has no row for interview s2'],
  );
  // An export with no data at all fails every expected interview, twice.
  assert.equal(finishOutcomeProblems([], { s1: 'completed' }).length, 2);
});

test('an interview recorded twice is a problem even when one record is right', () => {
  const files = exported(
    [
      ['s1', 'terminated', 'Rosa'],
      ['s1', 'completed', 'Rosa'],
    ],
    [
      ['s1', 'terminated'],
      ['s1', 'completed'],
    ],
  );
  assert.deepEqual(finishOutcomeProblems(files, { s1: 'completed' }), [
    'csv records interview s1 2 times ("terminated", "completed")',
    'graphml records interview s1 2 times ("terminated", "completed")',
  ]);
});

test('an interview finished before outcomes existed records none, and that is checkable', () => {
  const files = exported([['old', '', 'Mira']], [['old']]);
  assert.deepEqual(finishOutcomeProblems(files, { old: '' }), []);
  assert.equal(finishOutcomeProblems(files, { old: 'completed' }).length, 2);
});

test('the finish outcome is read from the column and attribute the exporters write', () => {
  const helpers = readFileSync(
    join(
      repoRoot,
      'packages/network-exporters/src/formatters/graphml/helpers.ts',
    ),
    'utf8',
  );
  assert.ok(helpers.includes("'nc:finishOutcome'"));
  assert.ok(helpers.includes("'nc:sessionUUID'"));
  const consts = readFileSync(
    join(repoRoot, 'packages/shared-consts/src/export-process.ts'),
    'utf8',
  );
  assert.match(
    consts,
    /ncFinishOutcomeProperty = 'networkCanvasFinishOutcome'/,
  );
  assert.match(consts, /ncSessionProperty = 'networkCanvasSessionID'/);
});

const personCsv = (rows) =>
  [
    'nodeID,networkCanvasUUID,name,hours,context_work,context_family',
    ...rows.map(
      ([id, name, hours = '', work = '', family = ''], index) =>
        `${index + 1},${id},${name},${hours},${work},${family}`,
    ),
  ].join('\r\n');
// GraphML numbers its nodes and carries each node's id as data, and names its
// keys opaquely: the attribute's name is on the <key>.
const personGraphml = (nodes) =>
  [
    '<graphml>',
    '<key id="networkCanvasUUID" attr.name="networkCanvasUUID" attr.type="string" for="all"/>',
    '<key id="var-1" attr.name="name" attr.type="string" for="node"/>',
    '<key id="hours" attr.name="hours" attr.type="int" for="node"/>',
    '<key id="context_a1" attr.name="context_work" attr.type="boolean" for="node"/>',
    '<key id="context_b2" attr.name="context_family" attr.type="boolean" for="node"/>',
    '<graph>',
    ...nodes.map(
      ([id, name, hours, work, family], index) =>
        `<node id="${index + 1}"><data key="networkCanvasUUID">${id}</data><data key="var-1">${name}</data>${hours === undefined ? '' : `<data key="hours">${hours}</data><data key="context_a1">${work}</data><data key="context_b2">${family}</data>`}</node>`,
    ),
    '</graph></graphml>',
  ].join('');

test("each person's answers are read from that person's own records", () => {
  const files = [
    {
      name: 'a_attributeList_Person.csv',
      text: personCsv([
        ['ana', 'Ana', '5', 'true', 'false'],
        ['bruno', 'Bruno', '12', 'false', 'true'],
      ]),
    },
    {
      name: 'a.graphml',
      text: personGraphml([
        ['ana', 'Ana', '5', 'true', 'false'],
        ['bruno', 'Bruno', '12', 'false', 'true'],
      ]),
    },
  ];
  const expected = {
    ana: { hours: '5', context_work: 'true', context_family: 'false' },
    bruno: { hours: '12', context_work: 'false', context_family: 'true' },
  };
  assert.deepEqual(nodeAnswerProblems(files, expected), []);
});

test('an answer dropped from its record fails even though the value appears elsewhere', () => {
  // Bruno's hours are lost; "5" is still in the archive, as Ana's answer.
  const files = [
    {
      name: 'a_attributeList_Person.csv',
      text: personCsv([
        ['ana', 'Ana', '5', 'true', 'false'],
        ['bruno', 'Bruno', '', 'false', 'true'],
      ]),
    },
    {
      name: 'a.graphml',
      text: personGraphml([
        ['ana', 'Ana', '5', 'true', 'false'],
        ['bruno', 'Bruno', '5', 'true', 'true'],
      ]),
    },
  ];
  assert.deepEqual(
    nodeAnswerProblems(files, {
      bruno: { hours: '5', context_work: 'false' },
    }),
    [
      'a_attributeList_Person.csv\'s record for node bruno holds hours="", expected "5"',
      'a.graphml\'s record for node bruno holds context_work="true", expected "false"',
    ],
  );
  assert.deepEqual(nodeAnswerProblems(files, { carla: { hours: '5' } }), [
    'no exported csv file has a record for node carla',
    'no exported graphml file has a record for node carla',
  ]);
});

test('a node the GraphML leaves out is not covered by its CSV row', () => {
  const files = [
    {
      name: 'a_attributeList_Person.csv',
      text: personCsv([['ana', ENCRYPTED_PLACEHOLDER, '5', 'true', 'false']]),
    },
    { name: 'a.graphml', text: personGraphml([]) },
  ];
  assert.deepEqual(nodeAnswerProblems(files, { ana: { hours: '5' } }), [
    'no exported graphml file has a record for node ana',
  ]);
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'ana'), [
    'no exported graphml file has a record for node ana',
  ]);
});

test('an encrypted answer exported as its placeholder passes', () => {
  const files = [
    {
      name: 'a_attributeList_person.csv',
      text: personCsv([['linda', ENCRYPTED_PLACEHOLDER]]),
    },
    {
      name: 'a.graphml',
      text: personGraphml([['linda', ENCRYPTED_PLACEHOLDER]]),
    },
  ];
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'linda'), []);
});

test('an encrypted answer exported in plain text fails, wherever it appears', () => {
  const files = [
    {
      name: 'a_attributeList_person.csv',
      text: personCsv([['linda', ENCRYPTED_PLACEHOLDER]]),
    },
    {
      name: 'a.graphml',
      text: `${personGraphml([['linda', ENCRYPTED_PLACEHOLDER]])}<!-- Linda -->`,
    },
  ];
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'linda'), [
    'a.graphml holds "Linda" in plain text',
  ]);
});

test('an export that dropped the encrypted attribute altogether proves nothing', () => {
  const files = [{ name: 'a_attributeList_person.csv', text: 'id\r\n1' }];
  const problems = encryptedValueProblems(files, 'Linda', 'linda');
  assert.deepEqual(problems, [
    'no exported csv file has a record for node linda',
    'no exported graphml file has a record for node linda',
  ]);
});

test('a node exported twice in one format is a duplicated person, even when the copies agree', () => {
  const files = [
    {
      name: 'a_attributeList_Person.csv',
      text: personCsv([
        ['ana', ENCRYPTED_PLACEHOLDER, '5', 'true', 'false'],
        ['ana', ENCRYPTED_PLACEHOLDER, '5', 'true', 'false'],
      ]),
    },
    {
      name: 'a.graphml',
      text: personGraphml([
        ['ana', ENCRYPTED_PLACEHOLDER, '5', 'true', 'false'],
      ]),
    },
  ];
  assert.deepEqual(nodeAnswerProblems(files, { ana: { hours: '5' } }), [
    'the exported csv files hold 2 records for node ana',
  ]);
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'ana'), [
    'the exported csv files hold 2 records for node ana',
  ]);
});

test("another person's placeholder does not stand in for a dropped answer", () => {
  // The pedigree labels a relative itself and encrypts that label too, so the
  // placeholder appears in the export even when Linda's own answer is lost.
  const files = [
    {
      name: 'a_attributeList_person.csv',
      text: personCsv([
        ['linda', ''],
        ['generated', ENCRYPTED_PLACEHOLDER],
      ]),
    },
    {
      name: 'a.graphml',
      text: personGraphml([
        ['linda', ''],
        ['generated', ENCRYPTED_PLACEHOLDER],
      ]),
    },
  ];
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'linda'), [
    'a_attributeList_person.csv\'s record for node linda holds name="", not the ENCRYPTED placeholder, so its encrypted answer was dropped',
    'a.graphml\'s record for node linda holds name="", not the ENCRYPTED placeholder, so its encrypted answer was dropped',
  ]);
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'generated'), []);
});

// Each interview's ego, as the exporters write it: one ego CSV row per
// interview, carrying its session id, and one GraphML graph per interview,
// whose own <data> (outside every <node> and <edge>) is the ego's.
const egoAnswersCsv = (rows) =>
  [
    'networkCanvasEgoUUID,networkCanvasCaseID,networkCanvasSessionID,ego_name,consent',
    ...rows.map(
      ([session, name, consent]) =>
        `e-${session},case,${session},${name},${consent}`,
    ),
  ].join('\r\n');
const egoAnswersGraphml = (graphs) =>
  [
    '<graphml>',
    '<key id="networkCanvasUUID" attr.name="networkCanvasUUID" attr.type="string" for="all"/>',
    '<key id="ego-var-1" attr.name="ego_name" attr.type="string" for="graph"/>',
    '<key id="ego-var-2" attr.name="consent" attr.type="boolean" for="graph"/>',
    '<key id="var-1" attr.name="ego_name" attr.type="string" for="node"/>',
    ...graphs.map(
      ([session, name, consent, nodeName]) =>
        `<graph edgedefault="undirected" nc:sessionUUID="${session}">${name === undefined ? '' : `<data key="networkCanvasUUID">e-${session}</data><data key="ego-var-1">${name}</data><data key="ego-var-2">${consent}</data>`}<node id="1"><data key="networkCanvasUUID">n-${session}</data><data key="var-1">${nodeName ?? 'someone'}</data></node></graph>`,
    ),
    '</graphml>',
  ].join('');
const egoFiles = (rows, graphs = rows) => [
  { name: 'a_ego.csv', text: egoAnswersCsv(rows) },
  { name: 'a.graphml', text: egoAnswersGraphml(graphs) },
];
const ROSA = { ego_name: 'Rosa', consent: 'true' };
const DECLINA = { ego_name: 'Declina', consent: 'false' };

test("each interview's ego answers are read from that interview's own ego records", () => {
  const files = egoFiles([
    ['s1', 'Rosa', 'true'],
    ['s2', 'Declina', 'false'],
  ]);
  assert.deepEqual(egoAnswerProblems(files, { s1: ROSA, s2: DECLINA }), []);
});

test("an ego answer recorded on another interview's ego fails, though the archive holds it", () => {
  // The two interviews' names swapped: every name is somewhere in the
  // archive, which is all a search of its text could see.
  const files = egoFiles([
    ['s1', 'Declina', 'true'],
    ['s2', 'Rosa', 'false'],
  ]);
  assert.deepEqual(egoAnswerProblems(files, { s1: ROSA }), [
    'a_ego.csv\'s record for the ego of interview s1 holds ego_name="Declina", expected "Rosa"',
    'a.graphml\'s record for the ego of interview s1 holds ego_name="Declina", expected "Rosa"',
  ]);
});

test("a person's answer under the same name is not the ego's", () => {
  // The GraphML graph lost its ego data; a node in it still holds "Rosa"
  // under an attribute of the same name.
  const files = egoFiles(
    [['s1', 'Rosa', 'true']],
    [['s1', undefined, undefined, 'Rosa']],
  );
  assert.deepEqual(egoAnswerProblems(files, { s1: { ego_name: 'Rosa' } }), [
    'a.graphml\'s record for the ego of interview s1 holds ego_name=null, expected "Rosa"',
  ]);
});

test('an interview a format leaves out, or records twice, fails', () => {
  const missing = egoFiles([['s1', 'Rosa', 'true']], []);
  assert.deepEqual(egoAnswerProblems(missing, { s1: ROSA }), [
    'no exported graphml file has a record for the ego of interview s1',
  ]);
  const twice = egoFiles(
    [
      ['s1', 'Rosa', 'true'],
      ['s1', 'Rosa', 'true'],
    ],
    [['s1', 'Rosa', 'true']],
  );
  assert.deepEqual(egoAnswerProblems(twice, { s1: ROSA }), [
    'the exported csv files hold 2 records for the ego of interview s1',
  ]);
  assert.equal(egoAnswerProblems([], { s1: ROSA }).length, 2);
});

// A relationship as the exporters write it: one edge list row and one
// GraphML <edge>, each carrying the edge's id and both ends' ids.
const familyEdgeCsv = (rows) =>
  [
    'edgeID,networkCanvasEgoUUID,networkCanvasUUID,networkCanvasSourceUUID,networkCanvasTargetUUID,kind_biological,kind_partner,gestationalCarrier',
    ...rows.map(
      ([id, from, to, biological, partner, carrier], index) =>
        `${index + 1},ego,${id},${from},${to},${biological},${partner},${carrier}`,
    ),
  ].join('\r\n');
const familyEdgeGraphml = (edges) =>
  [
    '<graphml>',
    '<key id="networkCanvasUUID" attr.name="networkCanvasUUID" attr.type="string" for="all"/>',
    '<key id="networkCanvasSourceUUID" attr.name="networkCanvasSourceUUID" attr.type="string" for="edge"/>',
    '<key id="networkCanvasTargetUUID" attr.name="networkCanvasTargetUUID" attr.type="string" for="edge"/>',
    '<key id="kind_a" attr.name="kind_biological" attr.type="boolean" for="edge"/>',
    '<key id="kind_b" attr.name="kind_partner" attr.type="boolean" for="edge"/>',
    '<key id="carrier" attr.name="gestationalCarrier" attr.type="boolean" for="edge"/>',
    '<graph>',
    ...edges.map(
      ([id, from, to, biological, partner, carrier], index) =>
        `<edge id="${index + 1}" source="1" target="2"><data key="networkCanvasUUID">${id}</data><data key="networkCanvasSourceUUID">${from}</data><data key="networkCanvasTargetUUID">${to}</data><data key="kind_a">${biological}</data><data key="kind_b">${partner}</data><data key="carrier">${carrier}</data></edge>`,
    ),
    '</graph></graphml>',
  ].join('');
const LINDA_PARENT = {
  networkCanvasSourceUUID: 'linda',
  networkCanvasTargetUUID: 'ego',
  kind_biological: 'true',
  kind_partner: 'false',
  gestationalCarrier: 'true',
};

test("each relationship's answers are read from that relationship's own records", () => {
  const rows = [
    ['parent', 'linda', 'ego', 'true', 'false', 'true'],
    ['partners', 'linda', 'robert', 'false', 'true', ''],
  ];
  const files = [
    { name: 'a_edgeList_family.csv', text: familyEdgeCsv(rows) },
    { name: 'a.graphml', text: familyEdgeGraphml(rows) },
  ];
  assert.deepEqual(edgeAnswerProblems(files, { parent: LINDA_PARENT }), []);
});

test('a relationship between the wrong people, of the wrong kind, or without its carrier fails', () => {
  const files = [
    {
      name: 'a_edgeList_family.csv',
      // Drawn from Linda to Robert rather than to the participant.
      text: familyEdgeCsv([
        ['parent', 'linda', 'robert', 'true', 'false', 'true'],
      ]),
    },
    {
      name: 'a.graphml',
      // Recorded as a partnership, and the carrier answer lost.
      text: familyEdgeGraphml([
        ['parent', 'linda', 'ego', 'false', 'true', ''],
      ]),
    },
  ];
  assert.deepEqual(edgeAnswerProblems(files, { parent: LINDA_PARENT }), [
    'a_edgeList_family.csv\'s record for edge parent holds networkCanvasTargetUUID="robert", expected "ego"',
    'a.graphml\'s record for edge parent holds kind_biological="false", expected "true"',
    'a.graphml\'s record for edge parent holds kind_partner="true", expected "false"',
    'a.graphml\'s record for edge parent holds gestationalCarrier="", expected "true"',
  ]);
});

test('a categorical answer is held to every option the codebook lists', () => {
  const codebook = {
    edge: {
      fe: {
        variables: {
          k: {
            name: 'kind',
            options: [
              { value: 'biological' },
              { value: 'partner' },
              { value: 'donor' },
            ],
          },
        },
      },
    },
  };
  assert.deepEqual(
    categoricalColumns(codebook, 'edge', 'fe', 'k', 'biological'),
    {
      kind_biological: 'true',
      kind_partner: 'false',
      kind_donor: 'false',
    },
  );
  assert.throws(
    () => categoricalColumns(codebook, 'edge', 'fe', 'k', 'twin'),
    /has no option "twin"/,
  );
});

test('a flag nobody set may be blank or left out, but never true', () => {
  const rows = [['parent', 'linda', 'ego', 'true', 'false', 'true']];
  const files = [
    { name: 'a_edgeList_family.csv', text: familyEdgeCsv(rows) },
    { name: 'a.graphml', text: familyEdgeGraphml(rows) },
  ];
  assert.deepEqual(
    edgeAnswerProblems(files, {
      parent: { currentPartner: anythingBut('true') },
    }),
    [],
  );
  assert.deepEqual(
    edgeAnswerProblems(files, {
      parent: { gestationalCarrier: anythingBut('true') },
    }),
    [
      'a_edgeList_family.csv\'s record for edge parent holds gestationalCarrier="true", expected anything but "true"',
      'a.graphml\'s record for edge parent holds gestationalCarrier="true", expected anything but "true"',
    ],
  );
});

test('the export holds exactly the stored relationships, once each', () => {
  const rows = [
    ['parent', 'linda', 'ego', 'true', 'false', 'true'],
    ['other', 'robert', 'ego', 'true', 'false', 'false'],
  ];
  const files = [
    { name: 'a_edgeList_family.csv', text: familyEdgeCsv(rows) },
    { name: 'a.graphml', text: familyEdgeGraphml(rows) },
  ];
  assert.deepEqual(edgeSetProblems(files, ['parent', 'other']), []);
  const extra = [...rows, ['spurious', 'linda', 'robert', 'false', 'true', '']];
  assert.deepEqual(
    edgeSetProblems(
      [
        { name: 'a_edgeList_family.csv', text: familyEdgeCsv(extra) },
        { name: 'a.graphml', text: familyEdgeGraphml([...rows, rows[0]]) },
      ],
      ['parent', 'other'],
    ),
    [
      'the exported csv files hold the relationships ["other","parent","spurious"], not ["other","parent"]',
      'the exported graphml files hold the relationships ["other","parent","parent"], not ["other","parent"]',
    ],
  );
});

test('a relationship the GraphML leaves out is not covered by its edge list row', () => {
  const row = ['parent', 'linda', 'ego', 'true', 'false', 'true'];
  const files = [
    { name: 'a_edgeList_family.csv', text: familyEdgeCsv([row]) },
    { name: 'a.graphml', text: familyEdgeGraphml([]) },
  ];
  assert.deepEqual(edgeAnswerProblems(files, { parent: LINDA_PARENT }), [
    'no exported graphml file has a record for edge parent',
  ]);
  // Nor is a node with that id an edge.
  assert.deepEqual(
    edgeAnswerProblems(
      [{ name: 'a.graphml', text: personGraphml([['parent', 'Linda']]) }],
      { parent: {} },
    ),
    [
      'no exported csv file has a record for edge parent',
      'no exported graphml file has a record for edge parent',
    ],
  );
});

// ---------------------------------------------------------------------------
// What an upgrade must leave alone: a deployment's schema 8 data
// ---------------------------------------------------------------------------

// Two readings of one deployment, as migration-lane.mjs takes them either
// side of the swap: a schema 8 protocol with an introduction panel and a
// Family Pedigree, an interview parked on its Alter Form with a family and
// the pedigree's schema 8 stage record, and a finished one. The upgrade
// leaves every value as it was; the newer database reads the finish columns
// it added as null, and jsonb hands keys back in an order of its own.
const SKIP = { action: 'SKIP', filter: { join: 'AND', rules: [] } };
const readings = () => {
  const family = {
    nodes: [
      {
        _uid: 'you',
        type: 'family_member',
        stageId: 'family',
        attributes: { is_ego: true, biologicalSex: ['female'] },
      },
      {
        _uid: 'linda',
        type: 'family_member',
        stageId: 'family',
        attributes: { fm_name: 'Linda', biologicalSex: ['female'] },
      },
      {
        _uid: 'robert',
        type: 'family_member',
        stageId: 'family',
        attributes: { fm_name: 'Robert', biologicalSex: ['male'] },
      },
    ],
    edges: [
      {
        _uid: 'egg',
        type: 'family_edge',
        from: 'linda',
        to: 'you',
        attributes: {
          relationshipType: ['biological'],
          gameteRole: ['egg'],
          isGestationalCarrier: true,
          isActive: true,
        },
      },
      {
        _uid: 'partners',
        type: 'family_edge',
        from: 'linda',
        to: 'robert',
        attributes: { relationshipType: ['partner'], isActive: true },
      },
    ],
  };
  const before = {
    protocols: [
      {
        id: 'p1',
        name: 'migration',
        hash: 'schema-8-hash',
        schemaVersion: 8,
        description: null,
        importedAt: '2026-10-01 12:00:00',
        lastModified: '2026-09-01 12:00:00',
        codebook: { node: { person: { variables: {} } } },
        stages: [
          { id: 'welcome', type: 'Information' },
          {
            id: 'family',
            type: 'FamilyPedigree',
            nodeConfig: { type: 'family_member' },
            edgeConfig: { type: 'family_edge' },
          },
          {
            id: 'each-person',
            type: 'AlterForm',
            introductionPanel: {
              title: 'About each person',
              text: 'Now each person.',
            },
            skipLogic: SKIP,
            form: { fields: [] },
          },
        ],
      },
    ],
    interviews: [
      {
        id: 'parked',
        protocolId: 'p1',
        participantId: 'participant-1',
        startTime: '2026-10-01 12:00:00',
        finishTime: null,
        currentStep: 2,
        isSynthetic: false,
        finishStageId: null,
        finishOutcome: null,
        network: {
          ego: { _uid: 'ego', attributes: { name: 'Mira' } },
          nodes: [
            {
              _uid: 'alex',
              type: 'person',
              attributes: { name: 'Alex' },
              _secureAttributes: { name: { iv: [1], salt: [2] } },
            },
            ...family.nodes,
          ],
          edges: family.edges,
        },
        stageMetadata: {
          1: {
            isNetworkCommitted: true,
            nodes: [{ id: 'you', isEgo: true }],
            edges: [],
          },
          2: { seen: true },
        },
      },
      {
        id: 'finished',
        protocolId: 'p1',
        participantId: 'participant-2',
        startTime: '2026-10-01 12:00:00',
        finishTime: '2026-10-01 13:00:00',
        currentStep: 3,
        isSynthetic: true,
        finishStageId: null,
        finishOutcome: null,
        network: {
          ego: { _uid: 'ego-2', attributes: {} },
          nodes: [],
          edges: [],
        },
        stageMetadata: {},
      },
    ],
  };
  // The same values, every object's keys listed backwards.
  const reversed = (value) =>
    Array.isArray(value)
      ? value.map(reversed)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .toReversed()
              .map((key) => [key, reversed(value[key])]),
          )
        : value;
  return { before, after: reversed(structuredClone(before)) };
};

test('a deployment the upgrade left alone satisfies every oracle', () => {
  const { before, after } = readings();
  assert.equal(KEPT_SCHEMA, 8);
  assert.deepEqual(protocolKeptProblems(before, after), []);
  assert.deepEqual(interviewKeptProblems(before, after), []);
  assert.deepEqual(familyKeptProblems(before, after), []);
});

test('a reading of a database without the finish columns is the same reading', () => {
  // The released image predates them: its reading holds them as null, and so
  // does the pending image's for interviews that recorded no finish stage.
  const { before, after } = readings();
  for (const interview of before.interviews) {
    delete interview.finishStageId;
    delete interview.finishOutcome;
  }
  assert.deepEqual(interviewKeptProblems(before, after), []);
});

test('empty readings fail every oracle rather than passing', () => {
  const empty = { protocols: [], interviews: [] };
  assert.deepEqual(protocolKeptProblems(empty, empty), [
    'the reading before the upgrade holds no protocols at all',
  ]);
  assert.deepEqual(interviewKeptProblems(empty, empty), [
    'the reading before the upgrade holds no interviews at all',
  ]);
  assert.deepEqual(familyKeptProblems(empty, empty), [
    'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
  ]);
});

test('a protocol the upgrade migrated, rewrote or dropped fails', () => {
  const { before, after } = readings();
  const migrated = structuredClone(after);
  migrated.protocols[0].schemaVersion = 9;
  assert.match(
    protocolKeptProblems(before, migrated).join('\n'),
    /stored as schema 8 and is now stored as schema 9/,
  );

  const rehashed = structuredClone(after);
  rehashed.protocols[0].hash = 'schema-9-hash';
  assert.match(
    protocolKeptProblems(before, rehashed).join('\n'),
    /"migration"'s hash changed in the upgrade/,
  );

  // What schema 9 made of an introduction panel: the stage loses it.
  const restaged = structuredClone(after);
  delete restaged.protocols[0].stages[2].introductionPanel;
  assert.match(
    protocolKeptProblems(before, restaged).join('\n'),
    /"migration"'s stages changed in the upgrade/,
  );

  const recoded = structuredClone(after);
  recoded.protocols[0].codebook.node.person.variables.name = { type: 'text' };
  assert.match(
    protocolKeptProblems(before, recoded).join('\n'),
    /"migration"'s codebook changed in the upgrade/,
  );

  assert.deepEqual(
    protocolKeptProblems(before, { protocols: [], interviews: [] }),
    ['protocol "migration" is no longer stored'],
  );
});

test('readings without a schema 8 protocol prove nothing about keeping one', () => {
  const { before, after } = readings();
  before.protocols[0].schemaVersion = 9;
  after.protocols[0].schemaVersion = 9;
  assert.deepEqual(protocolKeptProblems(before, after), [
    'the reading before the upgrade holds no schema 8 protocol, so keeping one went untested',
  ]);
});

test('an interview that moved, changed or gained an outcome in the upgrade fails', () => {
  const { before, after } = readings();
  const breaks = {
    // Moved as if an Information stage had been put in front of it.
    moved: [
      (a) => {
        a.interviews[0].currentStep = 3;
      },
      /interview parked was on step 2 and now resumes at step 3/,
    ],
    rekeyed: [
      (a) => {
        a.interviews[0].stageMetadata = {
          1: a.interviews[0].stageMetadata[1],
          3: { seen: true },
        };
      },
      /interview parked's stage record at step 2 was \{"seen":true\}, is now null/,
    ],
    answer: [
      (a) => {
        a.interviews[0].network.nodes[0].attributes.name = 'Alexandra';
      },
      /node alex \(person\)'s name was "Alex", is now "Alexandra"/,
    ],
    encrypted: [
      (a) => {
        delete a.interviews[0].network.nodes[0]._secureAttributes;
      },
      /node alex \(person\)'s _secureAttributes was/,
    ],
    ego: [
      (a) => {
        a.interviews[0].network.ego.attributes.name = '';
      },
      /the ego's name was "Mira", is now ""/,
    ],
    outcome: [
      (a) => {
        a.interviews[1].finishOutcome = 'completed';
        a.interviews[1].finishStageId = 'finish';
      },
      /interview finished was given an outcome \("completed" at "finish"\)/,
    ],
    finished: [
      (a) => {
        a.interviews[0].finishTime = '2026-10-20 12:00:00';
      },
      /interview parked's finishTime changed in the upgrade/,
    ],
    gone: [
      (a) => {
        a.interviews.pop();
      },
      /interview finished is no longer stored/,
    ],
    appeared: [
      (a) => {
        a.interviews.push({ ...a.interviews[1], id: 'new' });
      },
      /interview new appeared in the upgrade/,
    ],
  };
  for (const [name, [breakIt, expected]] of Object.entries(breaks)) {
    const broken = structuredClone(after);
    breakIt(broken);
    assert.match(
      interviewKeptProblems(before, broken).join('\n'),
      expected,
      name,
    );
  }
});

test('a family the upgrade rewrote fails, naming what changed', () => {
  const { before, after } = readings();
  const breaks = {
    // What the schema 9 migration did to a parent relationship.
    flag: [
      (a) => {
        const edge = a.interviews[0].network.edges[0];
        delete edge.attributes.isActive;
        edge.attributes.isGestationalCarrier = true;
      },
      /"family" pedigree: edge egg \(family_edge\)'s isActive was true, is now null/,
    ],
    // ...and to the pedigree's schema 8 stage record.
    record: [
      (a) => {
        a.interviews[0].stageMetadata[1] = { framing: 'gamete' };
      },
      /"family" pedigree's stage record was \{"isNetworkCommitted":true,"nodes":\[\{"id":"you","isEgo":true\}\],"edges":\[\]\} before the upgrade and is \{"framing":"gamete"\} after it/,
    ],
    person: [
      (a) => {
        a.interviews[0].network.nodes.pop();
      },
      /"family" pedigree: node robert \(family_member\) is gone/,
    ],
    added: [
      (a) => {
        a.interviews[0].network.nodes.push({
          _uid: 'grace',
          type: 'family_member',
          attributes: { fm_name: 'Grace' },
        });
      },
      /"family" pedigree: node grace \(family_member\) was added/,
    ],
    doubled: [
      (a) => {
        a.interviews[0].network.edges.push(a.interviews[0].network.edges[1]);
      },
      /"family" pedigree: edge partners is stored 2 times/,
    ],
  };
  for (const [name, [breakIt, expected]] of Object.entries(breaks)) {
    const broken = structuredClone(after);
    breakIt(broken);
    assert.match(familyKeptProblems(before, broken).join('\n'), expected, name);
    // The whole-interview oracle sees it too: the family is part of it.
    assert.notDeepEqual(interviewKeptProblems(before, broken), [], name);
  }
});

test('readings with no family in them prove nothing about a family', () => {
  const { before, after } = readings();
  for (const reading of [before, after]) {
    reading.interviews[0].network.nodes =
      reading.interviews[0].network.nodes.filter(
        (node) => node.type !== 'family_member',
      );
    reading.interviews[0].network.edges = [];
  }
  assert.deepEqual(familyKeptProblems(before, after), [
    'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
  ]);
});

const write = (dir, name, value) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, name),
    typeof value === 'string' ? value : `${JSON.stringify(value)}\n`,
  );
};

const graph = (hash) =>
  `<graphml><graph nc:protocolName="migration" nc:codebookHash="${hash}" nc:sessionExportTime="2026-10-01"></graph></graphml>\n`;

// The export diff holds every export file to being identical. The only thing
// it reconciles is the interview API naming each interview's finish stage and
// outcome as null — never a value there, and nothing in an export archive.
test('the export diff reconciles nothing but finish fields added as null', () => {
  const work = mkdtempSync(join(tmpdir(), 'fresco-diff-identity-'));
  const interview = { id: 'parked', protocolId: 'p1', currentStep: 2 };
  const ego =
    'networkCanvasEgoUUID,networkCanvasSessionID,sessionExported\nego,parked,2026-10-01\n';
  write(join(work, 'baseline'), 'api-interview-parked.json', {
    data: interview,
  });
  write(join(work, 'baseline'), 'api-interview.json', { data: [interview] });
  write(join(work, 'baseline'), 'ego.csv', ego);
  write(join(work, 'baseline'), 'graph.graphml', graph('a'));
  let runs = 0;
  const diff = (files, extra = []) => {
    runs += 1;
    const dir = join(work, `current-${runs}`);
    for (const [name, value] of Object.entries(files)) write(dir, name, value);
    const out = join(work, `summary-${runs}.json`);
    execFileSync(
      process.execPath,
      [
        join(scripts, 'diff-exports.mjs'),
        join(work, 'baseline'),
        dir,
        '--work',
        join(work, `work-${runs}`),
        '--out',
        out,
        ...extra,
      ],
      { stdio: 'pipe' },
    );
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const nulls = { ...interview, finishStageId: null, finishOutcome: null };
  const unchanged = {
    'ego.csv': ego.replace('2026-10-01', '2026-10-20'),
    'graph.graphml': graph('a').replace('2026-10-01', '2026-10-20'),
  };
  const same = diff({
    'api-interview-parked.json': { data: nulls },
    'api-interview.json': { data: [nulls] },
    ...unchanged,
  });
  assert.deepEqual(same.changed, []);
  assert.deepEqual(same.identical.toSorted(), [
    'api-interview-parked.json',
    'api-interview.json',
    'ego.csv',
    'graph.graphml',
  ]);
  assert.match(JSON.stringify(same.reconciled), /finishOutcome added as null/);

  // An outcome nothing recorded, a step that moved, a column the export
  // gained and a codebook the upgrade rewrote are all differences.
  const changed = diff({
    'api-interview-parked.json': {
      data: { ...nulls, finishOutcome: 'completed' },
    },
    'api-interview.json': { data: [{ ...nulls, currentStep: 3 }] },
    'ego.csv': ego
      .replace(
        'sessionExported\n',
        'sessionExported,networkCanvasFinishOutcome\n',
      )
      .replace('2026-10-01\n', '2026-10-20,\n'),
    'graph.graphml': graph('b'),
  });
  assert.deepEqual(changed.changed.map((c) => c.file).toSorted(), [
    'api-interview-parked.json',
    'api-interview.json',
    'ego.csv',
    'graph.graphml',
  ]);

  // The readings the schema 9 migration's reconciliation once took are no
  // longer an option: handing them over is a usage error, not a quiet no-op.
  assert.throws(() =>
    diff(unchanged, ['--migration', join(work, 'migration')]),
  );
});
