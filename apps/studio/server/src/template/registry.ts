import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { manifestHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  createTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
  type TemplateArtifactInput,
  type VerifiedTemplateArtifact,
} from '@codaco/studio-sync/template-exchange';
import { TemplateMetadataSchema } from '@codaco/studio-sync/template-metadata';
import {
  assertRegistryEntryArtifact,
  TemplateRegistryClient,
  TemplateRegistryClientError,
} from '@codaco/studio-sync/template-registry-client';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { AssetStore } from '../assets.ts';
import {
  auditActorEventContext,
  type AuditedCommandContext,
  type LockedAuditedCommandContext,
  runAuditedCommand,
  runAuditedSystemMutation,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import {
  claimSpecificTemplateRegistryIntent,
  deferTemplateRegistryIntent,
  type ClaimedTemplateRegistryIntent,
} from './registry-intent-worker.ts';

export class TemplateRegistryCommandError extends Error {
  readonly code:
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'REGISTRY_UNAVAILABLE'
    | 'SCHEMA_UNSUPPORTED'
    | 'STORAGE_UNAVAILABLE'
    | 'PUBLISHER_MISMATCH';

  constructor(code: TemplateRegistryCommandError['code']) {
    super(code);
    this.name = 'TemplateRegistryCommandError';
    this.code = code;
  }
}

type RegistryConfig = {
  origin: string;
  assetStore: AssetStore;
  maintenancePool?: pg.Pool;
  client?: TemplateRegistryClient;
};

type Publisher = { id: string; name: string; orcid: string | null };
type Publication = {
  entryId: string;
  registryUrl: string;
  root: string;
  publisher: Publisher;
  publishedAt: Date;
};

const teamStore = new TeamStore();

function clientFor(config: RegistryConfig): TemplateRegistryClient {
  return config.client ?? new TemplateRegistryClient({ origin: config.origin });
}

function translateRegistryError(error: unknown): never {
  if (error instanceof TemplateRegistryClientError) {
    throw new TemplateRegistryCommandError(
      error.code === 'TEMPLATE_REGISTRY_SCHEMA_UNSUPPORTED'
        ? 'SCHEMA_UNSUPPORTED'
        : 'REGISTRY_UNAVAILABLE',
    );
  }
  throw error;
}

function cancelWithoutWaiting(cancel: () => Promise<unknown>): void {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // A broken object-store stream cannot delay the fixed command failure.
  }
}

async function requireLockedAdministrator(
  client: pg.PoolClient,
  context: AuditedCommandContext,
): Promise<void> {
  const actor = await teamStore.lockActor(
    client,
    context.tenantDb.teamId,
    context.principal.userId,
  );
  if (!actor || !roleGrantsTeamAdministration(actor.role))
    throw new TemplateRegistryCommandError('FORBIDDEN');
}

async function streamBytes(
  body: ReadableStream,
  expectedBytes: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const bytes = new Uint8Array(expectedBytes);
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > expectedBytes - size)
        throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
      bytes.set(value, size);
      size += value.byteLength;
    }
    if (size !== expectedBytes)
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    complete = true;
    return bytes;
  } finally {
    if (!complete) cancelWithoutWaiting(async () => await reader.cancel());
    try {
      reader.releaseLock();
    } catch {
      // Cancellation may retain the lock in a custom object-store transport.
    }
  }
}

async function loadArtifactInput(
  client: pg.PoolClient,
  assetStore: AssetStore,
  teamId: string,
  versionId: string,
) {
  const version = await client.query<{
    template_id: string;
    name: string;
    kind: VerifiedTemplateArtifact['manifest']['template']['kind'];
    summary: string | null;
    license: 'CC-BY-4.0' | 'CC0-1.0';
    metadata: unknown;
    version_number: number;
    manifest: Record<string, string>;
  }>(
    `SELECT t.id AS template_id, t.name, t.kind, t.summary, t.license,
            t.metadata, v.version_number, v.manifest
       FROM template_versions v
       JOIN templates t ON t.id = v.template_id AND t.team_id = v.team_id
      WHERE v.id = $1 AND v.team_id = $2
      FOR UPDATE OF v, t`,
    [versionId, teamId],
  );
  const row = version.rows[0];
  if (!row) throw new TemplateRegistryCommandError('NOT_FOUND');

  const sectionRows = await client.query<{ hash: string; doc: SectionDoc }>(
    `SELECT s.hash, s.doc
       FROM template_version_sections tvs
       JOIN sections s ON s.team_id = tvs.team_id AND s.hash = tvs.section_hash
      WHERE tvs.version_id = $1 AND tvs.team_id = $2`,
    [versionId, teamId],
  );
  const sections: Record<string, SectionDoc> = {};
  for (const [id, hash] of Object.entries(row.manifest)) {
    const section = sectionRows.rows.find(
      (candidate) => candidate.hash === hash,
    );
    if (!section) throw new TemplateRegistryCommandError('NOT_FOUND');
    sections[id] = section.doc;
  }

  const assetRows = await client.query<{
    hash: string;
    media_type: string;
    media_class: 'image' | 'audio' | 'video' | 'dataset';
    byte_size: string;
    original_filename: string;
  }>(
    `SELECT a.hash, a.media_type, a.media_class, a.byte_size, a.original_filename
       FROM asset_references ar
       JOIN assets a ON a.team_id = ar.team_id AND a.hash = ar.asset_hash
      WHERE ar.team_id = $1 AND ar.referrer_kind = 'template_version'
        AND ar.referrer_id = $2
      ORDER BY a.original_filename`,
    [teamId, versionId],
  );
  if (assetRows.rows.length > TEMPLATE_ARTIFACT_LIMITS.assets)
    throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
  let assetBytes = 0;
  const boundedAssets: Array<
    Omit<(typeof assetRows.rows)[number], 'byte_size'> & { byte_size: number }
  > = [];
  for (const asset of assetRows.rows) {
    const byteSize = Number(asset.byte_size);
    if (
      !Number.isSafeInteger(byteSize) ||
      byteSize < 0 ||
      byteSize > TEMPLATE_ARTIFACT_LIMITS.assetBytes ||
      byteSize > TEMPLATE_ARTIFACT_LIMITS.inflatedBytes - assetBytes
    )
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    assetBytes += byteSize;
    boundedAssets.push({ ...asset, byte_size: byteSize });
  }
  const assets: TemplateArtifactInput['assets'][number][] = [];
  for (const asset of boundedAssets) {
    const stored = await assetStore.get(asset.hash);
    if (!stored) throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    if (
      (stored.size !== undefined && stored.size !== asset.byte_size) ||
      stored.mediaType !== asset.media_type
    ) {
      cancelWithoutWaiting(async () => await stored.body.cancel());
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    }
    const bytes = await streamBytes(stored.body, asset.byte_size);
    if (templateBytesHash(bytes) !== asset.hash)
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    assets.push({
      source: asset.original_filename,
      media_type: asset.media_type,
      media_class: asset.media_class,
      bytes,
    });
  }
  return {
    templateId: row.template_id,
    name: row.name,
    input: {
      template: {
        name: row.name,
        kind: row.kind,
        version: row.version_number,
        ...(row.summary ? { summary: row.summary } : {}),
      },
      metadata: TemplateMetadataSchema.parse(row.metadata),
      license: row.license,
      sections,
      assets,
    },
  };
}

function eventContext(
  context: LockedAuditedCommandContext,
  template: { id: string; name: string },
) {
  return {
    ...auditActorEventContext(context),
    eventVersion: 1,
    category: 'integration',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'template',
    resourceId: template.id,
    resourceLabel: template.name.slice(0, 320),
  } as const;
}

export async function readRegistryAccount(
  pool: pg.Pool,
  origin: string | undefined,
  userId: string,
) {
  if (!origin) return { origin: null, link: null };
  const result = await pool.query<{
    publisher_id: string;
    publisher_name: string;
    publisher_orcid: string | null;
    linked_at: Date;
  }>(
    `SELECT publisher_id, publisher_name, publisher_orcid, linked_at
       FROM template_registry_accounts
      WHERE user_id = $1 AND registry_url = $2`,
    [userId, origin],
  );
  const row = result.rows[0];
  return {
    origin,
    link: row
      ? {
          origin,
          publisher: {
            id: row.publisher_id,
            name: row.publisher_name,
            orcid: row.publisher_orcid,
          },
          linkedAt: row.linked_at,
        }
      : null,
  };
}

export async function linkRegistryAccount(
  pool: pg.Pool,
  origin: string | undefined,
  userId: string,
  credential: string,
  registry = origin ? new TemplateRegistryClient({ origin }) : undefined,
) {
  if (!origin) throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
  let publisher: Publisher;
  try {
    publisher = await registry!.publisher(credential);
  } catch (error) {
    translateRegistryError(error);
  }
  await pool.query(
    `INSERT INTO template_registry_accounts
       (user_id, registry_url, publisher_id, publisher_name, publisher_orcid)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, registry_url) DO UPDATE
       SET publisher_id = EXCLUDED.publisher_id,
           publisher_name = EXCLUDED.publisher_name,
           publisher_orcid = EXCLUDED.publisher_orcid,
           linked_at = clock_timestamp()`,
    [userId, origin, publisher.id, publisher.name, publisher.orcid],
  );
  return await readRegistryAccount(pool, origin, userId);
}

export async function listTemplateVersions(context: AuditedCommandContext) {
  const result = await context.tenantDb.query(
    `SELECT t.id AS "templateId", v.id AS "versionId", t.name, t.kind,
            v.version_number AS version, v.published_at AS "publishedAt",
            v.registry_origin AS "registryOrigin",
            COALESCE(jsonb_agg(jsonb_build_object(
              'entryId', p.registry_entry_id,
              'registryUrl', p.registry_url,
              'root', p.registry_root,
              'publisher', jsonb_build_object('id', p.publisher_id,
                'name', p.publisher_name, 'orcid', p.publisher_orcid),
              'publishedAt', p.published_at
            ) ORDER BY p.published_at) FILTER (WHERE p.id IS NOT NULL), '[]') AS publications
       FROM templates t
       JOIN template_versions v ON v.template_id = t.id AND v.team_id = t.team_id
       LEFT JOIN template_registry_publications p
         ON p.template_version_id = v.id AND p.team_id = v.team_id
      WHERE t.team_id = $1
      GROUP BY t.id, v.id
      ORDER BY v.published_at DESC, v.id`,
    [context.tenantDb.teamId],
  );
  return result.rows;
}

async function finalizePublicationIntent(
  pool: pg.Pool,
  claim: ClaimedTemplateRegistryIntent,
  entry: {
    id: string;
    root: string;
    publisher: Publisher;
    published_at: string;
  },
): Promise<Publication> {
  return await runAuditedSystemMutation(
    {
      tenantDb: createTenantDb(pool, claim.teamId),
      actorLabel: 'Template Registry reconciliation',
      requestId: claim.id,
    },
    async (client, auditContext) => {
      const intent = await client.query<{
        template_version_id: string;
        registry_url: string;
        registry_root: string;
        publisher_id: string;
        publisher_name: string;
        publisher_orcid: string | null;
        initiating_actor_id: string;
        initiating_actor_label: string;
        initiating_request_id: string;
        template_id: string;
        template_name: string;
      }>(
        `SELECT i.template_version_id, i.registry_url, i.registry_root,
                i.publisher_id, i.publisher_name, i.publisher_orcid,
                i.initiating_actor_id, i.initiating_actor_label,
                i.initiating_request_id, v.template_id, t.name template_name
         FROM template_registry_publication_intents i
         JOIN template_versions v ON v.id = i.template_version_id
           AND v.team_id = i.team_id
         JOIN templates t ON t.id = v.template_id AND t.team_id = v.team_id
         WHERE i.id = $1 AND i.team_id = $2 AND i.lease_owner = $3
           AND i.lease_expires_at > clock_timestamp()
           AND i.completed_at IS NULL AND i.quarantined_at IS NULL
         FOR UPDATE OF i`,
        [claim.id, claim.teamId, claim.leaseOwner],
      );
      const row = intent.rows[0];
      if (!row)
        throw new Error('Registry publication intent lease is not owned');
      if (
        entry.root !== row.registry_root ||
        entry.publisher.id !== row.publisher_id
      )
        throw new TemplateRegistryCommandError('PUBLISHER_MISMATCH');
      const publishedAt = new Date(entry.published_at);
      await client.query(
        `INSERT INTO template_registry_publications
          (id, team_id, template_version_id, registry_url, registry_entry_id,
           registry_root, publisher_id, publisher_name, publisher_orcid,
           published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (team_id, template_version_id, registry_url) DO NOTHING`,
        [
          randomUUID(),
          claim.teamId,
          row.template_version_id,
          row.registry_url,
          entry.id,
          entry.root,
          entry.publisher.id,
          entry.publisher.name,
          entry.publisher.orcid,
          publishedAt,
        ],
      );
      const completed = await client.query(
        `UPDATE template_registry_publication_intents
         SET registry_entry_id = $4, completed_at = clock_timestamp(),
             lease_owner = NULL, lease_expires_at = NULL
         WHERE id = $1 AND team_id = $2 AND lease_owner = $3
           AND completed_at IS NULL AND quarantined_at IS NULL`,
        [claim.id, claim.teamId, claim.leaseOwner, entry.id],
      );
      if (completed.rowCount !== 1)
        throw new Error('Registry publication intent lease was lost');
      const event = {
        ...auditContext,
        eventVersion: 2,
        eventType: 'template.registry_published',
        category: 'integration',
        outcome: 'succeeded',
        subjectType: null,
        subjectId: null,
        subjectLabel: null,
        resourceType: 'template',
        resourceId: row.template_id,
        resourceLabel: row.template_name.slice(0, 320),
        details: {
          versionId: row.template_version_id,
          registryEntryId: entry.id,
          registryRoot: entry.root,
          intentId: claim.id,
          initiatingActorId: row.initiating_actor_id,
          initiatingActorLabel: row.initiating_actor_label,
          initiatingRequestId: row.initiating_request_id,
        },
      } satisfies AuditEventInput;
      return {
        result: {
          entryId: entry.id,
          registryUrl: row.registry_url,
          root: entry.root,
          publisher: entry.publisher,
          publishedAt,
        },
        events: [event],
      };
    },
  );
}

type PriorPublicationRow = {
  registry_entry_id: string;
  registry_root: string;
  publisher_id: string;
  publisher_name: string;
  publisher_orcid: string | null;
  published_at: Date;
};
type PreparedPublication =
  | { prior: PriorPublicationRow }
  | {
      intentId: string;
      artifact: Awaited<ReturnType<typeof createTemplateArtifact>>;
      publisher: Publisher;
    };

export type PublishTemplateVersionResult =
  | { status: 'completed'; publication: Publication; replayed: boolean }
  | { status: 'pending'; intentId: string };

export async function publishTemplateVersion(
  context: AuditedCommandContext,
  config: RegistryConfig,
  input: { versionId: string; credential: string },
): Promise<PublishTemplateVersionResult> {
  if (!config.maintenancePool)
    throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
  const prepared = await runAuditedCommand<PreparedPublication>(
    context,
    async (client, auditContext) => {
      await requireLockedAdministrator(client, context);
      const existing = await client.query<{
        registry_entry_id: string;
        registry_root: string;
        publisher_id: string;
        publisher_name: string;
        publisher_orcid: string | null;
        published_at: Date;
      }>(
        `SELECT registry_entry_id, registry_root, publisher_id, publisher_name,
      publisher_orcid, published_at FROM template_registry_publications
      WHERE team_id=$1 AND template_version_id=$2 AND registry_url=$3`,
        [context.tenantDb.teamId, input.versionId, config.origin],
      );
      const prior = existing.rows[0];
      if (prior) return { status: 'unchanged' as const, result: { prior } };
      const local = await loadArtifactInput(
        client,
        config.assetStore,
        context.tenantDb.teamId,
        input.versionId,
      );
      const registry = clientFor(config);
      let publisher: Publisher;
      try {
        publisher = await registry.publisher(input.credential);
      } catch (error) {
        translateRegistryError(error);
      }
      const link = await client.query<{ publisher_id: string }>(
        `SELECT publisher_id FROM template_registry_accounts
       WHERE user_id=$1 AND registry_url=$2`,
        [context.principal.userId, config.origin],
      );
      if (link.rows[0]?.publisher_id !== publisher.id)
        throw new TemplateRegistryCommandError('PUBLISHER_MISMATCH');
      const artifact = await createTemplateArtifact(local.input);
      const root = artifact.artifact.manifest.merkle_root;
      const priorIntent = await client.query<{
        id: string;
        registry_root: string;
        publisher_id: string;
      }>(
        `SELECT id, registry_root, publisher_id
      FROM template_registry_publication_intents
      WHERE team_id=$1 AND template_version_id=$2 AND registry_url=$3
        AND completed_at IS NULL AND quarantined_at IS NULL FOR UPDATE`,
        [context.tenantDb.teamId, input.versionId, config.origin],
      );
      if (priorIntent.rows[0]) {
        if (
          priorIntent.rows[0].registry_root !== root ||
          priorIntent.rows[0].publisher_id !== publisher.id
        )
          throw new TemplateRegistryCommandError('PUBLISHER_MISMATCH');
        return {
          status: 'unchanged' as const,
          result: { intentId: priorIntent.rows[0].id, artifact, publisher },
        };
      }
      const intentId = randomUUID();
      await client.query(
        `INSERT INTO template_registry_publication_intents
      (id,team_id,template_version_id,registry_url,registry_root,publisher_id,
       publisher_name,publisher_orcid,initiating_actor_id,initiating_actor_label,
       initiating_request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          intentId,
          context.tenantDb.teamId,
          input.versionId,
          config.origin,
          root,
          publisher.id,
          publisher.name,
          publisher.orcid,
          auditActorEventContext(auditContext).actorId,
          auditActorEventContext(auditContext).actorLabel,
          auditContext.requestId,
        ],
      );
      const event = {
        ...eventContext(auditContext, {
          id: local.templateId,
          name: local.name,
        }),
        eventType: 'template.registry_publish_requested',
        details: { intentId, versionId: input.versionId, registryRoot: root },
      } satisfies AuditEventInput;
      return {
        status: 'succeeded' as const,
        result: { intentId, artifact, publisher },
        events: [event],
      };
    },
  );
  if ('prior' in prepared) {
    const prior = prepared.prior;
    return {
      status: 'completed',
      replayed: true,
      publication: {
        entryId: prior.registry_entry_id,
        registryUrl: config.origin,
        root: prior.registry_root,
        publisher: {
          id: prior.publisher_id,
          name: prior.publisher_name,
          orcid: prior.publisher_orcid,
        },
        publishedAt: prior.published_at,
      },
    };
  }
  const claim = await claimSpecificTemplateRegistryIntent(
    config.maintenancePool,
    'publication',
    prepared.intentId,
  );
  if (!claim) return { status: 'pending', intentId: prepared.intentId };
  const registry = clientFor(config);
  try {
    let entry = await registry.findEntry(
      prepared.artifact.artifact.manifest.merkle_root,
      prepared.publisher.id,
    );
    if (!entry)
      entry = await registry.publish(prepared.artifact.bytes, input.credential);
    const publication = await finalizePublicationIntent(
      config.maintenancePool,
      claim,
      entry,
    );
    return { status: 'completed', publication, replayed: false };
  } catch (error) {
    await deferTemplateRegistryIntent(config.maintenancePool, claim, 5_000);
    if (error instanceof TemplateRegistryCommandError) throw error;
    return translateRegistryError(error);
  }
}

export async function importRegistryTemplate(
  context: AuditedCommandContext,
  config: RegistryConfig,
  entryId: string,
): Promise<{ templateId: string; versionId: string; replayed: boolean }> {
  return await runAuditedCommand<{
    templateId: string;
    versionId: string;
    replayed: boolean;
  }>(context, async (client, auditContext) => {
    await requireLockedAdministrator(client, context);
    const replay = await client.query<{ template_id: string; id: string }>(
      `SELECT template_id, id FROM template_versions
        WHERE team_id = $1 AND registry_origin->>'registry_url' = $2
          AND registry_origin->>'entry_id' = $3`,
      [context.tenantDb.teamId, config.origin, entryId],
    );
    if (replay.rows[0]) {
      return {
        status: 'unchanged',
        result: {
          templateId: replay.rows[0].template_id,
          versionId: replay.rows[0].id,
          replayed: true,
        },
      };
    }
    const registry = clientFor(config);
    let entry;
    let fetched;
    try {
      entry = await registry.entry(entryId);
      fetched = await registry.fetchArtifact(entry.root);
      assertRegistryEntryArtifact(entry, fetched.artifact);
    } catch (error) {
      translateRegistryError(error);
    }
    if (entry.id !== entryId || fetched.root !== entry.root)
      throw new TemplateRegistryCommandError('NOT_FOUND');

    for (const asset of fetched.artifact.assets) {
      const stored = await config.assetStore.put(asset.bytes, asset.media_type);
      if (stored.hash !== asset.hash)
        throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    }
    const templateId = randomUUID();
    const versionId = randomUUID();
    const manifest = Object.fromEntries(
      fetched.artifact.manifest.sections.map(({ id, hash }) => [id, hash]),
    );
    await client.query(
      `INSERT INTO templates
        (id, team_id, kind, name, summary, license, state, metadata, author_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8)`,
      [
        templateId,
        context.tenantDb.teamId,
        entry.template.kind,
        entry.template.name,
        entry.template.summary ?? null,
        entry.license,
        fetched.artifact.metadata,
        context.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO template_versions
        (id, team_id, template_id, version_number, manifest, manifest_hash,
         schema_version, published_at, registry_origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        versionId,
        context.tenantDb.teamId,
        templateId,
        entry.template.version,
        manifest,
        manifestHash(manifest, null),
        fetched.artifact.manifest.protocol_schema_version,
        new Date(entry.published_at),
        {
          registry_url: config.origin,
          entry_id: entry.id,
          source_version_hash: entry.root,
          fetched_at: new Date().toISOString(),
        },
      ],
    );
    for (const { id, hash } of fetched.artifact.manifest.sections) {
      const doc = fetched.artifact.sections[id];
      if (!doc) throw new TemplateRegistryCommandError('NOT_FOUND');
      await client.query(
        `INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)
         ON CONFLICT (team_id, hash) DO NOTHING`,
        [context.tenantDb.teamId, hash, doc],
      );
      await client.query(
        `INSERT INTO template_version_sections
          (version_id, team_id, section_id, section_hash) VALUES ($1, $2, $3, $4)`,
        [versionId, context.tenantDb.teamId, id, hash],
      );
    }
    for (const asset of fetched.artifact.assets) {
      await client.query(
        `INSERT INTO assets
          (team_id, hash, media_type, media_class, byte_size, original_filename,
           origin, uploaded_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'registry_import', NULL)
         ON CONFLICT (team_id, hash) DO NOTHING`,
        [
          context.tenantDb.teamId,
          asset.hash,
          asset.media_type,
          asset.media_class,
          asset.byte_size,
          asset.source,
        ],
      );
      await client.query(
        `INSERT INTO asset_references
          (team_id, asset_hash, referrer_kind, referrer_id)
         VALUES ($1, $2, 'template_version', $3)`,
        [context.tenantDb.teamId, asset.hash, versionId],
      );
    }
    const event = {
      ...eventContext(auditContext, {
        id: templateId,
        name: entry.template.name,
      }),
      eventType: 'template.registry_imported',
      details: {
        versionId,
        registryEntryId: entry.id,
        registryRoot: entry.root,
      },
    } satisfies AuditEventInput;
    return {
      status: 'succeeded',
      result: { templateId, versionId, replayed: false },
      events: [event],
    };
  });
}
