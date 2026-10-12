#!/usr/bin/env node
// Checks the generated fields of a protocol Architect exported — the values a
// person never types, so the release test's semantic comparison with the
// canonical sample ignores them by construction. Each check names what breaks
// downstream when Architect stops writing the field correctly.
//
// Usage: node check-built-protocol.mjs <extracted .netcanvas directory>
// Prints {"problems": [...]} and exits 1 when there are any.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const CONTENT_ADDRESSED = /^([0-9a-f]{64})\.[a-z0-9]+$/i;
const EXTENSIONS = {
  image: /\.(png|svg|jpe?g|gif)$/i,
  video: /\.(mov|mp4)$/i,
  audio: /\.(mp3|aiff|m4a)$/i,
  network: /\.(csv|json)$/i,
  geojson: /\.geojson$/i,
};

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `readAsset` returns an asset file's bytes by its source name, or null when
// the export does not contain it.
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

  // Sources are named by a hash of their bytes so that two imports of
  // different files with the same name stay two assets; the extension must
  // fit the type or export entries and preview MIME types break.
  const manifest = isRecord(built.assetManifest) ? built.assetManifest : {};
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
    const expected = EXTENSIONS[type];
    if (expected && !expected.test(source)) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} does not carry a ${String(type)} extension`,
      );
    }
    const hash = CONTENT_ADDRESSED.exec(source);
    if (!hash) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} is not a content-addressed name`,
      );
      continue;
    }
    const bytes = readAsset(source);
    if (bytes === null) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} is not in the export`,
      );
    } else if (
      createHash('sha256').update(bytes).digest('hex') !== hash[1].toLowerCase()
    ) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} does not match the hash of its contents`,
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
