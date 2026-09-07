import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { releasedDistribution } from '../../../../scripts/test-support/studio-release.mjs';
import configurationFiles from '../../deployment/installer/configuration-files.json' with { type: 'json' };
import { privateDirectory } from '../../deployment/installer/files.mjs';
import { executeOperation } from '../../deployment/installer/operation.mjs';
import { readRelease, sha256 } from '../../deployment/installer/release.mjs';
import { localDeployment } from './compose.ts';
import { owner, rpc } from './data.ts';

type CommandOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: string | Buffer;
  timeout?: number;
};

it('keeps real Studio containers running for a same-image template update and retries its private smoke safely', async () => {
  const fixture = await localDeployment('installer-operation');
  const root = privateDirectory(join(fixture.root, 'installation'));
  const data = privateDirectory(join(fixture.root, 'independent-data'));
  const keys = privateDirectory(join(fixture.root, 'independent-keys'));
  const credentialsFile = join(fixture.root, 'private-credentials.json');
  await writeFile(
    credentialsFile,
    JSON.stringify({ email: owner.email, password: owner.password }),
    { mode: 0o600 },
  );
  const project = `studio-${sha256(root).slice(0, 24)}`;
  const overlay = join(fixture.root, 'installer-qualification.yml');
  const proxy = join(fixture.root, 'installer-proxy.yml');
  const commands = join(fixture.root, 'installer-commands.log');
  await writeFile(
    proxy,
    `http:
  routers:
    probe:
      rule: PathPrefix(\x60/\x60)
      service: studio
  services:
    studio:
      loadBalancer:
        servers:
          - url: http://studio:3000
`,
  );
  await writeFile(
    overlay,
    `services:
  studio:
    ports: ["127.0.0.1:${fixture.ports.web}:3000"]
    environment:
      STUDIO_TELEMETRY: 'off'
  worker:
    environment:
      STUDIO_TELEMETRY: 'off'
  traefik:
    command: !override [--entrypoints.probe.address=:3000, --providers.file.filename=/probe.yml, --global.checknewversion=false, --global.sendanonymoususage=false]
    ports: !override ["127.0.0.1:${fixture.ports.s3}:3000"]
    volumes: !override ["${proxy}:/probe.yml:ro"]
    networks: !override
      edge: {}
networks:
  edge: !override
    name: ${project}_edge
`,
  );
  const localReferences = {
    studio: fixture.images.studio,
    // Registry is not deployed in this Studio-only command qualification.
    registry: fixture.images.studio,
    minio: fixture.images.minio,
    postgres:
      'postgres:18.6-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2',
    traefik:
      'traefik:v3.7.1@sha256:6b9cbca6fac42ab0075f5437d8dc1685cfd188626d8d515839ea94f8b6271c42',
    minioClient:
      'quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727',
  };
  function execute(
    program: string,
    args: string[],
    options: CommandOptions = {},
  ) {
    // Logs contain command names/arguments, never credential stdin, env or
    // configure stdout. The fixture has no primary registry/account credentials.
    appendFileSync(commands, `${program} ${JSON.stringify(args)}\n`);
    return execFileSync(program, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 120_000,
      env: { ...options.env, ...fixture.dockerEnvironment },
    });
  }
  const inspections = Object.fromEntries(
    Object.entries(localReferences).map(([name, reference]) => {
      const result = JSON.parse(
        execute('docker', [
          'image',
          'inspect',
          '--format',
          '{{json .}}',
          reference,
        ]),
      ) as { Id: string; Os: string; Architecture: string };
      return [name, result];
    }),
  );
  const rawDirectory = privateDirectory(join(fixture.root, 'raw-templates'));
  const rawTemplates = new Map<string, Buffer>();
  for (const name of configurationFiles) {
    const bytes = await readFile(new URL(`../../${name}`, import.meta.url));
    rawTemplates.set(name, bytes);
    await mkdir(dirname(join(rawDirectory, name)), { recursive: true });
    await writeFile(join(rawDirectory, name), bytes);
  }
  await fixture.configure(rawDirectory);
  const templates = new Map(
    await Promise.all(
      configurationFiles.map(
        async (name) =>
          [name, await readFile(join(fixture.directory, name))] as const,
      ),
    ),
  );
  const source = fileURLToPath(
    new URL('../../deployment/installer/', import.meta.url),
  );
  const credentials = { email: owner.email, password: owner.password };
  let release: ReturnType<typeof readRelease>;
  let selectedReferences = new Map<string, string>();
  let selectedConfiguration: string | undefined;
  let migrationAttempts = 0;
  let refusedSmoke = false;
  const run = (
    program: string,
    args: string[],
    options: CommandOptions = {},
  ) => {
    // This boundary deliberately substitutes only remote signature/pull answers.
    // It qualifies real operator sequencing, not GitHub OIDC signing, a Registry
    // deployment, or compatibility between two different backend image versions.
    if (program === 'cosign') return 'local command qualification only';
    if (program === 'docker' && args[0] === 'pull') return '';
    if (program === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
      const name = selectedReferences.get(args.at(-1)!);
      if (name) return JSON.stringify(inspections[name]);
    }
    if (program === 'docker' && args[0] === 'compose') {
      const addition = args.indexOf('--profile');
      args = [
        ...args.slice(0, addition),
        '-f',
        overlay,
        ...args.slice(addition),
      ];
      if (args.at(-1) === 'migrate') migrationAttempts++;
      if (
        args.includes('--input-type=module') &&
        !refusedSmoke &&
        (JSON.parse(options.input?.toString() ?? '{}') as { mode?: unknown })
          .mode === 'update'
      ) {
        refusedSmoke = true;
        throw new Error(
          'Injected private-smoke interruption after real migration',
        );
      }
    }
    if (program === 'sh') {
      options = {
        ...options,
        env: {
          ...options.env,
          COMPOSE_FILE: `${options.env?.COMPOSE_FILE}:${overlay}`,
        },
      };
    }
    return execute(program, args, options);
  };
  function containerIds(configuration: string) {
    return Object.fromEntries(
      ['postgres', 'minio', 'studio', 'worker', 'traefik'].map((service) => [
        service,
        execute('docker', [
          'compose',
          '--project-name',
          project,
          '--env-file',
          join(configuration, '.env'),
          '-f',
          join(configuration, 'docker-compose.yml'),
          '-f',
          join(configuration, 'deployment/release-images.yml'),
          '-f',
          overlay,
          '--profile',
          '*',
          'ps',
          '--quiet',
          service,
        ]).trim(),
      ]),
    );
  }
  async function bundle(
    generation: number,
    previous: ReturnType<typeof readRelease>[] = [],
  ) {
    const synthetic = releasedDistribution(generation, previous);
    selectedReferences = new Map(
      Object.entries(synthetic.value.images).map(([name, image]) => [
        image.reference,
        name,
      ]),
    );
    for (const [name, image] of Object.entries(synthetic.value.images)) {
      const info = inspections[name]!;
      image.configurations = { [`${info.Os}/${info.Architecture}`]: info.Id };
    }
    release = readRelease(Buffer.from(JSON.stringify(synthetic.value)));
    const directory = privateDirectory(
      join(fixture.root, `installer-${generation}`),
    );
    const files = new Map<string, Buffer>();
    for (const name of [
      'install.mjs',
      'operation.mjs',
      'files.mjs',
      'release.mjs',
      'verify.mjs',
      'smoke.mjs',
      'configuration-files.json',
    ])
      files.set(name, await readFile(join(source, name)));
    // This second release changes its deployment template while reusing the
    // same actual image bytes. Embedded templates must not override the bundle.
    if (generation > 1) {
      const comment = Buffer.from(
        `\n# Selected installer generation ${generation}\n`,
      );
      for (const contents of [rawTemplates, templates])
        contents.set(
          'docker-compose.yml',
          Buffer.concat([contents.get('docker-compose.yml')!, comment]),
        );
    }
    for (const [name, bytes] of rawTemplates)
      files.set(`templates/${name}`, bytes);
    for (const [name, bytes] of templates)
      files.set(`configuration/${name}`, bytes);
    files.set('release.json', Buffer.from(JSON.stringify(synthetic.value)));
    files.set('release.sigstore.json', Buffer.from('{}'));
    const metadata = {
      format: 1,
      source: release.current.source,
      manifestSha256: release.current.digest,
      files: Object.fromEntries(
        [...files].map(([name, bytes]) => [name, sha256(bytes)]),
      ),
    };
    files.set('installer.json', Buffer.from(JSON.stringify(metadata)));
    for (const [name, bytes] of files) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await writeFile(join(directory, name), bytes);
    }
    return {
      directory: root,
      bundleDirectory: directory,
      expectedDigest: release.current.digest,
      domain: 'studio.example.test',
      email: 'operator@example.test',
      credentialsFile,
      backupDirectory: data,
      keyCustodyDirectory: keys,
      actualConfigurations: Object.values(synthetic.value.images).map(
        ({ configurations }) => configurations,
      ),
    };
  }
  try {
    const firstOptions = await bundle(1);
    const firstRelease = release!;
    const first = executeOperation(firstOptions, run);
    selectedConfiguration = first.configuration;
    const { bootstrapToken } = z
      .object({ bootstrapToken: z.string() })
      .parse(first.setup);
    expect(bootstrapToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const client = rpc(fixture.origin, '', 'https://studio.example.test');
    expect(
      await client.setup.complete({
        token: bootstrapToken,
        instanceName: 'Real installer qualification',
        ownerName: owner.name,
        ownerEmail: owner.email,
        ownerPassword: owner.password,
      }),
    ).toEqual({ state: 'complete' });
    expect((await fetch(`${fixture.origin}/setup`)).status).toBe(404);
    const beforeUpdate = containerIds(first.configuration);
    expect(Object.values(beforeUpdate).every((id) => id.length > 0)).toBe(
      true,
    );
    const commandsBeforeUpdate = readFileSync(commands, 'utf8').length;
    const nextOptions = await bundle(2, [firstRelease]);
    const nextRelease = release!;
    // The manifest references differ, but the inspected Linux configuration
    // IDs are deliberately identical. This is a Compose-template-only update,
    // not compatibility evidence for distinct backend images.
    expect(nextOptions.actualConfigurations).toEqual(
      firstOptions.actualConfigurations,
    );
    expect(() => executeOperation(nextOptions, run)).toThrow(
      'Injected private-smoke interruption',
    );
    expect(refusedSmoke).toBe(true);
    const countsBeforeRetry = await readdir(data);
    expect(countsBeforeRetry).toHaveLength(0);
    const protectedState = JSON.parse(
      await readFile(join(root, 'control/state.json'), 'utf8'),
    ) as { active: { digest: string }; highest: { digest: string } };
    expect(protectedState.active.digest).toBe(firstRelease.current.digest);
    expect(protectedState.highest.digest).toBe(nextRelease.current.digest);
    const retry = executeOperation(nextOptions, run);
    selectedConfiguration = retry.configuration;
    expect(retry.setup).toBeUndefined();
    expect(
      await readFile(join(retry.configuration, 'docker-compose.yml'), 'utf8'),
    ).toContain('# Selected installer generation 2');
    expect(
      await readFile(join(first.configuration, 'docker-compose.yml'), 'utf8'),
    ).not.toContain('# Selected installer generation 2');
    expect(await readdir(data)).toEqual(countsBeforeRetry);
    expect((await readdir(keys)).length).toBe(0);
    expect((await fetch(`${fixture.origin}/setup`)).status).toBe(404);
    expect((await fetch(`${fixture.origin}/readyz`)).status).toBe(200);
    expect(containerIds(retry.configuration)).toEqual(beforeUpdate);
    const updateCommands = readFileSync(commands, 'utf8').slice(
      commandsBeforeUpdate,
    );
    expect(updateCommands).not.toContain('"stop"');
    expect(updateCommands).not.toContain('"up"');
    expect(updateCommands).not.toContain('"migrate"');
    expect(updateCommands).not.toContain('sh [');
    expect(migrationAttempts).toBe(1);
    expect(readFileSync(commands, 'utf8')).not.toContain(credentials.password);
    expect(
      (
        JSON.parse(
          await readFile(join(root, 'control/state.json'), 'utf8'),
        ) as { active: { digest: string } }
      ).active.digest,
    ).toBe(nextRelease.current.digest);
    const exactRetryStart = readFileSync(commands, 'utf8').length;
    expect(executeOperation(nextOptions, run).state).toBe('active');
    expect(containerIds(retry.configuration)).toEqual(beforeUpdate);
    const exactRetryCommands = readFileSync(commands, 'utf8').slice(
      exactRetryStart,
    );
    expect(exactRetryCommands).not.toContain('"up"');
  } finally {
    // Only this test's derived project may be removed. A failed earlier attempt
    // still has its selected generation's public config available for cleanup.
    if (!selectedConfiguration) {
      const generations = await readdir(join(root, 'releases')).catch(() => []);
      selectedConfiguration = generations.length
        ? join(root, 'releases', generations[0]!, 'configuration')
        : undefined;
    }
    if (selectedConfiguration)
      execute('docker', [
        'compose',
        '--project-name',
        project,
        '--env-file',
        join(selectedConfiguration, '.env'),
        '-f',
        join(selectedConfiguration, 'docker-compose.yml'),
        '-f',
        join(selectedConfiguration, 'deployment/release-images.yml'),
        '-f',
        overlay,
        '--profile',
        '*',
        'down',
        '--volumes',
        '--remove-orphans',
      ]);
    await fixture.dispose();
  }
});
