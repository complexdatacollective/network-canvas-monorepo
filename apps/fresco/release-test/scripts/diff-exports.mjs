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
// The upgrade under test leaves the schema 8 protocols and interviews a
// deployment holds as they were, and exports and the interview API read them
// with schema 8's own code, so every export file is held to being identical:
// nothing in a CSV or GraphML file is reconciled. The one difference that is
// reconciled is in the interview API, which now names, for every interview, the finish
// stage it ended at and the outcome that stage declares (finishStageId,
// finishOutcome). A schema 8 interview has no finish stages, so both are null
// for every interview this lane seeded, and a key the baseline lacks that the
// current reading adds as null is reconciled. A value in either — an outcome
// on an interview that never recorded one — is invented data, and stays a
// difference. Reconciled differences are listed under "reconciled".
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

const DIFF_EXCERPT_LINES = 60;

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

// The fields the interview API names for every interview, null for one that
// recorded no finish stage — every schema 8 interview. Only a null is
// reconciled: see the header.
const FINISH_FIELDS = ['finishStageId', 'finishOutcome'];

/**
 * `item` with every finish field the baseline item lacks and the current one
 * holds as null removed, and the removals counted in `tally`.
 */
function withoutAddedFinishFields(baselineItem, item, tally) {
  const restored = { ...item };
  for (const field of FINISH_FIELDS) {
    if (field in item && !(field in baselineItem) && item[field] === null) {
      delete restored[field];
      tally[field] = (tally[field] ?? 0) + 1;
    }
  }
  return restored;
}

const finishFieldDifferences = (tally, noun) =>
  FINISH_FIELDS.filter((field) => tally[field]).map(
    (field) => `${noun(tally[field])} ${field} added as null`,
  );

/**
 * An interview API snapshot — the collection, or one interview — with the
 * finish fields the API added as null taken out, or null when there were
 * none. Interviews in a collection are paired with the baseline's by id, so
 * one that exists on only one side is compared as it stands.
 */
function reconcileInterviewJson(baselineText, currentText) {
  let baseline;
  let current;
  try {
    baseline = JSON.parse(baselineText);
    current = JSON.parse(currentText);
  } catch {
    return null;
  }
  const tally = {};
  let data;
  let noun;
  if (Array.isArray(baseline?.data) && Array.isArray(current?.data)) {
    const baselineById = new Map(
      baseline.data.filter(isRecord).map((item) => [item.id, item]),
    );
    data = current.data.map((item) => {
      const baselineItem = isRecord(item) ? baselineById.get(item.id) : null;
      return baselineItem
        ? withoutAddedFinishFields(baselineItem, item, tally)
        : item;
    });
    noun = (count) => `${count} interview(s):`;
  } else if (isRecord(baseline?.data) && isRecord(current?.data)) {
    data = withoutAddedFinishFields(baseline.data, current.data, tally);
    noun = () => 'interview';
  } else return null;
  const differences = finishFieldDifferences(tally, noun);
  if (differences.length === 0) return null;
  return {
    text: `${JSON.stringify(normalizeJsonDeep({ ...current, data }), null, 2)}\n`,
    differences,
  };
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
  for (const name of shared) {
    const reconciled = name.endsWith('.json')
      ? reconcileInterviewJson(read(baseline, name), read(current, name))
      : null;
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
