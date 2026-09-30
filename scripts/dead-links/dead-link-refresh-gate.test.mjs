import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

const gatePath = fileURLToPath(
  new URL('./dead-link-refresh-gate.mjs', import.meta.url),
);

function runGate(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [gatePath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}

function report({
  cache = { hits: 0 },
  failures = [],
  refusals = { count: 0, links: [], stale: [] },
  summary,
}) {
  return {
    cache,
    failures,
    refusals,
    results: failures,
    schemaVersion: 2,
    startedAt: '2026-09-11T04:00:00.000Z',
    summary,
    target: 'https://documentation.networkcanvas.com/',
  };
}

const deadLink = {
  error: 'HTTP 404',
  finalUrl: 'https://example.test/gone',
  foundOn: ['https://documentation.networkcanvas.com/en'],
  kind: 'http-error',
  ok: false,
  status: 404,
  url: 'https://example.test/gone',
};

async function withReports(bodies, assertion) {
  const directory = await mkdtemp(join(tmpdir(), 'dead-link-gate-'));
  try {
    const paths = [];
    for (const [index, body] of bodies.entries()) {
      const path = join(directory, `report-${index}.json`);
      await writeFile(path, JSON.stringify(body));
      paths.push(path);
    }
    await assertion(paths);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('a clean crawl of both sites passes', async () => {
  await withReports(
    [
      report({
        summary: { checked: 391, discovered: 391, failed: 0, passed: 391 },
      }),
      report({
        summary: { checked: 97, discovered: 97, failed: 0, passed: 97 },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /391 checked, 0 dead/);
    },
  );
});

test('a dead link fails the run and is annotated', async () => {
  await withReports(
    [
      report({
        failures: [deadLink],
        summary: { checked: 391, discovered: 391, failed: 1, passed: 390 },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.equal(result.code, 1);
      assert.match(result.stdout, /::error title=Dead link::/);
    },
  );
});

test('a failure the summary does not count still fails the run', async () => {
  // The gate exists so a failure cannot be swallowed. If the tally and the
  // listed failures disagree, the larger number decides — erring towards a
  // red run rather than letting the smaller number wave a dead link through.
  await withReports(
    [
      report({
        failures: [deadLink],
        summary: { checked: 391, discovered: 391, failed: 0, passed: 391 },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.equal(result.code, 1, 'must not exit 0 with a listed failure');
    },
  );
});

test('a crawl that checked nothing is refused as a non-event', async () => {
  // A browser that never launched, or a site that served no links, produces a
  // report with no failures. That is not a clean run and must not read as one.
  for (const summary of [
    { checked: 0, discovered: 0, failed: 0, passed: 0 },
    { discovered: 391, failed: 0, passed: 391 },
  ]) {
    await withReports([report({ summary })], async (paths) => {
      const result = await runGate(paths);
      assert.notEqual(result.code, 0, JSON.stringify(summary));
    });
  }
});

test('a missing failure count is refused rather than read as zero', async () => {
  await withReports(
    [
      report({
        failures: [deadLink],
        summary: { checked: 391, discovered: 391, passed: 390 },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.notEqual(result.code, 0);
    },
  );
});

test('refusals are listed but do not by themselves fail the run', async () => {
  const refusal = {
    error: 'HTTP 403',
    finalUrl: 'https://onlinelibrary.wiley.com/doi/10.1007/x',
    foundOn: ['https://documentation.networkcanvas.com/en'],
    kind: 'refused',
    ok: false,
    status: 403,
    url: 'https://doi.org/10.1007/x',
  };
  await withReports(
    [
      report({
        refusals: { count: 1, links: [refusal], stale: [] },
        summary: {
          checked: 391,
          discovered: 391,
          failed: 0,
          passed: 390,
          refused: 1,
        },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /1 refused/);
      // Listed, so a count that climbs is visible to a person reading the run.
      assert.match(
        result.stdout,
        /refused 403 https:\/\/doi\.org\/10\.1007\/x/,
      );
    },
  );
});

test('a listed link that is no longer refused is reported, not failed', async () => {
  // These walls are intermittent, so a publisher letting us through must not
  // turn the run red — but the entry should be prunable, so it is named.
  await withReports(
    [
      report({
        refusals: {
          count: 0,
          links: [],
          stale: ['https://doi.org/10.1007/x'],
        },
        summary: {
          checked: 391,
          discovered: 391,
          failed: 0,
          passed: 391,
          refused: 0,
        },
      }),
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /no longer refused, prunable/);
    },
  );
});

test('a report with no refusal count is refused', async () => {
  await withReports(
    [
      {
        cache: { hits: 0 },
        failures: [],
        results: [],
        schemaVersion: 2,
        startedAt: '2026-09-11T04:00:00.000Z',
        summary: { checked: 391, discovered: 391, failed: 0, passed: 391 },
        target: 'https://documentation.networkcanvas.com/',
      },
    ],
    async (paths) => {
      const result = await runGate(paths);
      assert.notEqual(result.code, 0);
    },
  );
});

test('a missing or unreadable report fails loudly', async () => {
  const absent = await runGate([join(tmpdir(), 'does-not-exist-12345.json')]);
  assert.notEqual(absent.code, 0);

  const noArguments = await runGate([]);
  assert.equal(noArguments.code, 2);
});
