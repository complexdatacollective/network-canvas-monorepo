#!/usr/bin/env node

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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
const collectSourceMaps = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceMaps(path);
    return entry.name.endsWith('.js.map') ? [path] : [];
  });
const sourceMapPaths = collectSourceMaps(outputDirectory);

if (sourceMapPaths.length === 0) {
  throw new Error(`Expected at least one source map in ${outputDirectory}.`);
}

for (const sourceMapPath of sourceMapPaths) {
  const chunkPath = sourceMapPath.slice(0, -'.map'.length);
  if (!existsSync(chunkPath)) {
    throw new Error(`Expected JavaScript chunk ${chunkPath} to exist.`);
  }
  rmSync(sourceMapPath);
}

console.error(
  `PostHog upload stub processed ${sourceMapPaths.length} source map${sourceMapPaths.length === 1 ? '' : 's'}.`,
);
