import assert from 'node:assert/strict';

import { test } from 'vitest';

import { waitForRegistryVersions } from './wait-for-npm-versions.mjs';

const INTERVIEW = { name: '@codaco/interview', version: '11.0.0' };

// A registry whose answers are scripted call by call: a list of versions, an
// HTTP status, or an Error to throw.
function scriptedRegistry(answers) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') {
      return new Response('', { status: answer });
    }
    return Response.json({
      versions: Object.fromEntries(answer.map((v) => [v, {}])),
    });
  };
  return { fetchImpl, calls };
}

function clock() {
  let time = 0;
  const sleeps = [];
  return {
    now: () => time,
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
    sleeps,
  };
}

test('returns once npm starts serving a version it served stale at first', async () => {
  const { fetchImpl, calls } = scriptedRegistry([
    ['10.0.0'],
    ['10.0.0', '11.0.0'],
  ]);
  const { now, sleep, sleeps } = clock();
  await waitForRegistryVersions([INTERVIEW], {
    fetchImpl,
    now,
    sleep,
    log: () => {},
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [15_000]);
});

test('does not wait when every version is already served', async () => {
  const { fetchImpl } = scriptedRegistry([['11.0.0']]);
  const { now, sleep, sleeps } = clock();
  await waitForRegistryVersions([INTERVIEW], {
    fetchImpl,
    now,
    sleep,
    log: () => {},
  });
  assert.deepEqual(sleeps, []);
});

test('retries registry errors like a missing version', async () => {
  const { fetchImpl } = scriptedRegistry([
    new Error('socket hang up'),
    503,
    ['11.0.0'],
  ]);
  const { now, sleep, sleeps } = clock();
  await waitForRegistryVersions([INTERVIEW], {
    fetchImpl,
    now,
    sleep,
    log: () => {},
  });
  assert.equal(sleeps.length, 2);
});

test('gives up at the deadline and names what npm still lacks', async () => {
  const { fetchImpl } = scriptedRegistry([['10.0.0']]);
  const { now, sleep } = clock();
  await assert.rejects(
    waitForRegistryVersions([INTERVIEW], {
      fetchImpl,
      now,
      sleep,
      timeoutMs: 60_000,
      log: () => {},
    }),
    /Gave up waiting for npm after 60s: npm does not serve @codaco\/interview@11\.0\.0 yet/,
  );
});
