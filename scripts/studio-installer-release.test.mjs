import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptRelease,
  IMAGE_REPOSITORIES,
  activateRelease,
  readRelease,
  readState,
  RELEASE_IDENTITY,
  RELEASE_ISSUER,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { releasedDistribution as fixture } from './test-support/studio-release.mjs';

const stateOf = (f) =>
  activateRelease(
    acceptRelease(f, null, { expectedDigest: f.current.digest }),
    f.current,
  );

test('first install requires the independently selected manifest digest even when an older signed release is structurally valid', () => {
  const old = fixture();
  const latest = fixture(2, [old]);
  for (const expectedDigest of [
    undefined,
    '',
    old.current.digest.slice(1),
    latest.current.digest,
  ])
    assert.throws(
      () => acceptRelease(old, null, { expectedDigest }),
      /independently obtained manifest digest/,
    );
  assert.deepEqual(
    acceptRelease(latest, null, { expectedDigest: latest.current.digest }),
    {
      format: 1,
      highest: latest.current,
      active: null,
    },
  );
});

test('a failed new update retains its accepted high-water mark while the old active release remains recorded', () => {
  const old = fixture();
  const latest = fixture(2, [old]);
  const accepted = acceptRelease(latest, stateOf(old), {
    expectedDigest: latest.current.digest,
  });
  const persisted = readState(Buffer.from(JSON.stringify(accepted)));
  assert.deepEqual(persisted.highest, latest.current);
  assert.deepEqual(persisted.active, old.current);
  assert.throws(
    () => acceptRelease(old, persisted, { expectedDigest: old.current.digest }),
    /replay/,
  );
  assert.deepEqual(
    acceptRelease(latest, persisted, { expectedDigest: latest.current.digest }),
    accepted,
  );
  assert.deepEqual(
    activateRelease(accepted, latest.current).active,
    latest.current,
  );
});

test('explicit historical recovery preserves the highest accepted release across another restart', () => {
  const old = fixture();
  const latest = fixture(2, [old]);
  const accepted = acceptRelease(old, stateOf(latest), {
    expectedDigest: old.current.digest,
    recovery: true,
  });
  assert.throws(() => activateRelease(accepted, old.current), /unaccepted/);
  const recovered = readState(
    Buffer.from(
      JSON.stringify(
        activateRelease(accepted, old.current, { recovery: true }),
      ),
    ),
  );
  assert.deepEqual(recovered.highest, latest.current);
  assert.deepEqual(recovered.active, old.current);
  assert.throws(
    () => acceptRelease(old, recovered, { expectedDigest: old.current.digest }),
    /replay/,
  );
});

test('refuses unrelated ancestry, same-source replacement and unqualified skipped upgrade hops', () => {
  const old = fixture();
  const next = fixture(2, [old]);
  assert.throws(
    () =>
      acceptRelease(fixture(3), stateOf(next), {
        expectedDigest: fixture(3).current.digest,
      }),
    /unrelated ancestry/,
  );
  const changed = fixture(2, [old]);
  changed.value.artifact = 'f'.repeat(64);
  const replacement = readRelease(Buffer.from(JSON.stringify(changed.value)));
  assert.throws(
    () =>
      acceptRelease(replacement, stateOf(next), {
        expectedDigest: replacement.current.digest,
      }),
    /different release bytes/,
  );
  const skipped = fixture(3, [old, next]);
  skipped.value.upgrade.from = [next.current];
  const target = readRelease(Buffer.from(JSON.stringify(skipped.value)));
  assert.throws(
    () =>
      acceptRelease(target, stateOf(old), {
        expectedDigest: target.current.digest,
      }),
    /qualified intermediate/,
  );
  const afterHop = acceptRelease(target, stateOf(next), {
    expectedDigest: target.current.digest,
  });
  assert.deepEqual(afterHop.highest, target.current);
});

for (const [name, mutate] of [
  [
    'unsigned dependency exception',
    (v) => {
      v.images.postgres.reference = `postgres@sha256:${'1'.repeat(64)}`;
    },
  ],
  [
    'mutable image',
    (v) => {
      v.images.studio.reference = `${IMAGE_REPOSITORIES.studio}:latest`;
    },
  ],
  [
    'missing component version',
    (v) => {
      delete v.versions['@codaco/studio-sync'];
    },
  ],
  [
    'missing registry image',
    (v) => {
      delete v.images.registry;
    },
  ],
  [
    'downloaded signer override',
    (v) => {
      v.signer = 'attacker';
    },
  ],
  [
    'unqualified PostgreSQL major',
    (v) => {
      v.postgresMajor = 19;
    },
  ],
  [
    'live migration strategy',
    (v) => {
      v.upgrade.strategy = 'announced-window';
    },
  ],
  [
    'unknown installer format',
    (v) => {
      v.format = 2;
    },
  ],
  [
    'unbound retained image bytes',
    (v) => {
      v.images.studio.configurations = {};
    },
  ],
  [
    'empty migration history',
    (v) => {
      v.schemas.studio.migrations = [];
    },
  ],
  [
    'non-contiguous migrations',
    (v) => {
      v.schemas.studio.migrations[0].id = '0002_skip';
    },
  ],
  [
    'self ancestry',
    (v) => {
      v.ancestors.push(v.source);
    },
  ],
])
  test(`refuses ${String(name)}`, () => {
    const { value } = fixture();
    mutate(value);
    assert.throws(() => readRelease(Buffer.from(JSON.stringify(value))));
  });

test('refuses corrupt high-water state and cannot activate a higher unaccepted release', () => {
  const old = fixture();
  const next = fixture(2, [old]);
  assert.throws(() => readState(Buffer.from('{')));
  assert.throws(() =>
    readState(
      Buffer.from(JSON.stringify({ ...stateOf(old), active: next.current })),
    ),
  );
  assert.throws(() => activateRelease(stateOf(old), next.current));
});

test('real verification commands pin the workflow and issuer for blobs and all images', () => {
  const manifest = signatureArguments(
    'blob',
    '/bundle/release.json',
    '/bundle/release.sigstore.json',
  );
  assert.deepEqual(manifest, [
    'verify-blob',
    '/bundle/release.json',
    '--bundle',
    '/bundle/release.sigstore.json',
    '--certificate-identity',
    RELEASE_IDENTITY,
    '--certificate-oidc-issuer',
    RELEASE_ISSUER,
  ]);
  const { release } = fixture();
  assert.equal(Object.keys(release.images).length, 6);
  for (const { reference } of Object.values(release.images))
    assert.deepEqual(signatureArguments('image', reference), [
      'verify',
      reference,
      '--certificate-identity',
      RELEASE_IDENTITY,
      '--certificate-oidc-issuer',
      RELEASE_ISSUER,
    ]);
  assert.throws(() => signatureArguments('unknown', 'target'));
});
