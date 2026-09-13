import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import { manifestHash } from '@codaco/studio-sync/apply';
import {
  createTemplateArtifact,
  readTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
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

function twoAssetFixture(): TemplateArtifactInput {
  const input = importFixture();
  const second = Uint8Array.from(png);
  second[second.length - 1] = second[second.length - 1]! ^ 1;
  return {
    ...input,
    sections: {
      ...input.sections,
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [
          { id: 'first', type: 'asset', content: 'first' },
          { id: 'second', type: 'asset', content: 'second' },
        ],
      },
      'assets': {
        first: { type: 'image', name: 'First', source: 'a.png' },
        second: { type: 'image', name: 'Second', source: 'b.png' },
      },
    },
    assets: [
      {
        source: 'a.png',
        media_class: 'image',
        media_type: 'image/png',
        bytes: png,
      },
      {
        source: 'b.png',
        media_class: 'image',
        media_type: 'image/png',
        bytes: second,
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
      if (url.pathname === '/api/v1/entries' && init?.method === 'GET')
        return Response.json({ data: [], next_cursor: null, has_more: false });
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
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
  });

  afterAll(async () => await dispose());

  async function seedPublication(
    teamId: string,
    input: TemplateArtifactInput = fixture(),
    extraAssetCount = 0,
  ) {
    const userId = `${teamId}-admin`;
    const templateId = randomUUID();
    const versionId = randomUUID();
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
      for (const asset of built.artifact.assets) {
        await client.query(
          `INSERT INTO assets
            (team_id, hash, media_type, media_class, byte_size, original_filename,
             origin, uploaded_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'upload', $7)`,
          [
            teamId,
            asset.hash,
            asset.media_type,
            asset.media_class,
            asset.byte_size,
            asset.source,
            userId,
          ],
        );
        await client.query(
          `INSERT INTO asset_references
            (team_id, asset_hash, referrer_kind, referrer_id)
           VALUES ($1, $2, 'template_version', $3)`,
          [teamId, asset.hash, versionId],
        );
      }
      for (let index = 0; index < extraAssetCount; index += 1) {
        const hash = createHash('sha256')
          .update(`extra-asset-${index}`)
          .digest('hex');
        await client.query(
          `INSERT INTO assets
            (team_id, hash, media_type, media_class, byte_size, original_filename,
             origin, uploaded_by_user_id)
           VALUES ($1, $2, 'image/png', 'image', 1, $3, 'upload', $4)`,
          [teamId, hash, `extra-${index}.png`, userId],
        );
        await client.query(
          `INSERT INTO asset_references
            (team_id, asset_hash, referrer_kind, referrer_id)
           VALUES ($1, $2, 'template_version', $3)`,
          [teamId, hash, versionId],
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

  it('commits the intent before handoff and finalizes after the initiating administrator is revoked', async () => {
    const seeded = await seedPublication('registry-lock');
    const started = deferred();
    const release = deferred();
    const publishing = publishTemplateVersion(
      seeded.context,
      {
        origin: ORIGIN,
        assetStore,
        maintenancePool: maintenance,
        client: registryClient({
          handoffStarted: started.resolve,
          releaseHandoff: release.promise,
        }),
      },
      { versionId: seeded.versionId, credential: CREDENTIAL },
    );
    await started.promise;
    await expect(
      pool.query(`UPDATE team_members SET role = 'member' WHERE team_id = $1`, [
        'registry-lock',
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `SELECT count(*)::int AS count
         FROM template_registry_publication_intents WHERE team_id = $1`,
        ['registry-lock'],
      ),
    ).resolves.toHaveProperty('rows', [{ count: 1 }]);
    release.resolve();
    await expect(publishing).resolves.toMatchObject({
      status: 'completed',
      replayed: false,
    });
    const events = await pool.query<{
      actor_kind: string;
      event_version: number;
    }>(
      `SELECT actor_kind, event_version FROM audit_events
       WHERE team_id = $1 AND event_type = 'template.registry_published'`,
      ['registry-lock'],
    );
    expect(events.rows).toEqual([{ actor_kind: 'system', event_version: 2 }]);
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
        { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(requests).toBe(0);
  });

  it('refuses object bytes that no longer match the immutable asset hash', async () => {
    const seeded = await seedPublication(
      'registry-asset-integrity',
      importFixture(),
    );
    const changed = Uint8Array.from(png);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    let requests = 0;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        throw new Error('Registry must not be called');
      },
    });
    const corruptStore: AssetStore = {
      checkHealth: async () => undefined,
      put: async () => {
        throw new Error('unexpected asset write');
      },
      get: async () => ({
        body: new Blob([changed]).stream(),
        mediaType: 'image/png',
        size: changed.byteLength,
      }),
    };

    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore: corruptStore,
          maintenancePool: maintenance,
          client,
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(requests).toBe(0);
  });

  it('cancels an oversized object stream before contacting the Registry', async () => {
    const seeded = await seedPublication(
      'registry-asset-bound',
      importFixture(),
    );
    let canceled = false;
    let requests = 0;
    let chunks = 0;
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks === 2) {
          controller.close();
          return;
        }
        const bytes = new Uint8Array(6 * 1024 * 1024);
        if (chunks === 0) bytes.set(png);
        chunks += 1;
        controller.enqueue(bytes);
      },
      cancel() {
        canceled = true;
      },
    });
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        throw new Error('Registry must not be called');
      },
    });
    const oversizedStore: AssetStore = {
      checkHealth: async () => undefined,
      put: async () => {
        throw new Error('unexpected asset write');
      },
      get: async () => ({
        body: oversized,
        mediaType: 'image/png',
        size: undefined,
      }),
    };

    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore: oversizedStore,
          maintenancePool: maintenance,
          client,
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(canceled).toBe(true);
    expect(requests).toBe(0);
  });

  it('rejects too many referenced assets before opening object streams', async () => {
    const seeded = await seedPublication(
      'registry-asset-count',
      fixture(),
      TEMPLATE_ARTIFACT_LIMITS.assets + 1,
    );
    let reads = 0;
    const unopenedStore: AssetStore = {
      checkHealth: async () => undefined,
      put: async () => {
        throw new Error('unexpected asset write');
      },
      get: async () => {
        reads += 1;
        throw new Error('object streams must not be opened');
      },
    };
    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore: unopenedStore,
          maintenancePool: maintenance,
          client: registryClient({}),
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(reads).toBe(0);
  });

  it('does not await a broken object-stream cancellation', async () => {
    const seeded = await seedPublication(
      'registry-asset-cancel',
      importFixture(),
    );
    const brokenStore: AssetStore = {
      checkHealth: async () => undefined,
      put: async () => {
        throw new Error('unexpected asset write');
      },
      get: async () => ({
        body: new ReadableStream({
          cancel: () => new Promise<void>(() => undefined),
        }),
        mediaType: 'application/octet-stream',
        size: png.byteLength,
      }),
    };
    await expect(
      Promise.race([
        publishTemplateVersion(
          seeded.context,
          {
            origin: ORIGIN,
            assetStore: brokenStore,
            maintenancePool: maintenance,
            client: registryClient({}),
          },
          { versionId: seeded.versionId, credential: CREDENTIAL },
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TEST_DEADLINE_MISSED')), 250),
        ),
      ]),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });

  it('finishes each bounded asset read before opening the next object', async () => {
    const input = twoAssetFixture();
    const seeded = await seedPublication('registry-asset-sequential', input);
    const firstStarted = deferred();
    const releaseFirst = deferred();
    let reads = 0;
    const bytesByHash = new Map(
      input.assets.map((asset) => [
        templateBytesHash(asset.bytes),
        asset.bytes,
      ]),
    );
    const sequentialStore: AssetStore = {
      checkHealth: async () => undefined,
      put: async () => {
        throw new Error('unexpected asset write');
      },
      get: async (hash) => {
        reads += 1;
        const bytes = bytesByHash.get(hash);
        if (!bytes) return null;
        if (reads !== 1)
          return {
            body: new Blob([bytes]).stream(),
            mediaType: 'image/png',
            size: bytes.byteLength,
          };
        return {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              firstStarted.resolve();
              void releaseFirst.promise.then(() => controller.close());
            },
          }),
          mediaType: 'image/png',
          size: bytes.byteLength,
        };
      },
    };
    const publishing = publishTemplateVersion(
      seeded.context,
      {
        origin: ORIGIN,
        assetStore: sequentialStore,
        maintenancePool: maintenance,
        client: registryClient({}),
      },
      { versionId: seeded.versionId, credential: CREDENTIAL },
    );
    await firstStarted.promise;
    const readsWhileFirstOpen = reads;
    releaseFirst.resolve();
    await expect(publishing).resolves.toMatchObject({ replayed: false });
    expect(readsWhileFirstOpen).toBe(1);
    expect(reads).toBe(2);
  });

  it('retries a remote success after a local rollback by Registry content identity', async () => {
    const seeded = await seedPublication('registry-retry');
    await pool.query(`
      CREATE SEQUENCE registry_test_record_attempt;
      GRANT USAGE, SELECT, UPDATE ON SEQUENCE registry_test_record_attempt TO studio_app, studio_maintenance;
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
        { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
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
    let entryResponse: unknown = entry;
    const registry = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input) => {
        const path = requestUrl(input).pathname;
        if (path === `/api/v1/entries/${entryId}`)
          return Response.json(entryResponse);
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
    const executeImport = () =>
      importRegistryTemplate(
        {
          tenantDb: createTenantDb(app, teamId),
          principal: principal(userId),
          requestId: randomUUID(),
        },
        { origin: ORIGIN, assetStore: importAssetStore, client: registry },
        entryId,
      );
    for (const changed of [
      { template: { ...entry.template, name: 'Unverified name' } },
      {
        metadata: {
          schema_version: 1,
          authors: [{ name: 'Unverified author' }],
        },
      },
      { license: 'CC0-1.0' },
    ]) {
      entryResponse = { ...entry, ...changed };
      await expect(executeImport()).rejects.toMatchObject({
        code: 'REGISTRY_UNAVAILABLE',
      });
      expect(stored.size).toBe(0);
      expect(
        (
          await pool.query('SELECT id FROM templates WHERE team_id = $1', [
            teamId,
          ])
        ).rowCount,
      ).toBe(0);
    }
    entryResponse = entry;
    const result = await executeImport();
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
