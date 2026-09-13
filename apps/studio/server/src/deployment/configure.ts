import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '@codaco/studio-sync/role-bootstrap';

import configurationFiles from '../../../deployment/installer/configuration-files.json' with { type: 'json' };

const image = z
  .string()
  .regex(
    /^[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/,
  );
const optionsSchema = z.object({
  domain: z
    .string()
    .max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  email: z
    .email()
    .max(254)
    .regex(/^[^'\r\n]+$/),
  image,
  minioImage: image,
  output: z.string().min(1),
});

const databaseRoles = ['studio_app', 'studio_maintenance', 'studio_backup'];
const databaseLogins = [
  'studio_migrator',
  'studio_runtime',
  'studio_maintenance_runtime',
  'studio_backup_login',
];

/** The signed installer and offline configure command share these public bytes.
 * This renderer never generates or reads deployment secrets. */
export function renderDeploymentTemplate(name: string, input: Buffer): Buffer {
  if (!configurationFiles.includes(name))
    throw new Error('Unknown deployment template.');
  let bytes = Buffer.from(input);
  if (name.startsWith('deployment/postgres-')) {
    let sql = bytes.toString();
    const substitutions = new Map([
      [
        '/* STUDIO_LARGE_OBJECT_PRIVILEGES */',
        revokeLargeObjectPrivilegesSql([...databaseRoles, ...databaseLogins]),
      ],
    ]);
    if (name === 'deployment/postgres-init.sql')
      substitutions.set(
        '/* STUDIO_RUNTIME_ROLES */',
        runtimeRolesSql(databaseRoles),
      );
    for (const [marker, replacement] of substitutions) {
      if (sql.split(marker).length !== 2)
        throw new Error('Invalid database provisioning template.');
      sql = sql.replace(marker, replacement);
    }
    bytes = Buffer.from(sql);
  }
  return bytes;
}

async function writeOwned(
  path: string,
  bytes: Buffer,
  mode: number,
  owned: string[],
  write: (file: FileHandle, bytes: Buffer) => Promise<void>,
) {
  const file = await open(path, 'wx', mode);
  owned.push(path);
  try {
    await write(file, bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Offline only: no environment, listener, database or external service access. */
export async function configureDeployment(
  input: z.input<typeof optionsSchema>,
  templateRoot: string,
  {
    write = (file, bytes) => file.writeFile(bytes),
  }: { write?: (file: FileHandle, bytes: Buffer) => Promise<void> } = {},
): Promise<{ setupUrl: string; bootstrapToken: string }> {
  const options = optionsSchema.parse(input);
  // Validate inputs and read the complete shipped bundle before writing anything.
  const templates = await Promise.all(
    configurationFiles.map(async (name) => {
      return {
        name,
        bytes: renderDeploymentTemplate(
          name,
          await readFile(join(templateRoot, name)),
        ),
      };
    }),
  );
  const output = resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const lockPath = join(output, '.configure.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const written: string[] = [];
  const directories = new Set<string>();
  try {
    if ((await readdir(output)).some((name) => name !== '.configure.lock'))
      throw new Error('The configuration directory must be empty.');
    const secret = () => randomBytes(32).toString('hex');
    const bootstrapToken = randomBytes(32).toString('base64url');
    const roots = ['PII', 'INTEGRATION', 'INDEX'] as const;
    const namespaces = {
      pii: 'PII',
      integration: 'INTEGRATION',
      blindIndex: 'INDEX',
    } as const;
    const keyset = {
      roots: roots.map((purpose) => ({
        id: `${purpose.toLowerCase()}-root-v1`,
        reference: `STUDIO_ENCRYPTION_ROOT_${purpose}_V1`,
      })),
      ...Object.fromEntries(
        Object.entries(namespaces).map(([namespace, purpose]) => [
          namespace,
          {
            current: `${purpose.toLowerCase()}-v1`,
            keys: [
              {
                id: `${purpose.toLowerCase()}-v1`,
                rootId: `${purpose.toLowerCase()}-root-v1`,
              },
            ],
          },
        ]),
      ),
    };
    const environment = {
      STUDIO_DOMAIN: options.domain,
      ACME_EMAIL: options.email,
      STUDIO_IMAGE: options.image,
      MINIO_IMAGE: options.minioImage,
      STUDIO_ROLE: 'both',
      STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(databaseLogins),
      POSTGRES_PASSWORD: secret(),
      STUDIO_MIGRATION_PASSWORD: secret(),
      STUDIO_DATABASE_PASSWORD: secret(),
      STUDIO_MAINTENANCE_DATABASE_PASSWORD: secret(),
      STUDIO_BACKUP_PASSWORD: secret(),
      BETTER_AUTH_SECRET: secret(),
      STUDIO_BOOTSTRAP_TOKEN: bootstrapToken,
      STUDIO_METRICS_TOKEN: secret(),
      MINIO_ROOT_USER: `studio_admin_${randomBytes(8).toString('hex')}`,
      MINIO_ROOT_PASSWORD: secret(),
      S3_ACCESS_KEY_ID: `studio_${randomBytes(8).toString('hex')}`,
      S3_SECRET_ACCESS_KEY: secret(),
      SMTP_URL: '',
      EMAIL_FROM: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      MICROSOFT_CLIENT_ID: '',
      MICROSOFT_CLIENT_SECRET: '',
      MICROSOFT_TENANT_ID: '',
      STUDIO_TELEMETRY: 'on',
      STUDIO_PROXY_SUBNET: '172.30.240.0/24',
      STUDIO_PROXY_IP: '172.30.240.2',
    };
    // All generated fields exclude single quotes/newlines. Literal dotenv values
    // avoid Compose interpolation of credentials and the keyset's JSON.
    const dotenv = (values: Record<string, string>) =>
      Buffer.from(
        Object.entries(values)
          .map(([name, value]) => `${name}='${value}'`)
          .join('\n') + '\n',
      );
    for (const { name, bytes } of templates) {
      const target = join(output, name);
      if (dirname(target) !== output) {
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        directories.add(dirname(target));
      }
      await writeOwned(target, bytes, 0o644, written, write);
    }
    const encryptionPath = join(output, 'deployment/encryption.env');
    await writeOwned(
      encryptionPath,
      dotenv({
        STUDIO_ENCRYPTION_KEYSET: JSON.stringify(keyset),
        ...Object.fromEntries(
          roots.map((purpose) => [
            `STUDIO_ENCRYPTION_ROOT_${purpose}_V1`,
            randomBytes(32).toString('base64'),
          ]),
        ),
      }),
      0o600,
      written,
      write,
    );
    // Credentials are the final file; a partial template copy cannot be booted.
    const envPath = join(output, '.env');
    await writeOwned(envPath, dotenv(environment), 0o600, written, write);
    return { setupUrl: `https://${options.domain}/setup`, bootstrapToken };
  } catch (error) {
    await Promise.all(written.map((path) => rm(path, { force: true })));
    for (const path of directories) await rm(path, { recursive: true });
    throw error;
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}

export function parseConfigureArguments(args: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      !flag ||
      !['--domain', '--email', '--image', '--minio-image', '--output'].includes(
        flag,
      ) ||
      !value ||
      values.has(flag)
    )
      throw new Error('Invalid configure arguments.');
    values.set(flag, value);
  }
  return optionsSchema.parse({
    domain: values.get('--domain'),
    email: values.get('--email'),
    image: values.get('--image'),
    minioImage: values.get('--minio-image'),
    output: values.get('--output'),
  });
}
