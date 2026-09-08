import { mkdir, writeFile } from 'node:fs/promises';

import { generateRegistryOpenApi } from '../src/contract.ts';

await mkdir(new URL('../spec/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../spec/openapi.json', import.meta.url),
  `${JSON.stringify(await generateRegistryOpenApi(), null, 2)}\n`,
);
