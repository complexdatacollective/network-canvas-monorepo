import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isLocalDatabase, readEnv, readMigrationDatabase } from '../../env.ts';
import { DEV, DEV_DATABASE_URL, DEV_S3_ENDPOINT } from '../catalogue.ts';

// The suite runs with the committed .env.development loaded (see
// vitest.config.ts), so it starts from the same environment `pnpm dev` gets
// and stubs away from it.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('development defaults', () => {
  it('configures the whole stack from the committed file', () => {
    // Integration runs can point DATABASE_URL at an isolated local container.
    // This unit test specifically describes the committed defaults, so load
    // those values explicitly rather than assuming the caller exported none.
    const defaults = parseEnv(
      readFileSync(
        new URL('../../../.env.development', import.meta.url),
        'utf8',
      ),
    );
    for (const [name, value] of Object.entries(defaults))
      vi.stubEnv(name, value);
    const env = readEnv();
    expect(env.db).toEqual({ url: DEV_DATABASE_URL });
    expect(env.s3?.endpoint).toBe(DEV_S3_ENDPOINT);
    expect(env.s3?.bucket).toBe(DEV.s3Bucket);
    expect(env.auth?.baseUrl).toBe(DEV.baseUrl);
    expect(env.devDefaults).toBe(true);
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

describe('migration environment', () => {
  it('requires a database even when application validation is disabled', () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true');
    vi.stubEnv('DATABASE_URL', '');
    expect(() => readMigrationDatabase()).toThrow();
  });

  it('reads only the database for an offline migration command', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://operator@localhost/studio');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('PUBLIC_URL', '');
    vi.stubEnv('SMTP_URL', '');
    expect(readMigrationDatabase()).toEqual({
      url: 'postgres://operator@localhost/studio',
    });
  });
});

describe('the development marker', () => {
  it('is refused alongside NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => readEnv()).toThrow(/STUDIO_DEV_DEFAULTS must not be set/);
  });

  it('is refused with no NODE_ENV at all, not only against production', () => {
    // The deployment that accidentally sources `.env.development` is the same
    // one likely to have forgotten `NODE_ENV=production`, so an absent
    // NODE_ENV must not be a way past this guard.
    vi.stubEnv('NODE_ENV', '');
    expect(() => readEnv()).toThrow(/STUDIO_DEV_DEFAULTS must not be set/);
  });

  it('is refused against a database that is not this machine', () => {
    // An exported DATABASE_URL beats the committed file, so the marker and a
    // remote database can meet without anyone choosing it — and the lane
    // would apply its schema there under a publicly-known signing secret.
    vi.stubEnv('DATABASE_URL', 'postgres://app@db.internal:5432/studio');
    expect(() => readEnv()).toThrow(/does not point at a local database/);
  });

  it('allows the loopback forms the dev container is reachable at', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      vi.stubEnv('DATABASE_URL', `postgres://postgres:spike@${host}:54318/x`);
      expect(readEnv().db?.url).toContain(host);
    }
  });

  it('leaves a remote database alone once the marker is gone', () => {
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    // Without the marker the file's unpaired EMAIL_FROM is a deployment
    // mistake in its own right, so this is the whole lane being left behind.
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv('DATABASE_URL', 'postgres://app@db.internal:5432/studio');
    const env = readEnv();
    expect(env.devDefaults).toBe(false);
    expect(env.auth?.mailer).toEqual({ kind: 'refuse' });
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
    // Loopback because the committed development marker is still in play
    // here, and that lane refuses anything else.
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/other');
    expect(readEnv().db).toEqual({
      url: 'postgres://app@localhost:5433/other',
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

  it('refuses a signing secret too short to be a generated one', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'changeme');
    expect(() => readEnv()).toThrow();
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

describe('OAuth sign-in providers', () => {
  it('is empty when no provider variables are set', () => {
    expect(readEnv().auth?.socialProviders).toEqual({});
  });

  it('resolves a complete Google pair', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-secret');
    expect(readEnv().auth?.socialProviders.google).toEqual({
      clientId: 'google-id',
      clientSecret: 'google-secret',
    });
  });

  it('refuses half a Google pair rather than dropping the provider', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-id');
    expect(() => readEnv()).toThrow(
      /Incomplete Google OAuth configuration; missing: GOOGLE_CLIENT_SECRET/,
    );
  });

  it('resolves Microsoft with its optional tenant', () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'ms-id');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'ms-secret');
    vi.stubEnv('MICROSOFT_TENANT_ID', 'contoso.onmicrosoft.com');
    expect(readEnv().auth?.socialProviders.microsoft).toEqual({
      clientId: 'ms-id',
      clientSecret: 'ms-secret',
      tenantId: 'contoso.onmicrosoft.com',
    });
  });

  it('refuses a tenant without the Microsoft credential pair', () => {
    vi.stubEnv('MICROSOFT_TENANT_ID', 'contoso.onmicrosoft.com');
    expect(() => readEnv()).toThrow(
      /Incomplete Microsoft OAuth configuration; missing: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET/,
    );
  });

  it('refuses half a pair even when auth is otherwise off', () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-secret');
    expect(() => readEnv()).toThrow(
      /Incomplete Google OAuth configuration; missing: GOOGLE_CLIENT_ID/,
    );
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

  it('keeps validating when SKIP_ENV_VALIDATION says not to skip', () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'false');
    vi.stubEnv('PORT', 'http');
    expect(() => readEnv()).toThrow();
  });
});

describe('the deployment mode', () => {
  it('is managed under the development defaults', () => {
    // So the local lane can develop the managed-only surfaces at all.
    expect(readEnv().deploymentMode).toBe('managed');
  });

  it('is self-hosted when the variable is unset', () => {
    vi.stubEnv('STUDIO_DEPLOYMENT_MODE', '');
    // The fail-closed direction, and the reason no default is declared in
    // variables.ts: a managed deployment that forgets the variable 404s its
    // own pricing page on the first smoke request, where the other default
    // would have an institution's own instance quietly publishing one.
    expect(readEnv().deploymentMode).toBe('self-hosted');
  });

  it('reads an explicit self-hosted value', () => {
    vi.stubEnv('STUDIO_DEPLOYMENT_MODE', 'self-hosted');
    expect(readEnv().deploymentMode).toBe('self-hosted');
  });

  it('refuses a value that is neither topology', () => {
    // A typo must not resolve to a topology by accident, in either
    // direction.
    vi.stubEnv('STUDIO_DEPLOYMENT_MODE', 'hosted');
    expect(() => readEnv()).toThrow();
  });
});

describe('the local-database judgement', () => {
  it('names this machine by the effective host, not the authority alone', () => {
    expect(isLocalDatabase('postgres://u:p@localhost:5432/db')).toBe(true);
    expect(isLocalDatabase('postgres://u:p@127.0.0.1/db')).toBe(true);
    expect(isLocalDatabase('postgres://u:p@[::1]/db')).toBe(true);
    expect(isLocalDatabase('postgres://u:p@db.example.org/db')).toBe(false);

    // node-postgres applies a `host` or `hostaddr` query parameter over the
    // authority and connects there; the automatic dev-boot reset must judge
    // the host it will actually reach.
    expect(
      isLocalDatabase('postgres://u:p@localhost/db?host=remote.example'),
    ).toBe(false);
    expect(
      isLocalDatabase('postgres://u:p@localhost/db?hostaddr=203.0.113.9'),
    ).toBe(false);
    expect(
      isLocalDatabase('postgres://u:p@localhost/db?host=/var/run/postgresql'),
    ).toBe(true);
    // Every host the string names must be this machine, whichever one the
    // parser would let win: a repeated parameter cannot smuggle a remote in
    // behind a local first value, and a remote authority stays remote.
    expect(
      isLocalDatabase(
        'postgres://u:p@localhost/db?host=localhost&host=remote.example',
      ),
    ).toBe(false);
    expect(
      isLocalDatabase(
        'postgres://u:p@localhost/db?host=remote.example&host=localhost',
      ),
    ).toBe(false);
    expect(
      isLocalDatabase('postgres://u:p@remote.example/db?host=localhost'),
    ).toBe(false);
    expect(isLocalDatabase('not a url')).toBe(false);
  });
});
