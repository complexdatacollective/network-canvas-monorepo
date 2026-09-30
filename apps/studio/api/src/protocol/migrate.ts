import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import {
  CURRENT_SCHEMA_VERSION,
  migrateProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { sqlErrorsOnlyBeside } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { stripAssetKeyValues, withPlaceholderAssetKeys } from './asset-keys.ts';
import { insertDraftRows } from './draft-rows.ts';
import { PROTOCOL_TABLES } from './schema.ts';
import { sectionizeProtocol } from './sectionize.ts';

const { sections } = SYNC_TABLES;
const { protocolDrafts, protocolVersions, protocols, versionSections } =
  PROTOCOL_TABLES;

/** @public */
export class MigrationTargetError extends Schema.TaggedError<MigrationTargetError>()(
  'MigrationTargetError',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

// The version row is never touched, so as-fielded provenance and hashes
// survive. The name is a migration dependency: v7 documents had no name field.
export const migrateStoredVersionToDraft: (
  teamId: string,
  params: { versionId: string; draftId?: string },
) => Effect.Effect<
  {
    draftId: string;
    protocolId: string;
    fromSchemaVersion: number;
    toSchemaVersion: number;
  },
  MigrationTargetError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.store.migrateStoredVersionToDraft')(function* (
  teamId: string,
  params: { versionId: string; draftId?: string },
) {
  const draftId = params.draftId ?? randomUUID();
  const { tx } = yield* Transaction;

  const version = yield* tx
    .select({
      protocolId: protocolVersions.protocolId,
      schemaVersion: protocolVersions.schemaVersion,
      name: protocols.name,
    })
    .from(protocolVersions)
    .innerJoin(
      protocols,
      and(
        eq(protocols.id, protocolVersions.protocolId),
        eq(protocols.teamId, protocolVersions.teamId),
      ),
    )
    .where(
      and(
        eq(protocolVersions.id, params.versionId),
        eq(protocolVersions.teamId, teamId),
      ),
    );
  const versionRow = version[0];
  if (versionRow === undefined) {
    return yield* new MigrationTargetError({
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
  const storedSections: Record<string, SectionDoc> = {};
  for (const row of pins) {
    storedSections[row.sectionId] = row.doc;
  }

  const document = assembleProtocolSections(storedSections);
  const settings = storedSections[sectionId({ kind: 'settings' })];
  const name =
    typeof settings?.name === 'string' && settings.name !== ''
      ? settings.name
      : versionRow.name;
  // `migrateProtocol` validates its input against the stored version's schema
  // and its output against the current one, and both require an `apikey`
  // asset's `value` — which a stored, redacted document never carries (#1900).
  // So the placeholder goes in for the migration and comes straight back out
  // before anything is written.
  const migrated = migrateProtocol(
    withPlaceholderAssetKeys(document),
    CURRENT_SCHEMA_VERSION,
    { name },
  );
  const migratedSections = sectionizeProtocol(migrated);
  // Every apikey value present here is one this function put there a moment
  // ago: the input came out of `sections`, where a key value never is. The
  // stripped values are therefore placeholders and are dropped — the real keys
  // stay sealed in `protocol_asset_keys`, which the new draft reaches under
  // the same team, protocol and asset ids (no migration rekeys the manifest).
  const assetsSectionId = sectionId({ kind: 'assets' });
  const migratedAssets = migratedSections[assetsSectionId];
  if (migratedAssets !== undefined) {
    migratedSections[assetsSectionId] = stripAssetKeyValues(migratedAssets).doc;
  }

  yield* insertDraftRows(teamId, draftId, migratedSections);
  const draftRows = yield* tx
    .insert(protocolDrafts)
    .values({
      draftId,
      teamId,
      protocolId: versionRow.protocolId,
      basedOnVersionId: params.versionId,
    })
    // `.returning()`: without it the builder answers with the driver's result
    // object, typed as a row array and not one, so this check would never fire.
    .returning({ draftId: protocolDrafts.draftId });
  if (draftRows.length === 0) {
    return yield* Effect.die(
      new Error(`protocol draft ${draftId} wrote no row`),
    );
  }

  return {
    draftId,
    protocolId: versionRow.protocolId,
    fromSchemaVersion: versionRow.schemaVersion,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
  };
}, sqlErrorsOnlyBeside);
