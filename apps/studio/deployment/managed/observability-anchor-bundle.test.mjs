import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import { buildManagedAnchorArtifact } from './build-observability-anchor.mjs';

test('builds a checkout-free Lambda and operator closure with its pinned AWS SDK', async () => {
  const output = await mkdtemp(join(tmpdir(), 'studio-anchor-bundle-'));
  const canaries = [
    'bundle-must-not-contain-forwarder-token',
    'bundle-must-not-contain-aws-secret',
  ];
  const previousForwarderToken = process.env.STUDIO_ANCHOR_FORWARDER_TOKEN;
  const previousAwsSecret = process.env.AWS_SECRET_ACCESS_KEY;
  process.env.STUDIO_ANCHOR_FORWARDER_TOKEN = canaries[0];
  process.env.AWS_SECRET_ACCESS_KEY = canaries[1];
  let build;
  let repeated;
  try {
    build = await buildManagedAnchorArtifact(join(output, 'build'));
    repeated = await buildManagedAnchorArtifact(join(output, 'repeated'));
  } finally {
    if (previousForwarderToken === undefined)
      delete process.env.STUDIO_ANCHOR_FORWARDER_TOKEN;
    else process.env.STUDIO_ANCHOR_FORWARDER_TOKEN = previousForwarderToken;
    if (previousAwsSecret === undefined)
      delete process.env.AWS_SECRET_ACCESS_KEY;
    else process.env.AWS_SECRET_ACCESS_KEY = previousAwsSecret;
  }
  assert.equal(
    createHash('sha256')
      .update(await readFile(build.artifact))
      .digest('hex'),
    createHash('sha256')
      .update(await readFile(repeated.artifact))
      .digest('hex'),
  );
  assert.deepEqual((await readdir(build.runtime)).toSorted(), [
    'assets',
    'authorize-month.mjs',
    'enroll.mjs',
    'lambda.mjs',
  ]);
  const lambdaBytes = await readFile(join(build.runtime, 'lambda.mjs'), 'utf8');
  assert.match(lambdaBytes, /DynamoDBClient/);
  assert.doesNotMatch(lambdaBytes, /@aws-sdk\/client-dynamodb/);
  assert.doesNotMatch(lambdaBytes, /\.\.\//);
  const archive = await JSZip.loadAsync(await readFile(build.artifact));
  const extracted = join(output, 'checkout-free');
  const archivedBytes = [];
  for (const name of Object.keys(archive.files).toSorted()) {
    const entry = archive.file(name);
    if (!entry) continue;
    assert.equal(typeof entry.unixPermissions, 'number');
    const mode = entry.unixPermissions & 0o777;
    assert.equal(mode, 0o644, `${name} must be readable by Lambda`);
    const bytes = await entry.async('nodebuffer');
    archivedBytes.push(bytes);
    const path = join(extracted, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode });
    assert.equal((await stat(path)).mode & 0o777, 0o644);
  }
  const archiveText = Buffer.concat(archivedBytes).toString('utf8');
  for (const canary of canaries)
    assert.equal(archiveText.includes(canary), false);
  const artifact = await import(
    `${pathToFileURL(join(extracted, 'lambda.mjs')).href}?v=1`
  );
  const result = await artifact.handler({ version: '2.0' });
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'ANCHOR_INTERNAL_FAILURE',
  });
});
