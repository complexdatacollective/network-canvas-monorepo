import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '@cdktn/hcl2json';
import { format } from 'oxfmt';

const directory = fileURLToPath(new URL('.', import.meta.url));
const formatting = JSON.parse(
  await readFile(new URL('../../../../.oxfmtrc.json', import.meta.url), 'utf8'),
);
async function formatOutput(name, sourceText) {
  const result = await format(name, sourceText, formatting);
  if (result.errors.length)
    throw new Error(`Cannot format generated inventory: ${name}`);
  return result.code;
}
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
const providerTerraform = `${JSON.stringify({ terraform: { required_providers: providerContract.providers } }, null, 2)}\n`;
const generatedProviderFile = 'estate-provider-contract.tf.json';
const sizing = JSON.parse(
  await readFile(join(root, 'candidate-sizing.json'), 'utf8'),
);
const terraformFiles = (await readdir(root)).filter((name) =>
  /\.tf(?:\.json)?$/.test(name),
);
const terraformSources = await Promise.all(
  terraformFiles
    .filter((name) => name !== generatedProviderFile)
    .map(async (name) => [name, await readFile(join(root, name), 'utf8')]),
);
terraformSources.push([generatedProviderFile, providerTerraform]);
const manifest = JSON.parse(
  await readFile(join(root, 'estate-config-manifest.json'), 'utf8'),
);
const manifestFiles = Object.keys(manifest.files).toSorted();
const actualConfigFiles = terraformFiles
  .filter((name) => name !== generatedProviderFile)
  .concat([
    'estate-provider-contract.json',
    'candidate-sizing.json',
    'cost-input.example.json',
    'terraform.tfvars.example',
  ])
  .toSorted();
if (JSON.stringify(manifestFiles) !== JSON.stringify(actualConfigFiles))
  throw new Error(
    'Managed estate configuration files differ from the reviewed manifest.',
  );
const { createHash } = await import('node:crypto');
for (const file of manifestFiles) {
  const digest = createHash('sha256')
    .update(await readFile(join(root, file)))
    .digest('hex');
  if (digest !== manifest.files[file])
    throw new Error(
      `Managed estate configuration changed: ${file}. Review and update the manifest.`,
    );
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
// Parse HCL as well as Terraform JSON. A refreshed review manifest does not
// make an unmapped provider/resource or an inconsistent residency claim safe.
const configurations = await Promise.all(
  terraformSources.map(async ([file, text]) =>
    file.endsWith('.tf.json') ? JSON.parse(text) : parse(file, text),
  ),
);
const blocks = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const supportedTopLevelBlocks = new Set([
  'check',
  'data',
  'locals',
  'output',
  'provider',
  'resource',
  'terraform',
  'variable',
]);
const supportedTerraformBlocks = new Set([
  'required_providers',
  'required_version',
]);
for (const configuration of configurations) {
  const unsupportedTopLevel = Object.keys(configuration).filter(
    (kind) => !supportedTopLevelBlocks.has(kind),
  );
  if (unsupportedTopLevel.length)
    throw new Error(
      'Managed Terraform top-level operational blocks require explicit support.',
    );
  for (const terraform of blocks(configuration.terraform)) {
    const unsupportedTerraform = Object.keys(terraform).filter(
      (kind) => !supportedTerraformBlocks.has(kind),
    );
    if (unsupportedTerraform.length)
      throw new Error(
        'Managed Terraform backend/cloud subblocks require explicit support.',
      );
  }
}
// Every supported block participates in the residency review below. A new
// resource/data block needs an explicit inventory extension, even if its
// provider is already listed and the changed input hash has been approved.
const supportedBlocks = {
  resource: [
    'aws_kms_alias.studio_root',
    'aws_kms_key.studio_root',
    'b2_bucket.independent_recovery',
    'cloudflare_r2_bucket.primary',
    'crunchybridge_cluster.postgres',
  ],
  data: [
    'aws_caller_identity.deployment',
    'aws_iam_session_context.deployment',
    'crunchybridge_cloudprovider.aws',
  ],
};
for (const [kind, expected] of Object.entries(supportedBlocks)) {
  const actual = configurations.flatMap((configuration) =>
    Object.entries(configuration[kind] ?? {}).flatMap(([type, instances]) =>
      Object.entries(instances).flatMap(([name, values]) =>
        blocks(values).map(() => `${type}.${name}`),
      ),
    ),
  );
  if (JSON.stringify(actual.toSorted()) !== JSON.stringify(expected))
    throw new Error(
      'Managed Terraform resource/data inventory requires explicit support.',
    );
}
const declarations = configurations.flatMap((configuration) =>
  blocks(configuration.terraform).flatMap((terraform) =>
    blocks(terraform.required_providers).flatMap((providers) =>
      Object.entries(providers),
    ),
  ),
);
if (
  declarations.length !== Object.keys(providerContract.providers).length ||
  Object.keys(providerContract.providers).some(
    (name) =>
      declarations.filter(([candidate]) => candidate === name).length !== 1,
  ) ||
  declarations.some(
    ([name, provider]) =>
      provider.source !== providerContract.providers[name]?.source ||
      provider.version !== providerContract.providers[name]?.version,
  )
)
  throw new Error(
    'Managed Terraform provider declarations differ from the reviewed inventory.',
  );
for (const configuration of configurations) {
  if (Object.keys(configuration.module ?? {}).length)
    throw new Error(
      'Managed Terraform module provider inventory requires explicit support.',
    );
  for (const [name, values] of Object.entries(configuration.provider ?? {})) {
    if (!Object.hasOwn(expectedProviderSources, name))
      throw new Error(
        'Managed Terraform provider block has no inventory mapping.',
      );
    if (blocks(values).some((provider) => provider.alias !== undefined))
      throw new Error(
        'Managed Terraform provider aliases require explicit inventory support.',
      );
  }
  for (const kind of ['resource', 'data']) {
    for (const [type, instances] of Object.entries(configuration[kind] ?? {})) {
      for (const instance of Object.values(instances).flatMap(blocks)) {
        if (
          Object.hasOwn(instance, 'provisioner') ||
          Object.hasOwn(instance, 'connection')
        )
          throw new Error(
            'Managed Terraform resource provisioner/connection side effects require explicit support.',
          );
        const binding = instance.provider;
        const name =
          binding === undefined
            ? type.split('_')[0]
            : typeof binding === 'string'
              ? binding.replace(/^\$\{(.+)\}$/, '$1').split('.')[0]
              : '';
        if (
          !Object.hasOwn(expectedProviderSources, name) ||
          (binding !== undefined &&
            binding !== name &&
            binding !== `\${${name}}`)
        )
          throw new Error(
            'Managed Terraform resource provider has no inventory mapping.',
          );
      }
    }
  }
}
function oneBlock(kind, type, name) {
  const matches = configurations.flatMap((configuration) =>
    blocks(
      name === undefined
        ? configuration[kind]?.[type]
        : configuration[kind]?.[type]?.[name],
    ),
  );
  if (matches.length !== 1)
    throw new Error('Managed estate region contract is missing or ambiguous.');
  return matches[0];
}
const crunchyRegion = oneBlock(
  'resource',
  'crunchybridge_cluster',
  'postgres',
).region_id;
const kmsRegion = oneBlock('provider', 'aws').region;
const primaryObjectJurisdiction = oneBlock(
  'resource',
  'cloudflare_r2_bucket',
  'primary',
).jurisdiction;
const recoveryRegion = (await parse('terraform.tfvars', tfvars)).b2_region;
if (
  crunchyRegion !== 'us-east-1' ||
  kmsRegion !== 'us-east-1' ||
  primaryObjectJurisdiction !== 'us' ||
  typeof recoveryRegion !== 'string' ||
  !/^us-(?:east|west)-\d{3}$/.test(recoveryRegion) ||
  source.residency.managedRegion !== 'United States'
)
  throw new Error(
    'Managed estate regions differ from the reviewed US candidate.',
  );
const requiredProviderGeography = {
  'Cloudflare':
    'R2 primary object jurisdiction is validated as US; CDN, DNS, Worker, and edge processing geography is unqualified by this inventory.',
  'New Relic': 'Provider geography is unqualified by this inventory.',
  'PostHog relay': 'Provider geography is unqualified by this inventory.',
  'Netlify': 'Provider geography is unqualified by this inventory.',
  'Postmark': 'Provider geography is unqualified by this inventory.',
};
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
  if (
    Object.hasOwn(requiredProviderGeography, provider.name) &&
    provider.geography !== requiredProviderGeography[provider.name]
  )
    throw new Error(
      'Required provider geography qualification metadata is missing.',
    );
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
  validatedInfrastructure: {
    jurisdiction: source.residency.managedRegion,
    scope:
      'Configured candidate placements only; provider-wide geography is not qualified by this inventory.',
  },
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

const outputJson = await formatOutput(
  'subprocessor-inventory.json',
  JSON.stringify(estate, null, 2) + '\n',
);

const rows = estate.providers.map(
  (provider) =>
    `| ${provider.name} | ${provider.role} | ${provider.dataCategories.join('; ')} | ${provider.geography ?? 'Provider-wide geography is not qualified by this inventory.'} | ${provider.status} |`,
);
const outputMarkdown = `# Managed Studio subprocessor inventory\n\nGenerated from \`subprocessor-estate.json\`, \`candidate-sizing.json\`, the managed Terraform estate, and the reviewed \`estate-config-manifest.json\`. Configuration changes fail closed until the manifest is deliberately reviewed and updated. This is an infrastructure inventory, not legal or contractual qualification.\n\nValidated infrastructure placement jurisdiction: **${estate.validatedInfrastructure.jurisdiction}** for the configured candidate locations below only. Provider-wide geography, including mail delivery, telemetry, CDN, and edge processing, is not qualified by this inventory. ${estate.selfHostingAlternative}\n\nConfigured candidate: compute \`${estate.configuredEstate.computeRegion}\`; PostgreSQL \`${estate.configuredEstate.postgresRegion}\` (${estate.configuredEstate.postgresPlan}, ${estate.configuredEstate.postgresStorageGb} GB); primary R2 jurisdiction \`${estate.configuredEstate.primaryObjectJurisdiction}\`; recovery \`${estate.configuredEstate.recoveryRegion}\`; KMS \`${estate.configuredEstate.kmsRegion}\`. Services: ${estate.configuredEstate.serviceNames.join(', ')}.\n\n| Provider | Role | Data categories | Geography qualification | Estate status |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nProvider legal entities, affiliates, retention/deletion, security reports, breach terms, support, and account recovery must be confirmed by the #1260 publication process.\n`;

const formattedMarkdown = await formatOutput(
  'SUBPROCESSORS.md',
  outputMarkdown,
);
if (process.argv.includes('--check')) {
  const [json, markdown, providerTerraformOutput] = await Promise.all([
    readFile(join(root, 'subprocessor-inventory.json'), 'utf8'),
    readFile(join(root, 'SUBPROCESSORS.md'), 'utf8'),
    readFile(join(root, 'estate-provider-contract.tf.json'), 'utf8'),
  ]);
  if (
    json !== outputJson ||
    markdown !== formattedMarkdown ||
    providerTerraformOutput !== providerTerraform
  )
    throw new Error(
      'Generated subprocessor inventory is stale; rerun this generator.',
    );
} else {
  await Promise.all([
    writeFile(join(root, 'subprocessor-inventory.json'), outputJson),
    writeFile(join(root, 'SUBPROCESSORS.md'), formattedMarkdown),
    writeFile(
      join(root, 'estate-provider-contract.tf.json'),
      providerTerraform,
    ),
  ]);
}

export { estate };
