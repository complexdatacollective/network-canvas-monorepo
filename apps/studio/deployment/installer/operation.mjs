import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

import configurationFiles from './configuration-files.json' with { type: 'json' };
import {
  privateDirectory,
  privateFile,
  readInstallerBundle,
  saveState,
  writePrivateFile,
} from './files.mjs';
import { activateRelease, readRelease, sha256 } from './release.mjs';
import { command, pullVerifiedImages, verifyOperation } from './verify.mjs';

const phases = [
  'accepted',
  'configuring',
  'configured',
  'captured',
  'migrating',
  'verified',
  'active',
];
const serviceImages = {
  'studio': 'studio',
  'worker': 'studio',
  'client-assets': 'studio',
  'backup-verify': 'studio',
  'postgres': 'postgres',
  'minio': 'minio',
  'minio-init': 'minioClient',
  'traefik': 'traefik',
};

const nested = (left, right) =>
  left === right || left.startsWith(`${right}${sep}`);

// Ignore ambient Compose/DATABASE_URL/loader options. Credentials are read only
// from this operator-owned generation's explicit files. Docker transport/login
// configuration is intentionally retained for the independently installed CLI.
function environment() {
  return Object.fromEntries(
    [
      'PATH',
      'HOME',
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_CERT_PATH',
      'DOCKER_TLS_VERIFY',
    ]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
}

function loadJournal(path, digest, kind) {
  if (!existsSync(path))
    return { format: 1, digest, phase: 'accepted', kind, reuse: false };
  const value = JSON.parse(privateFile(path));
  if (
    !['digest,format,kind,phase', 'digest,format,kind,phase,reuse'].includes(
      Object.keys(value).toSorted().join(','),
    ) ||
    value.format !== 1 ||
    value.digest !== digest ||
    !phases.includes(value.phase) ||
    !['fresh', 'update'].includes(value.kind) ||
    (value.reuse !== undefined && typeof value.reuse !== 'boolean')
  )
    throw new Error('Invalid protected installation progress.');
  return { ...value, reuse: value.reuse ?? false };
}

function storeBundle(bundle, destination) {
  if (existsSync(destination)) {
    readInstallerBundle(destination, bundle.current.digest);
    return;
  }
  // A crash during the copy must not publish an incomplete bundle that blocks
  // exact-release retry. An abandoned private staging directory is never used.
  const staging = mkdtempSync(`${destination}.writing-`);
  try {
    for (const [name, bytes] of [
      ...bundle.files,
      ['installer.json', bundle.inventory],
    ]) {
      const target = join(staging, name);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writePrivateFile(target, bytes);
    }
    readInstallerBundle(staging, bundle.current.digest);
    renameSync(staging, destination);
    const parent = openSync(dirname(destination), 'r');
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function readCredentials(path) {
  if (typeof path !== 'string' || !path)
    throw new Error('Private upgrade credentials are required.');
  const value = JSON.parse(privateFile(resolve(path)));
  if (
    Object.keys(value).toSorted().join(',') !== 'email,password' ||
    typeof value.email !== 'string' ||
    !value.email ||
    value.email.length > 254 ||
    typeof value.password !== 'string' ||
    !value.password ||
    value.password.length > 1024
  )
    throw new Error(
      'Expected a private JSON file containing email and password.',
    );
  return value;
}

function checkTemplates(bundle, configuration) {
  for (const name of configurationFiles) {
    if (
      !readFileSync(join(configuration, name)).equals(
        bundle.files.get(`configuration/${name}`),
      )
    )
      throw new Error(
        'Deployment configuration differs from the signed installer.',
      );
  }
}

function normalizeConfigurationPath(path, roots) {
  for (const root of roots)
    if (path === root || path.startsWith(`${root}${sep}`))
      return `$CONFIGURATION${path.slice(root.length)}`;
  return path;
}

function normalizeDeployment(deployment, roots) {
  const value = JSON.parse(JSON.stringify(deployment));
  for (const service of Object.values(value.services ?? {})) {
    if (Array.isArray(service.volumes))
      for (const volume of service.volumes)
        if (volume?.type === 'bind' && typeof volume.source === 'string')
          volume.source = normalizeConfigurationPath(volume.source, roots);
    if (Array.isArray(service.env_file))
      service.env_file = service.env_file.map((file) =>
        typeof file === 'string'
          ? normalizeConfigurationPath(file, roots)
          : file,
      );
  }
  for (const section of ['configs', 'secrets'])
    for (const item of Object.values(value[section] ?? {}))
      if (typeof item.file === 'string')
        item.file = normalizeConfigurationPath(item.file, roots);
  return value;
}

function sameRuntimeInputs(previous, configuration) {
  if (
    !privateFile(join(previous, '.env')).equals(
      privateFile(join(configuration, '.env')),
    ) ||
    !privateFile(join(previous, 'deployment/encryption.env')).equals(
      privateFile(join(configuration, 'deployment/encryption.env')),
    )
  )
    return false;
  // Every deployment file is either bound into a long-running/initialization
  // service or consumed by an operator step. Keep reuse conservative: an
  // input change takes the full offline path, while Compose comments remain
  // harmless because the effective deployment comparison handles that file.
  return configurationFiles
    .filter((name) => name.startsWith('deployment/'))
    .every((name) =>
      readFileSync(join(previous, name)).equals(
        readFileSync(join(configuration, name)),
      ),
    );
}

function backupParents(options, root) {
  if (!options.backupDirectory || !options.keyCustodyDirectory)
    throw new Error(
      'An update requires independent data and historical-key custody directories.',
    );
  const data = privateDirectory(options.backupDirectory);
  const keys = privateDirectory(options.keyCustodyDirectory);
  if (
    nested(data, keys) ||
    nested(keys, data) ||
    nested(keys, root) ||
    nested(data, root)
  )
    throw new Error(
      'Backup data and key custody must be separate from each other and this installation.',
    );
  return { data, keys };
}

/** The official entrypoint holds one kernel lock across this entire operation. */
export function executeOperation(options, run = command) {
  const root = privateDirectory(options.directory);
  const control = privateDirectory(join(root, 'control'));
  const verified = verifyOperation(
    {
      bundleDirectory: options.bundleDirectory,
      controlDirectory: control,
      expectedDigest: options.expectedDigest,
    },
    run,
  );
  const { bundle, previous, accepted } = verified;
  if (previous && previous.highest.digest !== bundle.current.digest) {
    const previousProgress = join(
      root,
      'releases',
      previous.highest.digest,
      'progress.json',
    );
    if (!existsSync(previousProgress))
      throw new Error(
        'Protected progress for the previously accepted release is missing.',
      );
    const last = loadJournal(
      previousProgress,
      previous.highest.digest,
      'fresh',
    );
    if (last.phase === 'migrating' || last.phase === 'verified')
      throw new Error(
        'Complete the previously accepted release before selecting another update.',
      );
  }
  const updating =
    previous?.active && previous.active.digest !== bundle.current.digest;
  const releases = privateDirectory(join(root, 'releases'));
  const generation = privateDirectory(join(releases, bundle.current.digest));
  const journalPath = join(generation, 'progress.json');
  const journal = loadJournal(
    journalPath,
    bundle.current.digest,
    previous?.active ? 'update' : 'fresh',
  );
  const credentials =
    journal.kind === 'update' && journal.phase !== 'active'
      ? readCredentials(options.credentialsFile)
      : null;
  const custody =
    updating && phases.indexOf(journal.phase) < phases.indexOf('captured')
      ? backupParents(options, root)
      : null;
  const advance = (phase) => {
    if (phases.indexOf(phase) < phases.indexOf(journal.phase))
      throw new Error('Installation progress cannot go backwards.');
    journal.phase = phase;
    writePrivateFile(journalPath, Buffer.from(`${JSON.stringify(journal)}\n`));
  };
  // Acceptance survives a failed pull, capture, migration or smoke. A replay
  // cannot lower this protected state even when no new service has started.
  advance(journal.phase);
  saveState(control, accepted);
  const images = pullVerifiedImages(bundle, run);
  const project = `studio-${sha256(root).slice(0, 24)}`;
  const configuration = join(generation, 'configuration');
  const archivedBundle = join(generation, 'bundle');
  storeBundle(bundle, archivedBundle);
  const oldGeneration = updating
    ? join(releases, previous.runtime.digest)
    : null;
  const oldConfiguration = oldGeneration
    ? join(oldGeneration, 'configuration')
    : null;
  if (oldGeneration)
    checkTemplates(
      readInstallerBundle(
        join(oldGeneration, 'bundle'),
        previous.runtime.digest,
      ),
      oldConfiguration,
    );
  const docker = (args, extra = {}) =>
    run('docker', args, { env: environment(), ...extra });
  const compose = (directory, args, overlays = [], extra = {}) =>
    docker(
      [
        'compose',
        '--project-name',
        project,
        '--env-file',
        join(directory, '.env'),
        '-f',
        join(directory, 'docker-compose.yml'),
        '-f',
        join(directory, 'deployment/release-images.yml'),
        ...overlays.flatMap((path) => ['-f', join(directory, path)]),
        // Include operator-only images in the effective inventory. Every
        // mutating invocation below still names its intended services.
        '--profile',
        '*',
        ...args,
      ],
      { cwd: directory, ...extra },
    );
  const admin = (directory, sql) =>
    compose(
      directory,
      [
        'exec',
        '-T',
        'postgres',
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'studio',
      ],
      [],
      { input: sql },
    );
  const smoke = (directory) => {
    const origin = parseEnv(
      privateFile(join(directory, '.env')).toString(),
    ).STUDIO_DOMAIN;
    const result = JSON.parse(
      compose(
        directory,
        [
          'exec',
          '-T',
          'studio',
          'node',
          '--input-type=module',
          '-e',
          bundle.files.get('smoke.mjs').toString(),
          '--',
          '--studio-installer-smoke',
        ],
        ['deployment/quarantine.yml'],
        {
          input: JSON.stringify({
            mode: journal.kind,
            origin: `https://${origin}`,
            credentials,
          }),
        },
      ),
    );
    if (
      result.ready !== true ||
      result.authenticated !== (journal.kind === 'update')
    )
      throw new Error('Private release smoke returned an invalid verdict.');
  };
  const stop = (directory) => {
    compose(directory, ['stop', 'traefik']);
    compose(directory, ['stop', 'studio', 'worker']);
  };
  let bootstrap = null;
  if (phases.indexOf(journal.phase) < phases.indexOf('configured')) {
    if (journal.phase === 'accepted') {
      if (existsSync(configuration))
        throw new Error(
          'Unowned configuration already exists in this release generation.',
        );
      // This durable intent precedes creation and permits a retry to clear only
      // the incomplete configuration this installer began for this generation.
      advance('configuring');
    }
    // This generation has never been selected. Clear only its incomplete
    // configuration from a failed offline configure; no prior generation moves.
    if (existsSync(configuration)) rmSync(configuration, { recursive: true });
    privateDirectory(configuration);
    const oldEnv = oldConfiguration
      ? parseEnv(privateFile(join(oldConfiguration, '.env')).toString())
      : null;
    const generated = docker([
      'run',
      '--rm',
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--mount',
      `type=bind,source=${configuration},target=/configuration`,
      // Compose-only releases may reuse this exact image. The signed bundle
      // supplies current raw templates; the verified image still owns rendering.
      '--mount',
      `type=bind,source=${join(archivedBundle, 'templates')},target=/app/deployment-bundle,readonly`,
      images.studio,
      'configure',
      '--domain',
      oldEnv?.STUDIO_DOMAIN ?? options.domain,
      '--email',
      oldEnv?.ACME_EMAIL ?? options.email,
      '--image',
      bundle.release.images.studio.reference,
      '--minio-image',
      bundle.release.images.minio.reference,
      '--output',
      '/configuration',
    ]);
    bootstrap = oldConfiguration ? null : JSON.parse(generated);
    // Every public template must agree with the complete signed installer.
    checkTemplates(bundle, configuration);
    if (oldConfiguration) {
      writePrivateFile(
        join(configuration, '.env'),
        privateFile(join(oldConfiguration, '.env')),
      );
      writePrivateFile(
        join(configuration, 'deployment/encryption.env'),
        privateFile(join(oldConfiguration, 'deployment/encryption.env')),
      );
    }
    const override = Object.entries(serviceImages)
      .map(
        ([service, name]) =>
          `  ${service}:\n    image: ${images[name]}\n    pull_policy: never\n${service === 'studio' ? '    environment:\n      STUDIO_ROLE: web\n' : ''}`,
      )
      .join('');
    writePrivateFile(
      join(configuration, 'deployment/release-images.yml'),
      Buffer.from(`services:\n${override}`),
    );
    writePrivateFile(
      join(configuration, 'release.json'),
      bundle.files.get('release.json'),
    );
    writePrivateFile(
      join(configuration, 'release.sigstore.json'),
      bundle.files.get('release.sigstore.json'),
    );
    advance('configured');
  }
  checkTemplates(bundle, configuration);
  // Check the effective service set and image identities, not just substitutions
  // in a source YAML file. Unlisted images never execute through Compose.
  const effective = JSON.parse(
    compose(configuration, ['config', '--format', 'json']),
  );
  if (
    effective.name !== project ||
    Object.keys(effective.services).toSorted().join(',') !==
      Object.keys(serviceImages).toSorted().join(',') ||
    Object.entries(serviceImages).some(
      ([service, name]) => effective.services[service].image !== images[name],
    )
  )
    throw new Error(
      'Effective Compose images do not match the signed release.',
    );
  const knownContainers = docker([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${project}`,
  ]).trim();
  if (
    !previous?.active &&
    phases.indexOf(journal.phase) < phases.indexOf('migrating') &&
    knownContainers
  )
    throw new Error('Fresh installation refuses an existing Compose project.');
  for (const [kind, entries] of [
    ['network', effective.networks],
    ['volume', effective.volumes],
  ]) {
    if (!entries || !Object.keys(entries).length)
      throw new Error('Missing Compose resource inventory.');
    const existing = docker([kind, 'ls', '--format', '{{.Name}}'])
      .trim()
      .split('\n');
    for (const resource of Object.values(entries)) {
      if (
        resource.external ||
        typeof resource.name !== 'string' ||
        !resource.name.startsWith(`${project}_`)
      )
        throw new Error(
          'Installation refuses external or shared Compose resources.',
        );
      if (!existing.includes(resource.name)) continue;
      const label = docker([
        kind,
        'inspect',
        '--format',
        '{{index .Labels "com.docker.compose.project"}}',
        resource.name,
      ]).trim();
      if (
        label !== project ||
        (!previous?.active &&
          phases.indexOf(journal.phase) < phases.indexOf('migrating'))
      )
        throw new Error('Installation refuses an occupied Compose resource.');
    }
  }
  if (
    journal.reuse &&
    previous?.active?.digest === bundle.current.digest &&
    journal.phase === 'verified'
  ) {
    advance('active');
    return { state: 'active', release: bundle.current.digest, configuration };
  }
  if (
    journal.phase === 'active' &&
    previous?.active?.digest === bundle.current.digest
  ) {
    if (journal.reuse)
      return {
        state: 'active',
        release: bundle.current.digest,
        configuration,
      };
    compose(configuration, [
      'up',
      '-d',
      '--no-deps',
      '--wait',
      'studio',
      'worker',
      'traefik',
    ]);
    return { state: 'active', release: bundle.current.digest, configuration };
  }
  const reusable = (() => {
    if (!updating || !oldConfiguration) return false;
    const previousRelease = readRelease(
      privateFile(join(oldConfiguration, 'release.json'), 4 * 1024 * 1024),
    ).release;
    if (
      previousRelease.postgresMajor !== bundle.release.postgresMajor ||
      JSON.stringify(previousRelease.schemas.studio) !==
        JSON.stringify(bundle.release.schemas.studio) ||
      !sameRuntimeInputs(oldConfiguration, configuration)
    )
      return false;
    const oldEffective = JSON.parse(
      compose(oldConfiguration, ['config', '--format', 'json']),
    );
    return (
      JSON.stringify(
        normalizeDeployment(oldEffective, [oldConfiguration, configuration]),
      ) ===
      JSON.stringify(
        normalizeDeployment(effective, [oldConfiguration, configuration]),
      )
    );
  })();
  if (reusable) {
    // The verified configuration resolves to the same local runtime. Its only
    // normalized path differences are this operation's two generation roots.
    // Registry is verified but is not a Studio Compose service or activation.
    smoke(configuration);
    journal.reuse = true;
    advance('verified');
    saveState(
      control,
      activateRelease(accepted, bundle.current, { runtime: previous.runtime }),
    );
    advance('active');
    return { state: 'active', release: bundle.current.digest, configuration };
  }
  if (updating && phases.indexOf(journal.phase) < phases.indexOf('captured')) {
    stop(oldConfiguration);
    // A failed capture may have left these logins closed. Re-enable only while
    // every HTTP/worker remains stopped; the backup's live-session guard stays.
    admin(
      oldConfiguration,
      'ALTER ROLE studio_runtime LOGIN; ALTER ROLE studio_maintenance_runtime LOGIN; ALTER ROLE studio_migrator LOGIN;\n',
    );
    const name = `${bundle.current.digest}-${Date.now()}`;
    const data = join(custody.data, name);
    const keys = join(custody.keys, `${name}.env`);
    run('sh', [join(oldConfiguration, 'deployment/backup.sh'), data, keys], {
      cwd: oldConfiguration,
      env: {
        ...environment(),
        COMPOSE_PROJECT_NAME: project,
        COMPOSE_FILE: `${join(oldConfiguration, 'docker-compose.yml')}:${join(oldConfiguration, 'deployment/release-images.yml')}`,
      },
      timeout: 30 * 60_000,
    });
    if (!existsSync(join(data, 'COMPLETE')))
      throw new Error('The quiesced backup did not complete.');
    const retainedKeys = privateFile(keys);
    if (
      sha256(retainedKeys) !==
      readFileSync(join(data, 'encryption.sha256'), 'utf8').trim()
    )
      throw new Error('The independent backup key snapshot does not match.');
    writePrivateFile(
      join(configuration, 'deployment/encryption.env'),
      retainedKeys,
    );
    advance('captured');
  }
  // Persist this boundary before any new service or schema can exist, so a
  // same-release retry cannot recapture a new schema as the previous release.
  if (phases.indexOf(journal.phase) < phases.indexOf('migrating'))
    advance('migrating');
  stop(configuration);
  compose(configuration, ['up', '-d', '--wait', 'postgres', 'minio']);
  compose(configuration, ['run', '--rm', '--no-deps', '-T', 'minio-init']);
  admin(
    configuration,
    readFileSync(join(configuration, 'deployment/postgres-privileges.sql')),
  );
  admin(
    configuration,
    'ALTER ROLE studio_runtime LOGIN; ALTER ROLE studio_maintenance_runtime LOGIN; ALTER ROLE studio_migrator LOGIN;\n',
  );
  compose(
    configuration,
    ['run', '--rm', '--no-deps', '-T', 'studio', 'migrate'],
    ['deployment/migrate.yml', 'deployment/quarantine.yml'],
  );
  compose(
    configuration,
    ['run', '--rm', '--no-deps', '-T', 'encryption-verify'],
    ['deployment/quarantine.yml', 'deployment/encryption.yml'],
  );
  compose(configuration, ['run', '--rm', '--no-deps', '-T', 'backup-verify']);
  compose(configuration, ['run', '--rm', '--no-deps', '-T', 'client-assets']);
  compose(
    configuration,
    ['up', '-d', '--no-deps', '--wait', 'studio'],
    ['deployment/quarantine.yml'],
  );
  smoke(configuration);
  advance('verified');
  compose(configuration, ['stop', 'studio']);
  compose(configuration, [
    'up',
    '-d',
    '--no-deps',
    '--wait',
    'studio',
    'worker',
  ]);
  saveState(control, activateRelease(accepted, bundle.current));
  advance('active');
  // Public admission is the final effect. An error leaves an active compatible
  // backend selected with its high-water state intact; a retry can reopen it.
  compose(configuration, ['up', '-d', '--no-deps', '--wait', 'traefik']);
  return {
    state: 'active',
    release: bundle.current.digest,
    configuration,
    ...(bootstrap ? { setup: bootstrap } : {}),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const bytes = readFileSync(0);
    if (bytes.length > 16_384) throw new Error('Invalid installation request.');
    process.stdout.write(
      `${JSON.stringify(executeOperation(JSON.parse(bytes)))}\n`,
    );
  } catch {
    process.stderr.write(
      'Studio installation stopped. Admission remains closed after a migration begins; inspect protected progress and retry the same verified release.\n',
    );
    process.exitCode = 1;
  }
}
