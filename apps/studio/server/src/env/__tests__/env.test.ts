import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse as parseConnectionString } from 'pg-connection-string';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testKeyringEntry } from '../../__tests__/support/secrets.ts';
import { isLocalDatabase, readEnv } from '../../env.ts';
import { KeyringError } from '../../secrets/keyring.ts';
import { parseRateLimitSpec } from '../../rate-limit/scopes.ts';
import {
  DEV,
  DEV_DATABASE_URL,
  DEV_REDIS_URL,
  DEV_S3_ENDPOINT,
  DEV_SMTP_URL,
} from '../catalogue.ts';
import { resolve } from '../resolve.ts';

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
    expect(env.redis).toBe(DEV_REDIS_URL);
    expect(env.devDefaults).toBe(true);
  });

  it('leaves development effectively unlimited while still using the store', () => {
    // Development is where a person reloads a page fifty times a minute and
    // where the suite signs in dozens of times; being refused for either would
    // only ever be noise. Every decision still goes through Valkey, so a
    // mistake in the limiter itself still shows up locally.
    const { rateLimits } = readEnv();
    expect(rateLimits.sign_in_address).toEqual(
      parseRateLimitSpec(DEV.rateLimit),
    );
    expect(rateLimits.storage_read).toEqual(parseRateLimitSpec(DEV.rateLimit));
  });

  it('takes a deployment’s own limits, and refuses a value it cannot read', () => {
    vi.stubEnv('RATE_LIMIT_SIGN_IN_EMAIL', '5/10m');
    expect(readEnv().rateLimits.sign_in_email).toEqual({
      max: 5,
      windowMs: 600_000,
    });
    vi.stubEnv('RATE_LIMIT_SIGN_IN_EMAIL', '5 per 10 minutes');
    expect(() => readEnv()).toThrow();
  });

  it('delivers magic links through the development stack’s mail sink', () => {
    // Mailpit, from docker-compose.dev.yml. The worker therefore exercises
    // the same SMTP path a deployment does, rather than a console mailer no
    // deployment ever runs, and the links are read at the Mailpit UI.
    expect(readEnv({ withMail: true }).mail).toEqual({
      kind: 'smtp',
      url: DEV_SMTP_URL,
      from: DEV.emailFrom,
    });
  });

  it('falls back to the console mailer when the sink is taken away', () => {
    // Working without Docker's mail sink leaves EMAIL_FROM unpaired, which
    // outside the development lane is a boot error.
    vi.stubEnv('SMTP_URL', '');
    expect(readEnv({ withMail: true }).mail).toEqual({ kind: 'console' });
  });

  it('turns telemetry off, where a deployment leaves it on', () => {
    expect(readEnv().telemetry).toBe(false);
    vi.stubEnv('STUDIO_TELEMETRY', '');
    expect(readEnv().telemetry).toBe(true);
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
    // The lane being left behind takes its mail sink with it: without either
    // variable a deployment has no transport and mail queues.
    vi.stubEnv('SMTP_URL', '');
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
    vi.stubEnv('SMTP_URL', '');
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

// The compose stack (#1909) delivers the database password as a file secret,
// so it is in neither `docker inspect` nor any process environment. What
// reaches the pools and pg-boss is still one connection string: the password
// is folded into DATABASE_URL here, once, at boot.
describe('the database password file', () => {
  const passwordFile = (contents: string): string => {
    const path = join(
      mkdtempSync(join(tmpdir(), 'studio-password-')),
      'postgres-password',
    );
    writeFileSync(path, contents);
    return path;
  };

  it('puts the file’s password into a URL that carries none', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('s3cret'));
    expect(readEnv().db).toEqual({
      url: 'postgres://app:s3cret@localhost:5433/studio',
    });
  });

  it('strips the trailing newline a shell redirection leaves', () => {
    // The Postgres image strips exactly this from the same file when it sets
    // the password, so a file written with `> file` must mean the same thing
    // on both sides of the connection.
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('s3cret\n'));
    expect(readEnv().db?.url).toBe(
      'postgres://app:s3cret@localhost:5433/studio',
    );
  });

  it('survives a password full of characters a URL gives meaning to', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('p@ss:w/ord#1?2'));
    // Read back the way node-postgres reads it, rather than asserting on the
    // encoded form: what matters is that pg ends up with the same bytes the
    // file held.
    expect(parseConnectionString(readEnv().db!.url).password).toBe(
      'p@ss:w/ord#1?2',
    );
  });

  it('refuses a URL that carries a password as well', () => {
    // There would be no way to say which was meant, and the wrong answer is
    // an authentication failure far from the configuration that caused it.
    vi.stubEnv('DATABASE_URL', 'postgres://app:inline@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('s3cret'));
    expect(() => readEnv()).toThrow(/carries a password and/);
  });

  it('refuses a connection form with nowhere to put a password', () => {
    // A libpq keyword string or a bare socket path has no authority to hold
    // one. Inserting nothing and carrying on would fail as an authentication
    // error with no hint that the file was never read.
    vi.stubEnv('DATABASE_URL', 'host=/var/run/postgresql dbname=studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('s3cret'));
    expect(() => readEnv()).toThrow(/not a URL a password can be inserted/);
  });

  it('refuses a file it cannot read, naming it', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', '/nonexistent/postgres-password');
    expect(() => readEnv()).toThrow(
      /\/nonexistent\/postgres-password, which could not be read/,
    );
  });

  it('refuses an empty file rather than connecting without a password', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost:5433/studio');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('\n'));
    expect(() => readEnv()).toThrow(/which is empty/);
  });

  it('refuses the file without a connection to insert it into', () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_PASSWORD_FILE', passwordFile('s3cret'));
    expect(() => readEnv()).toThrow(/but DATABASE_URL is not/);
  });

  it('leaves a URL that carries its own password alone', () => {
    vi.stubEnv('DATABASE_PASSWORD_FILE', '');
    expect(readEnv().db).toEqual({ url: DEV_DATABASE_URL });
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

  it('refuses it in a connection string with no host', () => {
    // The form that says "the default Unix socket", which a hosting provider's
    // socket configuration produces. `new URL` rejects it outright, so reading
    // the string that way left this one through — pg reads it perfectly well,
    // and would have sent the `options` it carries.
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://postgres:spike@/studio_dev?options=-crole%3Dpostgres',
    );
    expect(() => readEnv()).toThrow(
      /DATABASE_URL must not carry an `options` parameter/,
    );
  });

  it('accepts the two formats that cannot carry the parameter', () => {
    vi.stubEnv('STUDIO_DEV_DEFAULTS', '');
    vi.stubEnv('EMAIL_FROM', '');

    // The bare socket form: its whole grammar is a socket directory and a
    // database name, so there is nowhere in it to write a parameter.
    vi.stubEnv('DATABASE_URL', '/var/run/postgresql studio_dev');
    expect(readEnv().db?.url).toBe('/var/run/postgresql studio_dev');

    // A libpq keyword DSN, which node-postgres does not accept at all: its
    // parser reads the whole string as one long database name, so the
    // `options=` written here is inert rather than tolerated. Asserting the
    // `options` spelling specifically, because the review that asked for this
    // guard believed pg honoured it.
    vi.stubEnv(
      'DATABASE_URL',
      'host=/var/run/postgresql dbname=studio_dev options=-crole%3Dpostgres',
    );
    expect(readEnv().db?.url).toContain('options=');
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

// The keyring is the whole of Studio's key custody (#1900). It is read here,
// once, before anything is written under it: a deployment whose keyring is
// missing or malformed has to fail while it still has the one it was using,
// not halfway through writing a secret it will not be able to read back.
describe('the secrets keyring', () => {
  const configured = {
    DATABASE_URL: DEV_DATABASE_URL,
    BETTER_AUTH_SECRET: DEV.authSecret,
    PUBLIC_URL: DEV.baseUrl,
  };

  function refusal(act: () => unknown): string {
    try {
      act();
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected a refusal');
  }

  it('parses the fixture the committed development file supplies', () => {
    expect(readEnv().secrets?.currentId).toBe(DEV.secretsKey.split(':')[0]);
    expect(readEnv().secrets?.ids()).toEqual(['dev']);
  });

  it('refuses both variables at once rather than choosing one', () => {
    vi.stubEnv('STUDIO_SECRETS_KEY_FILE', '/run/secrets/studio_secrets_key');
    expect(() => readEnv()).toThrow(
      /STUDIO_SECRETS_KEY and STUDIO_SECRETS_KEY_FILE are both set; set exactly one/,
    );
  });

  it('reads the file when the file is the one that is set', () => {
    const read = vi.fn(() => `${testKeyringEntry('file-1')}\n`);
    const env = resolve(
      { ...configured, STUDIO_SECRETS_KEY_FILE: '/run/secrets/keyring' },
      { readSecretsFile: read },
    );
    expect(read).toHaveBeenCalledExactlyOnceWith('/run/secrets/keyring');
    expect(env.secrets?.currentId).toBe('file-1');
  });

  it('reads a keyring off disk, one entry per line', () => {
    // Through `readEnv`, so the real file read is what runs: the mounted
    // Compose secret is the deployed path, and an injected reader cannot say
    // whether it works.
    const directory = mkdtempSync(join(tmpdir(), 'studio-secrets-'));
    const path = join(directory, 'studio_secrets_key');
    try {
      writeFileSync(
        path,
        `${testKeyringEntry('file-1')}\n${testKeyringEntry('file-2')}\n`,
      );
      vi.stubEnv('STUDIO_SECRETS_KEY', '');
      vi.stubEnv('STUDIO_SECRETS_KEY_FILE', path);
      expect(readEnv().secrets?.ids()).toEqual(['file-1', 'file-2']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('names the path, and nothing the read said, when the file is unreadable', () => {
    vi.stubEnv('STUDIO_SECRETS_KEY', '');
    const path = join(tmpdir(), 'studio-secrets-key-that-is-not-there');
    vi.stubEnv('STUDIO_SECRETS_KEY_FILE', path);
    const message = refusal(() => readEnv());
    expect(message).toBe(`STUDIO_SECRETS_KEY_FILE could not be read: ${path}`);
    // A filesystem error can quote what it was reading, and this file is
    // entirely key material.
    expect(message).not.toContain('ENOENT');
  });

  it('refuses a database with no keyring, and says how to make one', () => {
    vi.stubEnv('STUDIO_SECRETS_KEY', '');
    const message = refusal(() => readEnv());
    expect(message).toContain('STUDIO_SECRETS_KEY_FILE');
    expect(message).toContain('STUDIO_SECRETS_KEY');
    expect(message).toContain('openssl rand -base64 32');
    expect(message).toContain('k1:<value>');
    // The one rule a self-hoster has to carry away from this refusal.
    expect(message).toContain(
      'Back the keyring up with the database: without it every stored secret is unreadable.',
    );
  });

  it('is undefined where there is no database to hold a secret', () => {
    vi.stubEnv('STUDIO_SECRETS_KEY', '');
    vi.stubEnv('DATABASE_URL', '');
    expect(readEnv().secrets).toBeUndefined();
  });

  it('is parsed even with no database, so a mistake in it surfaces early', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(readEnv().secrets?.currentId).toBe('dev');
    vi.stubEnv('STUDIO_SECRETS_KEY', 'k1:not-a-key');
    expect(() => readEnv()).toThrow(KeyringError);
  });

  it('reports what is wrong with a keyring without echoing it', () => {
    const entry = testKeyringEntry('dev');
    vi.stubEnv('STUDIO_SECRETS_KEY', `${entry},${entry}`);
    const message = refusal(() => readEnv());
    expect(message).toContain('key id "dev" twice');
    expect(message).not.toContain(entry.split(':')[1]);
  });
});
