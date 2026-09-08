import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { format, type FormatConfig } from 'oxfmt';

import { generateRegistryOpenApi } from '../src/contract.ts';

await mkdir(new URL('../spec/', import.meta.url), { recursive: true });
const formatting = JSON.parse(
  await readFile(new URL('../../../.oxfmtrc.json', import.meta.url), 'utf8'),
) as FormatConfig;
const formatted = await format(
  'openapi.json',
  `${JSON.stringify(await generateRegistryOpenApi(), null, 2)}\n`,
  formatting,
);
if (formatted.errors.length) throw new Error('REGISTRY_SPEC_FORMAT_FAILED');
await writeFile(
  new URL('../spec/openapi.json', import.meta.url),
  formatted.code,
);
