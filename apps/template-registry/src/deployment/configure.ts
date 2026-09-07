import { randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { z } from 'zod';

import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '@codaco/studio-sync/role-bootstrap';

const image = z
  .string()
  .regex(
    /^[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/,
  );
const optionsSchema = z
  .object({
    domain: z
      .string()
      .max(253)
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
    mailFrom: z
      .email()
      .max(254)
      .regex(/^[^'\r\n]+$/),
    registryImage: image,
    minioImage: image,
    output: z.string().min(1),
    smtpUrl: z.string().url().max(2048).optional(),
    postmarkServerToken: z.string().min(1).max(1024).optional(),
    postmarkMessageStream: z.string().min(1).max(256).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.smtpUrl) === Boolean(value.postmarkServerToken))
      context.addIssue({
        code: 'custom',
        message: 'Select one mail transport.',
      });
    if (value.postmarkMessageStream && !value.postmarkServerToken)
      context.addIssue({
        code: 'custom',
        message: 'Postmark stream requires its server token.',
      });
  });

export const registryConfigurationFiles = [
  'compose.yml',
  'postgres-init.sql',
  'minio-init.sh',
  'minio-policy.json',
] as const;

const roles = ['registry_app', 'registry_operator', 'registry_backup'] as const;
const logins = [
  'registry_migrator',
  'registry_runtime',
  'registry_operations',
  'registry_backup_login',
] as const;
const generatedNames = [
  'REGISTRY_POSTGRES_PASSWORD',
  'REGISTRY_MIGRATION_PASSWORD',
  'REGISTRY_DATABASE_PASSWORD',
  'REGISTRY_OPERATOR_PASSWORD',
  'REGISTRY_BACKUP_PASSWORD',
  'REGISTRY_AUTH_SECRET',
  'REGISTRY_MINIO_ROOT_USER',
  'REGISTRY_MINIO_ROOT_PASSWORD',
  'REGISTRY_S3_ACCESS_KEY_ID',
  'REGISTRY_S3_SECRET_ACCESS_KEY',
] as const;

export function renderRegistryDeploymentTemplate(
  name: string,
  input: Buffer,
): Buffer {
  if (!registryConfigurationFiles.includes(name as never))
    throw new Error('Unknown Registry deployment template.');
  if (name !== 'postgres-init.sql') return Buffer.from(input);
  let sql = input.toString();
  const substitutions = new Map([
    [
      '/* REGISTRY_RUNTIME_ROLES */',
      runtimeRolesSql([...roles], 'Template Registry'),
    ],
    [
      '/* REGISTRY_LARGE_OBJECT_PRIVILEGES */',
      revokeLargeObjectPrivilegesSql([...roles, ...logins]),
    ],
  ]);
  for (const [marker, replacement] of substitutions) {
    if (sql.split(marker).length !== 2)
      throw new Error('Invalid Registry database provisioning template.');
    sql = sql.replace(marker, replacement);
  }
  return Buffer.from(sql);
}

function dotenv(values: Record<string, string>): Buffer {
  return Buffer.from(
    Object.entries(values)
      .map(([name, value]) => `${name}='${value}'`)
      .join('\n') + '\n',
  );
}

function generatedEnvironment() {
  const secret = () => randomBytes(32).toString('hex');
  return {
    REGISTRY_POSTGRES_PASSWORD: secret(),
    REGISTRY_MIGRATION_PASSWORD: secret(),
    REGISTRY_DATABASE_PASSWORD: secret(),
    REGISTRY_OPERATOR_PASSWORD: secret(),
    REGISTRY_BACKUP_PASSWORD: secret(),
    REGISTRY_AUTH_SECRET: secret(),
    REGISTRY_MINIO_ROOT_USER: `registry_admin_${randomBytes(8).toString('hex')}`,
    REGISTRY_MINIO_ROOT_PASSWORD: secret(),
    REGISTRY_S3_ACCESS_KEY_ID: `registry_${randomBytes(8).toString('hex')}`,
    REGISTRY_S3_SECRET_ACCESS_KEY: secret(),
  };
}

function retainedGenerated(values: Record<string, string | undefined>) {
  const retained = Object.fromEntries(
    generatedNames.map((name) => [name, values[name]]),
  );
  if (
    Object.values(retained).some(
      (value) => typeof value !== 'string' || !value || /['\r\n]/.test(value),
    )
  )
    throw new Error('Registry private configuration is incomplete.');
  return retained as Record<(typeof generatedNames)[number], string>;
}

/** Configure only Registry-owned public templates and private Registry inputs.
 * It never reads or emits Studio encryption roots, credentials, or account data. */
export async function configureRegistryDeployment(
  input: z.input<typeof optionsSchema>,
  templateRoot: string,
): Promise<void> {
  const options = optionsSchema.parse(input);
  const templates = await Promise.all(
    registryConfigurationFiles.map(async (name) => ({
      name,
      bytes: renderRegistryDeploymentTemplate(
        name,
        await readFile(join(templateRoot, name)),
      ),
    })),
  );
  const output = resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const lockPath = join(output, '.registry-configure.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const written: string[] = [];
  try {
    const environmentPath = join(output, 'registry.env');
    const existing = await readdir(output);
    const hasEnvironment = existing.includes('registry.env');
    if (
      !hasEnvironment &&
      existing.some((name) => name !== '.registry-configure.lock')
    )
      throw new Error('Registry configuration directory is incomplete.');
    const secrets = hasEnvironment
      ? retainedGenerated(parseEnv(await readFile(environmentPath, 'utf8')))
      : generatedEnvironment();
    if (hasEnvironment && (await stat(environmentPath)).mode & 0o077)
      throw new Error('Registry private configuration must be mode0600.');
    const publicEnvironment = {
      REGISTRY_DOMAIN: options.domain,
      REGISTRY_MAIL_FROM: options.mailFrom,
      REGISTRY_IMAGE: options.registryImage,
      MINIO_IMAGE: options.minioImage,
      REGISTRY_SMTP_URL: options.smtpUrl ?? '',
      REGISTRY_POSTMARK_SERVER_TOKEN: options.postmarkServerToken ?? '',
      REGISTRY_POSTMARK_MESSAGE_STREAM: options.postmarkMessageStream ?? '',
      REGISTRY_S3_REGION: 'us-east-1',
      ...secrets,
    };
    const deployment = join(output, 'deployment', 'registry');
    await mkdir(deployment, { recursive: true, mode: 0o700 });
    for (const { name, bytes } of templates) {
      const target = join(deployment, name);
      await writeFile(target, bytes, {
        flag: hasEnvironment ? 'w' : 'wx',
        mode: 0o644,
      });
      written.push(target);
    }
    await writeFile(environmentPath, dotenv(publicEnvironment), {
      flag: hasEnvironment ? 'w' : 'wx',
      mode: 0o600,
    });
    written.push(environmentPath);
  } catch (error) {
    if (!(await readdir(output)).includes('registry.env')) {
      await Promise.all(written.map((path) => rm(path, { force: true })));
      await rm(join(output, 'deployment'), { recursive: true, force: true });
    }
    throw error;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
