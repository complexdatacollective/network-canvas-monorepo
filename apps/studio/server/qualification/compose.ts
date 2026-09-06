import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv, promisify } from 'node:util';

import { Pool } from 'pg';

import { createMaintenancePool, createPool } from '../src/db/pool.ts';

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
  if (!image || !minioImage)
    throw new Error(
      'Qualification requires explicitly built Studio and MinIO images.',
    );
  const project = `studio-qualification-${label}-${randomBytes(5).toString('hex')}`;
  const root = await mkdtemp(join(tmpdir(), `${project}-`));
  const directory = join(root, 'configuration');
  await mkdir(directory, { mode: 0o700 });
  const log = join(root, 'commands.log');
  const ports = { web: await port(), db: await port(), s3: await port() };
  const environment = {
    ...(await localDockerEnvironment(root)),
    STUDIO_IMAGE: image,
    MINIO_IMAGE: minioImage,
    STUDIO_PROXY_SUBNET: '172.30.240.0/24',
    STUDIO_PROXY_IP: '172.30.240.2',
    COMPOSE_PROJECT_NAME: project,
    COMPOSE_FILE: [
      join(directory, 'docker-compose.yml'),
      join(directory, 'qualification.yml'),
    ].join(':'),
  };
  const edgeNetwork = `${project}-reserved-edge`;
  let edgeReserved = false;
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
  const compose = (args: string[], options?: Parameters<typeof execute>[2]) =>
    execute(
      'docker',
      [
        'compose',
        '--profile',
        'worker',
        '-f',
        'docker-compose.yml',
        '-f',
        'qualification.yml',
        ...args,
      ],
      options,
    );
  async function configuration() {
    return {
      ...parseEnv(await readFile(join(directory, '.env'), 'utf8')),
      ...parseEnv(
        await readFile(join(directory, 'deployment/encryption.env'), 'utf8'),
      ),
    };
  }
  async function configure() {
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
    return output.bootstrapToken;
  }
  async function overlay() {
    if (!edgeReserved) {
      // Docker owns address allocation. Atomically reserve a candidate instead
      // of racing another qualification project or its auto-allocated /16.
      for (let attempt = 0; attempt < 32; attempt++) {
        const bytes = randomBytes(2);
        const prefix = `172.${16 + (bytes[0]! % 16)}.${bytes[1]!}`;
        const result = await execute(
          'docker',
          ['network', 'create', '--subnet', `${prefix}.0/24`, edgeNetwork],
          { failure: true },
        );
        if (result.code === 0) {
          environment.STUDIO_PROXY_SUBNET = `${prefix}.0/24`;
          environment.STUDIO_PROXY_IP = `${prefix}.2`;
          edgeReserved = true;
          break;
        }
        if (!result.stderr.toString().includes('Pool overlaps'))
          throw new Error(
            `Cannot reserve a qualification network; evidence: ${log}`,
          );
      }
      if (!edgeReserved)
        throw new Error('No free qualification subnet was found.');
    }
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
      join(directory, 'qualification.yml'),
      `services:
  studio:
    environment:
      PUBLIC_URL: ${origin}
      STUDIO_TELEMETRY: 'off'
      GOOGLE_CLIENT_ID: synthetic-qualification-client
      GOOGLE_CLIENT_SECRET: synthetic-qualification-secret
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
  traefik:
    ports: !reset []
networks:
  edge: !override
    external: true
    name: ${edgeNetwork}
`,
    );
  }
  async function pools() {
    const env = await configuration();
    const address = `127.0.0.1:${ports.db}/studio`;
    const db = {
      url: `postgresql://studio_runtime:${env.STUDIO_DATABASE_PASSWORD}@${address}`,
    };
    const admin = new Pool({
      connectionString: `postgresql://postgres:${env.POSTGRES_PASSWORD}@${address}`,
      connectionTimeoutMillis: 10_000,
    });
    const app = createPool(db);
    const maintenance = createMaintenancePool(db);
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
  async function dispose() {
    // This project name is generated above; never select a pre-existing stack.
    await compose(['down', '--volumes', '--remove-orphans'], {
      failure: true,
      environment: { STUDIO_ENCRYPTION_FILE: '/dev/null' },
    });
    if (edgeReserved) await execute('docker', ['network', 'rm', edgeNetwork]);
  }
  return {
    project,
    root,
    directory,
    log,
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
    dispose,
  };
}

export type Deployment = Awaited<ReturnType<typeof localDeployment>>;
