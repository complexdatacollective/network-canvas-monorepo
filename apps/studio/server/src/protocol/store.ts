import { randomUUID } from 'node:crypto';

import type pg from 'pg';

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
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import {
  type StudyVisibility,
  studyVisibleToCallerSql,
} from '../study/store.ts';
import { type ProtocolChange, diffProtocolSections } from './diff.ts';
import { insertDraftRows } from './draft-rows.ts';
import { sectionizeProtocol } from './sectionize.ts';
import { versionContentHash } from './version-hash.ts';

/** @public */
export class ProtocolStoreError extends Error {}

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

type CreateProtocolResult = {
  protocolId: string;
  draftId: string;
};

type CreateProtocolParams = {
  protocol: CurrentProtocol;
  protocolId?: string;
  draftId?: string /**
   * When the protocol was created, for a caller that must say so — the
   * synthetic-data seed, whose whole corpus is dated from one anchor so the
   * line exists before the studies that pin its versions. Defaults to now.
   */;
  createdAt?: Date;
};

type CreateProtocolTransactionResult = CreateProtocolResult & {
  created: boolean;
};

type EditableProtocolRow = Omit<ProtocolRow, 'draftId'> & { draftId: string };

export type DraftSections = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
  sections: Record<string, SectionDoc>;
};

/**
 * Which protocol lines the caller may reach, which is #1257's study rule and
 * not a second one: a team Admin or Owner reaches every line their team owns,
 * and anyone else reaches a line only through a study they can see. A line no
 * study references is therefore Admin/Owner-only — no grant exists that could
 * reach it — and that is why creating one is an Admin/Owner action too.
 *
 * The predicate over the study itself comes from the study tier, so the two
 * cannot drift: what `studies.list` omits, the protocol surface refuses. `p`
 * is the `protocols` row being asked about, and the bind order is the study
 * tier's — `$1` the team, `$2` the role as one boolean, `$3` the user id.
 */
const REACHABLE_BY_CALLER = `($2::boolean OR EXISTS (
         SELECT 1 FROM studies s
         WHERE s.team_id = p.team_id AND s.protocol_id = p.id
           AND ${studyVisibleToCallerSql('s')}))`;

// A lease-scoped command can rewrite a stage's own id, which neither assembly
// nor the canonical validator can see is out of step with its section key.
function sectionIdentityIssues(
  sections: Record<string, SectionDoc>,
): ProtocolValidationIssue[] {
  const issues: ProtocolValidationIssue[] = [];
  for (const [id, doc] of Object.entries(sections)) {
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

function assembleOrIssues(
  sections: Record<string, SectionDoc>,
):
  | { document: Record<string, unknown>; issues?: undefined }
  | { document?: undefined; issues: ProtocolValidationIssue[] } {
  try {
    return { document: assembleProtocolSections(sections) };
  } catch (err) {
    if (err instanceof ProtocolAssemblyError) {
      return { issues: [{ code: 'custom', path: [], message: err.message }] };
    }
    throw err;
  }
}

function assertNoValidationFailures(sections: Record<string, SectionDoc>) {
  const failures: { sectionId: string; issues: SectionIssue[] }[] = [];
  for (const [id, doc] of Object.entries(sections)) {
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

export class ProtocolStore {
  private db: TenantDb;

  constructor(db: TenantDb) {
    this.db = db;
  }

  // Sections are write-time validated; the document is not required to pass
  // whole-protocol validation until publish.
  async createProtocol(
    params: CreateProtocolParams,
  ): Promise<CreateProtocolResult>;
  async createProtocol(
    params: CreateProtocolParams,
    client: pg.PoolClient,
  ): Promise<CreateProtocolTransactionResult>;
  async createProtocol(
    params: CreateProtocolParams,
    client?: pg.PoolClient,
  ): Promise<CreateProtocolResult | CreateProtocolTransactionResult> {
    const protocolId = params.protocolId ?? randomUUID();
    const draftId = params.draftId ?? randomUUID();
    const sections = sectionizeProtocol(params.protocol);
    assertNoValidationFailures(sections);

    const teamId = this.db.teamId;
    const create = async (
      transactionClient: pg.PoolClient,
    ): Promise<CreateProtocolTransactionResult> => {
      const inserted = await transactionClient.query(
        `INSERT INTO protocols (id, team_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, COALESCE($4, now()), COALESCE($4, now()))
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [protocolId, teamId, params.protocol.name, params.createdAt ?? null],
      );
      if (inserted.rowCount === 0) {
        const existing = await transactionClient.query(
          `SELECT p.name, pd.draft_id
           FROM protocols p
           JOIN protocol_drafts pd
             ON pd.protocol_id = p.id AND pd.team_id = p.team_id
           WHERE p.id = $1 AND p.team_id = $2`,
          [protocolId, teamId],
        );
        const row = existing.rows[0] as
          | { name: string; draft_id: string }
          | undefined;
        if (row?.name === params.protocol.name && row.draft_id === draftId) {
          return { protocolId, draftId, created: false };
        }
        throw new ProtocolStoreError(
          `protocol creation identity ${protocolId} is already in use`,
        );
      }
      await insertDraftRows(
        transactionClient,
        teamId,
        draftId,
        sections,
        params.createdAt,
      );
      await transactionClient.query(
        `INSERT INTO protocol_drafts (draft_id, team_id, protocol_id, created_at)
         VALUES ($1, $2, $3, COALESCE($4, now()))`,
        [draftId, teamId, protocolId, params.createdAt ?? null],
      );
      return { protocolId, draftId, created: true };
    };

    if (client !== undefined) return create(client);
    const result = await runNoAuditTenantTransaction(
      this.db,
      'protocol.create',
      create,
    );
    return { protocolId: result.protocolId, draftId: result.draftId };
  }

  async createDraftFromVersion(params: {
    versionId: string;
    draftId?: string;
  }): Promise<{ draftId: string; protocolId: string }> {
    const draftId = params.draftId ?? randomUUID();
    const teamId = this.db.teamId;
    return runNoAuditTenantTransaction(
      this.db,
      'protocol.createDraftFromVersion',
      async (client) => {
        const version = await client.query(
          `SELECT protocol_id FROM protocol_versions
         WHERE id = $1 AND team_id = $2`,
          [params.versionId, teamId],
        );
        const versionRow = version.rows[0] as
          | { protocol_id: string }
          | undefined;
        if (versionRow === undefined) {
          throw new ProtocolStoreError(`no version ${params.versionId}`);
        }
        const pins = await client.query(
          `SELECT vs.section_id, vs.section_hash, s.doc
         FROM version_sections vs
         JOIN sections s ON s.team_id = vs.team_id AND s.hash = vs.section_hash
         WHERE vs.version_id = $1 AND vs.team_id = $2`,
          [params.versionId, teamId],
        );
        const sections: Record<string, SectionDoc> = {};
        for (const row of pins.rows as {
          section_id: string;
          doc: SectionDoc;
        }[]) {
          sections[row.section_id] = row.doc;
        }
        await insertDraftRows(client, teamId, draftId, sections);
        await client.query(
          `INSERT INTO protocol_drafts (draft_id, team_id, protocol_id, based_on_version_id)
         VALUES ($1, $2, $3, $4)`,
          [draftId, teamId, versionRow.protocol_id, params.versionId],
        );
        return { draftId, protocolId: versionRow.protocol_id };
      },
    );
  }

  async getDraftSections(draftId: string): Promise<DraftSections> {
    const res = await this.db.query(
      `SELECT d.head_seq, d.head_manifest_hash, m.section_hashes,
              (SELECT jsonb_object_agg(s.hash, s.doc) FROM sections s
                WHERE s.team_id = d.team_id
                  AND s.hash IN (SELECT jsonb_each_text.value
                                 FROM jsonb_each_text(m.section_hashes))) AS docs
       FROM drafts d
       JOIN manifests m ON m.draft_id = d.id AND m.team_id = d.team_id AND m.seq = d.head_seq
       WHERE d.id = $1 AND d.team_id = $2`,
      [draftId, this.db.teamId],
    );
    const row = res.rows[0] as
      | {
          head_seq: string;
          head_manifest_hash: string;
          section_hashes: Record<string, string>;
          docs: Record<string, SectionDoc> | null;
        }
      | undefined;
    if (row === undefined) {
      throw new ProtocolStoreError(`no draft ${draftId}`);
    }
    const sections: Record<string, SectionDoc> = {};
    for (const [id, hash] of Object.entries(row.section_hashes)) {
      const doc = row.docs?.[hash];
      if (doc === undefined) {
        throw new ProtocolStoreError(
          `draft ${draftId} references missing section ${hash}`,
        );
      }
      sections[id] = doc;
    }
    return {
      headSeq: BigInt(row.head_seq),
      headManifestHash: row.head_manifest_hash,
      sectionHashes: row.section_hashes,
      sections,
    };
  }

  async getDraftDocument(draftId: string): Promise<Record<string, unknown>> {
    const { sections } = await this.getDraftSections(draftId);
    return assembleProtocolSections(sections);
  }

  async getProtocolDraftMetadata(
    protocolId: string,
    draftId: string,
  ): Promise<EditableProtocolRow> {
    const res = await this.db.query(
      `SELECT p.id, p.name, p.created_at, p.updated_at
       FROM protocols p
       JOIN protocol_drafts pd
         ON pd.protocol_id = p.id AND pd.team_id = p.team_id
       WHERE p.id = $1 AND pd.draft_id = $2 AND p.team_id = $3`,
      [protocolId, draftId, this.db.teamId],
    );
    const row = res.rows[0] as
      | {
          id: string;
          name: string;
          created_at: Date;
          updated_at: Date;
        }
      | undefined;
    if (row === undefined) {
      throw new ProtocolStoreError(
        `no draft ${draftId} for protocol ${protocolId}`,
      );
    }
    return {
      id: row.id,
      draftId,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getProtocolDraft(
    protocolId: string,
    draftId: string,
  ): Promise<{ protocol: EditableProtocolRow; draft: DraftSections }> {
    const protocol = await this.getProtocolDraftMetadata(protocolId, draftId);
    return { protocol, draft: await this.getDraftSections(draftId) };
  }

  async validateDraft(
    draftId: string,
  ): Promise<
    { valid: true } | { valid: false; issues: ProtocolValidationIssue[] }
  > {
    const { sections } = await this.getDraftSections(draftId);
    const identityIssues = sectionIdentityIssues(sections);
    if (identityIssues.length > 0) {
      return { valid: false, issues: identityIssues };
    }
    const assembled = assembleOrIssues(sections);
    if (assembled.document === undefined) {
      return { valid: false, issues: assembled.issues };
    }
    const result = await validateProtocol(
      assembled.document as VersionedProtocol,
    );
    return result.success
      ? { valid: true }
      : { valid: false, issues: result.error.issues };
  }

  // Validation runs outside the transaction; the head lock below then proves
  // the validated manifest is still the head, so a stale freeze is impossible.
  async publishDraft(params: {
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
  }): Promise<PublishResult> {
    const head = await this.getDraftSections(params.draftId);
    if (
      params.expectedManifestHash !== undefined &&
      params.expectedManifestHash !== head.headManifestHash
    ) {
      return { status: 'conflict', headManifestHash: head.headManifestHash };
    }
    const identityIssues = sectionIdentityIssues(head.sections);
    if (identityIssues.length > 0) {
      return { status: 'invalid', issues: identityIssues };
    }
    const assembled = assembleOrIssues(head.sections);
    if (assembled.document === undefined) {
      return { status: 'invalid', issues: assembled.issues };
    }
    const validation = await validateProtocol(
      assembled.document as VersionedProtocol,
    );
    if (!validation.success) {
      return { status: 'invalid', issues: validation.error.issues };
    }

    const settings = head.sections[makeSectionId({ kind: 'settings' })];
    const schemaVersion = Number(settings?.schemaVersion);
    if (!Number.isInteger(schemaVersion)) {
      throw new ProtocolStoreError('settings section carries no schemaVersion');
    }
    const name = typeof settings?.name === 'string' ? settings.name : null;

    const teamId = this.db.teamId;
    return runNoAuditTenantTransaction(
      this.db,
      'protocol.publishDraft',
      async (client): Promise<PublishResult> => {
        const lockedHead = await client.query(
          `SELECT head_seq, head_manifest_hash FROM drafts
         WHERE id = $1 AND team_id = $2 FOR UPDATE`,
          [params.draftId, teamId],
        );
        const lockedRow = lockedHead.rows[0] as
          | { head_seq: string; head_manifest_hash: string }
          | undefined;
        if (lockedRow === undefined) {
          throw new ProtocolStoreError(`no draft ${params.draftId}`);
        }
        if (lockedRow.head_manifest_hash !== head.headManifestHash) {
          return {
            status: 'conflict',
            headManifestHash: lockedRow.head_manifest_hash,
          };
        }

        const draftRow = await client.query(
          `SELECT protocol_id, based_on_version_id FROM protocol_drafts
         WHERE draft_id = $1 AND team_id = $2`,
          [params.draftId, teamId],
        );
        const draft = draftRow.rows[0] as
          | { protocol_id: string; based_on_version_id: string | null }
          | undefined;
        if (draft === undefined) {
          throw new ProtocolStoreError(
            `draft ${params.draftId} belongs to no protocol`,
          );
        }

        await client.query(
          `SELECT 1 FROM protocols WHERE id = $1 AND team_id = $2 FOR UPDATE`,
          [draft.protocol_id, teamId],
        );

        const versionHash = versionContentHash(head.sectionHashes);
        const existing = await client.query(
          `SELECT id, version_number FROM protocol_versions
         WHERE protocol_id = $1 AND version_hash = $2 AND team_id = $3`,
          [draft.protocol_id, versionHash, teamId],
        );
        const existingRow = existing.rows[0] as
          | { id: string; version_number: number }
          | undefined;
        if (existingRow !== undefined) {
          return {
            status: 'unchanged',
            versionId: existingRow.id,
            versionNumber: existingRow.version_number,
          };
        }

        let migratedFrom: string | null = null;
        if (draft.based_on_version_id !== null) {
          const basis = await client.query(
            `SELECT schema_version FROM protocol_versions
           WHERE id = $1 AND team_id = $2`,
            [draft.based_on_version_id, teamId],
          );
          const basisRow = basis.rows[0] as
            | { schema_version: number }
            | undefined;
          if (
            basisRow !== undefined &&
            basisRow.schema_version < schemaVersion
          ) {
            migratedFrom = draft.based_on_version_id;
          }
        }

        const versionId = params.versionId ?? randomUUID();
        const inserted = await client.query(
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
            versionId,
            draft.protocol_id,
            params.label ?? null,
            versionHash,
            params.draftId,
            String(head.headSeq),
            schemaVersion,
            head.headManifestHash,
            migratedFrom,
            teamId,
            params.publishedAt ?? null,
          ],
        );
        const versionNumber = (inserted.rows[0] as { version_number: number })
          .version_number;
        for (const [id, hash] of Object.entries(head.sectionHashes)) {
          await client.query(
            `INSERT INTO version_sections (version_id, team_id, section_id, section_hash)
           VALUES ($1, $2, $3, $4)`,
            [versionId, teamId, id, hash],
          );
        }
        if (name !== null) {
          await client.query(
            `UPDATE protocols SET name = $2, updated_at = COALESCE($4, now())
           WHERE id = $1 AND team_id = $3`,
            [draft.protocol_id, name, teamId, params.publishedAt ?? null],
          );
        }
        return { status: 'published', versionId, versionNumber, versionHash };
      },
    );
  }

  async getVersionSections(versionId: string): Promise<{
    sectionHashes: Record<string, string>;
    sections: Record<string, SectionDoc>;
  }> {
    const res = await this.db.query(
      `SELECT vs.section_id, vs.section_hash, s.doc
       FROM version_sections vs
       JOIN sections s ON s.team_id = vs.team_id AND s.hash = vs.section_hash
       WHERE vs.version_id = $1 AND vs.team_id = $2`,
      [versionId, this.db.teamId],
    );
    if (res.rowCount === 0) {
      throw new ProtocolStoreError(`no version ${versionId}`);
    }
    const sectionHashes: Record<string, string> = {};
    const sections: Record<string, SectionDoc> = {};
    for (const row of res.rows as {
      section_id: string;
      section_hash: string;
      doc: SectionDoc;
    }[]) {
      sectionHashes[row.section_id] = row.section_hash;
      sections[row.section_id] = row.doc;
    }
    return { sectionHashes, sections };
  }

  async getVersionDocument(
    versionId: string,
  ): Promise<Record<string, unknown>> {
    const { sections } = await this.getVersionSections(versionId);
    return assembleProtocolSections(sections);
  }

  async listVersions(protocolId: string): Promise<VersionRow[]> {
    const res = await this.db.query(
      `SELECT id, protocol_id, version_number, label, version_hash,
              schema_version, migrated_from_version_id, published_at
       FROM protocol_versions WHERE protocol_id = $1 AND team_id = $2
       ORDER BY version_number DESC`,
      [protocolId, this.db.teamId],
    );
    return (
      res.rows as {
        id: string;
        protocol_id: string;
        version_number: number;
        label: string | null;
        version_hash: string;
        schema_version: number;
        migrated_from_version_id: string | null;
        published_at: Date;
      }[]
    ).map((row) => ({
      id: row.id,
      protocolId: row.protocol_id,
      versionNumber: row.version_number,
      label: row.label,
      versionHash: row.version_hash,
      schemaVersion: row.schema_version,
      migratedFromVersionId: row.migrated_from_version_id,
      publishedAt: row.published_at,
    }));
  }

  /**
   * Whether the caller may open one protocol line at all. A boolean rather
   * than a row, because callers answer every false the same way: a line in
   * another team, a line behind a study the caller holds no grant on, and a
   * line that does not exist are one refusal, so this is no more an existence
   * oracle than `studies.get` is.
   */
  async isReachableByCaller(
    protocolId: string,
    visibility: StudyVisibility,
  ): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM protocols p
       WHERE p.team_id = $1 AND p.id = $4 AND ${REACHABLE_BY_CALLER}`,
      [
        this.db.teamId,
        visibility.seesEveryStudy,
        visibility.actorUserId,
        protocolId,
      ],
    );
    return res.rowCount === 1;
  }

  async listProtocols(visibility: StudyVisibility): Promise<ProtocolRow[]> {
    const res = await this.db.query(
      `SELECT p.id, p.name, p.created_at, p.updated_at, d.draft_id
       FROM protocols p
       LEFT JOIN LATERAL (
         SELECT pd.draft_id
         FROM protocol_drafts pd
         WHERE pd.protocol_id = p.id AND pd.team_id = p.team_id
         ORDER BY pd.created_at DESC, pd.draft_id
         LIMIT 1
       ) d ON true
       WHERE p.team_id = $1 AND ${REACHABLE_BY_CALLER}
       ORDER BY p.created_at DESC, p.id`,
      [this.db.teamId, visibility.seesEveryStudy, visibility.actorUserId],
    );
    return (
      res.rows as {
        id: string;
        draft_id: string | null;
        name: string;
        created_at: Date;
        updated_at: Date;
      }[]
    ).map((row) => ({
      id: row.id,
      draftId: row.draft_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async diffVersions(
    versionIdA: string,
    versionIdB: string,
  ): Promise<ProtocolChange[]> {
    const a = await this.getVersionSections(versionIdA);
    const b = await this.getVersionSections(versionIdB);
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
        throw new ProtocolStoreError(`no section ${hash} in either version`);
      }
      return doc;
    });
  }

  // Section documents are left for garbage collection.
  async discardDraft(draftId: string): Promise<void> {
    const teamId = this.db.teamId;
    await runNoAuditTenantTransaction(
      this.db,
      'protocol.discardDraft',
      async (client) => {
        await client.query(
          `SELECT 1 FROM drafts WHERE id = $1 AND team_id = $2 FOR UPDATE`,
          [draftId, teamId],
        );
        await client.query(
          `DELETE FROM leases WHERE draft_id = $1 AND team_id = $2`,
          [draftId, teamId],
        );
        await client.query(
          `DELETE FROM command_log WHERE draft_id = $1 AND team_id = $2`,
          [draftId, teamId],
        );
        await client.query(
          `DELETE FROM protocol_drafts WHERE draft_id = $1 AND team_id = $2`,
          [draftId, teamId],
        );
        await client.query(
          `DELETE FROM manifests WHERE draft_id = $1 AND team_id = $2`,
          [draftId, teamId],
        );
        await client.query(
          `DELETE FROM drafts WHERE id = $1 AND team_id = $2`,
          [draftId, teamId],
        );
      },
    );
  }
}
