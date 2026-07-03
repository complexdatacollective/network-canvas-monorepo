import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  applyAppReleases,
  planAppReleases,
  renderPrBody,
} from './version-beta-apps.mjs';

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'vba-'));
  mkdirSync(join(cwd, '.changeset'));
  mkdirSync(join(cwd, 'apps/architect-web'), { recursive: true });
  mkdirSync(join(cwd, 'apps/interviewer-v8'), { recursive: true });
  writeFileSync(
    join(cwd, 'apps/architect-web/package.json'),
    JSON.stringify(
      { name: '@codaco/architect-web', version: '8.0.0-beta.0', private: true },
      null,
      2,
    ),
  );
  writeFileSync(
    join(cwd, 'apps/interviewer-v8/package.json'),
    JSON.stringify(
      {
        name: '@codaco/interviewer-v8',
        version: '8.0.0-beta.0',
        private: true,
      },
      null,
      2,
    ),
  );
  return cwd;
}

test('bumps only apps with pending changesets, leaving base + other app untouched', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/one.md'),
    `---\n"@codaco/architect-web": minor\n---\n\nAdd search`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/interview": patch\n---\n\nlib only`,
  );

  const { plans, consumed } = planAppReleases(cwd);
  applyAppReleases(cwd, plans, consumed);

  const arch = JSON.parse(
    readFileSync(join(cwd, 'apps/architect-web/package.json'), 'utf8'),
  );
  const intv = JSON.parse(
    readFileSync(join(cwd, 'apps/interviewer-v8/package.json'), 'utf8'),
  );
  assert.equal(arch.version, '8.0.0-beta.1'); // beta incremented
  assert.equal(intv.version, '8.0.0-beta.0'); // untouched — no changeset
  assert.match(
    readFileSync(join(cwd, 'apps/architect-web/CHANGELOG.md'), 'utf8'),
    /## 8\.0\.0-beta\.1[\s\S]*Add search/,
  );
  assert.equal(existsSync(join(cwd, '.changeset/one.md')), false); // consumed
  assert.equal(existsSync(join(cwd, '.changeset/keep.md')), true); // library changeset preserved
});

test('renderPrBody summarises the plans', () => {
  const body = renderPrBody([
    {
      pkg: '@codaco/architect-web',
      dir: 'apps/architect-web',
      from: '8.0.0-beta.0',
      to: '8.0.0-beta.1',
      entries: [{ type: 'minor', summary: 'Add search' }],
    },
  ]);
  assert.match(
    body,
    /\| `@codaco\/architect-web` \| 8\.0\.0-beta\.0 \| 8\.0\.0-beta\.1 \|/,
  );
  assert.match(body, /Add search/);
});

test('no pending app changesets → empty plan, no writes', () => {
  const cwd = workspace();
  const { plans, consumed } = planAppReleases(cwd);
  assert.deepEqual(plans, []);
  assert.deepEqual(consumed, []);
});
