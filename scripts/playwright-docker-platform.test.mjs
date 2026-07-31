import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const helper = new URL('./playwright-docker-platform.sh', import.meta.url)
  .pathname;

function resolvePlatform(architecture) {
  return execFileSync(
    'bash',
    [
      '-c',
      `source "$1"; playwright_docker_platform_for_arch "$2"; printf '%s\\t%s' "$PLAYWRIGHT_DOCKER_PLATFORM" "$PLAYWRIGHT_DOCKER_VOLUME_ARCH"`,
      'bash',
      helper,
      architecture,
    ],
    { encoding: 'utf8' },
  );
}

test('maps Docker ARM64 architecture aliases to native ARM64', () => {
  for (const architecture of ['arm64', 'aarch64']) {
    assert.equal(resolvePlatform(architecture), 'linux/arm64\tarm64');
  }
});

test('maps Docker x64 architecture aliases to native AMD64', () => {
  for (const architecture of ['amd64', 'x86_64']) {
    assert.equal(resolvePlatform(architecture), 'linux/amd64\tamd64');
  }
});

test('rejects unknown Docker architectures', () => {
  const result = spawnSync(
    'bash',
    [
      '-c',
      'source "$1"; playwright_docker_platform_for_arch "$2"',
      'bash',
      helper,
      'riscv64',
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported Docker server architecture/);
});
