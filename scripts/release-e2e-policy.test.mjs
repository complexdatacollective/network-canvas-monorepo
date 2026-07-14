import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseE2EPolicy, releaseRefForEvent } from './release-e2e-policy.mjs';

test('recognises only the two generated release PR refs', () => {
  assert.equal(
    releaseRefForEvent({
      eventName: 'pull_request',
      headRef: 'changeset-release/main',
      refName: '7/merge',
    }),
    'changeset-release/main',
  );
  assert.equal(
    releaseRefForEvent({
      eventName: 'workflow_dispatch',
      headRef: '',
      refName: 'changeset-release/apps',
    }),
    'changeset-release/apps',
  );
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
      headRef: 'feature/add-changeset',
      refName: '',
    }),
    '',
  );
});

test('release PR and dispatch policies carry the child PR target', () => {
  assert.deepEqual(
    releaseE2EPolicy({
      eventName: 'pull_request',
      headRef: 'changeset-release/main',
    }),
    {
      required: true,
      releaseRef: 'changeset-release/main',
      snapshotBranch: 'e2e-snapshots/changeset-release-main',
    },
  );
  assert.deepEqual(
    releaseE2EPolicy({
      eventName: 'workflow_dispatch',
      refName: 'changeset-release/apps',
    }),
    {
      required: true,
      releaseRef: 'changeset-release/apps',
      snapshotBranch: 'e2e-snapshots/changeset-release-apps',
    },
  );
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
