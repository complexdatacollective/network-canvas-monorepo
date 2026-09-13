import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

import { verifyInstalledDeployment } from '../verify-deployed-lock.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'studio-deployed-lock-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const modules = join(root, 'node_modules');
  const external = join(modules, 'external');
  mkdirSync(join(modules, '.pnpm'), { recursive: true });
  mkdirSync(external);
  writeFileSync(
    join(external, 'package.json'),
    JSON.stringify({ name: 'external', version: '1.0.0' }),
  );
  symlinkSync('../../../repo/packages/workspace', join(modules, 'workspace'));
  return {
    root,
    modules,
    graph: {
      root: {
        dependencies: {
          external: { version: '1.0.0' },
          workspace: { version: 'link:../../../packages/workspace' },
        },
      },
      snapshots: { 'external@1.0.0': {} },
      resolutions: { 'external@1.0.0': {} },
    },
  };
}

test('accepts only declared bundled-workspace links when final image copy breaks them', (t) => {
  const f = fixture(t);
  assert.deepEqual(verifyInstalledDeployment(f.root, f.graph), [
    {
      key: 'external@1.0.0',
      name: 'external',
      version: '1.0.0',
      manifestSha256:
        'ae8a302c677ecc605e164d11ee2b0c835ea6779852f65ca4a7585708586fac1c',
    },
  ]);
  symlinkSync('../../../unreviewed/package', join(f.modules, 'unreviewed'));
  assert.throws(
    () => verifyInstalledDeployment(f.root, f.graph),
    /outside the verified dependency graph: unreviewed/,
  );
});

test('still rejects a missing required registry dependency', (t) => {
  const f = fixture(t);
  rmSync(join(f.modules, 'external'), { recursive: true });
  assert.throws(
    () => verifyInstalledDeployment(f.root, f.graph),
    /required deployed dependency is missing: external/,
  );
});
