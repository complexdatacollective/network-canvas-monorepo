import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSuccessfulStudioSourceCI } from './studio-release-ci-admission.mjs';
import { successfulRun } from './test-support/studio-release-ci.mjs';

const source = 'a'.repeat(40);
const encode = (value) => ({ bytes: Buffer.from(JSON.stringify(value)) });
function fixture({
  listed = [successfulRun(source)],
  current = listed.at(-1),
  total = listed.length,
} = {}) {
  const calls = [];
  const request = async (input) => {
    calls.push(input);
    return encode(
      input.query ? { total_count: total, workflow_runs: listed } : current,
    );
  };
  return {
    calls,
    request,
    verify: () => assertSuccessfulStudioSourceCI(source, { request }),
  };
}

test('binds the source to the fixed main push workflow and rereads its latest attempt', async () => {
  const f = fixture();
  assert.deepEqual(await f.verify(), { source, runId: 12, attempt: 1 });
  assert.deepEqual(f.calls, [
    {
      path: 'repos/complexdatacollective/network-canvas-monorepo/actions/workflows/ci-and-release.yml/runs',
      query: {
        head_sha: source,
        event: 'push',
        branch: 'main',
        per_page: 100,
        page: 1,
      },
    },
    {
      path: 'repos/complexdatacollective/network-canvas-monorepo/actions/runs/12',
    },
    {
      path: 'repos/complexdatacollective/network-canvas-monorepo/actions/workflows/ci-and-release.yml/runs',
      query: {
        head_sha: source,
        event: 'push',
        branch: 'main',
        per_page: 100,
        page: 1,
      },
    },
    {
      path: 'repos/complexdatacollective/network-canvas-monorepo/actions/runs/12',
    },
  ]);
});

for (const [label, overrides] of [
  ['wrong-source', { head_sha: 'b'.repeat(40) }],
  ['wrong-branch', { head_branch: 'feature' }],
  ['PR-run', { event: 'pull_request' }],
  ['another-workflow', { path: '.github/workflows/other.yml' }],
  ['another-repository', { repository: { full_name: 'other/repo' } }],
  ['fork-source', { head_repository: { full_name: 'fork/repo' } }],
  ['invalid-attempt', { run_attempt: 0 }],
])
  test(`rejects ${label} as authorization to execute candidate release code`, async () => {
    const f = fixture({ listed: [successfulRun(source, overrides)] });
    await assert.rejects(
      f.verify,
      /does not belong to the reviewed main source/,
    );
    assert.equal(f.calls.length, 1);
  });

for (const [status, conclusion] of [
  ['in_progress', null],
  ['queued', null],
  ['completed', 'failure'],
  ['completed', 'cancelled'],
  ['completed', 'skipped'],
])
  test(`an older success cannot hide the newest ${status}/${conclusion} run`, async () => {
    const old = successfulRun(source);
    const latest = successfulRun(source, {
      id: 13,
      run_number: 10,
      status,
      conclusion,
    });
    const f = fixture({ listed: [latest, old], current: latest });
    await assert.rejects(
      f.verify,
      /latest main-source CI attempt has not succeeded/,
    );
    assert.equal(f.calls.at(-1).path.endsWith('/13'), true);
  });

test('a rerun starting after the listing cannot reuse the listed successful attempt', async () => {
  const f = fixture({
    current: successfulRun(source, {
      run_attempt: 2,
      status: 'in_progress',
      conclusion: null,
    }),
  });
  await assert.rejects(
    f.verify,
    /latest main-source CI attempt has not succeeded/,
  );
});

test('never memoizes a previous successful admission across calls', async () => {
  const current = successfulRun(source);
  const f = fixture({ current });
  await f.verify();
  current.status = 'in_progress';
  current.conclusion = null;
  await assert.rejects(
    f.verify,
    /latest main-source CI attempt has not succeeded/,
  );
  assert.equal(f.calls.length, 6);
});

test('a distinct newer run appearing after detail read blocks publication', async () => {
  const old = successfulRun(source);
  const pending = successfulRun(source, {
    id: 13,
    run_number: 10,
    status: 'in_progress',
    conclusion: null,
  });
  let calls = 0;
  const request = async ({ query }) => {
    calls += 1;
    return encode(
      query
        ? {
            total_count: calls === 1 ? 1 : 2,
            workflow_runs: calls === 1 ? [old] : [pending, old],
          }
        : old,
    );
  };
  await assert.rejects(
    () => assertSuccessfulStudioSourceCI(source, { request }),
    /CI changed during release admission/,
  );
  assert.equal(calls, 3);
});

test('a stale confirming list cannot conceal a rerun from the final detail read', async () => {
  const successful = successfulRun(source);
  let details = 0;
  const request = async ({ query }) => {
    if (query) return encode({ total_count: 1, workflow_runs: [successful] });
    details += 1;
    return encode(
      details === 1
        ? successful
        : successfulRun(source, {
            run_attempt: 2,
            status: 'in_progress',
            conclusion: null,
          }),
    );
  };
  await assert.rejects(
    () => assertSuccessfulStudioSourceCI(source, { request }),
    /CI changed during release admission/,
  );
  assert.equal(details, 2);
});

for (const [label, inputs] of [
  ['missing', { listed: [] }],
  ['truncated', { total: 2 }],
  ['over-bound', { total: 101 }],
  ['duplicate', { listed: [successfulRun(source), successfulRun(source)] }],
])
  test(`refuses ${label} CI history rather than treating it as successful`, async () => {
    await assert.rejects(fixture(inputs).verify, /CI history/);
  });

test('propagates a failed API request and rejects malformed JSON', async () => {
  const failure = new Error('API unavailable');
  await assert.rejects(
    () =>
      assertSuccessfulStudioSourceCI(source, {
        request: async () => {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  await assert.rejects(
    () =>
      assertSuccessfulStudioSourceCI(source, {
        request: async () => ({ bytes: Buffer.from('{') }),
      }),
    /Invalid release CI evidence/,
  );
});
