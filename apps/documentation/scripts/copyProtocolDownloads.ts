import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const documentationRoot = resolve(import.meta.dirname, '..');
const protocolsPackageRoot = dirname(
  require.resolve('@codaco/protocols/manifest.json'),
);
const sourceDir = resolve(protocolsPackageRoot, 'documentation/protocols');
const targetDir = resolve(documentationRoot, 'public/protocols');

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
