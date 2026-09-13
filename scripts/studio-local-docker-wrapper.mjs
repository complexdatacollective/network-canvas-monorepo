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
const TARGET_SERVICES = ['studio', 'worker', 'registry'];
const OBSERVER_SERVICES = [
  'telemetry-kernel-studio',
  'telemetry-kernel-worker',
  'telemetry-kernel-registry',
];

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

export function qualificationKernelPreflightArguments(argumentsValue) {
  const command = argumentsValue.findIndex(
    (value, index) => index > 0 && value === 'up',
  );
  if (command < 0) return undefined;
  return {
    create: [
      ...argumentsValue.slice(0, command),
      'create',
      '--no-start',
      ...TARGET_SERVICES,
      'telemetry-detector',
      ...OBSERVER_SERVICES,
    ],
    start: [
      ...argumentsValue.slice(0, command),
      'start',
      'telemetry-detector',
      ...OBSERVER_SERVICES,
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const docker = process.env.STUDIO_QUALIFICATION_DOCKER;
  const overlay = process.env.STUDIO_QUALIFICATION_COMPOSE_OVERLAY;
  if (!docker || !overlay)
    throw new Error('Qualification Docker wrapper is unconfigured.');
  const qualifiedArguments = qualificationDockerArguments(
    process.argv.slice(2),
    {
      composeFile: process.env.COMPOSE_FILE,
      overlay,
    },
  );
  if (process.env.STUDIO_QUALIFICATION_START_KERNEL_OBSERVERS === '1') {
    const preflight = qualificationKernelPreflightArguments(qualifiedArguments);
    if (preflight) {
      for (const args of [preflight.create, preflight.start]) {
        const result = spawnSync(docker, args, { stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) process.exit(result.status ?? 125);
      }
    }
  }
  const result = spawnSync(docker, qualifiedArguments, { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 125);
}
