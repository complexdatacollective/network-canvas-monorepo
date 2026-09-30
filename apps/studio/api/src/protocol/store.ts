import { randomUUID } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import {
  type CurrentProtocol,
  type ProtocolValidationIssue,
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  assembleProtocolSections,
  ProtocolAssemblyError,
} from '@codaco/studio-sync/protocol-document';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import {
  type SectionIssue,
  SectionValidationFailedError,
  validateSection,
  validateStageSectionIdentity,
} from '@codaco/studio-sync/section-validation';
import {
  parseSectionId,
  sectionId as makeSectionId,
} from '@codaco/studio-sync/taxonomy';

import { rowsOf } from '../audit/store.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_BUILDER_TABLES } from '../protocol-builder/schema.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import { assertNoAssetKeyValues } from '../secrets/exclusion.ts';
import { STUDY_ROLE_TABLES } from '../study/roles-schema.ts';
import { STUDY_TABLES } from '../study/schema.ts';
import type { StudyVisibility } from '../study/store.ts';
import {
  sealAssetKeys,
  stripAssetKeyValues,
  withPlaceholderAssetKeys,
} from './asset-keys.ts';
import { type ProtocolChange, diffProtocolSections } from './diff.ts';
import { insertDraftRows } from './draft-rows.ts';
import { failOnSectionValidation } from './draft-structure.ts';
import { PROTOCOL_TABLES } from './schema.ts';
import { sectionizeProtocol } from './sectionize.ts';
import { versionContentHash } from './version-hash.ts';

const { drafts, manifests, sections } = SYNC_TABLES;
const { commandLog, leases } = SYNC_TABLES;
const { protocolDrafts, protocolVersions, protocols, versionSections } =
  PROTOCOL_TABLES;
const { protocolEvents, protocolWriteReceipts } = PROTOCOL_BUILDER_TABLES;
const { studies } = STUDY_TABLES;
const { studyRoleGrants } = STUDY_ROLE_TABLES;

/**
 * A protocol line, draft or version the caller asked for and the store cannot
 * answer with: it does not exist, or it belongs to another team, which are the
 * same refusal here. A typed failure rather than a thrown error — every caller
 * turns it into a refusal of its own.
 *
 * @public
 */
export class ProtocolStoreError extends Schema.TaggedError<ProtocolStoreError>()(
  'ProtocolStoreError',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export type PublishResult =
  | {
      status: 'published';
      versionId: string;
      versionNumber: number;
      versionHash: string;
    }
  | { status: 'unchanged'; versionId: string; versionNumber: number }
  | { status: 'invalid'; issues: ProtocolValidationIssue[] }
  | { status: 'conflict'; headManifestHash: string };

export type VersionRow = {
  id: string;
  protocolId: string;
  versionNumber: number;
  label: string | null;
  versionHash: string;
  schemaVersion: number;
  migratedFromVersionId: string | null;
  publishedAt: Date;
};

export type ProtocolRow = {
  id: string;
  draftId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProtocolResult = {
  protocolId: string;
  draftId: string;
  /**
   * False when the creation identity was already in use by exactly this
   * protocol and draft — a retried import, which is a no-op rather than a
   * conflict. Always reported now: every call runs in the caller's
   * transaction, so there is no longer a shape that cannot say.
   */
  created: boolean;
};

export type CreateProtocolParams = {
  protocol: CurrentProtocol;
  protocolId?: string;
  draftId?: string /**
   * When the protocol was created, for a caller that must say so — the
   * synthetic-data seed, whose whole corpus is dated from one anchor so the
   * line exists before the studies that pin its versions. Defaults to now.
   */;
  createdAt?: Date;
};

export type EditableProtocolRow = Omit<ProtocolRow, 'draftId'> & {
  draftId: string;
};

export type DraftSections = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
  sections: Record<string, SectionDoc>;
};

/**
 * Subqueries in the predicate below are built without a database handle:
 * `reachableByCaller` is a fragment, not a statement, and the statements that
 * embed it bring their own transaction.
 */
const qb = new QueryBuilder();

/**
 * Which protocol lines the caller may reach, which is #1257's study rule and
 * not a second one: a team Admin or Owner reaches every line their team owns,
 * and anyone else reaches a line only through a study they can see. A line no
 * study references is therefore Admin/Owner-only — no grant exists that could
 * reach it — and that is why creating one is an Admin/Owner action too.
 *
 * One exported fragment, so the two statements that ask the question cannot
 * drift: `isReachableByCaller` and `listProtocols`, and
 * `__tests__/tenancy.test.ts` pins them to the same boundary row.
 *
 * It still states the study tier's own rule — `studyVisibleToCallerSql` in
 * `study/store.ts`, which is text because that tier has not been converted
 * yet. When it is, the EXISTS below is what it should export, and this file
 * should take it from there rather than keep a second copy.
 */
export const reachableByCaller = (visibility: StudyVisibility): SQL => {
  const visibleStudy = exists(
    qb
      .select({ one: sql`1` })
      .from(studyRoleGrants)
      .where(
        and(
          eq(studyRoleGrants.teamId, studies.teamId),
          eq(studyRoleGrants.studyId, studies.id),
          eq(studyRoleGrants.userId, visibility.actorUserId),
        ),
      ),
  );
  // The caller's team role as one bound boolean, exactly as `$2::boolean`
  // carried it: one statement shape whichever role is asking.
  const seesEveryStudy = sql<boolean>`${visibility.seesEveryStudy}::boolean`;
  const reachable = or(
    seesEveryStudy,
    exists(
      qb
        .select({ one: sql`1` })
        .from(studies)
        .where(
          and(
            eq(studies.teamId, protocols.teamId),
            eq(studies.protocolId, protocols.id),
            or(seesEveryStudy, visibleStudy),
          ),
        ),
    ),
  );
  if (reachable === undefined) {
    throw new Error('unreachable: `or` of two defined fragments');
  }
  return reachable;
};

// A lease-scoped command can rewrite a stage's own id, which neither assembly
// nor the canonical validator can see is out of step with its section key.
function sectionIdentityIssues(
  sectionDocs: Record<string, SectionDoc>,
): ProtocolValidationIssue[] {
  const issues: ProtocolValidationIssue[] = [];
  for (const [id, doc] of Object.entries(sectionDocs)) {
    const ref = parseSectionId(id);
    if (ref.kind !== 'stage') continue;
    const identity = validateStageSectionIdentity(ref.stageId, doc);
    if (!identity.success) {
      for (const issue of identity.issues) {
        issues.push({
          code: 'custom',
          path: [id, ...issue.path],
          message: issue.message,
        });
      }
    }
  }
  return issues;
}

/**
 * The two public assembly paths (`getDraftDocument`, `getVersionDocument`) go
 * through here, which is the #1897 exclusion check at the point a document
 * leaves the store for anything that is not a participant session or a
 * researcher preview. Neither of those exists yet; when one does, it assembles
 * and then puts the keys back, and this stays the exit every other reader
 * takes.
 *
 * Both of the things it can throw are defects rather than failures, and stay
 * so: a document that will not assemble is a draft whose own manifest is
 * inconsistent, and a key reaching here is the invariant #1897 exists for
 * having already been broken upstream. Neither is an outcome a caller can act
 * on.
 */
function assembleDocumentWithoutKeys(
  sectionDocs: Record<string, SectionDoc>,
): Record<string, unknown> {
  const document = assembleProtocolSections(sectionDocs);
  assertNoAssetKeyValues(document);
  return document;
}

function assembleOrIssues(
  sectionDocs: Record<string, SectionDoc>,
):
  | { document: Record<string, unknown>; issues?: undefined }
  | { document?: undefined; issues: ProtocolValidationIssue[] } {
  try {
    return { document: assembleProtocolSections(sectionDocs) };
  } catch (err) {
    if (err instanceof ProtocolAssemblyError) {
      return { issues: [{ code: 'custom', path: [], message: err.message }] };
    }
    throw err;
  }
}

function assertNoValidationFailures(sectionDocs: Record<string, SectionDoc>) {
  const failures: { sectionId: string; issues: SectionIssue[] }[] = [];
  for (const [id, doc] of Object.entries(sectionDocs)) {
    const result = validateSection(id, doc);
    if (!result.success) {
      failures.push({ sectionId: id, issues: result.issues });
      continue;
    }
    const ref = parseSectionId(id);
    if (ref.kind === 'stage') {
      const identity = validateStageSectionIdentity(ref.stageId, doc);
      if (!identity.success) {
        failures.push({ sectionId: id, issues: identity.issues });
      }
    }
  }
  if (failures.length > 0) throw new SectionValidationFailedError(failures);
}

/**
 * Sections are write-time validated; the document is not required to pass
 * whole-protocol validation until publish.
 *
 * Runs in the caller's transaction — the `protocols` row, the sealed keys, the
 * section rows and the draft land together or not at all — which is what the
 * `client` overload used to ask for and every caller now gets.
 */
export const createProtocol: (
  teamId: string,
  cipher: SecretsCipherApi,
  params: CreateProtocolParams,
) => Effect.Effect<
  CreateProtocolResult,
  ProtocolStoreError | SectionValidationFailedError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.createProtocol')(function* (
  teamId: string,
  cipher: SecretsCipherApi,
  params: CreateProtocolParams,
) {
  const protocolId = params.protocolId ?? randomUUID();
  const draftId = params.draftId ?? randomUUID();
  const sectionDocs = sectionizeProtocol(params.protocol);
  // While the keys are still in the document: the assets schema requires an
  // `apikey` entry to carry a non-empty value, so an import missing one is
  // refused here rather than silently becoming a protocol with a key asset
  // the store holds nothing for.
  yield* failOnSectionValidation(() => {
    assertNoValidationFailures(sectionDocs);
  });

  // The second write boundary (#1900): a whole protocol arriving at once —
  // an import, or the synthetic-data seed — carries its keys in the asset
  // manifest, and they must not reach `sections` any more than a promotion's
  // do. Stripped before the draft rows are inserted, sealed in the same
  // transaction that inserts them.
  const assetsSectionId = makeSectionId({ kind: 'assets' });
  const assets = sectionDocs[assetsSectionId];
  const strippedAssets =
    assets === undefined ? undefined : stripAssetKeyValues(assets);
  if (strippedAssets !== undefined) {
    sectionDocs[assetsSectionId] = strippedAssets.doc;
  }

  const { tx } = yield* Transaction;
  const created = params.createdAt ?? sql`now()`;
  // `.returning()` is what makes the idempotence branch below real: a write
  // without it answers with the driver's result object, typed as a row array
  // and not one, so `inserted.length === 0` would never be true and a
  // repeated creation identity would insert nothing and report success.
  const inserted = yield* tx
    .insert(protocols)
    .values({
      id: protocolId,
      teamId,
      name: params.protocol.name,
      createdAt: created,
      updatedAt: created,
    })
    .onConflictDoNothing({ target: protocols.id })
    .returning({ id: protocols.id });
  if (inserted.length === 0) {
    const existing = yield* tx
      .select({ name: protocols.name, draftId: protocolDrafts.draftId })
      .from(protocols)
      .innerJoin(
        protocolDrafts,
        and(
          eq(protocolDrafts.protocolId, protocols.id),
          eq(protocolDrafts.teamId, protocols.teamId),
        ),
      )
      .where(and(eq(protocols.id, protocolId), eq(protocols.teamId, teamId)));
    const row = existing[0];
    if (row?.name === params.protocol.name && row.draftId === draftId) {
      return { protocolId, draftId, created: false };
    }
    return yield* new ProtocolStoreError({
      reason: `protocol creation identity ${protocolId} is already in use`,
    });
  }
  if (strippedAssets !== undefined && strippedAssets.values.size > 0) {
    // After the `protocols` row the foreign key names, and before the
    // sections, so a refused creation seals nothing.
    yield* sealAssetKeys(
      cipher,
      { teamId, protocolId },
      strippedAssets.values,
      params.createdAt,
    );
  }
  yield* insertDraftRows(teamId, draftId, sectionDocs, params.createdAt);
  const draftRows = yield* tx
    .insert(protocolDrafts)
    .values({ draftId, teamId, protocolId, createdAt: created })
    .returning({ draftId: protocolDrafts.draftId });
  if (draftRows.length === 0) {
    return yield* Effect.die(
      new Error(`protocol draft ${draftId} wrote no row`),
    );
  }
  return { protocolId, draftId, created: true };
}, sqlErrorsOnlyBeside);

export const createDraftFromVersion: (
  teamId: string,
  params: { versionId: string; draftId?: string },
) => Effect.Effect<
  { draftId: string; protocolId: string },
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.createDraftFromVersion')(function* (
  teamId: string,
  params: { versionId: string; draftId?: string },
) {
  const draftId = params.draftId ?? randomUUID();
  const { tx } = yield* Transaction;
  const version = yield* tx
    .select({ protocolId: protocolVersions.protocolId })
    .from(protocolVersions)
    .where(
      and(
        eq(protocolVersions.id, params.versionId),
        eq(protocolVersions.teamId, teamId),
      ),
    );
  const versionRow = version[0];
  if (versionRow === undefined) {
    return yield* new ProtocolStoreError({
      reason: `no version ${params.versionId}`,
    });
  }
  const pins = yield* tx
    .select({ sectionId: versionSections.sectionId, doc: sections.doc })
    .from(versionSections)
    .innerJoin(
      sections,
      and(
        eq(sections.teamId, versionSections.teamId),
        eq(sections.hash, versionSections.sectionHash),
      ),
    )
    .where(
      and(
        eq(versionSections.versionId, params.versionId),
        eq(versionSections.teamId, teamId),
      ),
    );
  const sectionDocs: Record<string, SectionDoc> = {};
  for (const row of pins) {
    sectionDocs[row.sectionId] = row.doc;
  }
  yield* insertDraftRows(teamId, draftId, sectionDocs);
  const draftRows = yield* tx
    .insert(protocolDrafts)
    .values({
      draftId,
      teamId,
      protocolId: versionRow.protocolId,
      basedOnVersionId: params.versionId,
    })
    .returning({ draftId: protocolDrafts.draftId });
  if (draftRows.length === 0) {
    return yield* Effect.die(
      new Error(`protocol draft ${draftId} wrote no row`),
    );
  }
  return { draftId, protocolId: versionRow.protocolId };
}, sqlErrorsOnlyBeside);

/**
 * The head manifest and every document it names.
 *
 * Two statements where there was one correlated `jsonb_object_agg`: the head
 * row with its manifest, then the documents that manifest names. Nothing can
 * come between them — a section the head manifest names is referenced, which
 * is exactly what garbage collection refuses to sweep (the `REFERENCED`
 * predicate in `jobs/handlers/protocol-store-gc.ts` reads `manifests`) — and
 * the pair runs inside the caller's transaction.
 */
export const getDraftSections: (
  teamId: string,
  draftId: string,
) => Effect.Effect<
  DraftSections,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getDraftSections')(function* (
  teamId: string,
  draftId: string,
) {
  const { tx } = yield* Transaction;
  const heads = yield* tx
    .select({
      headSeq: drafts.headSeq,
      headManifestHash: drafts.headManifestHash,
      sectionHashes: manifests.sectionHashes,
    })
    .from(drafts)
    .innerJoin(
      manifests,
      and(
        eq(manifests.draftId, drafts.id),
        eq(manifests.teamId, drafts.teamId),
        eq(manifests.seq, drafts.headSeq),
      ),
    )
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)));
  const head = heads[0];
  if (head === undefined) {
    return yield* new ProtocolStoreError({ reason: `no draft ${draftId}` });
  }
  const hashes = [...new Set(Object.values(head.sectionHashes))];
  const docs =
    hashes.length === 0
      ? []
      : yield* tx
          .select({ hash: sections.hash, doc: sections.doc })
          .from(sections)
          .where(
            and(eq(sections.teamId, teamId), inArray(sections.hash, hashes)),
          );
  const byHash = new Map(docs.map((row) => [row.hash, row.doc]));
  const sectionDocs: Record<string, SectionDoc> = {};
  for (const [id, hash] of Object.entries(head.sectionHashes)) {
    const doc = byHash.get(hash);
    if (doc === undefined) {
      return yield* new ProtocolStoreError({
        reason: `draft ${draftId} references missing section ${hash}`,
      });
    }
    sectionDocs[id] = doc;
  }
  return {
    headSeq: head.headSeq,
    headManifestHash: head.headManifestHash,
    sectionHashes: head.sectionHashes,
    sections: sectionDocs,
  };
}, sqlErrorsOnlyBeside);

export const getDraftDocument: (
  teamId: string,
  draftId: string,
) => Effect.Effect<
  Record<string, unknown>,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getDraftDocument')(function* (
  teamId: string,
  draftId: string,
) {
  const { sections: sectionDocs } = yield* getDraftSections(teamId, draftId);
  return assembleDocumentWithoutKeys(sectionDocs);
});

export const getProtocolDraftMetadata: (
  teamId: string,
  protocolId: string,
  draftId: string,
) => Effect.Effect<
  EditableProtocolRow,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getProtocolDraftMetadata')(function* (
  teamId: string,
  protocolId: string,
  draftId: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      id: protocols.id,
      name: protocols.name,
      createdAt: protocols.createdAt,
      updatedAt: protocols.updatedAt,
    })
    .from(protocols)
    .innerJoin(
      protocolDrafts,
      and(
        eq(protocolDrafts.protocolId, protocols.id),
        eq(protocolDrafts.teamId, protocols.teamId),
      ),
    )
    .where(
      and(
        eq(protocols.id, protocolId),
        eq(protocolDrafts.draftId, draftId),
        eq(protocols.teamId, teamId),
      ),
    );
  const row = rows[0];
  if (row === undefined) {
    return yield* new ProtocolStoreError({
      reason: `no draft ${draftId} for protocol ${protocolId}`,
    });
  }
  return {
    id: row.id,
    draftId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}, sqlErrorsOnlyBeside);

export const getProtocolDraft: (
  teamId: string,
  protocolId: string,
  draftId: string,
) => Effect.Effect<
  { protocol: EditableProtocolRow; draft: DraftSections },
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getProtocolDraft')(function* (
  teamId: string,
  protocolId: string,
  draftId: string,
) {
  const protocol = yield* getProtocolDraftMetadata(teamId, protocolId, draftId);
  return { protocol, draft: yield* getDraftSections(teamId, draftId) };
});

export const validateDraft: (
  teamId: string,
  draftId: string,
) => Effect.Effect<
  { valid: true } | { valid: false; issues: ProtocolValidationIssue[] },
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.validateDraft')(function* (
  teamId: string,
  draftId: string,
) {
  const { sections: sectionDocs } = yield* getDraftSections(teamId, draftId);
  const identityIssues = sectionIdentityIssues(sectionDocs);
  if (identityIssues.length > 0) {
    return { valid: false, issues: identityIssues };
  }
  const assembled = assembleOrIssues(sectionDocs);
  if (assembled.document === undefined) {
    return { valid: false, issues: assembled.issues };
  }
  // Against a placeholder rather than the sealed keys (#1900): what the
  // canonical validator has to say about an API key is that the asset has
  // one, and decrypting a researcher's third-party credentials to answer
  // "is this protocol valid" would put them in memory for no reason.
  const result = yield* Effect.promise(() =>
    validateProtocol(
      withPlaceholderAssetKeys(assembled.document) as VersionedProtocol,
    ),
  );
  return result.success
    ? { valid: true }
    : { valid: false, issues: result.error.issues };
});

/**
 * The manifest, frozen.
 *
 * `INSERT … SELECT` over the target table is the one statement here the
 * builder cannot write: it takes `COALESCE(MAX(v.version_number), 0) + 1`
 * from `protocol_versions` itself and the manifest from a correlated
 * `(SELECT to_jsonb(m) …)`, and `to_jsonb(<alias>)` — a whole row as jsonb —
 * has no builder spelling at all. Assembling the same object in JavaScript
 * would change what is stored, since the column holds the manifest row's own
 * snake-case columns.
 *
 * It reads no timestamp or date: `published_at` is bound in, and the only
 * column it returns is `version_number`.
 *
 * A span of its own, so the raw-statement allowlist can name this statement
 * rather than the whole of `publishDraft`.
 */
const insertVersion = Effect.fn('protocol.store.insertVersion')(
  function* (params: {
    versionId: string;
    protocolId: string;
    label: string | null;
    versionHash: string;
    draftId: string;
    headSeq: bigint;
    schemaVersion: number;
    headManifestHash: string;
    migratedFrom: string | null;
    teamId: string;
    publishedAt: Date | null;
  }) {
    const { sql: client } = yield* Transaction;
    return yield* rowsOf(
      Schema.Struct({ version_number: Schema.Int }),
      client.unsafe(
        `INSERT INTO protocol_versions
           (id, protocol_id, team_id, version_number, label, version_hash,
            manifest, schema_version, source_draft_id, source_manifest_hash,
            migrated_from_version_id, published_at)
         SELECT $1, $2, $10,
                COALESCE(MAX(v.version_number), 0) + 1,
                $3, $4,
                (SELECT to_jsonb(m) FROM manifests m
                  WHERE m.draft_id = $5 AND m.team_id = $10 AND m.seq = $6),
                $7, $5, $8, $9, COALESCE($11, now())
         FROM protocol_versions v
         WHERE v.protocol_id = $2 AND v.team_id = $10
         RETURNING version_number`,
        [
          params.versionId,
          params.protocolId,
          params.label,
          params.versionHash,
          params.draftId,
          String(params.headSeq),
          params.schemaVersion,
          params.headManifestHash,
          params.migratedFrom,
          params.teamId,
          params.publishedAt,
        ],
      ),
    );
  },
);

/**
 * Validation runs before the head lock is taken; the lock then proves the
 * validated manifest is still the head, so a stale freeze is impossible.
 */
export const publishDraft: (
  teamId: string,
  params: {
    draftId: string;
    label?: string;
    expectedManifestHash?: string;
    /**
     * The id to mint the new version under, for a caller that must know it in
     * advance — the synthetic-data seed, whose ids all come from its own
     * seeded PRNG. Same role as `createProtocol`'s `protocolId`/`draftId`.
     * Ignored when the publish resolves to an existing version.
     */
    versionId?: string;
    /**
     * When the version was published, for the same caller and reason as
     * `versionId`: the seed's versions must predate the sessions that pin
     * them. Defaults to now.
     */
    publishedAt?: Date;
  },
) => Effect.Effect<
  PublishResult,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.publishDraft')(function* (
  teamId: string,
  params: {
    draftId: string;
    label?: string;
    expectedManifestHash?: string;
    versionId?: string;
    publishedAt?: Date;
  },
) {
  const head = yield* getDraftSections(teamId, params.draftId);
  if (
    params.expectedManifestHash !== undefined &&
    params.expectedManifestHash !== head.headManifestHash
  ) {
    return {
      status: 'conflict',
      headManifestHash: head.headManifestHash,
    } satisfies PublishResult;
  }
  const identityIssues = sectionIdentityIssues(head.sections);
  if (identityIssues.length > 0) {
    return {
      status: 'invalid',
      issues: identityIssues,
    } satisfies PublishResult;
  }
  const assembled = assembleOrIssues(head.sections);
  if (assembled.document === undefined) {
    return {
      status: 'invalid',
      issues: assembled.issues,
    } satisfies PublishResult;
  }
  // The same placeholder substitution `validateDraft` makes, for the same
  // reason: publication checks the protocol's shape, never the key's value.
  const validation = yield* Effect.promise(() =>
    validateProtocol(
      withPlaceholderAssetKeys(assembled.document) as VersionedProtocol,
    ),
  );
  if (!validation.success) {
    return {
      status: 'invalid',
      issues: validation.error.issues,
    } satisfies PublishResult;
  }

  const settings = head.sections[makeSectionId({ kind: 'settings' })];
  const schemaVersion = Number(settings?.schemaVersion);
  if (!Number.isInteger(schemaVersion)) {
    return yield* new ProtocolStoreError({
      reason: 'settings section carries no schemaVersion',
    });
  }
  const name = typeof settings?.name === 'string' ? settings.name : null;

  const { tx } = yield* Transaction;
  const lockedHead = yield* tx
    .select({
      headSeq: drafts.headSeq,
      headManifestHash: drafts.headManifestHash,
    })
    .from(drafts)
    .where(and(eq(drafts.id, params.draftId), eq(drafts.teamId, teamId)))
    .for('update');
  const lockedRow = lockedHead[0];
  if (lockedRow === undefined) {
    return yield* new ProtocolStoreError({
      reason: `no draft ${params.draftId}`,
    });
  }
  if (lockedRow.headManifestHash !== head.headManifestHash) {
    return {
      status: 'conflict',
      headManifestHash: lockedRow.headManifestHash,
    } satisfies PublishResult;
  }

  const draftRows = yield* tx
    .select({
      protocolId: protocolDrafts.protocolId,
      basedOnVersionId: protocolDrafts.basedOnVersionId,
    })
    .from(protocolDrafts)
    .where(
      and(
        eq(protocolDrafts.draftId, params.draftId),
        eq(protocolDrafts.teamId, teamId),
      ),
    );
  const draft = draftRows[0];
  if (draft === undefined) {
    return yield* new ProtocolStoreError({
      reason: `draft ${params.draftId} belongs to no protocol`,
    });
  }

  // The line's own lock: it serializes two publishes of one protocol, which is
  // what makes the version number below consecutive rather than colliding.
  yield* tx
    .select({ id: protocols.id })
    .from(protocols)
    .where(
      and(eq(protocols.id, draft.protocolId), eq(protocols.teamId, teamId)),
    )
    .for('update');

  const versionHash = versionContentHash(head.sectionHashes);
  const existing = yield* tx
    .select({
      id: protocolVersions.id,
      versionNumber: protocolVersions.versionNumber,
    })
    .from(protocolVersions)
    .where(
      and(
        eq(protocolVersions.protocolId, draft.protocolId),
        eq(protocolVersions.versionHash, versionHash),
        eq(protocolVersions.teamId, teamId),
      ),
    );
  const existingRow = existing[0];
  if (existingRow !== undefined) {
    return {
      status: 'unchanged',
      versionId: existingRow.id,
      versionNumber: existingRow.versionNumber,
    } satisfies PublishResult;
  }

  let migratedFrom: string | null = null;
  if (draft.basedOnVersionId !== null) {
    const basis = yield* tx
      .select({ schemaVersion: protocolVersions.schemaVersion })
      .from(protocolVersions)
      .where(
        and(
          eq(protocolVersions.id, draft.basedOnVersionId),
          eq(protocolVersions.teamId, teamId),
        ),
      );
    const basisRow = basis[0];
    if (basisRow !== undefined && basisRow.schemaVersion < schemaVersion) {
      migratedFrom = draft.basedOnVersionId;
    }
  }

  const versionId = params.versionId ?? randomUUID();
  const inserted = yield* insertVersion({
    versionId,
    protocolId: draft.protocolId,
    label: params.label ?? null,
    versionHash,
    draftId: params.draftId,
    headSeq: head.headSeq,
    schemaVersion,
    headManifestHash: head.headManifestHash,
    migratedFrom,
    teamId,
    publishedAt: params.publishedAt ?? null,
  });
  const insertedRow = inserted[0];
  if (insertedRow === undefined) {
    return yield* Effect.die(
      new Error(`publishing draft ${params.draftId} wrote no version row`),
    );
  }
  const versionNumber = insertedRow.version_number;
  const pins = Object.entries(head.sectionHashes).map(
    ([sectionId, sectionHash]) => ({
      versionId,
      teamId,
      sectionId,
      sectionHash,
    }),
  );
  if (pins.length > 0) {
    // One statement rather than one per section: no `ON CONFLICT`, and a
    // manifest cannot name a section id twice, so the multi-row insert says
    // exactly what the loop said.
    const written = yield* tx
      .insert(versionSections)
      .values(pins)
      .returning({ sectionId: versionSections.sectionId });
    if (written.length !== pins.length) {
      return yield* Effect.die(
        new Error(
          `version ${versionId} pinned ${written.length} of ${pins.length} sections`,
        ),
      );
    }
  }
  if (name !== null) {
    const renamed = yield* tx
      .update(protocols)
      .set({ name, updatedAt: params.publishedAt ?? sql`now()` })
      .where(
        and(eq(protocols.id, draft.protocolId), eq(protocols.teamId, teamId)),
      )
      .returning({ id: protocols.id });
    if (renamed.length === 0) {
      return yield* Effect.die(
        new Error(`protocol ${draft.protocolId} was not renamed`),
      );
    }
  }
  return {
    status: 'published',
    versionId,
    versionNumber,
    versionHash,
  } satisfies PublishResult;
}, sqlErrorsOnlyBeside);

export const getVersionSections: (
  teamId: string,
  versionId: string,
) => Effect.Effect<
  {
    sectionHashes: Record<string, string>;
    sections: Record<string, SectionDoc>;
  },
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getVersionSections')(function* (
  teamId: string,
  versionId: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      sectionId: versionSections.sectionId,
      sectionHash: versionSections.sectionHash,
      doc: sections.doc,
    })
    .from(versionSections)
    .innerJoin(
      sections,
      and(
        eq(sections.teamId, versionSections.teamId),
        eq(sections.hash, versionSections.sectionHash),
      ),
    )
    .where(
      and(
        eq(versionSections.versionId, versionId),
        eq(versionSections.teamId, teamId),
      ),
    );
  if (rows.length === 0) {
    return yield* new ProtocolStoreError({ reason: `no version ${versionId}` });
  }
  const sectionHashes: Record<string, string> = {};
  const sectionDocs: Record<string, SectionDoc> = {};
  for (const row of rows) {
    sectionHashes[row.sectionId] = row.sectionHash;
    sectionDocs[row.sectionId] = row.doc;
  }
  return { sectionHashes, sections: sectionDocs };
}, sqlErrorsOnlyBeside);

export const getVersionDocument: (
  teamId: string,
  versionId: string,
) => Effect.Effect<
  Record<string, unknown>,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.getVersionDocument')(function* (
  teamId: string,
  versionId: string,
) {
  const { sections: sectionDocs } = yield* getVersionSections(
    teamId,
    versionId,
  );
  return assembleDocumentWithoutKeys(sectionDocs);
});

export const listVersions: (
  teamId: string,
  protocolId: string,
) => Effect.Effect<VersionRow[], SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.listVersions',
)(function* (teamId: string, protocolId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      id: protocolVersions.id,
      protocolId: protocolVersions.protocolId,
      versionNumber: protocolVersions.versionNumber,
      label: protocolVersions.label,
      versionHash: protocolVersions.versionHash,
      schemaVersion: protocolVersions.schemaVersion,
      migratedFromVersionId: protocolVersions.migratedFromVersionId,
      publishedAt: protocolVersions.publishedAt,
    })
    .from(protocolVersions)
    .where(
      and(
        eq(protocolVersions.protocolId, protocolId),
        eq(protocolVersions.teamId, teamId),
      ),
    )
    .orderBy(desc(protocolVersions.versionNumber));
  return rows.map((row) => ({ ...row }));
}, sqlErrorsOnly);

/**
 * Whether the caller may open one protocol line at all. A boolean rather
 * than a row, because callers answer every false the same way: a line in
 * another team, a line behind a study the caller holds no grant on, and a
 * line that does not exist are one refusal, so this is no more an existence
 * oracle than `studies.get` is.
 */
export const isReachableByCaller: (
  teamId: string,
  protocolId: string,
  visibility: StudyVisibility,
) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.isReachableByCaller',
)(function* (teamId: string, protocolId: string, visibility: StudyVisibility) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ id: protocols.id })
    .from(protocols)
    .where(
      and(
        eq(protocols.teamId, teamId),
        eq(protocols.id, protocolId),
        reachableByCaller(visibility),
      ),
    );
  return rows.length === 1;
}, sqlErrorsOnly);

/**
 * The draft a protocol line is edited through — its newest, by the same
 * ordering `listProtocols` shows. The protocol-builder contract names a
 * protocol and never a draft, so the server picks one, and it must pick the
 * one the rest of the app calls current.
 */
export const latestDraftId: (
  teamId: string,
  protocolId: string,
) => Effect.Effect<string | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('protocol.store.latestDraftId')(function* (
    teamId: string,
    protocolId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ draftId: protocolDrafts.draftId })
      .from(protocolDrafts)
      .where(
        and(
          eq(protocolDrafts.protocolId, protocolId),
          eq(protocolDrafts.teamId, teamId),
        ),
      )
      .orderBy(desc(protocolDrafts.createdAt), asc(protocolDrafts.draftId))
      .limit(1);
    return rows[0]?.draftId;
  }, sqlErrorsOnly);

export const listProtocols: (
  teamId: string,
  visibility: StudyVisibility,
) => Effect.Effect<ProtocolRow[], SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.listProtocols',
)(function* (teamId: string, visibility: StudyVisibility) {
  const { tx } = yield* Transaction;
  // The line's newest draft, as `latestDraftId` picks it — correlated, so a
  // line with no draft still lists with a null one.
  const newestDraft = qb
    .select({ draftId: protocolDrafts.draftId })
    .from(protocolDrafts)
    .where(
      and(
        eq(protocolDrafts.protocolId, protocols.id),
        eq(protocolDrafts.teamId, protocols.teamId),
      ),
    )
    .orderBy(desc(protocolDrafts.createdAt), asc(protocolDrafts.draftId))
    .limit(1)
    .as('d');
  const rows = yield* tx
    .select({
      id: protocols.id,
      name: protocols.name,
      createdAt: protocols.createdAt,
      updatedAt: protocols.updatedAt,
      draftId: newestDraft.draftId,
    })
    .from(protocols)
    .leftJoinLateral(newestDraft, sql`true`)
    .where(and(eq(protocols.teamId, teamId), reachableByCaller(visibility)))
    .orderBy(desc(protocols.createdAt), asc(protocols.id));
  return rows.map((row) => ({
    id: row.id,
    draftId: row.draftId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}, sqlErrorsOnly);

export const diffVersions: (
  teamId: string,
  versionIdA: string,
  versionIdB: string,
) => Effect.Effect<
  ProtocolChange[],
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.diffVersions')(function* (
  teamId: string,
  versionIdA: string,
  versionIdB: string,
) {
  const a = yield* getVersionSections(teamId, versionIdA);
  const b = yield* getVersionSections(teamId, versionIdB);
  const byHash = new Map<string, SectionDoc>();
  for (const side of [a, b]) {
    for (const [id, doc] of Object.entries(side.sections)) {
      const hash = side.sectionHashes[id];
      if (hash !== undefined) byHash.set(hash, doc);
    }
  }
  return diffProtocolSections(a.sectionHashes, b.sectionHashes, (hash) => {
    const doc = byHash.get(hash);
    if (doc === undefined) {
      throw new ProtocolStoreError({
        reason: `no section ${hash} in either version`,
      });
    }
    return doc;
  });
});

/** Section documents are left for garbage collection. */
export const discardDraft: (
  teamId: string,
  draftId: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.discardDraft',
)(function* (teamId: string, draftId: string) {
  const { tx } = yield* Transaction;
  yield* tx
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
    .for('update');
  yield* tx
    .delete(leases)
    .where(and(eq(leases.draftId, draftId), eq(leases.teamId, teamId)))
    .returning({ sectionId: leases.sectionId });
  yield* tx
    .delete(commandLog)
    .where(and(eq(commandLog.draftId, draftId), eq(commandLog.teamId, teamId)))
    .returning({ id: commandLog.id });
  // Before the draft row, which the log's foreign key names. Replay is
  // meaningful only while the draft it describes exists, and so is the
  // receipt that tells a retried write what it already committed.
  yield* tx
    .delete(protocolEvents)
    .where(
      and(
        eq(protocolEvents.draftId, draftId),
        eq(protocolEvents.teamId, teamId),
      ),
    )
    .returning({ cursor: protocolEvents.cursor });
  yield* tx
    .delete(protocolWriteReceipts)
    .where(
      and(
        eq(protocolWriteReceipts.draftId, draftId),
        eq(protocolWriteReceipts.teamId, teamId),
      ),
    )
    .returning({ requestId: protocolWriteReceipts.requestId });
  yield* tx
    .delete(protocolDrafts)
    .where(
      and(
        eq(protocolDrafts.draftId, draftId),
        eq(protocolDrafts.teamId, teamId),
      ),
    )
    .returning({ draftId: protocolDrafts.draftId });
  yield* tx
    .delete(manifests)
    .where(and(eq(manifests.draftId, draftId), eq(manifests.teamId, teamId)))
    .returning({ seq: manifests.seq });
  // Discarding a draft that is not there is not an error — a repeated discard
  // is the same request twice — so the rows are not inspected. `.returning()`
  // all the same: the builder's answer without it is the driver's result
  // object, typed as a row array and not one.
  yield* tx
    .delete(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
    .returning({ id: drafts.id });
}, sqlErrorsOnly);
