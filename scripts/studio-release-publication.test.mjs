import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { publishStudioDistribution } from './studio-release-publication.mjs';
import { installerFixture } from './test-support/studio-installer.mjs';
import { releasedDistribution } from './test-support/studio-release.mjs';

function fixture(t) {
  const release = releasedDistribution();
  const sboms = new Map();
  for (const [name, evidence] of Object.entries(release.value.evidence.sboms)) {
    const bytes = Buffer.from(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        metadata: {
          component: {
            'type': 'container',
            'bom-ref': evidence.subject,
            'hashes': [
              {
                alg: 'SHA-256',
                content: evidence.subject.split('@sha256:')[1],
              },
            ],
          },
        },
      }),
    );
    evidence.sha256 = sha256(bytes);
    sboms.set(`${name}.cdx.json`, bytes);
  }
  Object.assign(
    release,
    readRelease(Buffer.from(JSON.stringify(release.value))),
  );
  const f = installerFixture(t, false, release);
  const artifacts = new Map([
    ['release.json', f.contents.get('release.json')],
    ['release.sigstore.json', f.contents.get('release.sigstore.json')],
    ['installer.tar', f.build().bytes],
    ['installer.sigstore.json', Buffer.from('{}')],
    ...sboms,
  ]);
  const eligibility = {
    status: 'ready',
    source: release.current.source,
    artifact: release.value.artifact,
    versions: release.value.versions,
    components: Object.fromEntries(
      Object.entries(release.value.components).map(([name, source]) => [
        name,
        { source },
      ]),
    ),
  };
  const ancestry = {
    status: 'ready',
    source: eligibility.source,
    generation: release.value.generation,
    ancestors: release.value.ancestors,
  };
  const retained = new Map();
  const calls = [];
  let gateCount = 0;
  let interruptAt = 0;
  let corruptedReadback = false;
  let gateMutation;
  const adapter = {
    admission: async () => {
      calls.push('admission');
      gateCount++;
      const gate = structuredClone({
        eligibility,
        ancestry,
        minioSource: release.value.evidence.minioSource,
      });
      gateMutation?.(gate, gateCount);
      return gate;
    },
    reserve: async () => {
      calls.push('reserve');
    },
    prepare: async () => {
      calls.push('prepare');
      return artifacts;
    },
    verify: async () => {
      calls.push('verify');
    },
    qualify: async () => {
      calls.push('qualify');
    },
    ensureDraft: async () => {
      calls.push('draft');
    },
    readAsset: async (_tag, name) => {
      calls.push(`read:${name}`);
      const bytes = retained.get(name) ?? null;
      return corruptedReadback && bytes
        ? Buffer.concat([bytes, Buffer.from('corrupt')])
        : bytes;
    },
    uploadAsset: async (_tag, name, bytes) => {
      calls.push(`upload:${name}`);
      assert.equal(
        retained.has(name),
        false,
        'must never overwrite an existing asset',
      );
      if (interruptAt && retained.size === interruptAt)
        throw new Error('synthetic upload interruption');
      retained.set(name, Buffer.from(bytes));
    },
    publish: async () => {
      calls.push('publish');
    },
  };
  return {
    ...f,
    release,
    artifacts,
    retained,
    calls,
    adapter,
    run: () =>
      publishStudioDistribution({ source: eligibility.source }, adapter),
    mutateGate: (fn) => {
      gateMutation = fn;
    },
    interrupt: (at) => {
      interruptAt = at;
    },
    corruptReadback: () => {
      corruptedReadback = true;
    },
    rewriteManifest: (change) => {
      const value = structuredClone(release.value);
      change(value);
      const bytes = Buffer.from(JSON.stringify(value));
      artifacts.set('release.json', bytes);
      writeFileSync(join(f.directory, 'release.json'), bytes);
      artifacts.set('installer.tar', f.build().bytes);
    },
  };
}

test('gates build and publication, verifies all retained bytes, then publishes one combined source', async (t) => {
  const f = fixture(t);
  const result = await f.run();
  assert.deepEqual(f.calls.slice(0, 7), [
    'admission',
    'reserve',
    'prepare',
    'verify',
    'admission',
    'qualify',
    'admission',
  ]);
  assert.deepEqual(f.calls.slice(-2), ['admission', 'publish']);
  assert.equal(f.retained.size, 10);
  assert.equal(result.tag, `studio/${f.release.current.source}`);
  for (const [name, bytes] of f.artifacts)
    assert.ok(f.retained.get(name).equals(bytes));
  for (const name of f.artifacts.keys())
    assert.equal(f.calls.filter((value) => value === `read:${name}`).length, 2);
});

for (const field of ['eligibility', 'ancestry']) {
  for (const gateNumber of [1, 2, 3, 4]) {
    test(`refuses withdrawn ${field} at gate ${gateNumber}`, async (t) => {
      const f = fixture(t);
      f.mutateGate((gate, count) => {
        if (count === gateNumber) gate[field].status = 'deferred';
      });
      await assert.rejects(f.run(), /not admitted/);
      assert.ok(!f.calls.includes('publish'));
      if (gateNumber === 1) assert.deepEqual(f.calls, ['admission']);
    });
  }
}

test('resumes a partial current publication without replacing any signed artifact', async (t) => {
  const f = fixture(t);
  f.interrupt(3);
  await assert.rejects(f.run(), /synthetic upload interruption/);
  assert.equal(f.retained.size, 3);
  assert.ok(!f.calls.includes('publish'));
  const original = new Map(f.retained);
  f.interrupt(0);
  f.calls.length = 0;
  await f.run();
  assert.ok(f.calls.includes('publish'));
  for (const [name, bytes] of original) {
    assert.ok(f.retained.get(name).equals(bytes));
    assert.ok(!f.calls.includes(`upload:${name}`));
  }
});

test('refuses even a valid regenerated signature bundle on an exact-source retry', async (t) => {
  const f = fixture(t);
  f.interrupt(3);
  await assert.rejects(f.run(), /synthetic upload interruption/);
  f.retained.set(
    'release.sigstore.json',
    Buffer.from('{"signature":"another valid signature"}'),
  );
  f.interrupt(0);
  await assert.rejects(f.run(), /immutable release asset has different bytes/);
  assert.ok(!f.calls.includes('publish'));
});

test('a failed readback cannot expose a corrupt draft', async (t) => {
  const f = fixture(t);
  const upload = f.adapter.uploadAsset;
  f.adapter.uploadAsset = async (...args) => {
    await upload(...args);
    if (f.retained.size === f.artifacts.size) f.corruptReadback();
  };
  await assert.rejects(f.run(), /readback verification/);
  assert.ok(!f.calls.includes('publish'));
});

for (const operation of ['verify', 'qualify']) {
  test(`${operation} failure precedes release writes`, async (t) => {
    const f = fixture(t);
    f.adapter[operation] = async () => {
      throw new Error(`synthetic ${operation} refusal`);
    };
    await assert.rejects(f.run(), new RegExp(`synthetic ${operation} refusal`));
    assert.equal(f.retained.size, 0);
    assert.ok(!f.calls.includes('draft'));
    assert.ok(!f.calls.includes('publish'));
  });
}

for (const [label, mutate, message] of [
  [
    'artifact inputs',
    (value) => {
      value.artifact = 'a'.repeat(64);
    },
    /admitted source/,
  ],
  [
    'component inputs',
    (value) => {
      value.components.studio = 'a'.repeat(64);
    },
    /component source/,
  ],
  [
    'package version',
    (value) => {
      value.versions['@codaco/studio-server'] = '99.0.0';
    },
    /package versions/,
  ],
  [
    'generation',
    (value) => {
      value.generation++;
    },
    /admitted source/,
  ],
  [
    'SBOM identity',
    (value) => {
      value.evidence.sboms.studio.sha256 = 'a'.repeat(64);
    },
    /SBOM differs/,
  ],
  [
    'MinIO source material',
    (value) => {
      value.evidence.minioSource.commit = 'b'.repeat(40);
    },
    /MinIO source differs/,
  ],
]) {
  test(`refuses changed ${label} even when the archive is internally consistent`, async (t) => {
    const f = fixture(t);
    f.rewriteManifest(mutate);
    await assert.rejects(f.run(), message);
    assert.ok(!f.calls.includes('verify'));
    assert.ok(!f.calls.includes('draft'));
  });
}

test('rejects a substituted archive and a missing asset before authentication or draft writes', async (t) => {
  const f = fixture(t);
  const archive = f.artifacts.get('installer.tar');
  f.artifacts.set('installer.tar', Buffer.from('substituted'));
  await assert.rejects(f.run(), /archive/);
  f.artifacts.set('installer.tar', archive);
  f.artifacts.delete('registry.cdx.json');
  await assert.rejects(f.run(), /inventory/);
  assert.ok(!f.calls.includes('verify'));
  assert.ok(!f.calls.includes('draft'));
});
