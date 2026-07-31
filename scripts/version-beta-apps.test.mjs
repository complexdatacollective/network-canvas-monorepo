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
  applyProductReleases,
  planProductReleases,
  renderPrBody,
  validateTargetPackages,
} from './version-beta-apps.mjs';

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'vba-'));
  mkdirSync(join(cwd, '.changeset'));
  mkdirSync(join(cwd, 'apps/architect'), { recursive: true });
  mkdirSync(join(cwd, 'apps/documentation'), { recursive: true });
  mkdirSync(join(cwd, 'apps/interviewer'), { recursive: true });
  mkdirSync(join(cwd, 'apps/networkcanvas.com'), { recursive: true });
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
  writeFileSync(
    join(cwd, 'apps/networkcanvas.com/package.json'),
    JSON.stringify(
      {
        name: 'networkcanvas.com',
        version: '0.1.1',
        private: true,
      },
      null,
      2,
    ),
  );
  return cwd;
}

test('bumps only the targeted product and preserves library changesets', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/one.md'),
    `---\n"@codaco/architect": minor\n---\n\nAdd search`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/interview": patch\n---\n\nlib only`,
  );

  const { plans, consumed } = planProductReleases(cwd, ['@codaco/architect']);
  applyProductReleases(cwd, plans, consumed);

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

test('a targeted release preserves another product changeset', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/architect.md'),
    `---\n"@codaco/architect": patch\n---\n\nFix Architect`,
  );
  writeFileSync(
    join(cwd, '.changeset/interviewer.md'),
    `---\n"@codaco/interviewer": patch\n---\n\nFix Interviewer`,
  );

  const { plans, consumed } = planProductReleases(cwd, ['@codaco/architect']);
  applyProductReleases(cwd, plans, consumed);

  assert.deepEqual(consumed, ['architect']);
  assert.equal(existsSync(join(cwd, '.changeset/architect.md')), false);
  assert.equal(existsSync(join(cwd, '.changeset/interviewer.md')), true);
  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'apps/interviewer/package.json'), 'utf8'))
      .version,
    '8.0.0-beta.0',
  );
});

test('combined app lane versions both products and consumes a shared changeset once', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/apps.md'),
    `---\n"@codaco/architect": minor\n"@codaco/interviewer": patch\n---\n\nImprove both apps`,
  );

  const { plans, consumed } = planProductReleases(cwd, [
    '@codaco/architect',
    '@codaco/interviewer',
  ]);
  assert.deepEqual(
    plans.map((plan) => plan.pkg),
    ['@codaco/architect', '@codaco/interviewer'],
  );
  assert.deepEqual(consumed, ['apps']);
  applyProductReleases(cwd, plans, consumed);

  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'apps/architect/package.json'), 'utf8'))
      .version,
    '8.0.0-beta.1',
  );
  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'apps/interviewer/package.json'), 'utf8'))
      .version,
    '8.0.0-beta.1',
  );
  assert.equal(existsSync(join(cwd, '.changeset/apps.md')), false);
});

test('a partial app-lane plan never consumes a shared changeset', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/apps.md'),
    `---\n"@codaco/architect": minor\n"@codaco/interviewer": patch\n---\n\nImprove both apps`,
  );

  const { consumed } = planProductReleases(cwd, ['@codaco/architect']);
  assert.deepEqual(consumed, []);
});

test('renderPrBody summarises a combined app lane', () => {
  const body = renderPrBody([
    {
      pkg: '@codaco/architect',
      dir: 'apps/architect',
      from: '8.0.0-beta.0',
      to: '8.0.0-beta.1',
      entries: [{ type: 'minor', summary: 'Add search' }],
    },
    {
      pkg: '@codaco/interviewer',
      dir: 'apps/interviewer',
      from: '8.0.0-beta.0',
      to: '8.0.0-beta.1',
      entries: [{ type: 'patch', summary: 'Improve imports' }],
    },
  ]);
  assert.match(
    body,
    /\| `@codaco\/architect` \| 8\.0\.0-beta\.0 \| 8\.0\.0-beta\.1 \|/,
  );
  assert.match(body, /Add search/);
  assert.match(
    body,
    /\| `@codaco\/interviewer` \| 8\.0\.0-beta\.0 \| 8\.0\.0-beta\.1 \|/,
  );
  assert.match(body, /Improve imports/);
  assert.match(
    body,
    /releases `@codaco\/architect` and `@codaco\/interviewer`/,
  );
});

test('renderPrBody rejects plans from independent product lanes', () => {
  assert.throws(
    () =>
      renderPrBody([
        {
          pkg: '@codaco/architect',
          from: '8.0.0-beta.0',
          to: '8.0.0-beta.1',
          entries: [],
        },
        {
          pkg: 'networkcanvas.com',
          from: '0.1.0',
          to: '0.1.1',
          entries: [],
        },
      ]),
    /exactly one product lane/,
  );
});

test('validateTargetPackages requires one complete lane', () => {
  assert.deepEqual(
    validateTargetPackages(['@codaco/architect', '@codaco/interviewer']),
    ['@codaco/architect', '@codaco/interviewer'],
  );
  assert.deepEqual(validateTargetPackages(['@codaco/documentation']), [
    '@codaco/documentation',
  ]);
  assert.equal(validateTargetPackages(['@codaco/architect']), null);
  assert.equal(
    validateTargetPackages(['@codaco/architect', 'networkcanvas.com']),
    null,
  );
});

test('creates a normal semver documentation release and changelog', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/docs.md'),
    `---\n"@codaco/documentation": minor\n---\n\nPublish the reorganised documentation.`,
  );

  const { plans, consumed } = planProductReleases(cwd, [
    '@codaco/documentation',
  ]);
  applyProductReleases(cwd, plans, consumed);

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

test('creates a normal semver website release without a GitHub prerelease', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/website.md'),
    `---\n"networkcanvas.com": patch\n---\n\nPublish the updated website.`,
  );

  const { plans, consumed } = planProductReleases(cwd, ['networkcanvas.com']);
  applyProductReleases(cwd, plans, consumed);

  const website = JSON.parse(
    readFileSync(join(cwd, 'apps/networkcanvas.com/package.json'), 'utf8'),
  );
  assert.equal(website.version, '0.1.2');
  assert.match(
    readFileSync(join(cwd, 'apps/networkcanvas.com/CHANGELOG.md'), 'utf8'),
    /## 0\.1\.2[\s\S]*Publish the updated website\./,
  );
  assert.doesNotMatch(renderPrBody(plans), /GitHub prerelease/);
  assert.equal(existsSync(join(cwd, '.changeset/website.md')), false);
});

test('no pending product changesets → empty plan, no writes', () => {
  const cwd = workspace();
  const { plans, consumed } = planProductReleases(cwd);
  assert.deepEqual(plans, []);
  assert.deepEqual(consumed, []);
});
