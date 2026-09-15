import { readFileSync } from 'node:fs';
// Reading a Fresco interview export, for the lane that conducts one.
//
// Separate from the lane script and free of Playwright, so the "did the answers
// survive the export" oracle can be exercised on archives built in a test
// rather than only on one a browser downloaded
// (`scripts/release-test/fresco-release-test-interview.test.mjs`).
//
// Deliberately text-level. A structural reader would have to model GraphML,
// three CSV shapes and the JSON one, and would then only assert what the model
// already assumed; what this lane needs to know is whether the answers a
// participant gave are in the file a researcher receives at all. An answer that
// is absent is absent from the text too.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const require = createRequire(join(repoRoot, 'package.json'));
/** @type {typeof import('jszip')} */
const JSZip = require('jszip');

/** Entries that carry interview data, as opposed to packaging. */
const DATA_ENTRY = /\.(graphml|csv|json|xml)$/i;

/**
 * Every data entry of an export archive, flattened to one string.
 *
 * A Fresco export is a zip of per-interview archives, so entries that are
 * themselves zips are opened as well — an answer one level down is still in
 * the file the researcher receives, and a reader that stopped at the outer
 * archive would report "no data files" for a perfectly good export.
 *
 * `entries` is the positive control: text alone cannot distinguish an export
 * with no answers in it from one with no files in it.
 */
export async function readInterviewExport(archivePath) {
  return readArchive(readFileSync(archivePath), 0);
}

async function readArchive(bytes, depth) {
  if (depth > 2) return { entries: 0, text: '', names: [] };
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (error) {
    // Reported, never swallowed into an empty result: "unreadable" and "empty"
    // are opposite findings and the caller must be able to tell them apart.
    return {
      entries: 0,
      text: '',
      names: [],
      error: `archive could not be read: ${error.message}`,
    };
  }

  let entries = 0;
  let text = '';
  const names = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    names.push(entry.name);
    if (DATA_ENTRY.test(entry.name)) {
      entries += 1;
      text += await entry.async('string');
      continue;
    }
    if (/\.zip$/i.test(entry.name)) {
      const nested = await readArchive(
        await entry.async('uint8array'),
        depth + 1,
      );
      entries += nested.entries;
      text += nested.text;
      names.push(...nested.names.map((name) => `${entry.name}/${name}`));
    }
  }
  return { entries, text, names };
}
