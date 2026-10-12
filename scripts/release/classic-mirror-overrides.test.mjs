import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from 'vitest';

// The classic apps mirror to standalone repositories that install with plain
// `npm install` (see mirror-app.mjs). pnpm-workspace.yaml's `overrides` block
// does not travel with them, so each classic manifest repeats the overrides
// its standalone install needs as an npm `overrides` field (pnpm ignores that
// field inside the workspace). This keeps the two copies from drifting.
const repoRoot = join(import.meta.dirname, '..', '..');

const workspaceOverride = (name) => {
  const yaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const block = yaml.split(/^overrides:\n/m)[1]?.split(/^\S/m)[0] ?? '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const match = block.match(
    new RegExp(`^ {2}['"]?${escaped}['"]?:\\s*['"]?([^'"\\n]+)['"]?$`, 'm'),
  );
  return match?.[1].trim();
};

for (const app of ['architect-classic', 'interviewer-classic']) {
  test(`${app} npm overrides match the workspace overrides`, () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'apps', app, 'package.json'), 'utf8'),
    );
    const overrides = Object.entries(manifest.overrides ?? {});

    assert.ok(
      overrides.some(([name]) => name === 'react-resize-aware'),
      `${app} must pin react-resize-aware for its standalone mirror`,
    );
    for (const [name, version] of overrides) {
      assert.equal(
        version,
        workspaceOverride(name),
        `${app} overrides ${name} to ${version}, pnpm-workspace.yaml to ${workspaceOverride(name)}`,
      );
    }
  });
}
