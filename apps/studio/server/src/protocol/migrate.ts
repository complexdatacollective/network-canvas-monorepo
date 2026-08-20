import { randomUUID } from 'node:crypto';

import {
  CURRENT_SCHEMA_VERSION,
  migrateProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { assembleProtocol } from './assemble.ts';
import { insertDraftRows } from './draft-rows.ts';
import { sectionizeProtocol } from './sectionize.ts';
import { sectionId } from './taxonomy.ts';

/** @public */
export class MigrationTargetError extends Error {}

// The version row is never touched, so as-fielded provenance and hashes
// survive. The name is a migration dependency: v7 documents had no name field.
export async function migrateStoredVersionToDraft(
  db: TenantDb,
  params: { versionId: string; draftId?: string },
): Promise<{
  draftId: string;
  protocolId: string;
  fromSchemaVersion: number;
  toSchemaVersion: number;
}> {
  const draftId = params.draftId ?? randomUUID();
  const workspaceId = db.workspaceId;

  const version = await db.query(
    `SELECT v.protocol_id, v.schema_version, p.name
     FROM protocol_versions v
     JOIN protocols p ON p.id = v.protocol_id AND p.workspace_id = v.workspace_id
     WHERE v.id = $1 AND v.workspace_id = $2`,
    [params.versionId, workspaceId],
  );
  const versionRow = version.rows[0] as
    | { protocol_id: string; schema_version: number; name: string }
    | undefined;
  if (versionRow === undefined) {
    throw new MigrationTargetError(`no version ${params.versionId}`);
  }

  const pins = await db.query(
    `SELECT vs.section_id, s.doc
     FROM version_sections vs
     JOIN sections s ON s.workspace_id = vs.workspace_id AND s.hash = vs.section_hash
     WHERE vs.version_id = $1 AND vs.workspace_id = $2`,
    [params.versionId, workspaceId],
  );
  const sections: Record<string, SectionDoc> = {};
  for (const row of pins.rows as { section_id: string; doc: SectionDoc }[]) {
    sections[row.section_id] = row.doc;
  }

  const document = assembleProtocol(sections);
  const settings = sections[sectionId({ kind: 'settings' })];
  const name =
    typeof settings?.name === 'string' && settings.name !== ''
      ? settings.name
      : versionRow.name;
  const migrated = migrateProtocol(document, CURRENT_SCHEMA_VERSION, { name });
  const migratedSections = sectionizeProtocol(migrated);

  await db.transaction(async (client) => {
    await insertDraftRows(client, workspaceId, draftId, migratedSections);
    await client.query(
      `INSERT INTO protocol_drafts (draft_id, workspace_id, protocol_id, based_on_version_id)
       VALUES ($1, $2, $3, $4)`,
      [draftId, workspaceId, versionRow.protocol_id, params.versionId],
    );
  });

  return {
    draftId,
    protocolId: versionRow.protocol_id,
    fromSchemaVersion: versionRow.schema_version,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
