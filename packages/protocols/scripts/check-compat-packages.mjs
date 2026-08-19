// Fails when a published compatibility package has drifted from the canonical
// protocol it mirrors.
//
// The compat copies are tracked in Git and only regenerated at publish time
// (each package's `prepack`), so nothing regenerates them for a contributor who
// edits the canonical protocol. This check turns that divergence into a red
// build instead of a surprise at release. It only reads: it never writes to the
// working tree, so a failure here cannot leave the repository dirty.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffCompatPackage } from './sync-compat-package.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const compatPackages = [
  {
    name: '@codaco/sample-protocol',
    sourceDir: path.join(repoRoot, 'packages', 'protocols', 'sample'),
    targetDir: path.join(repoRoot, 'packages', 'sample-protocol'),
    syncCommand:
      'node ../protocols/scripts/sync-compat-package.mjs sample . (from packages/sample-protocol)',
  },
  {
    name: '@codaco/development-protocol',
    sourceDir: path.join(repoRoot, 'packages', 'protocols', 'development'),
    targetDir: path.join(repoRoot, 'packages', 'development-protocol'),
    syncCommand:
      'node ../protocols/scripts/sync-compat-package.mjs development . (from packages/development-protocol)',
  },
];

let drifted = false;

for (const { name, sourceDir, targetDir, syncCommand } of compatPackages) {
  const differences = await diffCompatPackage(sourceDir, targetDir);

  if (differences.length === 0) {
    console.log(`${name} matches ${path.relative(repoRoot, sourceDir)}`);
    continue;
  }

  drifted = true;
  console.error(
    `\n${name} has drifted from ${path.relative(repoRoot, sourceDir)}:`,
  );
  for (const difference of differences) {
    console.error(`  - ${difference}`);
  }
  console.error(`  Fix by running: ${syncCommand}`);
}

if (drifted) {
  console.error(
    '\nThe compatibility packages are published from their committed copies. Re-run the sync above and commit the result.',
  );
  process.exit(1);
}
