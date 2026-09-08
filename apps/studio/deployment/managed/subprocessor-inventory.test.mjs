import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
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

test('provider integration removal fails the generated inventory guard', async () => {
  const script = join(directory, 'generate-subprocessor-inventory.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'studio-subprocessor-mutant-'));
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
  await Promise.all(
    ['subprocessor-inventory.json', 'SUBPROCESSORS.md'].map((file) =>
      cp(join(directory, file), join(temp, file)),
    ),
  );
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
  await Promise.all(
    [
      'subprocessor-estate.json',
      'estate-provider-contract.json',
      'estate-provider-contract.tf.json',
      'estate-config-manifest.json',
      'candidate-sizing.json',
      'versions.tf',
      'main.tf',
      'terraform.tfvars.example',
      'README.md',
      'observability-new-relic-logs.mjs',
      'cost-input.example.json',
    ].map((file) => cp(join(directory, file), join(temp, file))),
  );
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
