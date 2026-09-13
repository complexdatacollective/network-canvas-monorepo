import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  readRelease,
  sha256,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { authenticateStudioReleaseHistory } from './studio-release-history.mjs';
import {
  releasedDistribution,
  studioSbom,
} from './test-support/studio-release.mjs';

function fixture(t, count = 3) {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-history-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Joshua Melville');
  git('config', 'user.email', 'joshua@northwestern.edu');
  const commits = [];
  const manifests = new Map();
  const history = [];
  const drafts = new Set();
  const signatures = [];
  const commit = () => {
    writeFileSync(join(cwd, 'source'), String(commits.length));
    git('add', 'source');
    git('commit', '-qm', `Fixture ${commits.length}`);
    const source = git('rev-parse', 'HEAD');
    commits.push(source);
    git('update-ref', 'refs/remotes/origin/main', source);
    return source;
  };
  for (let index = 0; index < count; index += 1) {
    const source = commit();
    const value = { ...releasedDistribution(index + 1, history).value, source };
    const sboms = new Map(
      Object.entries(value.images).map(([name, image]) => [
        name,
        studioSbom(image),
      ]),
    );
    for (const [name, bytes] of sboms)
      value.evidence.sboms[name].sha256 = sha256(bytes);
    const bytes = Buffer.from(JSON.stringify(value));
    const release = readRelease(bytes);
    history.push({ ...release, releaseBytes: bytes, sboms });
    manifests.set(source, {
      bytes,
      bundle: Buffer.from(sha256(bytes)),
      manifestSha256: sha256(bytes),
      sboms,
    });
    git('tag', '-a', `studio/${source}`, '-m', `Fixture release ${source}`);
  }
  const source = commit();
  const store = {
    async readPublishedManifest({ source: selected }) {
      if (drafts.has(selected)) return null;
      if (!manifests.has(selected))
        throw new Error('Missing published manifest');
      return manifests.get(selected);
    },
  };
  // This verifies the spawned CLI contract and exact bytes, not Sigstore
  // cryptography. Live Cosign qualification remains a separate release gate.
  const run = (program, args, options) => {
    if (program !== 'test-cosign') return command(program, args, options);
    const target = args[1];
    const bundle = args[args.indexOf('--bundle') + 1];
    assert.deepEqual(args, signatureArguments('blob', target, bundle));
    assert.equal(options.timeout, 300_000);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(statSync(dirname(target)).mode & 0o777, 0o700);
    assert.equal(statSync(target).mode & 0o777, 0o600);
    assert.equal(statSync(bundle).mode & 0o777, 0o600);
    signatures.push([target, bundle]);
    if (readFileSync(bundle, 'utf8') !== sha256(readFileSync(target)))
      throw new Error('Untrusted signature');
    return '';
  };
  const input = { cwd, source, store };
  return {
    commit,
    commits,
    cwd,
    drafts,
    git,
    history,
    input,
    manifests,
    run,
    signatures,
    authenticate: (extra = {}) =>
      authenticateStudioReleaseHistory(
        { ...input, ...extra },
        { cosign: 'test-cosign', run },
      ),
  };
}

test('authenticates every prior release and selects oldest and previous upgrade fixtures', async (t) => {
  const f = fixture(t);
  const result = await f.authenticate();
  assert.deepEqual(result.authenticatedPriorRelease, f.history.at(-1));
  assert.deepEqual(
    result.upgradeFrom,
    f.history.map(({ current }) => current),
  );
  assert.deepEqual(result.qualificationSources, [
    f.history[0],
    f.history.at(-1),
  ]);
  assert.equal(f.signatures.length, 3);
  for (const paths of f.signatures)
    for (const path of paths) assert.equal(existsSync(path), false);
});

for (const defect of ['missing', 'substituted'])
  test(`rejects ${defect} retained SBOMs before image reuse`, async (t) => {
    const f = fixture(t);
    const retained = f.manifests.get(f.history.at(-1).current.source);
    if (defect === 'missing') retained.sboms.delete('registry');
    else retained.sboms.set('registry', Buffer.from('substituted report'));
    await assert.rejects(
      f.authenticate,
      defect === 'missing'
        ? /SBOM inventory is incomplete/
        : /does not match its signed digest/,
    );
  });

test('accepts an explicitly empty first-release history without inferring API failures as absence', async (t) => {
  const f = fixture(t, 0);
  assert.deepEqual(await f.authenticate(), {
    authenticatedPriorRelease: undefined,
    upgradeFrom: [],
    qualificationSources: [],
  });
  assert.equal(f.signatures.length, 0);
});

test('excludes interrupted drafts while retaining the newest published reuse identity', async (t) => {
  const f = fixture(t);
  f.drafts.add(f.history.at(-1).current.source);
  const result = await f.authenticate();
  assert.equal(
    result.authenticatedPriorRelease.current.source,
    f.history[1].current.source,
  );
  assert.equal(result.upgradeFrom.length, 2);
});

test('does not use the current published source as its own upgrade parent on retry', async (t) => {
  const f = fixture(t);
  const result = await f.authenticate({
    source: f.history.at(-1).current.source,
  });
  assert.equal(
    result.authenticatedPriorRelease.current.source,
    f.history[1].current.source,
  );
  assert.equal(result.upgradeFrom.length, 2);
});

for (const defect of [
  'signature',
  'missing',
  'source',
  'generation',
  'digest',
  'chain',
])
  test(`refuses ${defect} evidence before returning reusable image identities`, async (t) => {
    const f = fixture(t);
    const selected = f.history.at(-1).current.source;
    const retained = f.manifests.get(selected);
    if (defect === 'signature') retained.bundle = Buffer.from('wrong-identity');
    else if (defect === 'missing') f.manifests.delete(selected);
    else if (defect === 'digest') retained.manifestSha256 = 'a'.repeat(64);
    else {
      const value = JSON.parse(retained.bytes);
      if (defect === 'source') value.source = f.input.source;
      if (defect === 'generation') value.generation += 1;
      if (defect === 'chain') {
        value.ancestors = [];
        value.upgrade.from = [];
      }
      retained.bytes = Buffer.from(JSON.stringify(value));
      retained.manifestSha256 = sha256(retained.bytes);
      retained.bundle = Buffer.from(retained.manifestSha256);
    }
    await assert.rejects(
      f.authenticate,
      defect === 'signature'
        ? /signature verification failed/
        : defect === 'missing'
          ? /Missing published manifest/
          : defect === 'chain'
            ? /single ancestry chain/
            : /differs from its Git identity/,
    );
    for (const paths of f.signatures)
      for (const path of paths) assert.equal(existsSync(path), false);
  });

test('refuses a newer final tag even while its release is still a draft', async (t) => {
  const f = fixture(t);
  f.drafts.add(f.history.at(-1).current.source);
  await assert.rejects(() =>
    f.authenticate({ source: f.history[1].current.source }),
  );
});

test('refuses lightweight or moved release tags', async (t) => {
  const f = fixture(t);
  const tagged = f.history[0].current.source;
  f.git('tag', '-d', `studio/${tagged}`);
  f.git('tag', `studio/${tagged}`, tagged);
  await assert.rejects(f.authenticate, /invalid source evidence/);
  f.git('tag', '-d', `studio/${tagged}`);
  f.git('tag', '-a', `studio/${tagged}`, f.input.source, '-m', 'Moved fixture');
  await assert.rejects(f.authenticate, /invalid source evidence/);
});

test('requires an authenticated explicit oldest release to narrow the support range', async (t) => {
  const f = fixture(t);
  const selected = f.history[1].current.source;
  assert.deepEqual(
    (await f.authenticate({ oldestSupportedSource: selected })).upgradeFrom,
    f.history.slice(1).map(({ current }) => current),
  );
  await assert.rejects(
    () => f.authenticate({ oldestSupportedSource: f.input.source }),
    /not authenticated published history/,
  );
});
