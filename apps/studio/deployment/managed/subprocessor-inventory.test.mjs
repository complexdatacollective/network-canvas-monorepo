import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));

async function copyReviewedEstate(temp) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'estate-config-manifest.json'), 'utf8'),
  );
  const files = new Set([
    ...Object.keys(manifest.files),
    'estate-config-manifest.json',
    'estate-provider-contract.json',
    'subprocessor-estate.json',
    'estate-provider-contract.tf.json',
    'subprocessor-inventory.json',
    'SUBPROCESSORS.md',
    'README.md',
  ]);
  await Promise.all(
    [...files].map((file) => cp(join(directory, file), join(temp, file))),
  );
  const baseline = spawnSync(
    process.execPath,
    [
      join(directory, 'generate-subprocessor-inventory.mjs'),
      `--root=${temp}`,
      '--check',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(
    baseline.status,
    0,
    `Unchanged mutation fixture must pass: ${baseline.stderr}`,
  );
}

async function approveManifestFile(temp, file) {
  const path = join(temp, 'estate-config-manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.files[file] = createHash('sha256')
    .update(await readFile(join(temp, file)))
    .digest('hex');
  await writeFile(path, JSON.stringify(manifest));
}

function generateAt(temp, check = false) {
  return spawnSync(
    process.execPath,
    [
      join(directory, 'generate-subprocessor-inventory.mjs'),
      `--root=${temp}`,
      ...(check ? ['--check'] : []),
    ],
    { encoding: 'utf8' },
  );
}

test('regenerates an approved provider-source change without editing generated output', async (context) => {
  const temp = await mkdtemp(join(tmpdir(), 'studio-provider-change-'));
  context.after(() => rm(temp, { recursive: true, force: true }));
  await copyReviewedEstate(temp);
  const contractPath = join(temp, 'estate-provider-contract.json');
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  contract.providers.random = { source: 'hashicorp/random', version: '3.7.2' };
  await writeFile(contractPath, JSON.stringify(contract));
  await approveManifestFile(temp, 'estate-provider-contract.json');
  const metadataPath = join(temp, 'subprocessor-estate.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  metadata.providers.push({
    name: 'Random',
    role: 'Local random resource candidate',
    dataCategories: ['generated values'],
    status: 'candidate',
    sourcePaths: ['README.md'],
    estateProvider: 'random',
  });
  await writeFile(metadataPath, JSON.stringify(metadata));
  const generated = generateAt(temp);
  assert.equal(generated.status, 0, generated.stderr);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(temp, 'estate-provider-contract.tf.json'), 'utf8'),
    ).terraform.required_providers.random,
    contract.providers.random,
  );
  assert.equal(generateAt(temp, true).status, 0);
  contract.providers.random.source = 'example/random';
  await writeFile(contractPath, JSON.stringify(contract));
  await approveManifestFile(temp, 'estate-provider-contract.json');
  const changed = generateAt(temp);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(
    JSON.parse(
      await readFile(join(temp, 'estate-provider-contract.tf.json'), 'utf8'),
    ).terraform.required_providers.random.source,
    'example/random',
  );
  assert.equal(generateAt(temp, true).status, 0);
});

for (const [file, extra] of [
  ['versions.tf', '\nprovider "google" {}\n'],
  ['unknown.tf', 'resource "google_storage_bucket" "assets" {}\n'],
  [
    'unknown.tf.json',
    JSON.stringify({ resource: { google_storage_bucket: { assets: {} } } }),
  ],
  ['module.tf', 'module "external" { source = "./uninspected" }\n'],
  [
    'same-provider.tf',
    'resource "cloudflare_r2_bucket" "unreviewed_eu" { jurisdiction = "eu" }\n',
  ],
  ['same-provider-data.tf', 'data "aws_s3_bucket" "unreviewed" {}\n'],
  ['alias.tf', 'provider "b2" { alias = "unreviewed" }\n'],
])
  test(`refuses unmapped declarations in approved ${file}`, async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-approved-provider-'));
    context.after(() => rm(temp, { recursive: true, force: true }));
    await copyReviewedEstate(temp);
    const previous = await readFile(join(temp, file), 'utf8').catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    });
    await writeFile(join(temp, file), previous + extra);
    await approveManifestFile(temp, file);
    const result = generateAt(temp, true);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /top-level operational blocks|provider.*inventory|provider.*mapping|resource\/data inventory/,
    );
  });

for (const [file, extra] of [
  [
    'ephemeral.tf',
    'ephemeral "aws_secretsmanager_secret_version" "unreviewed" {\n  secret_id = "unreviewed"\n}\n',
  ],
  ['action.tf', 'action "external" "unreviewed" {}\n'],
  [
    'import.tf',
    'import {\n  to = aws_kms_key.studio_root\n  id = "unreviewed"\n}\n',
  ],
  [
    'moved.tf',
    'moved {\n  from = aws_kms_key.studio_root\n  to = aws_kms_key.studio_root\n}\n',
  ],
])
  test(`refuses unsupported approved top-level operational block ${file}`, async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-approved-top-level-'));
    context.after(() => rm(temp, { recursive: true, force: true }));
    await copyReviewedEstate(temp);
    await writeFile(join(temp, file), extra);
    await approveManifestFile(temp, file);
    const result = generateAt(temp, true);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /top-level operational blocks|configuration|support/i,
    );
  });

for (const [name, extra] of [
  [
    'backend',
    '\nterraform {\n  backend "http" {\n    address = "https://state.example.test"\n  }\n}\n',
  ],
  [
    'cloud',
    '\nterraform {\n  cloud {\n    organization = "unreviewed"\n    workspaces { name = "unreviewed" }\n  }\n}\n',
  ],
])
  test(`refuses an approved Terraform ${name} subblock`, async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-approved-terraform-'));
    context.after(() => rm(temp, { recursive: true, force: true }));
    await copyReviewedEstate(temp);
    const path = join(temp, 'versions.tf');
    await writeFile(path, `${await readFile(path, 'utf8')}${extra}`);
    await approveManifestFile(temp, 'versions.tf');
    const result = generateAt(temp, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /backend\/cloud subblocks|support/i);
  });

for (const [name, nested] of [
  [
    'provisioner',
    'provisioner "local-exec" {\n    command = "echo unreviewed"\n  }',
  ],
  ['connection', 'connection {\n    host = "unreviewed"\n  }'],
])
  test(`refuses an approved resource ${name} side effect`, async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-approved-side-effect-'));
    context.after(() => rm(temp, { recursive: true, force: true }));
    await copyReviewedEstate(temp);
    const path = join(temp, 'main.tf');
    const original = await readFile(path, 'utf8');
    await writeFile(
      path,
      original.replace(
        'rotation_period_in_days = 365',
        `rotation_period_in_days = 365\n  ${nested}`,
      ),
    );
    await approveManifestFile(temp, 'main.tf');
    const result = generateAt(temp, true);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /provisioner\/connection side effects|support/i,
    );
  });

for (const [file, pattern, replacement] of [
  [
    'terraform.tfvars.example',
    /b2_region\s*=\s*"us-west-004"/,
    'b2_region = "eu-central-003"',
  ],
  ['main.tf', /jurisdiction\s*=\s*"us"/, 'jurisdiction = "eu"'],
])
  test(`refuses non-US storage after approval of ${file}`, async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-approved-residency-'));
    context.after(() => rm(temp, { recursive: true, force: true }));
    await copyReviewedEstate(temp);
    const before = await readFile(join(temp, file), 'utf8');
    const after = before.replace(pattern, replacement);
    assert.notEqual(
      after,
      before,
      'The residency mutation must change the actual configuration.',
    );
    await writeFile(join(temp, file), after);
    await approveManifestFile(temp, file);
    const result = generateAt(temp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regions.*US candidate/);
  });
test('generated inventory is current and includes every referenced estate provider', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const result = spawnSync(process.execPath, [script, '--check'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(
    await readFile(join(directory, 'subprocessor-inventory.json'), 'utf8'),
  );
  assert.deepEqual(inventory.configuredEstate.serviceNames, [
    'studio-production',
    'studio-staging',
    'registry-production',
    'registry-staging',
  ]);
  for (const name of [
    'Netlify',
    'Postmark',
    'Fly.io',
    'Crunchy Data / Crunchy Bridge on AWS',
    'Cloudflare',
    'Backblaze',
    'Amazon Web Services',
    'New Relic',
    'PostHog relay',
  ])
    assert.ok(
      inventory.providers.some((provider) => provider.name === name),
      name,
    );
});

test('scopes geography claims and preserves unqualified provider geography', async () => {
  const inventory = JSON.parse(
    await readFile(join(directory, 'subprocessor-inventory.json'), 'utf8'),
  );
  assert.equal(inventory.validatedInfrastructure.jurisdiction, 'United States');
  assert.match(
    inventory.validatedInfrastructure.scope,
    /Configured candidate placements only/,
  );
  assert.equal(inventory.jurisdiction, undefined);
  for (const name of ['New Relic', 'PostHog relay', 'Netlify', 'Postmark']) {
    assert.equal(
      inventory.providers.find((provider) => provider.name === name).geography,
      'Provider geography is unqualified by this inventory.',
    );
  }
  assert.match(
    inventory.providers.find((provider) => provider.name === 'Cloudflare')
      .geography,
    /edge processing geography is unqualified/,
  );
  const markdown = await readFile(join(directory, 'SUBPROCESSORS.md'), 'utf8');
  assert.doesNotMatch(markdown, /Managed service residency:/);
  assert.match(markdown, /Validated infrastructure placement jurisdiction/);
  assert.match(markdown, /Geography qualification/);
  assert.match(markdown, /mail delivery, telemetry, CDN, and edge processing/);
});

test('required unqualified geography metadata cannot be removed after review', async (context) => {
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-geography-'));
  context.after(() => rm(temp, { recursive: true, force: true }));
  await copyReviewedEstate(temp);
  const path = join(temp, 'subprocessor-estate.json');
  const source = JSON.parse(await readFile(path, 'utf8'));
  delete source.providers.find((provider) => provider.name === 'Postmark')
    .geography;
  await writeFile(path, `${JSON.stringify(source)}\n`);
  const result = generateAt(temp, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /provider geography qualification metadata/i);
});

test('provider integration removal fails the generated inventory guard', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-mutant-'));
  await copyReviewedEstate(temp);
  const original = await readFile(join(temp, 'main.tf'), 'utf8');
  await writeFile(
    join(temp, 'main.tf'),
    original.replace('cloudflare_r2_bucket', 'removed_r2_bucket'),
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(
      result.status,
      0,
      'removing the Cloudflare estate seam must fail the guard',
    );
    assert.match(result.stderr, /configuration|manifest|inventory/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('candidate sizing changes fail closed until the reviewed manifest is updated', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-sizing-'));
  await copyReviewedEstate(temp);
  const sizing = JSON.parse(
    await readFile(join(temp, 'candidate-sizing.json'), 'utf8'),
  );
  sizing.postgres.storageGb = 24;
  await writeFile(
    join(temp, 'candidate-sizing.json'),
    `${JSON.stringify(sizing, null, 2)}\n`,
  );
  try {
    const regenerated = spawnSync(
      process.execPath,
      [script, `--root=${temp}`],
      {
        encoding: 'utf8',
      },
    );
    assert.notEqual(regenerated.status, 0);
    assert.match(regenerated.stderr, /manifest|configuration/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('actual Terraform region changes fail instead of retaining a US claim', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-region-'));
  await copyReviewedEstate(temp);
  const main = await readFile(join(temp, 'main.tf'), 'utf8');
  await writeFile(
    join(temp, 'main.tf'),
    main.replace('region_id     = "us-east-1"', 'region_id     = "eu-west-1"'),
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /configuration|manifest|region/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('an untracked Terraform provider fails exact provider coverage', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-provider-'));
  await copyReviewedEstate(temp);
  const versions = await readFile(join(temp, 'versions.tf'), 'utf8');
  await writeFile(
    join(temp, 'versions.tf'),
    `${versions}\n# inline provider mutant\nterraform { required_providers { google = { source = "hashicorp/google", version = "7.0.0" } } }\n`,
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /configuration|manifest|provider|inventory/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('a provider added in another Terraform file fails exact coverage', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-new-file-'));
  await copyReviewedEstate(temp);
  await writeFile(
    join(temp, 'provider-google.tf'),
    'terraform { required_providers { google = { source = "hashicorp/google" } } }\n',
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /configuration|manifest|provider|inventory/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('a no-source provider block and unknown JSON resource fail closed', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-unknown-'));
  await copyReviewedEstate(temp);
  await writeFile(join(temp, 'provider-google.tf'), 'provider "google" {}\n');
  await writeFile(
    join(temp, 'provider-google.tf.json'),
    JSON.stringify({ provider: { google: {} } }),
  );
  await writeFile(
    join(temp, 'resource-google.tf.json'),
    JSON.stringify({ resource: { google_storage_bucket: { assets: {} } } }),
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /configuration|manifest|provider|resource inventory/i,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('malformed metadata and missing source paths fail closed', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-metadata-'));
  await copyReviewedEstate(temp);
  const source = JSON.parse(
    await readFile(join(temp, 'subprocessor-estate.json'), 'utf8'),
  );
  source.providers[0].sourcePaths = ['missing.tf'];
  await writeFile(
    join(temp, 'subprocessor-estate.json'),
    `${JSON.stringify(source)}\n`,
  );
  try {
    const result = spawnSync(process.execPath, [script, `--root=${temp}`], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
