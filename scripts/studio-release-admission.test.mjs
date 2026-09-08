import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { evaluateStudioPublication } from './studio-release-admission.mjs';
import {
  successfulCIRequest,
  successfulRun,
} from './test-support/studio-release-ci.mjs';
import { fixture } from './test-support/studio-release-policy.mjs';

function originMain(f, t) {
  const remote = mkdtempSync(join(tmpdir(), 'studio-admission-origin-'));
  t.after(() => rmSync(remote, { force: true, recursive: true }));
  execFileSync('git', ['init', '--bare', '-q', remote]);
  f.git('remote', 'add', 'origin', remote);
  f.git('push', '-q', '-u', 'origin', 'main');
}

function source(f) {
  return f.git('rev-parse', 'HEAD');
}

async function admission(f, t) {
  originMain(f, t);
  return evaluateStudioPublication(f.cwd, source(f), {
    request: successfulCIRequest(source(f)),
  });
}

test('a clean origin/main source with a pending changeset is deferred before npm', async (t) => {
  const f = fixture(t);
  f.change('@codaco/studio-client');
  f.commit();
  const result = await admission(f, t);
  assert.equal(result.eligibility.status, 'deferred');
  assert.deepEqual(result.ci, { source: source(f), runId: 12, attempt: 1 });
  assert.equal(
    result.eligibility.blockers.some(
      ({ code }) => code === 'pending_changeset',
    ),
    true,
  );
  assert.equal(result.minioSource.commit, 'c'.repeat(40));
  assert.equal(result.minioSource.sha256, 'b'.repeat(64));
  assert.equal(result.ancestry.source, source(f));
});

test('a clean main source with failed CI is refused before release eligibility', async (t) => {
  const f = fixture(t);
  originMain(f, t);
  const run = successfulRun(source(f), { conclusion: 'failure' });
  const request = async ({ query }) => ({
    bytes: Buffer.from(
      JSON.stringify(query ? { total_count: 1, workflow_runs: [run] } : run),
    ),
  });
  await assert.rejects(
    () => evaluateStudioPublication(f.cwd, source(f), { request }),
    /latest main-source CI attempt has not succeeded/,
  );
});

test('refuses wrong HEAD and tracked or untracked checkout changes before policy evaluation', async (t) => {
  const f = fixture(t);
  originMain(f, t);
  const reviewed = source(f);
  f.write('notes.txt', 'new commit\n');
  f.commit();
  await assert.rejects(
    () => evaluateStudioPublication(f.cwd, reviewed),
    /clean reviewed checkout/,
  );
  f.git('reset', '--hard', reviewed);
  f.write('apps/studio/Dockerfile', 'tracked dirty\n');
  await assert.rejects(
    () => evaluateStudioPublication(f.cwd, reviewed),
    /clean reviewed checkout/,
  );
  f.git('checkout', '--', 'apps/studio/Dockerfile');
  writeFileSync(join(f.cwd, 'untracked.txt'), 'untracked\n');
  await assert.rejects(
    () => evaluateStudioPublication(f.cwd, reviewed),
    /clean reviewed checkout/,
  );
});

test('refuses a clean source outside origin/main', async (t) => {
  const f = fixture(t);
  originMain(f, t);
  f.git('checkout', '-qb', 'side');
  f.write('side.txt', 'side\n');
  const side = f.commit();
  await assert.rejects(() => evaluateStudioPublication(f.cwd, side));
});

test('refuses a clean reviewed ancestor after origin/main advances', async (t) => {
  const f = fixture(t);
  originMain(f, t);
  const reviewed = source(f);
  f.write('newer-main.txt', 'newer main\n');
  f.commit();
  f.git('push', '-q', 'origin', 'main');
  f.git('reset', '--hard', reviewed);
  await assert.rejects(
    () =>
      evaluateStudioPublication(f.cwd, reviewed, {
        request: successfulCIRequest(reviewed),
      }),
    /current origin\/main tip/,
  );
});

test('derives MinIO evidence from a clean committed Dockerfile revision', async (t) => {
  const f = fixture(t);
  f.write(
    'apps/studio/deployment/minio.Dockerfile',
    `ADD --checksum=sha256:${'d'.repeat(64)} https://codeload.github.com/minio/minio/tar.gz/${'e'.repeat(40)} /source.tar.gz\nLABEL org.opencontainers.image.revision="${'e'.repeat(40)}"\nRUN go build -ldflags='-X github.com/minio/minio/cmd.CommitID=${'e'.repeat(40)}'\n`,
  );
  f.commit();
  originMain(f, t);
  const result = await evaluateStudioPublication(f.cwd, source(f), {
    request: successfulCIRequest(source(f)),
  });
  assert.equal(result.minioSource.repository, 'https://github.com/minio/minio');
  assert.equal(result.minioSource.commit, 'e'.repeat(40));
  assert.equal(result.minioSource.sha256, 'd'.repeat(64));
});

test('reports a reserved distribution source that is not an ancestor as superseded', async (t) => {
  const f = fixture(t);
  originMain(f, t);
  const main = source(f);
  f.git('checkout', '-qb', 'reserved');
  f.write('reserved.txt', 'reserved\n');
  const reserved = f.commit();
  f.git('tag', `studio-distribution-${reserved}`, reserved);
  f.git('checkout', '-q', 'main');
  const result = await evaluateStudioPublication(f.cwd, main, {
    request: successfulCIRequest(main),
  });
  assert.equal(result.ancestry.status, 'superseded');
  assert.equal(result.ancestry.conflictingRelease, reserved);
});

test('the admission CLI fails generically within its bounded command path', () => {
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    ['scripts/studio-release-admission.mjs', 'not-a-source'],
    {
      encoding: 'utf8',
      timeout: 5_000,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    'Studio publication admission could not be verified.\n',
  );
  assert.ok(Date.now() - started < 5_000);
});
