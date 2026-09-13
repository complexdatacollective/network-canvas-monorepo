import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { InferContractRouterOutputs } from '@orpc/contract';
import type pg from 'pg';

import type { contract } from '@codaco/studio-rpc';
import { manifestHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  createTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
  TemplateArtifactManifestSchema,
  type TemplateArtifactInput,
  type VerifiedTemplateArtifact,
} from '@codaco/studio-sync/template-exchange';
import { TemplateMetadataSchema } from '@codaco/studio-sync/template-metadata';
import {
  assertRegistryEntryArtifact,
  TemplateRegistryClient,
  TemplateRegistryClientError,
  type FetchedRegistryArtifact,
} from '@codaco/studio-sync/template-registry-client';
import type { RegistryEntry } from '@codaco/studio-sync/template-registry-contract';
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
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
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

export type RegistryConfig = {
  origin: string;
  assetStore: AssetStore;
  maintenancePool?: pg.Pool;
  client?: TemplateRegistryClient;
};

// Reconciliation must remain active when an operator removes Registry/storage configuration.
type ReconciliationConfig = Omit<RegistryConfig, 'origin' | 'assetStore'> & {
  origin?: string;
  assetStore?: AssetStore;
};

type Publisher = { id: string; name: string; orcid: string | null };
type RegistryEntryIdentity = Pick<
  RegistryEntry,
  'id' | 'root' | 'template' | 'metadata' | 'license' | 'published_at'
> & { publisher: Pick<RegistryEntry['publisher'], 'id'> };
type Publication = {
  entryId: string;
  registryUrl: string;
  root: string;
  publisher: Publisher;
  publishedAt: Date;
};

const teamStore = new TeamStore();

function registryEntryIdentity(entry: RegistryEntry): RegistryEntryIdentity {
  return {
    id: entry.id,
    root: entry.root,
    publisher: { id: entry.publisher.id },
    template: entry.template,
    metadata: entry.metadata,
    license: entry.license,
    published_at: entry.published_at,
  };
}

function clientFor(
  config: Pick<RegistryConfig, 'origin' | 'client'>,
): TemplateRegistryClient {
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
    registry_origin: unknown;
  }>(
    `SELECT t.id AS template_id, t.name, t.kind, t.summary, t.license,
            t.metadata, v.version_number, v.manifest, v.registry_origin
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
  // Imported filenames belong to this version's immutable verified manifest,
  // while the team asset table deduplicates bytes across unrelated filenames.
  // Retained completed intents preserve every source alias, even after recovery.
  let versionAssets = assetRows.rows;
  if (row.registry_origin !== null) {
    const imported = await client.query<{ asset_manifest: unknown }>(
      `SELECT asset_manifest FROM template_registry_import_intents
       WHERE team_id=$1 AND target_version_id=$2 AND completed_at IS NOT NULL`,
      [teamId, versionId],
    );
    const parsed = TemplateArtifactManifestSchema.shape.assets.safeParse(
      imported.rows[0]?.asset_manifest,
    );
    if (!parsed.success)
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
    const sources = new Set<string>();
    versionAssets = parsed.data.map((reference) => {
      const stored = assetRows.rows.find(
        (asset) => asset.hash === reference.hash,
      );
      if (
        !stored ||
        sources.has(reference.source) ||
        stored.media_type !== reference.media_type ||
        stored.media_class !== reference.media_class ||
        Number(stored.byte_size) !== reference.byte_size
      )
        throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
      sources.add(reference.source);
      return { ...stored, original_filename: reference.source };
    });
  }
  if (versionAssets.length > TEMPLATE_ARTIFACT_LIMITS.assets)
    throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
  let assetBytes = 0;
  const boundedAssets: Array<
    Omit<(typeof assetRows.rows)[number], 'byte_size'> & { byte_size: number }
  > = [];
  for (const asset of versionAssets) {
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

export async function readRegistryIntentStatuses(
  context: AuditedCommandContext,
  intents: readonly { id: string; kind: 'publication' | 'import' }[],
) {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'templates.registryIntents',
    async (client) => {
      await requireLockedAdministrator(client, context);
      const rows = await client.query<{
        id: string;
        kind: 'publication' | 'import';
        status: 'pending' | 'completed' | 'quarantined';
      }>(
        `SELECT id, 'publication' AS kind,
         CASE WHEN completed_at IS NOT NULL THEN 'completed' WHEN quarantined_at IS NOT NULL THEN 'quarantined' ELSE 'pending' END AS status
       FROM template_registry_publication_intents WHERE team_id=$1 AND id=ANY($2::uuid[])
       UNION ALL
       SELECT id, 'import' AS kind,
         CASE WHEN completed_at IS NOT NULL THEN 'completed' WHEN quarantined_at IS NOT NULL THEN 'quarantined' ELSE 'pending' END AS status
       FROM template_registry_import_intents WHERE team_id=$1 AND id=ANY($3::uuid[])`,
        [
          context.tenantDb.teamId,
          intents
            .filter((intent) => intent.kind === 'publication')
            .map((intent) => intent.id),
          intents
            .filter((intent) => intent.kind === 'import')
            .map((intent) => intent.id),
        ],
      );
      return intents.map((intent) => ({
        ...intent,
        status:
          rows.rows.find(
            (row) => row.id === intent.id && row.kind === intent.kind,
          )?.status ?? ('unavailable' as const),
      }));
    },
  );
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
  type Summary = InferContractRouterOutputs<
    typeof contract
  >['templates']['list'][number];
  const rows: (Omit<Summary, 'publications'> & {
    publications: (Omit<Publication, 'publishedAt'> & {
      publishedAt: string;
    })[];
  })[] = result.rows;
  return rows.map((row) => ({
    ...row,
    // PostgreSQL decodes top-level timestamptz into Date, but JSON aggregates into strings.
    publications: row.publications.map((publication) => ({
      ...publication,
      publishedAt: new Date(publication.publishedAt),
    })),
  }));
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
      const receipt = await client.query<{
        registry_entry_id: string;
        registry_root: string;
        publisher_id: string;
        publisher_name: string;
        publisher_orcid: string | null;
        published_at: Date;
      }>(
        `SELECT registry_entry_id,registry_root,publisher_id,publisher_name,
                publisher_orcid,published_at
         FROM template_registry_publications
         WHERE team_id=$1 AND template_version_id=$2 AND registry_url=$3`,
        [claim.teamId, row.template_version_id, row.registry_url],
      );
      const recorded = receipt.rows[0];
      if (
        !recorded ||
        recorded.registry_entry_id !== entry.id ||
        recorded.registry_root !== entry.root ||
        recorded.publisher_id !== entry.publisher.id
      )
        throw new TemplateRegistryCommandError('PUBLISHER_MISMATCH');
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
          entryId: recorded.registry_entry_id,
          registryUrl: row.registry_url,
          root: recorded.registry_root,
          publisher: {
            id: recorded.publisher_id,
            name: recorded.publisher_name,
            orcid: recorded.publisher_orcid,
          },
          publishedAt: recorded.published_at,
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
    if (!entry) {
      try {
        entry = await registry.publish(
          prepared.artifact.bytes,
          input.credential,
        );
      } catch (handoffError) {
        if (
          handoffError instanceof TemplateRegistryClientError &&
          handoffError.code === 'TEMPLATE_REGISTRY_PUBLICATION_REJECTED'
        ) {
          await quarantineRegistryIntent(
            config.maintenancePool,
            claim,
            'publication_rejected',
          );
          throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
        }
        entry = await registry.findEntry(
          prepared.artifact.artifact.manifest.merkle_root,
          prepared.publisher.id,
        );
        if (!entry) {
          await deferTemplateRegistryIntent(
            config.maintenancePool,
            claim,
            5_000,
          );
          if (handoffError instanceof TemplateRegistryClientError)
            return { status: 'pending', intentId: prepared.intentId };
          throw handoffError;
        }
      }
    }
    const publication = await finalizePublicationIntent(
      config.maintenancePool,
      claim,
      entry,
    );
    return { status: 'completed', publication, replayed: false };
  } catch (error) {
    await deferTemplateRegistryIntent(config.maintenancePool, claim, 5_000);
    if (error instanceof TemplateRegistryCommandError) throw error;
    return { status: 'pending', intentId: prepared.intentId };
  }
}

type ImportResult =
  | {
      status: 'completed';
      templateId: string;
      versionId: string;
      replayed: boolean;
    }
  | {
      status: 'pending';
      intentId: string;
      templateId: string;
      versionId: string;
    };

type PreparedImport = {
  intentId: string;
  templateId: string;
  versionId: string;
  entry: RegistryEntry;
  fetched: FetchedRegistryArtifact;
};

function assetManifest(artifact: VerifiedTemplateArtifact) {
  return artifact.assets.map(
    ({ hash, media_type, media_class, byte_size, source }) => ({
      hash,
      media_type,
      media_class,
      byte_size,
      source,
    }),
  );
}

async function uploadImportAssets(
  store: AssetStore,
  fetched: FetchedRegistryArtifact,
  pool: pg.Pool,
  claim: ClaimedTemplateRegistryIntent,
) {
  for (const asset of fetched.artifact.assets) {
    const owned = await pool.query(
      `SELECT 1 FROM template_registry_import_intents
       WHERE id=$1 AND team_id=$2 AND lease_owner=$3
         AND lease_expires_at > clock_timestamp()
         AND completed_at IS NULL AND quarantined_at IS NULL`,
      [claim.id, claim.teamId, claim.leaseOwner],
    );
    if (owned.rowCount !== 1)
      throw new Error('Registry import intent lease is not owned');
    const stored = await store.put(asset.bytes, asset.media_type);
    if (
      stored.hash !== asset.hash ||
      stored.size !== asset.byte_size ||
      stored.mediaType !== asset.media_type
    )
      throw new TemplateRegistryCommandError('STORAGE_UNAVAILABLE');
  }
}

async function finalizeImportIntent(
  pool: pg.Pool,
  claim: ClaimedTemplateRegistryIntent,
  entry: RegistryEntry,
  fetched: FetchedRegistryArtifact,
): Promise<{ templateId: string; versionId: string }> {
  return await runAuditedSystemMutation(
    {
      tenantDb: createTenantDb(pool, claim.teamId),
      actorLabel: 'Template Registry reconciliation',
      requestId: claim.id,
    },
    async (client, auditContext) => {
      const found = await client.query<{
        registry_url: string;
        registry_entry_id: string;
        registry_root: string;
        entry_snapshot: RegistryEntry;
        asset_manifest: ReturnType<typeof assetManifest>;
        target_template_id: string;
        target_version_id: string;
        initiating_actor_id: string;
        initiating_actor_label: string;
        initiating_request_id: string;
      }>(
        `SELECT registry_url, registry_entry_id, registry_root, entry_snapshot,
      asset_manifest, target_template_id, target_version_id,
      initiating_actor_id, initiating_actor_label, initiating_request_id
      FROM template_registry_import_intents
      WHERE id=$1 AND team_id=$2 AND lease_owner=$3
        AND lease_expires_at > clock_timestamp()
        AND completed_at IS NULL AND quarantined_at IS NULL FOR UPDATE`,
        [claim.id, claim.teamId, claim.leaseOwner],
      );
      const row = found.rows[0];
      if (!row) throw new Error('Registry import intent lease is not owned');
      if (
        row.registry_entry_id !== entry.id ||
        row.registry_root !== entry.root ||
        !isDeepStrictEqual(
          registryEntryIdentity(row.entry_snapshot),
          registryEntryIdentity(entry),
        ) ||
        !isDeepStrictEqual(row.asset_manifest, assetManifest(fetched.artifact))
      )
        throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
      const manifest = Object.fromEntries(
        fetched.artifact.manifest.sections.map(({ id, hash }) => [id, hash]),
      );
      await client.query(
        `INSERT INTO templates
      (id,team_id,kind,name,summary,license,state,metadata,author_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,'published',$7,$8) ON CONFLICT (id) DO NOTHING`,
        [
          row.target_template_id,
          claim.teamId,
          entry.template.kind,
          entry.template.name,
          entry.template.summary ?? null,
          entry.license,
          fetched.artifact.metadata,
          row.initiating_actor_id,
        ],
      );
      await client.query(
        `INSERT INTO template_versions
      (id,team_id,template_id,version_number,manifest,manifest_hash,schema_version,
       published_at,registry_origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
        [
          row.target_version_id,
          claim.teamId,
          row.target_template_id,
          entry.template.version,
          manifest,
          manifestHash(manifest, null),
          fetched.artifact.manifest.protocol_schema_version,
          new Date(entry.published_at),
          {
            registry_url: row.registry_url,
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
          `INSERT INTO sections (team_id,hash,doc) VALUES ($1,$2,$3)
        ON CONFLICT (team_id,hash) DO NOTHING`,
          [claim.teamId, hash, doc],
        );
        await client.query(
          `INSERT INTO template_version_sections
        (version_id,team_id,section_id,section_hash) VALUES ($1,$2,$3,$4)
        ON CONFLICT (version_id,section_id) DO NOTHING`,
          [row.target_version_id, claim.teamId, id, hash],
        );
      }
      for (const asset of fetched.artifact.assets) {
        await client.query(
          `INSERT INTO assets
        (team_id,hash,media_type,media_class,byte_size,original_filename,origin,
         uploaded_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,'registry_import',NULL)
        ON CONFLICT (team_id,hash) DO NOTHING`,
          [
            claim.teamId,
            asset.hash,
            asset.media_type,
            asset.media_class,
            asset.byte_size,
            asset.source,
          ],
        );
        await client.query(
          `INSERT INTO asset_references
        (team_id,asset_hash,referrer_kind,referrer_id)
        VALUES ($1,$2,'template_version',$3) ON CONFLICT DO NOTHING`,
          [claim.teamId, asset.hash, row.target_version_id],
        );
      }
      const completed = await client.query(
        `UPDATE template_registry_import_intents
      SET completed_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL
      WHERE id=$1 AND team_id=$2 AND lease_owner=$3 AND completed_at IS NULL
        AND quarantined_at IS NULL`,
        [claim.id, claim.teamId, claim.leaseOwner],
      );
      if (completed.rowCount !== 1)
        throw new Error('Registry import intent lease was lost');
      const event = {
        ...auditContext,
        eventVersion: 2,
        eventType: 'template.registry_imported',
        category: 'integration',
        outcome: 'succeeded',
        subjectType: null,
        subjectId: null,
        subjectLabel: null,
        resourceType: 'template',
        resourceId: row.target_template_id,
        resourceLabel: entry.template.name.slice(0, 320),
        details: {
          versionId: row.target_version_id,
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
          templateId: row.target_template_id,
          versionId: row.target_version_id,
        },
        events: [event],
      };
    },
  );
}

export async function importRegistryTemplate(
  context: AuditedCommandContext,
  config: RegistryConfig,
  entryId: string,
): Promise<ImportResult> {
  if (!config.maintenancePool)
    throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
  const prepared = await runAuditedCommand<
    | PreparedImport
    | {
        replay: { templateId: string; versionId: string };
      }
  >(context, async (client, auditContext) => {
    await requireLockedAdministrator(client, context);
    const replay = await client.query<{ template_id: string; id: string }>(
      `SELECT template_id,id FROM template_versions WHERE team_id=$1
         AND registry_origin->>'registry_url'=$2 AND registry_origin->>'entry_id'=$3`,
      [context.tenantDb.teamId, config.origin, entryId],
    );
    if (replay.rows[0])
      return {
        status: 'unchanged',
        result: {
          replay: {
            templateId: replay.rows[0].template_id,
            versionId: replay.rows[0].id,
          },
        },
      };
    const registry = clientFor(config);
    let entry: RegistryEntry;
    let fetched: FetchedRegistryArtifact;
    try {
      entry = await registry.entry(entryId);
      fetched = await registry.fetchArtifact(entry.root);
      assertRegistryEntryArtifact(entry, fetched.artifact);
    } catch (error) {
      return translateRegistryError(error);
    }
    if (entry.id !== entryId || fetched.root !== entry.root)
      throw new TemplateRegistryCommandError('NOT_FOUND');
    const prior = await client.query<{
      id: string;
      target_template_id: string;
      target_version_id: string;
      registry_root: string;
    }>(
      `SELECT id,
        target_template_id,target_version_id,registry_root FROM template_registry_import_intents
        WHERE team_id=$1 AND registry_url=$2 AND registry_entry_id=$3
          AND completed_at IS NULL AND quarantined_at IS NULL FOR UPDATE`,
      [context.tenantDb.teamId, config.origin, entryId],
    );
    const intentId = prior.rows[0]?.id ?? randomUUID();
    const templateId = prior.rows[0]?.target_template_id ?? randomUUID();
    const versionId = prior.rows[0]?.target_version_id ?? randomUUID();
    if (prior.rows[0] && prior.rows[0].registry_root !== entry.root)
      throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
    if (!prior.rows[0])
      await client.query(
        `INSERT INTO template_registry_import_intents
        (id,team_id,registry_url,registry_entry_id,registry_root,entry_snapshot,
         asset_manifest,target_template_id,target_version_id,initiating_actor_id,
         initiating_actor_label,initiating_request_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          intentId,
          context.tenantDb.teamId,
          config.origin,
          entry.id,
          entry.root,
          entry,
          JSON.stringify(assetManifest(fetched.artifact)),
          templateId,
          versionId,
          auditActorEventContext(auditContext).actorId,
          auditActorEventContext(auditContext).actorLabel,
          auditContext.requestId,
        ],
      );
    if (prior.rows[0])
      return {
        status: 'unchanged',
        result: {
          intentId,
          templateId,
          versionId,
          entry,
          fetched,
        },
      };
    const event = {
      ...eventContext(auditContext, {
        id: templateId,
        name: entry.template.name,
      }),
      eventType: 'template.registry_import_requested',
      details: {
        intentId,
        registryEntryId: entry.id,
        registryRoot: entry.root,
      },
    } satisfies AuditEventInput;
    return {
      status: 'succeeded',
      result: { intentId, templateId, versionId, entry, fetched },
      events: [event],
    };
  });
  if ('replay' in prepared)
    return { status: 'completed', ...prepared.replay, replayed: true };
  const claim = await claimSpecificTemplateRegistryIntent(
    config.maintenancePool,
    'import',
    prepared.intentId,
  );
  if (!claim)
    return {
      status: 'pending',
      intentId: prepared.intentId,
      templateId: prepared.templateId,
      versionId: prepared.versionId,
    };
  try {
    await uploadImportAssets(
      config.assetStore,
      prepared.fetched,
      config.maintenancePool,
      claim,
    );
    const result = await finalizeImportIntent(
      config.maintenancePool,
      claim,
      prepared.entry,
      prepared.fetched,
    );
    return { status: 'completed', ...result, replayed: false };
  } catch (error) {
    await deferTemplateRegistryIntent(config.maintenancePool, claim, 5_000);
    if (error instanceof TemplateRegistryCommandError) throw error;
    return {
      status: 'pending',
      intentId: prepared.intentId,
      templateId: prepared.templateId,
      versionId: prepared.versionId,
    };
  }
}

async function quarantineRegistryIntent(
  pool: pg.Pool,
  claim: ClaimedTemplateRegistryIntent,
  reason: 'publication_rejected' | 'registry_changed' | 'resource_unavailable',
): Promise<void> {
  const table =
    claim.kind === 'publication'
      ? 'template_registry_publication_intents'
      : 'template_registry_import_intents';
  await runAuditedSystemMutation(
    {
      tenantDb: createTenantDb(pool, claim.teamId),
      actorLabel: 'Template Registry reconciliation',
      requestId: claim.id,
    },
    async (client, auditContext) => {
      const updated = await client.query(
        `UPDATE ${table} SET quarantined_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL
         WHERE id=$1 AND team_id=$2 AND lease_owner=$3 AND lease_expires_at>clock_timestamp()
           AND completed_at IS NULL AND quarantined_at IS NULL`,
        [claim.id, claim.teamId, claim.leaseOwner],
      );
      if (updated.rowCount !== 1)
        throw new Error('Registry intent lease is not owned');
      return {
        status: 'succeeded',
        result: undefined,
        events: [
          {
            ...auditContext,
            eventVersion: 1,
            eventType: 'template.registry_intent_quarantined',
            category: 'integration',
            outcome: 'succeeded',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            resourceType: 'template_registry_intent',
            resourceId: claim.id,
            resourceLabel: null,
            details: { kind: claim.kind, reason },
          },
        ],
      };
    },
  );
}

export async function reconcileClaimedTemplateRegistryIntent(
  config: ReconciliationConfig,
  claim: ClaimedTemplateRegistryIntent,
): Promise<'completed' | 'deferred' | 'quarantined'> {
  if (!config.maintenancePool)
    throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
  if (!config.origin) {
    await quarantineRegistryIntent(
      config.maintenancePool,
      claim,
      'registry_changed',
    );
    return 'quarantined';
  }
  if (claim.kind === 'publication') {
    const found = await config.maintenancePool.query<{
      registry_root: string;
      registry_url: string;
      publisher_id: string;
    }>(
      `SELECT registry_root,registry_url,publisher_id
      FROM template_registry_publication_intents
      WHERE id=$1 AND team_id=$2 AND lease_owner=$3
        AND completed_at IS NULL AND quarantined_at IS NULL`,
      [claim.id, claim.teamId, claim.leaseOwner],
    );
    const intent = found.rows[0];
    if (!intent)
      throw new Error('Registry publication intent lease is not owned');
    if (intent.registry_url !== config.origin) {
      await quarantineRegistryIntent(
        config.maintenancePool,
        claim,
        'registry_changed',
      );
      return 'quarantined';
    }
    const registry = clientFor({
      origin: config.origin,
      client: config.client,
    });
    const entry = await registry.findEntry(
      intent.registry_root,
      intent.publisher_id,
    );
    if (!entry) return 'deferred';
    await finalizePublicationIntent(config.maintenancePool, claim, entry);
    return 'completed';
  }
  const found = await config.maintenancePool.query<{
    registry_url: string;
    registry_entry_id: string;
    registry_root: string;
    entry_snapshot: RegistryEntry;
  }>(
    `SELECT registry_url,registry_entry_id,registry_root,entry_snapshot
    FROM template_registry_import_intents
    WHERE id=$1 AND team_id=$2 AND lease_owner=$3
      AND completed_at IS NULL AND quarantined_at IS NULL`,
    [claim.id, claim.teamId, claim.leaseOwner],
  );
  const intent = found.rows[0];
  if (!intent) throw new Error('Registry import intent lease is not owned');
  if (intent.registry_url !== config.origin) {
    await quarantineRegistryIntent(
      config.maintenancePool,
      claim,
      'registry_changed',
    );
    return 'quarantined';
  }
  if (!config.assetStore) return 'deferred';
  const registry = clientFor({ origin: config.origin, client: config.client });
  try {
    const entry = await registry.entry(intent.registry_entry_id);
    const fetched = await registry.fetchArtifact(intent.registry_root);
    assertRegistryEntryArtifact(entry, fetched.artifact);
    if (
      !isDeepStrictEqual(
        registryEntryIdentity(entry),
        registryEntryIdentity(intent.entry_snapshot),
      ) ||
      fetched.root !== intent.registry_root
    )
      throw new TemplateRegistryCommandError('REGISTRY_UNAVAILABLE');
    await uploadImportAssets(
      config.assetStore,
      fetched,
      config.maintenancePool,
      claim,
    );
    await finalizeImportIntent(config.maintenancePool, claim, entry, fetched);
    return 'completed';
  } catch (error) {
    if (
      error instanceof TemplateRegistryClientError &&
      error.code === 'TEMPLATE_REGISTRY_RESOURCE_UNAVAILABLE'
    ) {
      await quarantineRegistryIntent(
        config.maintenancePool,
        claim,
        'resource_unavailable',
      );
      return 'quarantined';
    }
    throw error;
  }
}
