#!/usr/bin/env node
// Compares two interview-data export captures (pre-upgrade baseline vs
// post-upgrade), so the release-test workflow can look for unanticipated
// differences without loading raw export files into an agent's context.
//
// Each input directory holds what a capture produced: UI export archives
// (*.zip) and/or API snapshots (*.json). Archives are extracted, every text
// file is normalized (volatile timestamps masked, JSON keys sorted, datetimes
// in filenames masked so archive members pair up across runs), and the two
// trees are diffed. The summary JSON goes to stdout and --out; full normalized
// trees and per-file diffs are left in --work for inspection.
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

// Volatile values that legitimately differ between two exports of the same
// data: wall-clock timestamps (ISO and epoch-milliseconds).
const ISO_TIMESTAMP =
  /\d{4}-\d{2}-\d{2}[T_ ]\d{2}[:.-]\d{2}[:.-]\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const DATE_IN_NAME =
  /\d{4}-\d{2}-\d{2}(?:[T_ -]?\d{2}[:.-]?\d{2}[:.-]?\d{2})?/g;
const EPOCH_MS = /\b1\d{12}\b/g;

function normalizeName(name) {
  return name.replace(DATE_IN_NAME, 'DATE').replace(EPOCH_MS, 'EPOCH');
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted((a, b) => a.localeCompare(b))
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}

function normalizeContent(name, text) {
  let normalized = text;
  if (name.endsWith('.json')) {
    try {
      normalized = `${JSON.stringify(sortKeysDeep(JSON.parse(text)), null, 2)}\n`;
    } catch {
      // Not valid JSON after all — fall through to plain masking.
    }
  }
  return normalized
    .replace(ISO_TIMESTAMP, '<TIMESTAMP>')
    .replace(EPOCH_MS, '<EPOCH_MS>');
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
