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
  };

  for (const name of baseline.names.filter((n) => currentSet.has(n))) {
    const result = spawnSync(
      'diff',
      [
        '-u',
        join(baseline.normalizedDir, name),
        join(current.normalizedDir, name),
      ],
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
