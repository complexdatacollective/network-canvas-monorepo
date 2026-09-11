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
} from './version-gated-products.mjs';

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'vgp-'));
  mkdirSync(join(cwd, '.changeset'));
  mkdirSync(join(cwd, 'apps/documentation'), { recursive: true });
  mkdirSync(join(cwd, 'apps/networkcanvas.com'), { recursive: true });
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
  const studioPackages = {
    '@codaco/studio-client': 'apps/studio/client',
    '@codaco/studio-rpc': 'packages/studio-rpc',
    '@codaco/studio-server': 'apps/studio/server',
    '@codaco/studio-sync': 'packages/studio-sync',
  };
  for (const [name, dir] of Object.entries(studioPackages)) {
    mkdirSync(join(cwd, dir), { recursive: true });
    writeFileSync(
      join(cwd, dir, 'package.json'),
      JSON.stringify({ name, version: '0.1.0', private: true }, null, 2),
    );
  }
  return cwd;
}

test('bumps only the targeted product and preserves normal-lane changesets', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/one.md'),
    `---\n"@codaco/documentation": minor\n---\n\nReorganise the guides`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/architect": patch\n"@codaco/interview": patch\n---\n\nnormal lane`,
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
    /## 0\.2\.0[\s\S]*Reorganise the guides/,
  );
  assert.equal(existsSync(join(cwd, '.changeset/one.md')), false);
  assert.equal(existsSync(join(cwd, '.changeset/keep.md')), true);
});

test('a targeted release preserves another product changeset', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/docs.md'),
    `---\n"@codaco/documentation": patch\n---\n\nFix documentation`,
  );
  writeFileSync(
    join(cwd, '.changeset/website.md'),
    `---\n"networkcanvas.com": patch\n---\n\nFix website`,
  );

  const { plans, consumed } = planProductReleases(cwd, [
    '@codaco/documentation',
  ]);
  applyProductReleases(cwd, plans, consumed);

  assert.deepEqual(consumed, ['docs']);
  assert.equal(existsSync(join(cwd, '.changeset/docs.md')), false);
  assert.equal(existsSync(join(cwd, '.changeset/website.md')), true);
  assert.equal(
    JSON.parse(
      readFileSync(join(cwd, 'apps/networkcanvas.com/package.json'), 'utf8'),
    ).version,
    '0.1.1',
  );
});

test('renderPrBody summarises a separately gated site', () => {
  const body = renderPrBody([
    {
      pkg: '@codaco/documentation',
      dir: 'apps/documentation',
      from: '0.1.0',
      to: '0.2.0',
      entries: [{ type: 'minor', summary: 'Add guides' }],
    },
  ]);
  assert.match(body, /\| `@codaco\/documentation` \| 0\.1\.0 \| 0\.2\.0 \|/);
  assert.match(body, /Add guides/);
  assert.match(body, /releases `@codaco\/documentation`/);
});

test('renderPrBody rejects plans from independent product lanes', () => {
  assert.throws(
    () =>
      renderPrBody([
        {
          pkg: '@codaco/documentation',
          from: '0.1.0',
          to: '0.1.1',
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
  assert.deepEqual(validateTargetPackages(['@codaco/documentation']), [
    '@codaco/documentation',
  ]);
  assert.deepEqual(validateTargetPackages(['networkcanvas.com']), [
    'networkcanvas.com',
  ]);
  assert.equal(validateTargetPackages(['@codaco/architect']), null);
  assert.equal(
    validateTargetPackages(['@codaco/documentation', 'networkcanvas.com']),
    null,
  );
  const studioLane = [
    '@codaco/studio-client',
    '@codaco/studio-rpc',
    '@codaco/studio-server',
    '@codaco/studio-sync',
  ];
  assert.deepEqual(validateTargetPackages(studioLane), studioLane);
  assert.equal(validateTargetPackages(['@codaco/studio-server']), null);
  assert.equal(
    validateTargetPackages([...studioLane, '@codaco/documentation']),
    null,
  );
});

test('versions the studio lane packages that have changesets and consumes only studio changesets', () => {
  const cwd = workspace();
  writeFileSync(
    join(cwd, '.changeset/server.md'),
    `---\n"@codaco/studio-server": minor\n"@codaco/studio-sync": patch\n---\n\nSync leases`,
  );
  writeFileSync(
    join(cwd, '.changeset/keep.md'),
    `---\n"@codaco/interview": patch\n---\n\nnormal lane`,
  );

  const studioLane = [
    '@codaco/studio-client',
    '@codaco/studio-rpc',
    '@codaco/studio-server',
    '@codaco/studio-sync',
  ];
  const { plans, consumed } = planProductReleases(cwd, studioLane);
  applyProductReleases(cwd, plans, consumed);

  const server = JSON.parse(
    readFileSync(join(cwd, 'apps/studio/server/package.json'), 'utf8'),
  );
  assert.equal(server.version, '0.2.0');
  const sync = JSON.parse(
    readFileSync(join(cwd, 'packages/studio-sync/package.json'), 'utf8'),
  );
  assert.equal(sync.version, '0.1.1');
  const client = JSON.parse(
    readFileSync(join(cwd, 'apps/studio/client/package.json'), 'utf8'),
  );
  assert.equal(client.version, '0.1.0');
  assert.equal(existsSync(join(cwd, '.changeset/server.md')), false);
  assert.equal(existsSync(join(cwd, '.changeset/keep.md')), true);

  const body = renderPrBody(plans);
  assert.match(body, /versions `@codaco\/studio-server`/);
  assert.match(body, /no automated production deploy lane yet/);
  assert.doesNotMatch(body, /Netlify \*\*production\*\*/);
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
