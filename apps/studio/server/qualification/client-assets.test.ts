import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it, onTestFinished } from 'vitest';

import { localDeployment } from './compose.ts';

async function fixture() {
  const deployment = await localDeployment('client-assets');
  const containers = new Set<string>();
  const volumes = new Set<string>();
  const images = new Set<string>();
  const { execute, project } = deployment;
  onTestFinished(async () => {
    for (const id of containers) await execute('docker', ['rm', '--force', id]);
    for (const name of volumes) await execute('docker', ['volume', 'rm', name]);
    for (const name of images) await execute('docker', ['image', 'rm', name]);
  });
  const base = `${project}:base`;
  await execute('docker', ['image', 'tag', deployment.images.studio, base]);
  images.add(base);

  async function image(label: string, path?: string) {
    const directory = join(deployment.root, label);
    await mkdir(directory);
    const body = `export const selectedImage = "${label}";\n`;
    const asset =
      path ??
      `retained-${createHash('sha256').update(body).digest('hex').slice(0, 12)}.js`;
    const name = `${project}:${label}`;
    await writeFile(join(directory, 'module.js'), body);
    // Image-only fixtures extend real built client assets. They qualify URL
    // retention, not a fictional previous/oldest supported backend release.
    await writeFile(
      join(directory, 'Dockerfile'),
      `FROM ${base}\nUSER root\nCOPY module.js /app/client/assets/${asset}\nRUN printf '\\n<!-- selected-${label} -->\\n' >> /app/client/index.html\nUSER node\n`,
    );
    await execute('docker', [
      'build',
      '--network=none',
      '--pull=false',
      '-t',
      name,
      directory,
    ]);
    images.add(name);
    return { name, asset, body };
  }
  async function volume(label: string) {
    const name = `${project}-${label}`;
    await execute('docker', ['volume', 'create', name]);
    volumes.add(name);
    return name;
  }
  const operator = (
    imageName: string,
    volumeName: string,
    action: string,
    failure = false,
  ) =>
    execute(
      'docker',
      [
        'run',
        '--rm',
        '--network=none',
        '--read-only',
        '--user=0:0',
        // Public cache operations must neither load application configuration
        // nor let CLIENT_DIST replace the selected image's trusted bytes.
        '--env=STUDIO_DEPLOYMENT_MODE=invalid-operator-canary',
        '--env=DATABASE_URL=invalid-operator-canary',
        '--env=STUDIO_ENCRYPTION_KEYSET=invalid-operator-canary',
        '--env=CLIENT_DIST=/replacement-outside-image',
        '--mount',
        `type=volume,source=${volumeName},target=/retained-assets`,
        imageName,
        'client-assets',
        action,
        '--directory',
        '/retained-assets',
      ],
      { failure, privateOutput: action === 'archive' },
    );
  async function detached(args: string[]) {
    const result = await execute('docker', [
      'run',
      '--detach',
      '--network=none',
      ...args,
    ]);
    const id = result.stdout.toString().trim();
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    containers.add(id);
    return id;
  }
  async function stop(id: string) {
    await execute('docker', ['rm', '--force', id]);
    containers.delete(id);
  }
  const fetchIn = (id: string, path: string) =>
    execute(
      'docker',
      [
        'exec',
        id,
        'node',
        '--input-type=module',
        '-e',
        `const response = await fetch('http://127.0.0.1:3000' + process.argv[1]);
     process.stdout.write(JSON.stringify({ status: response.status, cache: response.headers.get('cache-control'), body: await response.text() }));`,
        path,
      ],
      { failure: true },
    );
  async function serve(imageName: string, volumeName: string) {
    const id = await detached([
      '--read-only',
      '--mount',
      `type=volume,source=${volumeName},target=/retained-assets,readonly`,
      '--env',
      'STUDIO_CLIENT_ASSET_CACHE=/retained-assets',
      '--env',
      'STUDIO_ROLE=web',
      imageName,
    ]);
    for (let attempt = 0; attempt < 80; attempt++) {
      const result = await fetchIn(id, '/healthz');
      if (
        result.code === 0 &&
        (JSON.parse(result.stdout.toString()) as { status: number }).status ===
          200
      )
        return id;
      await delay(100);
    }
    throw new Error(
      `Client asset image did not start; evidence: ${deployment.log}`,
    );
  }
  async function response(id: string, path: string) {
    const result = await fetchIn(id, path);
    expect(result.code).toBe(0);
    return JSON.parse(result.stdout.toString()) as {
      status: number;
      cache: string | null;
      body: string;
    };
  }
  return {
    ...deployment,
    image,
    volume,
    operator,
    detached,
    stop,
    serve,
    response,
  };
}

it('keeps held image URLs through a new image and fresh-volume recovery, with an image-owned shell and read-only web cache', async () => {
  const f = await fixture();
  const old = await f.image('old');
  const next = await f.image('next');
  const volume = await f.volume('retained');
  await f.operator(old.name, volume, 'retain');
  const oldServer = await f.serve(old.name, volume);
  expect((await f.response(oldServer, `/assets/${old.asset}`)).body).toBe(
    old.body,
  );
  expect((await f.response(oldServer, '/')).body).toContain(
    '<!-- selected-old -->',
  );
  await f.stop(oldServer);
  await f.execute('docker', [
    'run',
    '--rm',
    '--network=none',
    '--entrypoint',
    'test',
    next.name,
    '!',
    '-e',
    `/app/client/assets/${old.asset}`,
  ]);
  await f.operator(next.name, volume, 'retain');
  const current = await f.serve(next.name, volume);
  for (const asset of [old, next]) {
    const actual = await f.response(current, `/assets/${asset.asset}`);
    expect(actual).toEqual({
      status: 200,
      body: asset.body,
      cache: 'public, max-age=31536000, immutable',
    });
  }
  const shell = await f.response(current, '/');
  expect(shell.body).toContain('<!-- selected-next -->');
  expect(shell.body).not.toContain('<!-- selected-old -->');
  expect(shell.cache).toBe('no-store');
  const mount = await f.execute('docker', [
    'inspect',
    '--format',
    '{{json .Mounts}}',
    current,
  ]);
  expect(JSON.parse(mount.stdout.toString())).toContainEqual(
    expect.objectContaining({ Destination: '/retained-assets', RW: false }),
  );
  const write = await f.execute('docker', [
    'exec',
    current,
    'node',
    '-e',
    `try { require('node:fs').writeFileSync('/retained-assets/write-canary', 'forbidden'); process.exit(4); } catch (error) { process.stdout.write(error.code); }`,
  ]);
  expect(['EROFS', 'EACCES']).toContain(write.stdout.toString());

  const collision = await f.image('collision', old.asset);
  const refused = await f.operator(collision.name, volume, 'retain', true);
  expect(refused.code).not.toBe(0);
  expect((await f.response(current, `/assets/${old.asset}`)).body).toBe(
    old.body,
  );

  // Simulate an interrupted writer. Recovery must carry only the admitted
  // generation, even when old generations and unfinished private bytes exist.
  await f.execute('docker', [
    'run',
    '--rm',
    '--network=none',
    '--user=0:0',
    '--mount',
    `type=volume,source=${volume},target=/retained-assets`,
    '--entrypoint',
    'node',
    next.name,
    '-e',
    `const fs = require('node:fs');
     fs.mkdirSync('/retained-assets/generations/.pending-abandoned');
     fs.writeFileSync('/retained-assets/generations/.pending-abandoned/uncommitted', 'unfinished writer canary');`,
  ]);
  const archive = await f.operator(next.name, volume, 'archive');
  expect(archive.stdout.byteLength).toBeGreaterThan(512);
  const restored = await f.volume('restored');
  await f.execute(
    'docker',
    [
      'run',
      '--rm',
      '--interactive',
      '--network=none',
      '--user=0:0',
      '--mount',
      `type=volume,source=${restored},target=/retained-assets`,
      '--entrypoint',
      'tar',
      next.name,
      '-C',
      '/retained-assets',
      '-xf',
      '-',
    ],
    { input: archive.stdout },
  );
  const inventory = await f.execute('docker', [
    'run',
    '--rm',
    '--network=none',
    '--mount',
    `type=volume,source=${restored},target=/retained-assets,readonly`,
    '--entrypoint',
    'node',
    next.name,
    '-e',
    `const fs = require('node:fs');
     process.stdout.write(JSON.stringify({
       root: fs.readdirSync('/retained-assets').sort(),
       generations: fs.readdirSync('/retained-assets/generations'),
     }));`,
  ]);
  expect(JSON.parse(inventory.stdout.toString())).toEqual({
    root: ['current', 'generations'],
    generations: [expect.stringMatching(/^[a-f0-9]{64}$/)],
  });
  await f.operator(next.name, restored, 'verify');
  const recovered = await f.serve(next.name, restored);
  expect(await f.response(recovered, `/assets/${old.asset}`)).toEqual({
    status: 200,
    body: old.body,
    cache: 'public, max-age=31536000, immutable',
  });
  expect((await f.response(recovered, '/')).body).toBe(shell.body);
  await f.stop(recovered);

  await f.execute('docker', [
    'run',
    '--rm',
    '--network=none',
    '--user=0:0',
    '--mount',
    `type=volume,source=${restored},target=/retained-assets`,
    '--entrypoint',
    'node',
    next.name,
    '-e',
    `require('node:fs').writeFileSync('/retained-assets/current/assets/${old.asset}', 'corrupted historical module');`,
  ]);
  const invalid = await f.detached([
    '--read-only',
    '--mount',
    `type=volume,source=${restored},target=/retained-assets,readonly`,
    '--env',
    'STUDIO_CLIENT_ASSET_CACHE=/retained-assets',
    next.name,
  ]);
  let invalidState: { Running: boolean; ExitCode: number } | undefined;
  let invalidLog = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await f.execute('docker', [
      'inspect',
      '--format',
      '{{json .State}}',
      invalid,
    ]);
    invalidState = JSON.parse(state.stdout.toString()) as typeof invalidState;
    invalidLog = (
      await f.execute('docker', ['logs', invalid])
    ).stdout.toString();
    if (!invalidState?.Running || invalidLog.includes('STUDIO_SERVER_STARTED'))
      break;
    await delay(100);
  }
  expect(invalidState?.Running).toBe(false);
  expect(invalidState?.ExitCode).not.toBe(0);
  expect(invalidLog).toContain('STUDIO_CLIENT_ASSETS_INVALID');
  expect(invalidLog).not.toContain('STUDIO_SERVER_STARTED');
  expect(
    (await f.operator(next.name, restored, 'archive', true)).code,
  ).not.toBe(0);
});

it('serializes image writers using a kernel lock and safely retries after the lock holder dies', async () => {
  const f = await fixture();
  const old = await f.image('old');
  const next = await f.image('next');
  const volume = await f.volume('concurrent');
  await Promise.all([
    f.operator(old.name, volume, 'retain'),
    f.operator(next.name, volume, 'retain'),
  ]);
  const server = await f.serve(next.name, volume);
  for (const asset of [old, next])
    expect((await f.response(server, `/assets/${asset.asset}`)).body).toBe(
      asset.body,
    );

  const locked = await f.volume('locked');
  const holder = await f.detached([
    '--user=0:0',
    '--mount',
    `type=volume,source=${locked},target=/retained-assets`,
    '--entrypoint',
    '/usr/bin/flock',
    next.name,
    '--no-fork',
    '--exclusive',
    '/retained-assets/.lock',
    'node',
    '-e',
    `process.stdout.write('kernel-lock-held\\n'); setInterval(() => {}, 1000);`,
  ]);
  let held = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await f.execute('docker', ['logs', holder]);
    if (result.stdout.toString().includes('kernel-lock-held')) {
      held = true;
      break;
    }
    await delay(100);
  }
  expect(held).toBe(true);
  // An actual incompatible kernel lock forces the production command's bounded
  // refusal. Removing flock makes this return success and fails this oracle.
  const refused = await f.operator(next.name, locked, 'retain', true);
  expect(refused.code).not.toBe(0);
  expect(refused.stderr.toString()).toContain('Client asset command refused.');
  await f.execute('docker', [
    'run',
    '--rm',
    '--network=none',
    '--entrypoint',
    'test',
    '--mount',
    `type=volume,source=${locked},target=/retained-assets,readonly`,
    next.name,
    '!',
    '-e',
    '/retained-assets/current',
  ]);
  await f.stop(holder);
  await f.operator(next.name, locked, 'retain');
  expect((await f.operator(next.name, locked, 'verify')).code).toBe(0);
});
