import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IMAGE_REPOSITORIES,
  readRelease,
} from '../apps/studio/deployment/installer/release.mjs';
import { canonicalize } from '../packages/studio-sync/src/apply.ts';
import { readMigrations } from '../packages/studio-sync/src/postgres-migration-artifacts.ts';
import { validateCycloneDx } from './studio-image-evidence.mjs';

const schemaRoots = {
  studio: 'apps/studio/server/migrations/',
  registry: 'apps/template-registry/migrations/',
};
const migrationFiles = new Set([
  'manifest.json',
  'snapshot.json',
  'migration.sql',
  'sidecars.sql',
]);

/** Read committed blobs through the release candidate, then reuse the same
 * checksum/chain validator as the database migration command. No schema code or
 * local working-tree artifacts execute while assembling release metadata. */
async function committedSchema(candidate, prefix) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-release-schema-'));
  try {
    for (const file of candidate.files.filter(({ path }) =>
      path.startsWith(prefix),
    )) {
      const parts = file.path.slice(prefix.length).split('/');
      if (
        parts.length !== 2 ||
        !/^\d{4}_[a-z][a-z0-9_]*$/.test(parts[0]) ||
        !migrationFiles.has(parts[1]) ||
        file.mode !== '100644'
      )
        throw new Error('Unexpected committed migration artifact.');
      const target = join(directory, parts[0]);
      const bytes = Buffer.from(candidate.read(file.path));
      const oid = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      if (oid !== file.oid)
        throw new Error(
          'Migration content does not match its committed Git blob.',
        );
      mkdirSync(target, { recursive: true, mode: 0o700 });
      writeFileSync(join(target, parts[1]), bytes, {
        flag: 'wx',
        mode: 0o600,
      });
    }
    const migrations = await readMigrations(directory);
    return {
      fingerprint: migrations.at(-1).manifest.fingerprint,
      migrations: migrations.map(({ manifest, checksum }) => ({
        id: manifest.id,
        checksum,
      })),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Assemble the bytes that will be signed. The publisher owns fresh admission,
 * image/signature verification and actual upgrade qualification; callers pass
 * only independently authenticated prior release identities to upgradeFrom. */
export async function buildStudioReleaseManifest({
  candidate,
  gate,
  images,
  sboms,
  upgradeFrom = [],
}) {
  const { eligibility, ancestry, minioSource } = gate;
  if (
    eligibility.status !== 'ready' ||
    ancestry.status !== 'ready' ||
    eligibility.source !== candidate.commit ||
    ancestry.source !== candidate.commit
  )
    throw new Error('Release manifest requires its admitted source.');
  const names = Object.keys(IMAGE_REPOSITORIES);
  if (
    !(sboms instanceof Map) ||
    sboms.size !== names.length ||
    names.some((name) => !sboms.has(name))
  )
    throw new Error('Release manifest requires every image SBOM.');
  const schemas = {};
  for (const [name, prefix] of Object.entries(schemaRoots))
    schemas[name] = await committedSchema(candidate, prefix);
  const release = {
    format: 1,
    source: candidate.commit,
    artifact: eligibility.artifact,
    generation: ancestry.generation,
    ancestors: ancestry.ancestors.toSorted(),
    versions: Object.fromEntries(
      Object.entries(eligibility.versions).toSorted(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    ),
    components: Object.fromEntries(
      ['client', 'server', 'studio', 'registry'].map((name) => [
        name,
        eligibility.components[name].source,
      ]),
    ),
    images,
    evidence: {
      sboms: Object.fromEntries(
        names.map((name) => [
          name,
          validateCycloneDx({
            image: images[name].reference,
            bytes: sboms.get(name),
          }),
        ]),
      ),
      minioSource,
    },
    schemas,
    postgresMajor: 18,
    upgrade: {
      strategy: 'offline',
      from: upgradeFrom.toSorted(
        (a, b) =>
          a.generation - b.generation ||
          (a.source < b.source ? -1 : a.source > b.source ? 1 : 0),
      ),
    },
  };
  const bytes = Buffer.from(`${canonicalize(release)}\n`);
  return { bytes, ...readRelease(bytes) };
}
