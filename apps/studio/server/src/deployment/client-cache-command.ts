import { spawn } from 'node:child_process';
import { lstat, mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export type ClientCacheCommand = {
  action: 'retain' | 'verify' | 'archive';
  directory: string;
};

export function parseClientCacheArguments(args: string[]): ClientCacheCommand {
  const [action, option, directory] = args;
  if (
    args.length !== 3 ||
    (action !== 'retain' && action !== 'verify' && action !== 'archive') ||
    option !== '--directory' ||
    !directory ||
    !isAbsolute(directory) ||
    directory !== resolve(directory) ||
    directory === '/' ||
    directory.length > 4096
  )
    throw new Error('Invalid client asset command.');
  return { action, directory };
}

/** Wait for one exact child; never apply signals to a process group. */
export async function runClientCacheChild(
  executable: string,
  args: string[],
): Promise<void> {
  // Child tools may print operator-controlled paths. Only the public entry's
  // fixed refusal is diagnostic output; stdout can be the binary archive.
  const child = spawn(executable, args, {
    stdio: ['ignore', 'inherit', 'ignore'],
  });
  const term = () => child.kill('SIGTERM');
  const interrupt = () => child.kill('SIGINT');
  process.on('SIGTERM', term);
  process.on('SIGINT', interrupt);
  try {
    await new Promise<void>((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? done()
          : reject(new Error('Client asset operation failed.')),
      );
    });
  } finally {
    process.off('SIGTERM', term);
    process.off('SIGINT', interrupt);
  }
}

/** The worker itself inherits the kernel lock until it exits, even if this parent dies. */
export async function runLockedClientCacheCommand(
  command: ClientCacheCommand,
  workerPath: string,
): Promise<void> {
  const { action, directory } = command;
  if (action === 'retain')
    await mkdir(directory, { recursive: true, mode: 0o755 });
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Invalid client asset directory.');
  const lock = join(directory, '.lock');
  try {
    const info = await lstat(lock);
    if (!info.isFile() || info.nlink !== 1)
      throw new Error('Invalid client asset lock.');
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
  }
  await runClientCacheChild('/usr/bin/flock', [
    '--no-fork',
    '--exclusive',
    '--timeout',
    '30',
    lock,
    process.execPath,
    workerPath,
    action,
    '--directory',
    directory,
  ]);
}
