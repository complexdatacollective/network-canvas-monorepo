import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv, promisify } from 'node:util';

import { Pool } from 'pg';

import { createMaintenancePool, createPool } from '../src/db/pool.ts';
import {
  assertNoProcessTelemetryEgress,
  assertNoTelemetryEgress,
  assertProcessTelemetryInstrumentationPositive,
  assertTelemetryDetectorObserved,
  assertTelemetryDetectorPositive,
  TELEMETRY_CANARY_SOURCE,
  TELEMETRY_DETECTOR_SOURCE,
  TELEMETRY_IMPLEMENTATION_CANARY_SOURCE,
  TELEMETRY_PROCESS_CANARY_SOURCE,
  TELEMETRY_PROCESS_PRELOAD_SOURCE,
} from './telemetry-egress.ts';

const execFileAsync = promisify(execFile);

async function localDockerEnvironment(root: string) {
  // Discover only the local transport and Compose binary. The drill must not
  // inherit cloud credentials, registry logins, credential helpers or contexts.
  const { stdout: socket } = await execFileAsync(
    'docker',
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
    { timeout: 30_000 },
  );
  if (!socket.trim().startsWith('unix://'))
    throw new Error('Qualification requires a local Docker Unix socket.');
  const { stdout } = await execFileAsync(
    'docker',
    ['info', '--format', '{{json .ClientInfo.Plugins}}'],
    { timeout: 30_000 },
  );
  const plugins: unknown = JSON.parse(stdout);
  if (!Array.isArray(plugins))
    throw new Error('Docker plugins are unavailable.');
  const compose: unknown = plugins.find(
    (plugin: unknown) =>
      plugin !== null &&
      typeof plugin === 'object' &&
      'Name' in plugin &&
      plugin.Name === 'compose',
  );
  if (
    !compose ||
    typeof compose !== 'object' ||
    !('Path' in compose) ||
    typeof compose.Path !== 'string'
  )
    throw new Error('The local Docker Compose plugin is unavailable.');
  const configuration = join(root, 'credential-free-docker');
  await mkdir(join(configuration, 'cli-plugins'), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(join(configuration, 'config.json'), '{}\n', { mode: 0o600 });
  await symlink(
    compose.Path,
    join(configuration, 'cli-plugins/docker-compose'),
  );
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    DOCKER_HOST: socket.trim(),
    DOCKER_CONFIG: configuration,
  };
}

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export async function localDeployment(label: string) {
  const image = process.env.STUDIO_QUALIFICATION_IMAGE;
  const minioImage = process.env.STUDIO_QUALIFICATION_MINIO_IMAGE;
  const registryImage = process.env.STUDIO_QUALIFICATION_REGISTRY_IMAGE;
  if (!image || !minioImage || !registryImage)
    throw new Error(
      'Qualification requires explicitly built Studio, Registry and MinIO images.',
    );
  const project = `studio-qualification-${label}-${randomBytes(5).toString('hex')}`;
  const root = await mkdtemp(join(tmpdir(), `${project}-`));
  const directory = join(root, 'configuration');
  await mkdir(directory, { mode: 0o700 });
  const log = join(root, 'commands.log');
  const ports = { web: await port(), db: await port(), s3: await port() };
  const subnetIdentity = randomBytes(2);
  const subnetSecondOctet = 128 + (subnetIdentity[0]! % 64);
  const subnetThirdOctet = subnetIdentity[1]! & 0xfe;
  const edgeSubnet = `10.${subnetSecondOctet}.${subnetThirdOctet + 1}.0/24`;
  const proxyIp = `10.${subnetSecondOctet}.${subnetThirdOctet + 1}.2`;
  const dockerEnvironment = await localDockerEnvironment(root);
  const environment = {
    ...dockerEnvironment,
    STUDIO_IMAGE: image,
    MINIO_IMAGE: minioImage,
    REGISTRY_IMAGE: registryImage,
    STUDIO_PROXY_SUBNET: edgeSubnet,
    STUDIO_PROXY_IP: proxyIp,
    COMPOSE_PROJECT_NAME: project,
    // Every command supplies its Compose files explicitly. Keeping the
    // inherited variable empty prevents deployment scripts from accidentally
    // consuming the qualification-only overlay.
    COMPOSE_FILE: '',
  };
  const origin = `http://127.0.0.1:${ports.web}`;
  async function execute(
    command: string,
    args: string[],
    options: {
      input?: Buffer;
      failure?: boolean;
      privateOutput?: boolean;
      environment?: Record<string, string>;
    } = {},
  ) {
    const child = spawn(command, args, {
      cwd: directory,
      env: { ...environment, ...options.environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.stdin.end(options.input);
    const deadline = setTimeout(() => child.kill('SIGKILL'), 180_000);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }).finally(() => clearTimeout(deadline));
    const stdout = Buffer.concat(output);
    if (!options.privateOutput)
      await appendFile(
        log,
        Buffer.concat([
          Buffer.from(`${command} completed (${code})\n`),
          stdout,
          ...errors,
        ]),
        { mode: 0o600 },
      );
    if (code !== 0 && !options.failure)
      throw new Error(
        `Compose qualification command failed; private evidence: ${log}`,
      );
    return { code, stdout, stderr: Buffer.concat(errors) };
  }
  const compose = (
    args: string[],
    options: Parameters<typeof execute>[2] = {},
  ) =>
    execute(
      'docker',
      [
        'compose',
        '--profile',
        '*',
        '--env-file',
        '.env',
        '--env-file',
        'registry.env',
        '-f',
        'docker-compose.yml',
        '-f',
        'deployment/registry/compose.yml',
        '-f',
        'qualification.yml',
        ...args,
      ],
      {
        ...options,
        environment: {
          STUDIO_ENCRYPTION_FILE: './deployment/encryption.env',
          ...options.environment,
        },
      },
    );
  async function configuration() {
    return {
      ...parseEnv(await readFile(join(directory, '.env'), 'utf8')),
      ...parseEnv(
        await readFile(join(directory, 'deployment/encryption.env'), 'utf8'),
      ),
    };
  }
  async function configure(templateRoot?: string) {
    // Local image qualification is independent of the signed installer gate.
    // The fictional immutable references cannot be used outside this harness;
    // Docker receives the explicit local image override above.
    const result = await execute(
      'docker',
      [
        'run',
        '--rm',
        '--network=none',
        '--read-only',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '--mount',
        `type=bind,source=${directory},target=/configuration`,
        ...(templateRoot
          ? [
              '--mount',
              `type=bind,source=${templateRoot},target=/app/deployment-bundle,readonly`,
            ]
          : []),
        image!,
        'configure',
        '--domain',
        'studio.example.test',
        '--email',
        'operator@example.test',
        '--image',
        `local.invalid/studio@sha256:${'1'.repeat(64)}`,
        '--minio-image',
        `local.invalid/minio@sha256:${'2'.repeat(64)}`,
        '--output',
        '/configuration',
      ],
      { privateOutput: true },
    );
    const output: unknown = JSON.parse(result.stdout.toString());
    if (
      !output ||
      typeof output !== 'object' ||
      !('bootstrapToken' in output) ||
      typeof output.bootstrapToken !== 'string'
    )
      throw new Error('Configuration did not return its bootstrap token.');
    const registryRoot = join(root, 'registry-configuration');
    await mkdir(registryRoot, { mode: 0o700 });
    const registryTemplateRoot =
      templateRoot ??
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../template-registry/deployment',
      );
    const registryInput = Buffer.from(
      JSON.stringify({
        domain: 'registry.example.test',
        mailFrom: 'registry@example.test',
        registryImage: `local.invalid/registry@sha256:${'3'.repeat(64)}`,
        minioImage: `local.invalid/minio@sha256:${'2'.repeat(64)}`,
        output: '/registry-configuration',
        smtpUrl: 'smtp://127.0.0.1:2525',
      }),
    ).toString('base64');
    await execute(
      'docker',
      [
        'run',
        '--rm',
        '--network=none',
        '--read-only',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '--mount',
        `type=bind,source=${registryRoot},target=/registry-configuration`,
        '--mount',
        `type=bind,source=${registryTemplateRoot},target=/app/deployment-bundle,readonly`,
        '--env',
        `REGISTRY_QUALIFICATION_INPUT=${registryInput}`,
        '--entrypoint',
        'node',
        registryImage!,
        '--input-type=module',
        '-e',
        "import { runRegistryConfigure } from './dist/configure.js'; await runRegistryConfigure(Buffer.from(process.env.REGISTRY_QUALIFICATION_INPUT, 'base64'));",
      ],
      { privateOutput: false },
    );
    await cp(
      join(registryRoot, 'registry.env'),
      join(directory, 'registry.env'),
    );
    await mkdir(join(directory, 'deployment/registry'), {
      recursive: true,
      mode: 0o700,
    });
    await cp(
      join(registryRoot, 'deployment/registry'),
      join(directory, 'deployment/registry'),
      { recursive: true },
    );
    await writeFile(
      join(directory, 'deployment/release-images.yml'),
      `services:
  studio:
    image: ${image}
    pull_policy: never
  client-assets:
    image: ${image}
    pull_policy: never
  worker:
    image: ${image}
    pull_policy: never
  backup-verify:
    image: ${image}
    pull_policy: never
  encryption-verify:
    image: ${image}
    pull_policy: never
  registry:
    image: ${registryImage}
    pull_policy: never
  registry-migrate:
    image: ${registryImage}
    pull_policy: never
  registry-backup-verify:
    image: ${registryImage}
    pull_policy: never
  registry-recover-verify:
    image: ${registryImage}
    pull_policy: never
  minio:
    image: ${minioImage}
    pull_policy: never
  registry-minio:
    image: ${minioImage}
    pull_policy: never
`,
      { mode: 0o600 },
    );
    return output.bootstrapToken;
  }
  async function overlay() {
    // Let Docker allocate fresh networks and non-overlapping subnets when
    // Compose creates this project. A pre-existing external network would
    // correctly fail the production restore target-isolation preflight.
    await writeFile(
      join(directory, 'probe.yml'),
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
      join(directory, 'telemetry-egress-preload.cjs'),
      TELEMETRY_PROCESS_PRELOAD_SOURCE,
      { mode: 0o600 },
    );
    await writeFile(
      join(directory, 'qualification.yml'),
      `services:
  studio:
    environment:
      PUBLIC_URL: ${origin}
      STUDIO_TELEMETRY: 'off'
      NODE_OPTIONS: '--require=/qualification-telemetry-egress-preload.cjs'
      STUDIO_DATABASE_ADMINISTRATIVE_LOGINS: '["studio_migrator"]'
      GOOGLE_CLIENT_ID: synthetic-qualification-client
      GOOGLE_CLIENT_SECRET: synthetic-qualification-secret
    volumes:
      - ./telemetry-egress-preload.cjs:/qualification-telemetry-egress-preload.cjs:ro
    depends_on:
      telemetry-detector:
        condition: service_started
  worker:
    environment:
      STUDIO_TELEMETRY: 'off'
      NODE_OPTIONS: '--require=/qualification-telemetry-egress-preload.cjs'
    volumes:
      - ./telemetry-egress-preload.cjs:/qualification-telemetry-egress-preload.cjs:ro
    depends_on:
      telemetry-detector:
        condition: service_started
  registry:
    environment:
      NODE_OPTIONS: '--require=/qualification-telemetry-egress-preload.cjs'
    volumes:
      - ./telemetry-egress-preload.cjs:/qualification-telemetry-egress-preload.cjs:ro
    depends_on:
      telemetry-detector:
        condition: service_started
  postgres:
    ports: ["127.0.0.1:${ports.db}:5432"]
    networks: [data, edge]
  minio:
    ports: ["127.0.0.1:${ports.s3}:9000"]
    networks: [data, edge]
  probe:
    image: traefik:v3.7.1@sha256:6b9cbca6fac42ab0075f5437d8dc1685cfd188626d8d515839ea94f8b6271c42
    command: [--entrypoints.probe.address=:3000, --providers.file.filename=/probe.yml, --global.checknewversion=false, --global.sendanonymoususage=false]
    ports: ["127.0.0.1:${ports.web}:3000"]
    volumes: [./probe.yml:/probe.yml:ro]
    networks: [data, edge]
  telemetry-detector:
    image: \${STUDIO_IMAGE:?Select the signed Studio image digest}
    entrypoint: [node, -e]
    command: [${JSON.stringify(TELEMETRY_DETECTOR_SOURCE)}]
    restart: unless-stopped
    read_only: true
    tmpfs: ["/tmp:size=1m,mode=1777"]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    networks:
      edge:
        aliases: [ph-relay.networkcanvas.com]
  traefik:
    ports: !reset []
`,
    );
  }
  async function pools() {
    const env = await configuration();
    const address = `127.0.0.1:${ports.db}/studio`;
    const db = {
      url: `postgresql://studio_runtime:${env.STUDIO_DATABASE_PASSWORD}@${address}`,
    };
    const maintenanceDb = {
      url: `postgresql://studio_maintenance_runtime:${env.STUDIO_MAINTENANCE_DATABASE_PASSWORD}@${address}`,
    };
    const admin = new Pool({
      connectionString: `postgresql://postgres:${env.POSTGRES_PASSWORD}@${address}`,
      connectionTimeoutMillis: 10_000,
    });
    const app = createPool(db);
    const maintenance = createMaintenancePool(maintenanceDb);
    return {
      admin,
      app,
      maintenance,
      async close() {
        await Promise.all([admin.end(), app.end(), maintenance.end()]);
      },
    };
  }
  async function ready() {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        lastStatus = (
          await fetch(`${origin}/readyz`, {
            signal: AbortSignal.timeout(1_000),
          })
        ).status;
        if (lastStatus === 200) return;
      } catch {
        /* startup has a bounded connection-refused interval */
      }
      await delay(100);
    }
    throw new Error(
      `Built image never became ready (last status ${lastStatus}); evidence: ${log}`,
    );
  }
  async function telemetryLogs() {
    return (
      await compose([
        'logs',
        '--no-color',
        '--no-log-prefix',
        'telemetry-detector',
      ])
    ).stdout.toString();
  }
  async function processTelemetryLogs() {
    return (
      await compose([
        'logs',
        '--no-color',
        '--no-log-prefix',
        'studio',
        'worker',
        'registry',
      ])
    ).stdout.toString();
  }
  async function assertTelemetryQuiet() {
    assertNoTelemetryEgress(await telemetryLogs());
    assertNoProcessTelemetryEgress(await processTelemetryLogs());
  }
  async function proveTelemetryProcessInstrumentation() {
    for (const service of ['studio', 'worker', 'registry']) {
      const result = await compose([
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '--entrypoint',
        'node',
        service,
        '-e',
        TELEMETRY_PROCESS_CANARY_SOURCE,
      ]);
      assertProcessTelemetryInstrumentationPositive(result.stdout.toString());
    }
  }
  async function proveTelemetryDetector() {
    for (const service of ['studio', 'worker', 'registry']) {
      await compose([
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '-e',
        'NODE_OPTIONS=',
        '--entrypoint',
        'node',
        service,
        '-e',
        TELEMETRY_CANARY_SOURCE,
      ]);
      assertTelemetryDetectorPositive(await telemetryLogs());
      await compose(['rm', '--stop', '--force', 'telemetry-detector']);
      await compose(['up', '-d', 'telemetry-detector']);
      assertNoTelemetryEgress(await telemetryLogs());
    }
  }
  async function proveTelemetrySwitch() {
    for (const telemetry of ['on', 'off']) {
      await compose(
        [
          'run',
          '--rm',
          '--no-deps',
          '-T',
          '-e',
          `STUDIO_TELEMETRY=${telemetry}`,
          '--entrypoint',
          'node',
          'studio',
          '--input-type=module',
          '-e',
          TELEMETRY_IMPLEMENTATION_CANARY_SOURCE,
        ],
        { failure: true },
      );
      if (telemetry === 'on') {
        assertTelemetryDetectorObserved(await telemetryLogs());
        await compose(['rm', '--stop', '--force', 'telemetry-detector']);
        await compose(['up', '-d', 'telemetry-detector']);
      } else {
        assertNoTelemetryEgress(await telemetryLogs());
      }
    }
  }
  async function dispose() {
    // This project name is generated above; never select a pre-existing stack.
    await compose(['down', '--volumes', '--remove-orphans'], {
      failure: true,
      environment: { STUDIO_ENCRYPTION_FILE: '/dev/null' },
    });
  }
  return {
    project,
    root,
    directory,
    log,
    dockerEnvironment,
    ports,
    origin,
    images: { studio: image, minio: minioImage },
    compose,
    execute,
    configuration,
    configure,
    overlay,
    pools,
    ready,
    assertTelemetryQuiet,
    proveTelemetryProcessInstrumentation,
    proveTelemetryDetector,
    proveTelemetrySwitch,
    dispose,
  };
}

export type Deployment = Awaited<ReturnType<typeof localDeployment>>;
