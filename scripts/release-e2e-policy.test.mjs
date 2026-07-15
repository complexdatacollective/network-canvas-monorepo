import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  mergeGroupChangesReleaseVersion,
  releaseE2EPolicy,
  releaseRefForEvent,
} from './release-e2e-policy.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('recognises only the generated release PR refs', () => {
  for (const releaseRef of [
    'changeset-release/architect',
    'changeset-release/documentation',
    'changeset-release/interviewer',
    'changeset-release/main',
    'changeset-release/website',
  ]) {
    assert.equal(
      releaseRefForEvent({
        eventName: 'pull_request',
        headRef: releaseRef,
        refName: '7/merge',
      }),
      releaseRef,
    );
    assert.equal(
      releaseRefForEvent({
        eventName: 'workflow_dispatch',
        headRef: '',
        refName: releaseRef,
      }),
      releaseRef,
    );
  }
  assert.equal(
    releaseRefForEvent({
      eventName: 'pull_request',
      headRef: 'changeset-release/not-a-release',
      refName: '',
    }),
    '',
  );
  assert.equal(
    releaseRefForEvent({
      eventName: 'pull_request',
      headRef: 'changeset-release/apps',
      refName: '',
    }),
    '',
  );
  assert.equal(
    releaseRefForEvent({
      eventName: 'pull_request',
      headRef: 'feature/add-changeset',
      refName: '',
    }),
    '',
  );
});

test('all release policies share the central snapshot PR target', () => {
  for (const [eventName, releaseRef] of [
    ['pull_request', 'changeset-release/main'],
    ['workflow_dispatch', 'changeset-release/architect'],
    ['workflow_dispatch', 'changeset-release/documentation'],
    ['workflow_dispatch', 'changeset-release/interviewer'],
    ['workflow_dispatch', 'changeset-release/website'],
  ]) {
    assert.deepEqual(
      releaseE2EPolicy({
        eventName,
        headRef: eventName === 'pull_request' ? releaseRef : '',
        refName: eventName === 'workflow_dispatch' ? releaseRef : '',
      }),
      {
        required: true,
        releaseRef,
        snapshotBranch: 'e2e-snapshots/main',
      },
    );
  }
});

test('merge groups require E2E only when a release version changed', () => {
  assert.equal(
    releaseE2EPolicy(
      { eventName: 'merge_group', baseSha: 'base', headSha: 'head' },
      () => true,
    ).required,
    true,
  );
  assert.equal(
    releaseE2EPolicy(
      { eventName: 'merge_group', baseSha: 'base', headSha: 'head' },
      () => false,
    ).required,
    false,
  );
});

test('a website version bump makes merge-group release E2E required', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'release-e2e-'));
  const manifestDir = join(cwd, 'apps/networkcanvas.com');
  const manifest = join(manifestDir, 'package.json');
  mkdirSync(manifestDir, { recursive: true });
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');

  writeFileSync(manifest, '{"name":"networkcanvas.com","version":"0.1.1"}\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'base');
  const baseSha = git(cwd, 'rev-parse', 'HEAD');

  writeFileSync(manifest, '{"name":"networkcanvas.com","version":"0.1.2"}\n');
  git(cwd, 'commit', '-qam', 'release website');
  const headSha = git(cwd, 'rev-parse', 'HEAD');

  assert.equal(mergeGroupChangesReleaseVersion(baseSha, headSha, cwd), true);
});

test('ordinary events do not require release E2E', () => {
  assert.deepEqual(
    releaseE2EPolicy({
      eventName: 'pull_request',
      headRef: 'feature/example',
    }),
    { required: false, releaseRef: '', snapshotBranch: '' },
  );
  assert.deepEqual(releaseE2EPolicy({ eventName: 'push', refName: 'main' }), {
    required: false,
    releaseRef: '',
    snapshotBranch: '',
  });
});
