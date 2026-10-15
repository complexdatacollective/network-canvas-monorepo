// Offline tests for the release test's lane contracts.
//
// The script-driven lanes drive a browser, but what they CONCLUDE lives in
// pure modules — the analytics payload contract, the localization
// comparison, the export reader, what a schema 9 export has to record, and
// what the schema 8 to 9 upgrade has to do to stored protocols and
// interviews — and those are exercised here on synthetic
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
  encryptedValueProblems,
  finishOutcomeProblems,
  nodeAnswerProblems,
  finishOutcomesByFormat,
  splitCsvRow,
} = await import(join(scripts, 'schema9-export-contract.mjs'));

const {
  MIGRATED_SCHEMA,
  expectedStep,
  interviewMigrationProblems,
  introductionPanelProblems,
  protocolMigrationProblems,
  remapStageMetadata,
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
    'no exported file has a record for node carla',
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
    { name: 'a.graphml', text: '<data key="name">Linda</data>' },
  ];
  assert.deepEqual(encryptedValueProblems(files, 'Linda', 'linda'), [
    'a.graphml holds "Linda" in plain text',
  ]);
});

test('an export that dropped the encrypted attribute altogether proves nothing', () => {
  const files = [{ name: 'a_attributeList_person.csv', text: 'id\r\n1' }];
  const problems = encryptedValueProblems(files, 'Linda', 'linda');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no exported file has a record for node linda/);
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

// ---------------------------------------------------------------------------
// What the schema 8 to 9 upgrade does to a deployment's data
// ---------------------------------------------------------------------------

// Two readings of one deployment, as migration-lane.mjs takes them either
// side of the swap: a schema 8 protocol with an Ego Form and an Alter Form
// behind introduction panels, then what schema 9 makes of it.
const SKIP = { action: 'SKIP', filter: { join: 'AND', rules: [] } };
const readings = () => {
  const before = {
    protocols: [
      {
        id: 'p1',
        name: 'migration',
        schemaVersion: 8,
        stages: [
          { id: 'welcome', type: 'Information' },
          {
            id: 'about-you',
            type: 'EgoForm',
            introductionPanel: {
              title: 'About {you}',
              text: 'First, a little about you.',
            },
            form: { fields: [] },
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
        currentStep: 2,
        finishTime: null,
        finishStageId: null,
        finishOutcome: null,
        networkHash: 'h-parked',
        stageMetadataKeys: ['2'],
      },
      {
        id: 'finished',
        protocolId: 'p1',
        currentStep: 3,
        finishTime: '2026-10-01 12:00:00',
        finishStageId: null,
        finishOutcome: null,
        networkHash: 'h-finished',
        stageMetadataKeys: [],
      },
    ],
  };
  const introduction = (id, title, text, skipLogic) => ({
    id: `${id}-introduction`,
    type: 'Information',
    label: { en: title },
    title: { en: title },
    items: [{ id: 'introduction-text', type: 'text', content: { en: text } }],
    ...(skipLogic ? { skipLogic } : {}),
  });
  const after = {
    protocols: [
      {
        id: 'p1',
        name: 'migration',
        schemaVersion: MIGRATED_SCHEMA,
        stages: [
          { id: 'welcome', type: 'Information' },
          introduction(
            'about-you',
            "About '{'you'}'",
            'First, a little about you.',
          ),
          {
            id: 'about-you',
            type: 'EgoForm',
            form: { title: { en: "About '{'you'}'" }, fields: [] },
          },
          introduction(
            'each-person',
            'About each person',
            'Now each person.',
            SKIP,
          ),
          {
            id: 'each-person',
            type: 'AlterForm',
            skipLogic: SKIP,
            form: { fields: [] },
          },
          { id: 'finish', type: 'FinishSession' },
        ],
      },
    ],
    interviews: [
      { ...before.interviews[0], currentStep: 4, stageMetadataKeys: ['4'] },
      { ...before.interviews[1], currentStep: 5 },
    ],
  };
  return { before, after };
};

test('a step follows its stage by id, and the old finish screen becomes the finish stage', () => {
  const { before, after } = readings();
  const [b, a] = [before.protocols[0], after.protocols[0]];
  assert.equal(expectedStep(b, a, 0), 0);
  assert.equal(expectedStep(b, a, 1), 2);
  assert.equal(expectedStep(b, a, 2), 4);
  assert.equal(expectedStep(b, a, 3), 5);
  assert.equal(expectedStep(b, a, 4), null);
  assert.equal(expectedStep(b, a, -1), null);
  assert.equal(expectedStep(b, a, 1.5), null);
  const noFinish = { stages: a.stages.slice(0, -1) };
  assert.equal(expectedStep(b, noFinish, 3), null);
});

test('stage records are re-keyed onto the stages they belong to', () => {
  const { before, after } = readings();
  const [b, a] = [before.protocols[0], after.protocols[0]];
  assert.deepEqual(remapStageMetadata({ 1: 'x', 2: 'y' }, b, a), {
    2: 'x',
    4: 'y',
  });
  assert.equal(remapStageMetadata({ 9: 'x' }, b, a), null);
  assert.equal(remapStageMetadata({ '01': 'x' }, b, a), null);
});

test('a correctly migrated deployment satisfies every migration oracle', () => {
  const { before, after } = readings();
  assert.deepEqual(protocolMigrationProblems(before, after), []);
  assert.deepEqual(introductionPanelProblems(before, after), []);
  assert.deepEqual(interviewMigrationProblems(before, after), []);
});

test('empty readings fail every migration oracle rather than passing', () => {
  const empty = { protocols: [], interviews: [] };
  assert.equal(protocolMigrationProblems(empty, empty).length, 1);
  assert.equal(introductionPanelProblems(empty, empty).length, 1);
  assert.equal(interviewMigrationProblems(empty, empty).length, 1);
});

test('a protocol left behind, still on schema 8 or without a finish stage fails', () => {
  const { before, after } = readings();
  const stale = structuredClone(after);
  stale.protocols[0].schemaVersion = 8;
  assert.match(
    protocolMigrationProblems(before, stale).join('\n'),
    /stored as schema 8, not 9/,
  );
  const unfinished = structuredClone(after);
  unfinished.protocols[0].stages.pop();
  assert.match(
    protocolMigrationProblems(before, unfinished).join('\n'),
    /does not end at a finish stage \(its last stage is AlterForm\)/,
  );
  assert.match(
    protocolMigrationProblems(before, { protocols: [], interviews: [] }).join(
      '\n',
    ),
    /no longer stored/,
  );
});

test('an introduction panel that was kept, dropped or copied wrongly fails', () => {
  const { before, after } = readings();
  const cases = [
    [
      (a) => {
        a.protocols[0].stages[4].introductionPanel = { title: 'x' };
      },
      /still has an introduction panel/,
    ],
    [
      (a) => {
        a.protocols[0].stages.splice(3, 1);
      },
      /"each-person" is not preceded by its Information stage/,
    ],
    [
      (a) => {
        a.protocols[0].stages[3].items[0].content = { en: 'Now.' };
      },
      /does not show the panel's text/,
    ],
    [
      (a) => {
        delete a.protocols[0].stages[3].skipLogic;
      },
      /does not take the stage's skip logic/,
    ],
    [
      (a) => {
        // The title copied without escaping: "{you}" would be read as an
        // argument rather than shown.
        a.protocols[0].stages[2].form.title = { en: 'About {you}' };
      },
      /the form is titled/,
    ],
    [
      (a) => {
        a.protocols[0].stages[1].title = { en: 'Introduction' };
      },
      /its Information stage is titled/,
    ],
  ];
  for (const [breakIt, problem] of cases) {
    const broken = structuredClone(after);
    breakIt(broken);
    assert.match(introductionPanelProblems(before, broken).join('\n'), problem);
  }
});

test('an interview that moved, changed or gained an outcome in the upgrade fails', () => {
  const { before, after } = readings();
  const cases = [
    // Resumed on the Information stage the migration put in front of it.
    [
      (a) => {
        a.interviews[0].currentStep = 3;
      },
      /resumes at step 3, but the stage it was on \(step 2\) is now step 4/,
    ],
    // Left on the old finish screen's index rather than the finish stage.
    [
      (a) => {
        a.interviews[1].currentStep = 3;
      },
      /resumes at step 3/,
    ],
    [
      (a) => {
        a.interviews[0].networkHash = 'other';
      },
      /answers changed in the upgrade/,
    ],
    [
      (a) => {
        a.interviews[0].stageMetadataKeys = ['2'];
      },
      /stage records are kept under \["2"\], not \["4"\]/,
    ],
    [
      (a) => {
        a.interviews[1].finishTime = null;
      },
      /finish time changed/,
    ],
    [
      (a) => {
        a.interviews[1].finishOutcome = 'completed';
        a.interviews[1].finishStageId = 'finish';
      },
      /was given an outcome \("completed" at "finish"\)/,
    ],
    [
      (a) => {
        a.interviews.pop();
      },
      /interview finished is no longer stored/,
    ],
    [
      (a) => {
        a.interviews[0].protocolId = 'p2';
      },
      /moved to another protocol/,
    ],
  ];
  for (const [breakIt, problem] of cases) {
    const broken = structuredClone(after);
    breakIt(broken);
    assert.match(
      interviewMigrationProblems(before, broken).join('\n'),
      problem,
    );
  }
});

test('the panel oracle names what the migration itself writes', () => {
  // Bound to the package: the ids and the escape the oracle expects are the
  // ones the migration uses, so a rename there fails here rather than on a
  // release run.
  const migration = readFileSync(
    join(repoRoot, 'packages/protocol-validation/src/schemas/9/migration.ts'),
    'utf8',
  );
  assert.match(migration, /escapeMessageText/);
  assert.match(migration, /-introduction/);
  assert.match(migration, /'introduction-text'/);
});

// The export diff reconciles an interview's step and stage records only when
// they moved exactly as the stage they point at did, and only when it is
// given the readings that say how the stages moved.
test('the export diff reconciles a step only as far as its stage moved', () => {
  const { before, after } = readings();
  const work = mkdtempSync(join(tmpdir(), 'fresco-diff-migration-'));
  const write = (dir, name, value) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `${JSON.stringify(value)}\n`);
  };
  write(join(work, 'migration'), 'seeded.json', { interviewId: 'parked' });
  write(join(work, 'migration'), 'before.json', before);
  write(join(work, 'migration'), 'after.json', after);
  // A lane that stood down leaves only its seeded.json saying so.
  write(join(work, 'not-applicable'), 'seeded.json', {
    interviewId: 'parked',
    notApplicable: 'the released image already runs schema 9',
  });
  const interview = (currentStep, stageMetadata) => ({
    data: { id: 'parked', protocolId: 'p1', currentStep, stageMetadata },
  });
  write(
    join(work, 'baseline'),
    'api-interview-parked.json',
    interview(2, { 2: { seen: true } }),
  );
  let runs = 0;
  const diff = (current, readingsDir) => {
    runs += 1;
    const dir = join(work, `current-${runs}`);
    write(dir, 'api-interview-parked.json', current);
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
        ...(readingsDir ? ['--migration', join(work, readingsDir)] : []),
      ],
      { stdio: 'pipe' },
    );
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const moved = interview(4, { 4: { seen: true } });
  const reconciled = diff(moved, 'migration');
  assert.deepEqual(reconciled.identical, ['api-interview-parked.json']);
  assert.match(JSON.stringify(reconciled.reconciled), /currentStep moved/);
  assert.match(JSON.stringify(reconciled.reconciled), /stageMetadata re-keyed/);
  // Without the readings the same move is a difference.
  assert.deepEqual(
    diff(moved, false).changed.map((c) => c.file),
    ['api-interview-parked.json'],
  );
  // Nor with a lane that stood down: it has no readings to reconcile with,
  // and the diff still runs rather than failing on the missing files.
  assert.deepEqual(
    diff(moved, 'not-applicable').changed.map((c) => c.file),
    ['api-interview-parked.json'],
  );
  // Resumed on the inserted Information stage: not where its stage went.
  assert.deepEqual(
    diff(interview(3, { 4: { seen: true } }), 'migration').changed.map(
      (c) => c.file,
    ),
    ['api-interview-parked.json'],
  );
});
