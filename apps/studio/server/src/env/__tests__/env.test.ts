import { afterEach, describe, expect, it, vi } from 'vitest';

import { readEnv } from '../../env.ts';
import { DEV, DEV_DATABASE_URL, DEV_S3_ENDPOINT } from '../catalogue.ts';

// The suite runs with the committed .env.development loaded (see
// vitest.config.ts), so it starts from the same environment `pnpm dev` gets
// and stubs away from it.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('development defaults', () => {
  it('configures the whole stack from the committed file', () => {
    const env = readEnv();
    expect(env.db).toEqual({ url: DEV_DATABASE_URL });
    expect(env.s3?.endpoint).toBe(DEV_S3_ENDPOINT);
    expect(env.s3?.bucket).toBe(DEV.s3Bucket);
    expect(env.auth?.baseUrl).toBe(DEV.baseUrl);
    expect(env.production).toBe(false);
  });

  it('delivers magic links to the console', () => {
    expect(readEnv().auth?.mailer).toEqual({ kind: 'console' });
  });

  it('tolerates the unpaired EMAIL_FROM it supplies for the Mailpit loop', () => {
    // .env.development sets EMAIL_FROM but no SMTP_URL, so that adding
    // SMTP_URL alone locally completes the pair.
    expect(readEnv().auth?.mailer).toEqual({ kind: 'console' });
  });

  it('completes the SMTP pair when only SMTP_URL is added', () => {
    vi.stubEnv('SMTP_URL', 'smtp://localhost:1025');
    expect(readEnv().auth?.mailer).toEqual({
      kind: 'smtp',
      url: 'smtp://localhost:1025',
      from: DEV.emailFrom,
    });
  });
});

describe('the development marker', () => {
  it('is refused alongside NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => readEnv()).toThrow(/STUDIO_DEV_DEFAULTS must not be set/);
  });

  it('is what enables the console mailer, not NODE_ENV', () => {
    // Without the marker and without SMTP, sends refuse — even though
    // NODE_ENV is not production. A deployment that forgot NODE_ENV still
    // never logs a sign-in link.
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', '');
    expect(readEnv().auth?.mailer).toEqual({ kind: 'refuse' });
  });

  it('is what tolerates an unpaired EMAIL_FROM, not NODE_ENV', () => {
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', 'signin@studio.example');
    vi.stubEnv('SMTP_URL', '');
    expect(() => readEnv()).toThrow(/SMTP_URL is required when EMAIL_FROM/);
  });
});

describe('database and auth', () => {
  it('uses DATABASE_URL when set', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@db.internal:5432/studio');
    expect(readEnv().db).toEqual({
      url: 'postgres://app@db.internal:5432/studio',
    });
  });

  it('is unconfigured without DATABASE_URL, and auth follows it down', () => {
    vi.stubEnv('DATABASE_URL', '');
    const env = readEnv();
    expect(env.db).toBeUndefined();
    expect(env.auth).toBeUndefined();
  });

  it('requires the signing secret whenever a database is configured', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect(() => readEnv()).toThrow(/BETTER_AUTH_SECRET is required/);
  });

  it('requires the browser-facing origin whenever auth is enabled', () => {
    vi.stubEnv('PUBLIC_URL', '');
    expect(() => readEnv()).toThrow(/PUBLIC_URL is required/);
  });

  it('splits TRUSTED_PROXIES and drops blank entries', () => {
    vi.stubEnv('TRUSTED_PROXIES', ' 10.0.0.0/8 , ,192.168.0.1 ');
    expect(readEnv().auth?.trustedProxies).toEqual([
      '10.0.0.0/8',
      '192.168.0.1',
    ]);
  });

  it('treats an all-blank TRUSTED_PROXIES as unset', () => {
    vi.stubEnv('TRUSTED_PROXIES', ' , ');
    expect(readEnv().auth?.trustedProxies).toBeUndefined();
  });
});

describe('object storage', () => {
  it('is undefined when no S3 variable is set', () => {
    for (const name of [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]) {
      vi.stubEnv(name, '');
    }
    expect(readEnv().s3).toBeUndefined();
  });

  it('refuses a partial configuration rather than half-configuring a store', () => {
    vi.stubEnv('S3_BUCKET', '');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', '');
    expect(() => readEnv()).toThrow(
      /Incomplete S3 configuration; missing: bucket, secretAccessKey/,
    );
  });

  it('rejects a non-URL endpoint', () => {
    vi.stubEnv('S3_ENDPOINT', 'localhost:9100');
    expect(() => readEnv()).toThrow();
  });
});

describe('process configuration', () => {
  it('falls back to port 3000 and 0.0.0.0', () => {
    const env = readEnv();
    expect(env.port).toBe(3000);
    expect(env.host).toBe('0.0.0.0');
  });

  it('coerces a numeric PORT', () => {
    vi.stubEnv('PORT', '8080');
    expect(readEnv().port).toBe(8080);
  });

  it('rejects a non-numeric PORT', () => {
    vi.stubEnv('PORT', 'http');
    expect(() => readEnv()).toThrow();
  });

  it('rejects a PORT outside the valid range', () => {
    vi.stubEnv('PORT', '70000');
    expect(() => readEnv()).toThrow();
  });
});
