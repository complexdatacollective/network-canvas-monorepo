#!/usr/bin/env node

import { processPostHogSourceMapsOffline } from './posthog-source-maps-offline.ts';

const args = process.argv.slice(2);
const directoryArgument = args.indexOf('--directory');
const isSupportedInvocation =
  args[0] === 'sourcemap' &&
  args[1] === 'process' &&
  directoryArgument !== -1 &&
  !!args[directoryArgument + 1] &&
  args.includes('--delete-after');

if (!isSupportedInvocation) {
  throw new Error(
    `Expected "sourcemap process --directory <path> --delete-after"; received ${args.join(' ')}`,
  );
}

const outputDirectory = args[directoryArgument + 1];
const count = processPostHogSourceMapsOffline(outputDirectory);
console.error(`PostHog upload stub processed ${count} source maps.`);
