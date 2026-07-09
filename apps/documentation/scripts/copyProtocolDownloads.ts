import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const documentationRoot = resolve(import.meta.dirname, '..');
const sourceDir = resolve(
  documentationRoot,
  '../../packages/protocols/documentation/protocols',
);
const targetDir = resolve(documentationRoot, 'public/protocols');

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
