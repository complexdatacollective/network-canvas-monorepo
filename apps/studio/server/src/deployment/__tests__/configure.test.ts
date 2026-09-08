import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { BootstrapTokenSchema } from '@codaco/studio-rpc';

import { resolveEncryptionEnv } from '../../env/encryption.ts';
import { loadEncryptionKeys } from '../../pii/keys.ts';
import { configureDeployment, parseConfigureArguments } from '../configure.ts';

const templateRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const options = {
  domain: 'studio.example.test',
  email: 'operator@example.test',
  image: `ghcr.io/example/studio@sha256:${'1'.repeat(64)}`,
  minioImage: `ghcr.io/example/studio-minio@sha256:${'2'.repeat(64)}`,
};

async function fixture(run: (output: string) => Promise<void>) {
  const output = await mkdtemp(join(tmpdir(), 'studio-configure-test-'));
  try {
    await run(output);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

async function readConfiguration(output: string) {
  return {
    ...parseEnv(await readFile(join(output, '.env'), 'utf8')),
    ...parseEnv(
      await readFile(join(output, 'deployment/encryption.env'), 'utf8'),
    ),
  };
}

describe('explicit deployment configuration', () => {
  it('generates independent usable credentials and a private config from the actual Compose bundle', async () => {
    await fixture(async (output) => {
      const result = await configureDeployment(
        { ...options, output },
        templateRoot,
      );
      const env = await readConfiguration(output);
      expect(result.setupUrl).toBe('https://studio.example.test/setup');
      expect(BootstrapTokenSchema.parse(result.bootstrapToken)).toBe(
        env.STUDIO_BOOTSTRAP_TOKEN,
      );
      expect((await stat(join(output, '.env'))).mode & 0o777).toBe(0o600);
      expect(
        (await stat(join(output, 'deployment/encryption.env'))).mode & 0o777,
      ).toBe(0o600);
      expect(
        (await stat(join(output, 'deployment/postgres-init.sql'))).mode & 0o777,
      ).toBe(0o644);
      const names = [
        'POSTGRES_PASSWORD',
        'STUDIO_MIGRATION_PASSWORD',
        'STUDIO_DATABASE_PASSWORD',
        'STUDIO_MAINTENANCE_DATABASE_PASSWORD',
        'STUDIO_BACKUP_PASSWORD',
        'BETTER_AUTH_SECRET',
        'STUDIO_BOOTSTRAP_TOKEN',
        'STUDIO_METRICS_TOKEN',
        'MINIO_ROOT_PASSWORD',
        'S3_SECRET_ACCESS_KEY',
        'STUDIO_ENCRYPTION_ROOT_PII_V1',
        'STUDIO_ENCRYPTION_ROOT_INTEGRATION_V1',
        'STUDIO_ENCRYPTION_ROOT_INDEX_V1',
      ];
      const secrets = names.map((name) => env[name]!);
      expect(secrets.every((value) => value.length >= 43)).toBe(true);
      expect(new Set(secrets).size).toBe(names.length);
      const encryption = resolveEncryptionEnv(env);
      const keys = await loadEncryptionKeys(
        encryption.configuration,
        encryption.loadRootKey,
      );
      expect(keys.currentId('pii-enc')).toBe('pii-v1');
      expect(keys.currentId('integration-enc')).toBe('integration-v1');
      expect(keys.currentId('pii-index')).toBe('index-v1');
      expect(env.STUDIO_IMAGE).toBe(options.image);
      expect(env.MINIO_IMAGE).toBe(options.minioImage);
      expect(env.STUDIO_TELEMETRY).toBe('on');
      expect(JSON.parse(env.STUDIO_DATABASE_ALLOWED_LOGINS!)).toEqual([
        'studio_migrator',
        'studio_runtime',
        'studio_maintenance_runtime',
        'studio_backup_login',
      ]);
      expect(await readdir(output)).not.toContain('.configure.lock');
      expect(await readFile(join(output, 'docker-compose.yml'), 'utf8')).toBe(
        await readFile(join(templateRoot, 'docker-compose.yml'), 'utf8'),
      );
      expect(
        await readFile(join(output, 'deployment/encryption.yml'), 'utf8'),
      ).toBe(
        await readFile(join(templateRoot, 'deployment/encryption.yml'), 'utf8'),
      );
      const postgresInit = await readFile(
        join(output, 'deployment/postgres-init.sql'),
        'utf8',
      );
      expect(postgresInit).not.toContain('/* STUDIO_');
      expect(postgresInit).toContain(
        'GRANT studio_app TO studio_runtime WITH SET TRUE, INHERIT FALSE',
      );
      expect(postgresInit).toContain(
        'GRANT studio_maintenance TO studio_maintenance_runtime WITH SET TRUE, INHERIT FALSE',
      );
      expect(postgresInit).toContain(
        'REVOKE EXECUTE ON FUNCTION pg_catalog.lo_create(oid)',
      );
      const postgresPrivileges = await readFile(
        join(output, 'deployment/postgres-privileges.sql'),
        'utf8',
      );
      expect(postgresPrivileges).not.toContain('/* STUDIO_');
      expect(postgresPrivileges).toContain(
        'REVOKE EXECUTE ON FUNCTION pg_catalog.lo_create(oid)',
      );
    });
  });

  it('never overwrites or redisplays credentials on a repeated configuration call', async () => {
    await fixture(async (output) => {
      await configureDeployment({ ...options, output }, templateRoot);
      const before = await readFile(join(output, '.env'));
      await expect(
        configureDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('must be empty');
      expect(await readFile(join(output, '.env'))).toEqual(before);
      expect(await readdir(output)).not.toContain('.configure.lock');
    });
  });

  it('allows exactly one concurrent initialization and preserves its returned token', async () => {
    await fixture(async (output) => {
      const results = await Promise.allSettled([
        configureDeployment({ ...options, output }, templateRoot),
        configureDeployment({ ...options, output }, templateRoot),
      ]);
      const accepted = results.filter(
        (result) => result.status === 'fulfilled',
      );
      expect(accepted).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const env = await readConfiguration(output);
      expect(accepted[0]!.value.bootstrapToken).toBe(
        env.STUDIO_BOOTSTRAP_TOKEN,
      );
    });
  });

  it.each([
    { domain: 'https://studio.example.test' },
    { domain: 'localhost' },
    { email: 'operator@example.test\nSECRET=injected' },
    { image: 'ghcr.io/example/studio:latest' },
    { minioImage: 'registry/object-store:latest' },
  ])(
    'refuses invalid or mutable inputs before writing anything',
    async (invalid) => {
      await fixture(async (output) => {
        await expect(
          configureDeployment({ ...options, ...invalid, output }, templateRoot),
        ).rejects.toThrow();
        expect(await readdir(output)).toEqual([]);
      });
    },
  );

  it('preserves an existing file and refuses an incomplete template bundle without credentials', async () => {
    await fixture(async (output) => {
      await writeFile(join(output, 'keep.txt'), 'existing data');
      await expect(
        configureDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('must be empty');
      expect(await readFile(join(output, 'keep.txt'), 'utf8')).toBe(
        'existing data',
      );
      await expect(
        configureDeployment(
          { ...options, output },
          join(output, 'absent-templates'),
        ),
      ).rejects.toThrow();
      expect(await readdir(output)).toEqual(['keep.txt']);
    });
  });

  it('requires every command argument once and refuses duplicate or extra arguments', () => {
    const args = [
      '--domain',
      options.domain,
      '--email',
      options.email,
      '--image',
      options.image,
      '--minio-image',
      options.minioImage,
      '--output',
      '/configuration',
    ];
    expect(parseConfigureArguments(args)).toEqual({
      ...options,
      output: '/configuration',
    });
    for (const invalid of [
      args.slice(0, -2),
      [...args, '--image', options.image],
      [...args, '--token', 'operator-chosen-token'],
    ])
      expect(() => parseConfigureArguments(invalid)).toThrow();
  });
});
