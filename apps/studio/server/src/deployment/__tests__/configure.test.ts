import { spawnSync } from 'node:child_process';
import {
  cp,
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
import { z } from 'zod';

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
      expect(env.STUDIO_DATABASE_ALLOWED_LOGINS).toContain(
        'studio_maintenance_runtime',
      );
      expect(
        await readFile(join(output, 'deployment/encryption.yml'), 'utf8'),
      ).toContain('studio_maintenance_runtime');
      expect(await readdir(output)).not.toContain('.configure.lock');
      expect(await readFile(join(output, 'docker-compose.yml'), 'utf8')).toBe(
        await readFile(join(templateRoot, 'docker-compose.yml'), 'utf8'),
      );
    });
  });

  it('renders the complete singleton login inventory into actual Compose services', async () => {
    await fixture(async (output) => {
      await configureDeployment({ ...options, output }, templateRoot);
      const env = await readConfiguration(output);
      const rendered = spawnSync(
        'docker',
        [
          'compose',
          '--profile',
          '*',
          '-f',
          'docker-compose.yml',
          '-f',
          'deployment/encryption.yml',
          'config',
          '--format',
          'json',
        ],
        {
          cwd: output,
          encoding: 'utf8',
          timeout: 15_000,
          maxBuffer: 1024 * 1024,
        },
      );
      expect(rendered.error).toBeUndefined();
      expect(rendered.status).toBe(0);
      const services = z
        .object({
          services: z.record(
            z.string(),
            z.object({
              environment: z.record(z.string(), z.string()).optional(),
            }),
          ),
        })
        .parse(JSON.parse(rendered.stdout)).services;
      const inventory = JSON.stringify([
        'studio_migrator',
        'studio_runtime',
        'studio_maintenance_runtime',
        'studio_backup_login',
      ]);
      const appUrl = `postgresql://studio_runtime:${env.STUDIO_DATABASE_PASSWORD}@postgres:5432/studio`;
      const maintenanceUrl = `postgresql://studio_maintenance_runtime:${env.STUDIO_MAINTENANCE_DATABASE_PASSWORD}@postgres:5432/studio`;
      expect(services.studio?.environment).toMatchObject({
        DATABASE_URL: appUrl,
        STUDIO_MAINTENANCE_DATABASE_URL: maintenanceUrl,
        STUDIO_DATABASE_ALLOWED_LOGINS: inventory,
      });
      expect(services.worker?.environment).toMatchObject({
        DATABASE_URL: '',
        STUDIO_MAINTENANCE_DATABASE_URL: maintenanceUrl,
        STUDIO_DATABASE_ALLOWED_LOGINS: inventory,
      });
      expect(services['encryption-verify']?.environment).toMatchObject({
        DATABASE_URL: maintenanceUrl,
        STUDIO_DATABASE_ALLOWED_LOGINS: inventory,
      });
      for (const name of ['worker', 'encryption-verify', 'backup-verify']) {
        expect(Object.values(services[name]?.environment ?? {})).not.toContain(
          appUrl,
        );
      }
      expect(services['backup-verify']?.environment).toEqual({
        DATABASE_URL: `postgresql://studio_backup_login:${env.STUDIO_BACKUP_PASSWORD}@postgres:5432/studio`,
        STUDIO_DATABASE_ALLOWED_LOGINS: inventory,
      });
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

  it('removes an owned partial file when its write fails', async () => {
    await fixture(async (output) => {
      await expect(
        configureDeployment({ ...options, output }, templateRoot, {
          write: async (file, bytes) => {
            await file.write(bytes.subarray(0, 7));
            throw new Error('synthetic partial write');
          },
        }),
      ).rejects.toThrow('synthetic partial write');
      expect(await readdir(output)).toEqual([]);
    });
  });

  it.each([
    ['deployment/postgres-init.sql', '/* STUDIO_RUNTIME_ROLES */'],
    ['deployment/postgres-init.sql', '/* STUDIO_LARGE_OBJECT_PRIVILEGES */'],
    [
      'deployment/postgres-privileges.sql',
      '/* STUDIO_LARGE_OBJECT_PRIVILEGES */',
    ],
  ])(
    'refuses a missing or repeated provisioning marker in %s before writing credentials',
    async (name, marker) => {
      await fixture(async (output) => {
        await fixture(async (templates) => {
          await cp(templateRoot, templates, {
            recursive: true,
            filter: (source) =>
              !source.includes('node_modules') &&
              !source.includes('/.git') &&
              !source.includes('/client') &&
              !source.includes('/server'),
          });
          const original = await readFile(join(templates, name), 'utf8');
          for (const replacement of ['', `${marker}\n${marker}`]) {
            await writeFile(
              join(templates, name),
              original.replace(marker, replacement),
            );
            await expect(
              configureDeployment({ ...options, output }, templates),
            ).rejects.toThrow('Invalid database provisioning template');
            expect(await readdir(output)).toEqual([]);
          }
        });
      });
    },
  );

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
