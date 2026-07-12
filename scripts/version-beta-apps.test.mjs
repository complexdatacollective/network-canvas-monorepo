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
  mkdirSync(join(cwd, 'apps/architect'), { recursive: true });
  mkdirSync(join(cwd, 'apps/documentation'), { recursive: true });
  mkdirSync(join(cwd, 'apps/interviewer'), { recursive: true });
  writeFileSync(
    join(cwd, 'apps/architect/package.json'),
    JSON.stringify(
      { name: '@codaco/architect', version: '8.0.0-beta.0', private: true },
      null,
      2,
    ),
  );
  writeFileSync(
    join(cwd, 'apps/documentation/package.json'),
    JSON.stringify(
      {
        name: '@codaco/documentation',
        version: '0.1.0',
        private: true,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(cwd, 'apps/interviewer/package.json'),
    JSON.stringify(
      {
        name: '@codaco/interviewer',
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
    `---\n"@codaco/architect": minor\n---\n\nAdd search`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/interview": patch\n---\n\nlib only`,
  );

  const { plans, consumed } = planAppReleases(cwd);
  applyAppReleases(cwd, plans, consumed);

  const arch = JSON.parse(
    readFileSync(join(cwd, 'apps/architect/package.json'), 'utf8'),
  );
  const intv = JSON.parse(
    readFileSync(join(cwd, 'apps/interviewer/package.json'), 'utf8'),
  );
  assert.equal(arch.version, '8.0.0-beta.1'); // beta incremented
  assert.equal(intv.version, '8.0.0-beta.0'); // untouched — no changeset
  assert.match(
    readFileSync(join(cwd, 'apps/architect/CHANGELOG.md'), 'utf8'),
    /## 8\.0\.0-beta\.1[\s\S]*Add search/,
  );
  assert.equal(existsSync(join(cwd, '.changeset/one.md')), false); // consumed
  assert.equal(existsSync(join(cwd, '.changeset/keep.md')), true); // library changeset preserved
});

test('renderPrBody summarises the plans', () => {
  const body = renderPrBody([
    {
      pkg: '@codaco/architect',
      dir: 'apps/architect',
      from: '8.0.0-beta.0',
      to: '8.0.0-beta.1',
      entries: [{ type: 'minor', summary: 'Add search' }],
    },
  ]);
  assert.match(
    body,
    /\| `@codaco\/architect` \| 8\.0\.0-beta\.0 \| 8\.0\.0-beta\.1 \|/,
  );
  assert.match(body, /Add search/);
});

test('creates a normal semver documentation release and changelog', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/docs.md'),
    `---\n"@codaco/documentation": minor\n---\n\nPublish the reorganised documentation.`,
  );

  const { plans, consumed } = planAppReleases(cwd);
  applyAppReleases(cwd, plans, consumed);

  const documentation = JSON.parse(
    readFileSync(join(cwd, 'apps/documentation/package.json'), 'utf8'),
  );
  assert.equal(documentation.version, '0.2.0');
  assert.match(
    readFileSync(join(cwd, 'apps/documentation/CHANGELOG.md'), 'utf8'),
    /## 0\.2\.0[\s\S]*Publish the reorganised documentation\./,
  );
  assert.equal(existsSync(join(cwd, '.changeset/docs.md')), false);
});

test('no pending app changesets → empty plan, no writes', () => {
  const cwd = workspace();
  const { plans, consumed } = planAppReleases(cwd);
  assert.deepEqual(plans, []);
  assert.deepEqual(consumed, []);
});
