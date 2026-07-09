import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const protocolSources = {
  development: path.join(packageRoot, 'development'),
  sample: path.join(packageRoot, 'sample'),
};

const [protocolId, targetDirArg = '.'] = process.argv.slice(2);
const sourceDir = protocolSources[protocolId];

if (!sourceDir) {
  console.error(
    `Unknown protocol "${protocolId}". Expected one of: ${Object.keys(protocolSources).join(', ')}`,
  );
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), targetDirArg);

await mkdir(targetDir, { recursive: true });

await cp(
  path.join(sourceDir, 'protocol.json'),
  path.join(targetDir, 'protocol.json'),
);

await rm(path.join(targetDir, 'assets'), { recursive: true, force: true });

await cp(path.join(sourceDir, 'assets'), path.join(targetDir, 'assets'), {
  recursive: true,
});
