// The protocol store's lifecycle operations (#1276): protocol/draft
// creation, canonical assembly (getProtocolDocument's stored form), the
// publish gate, version listing/reading, and structural diff between stored
// versions. Draft EDITING is not here — live section edits go through
// @codaco/studio-sync's lease/commit engine; structural changes (adding or
// removing sections) live in draft-structure.ts.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  type CurrentProtocol,
  type ProtocolValidationIssue,
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { assembleProtocol } from './assemble.ts';
import { type ProtocolChange, diffProtocolSections } from './diff.ts';
import { insertDraftRows } from './draft-rows.ts';
import { sectionizeProtocol } from './sectionize.ts';
import { sectionId as makeSectionId, parseSectionId } from './taxonomy.ts';
import {
  type SectionIssue,
  SectionValidationFailedError,
  validateSection,
  validateStageSectionIdentity,
} from './validate.ts';
import { versionContentHash } from './version-hash.ts';

/** @public — the store's error surface, thrown outward from ProtocolStore. */
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

export type DraftSections = {
  headSeq: bigint;
  headManifestHash: string;
  sectionHashes: Record<string, string>;
  sections: Record<string, SectionDoc>;
};

/**
 * A lease-scoped sync command can rewrite any field of a section document —
 * including a stage's id, which assembly and the canonical validator cannot
 * see is out of step with the section's key. The publish gate (and
 * validateDraft) therefore re-checks key/document identity over the head.
 */
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
  private db: pg.Pool;

  constructor(db: pg.Pool) {
    this.db = db;
  }

  /**
   * Creates a protocol and its first draft from a full schema-conformant
   * document. Every section is write-time validated; the document itself is
   * NOT required to pass whole-protocol validation until publish.
   */
  async createProtocol(params: {
    protocol: CurrentProtocol;
    protocolId?: string;
    draftId?: string;
  }): Promise<{ protocolId: string; draftId: string }> {
    const protocolId = params.protocolId ?? randomUUID();
    const draftId = params.draftId ?? randomUUID();
    const sections = sectionizeProtocol(params.protocol);
    assertNoValidationFailures(sections);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO protocols (id, name) VALUES ($1, $2)`, [
        protocolId,
        params.protocol.name,
      ]);
      await insertDraftRows(client, draftId, sections);
      await client.query(
        `INSERT INTO protocol_drafts (draft_id, protocol_id) VALUES ($1, $2)`,
        [draftId, protocolId],
      );
      await client.query('COMMIT');
      return { protocolId, draftId };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Branch a new draft from a published version, structurally sharing every
   * section (content-addressed rows already exist and are FK-pinned). */
  async createDraftFromVersion(params: {
    versionId: string;
    draftId?: string;
  }): Promise<{ draftId: string; protocolId: string }> {
    const draftId = params.draftId ?? randomUUID();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const version = await client.query(
        `SELECT protocol_id FROM protocol_versions WHERE id = $1`,
        [params.versionId],
      );
      const versionRow = version.rows[0] as { protocol_id: string } | undefined;
      if (versionRow === undefined) {
        throw new ProtocolStoreError(`no version ${params.versionId}`);
      }
      const pins = await client.query(
        `SELECT vs.section_id, vs.section_hash, s.doc
         FROM version_sections vs JOIN sections s ON s.hash = vs.section_hash
         WHERE vs.version_id = $1`,
        [params.versionId],
      );
      const sections: Record<string, SectionDoc> = {};
      for (const row of pins.rows as {
        section_id: string;
        doc: SectionDoc;
      }[]) {
        sections[row.section_id] = row.doc;
      }
      await insertDraftRows(client, draftId, sections);
      await client.query(
        `INSERT INTO protocol_drafts (draft_id, protocol_id, based_on_version_id)
         VALUES ($1, $2, $3)`,
        [draftId, versionRow.protocol_id, params.versionId],
      );
      await client.query('COMMIT');
      return { draftId, protocolId: versionRow.protocol_id };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** The draft head's section map and documents, from one MVCC snapshot. */
  async getDraftSections(draftId: string): Promise<DraftSections> {
    const res = await this.db.query(
      `SELECT d.head_seq, d.head_manifest_hash, m.section_hashes,
              (SELECT jsonb_object_agg(s.hash, s.doc) FROM sections s
                WHERE s.hash IN (SELECT jsonb_each_text.value
                                 FROM jsonb_each_text(m.section_hashes))) AS docs
       FROM drafts d
       JOIN manifests m ON m.draft_id = d.id AND m.seq = d.head_seq
       WHERE d.id = $1`,
      [draftId],
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

  /** Canonical assembly of the draft head — the getProtocolDocument contract. */
  async getDraftDocument(draftId: string): Promise<Record<string, unknown>> {
    const { sections } = await this.getDraftSections(draftId);
    return assembleProtocol(sections);
  }

  /** Assembled-document validation with the canonical validator — the same
   * check the publish gate runs, available without publishing. */
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
    const document = assembleProtocol(sections);
    const result = await validateProtocol(document as VersionedProtocol);
    return result.success
      ? { valid: true }
      : { valid: false, issues: result.error.issues };
  }

  /**
   * The publish gate (#1276): validate the assembled head document, then
   * freeze the head manifest verbatim into an immutable version row in one
   * transaction. Validation runs OUTSIDE the transaction; the head lock then
   * proves the validated manifest is still the head, so a stale freeze is
   * impossible. Identical content republishes as 'unchanged' — same content,
   * same version, by content-addressed construction.
   */
  async publishDraft(params: {
    draftId: string;
    label?: string;
    expectedManifestHash?: string;
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
    const document = assembleProtocol(head.sections);
    const validation = await validateProtocol(document as VersionedProtocol);
    if (!validation.success) {
      return { status: 'invalid', issues: validation.error.issues };
    }

    const settings = head.sections[makeSectionId({ kind: 'settings' })];
    const schemaVersion = Number(settings?.schemaVersion);
    if (!Number.isInteger(schemaVersion)) {
      throw new ProtocolStoreError('settings section carries no schemaVersion');
    }
    const name = typeof settings?.name === 'string' ? settings.name : null;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const lockedHead = await client.query(
        `SELECT head_seq, head_manifest_hash FROM drafts WHERE id = $1 FOR UPDATE`,
        [params.draftId],
      );
      const lockedRow = lockedHead.rows[0] as {
        head_seq: string;
        head_manifest_hash: string;
      };
      if (lockedRow.head_manifest_hash !== head.headManifestHash) {
        await client.query('ROLLBACK');
        return {
          status: 'conflict',
          headManifestHash: lockedRow.head_manifest_hash,
        };
      }

      const draftRow = await client.query(
        `SELECT protocol_id, based_on_version_id FROM protocol_drafts WHERE draft_id = $1`,
        [params.draftId],
      );
      const draft = draftRow.rows[0] as
        | { protocol_id: string; based_on_version_id: string | null }
        | undefined;
      if (draft === undefined) {
        throw new ProtocolStoreError(
          `draft ${params.draftId} belongs to no protocol`,
        );
      }

      await client.query(`SELECT 1 FROM protocols WHERE id = $1 FOR UPDATE`, [
        draft.protocol_id,
      ]);

      const versionHash = versionContentHash(head.sectionHashes);
      const existing = await client.query(
        `SELECT id, version_number FROM protocol_versions
         WHERE protocol_id = $1 AND version_hash = $2`,
        [draft.protocol_id, versionHash],
      );
      const existingRow = existing.rows[0] as
        | { id: string; version_number: number }
        | undefined;
      if (existingRow !== undefined) {
        await client.query('ROLLBACK');
        return {
          status: 'unchanged',
          versionId: existingRow.id,
          versionNumber: existingRow.version_number,
        };
      }

      // Migration provenance: the published draft was branched from an older-
      // schema version, and the content being frozen is at a newer schema.
      let migratedFrom: string | null = null;
      if (draft.based_on_version_id !== null) {
        const basis = await client.query(
          `SELECT schema_version FROM protocol_versions WHERE id = $1`,
          [draft.based_on_version_id],
        );
        const basisRow = basis.rows[0] as
          | { schema_version: number }
          | undefined;
        if (basisRow !== undefined && basisRow.schema_version < schemaVersion) {
          migratedFrom = draft.based_on_version_id;
        }
      }

      const versionId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO protocol_versions
           (id, protocol_id, version_number, label, version_hash, manifest,
            schema_version, source_draft_id, source_manifest_hash,
            migrated_from_version_id)
         SELECT $1, $2,
                COALESCE(MAX(v.version_number), 0) + 1,
                $3, $4,
                (SELECT to_jsonb(m) FROM manifests m
                  WHERE m.draft_id = $5 AND m.seq = $6),
                $7, $5, $8, $9
         FROM protocol_versions v WHERE v.protocol_id = $2
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
        ],
      );
      const versionNumber = (inserted.rows[0] as { version_number: number })
        .version_number;
      for (const [id, hash] of Object.entries(head.sectionHashes)) {
        await client.query(
          `INSERT INTO version_sections (version_id, section_id, section_hash)
           VALUES ($1, $2, $3)`,
          [versionId, id, hash],
        );
      }
      if (name !== null) {
        await client.query(
          `UPDATE protocols SET name = $2, updated_at = now() WHERE id = $1`,
          [draft.protocol_id, name],
        );
      }
      await client.query('COMMIT');
      return { status: 'published', versionId, versionNumber, versionHash };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getVersionSections(versionId: string): Promise<{
    sectionHashes: Record<string, string>;
    sections: Record<string, SectionDoc>;
  }> {
    const res = await this.db.query(
      `SELECT vs.section_id, vs.section_hash, s.doc
       FROM version_sections vs JOIN sections s ON s.hash = vs.section_hash
       WHERE vs.version_id = $1`,
      [versionId],
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
    return assembleProtocol(sections);
  }

  async listVersions(protocolId: string): Promise<VersionRow[]> {
    const res = await this.db.query(
      `SELECT id, protocol_id, version_number, label, version_hash,
              schema_version, migrated_from_version_id, published_at
       FROM protocol_versions WHERE protocol_id = $1
       ORDER BY version_number DESC`,
      [protocolId],
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

  /** Structural diff from version A to version B. */
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

  /** Discards a draft: leases, command log, manifests, membership, and the
   * draft row. Section documents are left for garbage collection. */
  async discardDraft(draftId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM leases WHERE draft_id = $1`, [draftId]);
      await client.query(`DELETE FROM command_log WHERE draft_id = $1`, [
        draftId,
      ]);
      await client.query(`DELETE FROM protocol_drafts WHERE draft_id = $1`, [
        draftId,
      ]);
      await client.query(`DELETE FROM manifests WHERE draft_id = $1`, [
        draftId,
      ]);
      await client.query(`DELETE FROM drafts WHERE id = $1`, [draftId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
