#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';

const COMPOSE_COMMANDS = new Set([
  'config',
  'down',
  'exec',
  'ps',
  'run',
  'stop',
  'up',
]);

export function qualificationDockerArguments(
  argumentsValue,
  { composeFile = '', overlay },
) {
  if (
    !Array.isArray(argumentsValue) ||
    !argumentsValue.every((value) => typeof value === 'string')
  )
    throw new Error('Qualification Docker arguments are invalid.');
  if (argumentsValue[0] !== 'compose') return [...argumentsValue];
  const command = argumentsValue.findIndex(
    (value, index) => index > 0 && COMPOSE_COMMANDS.has(value),
  );
  if (command < 0 || typeof overlay !== 'string' || !overlay.startsWith('/'))
    throw new Error('Qualification Compose invocation is invalid.');
  const result = [...argumentsValue];
  const globals = result.slice(1, command);
  const explicit = globals.some(
    (value) =>
      value === '-f' || value === '--file' || value.startsWith('--file='),
  );
  const inherited = explicit
    ? []
    : composeFile
        .split(delimiter)
        .filter(Boolean)
        .flatMap((path) => ['-f', path]);
  if (!explicit && inherited.length === 0)
    throw new Error(
      'Qualification Compose requires explicit files or COMPOSE_FILE.',
    );
  result.splice(command, 0, ...inherited, '-f', overlay);
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const docker = process.env.STUDIO_QUALIFICATION_DOCKER;
  const overlay = process.env.STUDIO_QUALIFICATION_COMPOSE_OVERLAY;
  if (!docker || !overlay)
    throw new Error('Qualification Docker wrapper is unconfigured.');
  const result = spawnSync(
    docker,
    qualificationDockerArguments(process.argv.slice(2), {
      composeFile: process.env.COMPOSE_FILE,
      overlay,
    }),
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 125);
}
