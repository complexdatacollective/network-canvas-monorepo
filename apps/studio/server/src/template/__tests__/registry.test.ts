import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import { manifestHash } from '@codaco/studio-sync/apply';
import {
  createTemplateArtifact,
  readTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  type TemplateArtifactInput,
} from '@codaco/studio-sync/template-exchange';
import { TemplateRegistryClient } from '@codaco/studio-sync/template-registry-client';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { AssetStore } from '../../assets.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { importRegistryTemplate, publishTemplateVersion } from '../registry.ts';

const db = await reachableDb();
const ORIGIN = 'https://registry.example';
const PUBLISHER_ID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL = `ncr1_${'a'.repeat(43)}`;
const png = Uint8Array.from(
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55' +
      '0000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex',
  ),
);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function importFixture(): TemplateArtifactInput {
  const input = fixture();
  return {
    ...input,
    sections: {
      ...input.sections,
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'image', type: 'asset', content: 'illustration' }],
      },
      'assets': {
        illustration: {
          type: 'image',
          name: 'Illustration',
          source: 'illustration.png',
        },
      },
    },
    assets: [
      {
        source: 'illustration.png',
        media_class: 'image',
        media_type: 'image/png',
        bytes: png,
      },
    ],
  };
}

function fixture(): TemplateArtifactInput {
  return {
    template: { name: 'Portable template', kind: 'protocol', version: 1 },
    metadata: { schema_version: 1, authors: [{ name: 'Researcher' }] },
    license: 'CC-BY-4.0',
    sections: {
      'settings': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: 'Portable template',
      },
      'stageOrder': { stages: ['welcome'] },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [],
      },
      'assets': {},
    },
    assets: [],
  };
}

const assetStore: AssetStore = {
  checkHealth: async () => undefined,
  put: async () => {
    throw new Error('unexpected asset write');
  },
  get: async () => null,
};

function principal(userId: string): SessionPrincipal {
  return {
    kind: 'user',
    userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    name: 'Registry Admin',
    locale: null,
    sessionId: `${userId}-session`,
  };
}

async function waitUntilBlocked(pool: pg.Pool, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocked = await pool.query<{ blocked: boolean }>(
      'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
      [pid],
    );
    if (blocked.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('role update did not block on the publication lock');
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input);
}

function registryClient(options: {
  handoffStarted?: () => void;
  releaseHandoff?: Promise<void>;
  publishedRoots?: string[];
}) {
  const entryId = randomUUID();
  return new TemplateRegistryClient({
    origin: ORIGIN,
    fetch: async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === '/publisher') {
        return Response.json({
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        });
      }
      if (url.pathname !== '/api/v1/entries' || init?.method !== 'POST')
        throw new Error('unexpected Registry request');
      const request = new Request(input, init);
      const form = await request.formData();
      const file = form.get('artifact');
      if (!(file instanceof File)) throw new Error('artifact missing');
      const verified = await readTemplateArtifact(
        new Uint8Array(await file.arrayBuffer()),
      );
      options.publishedRoots?.push(verified.manifest.merkle_root);
      options.handoffStarted?.();
      await options.releaseHandoff;
      const root = verified.manifest.merkle_root;
      return Response.json(
        {
          id: entryId,
          publisher: {
            id: PUBLISHER_ID,
            name: 'Original Publisher',
            orcid: null,
          },
          root,
          template: verified.manifest.template,
          license: verified.license,
          curated: false,
          yanked: false,
          published_at: '2026-09-08T00:00:00.000Z',
          metadata: verified.metadata,
          artifact_url: `${ORIGIN}/api/v1/artifacts/${root}`,
          report_url: `${ORIGIN}/api/v1/entries/${entryId}/reports`,
        },
        { status: 201 },
      );
    },
  });
}

describe.skipIf(!db)('Studio Registry publication command', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
  });

  afterAll(async () => await dispose());

  async function seedPublication(teamId: string) {
    const userId = `${teamId}-admin`;
    const templateId = randomUUID();
    const versionId = randomUUID();
    const input = fixture();
    const built = await createTemplateArtifact(input);
    const manifest = Object.fromEntries(
      built.artifact.manifest.sections.map(({ id, hash }) => [id, hash]),
    );
    await seedTeam(pool, teamId);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
      [userId, 'Registry Admin', `${userId}@example.com`],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'admin')`,
      [randomUUID(), teamId, userId],
    );
    await pool.query(
      `INSERT INTO template_registry_accounts
        (user_id, registry_url, publisher_id, publisher_name)
       VALUES ($1, $2, $3, 'Original Publisher')`,
      [userId, ORIGIN, PUBLISHER_ID],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO templates
          (id, team_id, kind, name, license, state, metadata, author_user_id)
         VALUES ($1, $2, 'protocol', $3, 'CC-BY-4.0', 'published', $4, $5)`,
        [templateId, teamId, input.template.name, input.metadata, userId],
      );
      await client.query(
        `INSERT INTO template_versions
          (id, team_id, template_id, version_number, manifest, manifest_hash, schema_version)
         VALUES ($1, $2, $3, 1, $4, $5, $6)`,
        [
          versionId,
          teamId,
          templateId,
          manifest,
          manifestHash(manifest, null),
          CURRENT_SCHEMA_VERSION,
        ],
      );
      for (const { id, hash } of built.artifact.manifest.sections) {
        await client.query(
          `INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)`,
          [teamId, hash, built.artifact.sections[id]],
        );
        await client.query(
          `INSERT INTO template_version_sections
            (version_id, team_id, section_id, section_hash)
           VALUES ($1, $2, $3, $4)`,
          [versionId, teamId, id, hash],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      versionId,
      context: {
        tenantDb: createTenantDb(app, teamId),
        principal: principal(userId),
        requestId: randomUUID(),
      },
    };
  }

  it('holds the locked administrator authorization through the external handoff', async () => {
    const seeded = await seedPublication('registry-lock');
    const started = deferred();
    const release = deferred();
    const publishing = publishTemplateVersion(
      seeded.context,
      {
        origin: ORIGIN,
        assetStore,
        client: registryClient({
          handoffStarted: started.resolve,
          releaseHandoff: release.promise,
        }),
      },
      { versionId: seeded.versionId, credential: CREDENTIAL },
    );
    await started.promise;

    const updater = await pool.connect();
    try {
      await updater.query('BEGIN');
      const pid = await updater.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const update = updater.query(
        `UPDATE team_members SET role = 'member' WHERE team_id = $1`,
        ['registry-lock'],
      );
      await waitUntilBlocked(pool, pid.rows[0]!.pid);
      release.resolve();
      await expect(publishing).resolves.toMatchObject({ replayed: false });
      await expect(update).resolves.toMatchObject({ rowCount: 1 });
      await updater.query('COMMIT');
    } catch (error) {
      await updater.query('ROLLBACK').catch(() => undefined);
      release.resolve();
      throw error;
    } finally {
      updater.release();
    }
  });

  it('rechecks a revoked administrator before any Registry request', async () => {
    const seeded = await seedPublication('registry-revoked');
    await pool.query(
      `UPDATE team_members SET role = 'member' WHERE team_id = $1`,
      ['registry-revoked'],
    );
    let requests = 0;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        throw new Error('Registry must not be called');
      },
    });
    await expect(
      publishTemplateVersion(
        seeded.context,
        { origin: ORIGIN, assetStore, client },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(requests).toBe(0);
  });

  it('retries a remote success after a local rollback by Registry content identity', async () => {
    const seeded = await seedPublication('registry-retry');
    await pool.query(`
      CREATE SEQUENCE registry_test_record_attempt;
      GRANT USAGE, SELECT, UPDATE ON SEQUENCE registry_test_record_attempt TO studio_app;
      CREATE FUNCTION registry_test_fail_first_record() RETURNS trigger AS $$
      BEGIN
        IF nextval('registry_test_record_attempt') = 1 THEN
          RAISE EXCEPTION 'simulated local publication record failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER registry_test_fail_first_record
        BEFORE INSERT ON template_registry_publications
        FOR EACH ROW EXECUTE FUNCTION registry_test_fail_first_record();
    `);
    const publishedRoots: string[] = [];
    const client = registryClient({ publishedRoots });
    const publish = () =>
      publishTemplateVersion(
        { ...seeded.context, requestId: randomUUID() },
        { origin: ORIGIN, assetStore, client },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      );

    await expect(publish()).rejects.toThrow(
      'simulated local publication record failure',
    );
    await expect(publish()).resolves.toMatchObject({ replayed: false });
    await expect(publish()).resolves.toMatchObject({ replayed: true });
    expect(publishedRoots).toHaveLength(2);
    expect(new Set(publishedRoots).size).toBe(1);
    const rows = await pool.query<{ count: string }>(
      'SELECT count(*) FROM template_registry_publications WHERE team_id = $1',
      ['registry-retry'],
    );
    expect(rows.rows).toEqual([{ count: '1' }]);
  });

  it('imports verified Registry bytes with asset and machine origin stamps', async () => {
    const teamId = 'registry-import';
    const userId = `${teamId}-admin`;
    await seedTeam(pool, teamId);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
      [userId, 'Registry Admin', `${userId}@example.com`],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'admin')`,
      [randomUUID(), teamId, userId],
    );
    const built = await createTemplateArtifact(importFixture());
    const root = built.artifact.manifest.merkle_root;
    const entryId = randomUUID();
    const entry = {
      id: entryId,
      publisher: { id: PUBLISHER_ID, name: 'Original Publisher', orcid: null },
      root,
      template: built.artifact.manifest.template,
      license: built.artifact.license,
      curated: false,
      yanked: false,
      published_at: '2026-09-08T00:00:00.000Z',
      metadata: built.artifact.metadata,
      artifact_url: `${ORIGIN}/api/v1/artifacts/${root}`,
      report_url: `${ORIGIN}/api/v1/entries/${entryId}/reports`,
    };
    const registry = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input) => {
        const path = requestUrl(input).pathname;
        if (path === `/api/v1/entries/${entryId}`) return Response.json(entry);
        if (path !== `/api/v1/artifacts/${root}`)
          throw new Error('unexpected Registry request');
        return new Response(built.bytes, {
          headers: {
            'Content-Type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
            'ETag': `"${templateBytesHash(built.bytes)}"`,
            'X-Template-Root': root,
            'X-Registry-Yanked': 'false',
          },
        });
      },
    });
    const stored = new Map<string, Uint8Array>();
    const importAssetStore: AssetStore = {
      checkHealth: async () => undefined,
      get: async () => null,
      put: async (bytes, mediaType) => {
        const hash = createHash('sha256').update(bytes).digest('hex');
        stored.set(hash, bytes);
        return { hash, size: bytes.byteLength, mediaType };
      },
    };
    const result = await importRegistryTemplate(
      {
        tenantDb: createTenantDb(app, teamId),
        principal: principal(userId),
        requestId: randomUUID(),
      },
      { origin: ORIGIN, assetStore: importAssetStore, client: registry },
      entryId,
    );
    expect(result.replayed).toBe(false);
    expect(stored.size).toBe(1);
    const version = await pool.query<{
      registry_origin: Record<string, string>;
    }>('SELECT registry_origin FROM template_versions WHERE id = $1', [
      result.versionId,
    ]);
    expect(version.rows[0]?.registry_origin).toMatchObject({
      registry_url: ORIGIN,
      entry_id: entryId,
      source_version_hash: root,
    });
    const assets = await pool.query<{ origin: string }>(
      `SELECT origin FROM assets WHERE team_id = $1`,
      [teamId],
    );
    expect(assets.rows).toEqual([{ origin: 'registry_import' }]);
  });
});
