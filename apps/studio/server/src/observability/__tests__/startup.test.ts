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
    // Static-asset probing can finish while fatal shutdown drains. Assert the
    // fatal diagnostic itself; an unrelated warning may be emitted after it.
    expect(
      records.filter((record) => record.code === 'STUDIO_PROCESS_FAILED'),
    ).toEqual([
      {
        level: 50,
        time: expect.any(String),
        event: 'operational',
        code: 'STUDIO_PROCESS_FAILED',
      },
    ]);
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

  it.each([
    { STUDIO_METRICS_TOKEN: 'secret\n' },
    {
      DATABASE_URL: 'postgres://localhost:1/studio',
      BETTER_AUTH_SECRET: 'startup-only-authentication-secret-32-characters',
      PUBLIC_URL: 'https://studio.example.test',
      SMTP_URL: 'smtp://127.0.0.1:1',
      EMAIL_FROM: 'Invalid <private-sender-canary>',
    },
  ])(
    'exits the actual Node entrypoint with one fixed diagnostic for invalid configuration: %j',
    (configuration) => {
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../index.ts', import.meta.url))],
        {
          env: { NODE_ENV: 'production', ...configuration },
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
    },
  );
});
