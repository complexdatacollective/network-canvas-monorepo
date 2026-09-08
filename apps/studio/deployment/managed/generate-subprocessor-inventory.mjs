import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requestedRoot = process.argv.find((argument) =>
  argument.startsWith('--root='),
);
const root = requestedRoot
  ? resolve(requestedRoot.slice('--root='.length))
  : resolve(directory);
const source = JSON.parse(
  await readFile(join(root, 'subprocessor-estate.json'), 'utf8'),
);
const providerContract = JSON.parse(
  await readFile(join(root, 'estate-provider-contract.json'), 'utf8'),
);
const sizing = JSON.parse(
  await readFile(join(root, 'candidate-sizing.json'), 'utf8'),
);
const terraformFiles = (await readdir(root)).filter((name) =>
  /\.tf(?:\.json)?$/.test(name),
);
const terraformSources = await Promise.all(
  terraformFiles.map(async (name) => [
    name,
    await readFile(join(root, name), 'utf8'),
  ]),
);
const terraform = terraformSources.map(([, text]) => text).join('\n');
const knownResourceTypes = new Set([
  'cloudflare_r2_bucket',
  'crunchybridge_cluster',
  'aws_kms_key',
  'aws_kms_alias',
  'b2_bucket',
]);
const knownDataTypes = new Set([
  'crunchybridge_cloudprovider',
  'aws_caller_identity',
  'aws_iam_session_context',
]);
const knownProviderNames = new Set([
  'aws',
  'b2',
  'cloudflare',
  'crunchybridge',
]);

function matchingBrace(text, opening) {
  let depth = 0;
  let quote = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = opening; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === '#') {
      lineComment = true;
      continue;
    }
    if (!quote && character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' && !escaped) quote = !quote;
    escaped = quote && character === '\\' && !escaped;
    if (quote) continue;
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return index;
  }
  throw new Error('Managed Terraform configuration has an unterminated block.');
}

function hclBlocks(text) {
  const blocks = [];
  const header =
    /\b(terraform|provider|resource|data)\s*(?:"([a-zA-Z0-9_-]+)")?\s*(?:"([a-zA-Z0-9_-]+)")?\s*\{/g;
  for (const match of text.matchAll(header)) {
    const opening = match.index + match[0].lastIndexOf('{');
    blocks.push({
      kind: match[1],
      first: match[2],
      second: match[3],
      body: text.slice(opening + 1, matchingBrace(text, opening)),
    });
  }
  return blocks;
}

function topLevelAssignments(body) {
  const assignments = [];
  let depth = 0;
  let quote = false;
  let escaped = false;
  const assignment = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*/y;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '"' && !escaped) quote = !quote;
    escaped = quote && character === '\\' && !escaped;
    if (quote) continue;
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    if (depth === 0) {
      assignment.lastIndex = index;
      const match = assignment.exec(body);
      if (match) {
        assignments.push(match[1]);
        index = assignment.lastIndex - 1;
      }
    }
  }
  return assignments;
}

const hcl = terraformSources
  .filter(([file]) => file.endsWith('.tf'))
  .flatMap(([file, text]) =>
    hclBlocks(text).map((block) => ({ file, ...block })),
  );
const providersInHcl = hcl
  .filter(({ kind }) => kind === 'provider')
  .map(({ first }) => first);
const resourcesInHcl = hcl
  .filter(({ kind }) => kind === 'resource')
  .map(({ first }) => first);
const dataInHcl = hcl
  .filter(({ kind }) => kind === 'data')
  .map(({ first }) => first);
if (
  providersInHcl.some((name) => !knownProviderNames.has(name)) ||
  resourcesInHcl.some((name) => !knownResourceTypes.has(name)) ||
  dataInHcl.some((name) => !knownDataTypes.has(name))
)
  throw new Error(
    'Managed Terraform provider/resource inventory differs from the reviewed estate.',
  );
const rootAssignments = hcl
  .filter(({ kind }) => kind === 'terraform')
  .flatMap(({ body }) => topLevelAssignments(body));
if (
  rootAssignments.some(
    (name) => !['required_version', 'required_providers'].includes(name),
  )
)
  throw new Error(
    'Managed Terraform configuration contains an unsupported top-level declaration.',
  );
const inlineTopLevelAssignments = terraformSources
  .filter(([file]) => file.endsWith('.tf'))
  .flatMap(
    ([, text]) => text.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*\{/gm) ?? [],
  )
  .map((line) => line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)/)?.[1])
  .filter(Boolean);
if (inlineTopLevelAssignments.some((name) => name !== 'terraform'))
  throw new Error(
    'Managed Terraform configuration contains an unsupported top-level declaration.',
  );
const requiredProviderNames = hcl
  .filter(({ kind }) => kind === 'terraform')
  .flatMap(({ body }) =>
    [
      ...body.matchAll(
        /\b([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*\{[^{}]*\bsource\s*=\s*"[^"]+"/g,
      ),
    ].map((match) => match[1]),
  );
if (requiredProviderNames.some((name) => !knownProviderNames.has(name)))
  throw new Error(
    'Managed Terraform provider inventory differs from the reviewed estate.',
  );
for (const [, text] of terraformSources.filter(([file]) =>
  file.endsWith('.tf.json'),
)) {
  const parsed = JSON.parse(text);
  if (
    Object.keys(parsed.provider ?? {}).some(
      (name) => !knownProviderNames.has(name),
    )
  )
    throw new Error(
      'Managed Terraform provider inventory differs from the reviewed estate.',
    );
  for (const resourceType of Object.keys(parsed.resource ?? {})) {
    if (!knownResourceTypes.has(resourceType))
      throw new Error(
        `Managed Terraform resource inventory differs: ${resourceType}.`,
      );
  }
  for (const dataType of Object.keys(parsed.data ?? {})) {
    if (!knownDataTypes.has(dataType))
      throw new Error(`Managed Terraform data inventory differs: ${dataType}.`);
  }
}
const tfvars = await readFile(join(root, 'terraform.tfvars.example'), 'utf8');

const expectedProviderSources = Object.fromEntries(
  Object.entries(providerContract.providers).map(([name, provider]) => [
    name,
    provider.source,
  ]),
);
const mappedEstateProviders = source.providers
  .filter((provider) => provider.estateProvider)
  .map((provider) => provider.estateProvider);
if (
  new Set(mappedEstateProviders).size !== mappedEstateProviders.length ||
  Object.keys(expectedProviderSources).some(
    (name) => !mappedEstateProviders.includes(name),
  ) ||
  mappedEstateProviders.some(
    (name) => !Object.hasOwn(expectedProviderSources, name),
  )
)
  throw new Error(
    'Every Terraform provider must have exactly one inventory mapping.',
  );
const declaredSources = [
  ...hcl
    .filter(({ kind }) => kind === 'terraform')
    .flatMap(({ body }) =>
      [...body.matchAll(/\bsource\s*=\s*"([^"]+)"/g)].map((match) => match[1]),
    ),
  ...terraformSources
    .filter(([file]) => file.endsWith('.tf.json'))
    .flatMap(([, text]) => {
      const parsed = JSON.parse(text);
      return Object.values(parsed.terraform?.required_providers ?? {}).map(
        (provider) => provider.source,
      );
    }),
];
const declaredProviderBlocks = [
  ...providersInHcl,
  ...terraformSources
    .filter(([file]) => file.endsWith('.tf.json'))
    .flatMap(([, text]) => Object.keys(JSON.parse(text).provider ?? {})),
];
const expectedSources = Object.values(expectedProviderSources);
if (
  declaredSources.length !== expectedSources.length ||
  expectedSources.some(
    (value) =>
      declaredSources.filter((candidate) => candidate === value).length !== 1,
  ) ||
  declaredSources.some((value) => !expectedSources.includes(value)) ||
  declaredProviderBlocks.some(
    (name) => !Object.hasOwn(expectedProviderSources, name),
  )
)
  throw new Error(
    'Managed Terraform provider inventory differs from the reviewed estate.',
  );
const crunchyRegion = terraform.match(
  /resource\s+"crunchybridge_cluster"\s+"postgres"\s*\{[\s\S]*?^\s*region_id\s*=\s*"([^"]+)"/m,
)?.[1];
const kmsRegion = terraform.match(
  /provider\s+"aws"\s*\{[\s\S]*?^\s*region\s*=\s*"([^"]+)"/m,
)?.[1];
const primaryObjectJurisdiction = terraform.match(
  /resource\s+"cloudflare_r2_bucket"\s+"primary"\s*\{[\s\S]*?^\s*jurisdiction\s*=\s*"([^"]+)"/m,
)?.[1];
const recoveryRegion = tfvars.match(/^\s*b2_region\s*=\s*"([^"]+)"/m)?.[1];
if (!crunchyRegion)
  throw new Error(
    'Crunchy Data / Crunchy Bridge estate region contract is missing.',
  );
if (!kmsRegion)
  throw new Error('Amazon Web Services KMS region contract is missing.');
if (!primaryObjectJurisdiction)
  throw new Error('Cloudflare R2 jurisdiction contract is missing.');
if (!recoveryRegion)
  throw new Error('Backblaze recovery region contract is missing.');
if (crunchyRegion !== 'us-east-1' || kmsRegion !== 'us-east-1')
  throw new Error(
    'Managed estate regions differ from the reviewed US candidate.',
  );
for (const provider of source.providers) {
  if (
    !provider.name ||
    !provider.role ||
    !provider.status ||
    !Array.isArray(provider.dataCategories) ||
    provider.dataCategories.length === 0 ||
    !Array.isArray(provider.sourcePaths) ||
    provider.sourcePaths.length === 0
  )
    throw new Error('Subprocessor metadata is malformed.');
  for (const sourcePath of provider.sourcePaths) {
    if (typeof sourcePath !== 'string' || sourcePath.includes('\0'))
      throw new Error('Subprocessor source path is malformed.');
    if (requestedRoot && sourcePath.startsWith('..')) continue;
    await access(resolve(root, sourcePath));
  }
}
if (sizing.region !== 'iad')
  throw new Error(
    'Managed estate candidate sizing is not the reviewed US candidate.',
  );

const estate = {
  jurisdiction: source.residency.managedRegion,
  selfHostingAlternative: source.residency.selfHostingAlternative,
  configuredEstate: {
    computeRegion: sizing.region,
    postgresRegion: crunchyRegion,
    primaryObjectJurisdiction,
    recoveryRegion,
    kmsRegion,
    serviceNames: Object.keys(sizing.services),
    postgresPlan: sizing.postgres.planName,
    postgresStorageGb: sizing.postgres.storageGb,
  },
  providers: source.providers.map((provider) => ({
    ...provider,
    sourcePaths: provider.sourcePaths,
  })),
};

const outputJson = JSON.stringify(estate, null, 2) + '\n';
const providerTerraform = `${JSON.stringify({ terraform: { required_providers: providerContract.providers } }, null, 2)}\n`;
const rows = estate.providers.map(
  (provider) =>
    `| ${provider.name} | ${provider.role} | ${provider.dataCategories.join('; ')} | ${provider.status} |`,
);
const outputMarkdown = `# Managed Studio subprocessor inventory\n\nGenerated from \`subprocessor-estate.json\`, \`candidate-sizing.json\`, and the managed Terraform estate. This is an infrastructure inventory, not legal or contractual qualification.\n\nManaged service residency: **${estate.jurisdiction}**. ${estate.selfHostingAlternative}\n\nConfigured candidate: compute \`${estate.configuredEstate.computeRegion}\`; PostgreSQL \`${estate.configuredEstate.postgresRegion}\` (${estate.configuredEstate.postgresPlan}, ${estate.configuredEstate.postgresStorageGb} GB); primary R2 jurisdiction \`${estate.configuredEstate.primaryObjectJurisdiction}\`; recovery \`${estate.configuredEstate.recoveryRegion}\`; KMS \`${estate.configuredEstate.kmsRegion}\`. Services: ${estate.configuredEstate.serviceNames.join(', ')}.\n\n| Provider | Role | Data categories | Estate status |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\nProvider legal entities, affiliates, retention/deletion, security reports, breach terms, support, and account recovery must be confirmed by the #1260 publication process.\n`;

if (process.argv.includes('--check')) {
  const [json, markdown, providerTerraformOutput] = await Promise.all([
    readFile(join(root, 'subprocessor-inventory.json'), 'utf8'),
    readFile(join(root, 'SUBPROCESSORS.md'), 'utf8'),
    readFile(join(root, 'estate-provider-contract.tf.json'), 'utf8'),
  ]);
  if (
    json !== outputJson ||
    markdown !== outputMarkdown ||
    providerTerraformOutput !== providerTerraform
  )
    throw new Error(
      'Generated subprocessor inventory is stale; rerun this generator.',
    );
} else {
  await Promise.all([
    writeFile(join(root, 'subprocessor-inventory.json'), outputJson),
    writeFile(join(root, 'SUBPROCESSORS.md'), outputMarkdown),
    writeFile(
      join(root, 'estate-provider-contract.tf.json'),
      providerTerraform,
    ),
  ]);
}

export { estate };
