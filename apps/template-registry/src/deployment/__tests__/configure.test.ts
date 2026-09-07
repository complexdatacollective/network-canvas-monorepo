import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
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
  renderRegistryDeploymentTemplate,
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
  it('limits public rendering to the signed Registry template inventory', () => {
    expect(() =>
      renderRegistryDeploymentTemplate('unrelated.env', Buffer.from('value')),
    ).toThrow('Unknown Registry deployment template');
  });

  it('renders public Registry provisioning and writes independent private inputs', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const env = await environment(output);
      expect((await stat(join(output, 'registry.env'))).mode & 0o777).toBe(
        0o600,
      );
      expect(registryConfigurationFiles).toHaveLength(6);
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
      expect(env.REGISTRY_SMTP_URL).toBe(options.smtpUrl);
      expect(env.REGISTRY_DOMAIN).toBe(options.domain);
      expect(env.REGISTRY_S3_ACCESS_KEY_ID).toMatch(/^registry_/);
    });
  });

  it('retains generated Registry credentials across a public configuration rerun', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const before = await environment(output);
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const after = await environment(output);
      for (const name of generatedNames) expect(after[name]).toBe(before[name]);
      await expect(
        configureRegistryDeployment(
          { ...options, domain: 'catalog.example.test', output },
          templateRoot,
        ),
      ).rejects.toThrow('already initialized');
      expect(await environment(output)).toEqual(after);
      expect(await readdir(output)).not.toContain('.registry-configure.lock');
    });
  });

  it('refuses mutated public templates and unsafe private modes without changing the generation', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const template = join(output, 'deployment/registry/compose.yml');
      const original = await readFile(template);
      await writeFile(
        template,
        Buffer.concat([original, Buffer.from('# changed\n')]),
      );
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('templates differ');
      expect(await readFile(template)).not.toEqual(original);

      await writeFile(template, original);
      const environmentPath = join(output, 'registry.env');
      const environmentBytes = await readFile(environmentPath);
      await chmod(environmentPath, 0o400);
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('mode0600');
      expect(await readFile(environmentPath)).toEqual(environmentBytes);
    });
  });

  it('removes a partially written owned deployment template', async () => {
    await fixture(async (output) => {
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot, {
          write: async (file, bytes) => {
            await file.write(bytes.subarray(0, 7));
            throw new Error('synthetic template write failure');
          },
        }),
      ).rejects.toThrow('synthetic template write failure');
      expect(await readdir(output)).toEqual([]);
    });
  });

  it('does not publish a credential marker when the final staged write partially fails', async () => {
    await fixture(async (output) => {
      let writes = 0;
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot, {
          write: async (file, bytes) => {
            writes += 1;
            if (writes === registryConfigurationFiles.length + 1) {
              await file.write(bytes.subarray(0, 7));
              throw new Error('synthetic private write failure');
            }
            await file.writeFile(bytes);
          },
        }),
      ).rejects.toThrow('synthetic private write failure');
      expect(await readdir(output)).toEqual([]);
    });
  });

  it('refuses a symlinked deployment root and leaves pre-existing data intact', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const deployment = join(output, 'deployment');
      const retained = await mkdtemp(
        join(tmpdir(), 'registry-configure-link-'),
      );
      try {
        await rm(deployment, { recursive: true });
        await symlink(retained, deployment);
        await expect(
          configureRegistryDeployment({ ...options, output }, templateRoot),
        ).rejects.toThrow('incomplete');
        expect((await lstat(deployment)).isSymbolicLink()).toBe(true);
      } finally {
        await rm(retained, { recursive: true, force: true });
      }
    });
  });

  it('refuses extra public deployment entries and private environment names', async () => {
    await fixture(async (output) => {
      await configureRegistryDeployment({ ...options, output }, templateRoot);
      const deployment = join(output, 'deployment');
      const unexpected = await mkdtemp(join(deployment, 'unexpected-'));
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('incomplete');
      expect(await readdir(deployment)).toContain(unexpected.split('/').at(-1));

      await rm(unexpected, { recursive: true });
      const environmentPath = join(output, 'registry.env');
      await writeFile(
        environmentPath,
        (await readFile(environmentPath, 'utf8')) + 'EXTRA=value\n',
      );
      await expect(
        configureRegistryDeployment({ ...options, output }, templateRoot),
      ).rejects.toThrow('private configuration is incomplete');
      expect(await readFile(environmentPath, 'utf8')).toContain('EXTRA=value');
    });
  });

  it.each([
    { domain: 'https://registry.example.test' },
    { mailFrom: 'registry@example.test\nINJECTED=value' },
    { registryImage: 'ghcr.io/example/registry:latest' },
    { smtpUrl: undefined, postmarkServerToken: undefined },
    { smtpUrl: "smtps://user:pass'@mail.example.test" },
    { postmarkServerToken: 'token\nINJECTED=value', smtpUrl: undefined },
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

  it('carries only validated generated credentials into a new Registry generation', async () => {
    const previous = await mkdtemp(
      join(tmpdir(), 'registry-configure-previous-'),
    );
    await fixture(async (output) => {
      try {
        await configureRegistryDeployment(
          { ...options, output: previous },
          templateRoot,
        );
        const before = await environment(previous);
        const oldEnvironmentBytes = await readFile(
          join(previous, 'registry.env'),
        );
        const oldTemplateBytes = await readFile(
          join(previous, 'deployment/registry/postgres-init.sql'),
        );
        await configureRegistryDeployment(
          {
            ...options,
            registryImage: `ghcr.io/example/registry@sha256:${'3'.repeat(64)}`,
            output,
            previousConfigurationRoot: previous,
          },
          templateRoot,
        );
        const after = await environment(output);
        for (const name of generatedNames)
          expect(after[name]).toBe(before[name]);
        expect(after.REGISTRY_IMAGE).toMatch(/3{64}$/);
        expect(await readFile(join(previous, 'registry.env'))).toEqual(
          oldEnvironmentBytes,
        );
        expect(
          await readFile(
            join(previous, 'deployment/registry/postgres-init.sql'),
          ),
        ).toEqual(oldTemplateBytes);
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    });
  });

  it('refuses an unsafe previous Registry root without generating replacement credentials', async () => {
    const previous = await mkdtemp(
      join(tmpdir(), 'registry-configure-unsafe-'),
    );
    await fixture(async (output) => {
      try {
        await writeFile(
          join(previous, 'registry.env'),
          'REGISTRY_AUTH_SECRET=unsafe\n',
        );
        await expect(
          configureRegistryDeployment(
            {
              ...options,
              output,
              previousConfigurationRoot: previous,
            },
            templateRoot,
          ),
        ).rejects.toThrow();
        expect(await readdir(output)).toEqual([]);
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    });
  });

  it('refuses malformed retained credentials and aliased transition roots without modifying either root', async () => {
    const previous = await mkdtemp(
      join(tmpdir(), 'registry-configure-malformed-'),
    );
    await fixture(async (output) => {
      try {
        await configureRegistryDeployment(
          { ...options, output: previous },
          templateRoot,
        );
        const environmentPath = join(previous, 'registry.env');
        const before = await readFile(environmentPath);
        await writeFile(
          environmentPath,
          before
            .toString()
            .replace(
              /REGISTRY_AUTH_SECRET='[^']+'/,
              "REGISTRY_AUTH_SECRET='x'",
            ),
        );
        const malformed = await readFile(environmentPath);
        await expect(
          configureRegistryDeployment(
            { ...options, output, previousConfigurationRoot: previous },
            templateRoot,
          ),
        ).rejects.toThrow('private configuration is incomplete');
        expect(await readFile(environmentPath)).toEqual(malformed);
        expect(await readdir(output)).toEqual([]);

        const postgresPassword = /REGISTRY_POSTGRES_PASSWORD='([^']+)'/.exec(
          before.toString(),
        )?.[1];
        expect(postgresPassword).toBeDefined();
        await writeFile(
          environmentPath,
          before
            .toString()
            .replace(
              /REGISTRY_AUTH_SECRET='[^']+'/,
              `REGISTRY_AUTH_SECRET='${postgresPassword}'`,
            ),
        );
        await expect(
          configureRegistryDeployment(
            { ...options, output, previousConfigurationRoot: previous },
            templateRoot,
          ),
        ).rejects.toThrow('private configuration is incomplete');
        expect(await readdir(output)).toEqual([]);

        const nestedOutput = join(previous, 'next');
        await expect(
          configureRegistryDeployment(
            {
              ...options,
              output: nestedOutput,
              previousConfigurationRoot: previous,
            },
            templateRoot,
          ),
        ).rejects.toThrow('separate configuration roots');
        await expect(lstat(nestedOutput)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    });
  });
});
