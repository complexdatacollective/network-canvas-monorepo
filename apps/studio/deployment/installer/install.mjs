import { spawnSync } from 'node:child_process';
import { closeSync, constants, openSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { privateDirectory, privateFile } from './files.mjs';

export function parseArguments(args) {
  const names = {
    '--directory': 'directory',
    '--expected-manifest-sha256': 'expectedDigest',
    '--domain': 'domain',
    '--email': 'email',
    '--backup-directory': 'backupDirectory',
    '--key-custody-directory': 'keyCustodyDirectory',
    '--credentials-file': 'credentialsFile',
    '--registry-domain': 'registryDomain',
    '--registry-mail-from': 'registryMailFrom',
    '--registry-smtp-url': 'registrySmtpUrl',
    '--registry-postmark-server-token': 'registryPostmarkServerToken',
    '--registry-postmark-message-stream': 'registryPostmarkMessageStream',
  };
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = names[args[i]];
    const value = args[i + 1];
    if (!name || !value || Object.hasOwn(result, name))
      throw new Error('Invalid installer arguments.');
    result[name] = value;
  }
  if (!result.directory || !/^[a-f0-9]{64}$/.test(result.expectedDigest))
    throw new Error(
      'The installation directory and independently obtained manifest digest are required.',
    );
  return result;
}

export function install(args, launch = spawnSync) {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error(
      'The installer requires independently installed Node24 or newer.',
    );
  const options = parseArguments(args);
  options.directory = privateDirectory(options.directory);
  options.bundleDirectory = realpathSync(
    dirname(fileURLToPath(import.meta.url)),
  );
  const control = privateDirectory(join(options.directory, 'control'));
  const lockPath = join(control, 'operation.lock');
  // An inherited descriptor avoids replacing/following the lock inode and lets
  // flock keep its kernel lease until the complete child operation terminates.
  const handle = openSync(
    lockPath,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    privateFile(lockPath);
    const locked = launch('flock', ['--exclusive', '--nonblock', '3'], {
      stdio: ['ignore', 'inherit', 'inherit', handle],
    });
    if (locked.error || locked.status !== 0)
      throw new Error('Another operation holds the installation lock.');
    const result = launch(
      process.execPath,
      [join(options.bundleDirectory, 'operation.mjs')],
      {
        input: JSON.stringify(options),
        stdio: ['pipe', 'inherit', 'inherit', handle],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...Object.fromEntries(
            [
              'DOCKER_HOST',
              'DOCKER_CONTEXT',
              'DOCKER_CONFIG',
              'DOCKER_CERT_PATH',
              'DOCKER_TLS_VERIFY',
            ]
              .filter((name) => process.env[name] !== undefined)
              .map((name) => [name, process.env[name]]),
          ),
        },
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        'Installation failed or another operation holds the installation lock.',
      );
  } finally {
    closeSync(handle);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    install(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'Studio installer refused. Use the verified complete bundle, trusted Node24/Cosign/Docker Compose/flock, a private installation directory and --expected-manifest-sha256 from an independent source.\n',
    );
    process.exitCode = 1;
  }
}
