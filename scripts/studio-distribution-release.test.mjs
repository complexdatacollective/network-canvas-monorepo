import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runStudioDistributionRelease } from './studio-distribution-release.mjs';

const source = 'a'.repeat(40);
const workflow =
  'complexdatacollective/network-canvas-monorepo/.github/workflows/studio-release.yml@refs/heads/main';

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'studio-release-caller-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'complexdatacollective/network-canvas-monorepo',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: workflow,
    GITHUB_SHA: source,
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    ...overrides,
  };
  const calls = [];
  let tools;
  let paths;
  return {
    env,
    root,
    get tools() {
      return tools;
    },
    calls,
    run: () =>
      runStudioDistributionRelease(
        { cwd: root, env, parentDirectory: root },
        {
          install: async (parent) => {
            assert.equal(
              parent.startsWith(`${root}/studio-release-workflow-`),
              true,
            );
            tools = join(parent, 'tools');
            paths = Object.fromEntries(
              ['cosign', 'crane', 'syft'].map((name) => [
                name,
                join(tools, name),
              ]),
            );
            mkdirSync(tools);
            return { directory: tools, paths };
          },
          publish: async (input) => {
            calls.push(input);
            return { source: input.source, tag: `studio/${input.source}` };
          },
        },
      ),
  };
}

test('passes only workflow-bound source, tagger and absolute pinned tools', async (t) => {
  const f = fixture(t, { STUDIO_OLDEST_SUPPORTED_SOURCE: 'b'.repeat(40) });
  assert.deepEqual(await f.run(), {
    source,
    tag: `studio/${source}`,
  });
  assert.equal(f.calls.length, 1);
  const tools = f.tools;
  assert.deepEqual(f.calls[0], {
    cwd: f.root,
    source,
    oldestSupportedSource: 'b'.repeat(40),
    tagger: {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    },
    executables: {
      cosign: join(tools, 'cosign'),
      crane: join(tools, 'crane'),
      syft: join(tools, 'syft'),
    },
  });
  assert.equal(existsSync(tools), false);
});

for (const [name, value] of [
  ['GITHUB_ACTIONS', 'false'],
  ['GITHUB_EVENT_NAME', 'push'],
  ['GITHUB_REPOSITORY', 'attacker/repository'],
  ['GITHUB_REF', 'refs/heads/feature'],
  [
    'GITHUB_WORKFLOW_REF',
    'complexdatacollective/network-canvas-monorepo/.github/workflows/other.yml@refs/heads/main',
  ],
  ['GITHUB_SHA', 'not-a-source'],
  ['RUNNER_OS', 'Windows'],
  ['RUNNER_ARCH', 'ARM64'],
  ['STUDIO_OLDEST_SUPPORTED_SOURCE', 'not-a-source'],
])
  test(`refuses wrong ${name} before installing tools`, async (t) => {
    const f = fixture(t, { [name]: value });
    await assert.rejects(f.run, /workflow identity is invalid/);
    assert.equal(f.tools, undefined);
    assert.deepEqual(f.calls, []);
  });

test('a publication failure propagates and still removes pinned tools', async (t) => {
  const f = fixture(t);
  const failure = new Error('synthetic publication refusal');
  let tools;
  await assert.rejects(
    () =>
      runStudioDistributionRelease(
        { cwd: f.root, env: f.env, parentDirectory: f.root },
        {
          install: async (parent) => {
            tools = join(parent, 'tools');
            mkdirSync(tools);
            return {
              directory: tools,
              paths: Object.fromEntries(
                ['cosign', 'crane', 'syft'].map((name) => [
                  name,
                  join(tools, name),
                ]),
              ),
            };
          },
          publish: async () => {
            throw failure;
          },
        },
      ),
    (error) => error === failure,
  );
  assert.equal(existsSync(tools), false);
});

test('refuses tool paths outside its private workspace without deleting them', async (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'outside-tools');
  mkdirSync(outside);
  await assert.rejects(
    () =>
      runStudioDistributionRelease(
        { cwd: f.root, env: f.env, parentDirectory: f.root },
        {
          install: async () => ({
            directory: outside,
            paths: Object.fromEntries(
              ['cosign', 'crane', 'syft'].map((name) => [
                name,
                join(outside, name),
              ]),
            ),
          }),
          publish: async () => assert.fail('publication must not run'),
        },
      ),
    /Pinned Studio release tools are unavailable/,
  );
  assert.equal(existsSync(outside), true);
});

test('the executable refuses non-workflow use without exposing details', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/studio-distribution-release.mjs'],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 5_000,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Studio distribution release failed.\n');
});
