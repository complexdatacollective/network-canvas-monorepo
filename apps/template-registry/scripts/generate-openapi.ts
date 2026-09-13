import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { format, type FormatConfig } from 'oxfmt';

import { generateRegistryOpenApi } from '../src/contract.ts';
import { toOpenApi30 } from '../src/openapi-compatibility.ts';

await mkdir(new URL('../spec/', import.meta.url), { recursive: true });
// oxfmt exposes the config type but no runtime parser; this repository-owned
// JSON file is exercised by the formatter immediately below.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const formatting = JSON.parse(
  await readFile(new URL('../../../.oxfmtrc.json', import.meta.url), 'utf8'),
) as FormatConfig;
const normative = await generateRegistryOpenApi();
for (const [filename, document] of [
  ['openapi.json', normative],
  ['openapi-3.0.json', toOpenApi30(normative)],
] as const) {
  const formatted = await format(
    filename,
    `${JSON.stringify(document, null, 2)}\n`,
    formatting,
  );
  if (formatted.errors.length) throw new Error('REGISTRY_SPEC_FORMAT_FAILED');
  await writeFile(
    new URL(`../spec/${filename}`, import.meta.url),
    formatted.code,
  );
}
