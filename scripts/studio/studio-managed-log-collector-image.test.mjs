import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const dockerfilePath = resolve(
  root,
  'apps/studio/deployment/managed/managed-log-collector.Dockerfile',
);
const artifactPath = resolve(
  root,
  'dist/studio-managed-log-collector/collector.mjs',
);
const pinnedNode =
  'node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d';

test('collector image is pinned, revision-bound, and unprivileged', () => {
  const source = readFileSync(dockerfilePath, 'utf8');
  assert.equal(source.match(new RegExp(`FROM ${pinnedNode}`, 'g'))?.length, 2);
  assert.match(source, /ARG SOURCE_REVISION/);
  assert.match(source, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(
    source,
    /org\.opencontainers\.image\.revision="\$\{SOURCE_REVISION\}"/,
  );
  assert.match(source, /COPY --from=builder --chown=node:node/);
  assert.match(source, /USER node\n/);

  const runner = source.slice(source.lastIndexOf(`FROM ${pinnedNode}`));
  assert.doesNotMatch(runner, /COPY \. \./);
  assert.doesNotMatch(runner, /npm|pnpm|node_modules/);
  assert.match(runner, /ENTRYPOINT \["node", "\/app\/collector\.mjs"\]/);
});

test('bundled runtime has a closed module graph and fails closed offline', () => {
  execFileSync('pnpm', ['run', 'studio:managed-log-collector:build'], {
    cwd: root,
    env: { ...process.env, CI: 'true' },
    stdio: 'pipe',
  });
  const artifact = readFileSync(artifactPath, 'utf8');
  const moduleSpecifiers = [
    ...artifact.matchAll(/^import .* from ["']([^"']+)["'];$/gm),
    ...artifact.matchAll(/__require\(["']([^"']+)["']\)/g),
  ].map((match) => match[1]);
  const builtins = new Set(
    builtinModules.flatMap((specifier) => [specifier, `node:${specifier}`]),
  );
  assert.ok(moduleSpecifiers.length > 0);
  assert.deepEqual(
    moduleSpecifiers.filter((specifier) => !builtins.has(specifier)),
    [],
  );

  const result = spawnSync(process.execPath, [artifactPath], {
    cwd: root,
    env: {},
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'STUDIO_COLLECTOR_CONFIGURATION_INVALID\n');
});
