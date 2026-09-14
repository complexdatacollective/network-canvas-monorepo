import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { readEnv } from '../../env.ts';

describe('startup diagnostic privacy', () => {
  it.each([
    'throw new Error("secret-payload-canary")',
    'void Promise.reject(new Error("secret-payload-canary"))',
  ])('contains a fatal process failure after startup: %s', (failure) => {
    const entry = new URL('../../index.ts', import.meta.url).href;
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(entry)}); ${failure};`,
      ],
      {
        env: { NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1' },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    const records = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.at(-1)).toEqual({
      level: 50,
      time: expect.any(String),
      event: 'operational',
      code: 'STUDIO_PROCESS_FAILED',
    });
    expect(child.stdout).not.toContain('secret-payload-canary');
  });

  it('suppresses the environment library raw validation diagnostic', () => {
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.stubEnv('STUDIO_METRICS_TOKEN', 'secret\n');
    try {
      expect(() => readEnv()).toThrow('Invalid environment variables');
      expect(diagnostic).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      diagnostic.mockRestore();
    }
  });

  it('exits the actual Node entrypoint with one fixed diagnostic for invalid configuration', () => {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../../index.ts', import.meta.url))],
      {
        env: { NODE_ENV: 'production', STUDIO_METRICS_TOKEN: 'secret\n' },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    const lines = child.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      level: 50,
      time: expect.any(String),
      event: 'operational',
      code: 'STUDIO_CONFIGURATION_INVALID',
    });
  });
});
