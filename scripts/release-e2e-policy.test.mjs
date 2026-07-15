import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseE2EPolicy, releaseRefForEvent } from './release-e2e-policy.mjs';

test('recognises only the generated release PR refs', () => {
  for (const releaseRef of [
    'changeset-release/architect',
    'changeset-release/documentation',
    'changeset-release/interviewer',
    'changeset-release/main',
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
