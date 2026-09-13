import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import { buildManagedAnchorArtifact } from './build-observability-anchor.mjs';

test('builds a checkout-free Lambda and operator closure with its pinned AWS SDK', async () => {
  const output = await mkdtemp(join(tmpdir(), 'studio-anchor-bundle-'));
  const build = await buildManagedAnchorArtifact(join(output, 'build'));
  const repeated = await buildManagedAnchorArtifact(join(output, 'repeated'));
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
  for (const name of Object.keys(archive.files).toSorted()) {
    const entry = archive.file(name);
    if (!entry) continue;
    const path = join(extracted, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await entry.async('nodebuffer'));
  }
  const artifact = await import(
    `${pathToFileURL(join(extracted, 'lambda.mjs')).href}?v=1`
  );
  const result = await artifact.handler({ version: '2.0' });
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'ANCHOR_INTERNAL_FAILURE',
  });
});
