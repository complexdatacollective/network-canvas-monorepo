#!/usr/bin/env node
// Compares two interview-data export captures (pre-upgrade baseline vs
// post-upgrade), so the release-test workflow can look for unanticipated
// differences without loading raw export files into an agent's context.
//
// Each input directory holds what a capture produced: UI export archives
// (*.zip) and/or API snapshots (*.json). Archives are extracted, every text
// file is normalized and the two trees are diffed. The summary JSON goes to
// stdout and --out; full normalized trees and per-file diffs are left in
// --work for inspection.
//
// Normalization masks ONLY the named fields that legitimately differ between
// two exports of the same data (export wall-clock stamps and rows touched by
// the export marking) — never timestamps wholesale, so corruption of stable
// persisted times (sessionStart/sessionFinish, startTime/finishTime) still
// shows up in the diff. JSON gets sorted keys and id-sorted object arrays so
// pagination-order ties cannot masquerade as changes; datetimes in FILE NAMES
// are masked so archive members pair up across runs.
//
// An upgrade from a release that predates protocol languages also changes
// exports in ways that follow exactly from that upgrade, and those are
// reconciled rather than reported: the interview's recorded language (null or
// a language tag) in the interview API, the ego CSV and GraphML; a protocol's
// schemaVersion moving to 9; codebook text held as { und: <message> }; the
// labels the migration gives entity types and attributes from their names;
// empty optional text it leaves out; and the GraphML protocol and codebook
// hashes of a protocol it rewrote. Each is undone in the current file only
// where it matches what the migration produces from the baseline file, and is
// listed under "reconciled", so anything else in those files is still a
// difference.
//
// Usage: node diff-exports.mjs <baselineDir> <currentDir> --work <dir> [--out <file>]
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { escapeMessageText } from '../../../../packages/protocol-validation/src/localization/messageSyntax.ts';
import { ncInterviewLocaleProperty } from '../../../../packages/shared-consts/src/export-process.ts';

const DIFF_EXCERPT_LINES = 60;

// The first schema whose protocols declare languages; the migration to it
// writes text as messages in English (`en`).
const SCHEMA_WITH_LANGUAGES = 9;
const MIGRATED_LOCALE = 'en';
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
// Attribute values are matched whole: the normalizer's own <VOLATILE> mask
// puts a ">" inside one.
const GRAPH_START_TAG = /<graph\b(?:[^>"]|"[^"]*")*>/g;

const DATE_IN_NAME =
  /\d{4}-\d{2}-\d{2}(?:[T_ -]?\d{2}[:.-]?\d{2}[:.-]?\d{2})?/g;
const EPOCH_IN_NAME = /\b1\d{12}\b/g;

// The ONLY values allowed to differ between two exports of the same data.
// GraphML stamps the export wall-clock as a graph attribute; the ego CSV
// carries it as the sessionExported column; the interview data API's
// lastUpdated (and any exportTime) move when the export itself marks rows.
// Everything else — sessionStart/sessionFinish, startTime/finishTime included
// — stays literal so corruption of persisted values fails the diff.
const VOLATILE_GRAPHML_ATTR = /(\bnc:sessionExportTime=")[^"]*(")/g;
const VOLATILE_CSV_COLUMNS = new Set(['sessionExported']);
const VOLATILE_JSON_KEYS = new Set(['lastUpdated', 'exportTime']);

function normalizeName(name) {
  return name.replace(DATE_IN_NAME, 'DATE').replace(EPOCH_IN_NAME, 'EPOCH');
}

function normalizeJsonDeep(value) {
  if (Array.isArray(value)) {
    const mapped = value.map(normalizeJsonDeep);
    // Collections arrive in query order (e.g. a lastUpdated sort with ties);
    // id-sort them so ordering noise cannot read as a data change.
    if (mapped.every((v) => v && typeof v === 'object' && 'id' in v)) {
      return mapped.toSorted((a, b) =>
        String(a.id).localeCompare(String(b.id)),
      );
    }
    return mapped;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted((a, b) => a.localeCompare(b))
        .map((key) => [
          key,
          VOLATILE_JSON_KEYS.has(key)
            ? '<VOLATILE>'
            : normalizeJsonDeep(value[key]),
        ]),
    );
  }
  return value;
}

// Minimal RFC-4180 row splitter: enough to find a cell boundary in the
// exporter's own output (quoted fields with embedded commas/quotes).
function splitCsvRow(row) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') {
        cell += '""';
        i += 1;
      } else if (ch === '"') {
        cell += ch;
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      cell += ch;
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function normalizeCsv(text) {
  const lines = text.split('\n');
  const header = splitCsvRow(lines[0] ?? '');
  const volatileIdx = new Set(
    header.flatMap((name, idx) =>
      VOLATILE_CSV_COLUMNS.has(name.replace(/^"|"$/g, '')) ? [idx] : [],
    ),
  );
  if (volatileIdx.size === 0) return text;
  return lines
    .map((line, lineIdx) => {
      if (lineIdx === 0 || line === '') return line;
      return splitCsvRow(line)
        .map((cell, idx) => (volatileIdx.has(idx) ? '<VOLATILE>' : cell))
        .join(',');
    })
    .join('\n');
}

function normalizeContent(name, text) {
  if (name.endsWith('.json')) {
    try {
      return `${JSON.stringify(normalizeJsonDeep(JSON.parse(text)), null, 2)}\n`;
    } catch {
      return text; // Not valid JSON after all — compare as-is.
    }
  }
  if (name.endsWith('.csv')) return normalizeCsv(text);
  if (name.endsWith('.graphml')) {
    return text.replace(VOLATILE_GRAPHML_ATTR, '$1<VOLATILE>$2');
  }
  return text;
}

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLanguageTag = (value) =>
  typeof value === 'string' && LANGUAGE_TAG.test(value);

const unquote = (cell) => cell.replace(/^"|"$/g, '');

const isMigratedMessage = (value, text) =>
  typeof text === 'string' &&
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  value[MIGRATED_LOCALE] === escapeMessageText(text);

// The label the migration gives a type or attribute that had none.
const labelFromName = (definition, key) =>
  typeof definition.name === 'string' && definition.name !== ''
    ? definition.name
    : key;

/**
 * The current codebook with what the schema-9 migration does to the baseline
 * codebook undone: text wrapped as an English (`en`) message, labels
 * derived from names or keys, and empty text that a field no longer accepts.
 * `key` is the value's key in its parent, which a derived label falls back to.
 */
function undoLanguageMigration(baseline, current, key, tally) {
  if (typeof baseline === 'string' && isMigratedMessage(current, baseline)) {
    tally.wrapped += 1;
    return baseline;
  }
  if (
    Array.isArray(baseline) &&
    Array.isArray(current) &&
    baseline.length === current.length
  ) {
    return current.map((item, index) =>
      undoLanguageMigration(baseline[index], item, undefined, tally),
    );
  }
  if (!isRecord(baseline) || !isRecord(current)) return current;
  const restored = {};
  for (const [field, value] of Object.entries(current)) {
    if (!(field in baseline)) {
      if (
        field === 'label' &&
        isMigratedMessage(value, labelFromName(baseline, key))
      ) {
        tally.labelsAdded += 1;
        continue;
      }
      restored[field] = value;
      continue;
    }
    restored[field] = undoLanguageMigration(
      baseline[field],
      value,
      field,
      tally,
    );
  }
  for (const [field, value] of Object.entries(baseline)) {
    if (!(field in current) && value === '') {
      tally.emptyLeftOut += 1;
      restored[field] = value;
    }
  }
  return restored;
}

const upgradedProtocol = (baseline, current) => {
  const before = baseline?.data?.protocol;
  const after = current?.data?.protocol;
  return isRecord(before) &&
    isRecord(after) &&
    typeof before.schemaVersion === 'number' &&
    before.schemaVersion < SCHEMA_WITH_LANGUAGES &&
    after.schemaVersion === SCHEMA_WITH_LANGUAGES
    ? { before, after }
    : null;
};

function reconcileInterviewJson(baselineText, currentText) {
  let baseline;
  let current;
  try {
    baseline = JSON.parse(baselineText);
    current = JSON.parse(currentText);
  } catch {
    return null;
  }
  if (!isRecord(baseline?.data) || !isRecord(current?.data)) return null;
  const differences = [];
  const data = { ...current.data };
  for (const field of ['locale', 'localePreference']) {
    const value = data[field];
    if (
      field in data &&
      !(field in baseline.data) &&
      (value === null || isLanguageTag(value))
    ) {
      delete data[field];
      differences.push(
        `interview ${field} recorded as ${JSON.stringify(value)}`,
      );
    }
  }
  const upgrade = upgradedProtocol(baseline, current);
  if (upgrade) {
    const tally = { wrapped: 0, labelsAdded: 0, emptyLeftOut: 0 };
    data.protocol = {
      ...upgrade.after,
      schemaVersion: upgrade.before.schemaVersion,
      codebook: undoLanguageMigration(
        upgrade.before.codebook,
        upgrade.after.codebook,
        undefined,
        tally,
      ),
    };
    differences.push(
      `protocol schemaVersion ${upgrade.before.schemaVersion} -> ${SCHEMA_WITH_LANGUAGES}`,
      `codebook: ${tally.wrapped} text value(s) held as { ${MIGRATED_LOCALE}: <message> }, ${tally.labelsAdded} label(s) derived from a name or key, ${tally.emptyLeftOut} empty text value(s) left out`,
    );
  }
  if (differences.length === 0) return null;
  return {
    text: `${JSON.stringify(normalizeJsonDeep({ ...current, data }), null, 2)}\n`,
    differences,
  };
}

function reconcileCsv(baselineText, currentText) {
  const baselineHeader = splitCsvRow(
    baselineText.split('\n')[0]?.replace(/\r$/, '') ?? '',
  ).map(unquote);
  const lines = currentText.split('\n');
  const header = splitCsvRow(lines[0]?.replace(/\r$/, '') ?? '').map(unquote);
  const column = header.indexOf(ncInterviewLocaleProperty);
  if (column === -1 || baselineHeader.includes(ncInterviewLocaleProperty))
    return null;
  const values = new Set();
  const rows = [];
  for (const [index, line] of lines.entries()) {
    if (line === '') {
      rows.push(line);
      continue;
    }
    const ending = line.endsWith('\r') ? '\r' : '';
    const cells = splitCsvRow(line.slice(0, line.length - ending.length));
    // A row that does not split into the header's columns cannot have its
    // column removed safely, so the file is compared as it stands.
    if (cells.length !== header.length) return null;
    if (index > 0) {
      const value = unquote(cells[column]);
      if (value !== '' && !isLanguageTag(value)) return null;
      if (value !== '') values.add(value);
    }
    rows.push(`${cells.toSpliced(column, 1).join(',')}${ending}`);
  }
  return {
    text: rows.join('\n'),
    differences: [
      `the ${ncInterviewLocaleProperty} column (${values.size === 0 ? 'empty in every row' : [...values].join(', ')})`,
    ],
  };
}

const attributePattern = (name) => new RegExp(`(\\s${name}=")([^"]*)(")`);

const attributeOf = (tag, name) => attributePattern(name).exec(tag)?.[2];

const decodeXml = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * `upgradedProtocols` names the protocols the upgrade migrated to schema 9.
 * The migration rewrites their stages and codebook, so the protocol hash and
 * codebook hash every GraphML graph carries change with it; the codebook
 * itself is still compared, through the interview API snapshots.
 */
function reconcileGraphml(baselineText, currentText, upgradedProtocols) {
  const baselineTags = baselineText.match(GRAPH_START_TAG) ?? [];
  const currentTags = currentText.match(GRAPH_START_TAG) ?? [];
  if (currentTags.length === 0 || baselineTags.length !== currentTags.length)
    return null;
  const differences = new Set();
  let index = 0;
  const text = currentText.replace(GRAPH_START_TAG, (tag) => {
    const baselineTag = baselineTags[index];
    index += 1;
    let reconciled = tag;
    const locale = attributeOf(tag, 'nc:interviewLocale');
    if (
      isLanguageTag(locale) &&
      attributeOf(baselineTag, 'nc:interviewLocale') === undefined
    ) {
      reconciled = reconciled.replace(
        attributePattern('nc:interviewLocale'),
        '',
      );
      differences.add(`nc:interviewLocale recorded as "${locale}"`);
    }
    const protocolName = attributeOf(tag, 'nc:protocolName');
    if (
      protocolName !== undefined &&
      upgradedProtocols.has(decodeXml(protocolName))
    ) {
      for (const name of ['nc:protocolUID', 'nc:codebookHash']) {
        const before = attributeOf(baselineTag, name);
        const after = attributeOf(reconciled, name);
        if (before === undefined || after === undefined || before === after)
          continue;
        reconciled = reconciled.replace(
          attributePattern(name),
          (_, start, _value, end) => `${start}${before}${end}`,
        );
        differences.add(
          `${name} of "${decodeXml(protocolName)}", which the upgrade migrated to schema ${SCHEMA_WITH_LANGUAGES}`,
        );
      }
    }
    return reconciled;
  });
  return differences.size === 0
    ? null
    : { text, differences: [...differences] };
}

function reconcile(name, baselineText, currentText, upgradedProtocols) {
  if (name.endsWith('.json'))
    return reconcileInterviewJson(baselineText, currentText);
  if (name.endsWith('.csv')) return reconcileCsv(baselineText, currentText);
  if (name.endsWith('.graphml'))
    return reconcileGraphml(baselineText, currentText, upgradedProtocols);
  return null;
}

function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return files;
}

// Extract archives and copy loose files into a flat normalized tree.
function prepareTree(inputDir, workDir) {
  mkdirSync(workDir, { recursive: true });
  const extracted = join(workDir, 'extracted');
  mkdirSync(extracted);
  for (const file of listFiles(inputDir)) {
    const rel = relative(inputDir, file);
    if (file.endsWith('.zip')) {
      const dest = join(extracted, normalizeName(rel).replace(/\.zip$/, ''));
      mkdirSync(dest, { recursive: true });
      const result = spawnSync('unzip', ['-o', '-q', file, '-d', dest], {
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(`unzip failed for ${file}: ${result.stderr}`);
      }
    } else {
      const dest = join(extracted, normalizeName(rel));
      mkdirSync(join(dest, '..'), { recursive: true });
      cpSync(file, dest);
    }
  }

  const normalizedDir = join(workDir, 'normalized');
  const names = [];
  for (const file of listFiles(extracted)) {
    const rel = normalizeName(relative(extracted, file));
    const dest = join(normalizedDir, rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, normalizeContent(rel, readFileSync(file, 'utf8')));
    names.push(rel);
  }
  return { normalizedDir, names: names.toSorted((a, b) => a.localeCompare(b)) };
}

function main() {
  const positional = [];
  let outFile;
  let workRoot;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') outFile = argv[(i += 1)];
    else if (argv[i] === '--work') workRoot = argv[(i += 1)];
    else positional.push(argv[i]);
  }
  if (positional.length !== 2 || !workRoot) {
    console.error(
      'Usage: node diff-exports.mjs <baselineDir> <currentDir> --work <dir> [--out <file>]',
    );
    process.exit(1);
  }
  const [baselineDir, currentDir] = positional.map((p) => resolve(p));
  workRoot = resolve(workRoot);
  rmSync(workRoot, { recursive: true, force: true });

  const baseline = prepareTree(baselineDir, join(workRoot, 'baseline'));
  const current = prepareTree(currentDir, join(workRoot, 'current'));

  const baselineSet = new Set(baseline.names);
  const currentSet = new Set(current.names);
  const summary = {
    onlyInBaseline: baseline.names.filter((name) => !currentSet.has(name)),
    onlyInCurrent: current.names.filter((name) => !baselineSet.has(name)),
    identical: [],
    changed: [],
    reconciled: [],
  };

  const shared = baseline.names.filter((n) => currentSet.has(n));
  const read = (side, name) =>
    readFileSync(join(side.normalizedDir, name), 'utf8');
  const upgradedProtocols = new Set();
  for (const name of shared.filter((n) => n.endsWith('.json'))) {
    try {
      const upgrade = upgradedProtocol(
        JSON.parse(read(baseline, name)),
        JSON.parse(read(current, name)),
      );
      if (typeof upgrade?.after.name === 'string')
        upgradedProtocols.add(upgrade.after.name);
    } catch {
      // Not valid JSON: it names no protocol, and is compared as it stands.
    }
  }

  for (const name of shared) {
    const reconciled = reconcile(
      name,
      read(baseline, name),
      read(current, name),
      upgradedProtocols,
    );
    let currentPath = join(current.normalizedDir, name);
    if (reconciled) {
      currentPath = join(workRoot, 'current', 'reconciled', name);
      mkdirSync(join(currentPath, '..'), { recursive: true });
      writeFileSync(currentPath, reconciled.text);
      summary.reconciled.push({
        file: name,
        differences: reconciled.differences,
      });
    }
    const result = spawnSync(
      'diff',
      ['-u', join(baseline.normalizedDir, name), currentPath],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.status === 0) {
      summary.identical.push(name);
      continue;
    }
    const lines = result.stdout.split('\n');
    const diffPath = join(
      workRoot,
      'diffs',
      `${name.replace(/\//g, '__')}.diff`,
    );
    mkdirSync(join(diffPath, '..'), { recursive: true });
    writeFileSync(diffPath, result.stdout);
    summary.changed.push({
      file: name,
      addedLines: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .length,
      removedLines: lines.filter(
        (l) => l.startsWith('-') && !l.startsWith('---'),
      ).length,
      fullDiff: diffPath,
      excerpt: lines.slice(0, DIFF_EXCERPT_LINES).join('\n'),
    });
  }

  const output = JSON.stringify(summary, null, 2);
  if (outFile) writeFileSync(resolve(outFile), output);
  console.log(output);
}

main();
