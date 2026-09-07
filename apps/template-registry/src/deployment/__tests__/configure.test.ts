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

import {
  configureRegistryDeployment,
  registryConfigurationFiles,
} from '../configure.ts';

const templateRoot = fileURLToPath(
  new URL('../../../deployment', import.meta.url),
);
const options = {
  domain: 'registry.example.test',
  mailFrom: 'registry@example.test',
  registryImage: `ghcr.io/example/registry@sha256:${'1'.repeat(64)}`,
  minioImage: `ghcr.io/example/minio@sha256:${'2'.repeat(64)}`,
  smtpUrl: 'smtps://registry:synthetic@mail.example.test',
};
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
];

async function fixture(work: (output: string) => Promise<void>) {
  const output = await mkdtemp(join(tmpdir(), 'registry-configure-test-'));
  try {
    await work(output);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

async function environment(output: string) {
  return parseEnv(await readFile(join(output, 'registry.env'), 'utf8'));
}

describe('Registry deployment configuration', () => {
  it('renders public Registry provisioning and writes independent private inputs', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const env = await environment(output);
      expect((await stat(join(output, 'registry.env'))).mode & 0o777).toBe(
        0o600,
      );
      expect(registryConfigurationFiles).toHaveLength(4);
      for (const name of registryConfigurationFiles)
        expect(
          await readFile(join(output, 'deployment/registry', name)),
        ).toBeInstanceOf(Buffer);
      const sql = await readFile(
        join(output, 'deployment/registry/postgres-init.sql'),
        'utf8',
      );
      expect(sql).not.toMatch(
        /REGISTRY_RUNTIME_ROLES|REGISTRY_LARGE_OBJECT_PRIVILEGES/,
      );
      expect(sql).toContain('CREATE ROLE "registry_app" NOLOGIN NOSUPERUSER');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION pg_catalog.lo_create');
      const values = generatedNames.map((name) => env[name]!);
      expect(values.every((value) => value.length >= 17)).toBe(true);
      expect(new Set(values).size).toBe(values.length);
      expect(env.REGISTRY_IMAGE).toBe(options.registryImage);
      expect(env.REGISTRY_DOMAIN).toBe(options.domain);
      expect(env.REGISTRY_S3_ACCESS_KEY_ID).toMatch(/^registry_/);
    });
  });

  it('retains generated Registry credentials across a public configuration rerun', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const before = await environment(output);
      await configureRegistryDeployment(
        { ...options, domain: 'catalog.example.test', output },
        templateRoot,
      );
      const after = await environment(output);
      for (const name of generatedNames) expect(after[name]).toBe(before[name]);
      expect(after.REGISTRY_DOMAIN).toBe('catalog.example.test');
      expect(await readdir(output)).not.toContain('.registry-configure.lock');
    });
  });

  it.each([
    { domain: 'https://registry.example.test' },
    { mailFrom: 'registry@example.test\nINJECTED=value' },
    { registryImage: 'ghcr.io/example/registry:latest' },
    { smtpUrl: undefined, postmarkServerToken: undefined },
    { postmarkMessageStream: 'outbound' },
  ])(
    'refuses unsafe or incomplete inputs before writing configuration: %j',
    async (invalid) => {
      await fixture(async (output) => {
        await expect(
          configureRegistryDeployment(
            { ...options, ...invalid, output },
            templateRoot,
          ),
        ).rejects.toThrow();
        expect(await readdir(output)).toEqual([]);
      });
    },
  );

  it('refuses an incomplete existing configuration and a malformed public template', async () => {
    await fixture(async (output) => {
      await writeFile(join(output, 'unexpected'), 'no');
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('incomplete');
      expect(await readFile(join(output, 'unexpected'), 'utf8')).toBe('no');
    });
    await fixture(async (output) => {
      const broken = await mkdtemp(join(tmpdir(), 'registry-template-broken-'));
      try {
        for (const name of registryConfigurationFiles)
          await writeFile(
            join(broken, name),
            name === 'postgres-init.sql'
              ? (await readFile(join(templateRoot, name), 'utf8')).replace(
                  '/* REGISTRY_RUNTIME_ROLES */',
                  '',
                )
              : await readFile(join(templateRoot, name)),
          );
        await expect(
          configureRegistryDeployment({ ...options, output }, broken),
        ).rejects.toThrow('Invalid Registry database provisioning template');
        expect(await readdir(output)).toEqual([]);
      } finally {
        await rm(broken, { recursive: true, force: true });
      }
    });
  });
});
