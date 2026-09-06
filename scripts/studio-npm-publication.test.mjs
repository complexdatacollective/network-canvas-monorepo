import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { npmPublication } from './studio-npm-publication.mjs';

const NAME = '@codaco/release-fixture';
const VERSION = '1.0.0';
const REPOSITORY =
  'https://github.com/complexdatacollective/network-canvas-monorepo';
const WORKFLOW = '.github/workflows/ci-and-release.yml';
const PREDICATE = 'https://slsa.dev/provenance/v1';
const SOURCE = 'a'.repeat(40);
const TARBALL = Buffer.from('Synthetic available npm package bytes.');

function fixture() {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: PREDICATE,
    subject: [
      {
        name: `pkg:npm/%40codaco/release-fixture@${VERSION}`,
        digest: { sha512: createHash('sha512').update(TARBALL).digest('hex') },
      },
    ],
    predicate: {
      buildDefinition: {
        buildType:
          'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: {
            repository: REPOSITORY,
            path: WORKFLOW,
            ref: 'refs/heads/main',
          },
        },
        resolvedDependencies: [
          {
            uri: `git+${REPOSITORY}@refs/heads/main`,
            digest: { gitCommit: SOURCE },
          },
        ],
      },
    },
  };
  const metadata = {
    name: NAME,
    version: VERSION,
    dist: {
      integrity: `sha512-${createHash('sha512').update(TARBALL).digest('base64')}`,
      tarball: 'https://registry.npmjs.org/release-fixture.tgz',
      attestations: {
        url: 'https://registry.npmjs.org/release-fixture-attestations',
      },
    },
  };
  let packageBytes = TARBALL;
  let rejectedSignature = false;
  let provenanceCount = 1;
  let verified = 0;
  const requests = [];
  async function fetcher(url, options) {
    requests.push(url);
    assert.equal(
      options.redirect,
      'error',
      'Registry fetches must reject cross-origin redirects',
    );
    if (url === metadata.dist.tarball) return new Response(packageBytes);
    if (url === metadata.dist.attestations.url)
      return Response.json({
        attestations: Array.from({ length: provenanceCount }, () => ({
          predicateType: PREDICATE,
          bundle: {
            dsseEnvelope: {
              payloadType: 'application/vnd.in-toto+json',
              payload: Buffer.from(JSON.stringify(statement)).toString(
                'base64',
              ),
            },
          },
        })),
      });
    return Response.json(metadata);
  }
  async function verifyBundle(_bundle, options) {
    verified++;
    // This is the library boundary, not a replacement crypto implementation.
    // Actual npm bundles are verified in release eligibility and the recorded
    // live qualification. Test that our caller supplies every trust constraint.
    assert.equal(
      options.certificateIssuer,
      'https://token.actions.githubusercontent.com',
    );
    assert.equal(options.ctLogThreshold, 1);
    assert.equal(options.tlogThreshold, 1);
    const pattern = new RegExp(options.certificateIdentityURI);
    assert.equal(
      pattern.test(`${REPOSITORY}/${WORKFLOW}@refs/heads/main`),
      true,
    );
    for (const identity of [
      `${REPOSITORY}/${WORKFLOW}@refs/heads/main/other`,
      `${REPOSITORY}/${WORKFLOW}@refs/heads/fork`,
      `https://githubXcom/complexdatacollective/network-canvas-monorepo/${WORKFLOW}@refs/heads/main`,
      `https://github.com/attacker/network-canvas-monorepo/${WORKFLOW}@refs/heads/main`,
    ])
      assert.equal(pattern.test(identity), false);
    if (rejectedSignature)
      throw new Error('Signature or trust identity verification failed');
  }
  return {
    metadata,
    statement,
    requests,
    run: () => npmPublication(NAME, VERSION, fetcher, verifyBundle),
    verified: () => verified,
    corruptBytes: () => {
      packageBytes = Buffer.from('corrupted bytes');
    },
    rejectSignature: () => {
      rejectedSignature = true;
    },
    setCount: (count) => {
      provenanceCount = count;
    },
  };
}

test('pnpm publication without gitHead binds verified SLSA source to available authenticated bytes', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.source, SOURCE);
  assert.equal(result.integrity, f.metadata.dist.integrity);
  assert.match(result.provenance, /^[a-f0-9]{64}$/);
  assert.equal(f.verified(), 1);
  assert.equal(f.requests.length, 3);
});

test('a rejected signature or signer identity is never replaced by decoded payload claims', async () => {
  const f = fixture();
  f.rejectSignature();
  await assert.rejects(
    f.run(),
    /Signature or trust identity verification failed/,
  );
  assert.equal(f.verified(), 1);
  assert.equal(
    f.requests.length,
    2,
    'No package is accepted after a verification failure',
  );
});

test('available corrupted or mismapped package bytes fail the authenticated digest', async () => {
  const f = fixture();
  f.corruptBytes();
  await assert.rejects(f.run(), /Available dependency bytes do not match/);
  assert.equal(f.verified(), 1);
});

for (const count of [0, 2])
  test(`${count} provenance bundles cannot ambiguously authorize one package`, async () => {
    const f = fixture();
    f.setCount(count);
    await assert.rejects(f.run(), /requires one SLSA/);
    assert.equal(f.verified(), 0);
  });

for (const [label, alter] of [
  [
    'wrong package',
    (f) => {
      f.metadata.name = '@codaco/another-package';
    },
  ],
  [
    'wrong version',
    (f) => {
      f.metadata.version = '2.0.0';
    },
  ],
  [
    'missing integrity',
    (f) => {
      delete f.metadata.dist.integrity;
    },
  ],
  [
    'foreign attestation origin',
    (f) => {
      f.metadata.dist.attestations.url = 'https://attacker.invalid/provenance';
    },
  ],
  [
    'foreign tarball origin',
    (f) => {
      f.metadata.dist.tarball = 'https://attacker.invalid/package.tgz';
    },
  ],
  [
    'credential-bearing tarball URL',
    (f) => {
      f.metadata.dist.tarball =
        'https://user:secret@registry.npmjs.org/package.tgz';
    },
  ],
  [
    'different statement subject',
    (f) => {
      f.statement.subject[0].name = 'pkg:npm/other@1.0.0';
    },
  ],
  [
    'wrong subject digest',
    (f) => {
      f.statement.subject[0].digest.sha512 = '0'.repeat(128);
    },
  ],
  [
    'different source repository',
    (f) => {
      f.statement.predicate.buildDefinition.externalParameters.workflow.repository =
        'https://github.com/attacker/repo';
    },
  ],
  [
    'different workflow',
    (f) => {
      f.statement.predicate.buildDefinition.externalParameters.workflow.path =
        '.github/workflows/untrusted.yml';
    },
  ],
  [
    'pull-request publisher',
    (f) => {
      f.statement.predicate.buildDefinition.externalParameters.workflow.ref =
        'refs/pull/1/head';
    },
  ],
  [
    'missing source',
    (f) => {
      f.statement.predicate.buildDefinition.resolvedDependencies = [];
    },
  ],
  [
    'ambiguous source',
    (f) => {
      f.statement.predicate.buildDefinition.resolvedDependencies.push(
        f.statement.predicate.buildDefinition.resolvedDependencies[0],
      );
    },
  ],
  [
    'abbreviated source SHA',
    (f) => {
      f.statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
        'aaaaaaa';
    },
  ],
])
  test(`${String(label)} defers the dependency publication`, async () => {
    const f = fixture();
    alter(f);
    await assert.rejects(f.run());
  });

test('unavailable metadata is an explicit publication failure', async () => {
  await assert.rejects(
    npmPublication(
      NAME,
      VERSION,
      async () => new Response('', { status: 404 }),
    ),
    /unavailable/,
  );
});
