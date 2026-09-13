import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import { contract } from '@codaco/studio-rpc';
import { manifestHash } from '@codaco/studio-sync/apply';
import {
  createTemplateArtifact,
  readTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  type TemplateArtifactInput,
} from '@codaco/studio-sync/template-exchange';
import {
  TemplateRegistryClient,
  TemplateRegistryClientError,
} from '@codaco/studio-sync/template-registry-client';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { AssetStore } from '../../assets.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { encryptionEnvironment } from '../../pii/__tests__/fixtures.ts';
import { claimSpecificTemplateRegistryIntent } from '../registry-intent-worker.ts';
import {
  importRegistryTemplate,
  listTemplateVersions,
  publishTemplateVersion,
  reconcileClaimedTemplateRegistryIntent,
  readRegistryIntentStatuses,
} from '../registry.ts';

const db = await reachableDb();
const ORIGIN = 'https://registry.example';
const PUBLISHER_ID = 'aaaaaaaa-2222-4222-8222-222222222222';
const CREDENTIAL = `ncr1_${'a'.repeat(43)}`;
const REPLACEMENT_CREDENTIAL = `ncr1_${'b'.repeat(43)}`;
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
  failAfterAcceptance?: boolean;
  acceptedPublisher?: { id: string; name: string; orcid: string | null };
}) {
  const entryId = randomUUID();
  let acceptedEntry: Record<string, unknown> | undefined;
  return new TemplateRegistryClient({
    origin: ORIGIN,
    fetch: async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/v1/publisher') {
        return Response.json({
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        });
      }
      if (url.pathname === '/api/v1/entries' && init?.method === 'GET')
        return Response.json({
          data: acceptedEntry
            ? [
                {
                  id: acceptedEntry.id,
                  publisher: acceptedEntry.publisher,
                  root: acceptedEntry.root,
                  template: acceptedEntry.template,
                  license: acceptedEntry.license,
                  curated: acceptedEntry.curated,
                  yanked: acceptedEntry.yanked,
                  published_at: acceptedEntry.published_at,
                },
              ]
            : [],
          next_cursor: null,
          has_more: false,
        });
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
      acceptedEntry = {
        id: entryId,
        publisher: options.acceptedPublisher ?? {
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
      };
      if (options.failAfterAcceptance)
        throw new Error('simulated lost Registry response');
      return Response.json(acceptedEntry, { status: 201 });
    },
  });
}

function unavailableRegistryClient() {
  return new TemplateRegistryClient({
    origin: ORIGIN,
    fetch: async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/v1/publisher')
        return Response.json({
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        });
      if (url.pathname === '/api/v1/entries' && init?.method === 'GET')
        return Response.json({
          data: [],
          next_cursor: null,
          has_more: false,
        });
      throw new Error('simulated Registry handoff failure');
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
    schemaVersion: number = CURRENT_SCHEMA_VERSION,
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
          schemaVersion,
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

  it('returns publication timestamps accepted by the real RPC output contract', async () => {
    const seeded = await seedPublication('registry-list-dates');
    await publishTemplateVersion(
      seeded.context,
      {
        origin: ORIGIN,
        assetStore,
        maintenancePool: maintenance,
        client: registryClient({}),
      },
      { versionId: seeded.versionId, credential: CREDENTIAL },
    );
    const rows = await listTemplateVersions(seeded.context);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.publications).toHaveLength(1);
    const output = contract.templates.list['~orpc'].outputSchemas?.[0];
    if (!output) throw new Error('RPC output schema missing');
    const parsed = await output['~standard'].validate(rows);
    expect(parsed.issues).toBeUndefined();
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
    try {
      await expect(
        pool.query(
          `SELECT 1 FROM teams WHERE id='registry-asset-sequential' FOR UPDATE NOWAIT`,
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      releaseFirst.resolve();
    }
    await expect(publishing).resolves.toMatchObject({ replayed: false });
    expect(readsWhileFirstOpen).toBe(1);
    expect(reads).toBe(2);
  });

  it('finalizes an accepted publication when the Registry response is lost', async () => {
    const seeded = await seedPublication('registry-ambiguous');
    const publishedRoots: string[] = [];
    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore,
          maintenancePool: maintenance,
          client: registryClient({
            publishedRoots,
            failAfterAcceptance: true,
          }),
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).resolves.toMatchObject({ status: 'completed', replayed: false });
    expect(publishedRoots).toHaveLength(1);
  });

  it('uses the frozen publisher profile when the Registry profile changes after intent creation', async () => {
    const seeded = await seedPublication('registry-frozen-publisher');
    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore,
          maintenancePool: maintenance,
          client: registryClient({
            acceptedPublisher: {
              id: PUBLISHER_ID.toUpperCase(),
              name: 'Changed Publisher',
              orcid: '0000-0000-0000-0001',
            },
          }),
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).resolves.toMatchObject({
      status: 'completed',
      publication: {
        publisher: {
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        },
      },
    });
  });

  it('quarantines a publication intent when the preflight lookup is unavailable', async () => {
    const seeded = await seedPublication('registry-preflight-unavailable');
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input) => {
        const url = requestUrl(input);
        if (url.pathname === '/api/v1/publisher')
          return Response.json({
            id: PUBLISHER_ID,
            name: 'Original Publisher',
            orcid: null,
          });
        return new Response(null, { status: 503 });
      },
    });
    await expect(
      publishTemplateVersion(
        seeded.context,
        { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' });
    await expect(
      pool.query(
        `SELECT quarantined_at IS NOT NULL AS quarantined
           FROM template_registry_publication_intents WHERE team_id=$1`,
        ['registry-preflight-unavailable'],
      ),
    ).resolves.toHaveProperty('rows', [{ quarantined: true }]);
  });

  it('rejects stored protocol schema versions before reading assets or calling the Registry', async () => {
    const seeded = await seedPublication(
      'registry-old-schema',
      fixture(),
      0,
      CURRENT_SCHEMA_VERSION - 1,
    );
    await expect(
      publishTemplateVersion(
        seeded.context,
        {
          origin: ORIGIN,
          assetStore,
          maintenancePool: maintenance,
          client: registryClient({}),
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      ),
    ).rejects.toMatchObject({ code: 'SCHEMA_UNSUPPORTED' });
  });

  it('lets a new administrator finalize a remote success after the original administrator is revoked', async () => {
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
    const publish = (context = seeded.context, credential = CREDENTIAL) =>
      publishTemplateVersion(
        { ...context, requestId: randomUUID() },
        { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
        { versionId: seeded.versionId, credential },
      );

    await expect(publish()).resolves.toMatchObject({ status: 'pending' });
    await pool.query(
      `UPDATE team_members SET role='member' WHERE team_id='registry-retry'`,
    );
    const replacementId = 'registry-retry-replacement-admin';
    await pool.query(
      `INSERT INTO "user" (id,name,email,"emailVerified")
       VALUES ($1,'Replacement Admin',$2,true)`,
      [replacementId, `${replacementId}@example.com`],
    );
    await pool.query(
      `INSERT INTO team_members (id,team_id,user_id,role)
       VALUES ($1,'registry-retry',$2,'admin')`,
      [randomUUID(), replacementId],
    );
    await pool.query(
      `INSERT INTO template_registry_accounts
       (user_id,registry_url,publisher_id,publisher_name)
       VALUES ($1,$2,$3,'Original Publisher')`,
      [replacementId, ORIGIN, PUBLISHER_ID],
    );
    await pool.query(
      `UPDATE template_registry_publication_intents SET available_at=now()
       WHERE team_id='registry-retry'`,
    );
    const replacementContext = {
      tenantDb: createTenantDb(app, 'registry-retry'),
      principal: principal(replacementId),
      requestId: randomUUID(),
    };
    await expect(
      publish(replacementContext, REPLACEMENT_CREDENTIAL),
    ).resolves.toMatchObject({ status: 'completed', replayed: false });
    await expect(publish(replacementContext)).resolves.toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect(publishedRoots).toHaveLength(1);
    expect(new Set(publishedRoots).size).toBe(1);
    const rows = await pool.query<{ count: string }>(
      'SELECT count(*) FROM template_registry_publications WHERE team_id = $1',
      ['registry-retry'],
    );
    expect(rows.rows).toEqual([{ count: '1' }]);
    await expect(
      pool.query(
        `SELECT actor_kind,event_version FROM audit_events
         WHERE team_id='registry-retry'
           AND event_type='template.registry_published'`,
      ),
    ).resolves.toHaveProperty('rows', [
      { actor_kind: 'system', event_version: 2 },
    ]);
  });

  it('allows a fresh publication intent after a quarantined attempt', async () => {
    const seeded = await seedPublication('registry-publication-quarantine');
    const publish = (client: TemplateRegistryClient) =>
      publishTemplateVersion(
        { ...seeded.context, requestId: randomUUID() },
        {
          origin: ORIGIN,
          assetStore,
          maintenancePool: maintenance,
          client,
        },
        { versionId: seeded.versionId, credential: CREDENTIAL },
      );

    await expect(publish(unavailableRegistryClient())).resolves.toMatchObject({
      status: 'pending',
    });
    const first = await pool.query<{ id: string }>(
      `SELECT id FROM template_registry_publication_intents
       WHERE team_id = $1`,
      ['registry-publication-quarantine'],
    );
    const firstId = first.rows[0]?.id;
    if (!firstId) throw new Error('publication intent was not persisted');
    await pool.query(
      `UPDATE template_registry_publication_intents
       SET quarantined_at=clock_timestamp(), lease_owner=NULL,
           lease_expires_at=NULL
       WHERE id=$1`,
      [firstId],
    );

    const publishedRoots: string[] = [];
    await expect(
      publish(registryClient({ publishedRoots })),
    ).resolves.toMatchObject({ status: 'completed', replayed: false });
    expect(publishedRoots).toHaveLength(1);
    await expect(
      pool.query(
        `SELECT quarantined_at IS NOT NULL AS quarantined,
                completed_at IS NOT NULL AS completed
         FROM template_registry_publication_intents
         WHERE team_id=$1 ORDER BY created_at`,
        ['registry-publication-quarantine'],
      ),
    ).resolves.toHaveProperty('rows', [
      { quarantined: true, completed: false },
      { quarantined: false, completed: true },
    ]);
  });

  it.each([403, 429])(
    'quarantines definitive publication refusal %s instead of returning endless pending work',
    async (status) => {
      const teamId = `registry-publication-rejected-${status}`;
      const seeded = await seedPublication(teamId);
      const registry = new TemplateRegistryClient({
        origin: ORIGIN,
        fetch: async (input, init) => {
          const path = requestUrl(input).pathname;
          if (path === '/api/v1/publisher')
            return Response.json({
              id: PUBLISHER_ID,
              name: 'Original Publisher',
              orcid: null,
            });
          if (path === '/api/v1/entries' && init?.method === 'GET')
            return Response.json({
              data: [],
              next_cursor: null,
              has_more: false,
            });
          if (path === '/api/v1/entries' && init?.method === 'POST')
            return new Response(null, { status });
          throw new Error('unexpected request');
        },
      });
      await expect(
        publishTemplateVersion(
          seeded.context,
          {
            origin: ORIGIN,
            assetStore,
            maintenancePool: maintenance,
            client: registry,
          },
          { versionId: seeded.versionId, credential: CREDENTIAL },
        ),
      ).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' });
      expect(
        (
          await pool.query(
            `SELECT quarantined_at IS NOT NULL AS quarantined,lease_owner FROM template_registry_publication_intents WHERE team_id=$1`,
            [teamId],
          )
        ).rows,
      ).toEqual([{ quarantined: true, lease_owner: null }]);
      expect(
        (
          await pool.query(
            `SELECT details FROM audit_events WHERE team_id=$1 AND event_type='template.registry_intent_quarantined'`,
            [teamId],
          )
        ).rows,
      ).toEqual([
        { details: { kind: 'publication', reason: 'publication_rejected' } },
      ]);
      await expect(
        publishTemplateVersion(
          seeded.context,
          {
            origin: ORIGIN,
            assetStore,
            maintenancePool: maintenance,
            client: registryClient({}),
          },
          { versionId: seeded.versionId, credential: REPLACEMENT_CREDENTIAL },
        ),
      ).resolves.toMatchObject({ status: 'completed' });
    },
  );

  it.each([
    ['publication', 'https://replacement.example'],
    ['import', 'https://replacement.example'],
    ['publication', undefined],
    ['import', undefined],
  ] as const)(
    'quarantines a pending %s when the Registry changes to %s',
    async (kind, origin) => {
      const teamId = `registry-origin-change-${kind}-${origin ? 'changed' : 'disabled'}`;
      const seeded = await seedPublication(teamId);
      let intentId: string;
      const table =
        kind === 'publication'
          ? 'template_registry_publication_intents'
          : 'template_registry_import_intents';
      if (kind === 'publication') {
        const pending = await publishTemplateVersion(
          seeded.context,
          {
            origin: ORIGIN,
            assetStore,
            maintenancePool: maintenance,
            client: unavailableRegistryClient(),
          },
          { versionId: seeded.versionId, credential: CREDENTIAL },
        );
        if (pending.status !== 'pending')
          throw new Error('missing pending intent');
        intentId = pending.intentId;
        await pool.query(`UPDATE ${table} SET available_at=now() WHERE id=$1`, [
          intentId,
        ]);
      } else {
        intentId = randomUUID();
        await pool.query(
          `INSERT INTO template_registry_import_intents
        (id,team_id,registry_url,registry_entry_id,registry_root,entry_snapshot,asset_manifest,
         target_template_id,target_version_id,initiating_actor_id,initiating_actor_label,initiating_request_id)
        VALUES ($1,$2,$3,$4,$5,'{}','[]',$6,$7,$8,'Registry Admin',$9)`,
          [
            intentId,
            teamId,
            ORIGIN,
            randomUUID(),
            'a'.repeat(64),
            randomUUID(),
            randomUUID(),
            `${teamId}-admin`,
            randomUUID(),
          ],
        );
      }
      const claim = await claimSpecificTemplateRegistryIntent(
        maintenance,
        kind,
        intentId,
      );
      if (!claim) throw new Error('missing claim');
      await expect(
        readRegistryIntentStatuses(seeded.context, [{ id: intentId, kind }]),
      ).resolves.toEqual([{ id: intentId, kind, status: 'pending' }]);
      let calls = 0;
      const replacement = new TemplateRegistryClient({
        origin: 'https://replacement.example',
        fetch: async () => {
          calls += 1;
          throw new Error('replacement must not be contacted');
        },
      });
      await expect(
        reconcileClaimedTemplateRegistryIntent(
          {
            origin,
            assetStore,
            maintenancePool: maintenance,
            client: replacement,
          },
          claim,
        ),
      ).resolves.toBe('quarantined');
      expect(calls).toBe(0);
      await expect(
        readRegistryIntentStatuses(seeded.context, [{ id: intentId, kind }]),
      ).resolves.toEqual([{ id: intentId, kind, status: 'quarantined' }]);
      const other = await seedPublication(`${teamId}-other`);
      await expect(
        readRegistryIntentStatuses(other.context, [{ id: intentId, kind }]),
      ).resolves.toEqual([{ id: intentId, kind, status: 'unavailable' }]);
      await pool.query('UPDATE team_members SET role=$2 WHERE team_id=$1', [
        teamId,
        'member',
      ]);
      await expect(
        readRegistryIntentStatuses(seeded.context, [{ id: intentId, kind }]),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (
          await pool.query(
            `SELECT quarantined_at IS NOT NULL AS quarantined FROM ${table} WHERE id=$1`,
            [intentId],
          )
        ).rows,
      ).toEqual([{ quarantined: true }]);
      expect(
        (
          await pool.query(
            `SELECT details FROM audit_events WHERE team_id=$1 AND event_type='template.registry_intent_quarantined'`,
            [teamId],
          )
        ).rows,
      ).toEqual([{ details: { kind, reason: 'registry_changed' } }]);
    },
  );

  it.each([
    ['entry', 404],
    ['entry', 410],
    ['artifact', 404],
    ['artifact', 410],
    ['schema', 200],
  ] as const)(
    'quarantines pending import after permanent %s HTTP %s without publishing local data',
    async (resource, status) => {
      const teamId = `registry-removed-${resource}-${status}`;
      const seeded = await seedPublication(teamId);
      const built = await createTemplateArtifact(importFixture());
      const root = built.artifact.manifest.merkle_root;
      const id = randomUUID();
      const entryId = randomUUID();
      const entry = {
        id: entryId,
        publisher: {
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        },
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
      await pool.query(
        `INSERT INTO template_registry_import_intents
        (id,team_id,registry_url,registry_entry_id,registry_root,entry_snapshot,asset_manifest,
         target_template_id,target_version_id,initiating_actor_id,initiating_actor_label,initiating_request_id)
        VALUES ($1,$2,$3,$4,$5,$6,'[]',$7,$8,$9,'Registry Admin',$10)`,
        [
          id,
          teamId,
          ORIGIN,
          entryId,
          root,
          entry,
          randomUUID(),
          randomUUID(),
          `${teamId}-admin`,
          randomUUID(),
        ],
      );
      const claim = await claimSpecificTemplateRegistryIntent(
        maintenance,
        'import',
        id,
      );
      if (!claim) throw new Error('missing claim');
      const paths: string[] = [];
      const client = new TemplateRegistryClient({
        origin: ORIGIN,
        fetch: async (input) => {
          const path = requestUrl(input).pathname;
          paths.push(path);
          return resource === 'artifact' && path.includes('/entries/')
            ? Response.json(entry)
            : new Response(null, { status });
        },
      });
      if (resource === 'schema') {
        vi.spyOn(client, 'entry').mockResolvedValue(entry);
        vi.spyOn(client, 'fetchArtifact').mockRejectedValue(
          new TemplateRegistryClientError(
            'TEMPLATE_REGISTRY_SCHEMA_UNSUPPORTED',
          ),
        );
      }
      await expect(
        reconcileClaimedTemplateRegistryIntent(
          { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
          claim,
        ),
      ).resolves.toBe('quarantined');
      expect(paths).toHaveLength(
        resource === 'schema' ? 0 : resource === 'entry' ? 1 : 2,
      );
      await expect(
        readRegistryIntentStatuses(seeded.context, [{ id, kind: 'import' }]),
      ).resolves.toEqual([{ id, kind: 'import', status: 'quarantined' }]);
      expect(
        (
          await pool.query(
            `SELECT details FROM audit_events WHERE team_id=$1 AND event_type='template.registry_intent_quarantined'`,
            [teamId],
          )
        ).rows,
      ).toEqual([
        {
          details: {
            kind: 'import',
            reason:
              resource === 'schema'
                ? 'schema_unsupported'
                : 'resource_unavailable',
          },
        },
      ]);
      expect(
        (
          await pool.query('SELECT id FROM templates WHERE team_id=$1', [
            teamId,
          ])
        ).rows,
      ).toHaveLength(1);
    },
  );

  it.each([false, true])(
    'preserves imported source aliases and declared media types (typed aliases: %s)',
    async (typed) => {
      const teamId = `registry-source-aliases-${typed}`;
      const seeded = await seedPublication(teamId);
      const original = twoAssetFixture();
      const bytes = typed
        ? new TextEncoder().encode('{"type":"FeatureCollection","features":[]}')
        : png;
      const input: TemplateArtifactInput = typed
        ? {
            ...fixture(),
            sections: {
              ...fixture().sections,
              assets: {
                first: { type: 'network', name: 'First', source: 'a.json' },
                second: {
                  type: 'geojson',
                  name: 'Second',
                  source: 'b.geojson',
                },
              },
            },
            assets: [
              {
                source: 'a.json',
                media_class: 'dataset',
                media_type: 'application/json',
                bytes,
              },
              {
                source: 'b.geojson',
                media_class: 'dataset',
                media_type: 'application/geo+json',
                bytes,
              },
            ],
          }
        : {
            ...original,
            assets: original.assets.map((asset) => ({ ...asset, bytes })),
          };
      const canonicalType = typed ? 'application/json' : 'image/png';
      const canonicalClass = typed ? 'dataset' : 'image';
      const built = await createTemplateArtifact(input);
      const root = built.artifact.manifest.merkle_root;
      const hash = templateBytesHash(bytes);
      await pool.query(
        `INSERT INTO assets (team_id,hash,media_type,media_class,byte_size,original_filename,origin,uploaded_by_user_id)
       VALUES ($1,$2,$5,$6,$3,'preexisting.png','upload',$4)`,
        [
          teamId,
          hash,
          bytes.byteLength,
          `${teamId}-admin`,
          canonicalType,
          canonicalClass,
        ],
      );
      const entryId = randomUUID();
      const entry = {
        id: entryId,
        publisher: {
          id: PUBLISHER_ID,
          name: 'Original Publisher',
          orcid: null,
        },
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
      const publishedSources: string[][] = [];
      const registry = new TemplateRegistryClient({
        origin: ORIGIN,
        fetch: async (request, init) => {
          const path = requestUrl(request).pathname;
          if (path === '/api/v1/publisher')
            return Response.json(entry.publisher);
          if (path === `/api/v1/entries/${entryId}`)
            return Response.json(entry);
          if (path === `/api/v1/artifacts/${root}`)
            return new Response(built.bytes, {
              headers: {
                'Content-Type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
                'ETag': `"${templateBytesHash(built.bytes)}"`,
                'X-Template-Root': root,
                'X-Registry-Yanked': 'false',
              },
            });
          if (path === '/api/v1/entries' && init?.method === 'GET')
            return Response.json({
              data: [],
              next_cursor: null,
              has_more: false,
            });
          if (path === '/api/v1/entries' && init?.method === 'POST') {
            if (!(init.body instanceof FormData))
              throw new Error('missing publication form');
            const file = init.body.get('artifact');
            if (!(file instanceof File))
              throw new Error('missing publication artifact');
            const artifact = await readTemplateArtifact(
              new Uint8Array(await file.arrayBuffer()),
            );
            publishedSources.push(artifact.assets.map((asset) => asset.source));
            expect(artifact.assets.map((asset) => asset.media_type)).toEqual(
              input.assets.map((asset) => asset.media_type),
            );
            expect(artifact.manifest.merkle_root).toBe(root);
            return Response.json(entry, { status: 201 });
          }
          throw new Error('unexpected Registry request');
        },
      });
      const store: AssetStore = {
        checkHealth: async () => undefined,
        put: async (uploadedBytes) => ({
          hash: templateBytesHash(uploadedBytes),
          size: uploadedBytes.byteLength,
          mediaType: canonicalType,
        }),
        get: async (requested) =>
          requested === hash
            ? {
                size: bytes.byteLength,
                mediaType: canonicalType,
                body: new ReadableStream({
                  start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                  },
                }),
              }
            : null,
      };
      const config = {
        origin: ORIGIN,
        assetStore: store,
        maintenancePool: maintenance,
        client: registry,
      };
      const imported = await importRegistryTemplate(
        seeded.context,
        config,
        entryId,
      );
      expect(imported.status).toBe('completed');
      if (imported.status !== 'completed')
        throw new Error('import did not complete');
      await expect(
        publishTemplateVersion(seeded.context, config, {
          versionId: imported.versionId,
          credential: CREDENTIAL,
        }),
      ).resolves.toMatchObject({ status: 'completed' });
      expect(publishedSources).toEqual([
        input.assets.map((asset) => asset.source),
      ]);
      expect(
        (
          await pool.query(
            'SELECT original_filename FROM assets WHERE team_id=$1 AND hash=$2',
            [teamId, hash],
          )
        ).rows,
      ).toEqual([{ original_filename: 'preexisting.png' }]);
    },
  );

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
    const built = await createTemplateArtifact(twoAssetFixture());
    const root = built.artifact.manifest.merkle_root;
    const entryId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const entry = {
      id: entryId,
      publisher: { id: PUBLISHER_ID, name: 'Original Publisher', orcid: null },
      root,
      template: built.artifact.manifest.template,
      license: built.artifact.license,
      curated: false,
      yanked: false,
      published_at: '2026-09-08T00:00:00Z',
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
    let failNextPut = true;
    let invalidateLeaseAfterNextPut = false;
    const importAssetStore: AssetStore = {
      checkHealth: async () => undefined,
      get: async () => null,
      put: async (bytes, mediaType) => {
        if (failNextPut) {
          failNextPut = false;
          throw new Error('simulated mid-upload interruption');
        }
        const hash = createHash('sha256').update(bytes).digest('hex');
        stored.set(hash, bytes);
        if (invalidateLeaseAfterNextPut) {
          invalidateLeaseAfterNextPut = false;
          await pool.query(
            `UPDATE template_registry_import_intents
             SET lease_owner=NULL,lease_expires_at=NULL
             WHERE team_id=$1`,
            [teamId],
          );
        }
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
        {
          origin: ORIGIN,
          assetStore: importAssetStore,
          maintenancePool: maintenance,
          client: registry,
        },
        entryId.toUpperCase(),
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
    await expect(executeImport()).resolves.toMatchObject({
      status: 'pending',
    });
    await expect(
      pool.query(
        `SELECT unreferenced_at IS NOT NULL AS staged
           FROM assets WHERE team_id=$1`,
        [teamId],
      ),
    ).resolves.toHaveProperty('rows', [{ staged: true }]);
    await expect(
      pool.query(
        `SELECT id, target_template_id, target_version_id, completed_at, lease_owner
        FROM template_registry_import_intents
        WHERE team_id = $1`,
        [teamId],
      ),
    ).resolves.toMatchObject({
      rows: [{ completed_at: null, lease_owner: null }],
    });
    const pending = await pool.query<{
      id: string;
      target_template_id: string;
      target_version_id: string;
    }>(
      `SELECT id,target_template_id,target_version_id
       FROM template_registry_import_intents WHERE team_id=$1`,
      [teamId],
    );
    const intent = pending.rows[0];
    if (!intent) throw new Error('durable import intent was not persisted');
    const runtime = {
      origin: ORIGIN,
      assetStore: importAssetStore,
      maintenancePool: maintenance,
      client: registry,
    };

    entryResponse = {
      ...entry,
      publisher: {
        ...entry.publisher,
        name: 'Updated Publisher',
        orcid: '0000-0000-0000-0000',
      },
      curated: true,
      yanked: true,
      published_at: '2026-09-08T00:00:00.000Z',
    };
    await pool.query(`CREATE FUNCTION registry_import_mutable_entry_probe()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated mutable entry probe';
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER registry_import_mutable_entry_probe
        BEFORE INSERT ON templates
        FOR EACH ROW EXECUTE FUNCTION registry_import_mutable_entry_probe();`);
    await pool.query(
      `UPDATE template_registry_import_intents SET available_at=now()
       WHERE id=$1`,
      [intent.id],
    );
    const mutableClaim = await claimSpecificTemplateRegistryIntent(
      maintenance,
      'import',
      intent.id,
    );
    if (!mutableClaim) throw new Error('mutable entry probe was not claimed');
    await expect(
      reconcileClaimedTemplateRegistryIntent(runtime, mutableClaim),
    ).rejects.toThrow('simulated mutable entry probe');
    await pool.query(
      `DROP TRIGGER registry_import_mutable_entry_probe ON templates`,
    );
    await pool.query(`DROP FUNCTION registry_import_mutable_entry_probe()`);
    await pool.query(
      `UPDATE template_registry_import_intents
       SET lease_owner=NULL,lease_expires_at=NULL,available_at=now()
       WHERE id=$1`,
      [intent.id],
    );

    entryResponse = {
      ...entry,
      publisher: { ...entry.publisher, id: randomUUID() },
    };
    const publisherMismatchClaim = await claimSpecificTemplateRegistryIntent(
      maintenance,
      'import',
      intent.id,
    );
    if (!publisherMismatchClaim)
      throw new Error('publisher mismatch probe was not claimed');
    await expect(
      reconcileClaimedTemplateRegistryIntent(runtime, publisherMismatchClaim),
    ).rejects.toMatchObject({ code: 'REGISTRY_UNAVAILABLE' });
    await pool.query(
      `UPDATE template_registry_import_intents
       SET lease_owner=NULL,lease_expires_at=NULL,available_at=now()
       WHERE id=$1`,
      [intent.id],
    );
    entryResponse = entry;

    // The two comparison controls intentionally upload before finalization;
    // reset this store so the following lease-loss oracle counts only its own
    // partial upload.
    stored.clear();

    invalidateLeaseAfterNextPut = true;
    await pool.query(
      `UPDATE template_registry_import_intents SET available_at=now()
      WHERE team_id=$1`,
      [teamId],
    );
    const lostLeaseClaim = await claimSpecificTemplateRegistryIntent(
      maintenance,
      'import',
      intent.id,
    );
    if (!lostLeaseClaim) throw new Error('lease test did not claim import');
    await expect(
      reconcileClaimedTemplateRegistryIntent(runtime, lostLeaseClaim),
    ).rejects.toThrow('Registry import intent lease is not owned');
    expect(stored.size).toBe(1);
    await pool.query(
      `UPDATE template_registry_import_intents SET available_at=now()
       WHERE id=$1`,
      [intent.id],
    );
    await pool.query(`CREATE SEQUENCE registry_import_finalize_attempt;
      GRANT USAGE, SELECT, UPDATE ON SEQUENCE registry_import_finalize_attempt
        TO studio_maintenance;
      CREATE FUNCTION registry_import_fail_first_finalize() RETURNS trigger AS $$
      BEGIN
        IF nextval('registry_import_finalize_attempt') = 1 THEN
          RAISE EXCEPTION 'simulated import finalization failure';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER registry_import_fail_first_finalize BEFORE INSERT ON templates
        FOR EACH ROW EXECUTE FUNCTION registry_import_fail_first_finalize();`);
    const firstRestartClaim = await claimSpecificTemplateRegistryIntent(
      maintenance,
      'import',
      intent.id,
    );
    if (!firstRestartClaim) throw new Error('restart did not claim import');
    await expect(
      reconcileClaimedTemplateRegistryIntent(runtime, firstRestartClaim),
    ).rejects.toThrow('simulated import finalization failure');
    await pool.query(
      `UPDATE template_registry_import_intents
       SET lease_owner=NULL,lease_expires_at=NULL,available_at=now()
       WHERE id=$1 AND lease_owner=$2`,
      [intent.id, firstRestartClaim.leaseOwner],
    );
    await expect(
      pool.query('SELECT id FROM templates WHERE team_id=$1', [teamId]),
    ).resolves.toHaveProperty('rowCount', 0);
    const secondRestartClaim = await claimSpecificTemplateRegistryIntent(
      maintenance,
      'import',
      intent.id,
    );
    if (!secondRestartClaim) throw new Error('resumed import was not claimed');
    await expect(
      reconcileClaimedTemplateRegistryIntent(runtime, secondRestartClaim),
    ).resolves.toBe('completed');
    expect(stored.size).toBe(2);
    const version = await pool.query<{
      registry_origin: Record<string, string>;
    }>('SELECT registry_origin FROM template_versions WHERE id = $1', [
      intent.target_version_id,
    ]);
    expect(version.rows[0]?.registry_origin).toMatchObject({
      registry_url: ORIGIN,
      entry_id: entryId,
      source_version_hash: root,
    });
    const assets = await pool.query<{
      origin: string;
      unreferenced_at: Date | null;
    }>(`SELECT origin,unreferenced_at FROM assets WHERE team_id = $1`, [
      teamId,
    ]);
    expect(assets.rows).toHaveLength(2);
    expect(
      assets.rows.every(({ origin }) => origin === 'registry_import'),
    ).toBe(true);
    expect(assets.rows.every(({ unreferenced_at }) => !unreferenced_at)).toBe(
      true,
    );
  });

  it('performs Registry import reads before taking the team audit lock', async () => {
    const seeded = await seedPublication('registry-import-unlocked');
    const built = await createTemplateArtifact(fixture());
    const root = built.artifact.manifest.merkle_root;
    const entryId = 'bbbbbbbb-1111-4111-8111-111111111111';
    const artifactStarted = deferred();
    const releaseArtifact = deferred();
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input) => {
        const path = requestUrl(input).pathname;
        if (path === `/api/v1/entries/${entryId}`)
          return Response.json({
            id: entryId,
            publisher: { id: PUBLISHER_ID, name: 'Publisher', orcid: null },
            root,
            template: built.artifact.manifest.template,
            license: built.artifact.license,
            curated: false,
            yanked: false,
            published_at: '2026-09-08T00:00:00.000Z',
            metadata: built.artifact.metadata,
            artifact_url: `${ORIGIN}/api/v1/artifacts/${root}`,
            report_url: `${ORIGIN}/api/v1/entries/${entryId}/reports`,
          });
        if (path === `/api/v1/artifacts/${root}`) {
          artifactStarted.resolve();
          await releaseArtifact.promise;
          return new Response(built.bytes, {
            headers: {
              'Content-Type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
              'ETag': `"${templateBytesHash(built.bytes)}"`,
              'X-Template-Root': root,
              'X-Registry-Yanked': 'false',
            },
          });
        }
        throw new Error('unexpected Registry request');
      },
    });
    const importing = importRegistryTemplate(
      seeded.context,
      { origin: ORIGIN, assetStore, maintenancePool: maintenance, client },
      entryId,
    );
    await artifactStarted.promise;
    try {
      await expect(
        pool.query(
          `SELECT 1 FROM teams WHERE id='registry-import-unlocked' FOR UPDATE NOWAIT`,
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      releaseArtifact.resolve();
    }
    await expect(importing).resolves.toMatchObject({
      status: 'completed',
      replayed: false,
    });
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ])(
    'rejects special Registry UUID %s before creating durable work',
    async (id) => {
      const seeded = await seedPublication(`registry-special-${id[0]}`);
      await expect(
        importRegistryTemplate(
          seeded.context,
          {
            origin: ORIGIN,
            assetStore,
            maintenancePool: maintenance,
            client: registryClient({}),
          },
          id,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        pool.query(
          `SELECT count(*)::int AS count
           FROM template_registry_import_intents WHERE team_id=$1`,
          [seeded.context.tenantDb.teamId],
        ),
      ).resolves.toHaveProperty('rows', [{ count: 0 }]);
    },
  );

  it('allows a fresh import intent after a quarantined attempt', async () => {
    const teamId = 'registry-import-quarantine';
    const userId = `${teamId}-admin`;
    await seedTeam(pool, teamId);
    await pool.query(
      `INSERT INTO "user" (id,name,email,"emailVerified")
       VALUES ($1,$2,$3,true)`,
      [userId, 'Registry Admin', `${userId}@example.com`],
    );
    await pool.query(
      `INSERT INTO team_members (id,team_id,user_id,role)
       VALUES ($1,$2,$3,'admin')`,
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
    const failingStore: AssetStore = {
      checkHealth: async () => undefined,
      get: async () => null,
      put: async () => {
        throw new Error('simulated first import interruption');
      },
    };
    const context = () => ({
      tenantDb: createTenantDb(app, teamId),
      principal: principal(userId),
      requestId: randomUUID(),
    });
    await expect(
      importRegistryTemplate(
        context(),
        {
          origin: ORIGIN,
          assetStore: failingStore,
          maintenancePool: maintenance,
          client: registry,
        },
        entryId,
      ),
    ).resolves.toMatchObject({ status: 'pending' });
    const first = await pool.query<{ id: string }>(
      `SELECT id FROM template_registry_import_intents WHERE team_id=$1`,
      [teamId],
    );
    const firstId = first.rows[0]?.id;
    if (!firstId) throw new Error('import intent was not persisted');
    await pool.query(
      `UPDATE template_registry_import_intents
       SET quarantined_at=clock_timestamp(),lease_owner=NULL,
           lease_expires_at=NULL
       WHERE id=$1`,
      [firstId],
    );
    const imported = new Map<string, Uint8Array>();
    const workingStore: AssetStore = {
      checkHealth: async () => undefined,
      get: async () => null,
      put: async (bytes, mediaType) => {
        const hash = createHash('sha256').update(bytes).digest('hex');
        imported.set(hash, bytes);
        return { hash, size: bytes.byteLength, mediaType };
      },
    };
    await expect(
      importRegistryTemplate(
        context(),
        {
          origin: ORIGIN,
          assetStore: workingStore,
          maintenancePool: maintenance,
          client: registry,
        },
        entryId,
      ),
    ).resolves.toMatchObject({ status: 'completed', replayed: false });
    expect(imported.size).toBe(1);
    await expect(
      pool.query(
        `SELECT quarantined_at IS NOT NULL AS quarantined,
                completed_at IS NOT NULL AS completed
         FROM template_registry_import_intents
         WHERE team_id=$1 ORDER BY created_at`,
        [teamId],
      ),
    ).resolves.toHaveProperty('rows', [
      { quarantined: true, completed: false },
      { quarantined: false, completed: true },
    ]);
  });
  it('starts the actual worker with Registry and storage disabled and quarantines existing work', async () => {
    if (!db) throw new Error('database unavailable');
    const isolated = await createScratchSchema(db);
    let child: ReturnType<typeof spawn> | undefined;
    let exited: Promise<unknown> | undefined;
    let output = '';
    try {
      await provisionScratchSchema(isolated.pool);
      const teamId = 'registry-disabled-startup';
      await seedTeam(isolated.pool, teamId);
      const userId = 'registry-disabled-owner';
      await isolated.pool.query(
        `INSERT INTO "user" (id,name,email,"emailVerified") VALUES ($1,'Owner','disabled-startup@example.com',true)`,
        [userId],
      );
      const id = randomUUID();
      await isolated.pool.query(
        `INSERT INTO template_registry_import_intents
        (id,team_id,registry_url,registry_entry_id,registry_root,entry_snapshot,asset_manifest,
         target_template_id,target_version_id,initiating_actor_id,initiating_actor_label,initiating_request_id)
        VALUES ($1,$2,$3,$4,$5,'{}','[]',$6,$7,$8,'Owner',$9)`,
        [
          id,
          teamId,
          ORIGIN,
          randomUUID(),
          'a'.repeat(64),
          randomUUID(),
          randomUUID(),
          userId,
          randomUUID(),
        ],
      );
      const schema = (
        await isolated.pool.query<{ name: string }>(
          'SELECT current_schema() AS name',
        )
      ).rows[0]!.name;
      const url = new URL(db.url);
      url.searchParams.set('options', `-c search_path=${schema}`);
      child = spawn(
        process.execPath,
        [new URL('../../index.ts', import.meta.url).pathname],
        {
          env: {
            NODE_ENV: 'test',
            STUDIO_DEV_DEFAULTS: 'true',
            STUDIO_ROLE: 'worker',
            DATABASE_URL: url.href,
            STUDIO_TELEMETRY: 'false',
            HOST: '127.0.0.1',
            PORT: '0',
            BETTER_AUTH_SECRET: 'synthetic-startup-test-secret-more-than-32',
            PUBLIC_URL: 'http://localhost:4173',
            ...encryptionEnvironment(),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      exited = once(child, 'exit');
      child.stdout?.on('data', (bytes: Buffer) => {
        output += bytes.toString();
      });
      child.stderr?.on('data', (bytes: Buffer) => {
        output += bytes.toString();
      });
      await vi.waitFor(
        async () => {
          expect(child?.exitCode, output).toBeNull();
          expect(
            (
              await isolated.pool.query(
                'SELECT quarantined_at IS NOT NULL AS quarantined FROM template_registry_import_intents WHERE id=$1',
                [id],
              )
            ).rows,
            output,
          ).toEqual([{ quarantined: true }]);
        },
        { timeout: 15_000 },
      );
    } finally {
      if (child && child.exitCode === null) child.kill('SIGTERM');
      if (exited) await exited;
      await isolated.dispose();
    }
  });
});
