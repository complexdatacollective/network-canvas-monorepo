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

import { migrateFamilyPedigreeSessionRecords } from '../../packages/protocol-validation/src/schemas/9/family-pedigree-session-migration.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scripts = join(repoRoot, 'apps/fresco/release-test/scripts');
const require = createRequire(join(repoRoot, 'package.json'));

const {
  APP_DEFECT_KINDS,
  UPGRADE_ERROR_NAMES,
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
  MIGRATED_SCHEMA,
  expectedStep,
  interviewMigrationProblems,
  introductionPanelProblems,
  PEDIGREE_BUILD_PROMPT_ID,
  pedigreeMigrationProblems,
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

/** The exception posthog-js sends for a migration that returned garbage. */
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
      webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
      upgradeException(),
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
    'analytics-upgrade-failure-reported-twice',
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

test('a failed upgrade reported only as an exception fails the run', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', { reason: 'notArchive' }),
          webEvent('$exception'),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  const ids = failing(run);
  assert.ok(ids.includes('analytics-upgrade-failure-reported-twice'));
  assert.ok(ids.includes('analytics-damaged-file-not-an-error'));
});

test('a failed upgrade reported only as a refusal fails the run', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', { reason: 'notArchive' }),
          webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  const ids = failing(run);
  assert.ok(ids.includes('analytics-upgrade-failure-reported-twice'));
  assert.ok(!ids.includes('analytics-damaged-file-not-an-error'));
});

test('a failed upgrade does not stand in for a damaged file', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
          upgradeException(),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  const ids = failing(run);
  assert.ok(ids.includes('analytics-damaged-file-not-an-error'));
  assert.ok(!ids.includes('analytics-upgrade-failure-reported-twice'));
});

test('an exception for a damaged file cannot stand in for a failed upgrade’s', () => {
  const run = cleanRun();
  run.records = run.records.map((record) =>
    record.path === '/e/'
      ? request('/e/', [
          webEvent('$pageview'),
          webEvent('ProtocolImportFailed', { reason: 'notArchive' }),
          webEvent('ProtocolImportFailed', { reason: 'upgradeStepFailed' }),
          webEvent('$exception', {
            $exception_list: [{ type: 'MalformedNetcanvasError' }],
          }),
          interviewEvent('stage_entered'),
          interviewEvent('node_added', { node_id: 'pseudonym-1' }),
        ])
      : record,
  );
  const ids = failing(run);
  assert.ok(ids.includes('analytics-upgrade-failure-reported-twice'));
  assert.ok(ids.includes('analytics-damaged-file-not-an-error'));
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

test('the failed-upgrade error names are the package’s own', () => {
  const errors = readFileSync(
    join(repoRoot, 'packages/protocol-validation/src/migration/errors.ts'),
    'utf8',
  );
  const kinds = readFileSync(
    join(
      repoRoot,
      'packages/protocol-validation/src/utils/protocolFileErrorKind.ts',
    ),
    'utf8',
  );
  for (const name of UPGRADE_ERROR_NAMES)
    assert.ok(
      errors.includes(`this.name = '${name}';`),
      `${name} is not an error name protocol-validation assigns`,
    );
  // The classes classified as a failed upgrade, read from the classifier.
  const classified = [
    ...kinds.matchAll(
      /instanceof (\w+)\)\s*(?:\n\s*)?return 'upgrade(?:StepFailed|Failed)'/g,
    ),
  ].map((match) => match[1]);
  assert.ok(classified.length > 0, 'failed to read the classifier');
  for (const name of classified)
    assert.ok(
      UPGRADE_ERROR_NAMES.includes(name),
      `${name} is classified as a failed upgrade but not matched in exceptions`,
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
        network: {
          ego: { _uid: 'ego', attributes: { name: 'Mira' } },
          nodes: [
            { _uid: 'alex', type: 'person', attributes: { name: 'Alex' } },
          ],
          edges: [],
        },
        stageMetadata: { 2: { seen: true } },
      },
      {
        id: 'finished',
        protocolId: 'p1',
        currentStep: 3,
        finishTime: '2026-10-01 12:00:00',
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
      {
        ...structuredClone(before.interviews[0]),
        currentStep: 4,
        stageMetadata: { 4: { seen: true } },
      },
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
        a.interviews[0].network.nodes[0].attributes.name = 'Alexa';
      },
      /answers changed in the upgrade: node alex \(person\)'s name was "Alex", is now "Alexa"/,
    ],
    [
      (a) => {
        a.interviews[0].stageMetadata = { 2: { seen: true } };
      },
      /stage records are kept under \["2"\], not \["4"\]/,
    ],
    [
      (a) => {
        // Kept under the right step, its contents changed.
        a.interviews[0].stageMetadata = { 4: { seen: false } };
      },
      /stage record at step 4 is \{"seen":false\}, not \{"seen":true\}/,
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

test('a rule lost from either stage, or never there to carry, fails', () => {
  const { before, after } = readings();
  const rewritten = structuredClone(after);
  rewritten.protocols[0].stages[4].skipLogic = {
    ...SKIP,
    action: 'SHOW',
  };
  assert.match(
    introductionPanelProblems(before, rewritten).join('\n'),
    /"each-person": the stage's skip logic is now .*SHOW/,
  );
  // Both stages lost the rule together: they agree, and are both wrong.
  const bothLost = structuredClone(after);
  delete bothLost.protocols[0].stages[3].skipLogic;
  delete bothLost.protocols[0].stages[4].skipLogic;
  const problems = introductionPanelProblems(before, bothLost).join('\n');
  assert.match(problems, /the stage's skip logic is now null/);
  assert.match(
    problems,
    /its Information stage does not take the stage's skip logic/,
  );
  // A deployment whose panels belong to no stage with a rule proves nothing
  // about carrying one, however well every panel else was migrated.
  const ruleless = structuredClone(before);
  delete ruleless.protocols[0].stages[2].skipLogic;
  const untested = structuredClone(after);
  delete untested.protocols[0].stages[3].skipLogic;
  delete untested.protocols[0].stages[4].skipLogic;
  assert.deepEqual(introductionPanelProblems(ruleless, untested), [
    'no introduction panel in the reading before the upgrade belongs to a stage with skip logic, so carrying a rule onto its Information stage went untested',
  ]);
});

test('an Information stage the stages menu names wrongly fails', () => {
  const { before, after } = readings();
  const broken = structuredClone(after);
  const information = broken.protocols[0].stages.find(
    (stage) => stage.id === 'each-person-introduction',
  );
  information.label = { en: 'Stage 4' };
  assert.match(
    introductionPanelProblems(before, broken).join('\n'),
    /its Information stage is labelled \{"en":"Stage 4"\} in the stages menu/,
  );
});

test('a rule the upgrade gives a stage that had none fails', () => {
  const { before, after } = readings();
  // The upgrade wrongly puts the same rule on the ruleless Ego Form and on
  // its Information stage: the two agree, and both skip what was shown.
  const gained = structuredClone(after);
  for (const stage of gained.protocols[0].stages)
    if (stage.id === 'about-you' || stage.id === 'about-you-introduction')
      stage.skipLogic = SKIP;
  const problems = introductionPanelProblems(before, gained).join('\n');
  assert.match(
    problems,
    /"about-you": the stage's skip logic is now .*, not none, as it had before the upgrade/,
  );
});

// A schema 8 Family Pedigree family either side of the upgrade, as
// migration-lane.mjs reads it: the participant, Linda (egg, carried the
// pregnancy), Robert (sperm, no sex recorded) and their partnership, with the
// schema 8 stage record that lists them. The upgrade drops the current-partner
// flag schema 8 set on parent relationships, records the carrier flag as
// false where none was recorded, works out Robert's sex from his gamete, and
// removes the record, since the stage fixed its framing.
const pedigreeReadings = () => {
  const pedigree = {
    id: 'family',
    type: 'FamilyPedigree',
    nodeConfig: {
      type: 'fm',
      nodeLabelVariable: 'fm_name',
      egoVariable: 'is_ego',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: {
      type: 'fe',
      relationshipTypeVariable: 'kind',
      isActiveVariable: 'active',
      isGestationalCarrierVariable: 'carrier',
      gameteRoleVariable: 'gamete',
    },
  };
  const person = (id, attributes) => ({ _uid: id, type: 'fm', attributes });
  const edge = (id, from, to, attributes) => ({
    _uid: id,
    type: 'fe',
    from,
    to,
    attributes,
  });
  const interview = (network, stageMetadata, currentStep) => ({
    id: 'family-interview',
    protocolId: 'p2',
    currentStep,
    finishTime: null,
    finishStageId: null,
    finishOutcome: null,
    network,
    stageMetadata,
  });
  const network = {
    ego: { _uid: 'ego-node', attributes: { ego_name: 'Mira' } },
    nodes: [
      { _uid: 'alex', type: 'person', attributes: { name: 'Alex' } },
      person('you', { is_ego: true, sex: ['female'] }),
      person('linda', { is_ego: false, fm_name: 'Linda', sex: ['female'] }),
      person('robert', { is_ego: false, fm_name: 'Robert' }),
    ],
    edges: [
      edge('egg', 'linda', 'you', {
        kind: ['biological'],
        active: true,
        carrier: true,
        gamete: ['egg'],
      }),
      edge('sperm', 'robert', 'you', {
        kind: ['biological'],
        active: true,
        gamete: ['sperm'],
      }),
      edge('partners', 'linda', 'robert', { kind: ['partner'], active: true }),
    ],
  };
  const before = {
    protocols: [
      {
        id: 'p2',
        name: 'pedigree',
        schemaVersion: 8,
        stages: [
          { id: 'people', type: 'NameGenerator' },
          pedigree,
          { id: 'next', type: 'Information' },
        ],
      },
    ],
    interviews: [
      interview(
        network,
        {
          1: {
            isNetworkCommitted: true,
            edgeIdVersion: 1,
            nodes: ['you', 'linda', 'robert'].map((id) => ({ id })),
            edges: ['egg', 'sperm', 'partners'].map((id) => ({ id })),
          },
        },
        2,
      ),
    ],
  };
  const migrated = structuredClone(network);
  migrated.nodes[3].attributes.sex = ['male'];
  delete migrated.edges[0].attributes.active;
  delete migrated.edges[1].attributes.active;
  migrated.edges[1].attributes.carrier = false;
  const after = {
    protocols: [
      {
        id: 'p2',
        name: 'pedigree',
        schemaVersion: MIGRATED_SCHEMA,
        stages: [
          { id: 'people', type: 'NameGenerator' },
          { id: 'family', type: 'FamilyPedigree' },
          { id: 'next', type: 'Information' },
          { id: 'finish', type: 'FinishSession' },
        ],
      },
    ],
    interviews: [interview(migrated, {}, 2)],
  };
  return { before, after };
};

test('a family carried across the upgrade as the redesigned stage reads it passes', () => {
  const { before, after } = pedigreeReadings();
  assert.deepEqual(pedigreeMigrationProblems(before, after), []);
  // The pedigree's own changes are not "answers changed" elsewhere.
  assert.deepEqual(interviewMigrationProblems(before, after), []);
  // A participant's framing choice is the one thing the record keeps.
  before.interviews[0].stageMetadata[1].selectedFraming = 'gendered';
  assert.match(
    pedigreeMigrationProblems(before, after).join('\n'),
    /stage record is null after the upgrade, not \{"framing":"gendered"\}/,
  );
  after.interviews[0].stageMetadata = { 1: { framing: 'gendered' } };
  assert.deepEqual(pedigreeMigrationProblems(before, after), []);
});

test('each loss of a family in the upgrade is named', () => {
  const { before, after } = pedigreeReadings();
  const who = 'interview family-interview\'s "family" pedigree';
  const cases = [
    [
      (a) => {
        a.interviews[0].network.nodes.splice(2, 1);
      },
      `${who} lost "Linda" (linda)`,
    ],
    [
      (a) => {
        a.interviews[0].network.nodes[2].attributes.fm_name = 'Lynda';
      },
      `${who}: "Linda" (linda)'s fm_name was "Linda", is now "Lynda"`,
    ],
    [
      (a) => {
        // A sex at birth recorded before the upgrade is never replaced.
        a.interviews[0].network.nodes[2].attributes.sex = ['male'];
      },
      `${who}: "Linda" (linda)'s sex was ["female"], is now ["male"]`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges[0].attributes.carrier = false;
      },
      `${who}: the biological relationship from "Linda" (linda) to person you had carrier=true, now false`,
    ],
    [
      (a) => {
        // Only a parent relationship sheds the flag; partners keep it.
        delete a.interviews[0].network.edges[2].attributes.active;
      },
      `${who}: the partner relationship from "Linda" (linda) to "Robert" (robert) had active=true, now null`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges[0].attributes.gamete = ['sperm'];
      },
      `${who}: the biological relationship from "Linda" (linda) to person you had gamete=["egg"], now ["sperm"]`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges[1].to = 'linda';
      },
      `${who}: the biological relationship from "Robert" (robert) to person you now joins robert to linda`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges.splice(1, 1);
      },
      `${who} lost the biological relationship from "Robert" (robert) to person you`,
    ],
    [
      (a) => {
        a.interviews[0].network.nodes.push({
          _uid: 'stranger',
          type: 'fm',
          attributes: {},
        });
      },
      `${who} gained a person nobody recorded (stranger)`,
    ],
    [
      (a) => {
        a.interviews[0].stageMetadata = {
          1: { isNetworkCommitted: true, nodes: [], edges: [] },
        };
      },
      /stage record is .* after the upgrade, not null \(still in the schema 8 shape\)/,
    ],
  ];
  for (const [breakIt, problem] of cases) {
    const broken = structuredClone(after);
    breakIt(broken);
    const problems = pedigreeMigrationProblems(before, broken);
    if (typeof problem === 'string')
      assert.ok(
        problems.includes(problem),
        `${problem}\n not in\n${problems.join('\n')}`,
      );
    else assert.match(problems.join('\n'), problem);
  }
});

test('a sex at birth the recorded gamete does not settle fails', () => {
  const { before, after } = pedigreeReadings();
  const who = 'interview family-interview\'s "family" pedigree';
  // Robert gave the sperm, so the upgrade records him as male, and nothing
  // else.
  for (const sex of [['female'], ['intersex'], null]) {
    const broken = structuredClone(after);
    broken.interviews[0].network.nodes[3].attributes.sex = sex;
    assert.ok(
      pedigreeMigrationProblems(before, broken).includes(
        `${who}: "Robert" (robert)'s sex was null, is now ${JSON.stringify(sex)} (expected ["male"])`,
      ),
      JSON.stringify(sex),
    );
  }
  // Someone no gamete speaks for keeps no sex at birth.
  const settled = pedigreeReadings();
  delete settled.before.interviews[0].network.edges[1].attributes.gamete;
  delete settled.after.interviews[0].network.edges[1].attributes.gamete;
  assert.ok(
    pedigreeMigrationProblems(settled.before, settled.after).includes(
      `${who}: "Robert" (robert)'s sex was null, is now ["male"]`,
    ),
  );
  settled.after.interviews[0].network.nodes[3].attributes.sex = undefined;
  assert.deepEqual(
    pedigreeMigrationProblems(settled.before, settled.after),
    [],
  );
});

// The schema 8 path where a finalized pedigree reached only its stage record:
// Robert and his relationships are in the record and not in the network.
const recordOnlyReadings = () => {
  const { before, after } = pedigreeReadings();
  const network = before.interviews[0].network;
  network.nodes.splice(3, 1);
  network.edges.splice(1, 2);
  before.interviews[0].stageMetadata[1] = {
    isNetworkCommitted: true,
    edgeIdVersion: 1,
    nodes: [
      // The record's own participant stands for the one in the network.
      { id: 'record-you', label: 'You', isEgo: true },
      { id: 'linda', label: 'Linda', isEgo: false },
      { id: 'robert', label: ' Robert ', isEgo: false },
    ],
    edges: [
      {
        id: 'sperm',
        from: 'robert',
        to: 'record-you',
        attributes: {
          kind: ['biological'],
          active: true,
          gamete: ['sperm'],
          note: null,
        },
      },
      {
        id: 'partners',
        from: 'linda',
        to: 'robert',
        attributes: { kind: ['partner'], active: true },
      },
      // Already in the network under the interface's own id.
      {
        id: 'old-egg',
        from: 'linda',
        to: 'record-you',
        attributes: { kind: ['biological'] },
      },
    ],
  };
  // What the upgrade writes for Robert: his label as his name, no participant
  // flag, and the sex his gamete settles.
  after.interviews[0].network.nodes[3].attributes = {
    fm_name: 'Robert',
    sex: ['male'],
  };
  after.interviews[0].network.nodes[3].stageId = 'family';
  after.interviews[0].network.nodes[3].promptIDs = ['pedigree'];
  return { before, after };
};

test('a family restored from its stage record passes only as it was recorded', () => {
  const { before, after } = recordOnlyReadings();
  assert.deepEqual(pedigreeMigrationProblems(before, after), []);
  const who = 'interview family-interview\'s "family" pedigree';
  const cases = [
    [
      (a) => {
        a.interviews[0].network.nodes[3].attributes.fm_name = 'Bob';
      },
      `${who}: "Robert" (robert), restored from its stage record, has fm_name="Bob", not "Robert"`,
    ],
    [
      (a) => {
        a.interviews[0].network.nodes[3].attributes.is_ego = true;
      },
      `${who}: "Robert" (robert), restored from its stage record, has is_ego=true, not null`,
    ],
    [
      (a) => {
        a.interviews[0].network.nodes[3].attributes.sex = ['female'];
      },
      `${who}: "Robert" (robert), restored from its stage record, has sex=["female"], not ["male"]`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges[1].to = 'linda';
      },
      `${who}: the biological relationship from "Robert" (robert) to person you, restored from its stage record, now joins robert to linda`,
    ],
    [
      (a) => {
        delete a.interviews[0].network.edges[1].attributes.gamete;
      },
      `${who}: the biological relationship from "Robert" (robert) to person you, restored from its stage record, had gamete=["sperm"], now null`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges[1].attributes.active = true;
      },
      `${who}: the biological relationship from "Robert" (robert) to person you, restored from its stage record, had active=true, now true (expected null)`,
    ],
    [
      (a) => {
        a.interviews[0].network.nodes.splice(3, 1);
      },
      `${who} did not restore "Robert" (robert), whom only its stage record held`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges.splice(2, 1);
      },
      `${who} did not restore the partner relationship from "Linda" (linda) to "Robert" (robert), restored from its stage record`,
    ],
    [
      (a) => {
        // A second participant, or a second copy of a relationship the
        // network already held, is someone nobody recorded.
        a.interviews[0].network.nodes.push({
          _uid: 'record-you',
          type: 'fm',
          attributes: { is_ego: true },
        });
      },
      `${who} gained a person nobody recorded (record-you)`,
    ],
    [
      (a) => {
        a.interviews[0].network.edges.push({
          _uid: 'old-egg',
          type: 'fe',
          from: 'linda',
          to: 'you',
          attributes: { kind: ['biological'] },
        });
      },
      `${who} gained a relationship nobody recorded (old-egg)`,
    ],
  ];
  for (const [breakIt, problem] of cases) {
    const broken = structuredClone(after);
    breakIt(broken);
    const problems = pedigreeMigrationProblems(before, broken);
    assert.ok(
      problems.includes(problem),
      `${problem}\n not in\n${problems.join('\n')}`,
    );
  }
  // A name the protocol encrypts is one only the interview can write.
  after.protocols[0].codebook = {
    node: { fm: { variables: { fm_name: { encrypted: true } } } },
  };
  before.protocols[0].codebook = after.protocols[0].codebook;
  assert.ok(
    pedigreeMigrationProblems(before, after).includes(
      `${who}: person robert, restored from its stage record, has fm_name="Robert", not null`,
    ),
  );
});

test('a participant\'s "no children" answer is recorded where the redesigned stage reads it', () => {
  const { before, after } = pedigreeReadings();
  before.interviews[0].stageMetadata[1].noChildrenAffirmed = true;
  after.protocols[0].stages[1].completeness = {
    relativesNotRecordedAttribute: 'not_recorded',
  };
  const who = 'interview family-interview\'s "family" pedigree';
  assert.ok(
    pedigreeMigrationProblems(before, after).includes(
      `${who}: person you's not_recorded was null, is now null (expected ["noChildren"])`,
    ),
  );
  after.interviews[0].network.nodes[1].attributes.not_recorded = ['noChildren'];
  assert.deepEqual(pedigreeMigrationProblems(before, after), []);
});

test("the pedigree oracle accepts what the package's own session migration writes", () => {
  // Bound to the package, so the oracle and the migration cannot drift apart
  // unnoticed: each family above, run through the migration itself, passes.
  const schema9Stage = {
    id: 'family',
    type: 'FamilyPedigree',
    subject: { entity: 'node', type: 'fm' },
    nodeConfiguration: {
      nameAttribute: 'fm_name',
      egoAttribute: 'is_ego',
      sexAssignedAtBirthAttribute: 'sex',
    },
    edgeConfiguration: {
      type: 'fe',
      kindAttribute: 'kind',
      gestationalCarrierAttribute: 'carrier',
      currentPartnerAttribute: 'active',
    },
    completeness: { relativesNotRecordedAttribute: 'not_recorded' },
  };
  const variants = [
    pedigreeReadings(),
    recordOnlyReadings(),
    (() => {
      const childless = recordOnlyReadings();
      childless.before.interviews[0].stageMetadata[1].noChildrenAffirmed = true;
      return childless;
    })(),
  ];
  for (const { before, after } of variants) {
    after.protocols[0].stages[1] = schema9Stage;
    const session = structuredClone({
      network: before.interviews[0].network,
      stageMetadata: before.interviews[0].stageMetadata,
    });
    migrateFamilyPedigreeSessionRecords(
      session,
      after.protocols[0],
      before.protocols[0],
    );
    after.interviews[0].network = session.network;
    after.interviews[0].stageMetadata = session.stageMetadata;
    assert.deepEqual(pedigreeMigrationProblems(before, after), []);
  }
});

test('fields beyond the attributes are held to being unchanged too', () => {
  const { before, after } = pedigreeReadings();
  before.interviews[0].network.nodes[0]._secureAttributes = {
    name: { iv: 'a', secureValue: 'b' },
  };
  before.interviews[0].network.nodes[2].promptIDs = ['build'];
  after.interviews[0].network.nodes[0]._secureAttributes = {
    name: { iv: 'a', secureValue: 'b' },
  };
  after.interviews[0].network.nodes[2].promptIDs = ['build'];
  assert.deepEqual(interviewMigrationProblems(before, after), []);
  assert.deepEqual(pedigreeMigrationProblems(before, after), []);
  delete after.interviews[0].network.nodes[0]._secureAttributes;
  after.interviews[0].network.nodes[2].promptIDs = [];
  after.interviews[0].network.ego._uid = 'another-ego';
  const problems = interviewMigrationProblems(before, after).join('\n');
  assert.match(
    problems,
    /node alex \(person\)'s _secureAttributes was \{.*\}, is now null/,
  );
  assert.match(problems, /the ego's _uid was "ego-node", is now "another-ego"/);
  assert.ok(
    pedigreeMigrationProblems(before, after).includes(
      'interview family-interview\'s "family" pedigree: "Linda" (linda)\'s promptIDs was ["build"], is now []',
    ),
  );
});

test('a restored person without the provenance the stage gives, or a duplicated id, fails', () => {
  const who = 'interview family-interview\'s "family" pedigree';
  const { before, after } = recordOnlyReadings();
  const cases = [
    [
      (a) => {
        delete a.interviews[0].network.nodes[3].stageId;
      },
      (problems) =>
        problems.includes(
          `${who}: "Robert" (robert)'s stageId should be "family", is now null`,
        ),
    ],
    [
      (a) => {
        a.interviews[0].network.nodes[3]._secureAttributes = { x: {} };
      },
      (problems) =>
        problems.includes(
          `${who}: "Robert" (robert)'s _secureAttributes should be null, is now {"x":{}}`,
        ),
    ],
  ];
  for (const [breakIt, found] of cases) {
    const broken = structuredClone(after);
    breakIt(broken);
    const problems = pedigreeMigrationProblems(before, broken);
    assert.ok(found(problems), problems.join('\n'));
  }
  const doubled = structuredClone(after);
  doubled.interviews[0].network.nodes.push(
    structuredClone(doubled.interviews[0].network.nodes[0]),
  );
  doubled.interviews[0].network.edges.push(
    structuredClone(doubled.interviews[0].network.edges[0]),
  );
  const problems = interviewMigrationProblems(before, doubled).join('\n');
  assert.match(problems, /node alex is stored 2 times/);
  assert.match(problems, /edge egg is stored 2 times/);
});

test("a restored name's encryption comes from the protocol the participant answered", () => {
  const { before, after } = recordOnlyReadings();
  const encrypted = {
    node: { fm: { variables: { fm_name: { encrypted: true } } } },
  };
  before.protocols[0].codebook = encrypted;
  // The upgrade dropped the flag and wrote the label in plain text: both
  // sides agree, and both are wrong.
  const problems = pedigreeMigrationProblems(before, after);
  const who = 'interview family-interview\'s "family" pedigree';
  assert.ok(
    problems.includes(
      `${who}: the name attribute fm_name was encrypted before the upgrade and is not after it`,
    ),
    problems.join('\n'),
  );
  assert.ok(
    problems.includes(
      `${who}: person robert, restored from its stage record, has fm_name="Robert", not null`,
    ),
    problems.join('\n'),
  );
});

test('the restored-provenance prompt id is the one the package writes', () => {
  const source = readFileSync(
    join(
      repoRoot,
      'packages/protocol-validation/src/schemas/9/stages/family-pedigree.ts',
    ),
    'utf8',
  );
  assert.match(
    source,
    new RegExp(
      `FAMILY_PEDIGREE_BUILD_PROMPT_ID = '${PEDIGREE_BUILD_PROMPT_ID}'`,
    ),
  );
});

test('a stage record the upgrade makes up fails', () => {
  const { before, after } = pedigreeReadings();
  delete before.interviews[0].stageMetadata[1];
  after.interviews[0].stageMetadata = { 1: { framing: 'gendered' } };
  assert.match(
    pedigreeMigrationProblems(before, after).join('\n'),
    /stage record is \{"framing":"gendered"\} after the upgrade, not null/,
  );
});

test('the rest of a pedigree interview is still held to being unchanged', () => {
  const { before, after } = pedigreeReadings();
  after.interviews[0].network.nodes[0].attributes.name = 'Alexa';
  after.interviews[0].network.ego.attributes.ego_name = 'Mara';
  const problems = interviewMigrationProblems(before, after).join('\n');
  assert.match(
    problems,
    /node alex \(person\)'s name was "Alex", is now "Alexa"/,
  );
  assert.match(problems, /the ego's ego_name was "Mira", is now "Mara"/);
});

test('readings with no family in them prove nothing about a family', () => {
  const { before, after } = readings();
  assert.deepEqual(pedigreeMigrationProblems(before, after), [
    'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
  ]);
  // A pedigree holding only the participant is not a family either.
  const lone = pedigreeReadings();
  for (const reading of [lone.before, lone.after]) {
    reading.interviews[0].network.nodes =
      reading.interviews[0].network.nodes.slice(0, 2);
    reading.interviews[0].network.edges = [];
  }
  lone.before.interviews[0].stageMetadata = {};
  assert.deepEqual(pedigreeMigrationProblems(lone.before, lone.after), [
    'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
  ]);
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
