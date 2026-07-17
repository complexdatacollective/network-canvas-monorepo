#!/usr/bin/env node

// Regenerates publishConfig.exports (the dist-pointing map pnpm swaps in at
// publish time) from the src-pointing `exports` map, so the two never drift.
// Run via `pnpm --filter @codaco/fresco-ui sync-exports` after editing
// `exports` in package.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveDistExports } from './exportsMap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(here, '../package.json');

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

pkg.publishConfig = {
  ...pkg.publishConfig,
  exports: deriveDistExports(pkg.exports),
};

writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
