import { afterEach, describe, expect, it, vi } from 'vitest';

import { isLocalDatabase, readEnv } from '../../env.ts';
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
    expect(env.devDefaults).toBe(true);
  });

  it('delivers magic links to the console, for the process that sends them', () => {
    expect(readEnv({ withMail: true }).mail).toEqual({ kind: 'console' });
  });

  it('tolerates the unpaired EMAIL_FROM it supplies for the Mailpit loop', () => {
    // .env.development sets EMAIL_FROM but no SMTP_URL, so that adding
    // SMTP_URL alone locally completes the pair.
    expect(readEnv({ withMail: true }).mail).toEqual({ kind: 'console' });
  });

  it('completes the SMTP pair when only SMTP_URL is added', () => {
    vi.stubEnv('SMTP_URL', 'smtp://localhost:1025');
    expect(readEnv({ withMail: true }).mail).toEqual({
      kind: 'smtp',
      url: 'smtp://localhost:1025',
      from: DEV.emailFrom,
    });
  });
});

// Only the worker sends mail (#1895), so only the worker's read may see the
// transport: the web process must not be able to construct one by accident,
// and a deployment's SMTP credentials must not be readable from a process
// that has no use for them.
describe('the mail transport', () => {
  it('is withheld from a read that did not ask for it', () => {
    vi.stubEnv('SMTP_URL', 'smtp://user:password@smtp.example.org:587');
    vi.stubEnv('EMAIL_FROM', 'studio@studio.example');
    expect(readEnv().mail).toBeUndefined();
    expect(readEnv({ withMail: true }).mail).toEqual({
      kind: 'smtp',
      url: 'smtp://user:password@smtp.example.org:587',
      from: 'studio@studio.example',
    });
  });

  it('does not refuse a half configuration it was not asked to read', () => {
    // The pairing rule belongs to the process that would send through it. A
    // deployment that half-configures mail must not take the web process down
    // with a variable the web process never uses.
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', 'signin@studio.example');
    vi.stubEnv('SMTP_URL', '');
    expect(readEnv().mail).toBeUndefined();
    expect(() => readEnv({ withMail: true })).toThrow(
      /SMTP_URL is required when EMAIL_FROM/,
    );
  });

  it('leaves magic-link sign-in enabled with no transport configured', () => {
    // Delivery is the worker's, and with none configured a sign-in email
    // waits on the queue (#1895). What the capability reports is whether the
    // method exists, which is a question about auth alone.
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('EMAIL_FROM', '');
    const env = readEnv({ withMail: true });
    expect(env.auth).toBeDefined();
    expect(env.mail).toEqual({ kind: 'console' });

    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    const deployed = readEnv({ withMail: true });
    expect(deployed.auth).toBeDefined();
    expect(deployed.mail).toEqual({ kind: 'refuse' });
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
    const env = readEnv({ withMail: true });
    expect(env.devDefaults).toBe(false);
    expect(env.mail).toEqual({ kind: 'refuse' });
  });

  it('is what enables the console mailer, not NODE_ENV', () => {
    // Without the marker and without SMTP, sends refuse — even though
    // NODE_ENV is not production. A deployment that forgot NODE_ENV still
    // never logs a sign-in link.
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', '');
    expect(readEnv({ withMail: true }).mail).toEqual({ kind: 'refuse' });
  });

  it('is what tolerates an unpaired EMAIL_FROM, not NODE_ENV', () => {
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', 'signin@studio.example');
    vi.stubEnv('SMTP_URL', '');
    expect(() => readEnv({ withMail: true })).toThrow(
      /SMTP_URL is required when EMAIL_FROM/,
    );
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

// Every Studio pool runs as a role it pins through pg's `options` startup
// parameter, and node-postgres lets a connection string's own `options`
// override it — which would run the web process and the worker as the
// connecting login, in development the superuser that row-level security does
// not apply to.
describe('the pinned role', () => {
  it('refuses a DATABASE_URL that would override it', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://postgres:spike@127.0.0.1:54318/studio_dev?options=-c%20role%3Dpostgres',
    );
    expect(() => readEnv()).toThrow(
      /DATABASE_URL must not carry an `options` parameter/,
    );
    // The message has to say what to take out, because the parameter is more
    // often inherited from a hosting provider's string than typed by hand.
    expect(() => readEnv()).toThrow(/Remove `options` from the connection/);
  });

  it('refuses it among other connection parameters', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://postgres:spike@127.0.0.1:54318/studio_dev?application_name=studio&options=-csearch_path%3Dpublic',
    );
    expect(() => readEnv()).toThrow(
      /DATABASE_URL must not carry an `options` parameter/,
    );
  });

  it('accepts a connection string that leaves the parameter alone', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://postgres:spike@127.0.0.1:54318/studio_dev?application_name=studio',
    );
    expect(readEnv().db?.url).toContain('application_name=studio');
  });

  it('leaves a DSN it cannot parse to pg rather than refusing it', () => {
    // pg accepts connection strings `new URL` does not — a Unix socket host,
    // for one. Refusing what cannot be read would refuse those, so the check
    // only answers for a string the parameter is visible in.
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv('DATABASE_URL', 'host=/var/run/postgresql dbname=studio_dev');
    expect(readEnv().db?.url).toBe(
      'host=/var/run/postgresql dbname=studio_dev',
    );
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
