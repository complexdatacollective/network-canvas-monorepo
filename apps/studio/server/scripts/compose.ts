/* oxlint-disable no-console -- dev tooling log output */

/*
 * What `dev.ts` and `dev-stack.ts` share (#1909): where the stack's files are,
 * how a Compose project is invoked, and the two file secrets both lanes need
 * on disk before anything starts.
 *
 * The two scripts run the same `../../docker-compose.yml` with different
 * overrides and different project names — `dev.ts` publishes the backing
 * services on the loopback and leaves the Studio processes to a checkout,
 * `dev-stack.ts` runs every container the file declares — so the invocation
 * is the thing to keep in one place. A second copy of it is how the lanes
 * would drift into disagreeing about which file is applied or which project a
 * `down` tears apart.
 */

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { DEV } from '../src/env/catalogue.ts';

export const studioRoot = new URL('../../', import.meta.url);
/** The Docker build context both images are built from. */
export const repositoryRoot = new URL('../../../../', import.meta.url);

export const composeFile = fileURLToPath(
  new URL('docker-compose.yml', studioRoot),
);
export const devComposeFile = fileURLToPath(
  new URL('docker-compose.dev.yml', studioRoot),
);
export const localComposeFile = fileURLToPath(
  new URL('docker-compose.local.yml', studioRoot),
);
const secretsDirectory = fileURLToPath(new URL('secrets/', studioRoot));

/**
 * The keyring the encryption work (#1900) reads through
 * `STUDIO_SECRETS_KEY_FILE`, which the compose file mounts as a file secret.
 * This is the value `.env.development` carries as `STUDIO_SECRETS_KEY` once
 * that issue lands; it is published, and is a development fixture only.
 */
const DEV_SECRETS_KEY = 'dev:c3R1ZGlvLWRldi1rZXlyaW5nLW5vdC1mb3ItcHJvZCE=';

export type ComposeResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type ComposeRunOptions = {
  /** Silence the run and return its output instead of inheriting the terminal. */
  capture?: boolean;
  /**
   * Profiles to enable for this one command. `--profile` is a flag of
   * `docker compose` itself rather than of its subcommands, which is why it
   * cannot simply be passed in `args`.
   */
  profiles?: readonly string[];
};

export type Compose = {
  /** Runs to completion. `capture` silences it and returns the output instead. */
  run(args: string[], options?: ComposeRunOptions): ComposeResult;
  /** For the long-lived invocations — `logs -f` — that outlive one call. */
  start(args: string[]): ChildProcess;
};

/**
 * One Compose project: the `-p`, the `-f` chain and, where a lane has one, the
 * `--env-file` are fixed here, so no caller can name three of the four.
 *
 * `environment` is merged over this process's own, because Compose interpolates
 * the file from the environment it is run in. `dev.ts` supplies every variable
 * that way; `dev-stack.ts` writes them to a file and names it instead, so the
 * same values are there for a `docker compose` a developer types by hand.
 */
export function createCompose(options: {
  project: string;
  files: readonly string[];
  environment?: Record<string, string>;
  envFile?: string;
}): Compose {
  const flags = [
    'compose',
    '-p',
    options.project,
    ...(options.envFile ? ['--env-file', options.envFile] : []),
    ...options.files.flatMap((file) => ['-f', file]),
  ];
  const environment = { ...process.env, ...options.environment };

  return {
    run(args, runOptions = {}) {
      const profiles = (runOptions.profiles ?? []).flatMap((profile) => [
        '--profile',
        profile,
      ]);
      const result = spawnSync('docker', [...flags, ...profiles, ...args], {
        encoding: 'utf8',
        env: environment,
        stdio: runOptions.capture ? 'pipe' : ['inherit', 'inherit', 'pipe'],
      });
      const stderr = result.stderr ?? '';
      // Compose writes progress to stderr, so an inherited run still has to
      // print it — only a captured one is silent.
      if (!runOptions.capture && stderr) process.stderr.write(stderr);
      return {
        status: result.status ?? -1,
        stdout: result.stdout ?? '',
        stderr,
      };
    },
    start(args) {
      return spawn('docker', [...flags, ...args], {
        stdio: 'inherit',
        env: environment,
      });
    },
  };
}

/**
 * The two Compose file secrets, with development values. Written only when
 * absent, so a developer who put a real value in one keeps it.
 *
 * Both lanes need them on disk before `docker compose up`: Compose resolves
 * every declared secret while it builds the project model, so a missing file
 * fails the whole command rather than only the services that mount it.
 */
export function writeSecretsIfAbsent(): void {
  mkdirSync(secretsDirectory, { recursive: true });
  const files: [name: string, contents: string, what: string][] = [
    ['postgres-password', DEV.pgPassword, 'the development database password'],
    ['studio-secrets-key', DEV_SECRETS_KEY, 'the development keyring'],
  ];
  for (const [name, contents, what] of files) {
    const path = `${secretsDirectory}${name}`;
    if (existsSync(path)) continue;
    writeFileSync(path, `${contents}\n`, { mode: 0o600 });
    console.log(`Wrote secrets/${name} — ${what}`);
  }
}
