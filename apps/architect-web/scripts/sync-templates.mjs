// Generates the in-app bundled template copies from their canonical sources.
//
// The canonical, validated protocol for each template lives at the repo root in
// `templates/<id>/protocol.json`. `src/templates/index.ts` imports a copy under
// `src/templates/<id>.json` so templates open without a network fetch. This
// script regenerates those copies; pass `--check` to verify they are in sync
// (used by `src/templates/__tests__/bundled-sync.test.ts`, and so by CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const bundledDir = resolve(here, '../src/templates');

const TEMPLATE_IDS = [
  'transnational-networks',
  'mental-health-networks',
  'social-connection-isolation',
  'behavioural-influence-networks',
  'care-support-networks',
  'sexual-injection-risk-networks',
];

const check = process.argv.includes('--check');
const drifted = [];

for (const id of TEMPLATE_IDS) {
  const canonical = readFileSync(
    resolve(repoRoot, 'templates', id, 'protocol.json'),
    'utf8',
  );
  const target = resolve(bundledDir, `${id}.json`);
  if (check) {
    if (readFileSync(target, 'utf8') !== canonical) {
      drifted.push(id);
    }
  } else {
    writeFileSync(target, canonical);
  }
}

if (drifted.length > 0) {
  process.stderr.write(
    `Bundled templates out of sync with canonical sources: ${drifted.join(', ')}\n` +
      'Run: node apps/architect-web/scripts/sync-templates.mjs\n',
  );
  process.exit(1);
}
