import { randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  lstat,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
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
const dotenvValue = z.string().regex(/^[^'\r\n]+$/);

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
    previousConfigurationRoot: z.string().min(1).optional(),
    smtpUrl: dotenvValue.url().max(2048).optional(),
    postmarkServerToken: dotenvValue.min(1).max(1024).optional(),
    postmarkMessageStream: dotenvValue.min(1).max(256).optional(),
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
const publicEnvironmentNames = [
  'REGISTRY_DOMAIN',
  'REGISTRY_MAIL_FROM',
  'REGISTRY_IMAGE',
  'MINIO_IMAGE',
  'REGISTRY_SMTP_URL',
  'REGISTRY_POSTMARK_SERVER_TOKEN',
  'REGISTRY_POSTMARK_MESSAGE_STREAM',
  'REGISTRY_S3_REGION',
] as const;

export function renderRegistryDeploymentTemplate(
  name: string,
  input: Buffer,
): Buffer {
  if (!registryConfigurationFiles.some((known) => known === name))
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

function secret() {
  return randomBytes(32).toString('hex');
}

function generatedEnvironment() {
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

function completeGenerated(
  values: Partial<Record<(typeof generatedNames)[number], string>>,
): values is Record<(typeof generatedNames)[number], string> {
  return generatedNames.every((name) => typeof values[name] === 'string');
}

function retainedGenerated(values: Record<string, string | undefined>) {
  const valuesByName: Partial<Record<(typeof generatedNames)[number], string>> =
    {};
  for (const name of generatedNames) valuesByName[name] = values[name];
  if (
    !completeGenerated(valuesByName) ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_POSTGRES_PASSWORD ?? '') ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_MIGRATION_PASSWORD ?? '') ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_DATABASE_PASSWORD ?? '') ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_OPERATOR_PASSWORD ?? '') ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_BACKUP_PASSWORD ?? '') ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_AUTH_SECRET ?? '') ||
    !/^registry_admin_[a-f0-9]{16}$/.test(
      valuesByName.REGISTRY_MINIO_ROOT_USER ?? '',
    ) ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_MINIO_ROOT_PASSWORD ?? '') ||
    !/^registry_[a-f0-9]{16}$/.test(
      valuesByName.REGISTRY_S3_ACCESS_KEY_ID ?? '',
    ) ||
    !/^[a-f0-9]{64}$/.test(valuesByName.REGISTRY_S3_SECRET_ACCESS_KEY ?? '') ||
    new Set(Object.values(valuesByName)).size !== generatedNames.length
  )
    throw new Error('Registry private configuration is incomplete.');
  return valuesByName;
}

function exactNames(values: Record<string, string | undefined>) {
  return (
    Object.keys(values).toSorted().join(',') ===
    [...publicEnvironmentNames, ...generatedNames].toSorted().join(',')
  );
}

async function readRegistryConfiguration(
  root: string,
  lockName?: string,
): Promise<Record<string, string | undefined>> {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error('Registry configuration directory is incomplete.');
  const expected = [
    'deployment',
    'registry.env',
    ...(lockName ? [lockName] : []),
  ];
  if (
    (await readdir(root)).toSorted().join(',') !== expected.toSorted().join(',')
  )
    throw new Error('Registry configuration directory is incomplete.');
  const environmentPath = join(root, 'registry.env');
  const environmentInfo = await lstat(environmentPath);
  if (
    !environmentInfo.isFile() ||
    environmentInfo.isSymbolicLink() ||
    (environmentInfo.mode & 0o777) !== 0o600
  )
    throw new Error('Registry private configuration must be mode0600.');
  const values = parseEnv(await readFile(environmentPath, 'utf8'));
  if (!exactNames(values))
    throw new Error('Registry private configuration is incomplete.');
  retainedGenerated(values);
  const deploymentRoot = join(root, 'deployment');
  const deploymentRootInfo = await lstat(deploymentRoot);
  if (
    !deploymentRootInfo.isDirectory() ||
    deploymentRootInfo.isSymbolicLink() ||
    (await readdir(deploymentRoot)).toSorted().join(',') !== 'registry'
  )
    throw new Error('Registry configuration directory is incomplete.');
  const deployment = join(deploymentRoot, 'registry');
  const deploymentInfo = await lstat(deployment);
  if (
    !deploymentInfo.isDirectory() ||
    deploymentInfo.isSymbolicLink() ||
    (await readdir(deployment)).toSorted().join(',') !==
      [...registryConfigurationFiles].toSorted().join(',')
  )
    throw new Error('Registry configuration directory is incomplete.');
  for (const name of registryConfigurationFiles) {
    const info = await lstat(join(deployment, name));
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (info.mode & 0o777) !== 0o644
    )
      throw new Error('Registry configuration directory is incomplete.');
  }
  return values;
}

function nested(left: string, right: string) {
  const relation = relative(right, left);
  return relation === '' || (!relation.startsWith('..') && relation !== '..');
}

async function outputRoot(path: string): Promise<string> {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Registry configuration output is unsafe.');
    return realpath(path);
  } catch (error: unknown) {
    if (
      !(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      )
    )
      throw error;
    return join(await outputRoot(dirname(path)), basename(path));
  }
}

async function writeOwned(
  path: string,
  bytes: Buffer,
  mode: number,
  owned: string[],
  write: (file: FileHandle, value: Buffer) => Promise<void>,
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

/** Configure only Registry-owned public templates and private Registry inputs.
 * It never reads or emits Studio encryption roots, credentials, or account data. */
export async function configureRegistryDeployment(
  input: z.input<typeof optionsSchema>,
  templateRoot: string,
  {
    write = (file, bytes) => file.writeFile(bytes),
  }: {
    write?: (file: FileHandle, bytes: Buffer) => Promise<void>;
  } = {},
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
  const canonicalOutput = await outputRoot(output);
  const publicEnvironment = {
    REGISTRY_DOMAIN: options.domain,
    REGISTRY_MAIL_FROM: options.mailFrom,
    REGISTRY_IMAGE: options.registryImage,
    MINIO_IMAGE: options.minioImage,
    REGISTRY_SMTP_URL: options.smtpUrl ?? '',
    REGISTRY_POSTMARK_SERVER_TOKEN: options.postmarkServerToken ?? '',
    REGISTRY_POSTMARK_MESSAGE_STREAM: options.postmarkMessageStream ?? '',
    REGISTRY_S3_REGION: 'us-east-1',
  };
  const retained = options.previousConfigurationRoot
    ? await (async () => {
        const supplied = await lstat(options.previousConfigurationRoot!);
        if (!supplied.isDirectory() || supplied.isSymbolicLink())
          throw new Error('Registry previous configuration is unsafe.');
        const previous = await realpath(
          resolve(options.previousConfigurationRoot!),
        );
        if (
          nested(canonicalOutput, previous) ||
          nested(previous, canonicalOutput)
        )
          throw new Error(
            'Registry transition requires separate configuration roots.',
          );
        return retainedGenerated(await readRegistryConfiguration(previous));
      })()
    : null;
  await mkdir(output, { recursive: true, mode: 0o700 });
  const lockPath = join(output, '.registry-configure.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const written: string[] = [];
  const directories: string[] = [];
  try {
    const environmentPath = join(output, 'registry.env');
    const existing = await readdir(output);
    const hasEnvironment = existing.includes('registry.env');
    if (
      !hasEnvironment &&
      existing.some((name) => name !== '.registry-configure.lock')
    )
      throw new Error('Registry configuration directory is incomplete.');
    if (retained && hasEnvironment)
      throw new Error('Registry transition requires a new configuration root.');
    if (hasEnvironment) {
      // This is a dedicated Registry configuration root. A generation rerun is
      // idempotent only; a changed public deployment belongs in a new root.
      const current = await readRegistryConfiguration(
        output,
        '.registry-configure.lock',
      );
      if (
        Object.entries(publicEnvironment).some(
          ([name, value]) => current[name] !== value,
        )
      )
        throw new Error('Registry configuration is already initialized.');
      for (const { name, bytes } of templates) {
        if (
          !(
            await readFile(join(output, 'deployment', 'registry', name))
          ).equals(bytes)
        )
          throw new Error('Registry configuration templates differ.');
      }
      return;
    }
    const secrets = retained ?? generatedEnvironment();
    const deploymentRoot = join(output, 'deployment');
    await mkdir(deploymentRoot, { mode: 0o700 });
    directories.push(deploymentRoot);
    const deployment = join(deploymentRoot, 'registry');
    await mkdir(deployment, { mode: 0o700 });
    directories.push(deployment);
    for (const { name, bytes } of templates) {
      const target = join(deployment, name);
      await writeOwned(target, bytes, 0o644, written, write);
    }
    // Credentials are the final file. A partial public template copy is never
    // mistaken for a runnable Registry configuration root.
    const stagedEnvironment = join(
      output,
      `.registry.env-writing-${randomBytes(16).toString('hex')}`,
    );
    await writeOwned(
      stagedEnvironment,
      dotenv({ ...publicEnvironment, ...secrets }),
      0o600,
      written,
      write,
    );
    await rename(stagedEnvironment, environmentPath);
    written.pop();
    written.push(environmentPath);
  } catch (error) {
    await Promise.all(written.map((path) => rm(path, { force: true })));
    for (const path of directories.toReversed())
      await rmdir(path).catch(() => undefined);
    throw error;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
