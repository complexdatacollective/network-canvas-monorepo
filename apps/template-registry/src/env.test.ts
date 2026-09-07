import { describe, expect, it } from 'vitest';

import { readRegistryEnv, readRegistryMigrationEnv } from './env.ts';

const valid = {
  REGISTRY_PUBLIC_URL: 'https://registry.example.test',
  REGISTRY_DATABASE_URL: 'postgres://runtime:synthetic@127.0.0.1/registry',
  REGISTRY_OPERATOR_DATABASE_URL:
    'postgres://operator:synthetic@127.0.0.1/registry',
  REGISTRY_AUTH_SECRET: 'synthetic-auth-secret-used-only-in-this-test',
  REGISTRY_SMTP_URL: 'smtps://sender:synthetic@mail.example.test',
  REGISTRY_MAIL_FROM: 'registry@example.test',
  REGISTRY_S3_ENDPOINT: 'https://objects.example.test',
  REGISTRY_S3_REGION: 'auto',
  REGISTRY_S3_BUCKET: 'registry',
  REGISTRY_S3_ACCESS_KEY_ID: 'synthetic-access-id',
  REGISTRY_S3_SECRET_ACCESS_KEY: 'synthetic-storage-secret',
};

it('resolves explicit runtime inputs and bounded defaults without migration credentials', () => {
  const result = readRegistryEnv({
    ...valid,
    REGISTRY_MIGRATION_DATABASE_URL:
      'postgres://owner:never-runtime@127.0.0.1/registry',
    REGISTRY_DATABASE_ALLOWED_LOGINS: '["runtime", "operator"]',
  });
  expect(result).toMatchObject({
    port: 3000,
    magicLinksPerDay: 100,
    databaseUrl: valid.REGISTRY_DATABASE_URL,
    operatorDatabaseUrl: valid.REGISTRY_OPERATOR_DATABASE_URL,
    limits: { publisherBytes: 104857600, totalBytes: 1073741824 },
  });
  expect(JSON.stringify(result)).not.toContain('never-runtime');
});

describe('refuses unsafe runtime configuration with a bounded private error', () => {
  const cases = [
    { REGISTRY_DATABASE_URL: undefined },
    { REGISTRY_OPERATOR_DATABASE_URL: undefined },
    { REGISTRY_PUBLIC_URL: 'http://public.example.test' },
    { REGISTRY_PUBLIC_URL: 'https://registry.example.test/untrusted' },
    { REGISTRY_PUBLIC_URL: 'https://secret@registry.example.test/' },
    { REGISTRY_AUTH_SECRET: 'short' },
    { REGISTRY_SMTP_URL: undefined },
    { REGISTRY_POSTMARK_SERVER_TOKEN: 'synthetic-token' },
    { REGISTRY_POSTMARK_MESSAGE_STREAM: 'outbound' },
    {
      REGISTRY_SMTP_URL: undefined,
      REGISTRY_POSTMARK_SERVER_TOKEN: 'bad\nsecret',
    },
    {
      REGISTRY_SMTP_URL: undefined,
      REGISTRY_POSTMARK_SERVER_TOKEN: 'synthetic',
      REGISTRY_POSTMARK_MESSAGE_STREAM: 'bad/stream',
    },
    {
      REGISTRY_SMTP_URL: undefined,
      REGISTRY_POSTMARK_SERVER_TOKEN: 'synthetic',
      REGISTRY_MAIL_FROM: undefined,
    },
    { REGISTRY_SMTP_URL: 'smtp://mail.example.test/?logger=true' },
    { REGISTRY_SMTP_URL: 'smtps://mail.example.test/#secret' },
    { REGISTRY_SMTP_URL: 'smtps://mail.example.test/secret' },
    { REGISTRY_MAIL_FROM: 'First <first@example.test>, second@example.test' },
    { REGISTRY_S3_ENDPOINT: 'http://objects.example.test' },
    { REGISTRY_S3_INSECURE_PRIVATE_NETWORK: '1' },
    { REGISTRY_S3_ENDPOINT: 'https://objects.example.test/?credential=secret' },
    { REGISTRY_S3_SECRET_ACCESS_KEY: undefined },
    { REGISTRY_S3_BUCKET: '' },
    { REGISTRY_MAGIC_LINKS_PER_DAY: '10001' },
    { REGISTRY_PUBLISHER_LIMIT_BYTES: '0' },
    { REGISTRY_TOTAL_LIMIT_BYTES: 'NaN' },
    { REGISTRY_PUBLISH_GLOBAL_PER_MINUTE: '1.2' },
    { PORT: '0' },
    { PORT: '65536' },
  ];
  it.each(cases)('rejects invalid input %j', (changed) => {
    expect(() => readRegistryEnv({ ...valid, ...changed })).toThrowError(
      new Error('REGISTRY_CONFIGURATION_INVALID'),
    );
  });
});

it('requires explicit private-network opt-in for an internal HTTP object endpoint', () => {
  const input = {
    ...valid,
    REGISTRY_S3_ENDPOINT: 'http://registry-minio:9000',
  };
  expect(() => readRegistryEnv(input)).toThrow(
    'REGISTRY_CONFIGURATION_INVALID',
  );
  expect(() =>
    readRegistryEnv({
      ...input,
      REGISTRY_S3_INSECURE_PRIVATE_NETWORK: 'false',
    }),
  ).toThrow('REGISTRY_CONFIGURATION_INVALID');
  expect(
    readRegistryEnv({ ...input, REGISTRY_S3_INSECURE_PRIVATE_NETWORK: 'true' })
      .s3,
  ).toMatchObject({
    endpoint: input.REGISTRY_S3_ENDPOINT,
    insecurePrivateNetwork: true,
  });
  expect(() =>
    readRegistryEnv({
      ...input,
      REGISTRY_S3_INSECURE_PRIVATE_NETWORK: 'true',
      REGISTRY_PUBLIC_URL: 'http://public.example.test',
    }),
  ).toThrow('REGISTRY_CONFIGURATION_INVALID');
});

it('permits explicit loopback HTTP development without supplying public defaults', () => {
  expect(
    readRegistryEnv({
      ...valid,
      REGISTRY_PUBLIC_URL: 'http://localhost:3000',
      REGISTRY_SMTP_URL: 'smtp://127.0.0.1:2525',
      REGISTRY_S3_ENDPOINT: 'http://[::1]:9000',
    }).publicUrl,
  ).toBe('http://localhost:3000');
  expect(() => readRegistryEnv({})).toThrow('REGISTRY_CONFIGURATION_INVALID');
});

it('requires an explicit owner URL and exact allowed-login JSON for migrations', () => {
  expect(
    readRegistryMigrationEnv({
      REGISTRY_MIGRATION_DATABASE_URL:
        'postgres://owner:synthetic@localhost/registry',
      REGISTRY_DATABASE_ALLOWED_LOGINS: '["registry_http", "registry_worker"]',
    }),
  ).toEqual({
    databaseUrl: 'postgres://owner:synthetic@localhost/registry',
    allowedLogins: ['registry_http', 'registry_worker'],
  });
  const bad = [
    undefined,
    '',
    '[]',
    '["duplicate","duplicate"]',
    '["ROLE"]',
    '["bad-name"]',
    '["registry_http",null]',
    '["a"]; secret',
  ];
  expect(bad).toHaveLength(8);
  for (const allowedLogins of bad)
    expect(() =>
      readRegistryMigrationEnv({
        REGISTRY_MIGRATION_DATABASE_URL:
          'postgres://owner:synthetic@localhost/registry',
        REGISTRY_DATABASE_ALLOWED_LOGINS: allowedLogins,
      }),
    ).toThrowError(new Error('REGISTRY_MIGRATION_CONFIGURATION_INVALID'));
  expect(() =>
    readRegistryMigrationEnv({
      ...valid,
      REGISTRY_DATABASE_ALLOWED_LOGINS: '["runtime"]',
    }),
  ).toThrow('REGISTRY_MIGRATION_CONFIGURATION_INVALID');
});

it('selects the shared Postmark transport and validates its configured sender before runtime admission', () => {
  expect(
    readRegistryEnv({
      ...valid,
      REGISTRY_SMTP_URL: '',
      REGISTRY_POSTMARK_SERVER_TOKEN: 'synthetic-token',
      REGISTRY_POSTMARK_MESSAGE_STREAM: 'registry-signin',
      REGISTRY_MAIL_FROM: 'Network Canvas <registry@example.test>',
    }).mailer,
  ).toEqual({
    kind: 'postmark',
    serverToken: 'synthetic-token',
    messageStream: 'registry-signin',
    from: { name: 'Network Canvas', address: 'registry@example.test' },
  });
  expect(
    readRegistryEnv({
      ...valid,
      REGISTRY_POSTMARK_SERVER_TOKEN: '',
      REGISTRY_POSTMARK_MESSAGE_STREAM: '',
    }).mailer,
  ).toEqual({
    kind: 'smtp',
    url: valid.REGISTRY_SMTP_URL,
    from: { address: valid.REGISTRY_MAIL_FROM },
  });
});

it.each(['A'.repeat(240), '\\'.repeat(120)])(
  'rejects the provider-specific formatted sender limit during Postmark environment parsing',
  (name) => {
    const from = `"${name.replace(/["\\]/g, '\\$&')}" <from@example.test>`;
    expect(from.length).toBeGreaterThan(255);
    expect(
      readRegistryEnv({ ...valid, REGISTRY_MAIL_FROM: from }).mailer.kind,
    ).toBe('smtp');
    expect(() =>
      readRegistryEnv({
        ...valid,
        REGISTRY_SMTP_URL: undefined,
        REGISTRY_POSTMARK_SERVER_TOKEN: 'synthetic-token',
        REGISTRY_MAIL_FROM: from,
      }),
    ).toThrow('REGISTRY_CONFIGURATION_INVALID');
  },
);
