#!/usr/bin/env node
// Checks the generated fields of a protocol Architect exported — the values a
// person never types, so the release test's semantic comparison with the
// canonical sample ignores them by construction. Each check names what breaks
// downstream when Architect stops writing the field correctly.
//
// Usage: node check-built-protocol.mjs <extracted .netcanvas directory>
// Prints {"problems": [...]} and exits 1 when there are any.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ascii = (bytes, start, end) =>
  Buffer.from(bytes.subarray(start, end)).toString('latin1');
const text = (bytes) =>
  Buffer.from(bytes)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
const isJsonDocument = (bytes) => {
  try {
    const value = JSON.parse(text(bytes));
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
};
const isIsoMedia = (bytes) =>
  ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii(bytes, 4, 8));

// What each exported extension promises about its file's content. Consumers
// choose a decoder from the extension alone — the interview parses a network
// file as CSV only when it ends in exactly "csv", and as JSON otherwise — so
// an entry whose extension misstates its content breaks wherever it is used.
const FORMATS = {
  png: (b) => ascii(b, 0, 8) === '\x89PNG\r\n\x1A\n',
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => ['GIF87a', 'GIF89a'].includes(ascii(b, 0, 6)),
  svg: (b) => /^\s*</.test(text(b)) && text(b).slice(0, 4096).includes('<svg'),
  mov: isIsoMedia,
  mp4: isIsoMedia,
  m4a: isIsoMedia,
  mp3: (b) =>
    ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  aiff: (b) =>
    ascii(b, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(b, 8, 12)),
  json: isJsonDocument,
  geojson: isJsonDocument,
  csv: (b) => !b.includes(0) && !isJsonDocument(b),
};
const TYPE_EXTENSIONS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg'],
  video: ['mov', 'mp4'],
  audio: ['mp3', 'aiff', 'm4a'],
  network: ['csv', 'json'],
  geojson: ['geojson'],
};

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `readAsset` returns an exported file's bytes by its source name, or null
// when the export does not contain it.
export function checkBuiltProtocol(built, readAsset) {
  const problems = [];
  if (!isRecord(built)) return ['protocol.json is not an object'];

  // Every accepted commit stamps it; without it the printable summary's cover
  // silently shows the current date as the last change.
  const { lastModified } = built;
  if (
    typeof lastModified !== 'string' ||
    !ISO_DATETIME.test(lastModified) ||
    Number.isNaN(Date.parse(lastModified))
  ) {
    problems.push(
      `lastModified ${JSON.stringify(lastModified)} is not an ISO timestamp`,
    );
  }

  // Export names each file after its asset id (`entryNameFor` in
  // apps/architect/src/utils/bundleProtocol.ts) so two uploads that share a
  // filename cannot overwrite each other in the zip: every source must be
  // that id-derived name, unique and present, with an extension that fits
  // its type and truly describes its content.
  const manifest = isRecord(built.assetManifest) ? built.assetManifest : {};
  const sources = new Set();
  for (const [id, entry] of Object.entries(manifest)) {
    if (!isRecord(entry)) {
      problems.push(`assetManifest[${id}] is not an object`);
      continue;
    }
    const { name, source, type } = entry;
    if (typeof name !== 'string' || name === '') {
      problems.push(`assetManifest[${id}].name is missing`);
    }
    if (type === 'apikey') continue;
    if (typeof source !== 'string' || source === '') {
      problems.push(`assetManifest[${id}].source is missing`);
      continue;
    }
    const dot = source.lastIndexOf('.');
    const extension = dot > 0 ? source.slice(dot + 1) : '';
    const allowed = TYPE_EXTENSIONS[type];
    if (allowed && !allowed.includes(extension)) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} does not carry a ${String(type)} extension (${allowed.join(', ')})`,
      );
    }
    const stem = id.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_');
    const base = dot > 0 ? source.slice(0, dot) : source;
    const suffix = base.startsWith(`${stem}-`)
      ? base.slice(stem.length + 1)
      : null;
    if (base !== stem && !(suffix && /^\d+$/.test(suffix))) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} is not named after its asset id`,
      );
    }
    if (sources.has(source)) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} is shared with another asset`,
      );
    }
    sources.add(source);
    const bytes = readAsset(source);
    if (bytes === null) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} is not in the export`,
      );
    } else if (FORMATS[extension] && !FORMATS[extension](bytes)) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} does not contain ${extension} data`,
      );
    }
  }

  // Each entity type draws the next palette slot, so a protocol built from
  // scratch holds the dense sequence 1..N; duplicates make two types
  // indistinguishable in the interview.
  const codebook = isRecord(built.codebook) ? built.codebook : {};
  for (const entity of ['node', 'edge']) {
    const types = isRecord(codebook[entity]) ? codebook[entity] : {};
    const colors = Object.values(types).map((entry) =>
      isRecord(entry) && typeof entry.color === 'string' ? entry.color : null,
    );
    const byText = (a, b) => a.localeCompare(b);
    const actual = colors.map(String).toSorted(byText);
    const expected = colors
      .map((_, index) => `${entity}-color-seq-${index + 1}`)
      .toSorted(byText);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `codebook.${entity} colours ${JSON.stringify(actual)} are not the dense sequence ${JSON.stringify(expected)}`,
      );
    }
  }

  // Form rows are keyed by these ids so that reorder and delete keep their
  // identity; a missing or shared id breaks that.
  const stages = Array.isArray(built.stages) ? built.stages : [];
  const fieldIds = new Set();
  for (const [index, stage] of stages.entries()) {
    if (!isRecord(stage) || !isRecord(stage.form)) continue;
    const fields = Array.isArray(stage.form.fields) ? stage.form.fields : [];
    for (const field of fields) {
      const id = isRecord(field) ? field.id : undefined;
      if (typeof id !== 'string' || id === '') {
        problems.push(`stages[${index}].form has a field with no id`);
        continue;
      }
      if (fieldIds.has(id)) {
        problems.push(`form field id ${id} is reused across forms`);
      }
      fieldIds.add(id);
    }
  }

  return problems;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, 'protocol.json'))) {
    process.stderr.write(
      'Usage: check-built-protocol.mjs <extracted .netcanvas directory>\n',
    );
    process.exitCode = 2;
  } else {
    const built = JSON.parse(readFileSync(join(dir, 'protocol.json'), 'utf8'));
    const problems = checkBuiltProtocol(built, (source) => {
      const path = join(dir, 'assets', source);
      return existsSync(path) ? readFileSync(path) : null;
    });
    process.stdout.write(`${JSON.stringify({ problems }, null, 2)}\n`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
