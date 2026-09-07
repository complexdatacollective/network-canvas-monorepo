import { z } from 'zod';

import { validateEmailAddress } from '@codaco/studio-sync/email-sender';
import { copyPostgresAdministrativeLogins } from '@codaco/studio-sync/postgres-database-enrollment';
import {
  postmarkConfiguration,
  validatePostmarkFrom,
} from '@codaco/studio-sync/postmark-email-sender';

import { DEFAULT_REGISTRY_LIMITS, RegistryLimitsSchema } from './limits.ts';

type RawEnv = Readonly<Record<string, string | undefined>>;
const localHost = (host: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(host);
const nonblank = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.trim().length > 0 && value.isWellFormed() && !value.includes('\0'),
  );
const networkUrl = (protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol));
const serviceOrigin = networkUrl(['http:', 'https:']).refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  );
});
const originUrl = serviceOrigin.refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' || localHost(url.hostname);
});
const smtpUrl = networkUrl(['smtp:', 'smtps:']).refine((value) => {
  const url = new URL(value);
  return (
    !url.search &&
    !url.hash &&
    (!url.pathname || url.pathname === '/') &&
    Boolean(url.hostname) &&
    (!url.password || Boolean(url.username))
  );
});
const integer = (value: string | undefined, fallback: number) =>
  value === undefined ? fallback : Number(value);
const databaseUrl = networkUrl(['postgres:', 'postgresql:']);
const loginName = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const enrollmentSchema = z.strictObject({
  allowedLogins: z
    .array(loginName)
    .min(1)
    .max(32)
    .refine((names) => new Set(names).size === names.length),
  administrativeLogins: z.array(loginName).max(32),
});
const migrationSchema = z.strictObject({
  databaseUrl,
  ...enrollmentSchema.shape,
});
const readDatabaseAdmission = (raw: RawEnv) => {
  const parsed = enrollmentSchema.parse({
    allowedLogins: JSON.parse(raw.REGISTRY_DATABASE_ALLOWED_LOGINS ?? ''),
    administrativeLogins: JSON.parse(
      raw.REGISTRY_DATABASE_ADMINISTRATIVE_LOGINS || '[]',
    ),
  });
  return {
    allowedLogins: parsed.allowedLogins,
    administrativeLogins: copyPostgresAdministrativeLogins(
      parsed.allowedLogins,
      parsed.administrativeLogins,
    ),
  };
};
const fromAddress = z
  .string()
  .transform((value) => validateEmailAddress(value));
const schema = z.strictObject({
  port: z.number().int().min(1).max(65535),
  publicUrl: originUrl,
  databaseUrl,
  operatorDatabaseUrl: databaseUrl,
  ...enrollmentSchema.shape,
  authSecret: nonblank.min(32).max(1024),
  mailer: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('smtp'),
      url: smtpUrl,
      from: fromAddress,
    }),
    postmarkConfiguration.extend({
      kind: z.literal('postmark'),
      from: z.string().transform((value) => validatePostmarkFrom(value)),
    }),
  ]),
  magicLinksPerDay: z.number().int().min(1).max(10_000),
  s3: z
    .strictObject({
      endpoint: serviceOrigin,
      insecurePrivateNetwork: z.boolean(),
      region: nonblank,
      bucket: nonblank,
      accessKeyId: nonblank,
      secretAccessKey: nonblank,
    })
    .refine(({ endpoint, insecurePrivateNetwork }) => {
      const url = new URL(endpoint);
      return (
        url.protocol === 'https:' ||
        localHost(url.hostname) ||
        insecurePrivateNetwork
      );
    }),
  limits: RegistryLimitsSchema,
});
export type RegistryEnv = z.infer<typeof schema>;

/** The executable's only process-environment boundary; never stringify failures. */
// oxlint-disable-next-line node/no-process-env
export function readRegistryEnv(raw: RawEnv = process.env): RegistryEnv {
  try {
    // Compose represents an omitted optional value as an empty string. Every
    // nonempty malformed value still reaches the shared strict validator.
    const smtp = raw.REGISTRY_SMTP_URL || undefined;
    const postmark = raw.REGISTRY_POSTMARK_SERVER_TOKEN || undefined;
    const stream = raw.REGISTRY_POSTMARK_MESSAGE_STREAM || undefined;
    if (Boolean(smtp) === Boolean(postmark) || (stream && !postmark))
      throw new Error('Invalid registry email transport selection');
    return schema.parse({
      ...readDatabaseAdmission(raw),
      port: integer(raw.PORT, 3000),
      publicUrl: raw.REGISTRY_PUBLIC_URL,
      databaseUrl: raw.REGISTRY_DATABASE_URL,
      operatorDatabaseUrl: raw.REGISTRY_OPERATOR_DATABASE_URL,
      authSecret: raw.REGISTRY_AUTH_SECRET,
      mailer: postmark
        ? {
            kind: 'postmark',
            serverToken: postmark,
            messageStream: stream,
            from: raw.REGISTRY_MAIL_FROM,
          }
        : { kind: 'smtp', url: smtp, from: raw.REGISTRY_MAIL_FROM },
      magicLinksPerDay: integer(raw.REGISTRY_MAGIC_LINKS_PER_DAY, 100),
      s3: {
        endpoint: raw.REGISTRY_S3_ENDPOINT,
        insecurePrivateNetwork:
          z
            .enum(['true', 'false'])
            .parse(raw.REGISTRY_S3_INSECURE_PRIVATE_NETWORK ?? 'false') ===
          'true',
        region: raw.REGISTRY_S3_REGION,
        bucket: raw.REGISTRY_S3_BUCKET,
        accessKeyId: raw.REGISTRY_S3_ACCESS_KEY_ID,
        secretAccessKey: raw.REGISTRY_S3_SECRET_ACCESS_KEY,
      },
      limits: {
        publisherBytes: integer(
          raw.REGISTRY_PUBLISHER_LIMIT_BYTES,
          DEFAULT_REGISTRY_LIMITS.publisherBytes,
        ),
        totalBytes: integer(
          raw.REGISTRY_TOTAL_LIMIT_BYTES,
          DEFAULT_REGISTRY_LIMITS.totalBytes,
        ),
        publishPerHour: integer(
          raw.REGISTRY_PUBLISH_PER_HOUR,
          DEFAULT_REGISTRY_LIMITS.publishPerHour,
        ),
        publishGlobalPerMinute: integer(
          raw.REGISTRY_PUBLISH_GLOBAL_PER_MINUTE,
          DEFAULT_REGISTRY_LIMITS.publishGlobalPerMinute,
        ),
        reportsPerHour: integer(
          raw.REGISTRY_REPORTS_PER_HOUR,
          DEFAULT_REGISTRY_LIMITS.reportsPerHour,
        ),
        reportsPerEntryPerHour: integer(
          raw.REGISTRY_REPORTS_PER_ENTRY_PER_HOUR,
          DEFAULT_REGISTRY_LIMITS.reportsPerEntryPerHour,
        ),
        accountWritesPerHour: integer(
          raw.REGISTRY_ACCOUNT_WRITES_PER_HOUR,
          DEFAULT_REGISTRY_LIMITS.accountWritesPerHour,
        ),
        accountWritesGlobalPerHour: integer(
          raw.REGISTRY_ACCOUNT_WRITES_GLOBAL_PER_HOUR,
          DEFAULT_REGISTRY_LIMITS.accountWritesGlobalPerHour,
        ),
      },
    });
  } catch {
    throw new Error('REGISTRY_CONFIGURATION_INVALID');
  }
}

/** Operator-only credentials never enter the HTTP service's configuration. */
// oxlint-disable-next-line node/no-process-env
export function readRegistryMigrationEnv(raw: RawEnv = process.env) {
  try {
    return migrationSchema.parse({
      databaseUrl: raw.REGISTRY_MIGRATION_DATABASE_URL,
      ...readDatabaseAdmission(raw),
    });
  } catch {
    throw new Error('REGISTRY_MIGRATION_CONFIGURATION_INVALID');
  }
}

/** Independently held read-only backup credentials; no HTTP or owner settings. */
// oxlint-disable-next-line node/no-process-env
export function readRegistryBackupEnv(raw: RawEnv = process.env) {
  try {
    return {
      databaseUrl: databaseUrl.parse(raw.REGISTRY_BACKUP_DATABASE_URL),
      ...readDatabaseAdmission(raw),
    };
  } catch {
    throw new Error('REGISTRY_BACKUP_CONFIGURATION_INVALID');
  }
}
