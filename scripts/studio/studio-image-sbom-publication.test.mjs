import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { test } from 'vitest';

import {
  RELEASE_IDENTITY,
  RELEASE_ISSUER,
} from '../../apps/studio/deployment/installer/release.mjs';
import {
  releasedDistribution,
  studioSbom,
} from '../test-support/studio-release.mjs';
import { publishStudioImageSboms } from './studio-image-sbom-publication.mjs';

function fixture() {
  const release = releasedDistribution().value;
  const sboms = new Map(
    Object.entries(release.images).map(([name, image]) => [
      name,
      studioSbom(image),
    ]),
  );
  return { images: release.images, sboms };
}

test('attaches each complete platform SBOM to its immutable image and verifies exact registry readback', async () => {
  const f = fixture();
  const calls = [];
  const verified = new Set();
  const run = (program, args, options) => {
    assert.equal(program, '/pinned/cosign');
    assert.equal(statSync(options.cwd).mode & 0o777, 0o700);
    calls.push(args);
    const reference = args.find((argument) => argument.includes('@sha256:'));
    if (args[0] === 'verify-attestation' && !verified.has(reference))
      throw new Error('no matching attestation');
    if (args[0] === 'attest') {
      const predicate = args[args.indexOf('--predicate') + 1];
      const name = Object.keys(f.images).find(
        (candidate) => f.images[candidate].reference === reference,
      );
      assert.equal(statSync(predicate).mode & 0o777, 0o600);
      assert.deepEqual(readFileSync(predicate), f.sboms.get(name));
      verified.add(reference);
    }
    if (args[0] === 'verify-attestation') {
      const policy = JSON.parse(
        readFileSync(args[args.indexOf('--policy') + 1], 'utf8'),
      );
      assert.equal(policy.predicateType, 'https://cyclonedx.org/bom');
      assert.ok(args.includes(RELEASE_IDENTITY));
      assert.ok(args.includes(RELEASE_ISSUER));
      assert.deepEqual(
        policy.predicate,
        JSON.parse(
          f.sboms.get(
            Object.keys(f.images).find(
              (name) => f.images[name].reference === reference,
            ),
          ),
        ),
      );
    }
    return '';
  };
  await publishStudioImageSboms(f, {
    cosign: '/pinned/cosign',
    run,
    timeoutMs: 2_000,
  });
  assert.equal(calls.filter(([operation]) => operation === 'attest').length, 6);
  assert.equal(
    calls.filter(([operation]) => operation === 'verify-attestation').length,
    12,
  );
  for (const args of calls.filter(([operation]) => operation === 'attest')) {
    assert.equal(args.at(-1).includes('@sha256:'), true);
    assert.equal(args.includes('--type'), true);
    assert.equal(args.includes('cyclonedx'), true);
  }
});

test('reuses exact authenticated attestations without another registry write', async () => {
  const f = fixture();
  const calls = [];
  await publishStudioImageSboms(f, {
    cosign: '/pinned/cosign',
    run: (_program, args) => {
      calls.push(args);
      return '';
    },
  });
  assert.equal(calls.length, 6);
  assert.ok(calls.every(([operation]) => operation === 'verify-attestation'));
});

test('rejects substituted SBOM bytes before invoking Cosign', async () => {
  const f = fixture();
  f.sboms.set('studio', Buffer.from('{}'));
  let calls = 0;
  await assert.rejects(
    publishStudioImageSboms(f, {
      run: () => {
        calls += 1;
      },
    }),
    /CycloneDX/,
  );
  assert.equal(calls, 0);
});
