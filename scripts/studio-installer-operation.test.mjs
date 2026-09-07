import assert from 'node:assert/strict';
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

import configurationFiles from '../apps/studio/deployment/installer/configuration-files.json' with { type: 'json' };
import {
  loadState,
  privateDirectory,
} from '../apps/studio/deployment/installer/files.mjs';
import {
  install,
  parseArguments,
} from '../apps/studio/deployment/installer/install.mjs';
import { executeOperation } from '../apps/studio/deployment/installer/operation.mjs';
import { readRelease, sha256 } from '../apps/studio/deployment/installer/release.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

const custodyBytes = Buffer.from(
  'STUDIO_ENCRYPTION_ROOT_PII_V1=synthetic-root\n',
);
const credentials = {
  email: 'synthetic@example.test',
  password: 'SYNTHETIC_PRIVATE_PASSWORD',
};

function sameRuntimeRelease(generation, previous) {
  const next = releasedDistribution(generation, [previous]);
  next.value.images = structuredClone(previous.release.images);
  next.value.schemas.studio = structuredClone(previous.release.schemas.studio);
  next.value.postgresMajor = previous.release.postgresMajor;
  return {
    value: next.value,
    ...readRelease(Buffer.from(JSON.stringify(next.value))),
  };
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-installer-operation-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const root = privateDirectory(join(directory, 'installation'));
  const data = privateDirectory(join(directory, 'independent-data'));
  const keys = privateDirectory(join(directory, 'independent-keys'));
  const credentialsFile = join(directory, 'credentials.json');
  writeFileSync(credentialsFile, JSON.stringify(credentials), { mode: 0o600 });
  const state = {
    public: false,
    web: false,
    workers: false,
    schema: null,
    captures: [],
    trace: [],
  };
  const all = new Map();
  const calls = [];
  const templates = Object.fromEntries(
    configurationFiles.map((name) => [
      name,
      Buffer.from(`# synthetic command-boundary template ${name}\n`),
    ]),
  );
  let chosen;
  let failure;
  function select(release) {
    chosen = release;
    all.set(release.current.digest, release);
    const bundle = privateDirectory(join(directory, release.current.digest));
    const modules = [
      'install.mjs',
      'operation.mjs',
      'files.mjs',
      'release.mjs',
      'verify.mjs',
      'smoke.mjs',
      'configuration-files.json',
    ];
    const files = new Map(
      modules.map((name) => [
        name,
        readFileSync(
          new URL(
            `../apps/studio/deployment/installer/${name}`,
            import.meta.url,
          ),
        ),
      ]),
    );
    files.set('release.json', Buffer.from(JSON.stringify(release.value)));
    files.set('release.sigstore.json', Buffer.from('{}'));
    for (const [name, bytes] of Object.entries(templates)) {
      files.set(`templates/${name}`, bytes);
      files.set(`configuration/${name}`, bytes);
    }
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
      mkdirSync(dirname(join(bundle, name)), { recursive: true });
      writeFileSync(join(bundle, name), bytes);
    }
    return {
      directory: root,
      bundleDirectory: bundle,
      expectedDigest: release.current.digest,
      domain: 'studio.example.test',
      email: 'operator@example.test',
      credentialsFile,
      backupDirectory: data,
      keyCustodyDirectory: keys,
    };
  }
  const run = (program, args, options = {}) => {
    calls.push({ program, args, options });
    if (program === 'cosign') return 'verified command-boundary fixture';
    if (program === 'sh') {
      state.trace.push('backup');
      assert.equal(state.public, false);
      assert.equal(state.web, false);
      assert.equal(state.workers, false);
      const [, target, keyFile] = args;
      mkdirSync(target);
      writeFileSync(keyFile, custodyBytes, { mode: 0o600 });
      writeFileSync(join(target, 'encryption.sha256'), sha256(custodyBytes));
      state.captures.push(state.schema);
      if (failure === 'backup') throw new Error('Injected backup failure');
      writeFileSync(
        join(target, 'COMPLETE'),
        'Synthetic command-boundary completion',
      );
      return '';
    }
    assert.equal(program, 'docker');
    if (args[0] === 'pull') return '';
    if (args[0] === 'image') {
      const image = Object.values(chosen.release.images).find(
        ({ reference }) => reference === args.at(-1),
      );
      return JSON.stringify({
        Os: 'linux',
        Architecture: 'amd64',
        Id: image.configurations['linux/amd64'],
      });
    }
    if (args[0] === 'run') {
      const raw = args.find((value) =>
        value.endsWith('target=/app/deployment-bundle,readonly'),
      );
      assert.ok(
        raw,
        'the configuration command must mount the verified current templates',
      );
      const templateRoot = raw
        .slice('type=bind,source='.length)
        .split(',target=')[0];
      for (const [name, bytes] of Object.entries(templates))
        assert.deepEqual(readFileSync(join(templateRoot, name)), bytes);
      const output = args[args.indexOf('--mount') + 1]
        .split('source=')[1]
        .split(',target=')[0];
      for (const [name, bytes] of Object.entries(templates)) {
        mkdirSync(dirname(join(output, name)), { recursive: true });
        writeFileSync(join(output, name), bytes);
      }
      writeFileSync(
        join(output, '.env'),
        "STUDIO_DOMAIN='studio.example.test'\nACME_EMAIL='operator@example.test'\nBETTER_AUTH_SECRET='SYNTHETIC_AUTH_SECRET'\n",
        { mode: 0o600 },
      );
      writeFileSync(join(output, 'deployment/encryption.env'), custodyBytes, {
        mode: 0o600,
      });
      return JSON.stringify({
        setupUrl: 'https://studio.example.test/setup',
        bootstrapToken: 'synthetic-once-only-bootstrap',
      });
    }
    if (['ps', 'network', 'volume'].includes(args[0])) {
      if (failure === 'inventory')
        throw new Error('Injected inventory failure');
      if (failure === 'occupied' && args[0] === 'ps')
        return 'occupied-container';
      return '';
    }
    assert.equal(args[0], 'compose');
    const project = args[args.indexOf('--project-name') + 1];
    const tail = args.slice(args.indexOf('--profile') + 2);
    if (tail[0] === 'config') {
      const override = parse(
        readFileSync(
          join(options.cwd, 'deployment/release-images.yml'),
          'utf8',
        ),
      );
      if (failure === 'image')
        override.services.postgres.image = 'untrusted:latest';
      return JSON.stringify({
        name: project,
        services: override.services,
        networks: { data: { name: `${project}_data` } },
        volumes: { postgres: { name: `${project}_postgres` } },
      });
    }
    if (tail[0] === 'stop') {
      state.trace.push(`stop:${tail.slice(1).join(',')}`);
      if (tail.includes('traefik')) state.public = false;
      if (tail.includes('studio')) state.web = false;
      if (tail.includes('worker')) state.workers = false;
      return '';
    }
    if (tail[0] === 'exec' && tail.includes('psql')) {
      state.trace.push('admin');
      assert.equal(state.public, false);
      assert.equal(state.web, false);
      assert.equal(state.workers, false);
      return '';
    }
    if (tail[0] === 'run') {
      state.trace.push(`run:${tail.at(-1)}`);
      if (tail.at(-1) === 'migrate') {
        assert.equal(state.public, false);
        assert.equal(state.web, false);
        assert.equal(state.workers, false);
        state.schema = chosen.current.digest;
        if (failure === 'migration')
          throw new Error('Injected migration failure');
      }
      return '';
    }
    if (tail[0] === 'up') {
      state.trace.push(`up:${tail.slice(1).join(',')}`);
      if (tail.includes('studio')) state.web = true;
      if (tail.includes('worker')) state.workers = true;
      if (tail.includes('traefik')) {
        if (failure === 'admission')
          throw new Error('Injected admission failure');
        state.public = true;
      }
      return '';
    }
    if (tail[0] === 'exec' && tail.includes('node')) {
      state.trace.push('smoke');
      if (state.public) {
        assert.equal(state.workers, true);
        assert.equal(state.web, true);
      } else {
        assert.equal(state.workers, false);
        assert.equal(state.web, true);
      }
      if (failure === 'smoke') throw new Error('Injected smoke failure');
      const input = JSON.parse(options.input);
      if (input.mode === 'update')
        assert.deepEqual(input.credentials, credentials);
      return JSON.stringify({
        ready: true,
        authenticated: input.mode === 'update',
      });
    }
    throw new Error(`Unexpected command: ${program} ${tail.join(' ')}`);
  };
  return {
    root,
    data,
    keys,
    calls,
    state,
    select,
    run,
    setFailure: (value) => {
      failure = value;
    },
    protectedState: () => loadState(join(root, 'control')),
  };
}

test('the actual caller drains, captures, migrates and privately authenticates before reopening; it keeps old templates and separate keys', (t) => {
  const f = fixture(t);
  const old = releasedDistribution();
  const first = executeOperation(f.select(old), f.run);
  assert.equal(first.setup.bootstrapToken, 'synthetic-once-only-bootstrap');
  assert.equal(f.state.public, true);
  const original = readFileSync(join(first.configuration, '.env'));
  const next = releasedDistribution(2, [old]);
  f.state.trace = [];
  const result = executeOperation(f.select(next), f.run);
  assert.equal(result.setup, undefined);
  assert.deepEqual(f.state.captures, [old.current.digest]);
  assert.ok(
    f.state.trace.indexOf('stop:traefik') < f.state.trace.indexOf('backup'),
  );
  assert.ok(
    f.state.trace.indexOf('backup') < f.state.trace.indexOf('run:migrate'),
  );
  assert.ok(
    f.state.trace.indexOf('run:migrate') < f.state.trace.indexOf('smoke'),
  );
  assert.ok(f.state.trace.at(-1).includes('traefik'));
  assert.deepEqual(f.protectedState().active, next.current);
  assert.deepEqual(readFileSync(join(first.configuration, '.env')), original);
  assert.deepEqual(readFileSync(join(result.configuration, '.env')), original);
  assert.equal(readdirSync(f.keys).length, 1);
  assert.equal(readdirSync(f.data).length, 1);
  assert.equal(
    JSON.stringify(f.calls.map(({ args }) => args)).includes(
      credentials.password,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(f.calls.map(({ args }) => args)).includes(
      'SYNTHETIC_AUTH_SECRET',
    ),
    false,
  );
});

test('an installer-only release preserves the running backend across smoke interruption and exact retry', (t) => {
  const f = fixture(t);
  const old = releasedDistribution();
  executeOperation(f.select(old), f.run);
  const next = sameRuntimeRelease(2, old);
  const options = f.select(next);
  f.state.trace = [];
  f.setFailure('smoke');
  assert.throws(() => executeOperation(options, f.run), /Injected smoke/);
  assert.deepEqual(f.state.trace, ['smoke']);
  assert.equal(f.state.public, true);
  assert.equal(f.state.web, true);
  assert.equal(f.state.workers, true);
  assert.deepEqual(f.protectedState().highest, next.current);
  assert.deepEqual(f.protectedState().active, old.current);
  f.setFailure(undefined);
  f.state.trace = [];
  executeOperation(options, f.run);
  assert.deepEqual(f.state.trace, ['smoke']);
  assert.deepEqual(f.protectedState().active, next.current);
  assert.equal(f.state.public, true);
  assert.equal(f.state.web, true);
  assert.equal(f.state.workers, true);
  f.state.trace = [];
  executeOperation(options, f.run);
  assert.deepEqual(
    f.state.trace,
    [],
    'an exact active retry must not recreate unchanged containers',
  );
});

for (const phase of ['backup', 'migration', 'smoke'])
  test(`a ${phase} failure leaves admission closed, preserves high-water state and refuses an older replay`, (t) => {
    const f = fixture(t);
    const old = releasedDistribution();
    executeOperation(f.select(old), f.run);
    const next = releasedDistribution(2, [old]);
    const options = f.select(next);
    f.setFailure(phase);
    assert.throws(
      () => executeOperation(options, f.run),
      new RegExp(`Injected ${phase}`),
    );
    assert.equal(f.state.public, false);
    assert.equal(f.state.workers, false);
    assert.deepEqual(f.protectedState().highest, next.current);
    assert.deepEqual(f.protectedState().active, old.current);
    const priorCalls = f.calls.length;
    assert.throws(
      () => executeOperation({ ...options, ...f.select(old) }, f.run),
      /replay/,
    );
    assert.ok(
      f.calls.slice(priorCalls).every(({ program }) => program === 'cosign'),
    );
  });

test('a retry after migration does not recapture the new schema as the previous backup', (t) => {
  const f = fixture(t);
  const old = releasedDistribution();
  executeOperation(f.select(old), f.run);
  const next = releasedDistribution(2, [old]);
  const options = f.select(next);
  f.setFailure('smoke');
  assert.throws(() => executeOperation(options, f.run), /Injected smoke/);
  assert.equal(f.state.schema, next.current.digest);
  f.setFailure(undefined);
  executeOperation(options, f.run);
  assert.deepEqual(f.state.captures, [old.current.digest]);
  assert.equal(f.state.public, true);
  assert.deepEqual(f.protectedState().active, next.current);
});

test('an interrupted retained installer copy stays unpublished and the same release can retry', (t) => {
  const f = fixture(t);
  const release = releasedDistribution();
  const options = f.select(release);
  const target = join(f.root, 'releases', release.current.digest, 'bundle');
  const original = fs.writeFileSync;
  const fault = t.mock.method(fs, 'writeFileSync', (path, bytes, settings) => {
    if (
      Buffer.isBuffer(bytes) &&
      bytes.includes('export function privateDirectory(')
    )
      throw new Error('Injected retained installer copy interruption');
    return original(path, bytes, settings);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => executeOperation(options, f.run),
      /Injected retained installer copy/,
    );
  } finally {
    fault.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(
    existsSync(target),
    false,
    'incomplete bundle must never become the selected retained directory',
  );
  assert.equal(f.protectedState().active, null);
  assert.equal(f.state.public, false);
  assert.equal(executeOperation(options, f.run).state, 'active');
  assert.deepEqual(f.protectedState().active, release.current);
});

test('an unfinished accepted operation blocks a different newer release before Docker or additional acceptance', (t) => {
  const f = fixture(t);
  const old = releasedDistribution();
  executeOperation(f.select(old), f.run);
  const next = releasedDistribution(2, [old]);
  f.setFailure('migration');
  assert.throws(
    () => executeOperation(f.select(next), f.run),
    /Injected migration/,
  );
  f.setFailure(undefined);
  const newer = releasedDistribution(3, [old, next]);
  const before = f.calls.length;
  assert.throws(
    () => executeOperation(f.select(newer), f.run),
    /previously accepted/,
  );
  assert.ok(f.calls.slice(before).every(({ program }) => program === 'cosign'));
  assert.deepEqual(f.protectedState().highest, next.current);
});

test('a fresh generation cannot clear pre-existing configuration without its durable ownership intent', (t) => {
  const f = fixture(t);
  const release = releasedDistribution();
  const options = f.select(release);
  const target = join(
    f.root,
    'releases',
    release.current.digest,
    'configuration',
  );
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const canary = join(target, 'operator-existing-data');
  writeFileSync(canary, 'Existing operator bytes');
  assert.throws(
    () => executeOperation(options, f.run),
    /Unowned configuration/,
  );
  assert.equal(readFileSync(canary, 'utf8'), 'Existing operator bytes');
  assert.equal(
    f.calls.some(
      ({ program, args }) => program === 'docker' && args[0] === 'run',
    ),
    false,
  );
  assert.deepEqual(f.state.trace, []);
});

test('failure opening public admission keeps the compatible selection and an exact retry can finish without a new migration or backup', (t) => {
  const f = fixture(t);
  const release = releasedDistribution();
  const options = f.select(release);
  f.setFailure('admission');
  assert.throws(() => executeOperation(options, f.run), /Injected admission/);
  assert.deepEqual(f.protectedState().active, release.current);
  f.setFailure(undefined);
  f.state.trace = [];
  executeOperation(options, f.run);
  assert.equal(f.state.public, true);
  assert.deepEqual(f.state.captures, []);
  assert.equal(f.state.trace.includes('run:migrate'), false);
});

for (const failure of ['inventory', 'occupied', 'image'])
  test(`a fresh ${failure} refusal precedes schema or service effects`, (t) => {
    const f = fixture(t);
    f.setFailure(failure);
    assert.throws(() =>
      executeOperation(f.select(releasedDistribution()), f.run),
    );
    assert.deepEqual(f.state.trace, []);
    assert.equal(f.state.schema, null);
  });

test('the public entrypoint locks its inherited descriptor before starting the complete operation and refuses competing ownership', (t) => {
  const f = fixture(t);
  const args = [
    '--directory',
    f.root,
    '--expected-manifest-sha256',
    '1'.repeat(64),
  ];
  const calls = [];
  install(args, (program, values, options) => {
    calls.push({ program, values, options });
    return { status: 0 };
  });
  assert.equal(calls[0].program, 'flock');
  assert.deepEqual(calls[0].values, ['--exclusive', '--nonblock', '3']);
  assert.equal(calls[1].program, process.execPath);
  assert.equal(calls[0].options.stdio[3], calls[1].options.stdio[3]);
  assert.ok(Number.isInteger(calls[1].options.stdio[3]));
  assert.equal(JSON.parse(calls[1].options.input).directory, f.root);
  let attempts = 0;
  assert.throws(
    () =>
      install(args, () => {
        attempts++;
        return { status: 1 };
      }),
    /holds the installation lock/,
  );
  assert.equal(attempts, 1);
  assert.throws(
    () => parseArguments([...args, '--directory', f.root]),
    /Invalid installer/,
  );
  assert.throws(
    () => parseArguments(['--directory', f.root]),
    /independently obtained/,
  );
});
