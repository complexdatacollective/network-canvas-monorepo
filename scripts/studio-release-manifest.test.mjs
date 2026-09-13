import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  jsonHash,
  sha256,
} from '../packages/studio-sync/src/postgres-migration-artifacts.ts';
import { buildStudioReleaseManifest } from './studio-release-manifest.mjs';
import { readStudioCandidate } from './studio-release-policy.mjs';
import {
  releasedDistribution,
  studioSbom,
} from './test-support/studio-release.mjs';

function blobOid(text) {
  const bytes = Buffer.from(text);
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function fixture() {
  const previous = releasedDistribution();
  const next = releasedDistribution(2, [previous]);
  const blobs = new Map();
  const expected = {};
  for (const [name, prefix] of [
    ['studio', 'apps/studio/server/migrations/'],
    ['registry', 'apps/template-registry/migrations/'],
  ]) {
    const ids = ['0001_initial', '0002_upgrade'];
    const migrations = [];
    for (const [index, id] of ids.entries()) {
      const sql = `-- ${name} ${id}\nSELECT ${index};\n`;
      const sidecars = `-- ${name} sidecars ${id}\n`;
      const snapshot = { dialect: 'postgresql', version: '8', id, tables: {} };
      const manifest = {
        format: 1,
        id,
        previous: ids[index - 1] ?? null,
        fingerprint: sha256(`${name}-${id}`),
        snapshotHash: jsonHash(snapshot),
        sqlHash: sha256(sql),
        sidecarsHash: sha256(sidecars),
      };
      for (const [filename, text] of Object.entries({
        'manifest.json': JSON.stringify(manifest),
        'snapshot.json': JSON.stringify(snapshot),
        'migration.sql': sql,
        'sidecars.sql': sidecars,
      }))
        blobs.set(`${prefix}${id}/${filename}`, text);
      migrations.push({ id, checksum: jsonHash(manifest) });
    }
    expected[name] = {
      fingerprint: sha256(`${name}-${ids.at(-1)}`),
      migrations,
    };
  }
  const sboms = new Map(
    Object.entries(next.value.images).map(([name, image]) => [
      name,
      studioSbom(image),
    ]),
  );
  const input = {
    candidate: {
      commit: next.current.source,
      get files() {
        return [...blobs].map(([path, text]) => ({
          path,
          mode: '100644',
          oid: blobOid(text),
        }));
      },
      read(path) {
        assert.ok(blobs.has(path), `missing source: ${path}`);
        return blobs.get(path);
      },
    },
    gate: {
      eligibility: {
        status: 'ready',
        source: next.current.source,
        artifact: next.value.artifact,
        versions: next.value.versions,
        components: Object.fromEntries(
          Object.entries(next.value.components).map(([name, source]) => [
            name,
            { source },
          ]),
        ),
      },
      ancestry: {
        status: 'ready',
        source: next.current.source,
        generation: 2,
        ancestors: [previous.current.source],
      },
      minioSource: next.value.evidence.minioSource,
    },
    images: next.value.images,
    sboms,
    upgradeFrom: [previous.current],
  };
  return { input, blobs, expected, previous };
}

test('assembles both validated migration chains, six exact SBOMs and admitted identities', async () => {
  const { input, expected, previous } = fixture();
  const built = await buildStudioReleaseManifest(input);
  assert.deepEqual(built.release.schemas, expected);
  assert.deepEqual(built.release.upgrade.from, [previous.current]);
  assert.deepEqual(
    built.release.components,
    Object.fromEntries(
      Object.entries(input.gate.eligibility.components).map(([name, value]) => [
        name,
        value.source,
      ]),
    ),
  );
  assert.equal(built.release.source, input.candidate.commit);
  assert.equal(built.release.artifact, input.gate.eligibility.artifact);
  for (const [name, bytes] of input.sboms) {
    assert.equal(built.release.evidence.sboms[name].sha256, sha256(bytes));
    assert.equal(
      built.release.evidence.sboms[name].subject,
      input.images[name].reference,
    );
  }
  assert.equal(built.current.digest, sha256(built.bytes));
  assert.ok(
    (await buildStudioReleaseManifest(input)).bytes.equals(built.bytes),
  );
});

for (const field of ['eligibility', 'ancestry']) {
  test(`refuses withdrawn or different-source ${field} before reading artifacts`, async () => {
    const { input } = fixture();
    input.candidate.read = () => {
      throw new Error('should not read artifacts');
    };
    input.gate[field].status = 'deferred';
    await assert.rejects(
      buildStudioReleaseManifest(input),
      /requires its admitted source/,
    );
    input.gate[field].status = 'ready';
    input.gate[field].source = '0'.repeat(40);
    await assert.rejects(
      buildStudioReleaseManifest(input),
      /requires its admitted source/,
    );
  });
}

for (const filename of ['migration.sql', 'sidecars.sql', 'snapshot.json']) {
  test(`refuses substituted ${filename} in either committed chain`, async () => {
    for (const prefix of ['apps/studio/server', 'apps/template-registry']) {
      const { input, blobs } = fixture();
      const path = `${prefix}/migrations/0001_initial/${filename}`;
      blobs.set(
        path,
        filename.endsWith('.json') ? '{"changed":true}' : 'SELECT 9;',
      );
      await assert.rejects(
        buildStudioReleaseManifest(input),
        /artifact checksum mismatch/,
      );
    }
  });
}

test('refuses missing predecessors and unexpected executable artifacts', async () => {
  const { input, blobs } = fixture();
  for (const path of [...blobs.keys()].filter((p) =>
    p.startsWith('apps/template-registry/migrations/0001_'),
  ))
    blobs.delete(path);
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /not a contiguous chain/,
  );
  const other = fixture();
  other.blobs.set(
    'apps/studio/server/migrations/0001_initial/extra.sql',
    'SELECT 1;',
  );
  await assert.rejects(
    buildStudioReleaseManifest(other.input),
    /Unexpected committed migration artifact/,
  );
});

test('refuses missing, extra and wrongly bound image SBOMs', async () => {
  const { input } = fixture();
  input.sboms.delete('registry');
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /requires every image SBOM/,
  );
  input.sboms.set('extra', input.sboms.get('studio'));
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /requires every image SBOM/,
  );
  input.sboms.delete('extra');
  input.sboms.set('registry', input.sboms.get('studio'));
  await assert.rejects(buildStudioReleaseManifest(input), /does not bind/);
});

test('refuses an unsupported prior release outside admitted ancestry', async () => {
  const { input } = fixture();
  input.upgradeFrom[0].source = '0'.repeat(40);
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /must precede this release/,
  );
});

test('reads the actual committed Studio and Registry migration catalogs', async () => {
  const { input } = fixture();
  const root = new URL('../', import.meta.url).pathname;
  input.candidate = readStudioCandidate(root, 'HEAD');
  input.gate.eligibility.source = input.candidate.commit;
  input.gate.ancestry.source = input.candidate.commit;
  const built = await buildStudioReleaseManifest(input);
  for (const [name, prefix] of [
    ['studio', 'apps/studio/server'],
    ['registry', 'apps/template-registry'],
  ]) {
    const manifests = input.candidate.files
      .filter(
        ({ path }) =>
          path.startsWith(`${prefix}/migrations/`) &&
          path.endsWith('/manifest.json'),
      )
      .map(({ path }) => path)
      .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    assert.ok(manifests.length > 0);
    assert.equal(
      built.release.schemas[name].migrations.length,
      manifests.length,
    );
    for (const [index, path] of manifests.entries()) {
      const raw = execFileSync(
        'git',
        ['show', `${input.candidate.commit}:${path}`],
        { cwd: root, encoding: 'utf8' },
      );
      assert.equal(
        built.release.schemas[name].migrations[index].checksum,
        jsonHash(JSON.parse(raw)),
      );
    }
  }
});

test('retains exact bytes when equivalent inputs arrive in a different order', async () => {
  const { input, previous } = fixture();
  const second = releasedDistribution(2, [previous]);
  input.candidate.commit = '3'.padStart(40, '0');
  input.gate.eligibility.source = input.candidate.commit;
  input.gate.ancestry = {
    status: 'ready',
    source: input.candidate.commit,
    generation: 3,
    ancestors: [previous.current.source, second.current.source],
  };
  input.upgradeFrom.push(second.current);
  const first = await buildStudioReleaseManifest(input);
  input.images = Object.fromEntries(
    Object.entries(input.images)
      .reverse()
      .map(([name, image]) => [
        name,
        {
          configurations: Object.fromEntries(
            Object.entries(image.configurations).reverse(),
          ),
          reference: image.reference,
        },
      ]),
  );
  input.gate.minioSource = Object.fromEntries(
    Object.entries(input.gate.minioSource).reverse(),
  );
  input.upgradeFrom = input.upgradeFrom
    .toReversed()
    .map((identity) => Object.fromEntries(Object.entries(identity).reverse()));
  assert.ok(
    (await buildStudioReleaseManifest(input)).bytes.equals(first.bytes),
  );
});

test('refuses a forged blob reader even when all substituted migration hashes agree', async () => {
  const { input, blobs } = fixture();
  const sqlPath = 'apps/studio/server/migrations/0001_initial/migration.sql';
  const manifestPath = sqlPath.replace('migration.sql', 'manifest.json');
  const changedSql = 'SELECT 1234;\n';
  const changedManifest = {
    ...JSON.parse(blobs.get(manifestPath)),
    sqlHash: sha256(changedSql),
  };
  const read = input.candidate.read;
  input.candidate.read = (path) =>
    path === sqlPath
      ? changedSql
      : path === manifestPath
        ? JSON.stringify(changedManifest)
        : read(path);
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /does not match its committed Git blob/,
  );
});

test('refuses conflicting prior identities for the same source commit', async () => {
  const { input } = fixture();
  input.upgradeFrom.push({ ...input.upgradeFrom[0], digest: 'a'.repeat(64) });
  await assert.rejects(
    buildStudioReleaseManifest(input),
    /Invalid release inventory/,
  );
});
