// Platform-migration lifecycle (#1276): a stored version at an older schema
// version becomes a NEW draft at the current schema — the version row and its
// verbatim manifest are never touched, so as-fielded provenance and hashes
// survive upgrades by construction. The sole migrator is
// @codaco/protocol-validation's existing chain. Publishing the resulting
// draft records migrated_from_version_id (see ProtocolStore.publishDraft);
// there is deliberately no auto-publish.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  CURRENT_SCHEMA_VERSION,
  migrateProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { assembleProtocol } from './assemble.ts';
import { insertDraftRows } from './draft-rows.ts';
import { sectionizeProtocol } from './sectionize.ts';
import { sectionId } from './taxonomy.ts';

export class MigrationTargetError extends Error {}

/**
 * Assembles a stored version exactly as fielded, migrates it to the current
 * schema version, re-sections the result, and seeds a new draft branched
 * from the version. The v7→v8 step takes the protocol name as a migration
 * dependency (v7 documents had no name field); the store's settings section
 * has always carried it.
 */
export async function migrateStoredVersionToDraft(
  db: pg.Pool,
  params: { versionId: string; draftId?: string },
): Promise<{
  draftId: string;
  protocolId: string;
  fromSchemaVersion: number;
  toSchemaVersion: number;
}> {
  const draftId = params.draftId ?? randomUUID();

  const version = await db.query(
    `SELECT protocol_id, schema_version FROM protocol_versions WHERE id = $1`,
    [params.versionId],
  );
  const versionRow = version.rows[0] as
    | { protocol_id: string; schema_version: number }
    | undefined;
  if (versionRow === undefined) {
    throw new MigrationTargetError(`no version ${params.versionId}`);
  }

  const pins = await db.query(
    `SELECT vs.section_id, s.doc
     FROM version_sections vs JOIN sections s ON s.hash = vs.section_hash
     WHERE vs.version_id = $1`,
    [params.versionId],
  );
  const sections: Record<string, SectionDoc> = {};
  for (const row of pins.rows as { section_id: string; doc: SectionDoc }[]) {
    sections[row.section_id] = row.doc;
  }

  const document = assembleProtocol(sections);
  const settings = sections[sectionId({ kind: 'settings' })];
  const name = typeof settings?.name === 'string' ? settings.name : '';
  const migrated = migrateProtocol(document, CURRENT_SCHEMA_VERSION, { name });
  const migratedSections = sectionizeProtocol(migrated);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await insertDraftRows(client, draftId, migratedSections);
    await client.query(
      `INSERT INTO protocol_drafts (draft_id, protocol_id, based_on_version_id)
       VALUES ($1, $2, $3)`,
      [draftId, versionRow.protocol_id, params.versionId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    draftId,
    protocolId: versionRow.protocol_id,
    fromSchemaVersion: versionRow.schema_version,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
