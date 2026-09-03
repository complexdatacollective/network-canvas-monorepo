// The consent module's database-enforced promises: every CHECK, the composite
// foreign keys that prove a consent record's participant and document belong to
// the same study, and the four sidecar triggers that make a published document
// immutable, freeze its items, hold a grant to its evidence, and make a
// withdrawal one-way.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

/** A well-formed sha256 hex digest; the checks only ever look at the shape. */
const hash = () => randomBytes(32).toString('hex');

describe.skipIf(!db)('consent schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One published protocol version per team, for the wave and session pins. */
  const versionOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` pool instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  async function newStudy(overrides: Row = {}): Promise<string> {
    const id = randomUUID();
    await insert('studies', {
      id,
      team_id: TEAM_A,
      name: 'A study',
      ...overrides,
    });
    return id;
  }

  async function newParticipant(
    studyId: string,
    overrides: Row = {},
  ): Promise<string> {
    const id = randomUUID();
    await insert('participants', {
      id,
      study_id: studyId,
      team_id: TEAM_A,
      participant_code: `P-${randomUUID().slice(0, 8)}`,
      ...overrides,
    });
    return id;
  }

  async function newSession(
    studyId: string,
    overrides: Row = {},
  ): Promise<string> {
    const teamId = (overrides.team_id as string | undefined) ?? TEAM_A;
    const waveId = randomUUID();
    await insert('study_waves', {
      id: waveId,
      study_id: studyId,
      team_id: teamId,
      wave_number: 1,
    });
    const id = randomUUID();
    await insert('interview_sessions', {
      id,
      study_id: studyId,
      team_id: teamId,
      wave_id: waveId,
      protocol_version_id: versionOf[teamId],
      ego_uid: `ego_${randomUUID().slice(0, 8)}`,
      ...overrides,
    });
    return id;
  }

  const documentRow = (studyId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyId,
    version: 1,
    title: 'Information sheet',
    body: JSON.stringify({ blocks: [] }),
    content_hash: hash(),
    ...overrides,
  });

  async function newDocument(
    studyId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = documentRow(studyId, overrides);
    await insert('consent_documents', row);
    return row.id as string;
  }

  const itemRow = (documentId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    consent_document_id: documentId,
    position: 1,
    key: 'may_contact_again',
    prompt: 'You may contact me again about this study.',
    ...overrides,
  });

  async function newItem(
    documentId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = itemRow(documentId, overrides);
    await insert('consent_items', row);
    return row.id as string;
  }

  const consentRow = (
    studyId: string,
    participantId: string,
    documentId: string,
    overrides: Row = {},
  ): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyId,
    participant_id: participantId,
    consent_document_id: documentId,
    consent_content_hash: hash(),
    granted_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  });

  async function newConsent(
    studyId: string,
    participantId: string,
    documentId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = consentRow(studyId, participantId, documentId, overrides);
    await insert('participant_consents', row);
    return row.id as string;
  }

  /** Moves a draft document to `published`, the state the triggers turn on. */
  async function publish(documentId: string): Promise<void> {
    await pool.query(
      `UPDATE consent_documents
       SET state = 'published', published_at = now()
       WHERE id = $1`,
      [documentId],
    );
  }

  /** A published document with one item, one participant, and one grant. */
  async function grantedConsent(): Promise<{
    studyId: string;
    participantId: string;
    documentId: string;
    itemId: string;
    consentId: string;
  }> {
    const studyId = await newStudy();
    const participantId = await newParticipant(studyId);
    const documentId = await newDocument(studyId);
    const itemId = await newItem(documentId);
    await publish(documentId);
    const consentId = await newConsent(studyId, participantId, documentId);
    return { studyId, participantId, documentId, itemId, consentId };
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const protocolId = randomUUID();
      const versionId = randomUUID();
      versionOf[teamId] = versionId;
      await insert('protocols', {
        id: protocolId,
        team_id: teamId,
        name: `${teamId} protocol`,
      });
      await insert('protocol_versions', {
        id: versionId,
        protocol_id: protocolId,
        team_id: teamId,
        version_number: 1,
        version_hash: `hash-${teamId}`,
        manifest: JSON.stringify({ name: teamId }),
        schema_version: 8,
        source_manifest_hash: `source-${teamId}`,
      });
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('consent_documents', () => {
    it('applies the documented defaults', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);

      const row = await pool.query<Row>(
        `SELECT state, locale, published_at, retired_at
         FROM consent_documents WHERE id = $1`,
        [documentId],
      );
      expect(row.rows[0]).toEqual({
        state: 'draft',
        locale: 'en',
        published_at: null,
        retired_at: null,
      });
    });

    it.each([
      ['version zero', { version: 0 }, 'consent_documents_version_check'],
      [
        'an unknown state',
        { state: 'superseded', published_at: new Date() },
        'consent_documents_state_check',
      ],
      [
        'a draft carrying a publication timestamp',
        { published_at: new Date() },
        'consent_documents_state_evidence_check',
      ],
      [
        'a published document with no publication timestamp',
        { state: 'published' },
        'consent_documents_state_evidence_check',
      ],
      [
        'a retired document with no retirement timestamp',
        { state: 'retired', published_at: new Date() },
        'consent_documents_state_evidence_check',
      ],
      [
        'a retirement timestamp on a live document',
        {
          state: 'published',
          published_at: new Date(),
          retired_at: new Date(),
        },
        'consent_documents_state_evidence_check',
      ],
      [
        'a content hash that is not sha256 hex',
        { content_hash: 'not-a-digest' },
        'consent_documents_content_hash_check',
      ],
      [
        'a content hash in upper case',
        { content_hash: hash().toUpperCase() },
        'consent_documents_content_hash_check',
      ],
      [
        'a scalar body',
        { body: JSON.stringify('a sheet') },
        'consent_documents_body_object_check',
      ],
      ['a blank title', { title: '  \t ' }, 'consent_documents_lengths_check'],
      [
        'a title past 320 characters',
        { title: 'x'.repeat(321) },
        'consent_documents_lengths_check',
      ],
      [
        'a one-character locale',
        { locale: 'e' },
        'consent_documents_lengths_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const studyId = await newStudy();
      await expect(
        insert('consent_documents', documentRow(studyId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('numbers versions densely from one, uniquely per study', async () => {
      const studyId = await newStudy();
      await newDocument(studyId, { version: 1 });

      await expect(
        insert('consent_documents', documentRow(studyId, { version: 1 })),
      ).rejects.toMatchObject({
        constraint: 'consent_documents_study_id_version_unique',
      });
      await expect(
        insert('consent_documents', documentRow(studyId, { version: 2 })),
      ).resolves.toMatchObject({ rowCount: 1 });

      // A second study numbers from one again: the uniqueness is per study,
      // not per team.
      const otherStudyId = await newStudy();
      await expect(
        insert('consent_documents', documentRow(otherStudyId, { version: 1 })),
      ).resolves.toMatchObject({ rowCount: 1 });

      // Density itself is the command layer's job. Nothing here refuses a gap,
      // so a CHECK added later must update this case rather than subsume it.
      await expect(
        insert('consent_documents', documentRow(studyId, { version: 9 })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a document whose team disagrees with its study', async () => {
      const studyId = await newStudy({ team_id: TEAM_A });
      await expect(
        insert('consent_documents', documentRow(studyId, { team_id: TEAM_B })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'consent_documents_study_fk',
      });
    });

    it('holds a published document immutable', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const documentId = await newDocument(studyId);

      // The positive control: every one of these moves freely while the
      // document is still a draft, so the rejections below are the trigger
      // and not the columns themselves.
      for (const assignment of [
        `title = 'Reworded'`,
        `body = '{"blocks":[1]}'::jsonb`,
        `content_hash = '${hash()}'`,
        `locale = 'cy'`,
        `version = 4`,
      ]) {
        await expect(
          pool.query(
            `UPDATE consent_documents SET ${assignment} WHERE id = $1`,
            [documentId],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
      }

      await publish(documentId);

      for (const assignment of [
        `title = 'Reworded again'`,
        `body = '{"blocks":[2]}'::jsonb`,
        `content_hash = '${hash()}'`,
        `locale = 'ga'`,
        `version = 5`,
        `study_id = '${otherStudyId}'`,
        `team_id = '${TEAM_B}'`,
        `published_at = now()`,
      ]) {
        await expect(
          pool.query(
            `UPDATE consent_documents SET ${assignment} WHERE id = $1`,
            [documentId],
          ),
        ).rejects.toThrow('published consent documents are immutable');
      }
    });

    it('still lets a published document be retired', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      await publish(documentId);

      await expect(
        pool.query(
          `UPDATE consent_documents
           SET state = 'retired', retired_at = now(), updated_at = now()
           WHERE id = $1`,
          [documentId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // Retirement supersedes; it never rewrites the evidence.
      await expect(
        pool.query(
          `UPDATE consent_documents SET title = 'Reworded' WHERE id = $1`,
          [documentId],
        ),
      ).rejects.toThrow('published consent documents are immutable');
    });
  });

  describe('consent_items', () => {
    it.each([
      ['position zero', { position: 0 }, 'consent_items_position_check'],
      [
        'a key starting with a digit',
        { key: '1st' },
        'consent_items_key_check',
      ],
      ['an upper-case key', { key: 'MayContact' }, 'consent_items_key_check'],
      [
        'a key past 64 characters',
        { key: `k${'x'.repeat(64)}` },
        'consent_items_key_check',
      ],
      ['a blank prompt', { prompt: ' \t ' }, 'consent_items_prompt_check'],
      [
        'a prompt past 2000 characters',
        { prompt: 'x'.repeat(2001) },
        'consent_items_prompt_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      await expect(
        insert('consent_items', itemRow(documentId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('defaults an item to required', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      const itemId = await newItem(documentId);

      const row = await pool.query<Row>(
        `SELECT required FROM consent_items WHERE id = $1`,
        [itemId],
      );
      expect(row.rows[0]).toEqual({ required: true });
    });

    it('refuses a repeated position or key within one document', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      await newItem(documentId, { position: 1, key: 'consent_to_take_part' });

      await expect(
        insert(
          'consent_items',
          itemRow(documentId, { position: 1, key: 'another_key' }),
        ),
      ).rejects.toMatchObject({
        constraint: 'consent_items_consent_document_id_position_unique',
      });
      await expect(
        insert(
          'consent_items',
          itemRow(documentId, { position: 2, key: 'consent_to_take_part' }),
        ),
      ).rejects.toMatchObject({
        constraint: 'consent_items_consent_document_id_key_unique',
      });
      await expect(
        insert(
          'consent_items',
          itemRow(documentId, { position: 2, key: 'another_key' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('freezes items once their document is published', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      const itemId = await newItem(documentId);

      // The positive control: all three writes succeed under a draft.
      const throwawayId = await newItem(documentId, {
        position: 2,
        key: 'throwaway',
      });
      await expect(
        pool.query(`UPDATE consent_items SET prompt = 'Edited' WHERE id = $1`, [
          itemId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(`DELETE FROM consent_items WHERE id = $1`, [throwawayId]),
      ).resolves.toMatchObject({ rowCount: 1 });

      await publish(documentId);

      await expect(
        insert(
          'consent_items',
          itemRow(documentId, { position: 3, key: 'late' }),
        ),
      ).rejects.toThrow('published consent documents are immutable');
      await expect(
        pool.query(
          `UPDATE consent_items SET prompt = 'Reworded' WHERE id = $1`,
          [itemId],
        ),
      ).rejects.toThrow('published consent documents are immutable');
      await expect(
        pool.query(`DELETE FROM consent_items WHERE id = $1`, [itemId]),
      ).rejects.toThrow('published consent documents are immutable');

      // A different, still-draft document is untouched by the freeze.
      const draftDocumentId = await newDocument(studyId, { version: 2 });
      await expect(
        insert('consent_items', itemRow(draftDocumentId)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('keeps the freeze in force for the application role', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      await publish(documentId);

      await expect(
        tenantA.query(
          `INSERT INTO consent_items
             (id, team_id, consent_document_id, position, key, prompt)
           VALUES ($1, $2, $3, 1, 'late_item', 'Added after publication')`,
          [randomUUID(), TEAM_A, documentId],
        ),
      ).rejects.toThrow('published consent documents are immutable');
    });
  });

  describe('participant_consents', () => {
    it.each([
      [
        'an unknown method',
        { method: 'signature' },
        'participant_consents_method_check',
      ],
      [
        'a withdrawal with no withdrawing party',
        { withdrawn_at: new Date('2026-03-02T10:00:00Z') },
        'participant_consents_withdrawal_check',
      ],
      [
        'a withdrawing party with no withdrawal',
        { withdrawn_by: 'researcher' },
        'participant_consents_withdrawal_check',
      ],
      [
        'a withdrawal before the grant',
        {
          withdrawn_at: new Date('2026-02-01T10:00:00Z'),
          withdrawn_by: 'participant',
        },
        'participant_consents_withdrawal_check',
      ],
      [
        'a withdrawal note with no withdrawal',
        { withdrawal_note: 'Changed their mind' },
        'participant_consents_withdrawal_check',
      ],
      [
        'an unknown withdrawing party',
        {
          withdrawn_at: new Date('2026-03-02T10:00:00Z'),
          withdrawn_by: 'sponsor',
        },
        'participant_consents_withdrawn_by_check',
      ],
      [
        'a content hash that is not sha256 hex',
        { consent_content_hash: 'nope' },
        'participant_consents_content_hash_check',
      ],
      [
        'a blank withdrawal note',
        {
          withdrawn_at: new Date('2026-03-02T10:00:00Z'),
          withdrawn_by: 'researcher',
          withdrawal_note: '',
        },
        'participant_consents_withdrawal_note_check',
      ],
      [
        'a withdrawal note past 1000 characters',
        {
          withdrawn_at: new Date('2026-03-02T10:00:00Z'),
          withdrawn_by: 'researcher',
          withdrawal_note: 'x'.repeat(1001),
        },
        'participant_consents_withdrawal_note_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, documentId, overrides),
        ),
      ).rejects.toMatchObject({ constraint });
    });

    it('records one consent per participant per document version', async () => {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      const laterDocumentId = await newDocument(studyId, { version: 2 });
      await newConsent(studyId, participantId, documentId);

      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, documentId),
        ),
      ).rejects.toMatchObject({
        constraint:
          'participant_consents_participant_id_consent_document_id_unique',
      });

      // Re-consent to a new version is a new row, so the history is the set.
      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, laterDocumentId),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a consent whose participant and document are in different studies', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const otherDocumentId = await newDocument(otherStudyId);

      // The participant belongs to `studyId`, the document to `otherStudyId`.
      // Whichever study the record claims, one of the three-column foreign
      // keys refuses it — which is exactly the guarantee.
      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, otherDocumentId),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consents_document_fk',
      });
      await expect(
        insert(
          'participant_consents',
          consentRow(otherStudyId, participantId, otherDocumentId),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consents_participant_fk',
      });

      // The same-study pairing the checks exist to admit.
      await expect(
        insert(
          'participant_consents',
          consentRow(
            otherStudyId,
            await newParticipant(otherStudyId),
            otherDocumentId,
          ),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a session from another study', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      const foreignSessionId = await newSession(otherStudyId);

      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, documentId, {
            session_id: foreignSessionId,
          }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consents_session_fk',
      });

      // A session in the consent's own study is accepted.
      await expect(
        insert(
          'participant_consents',
          consentRow(studyId, participantId, documentId, {
            session_id: await newSession(studyId),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('holds the grant immutable', async () => {
      const { consentId, studyId, participantId } = await grantedConsent();
      const otherStudyId = await newStudy();
      const otherParticipantId = await newParticipant(studyId);
      const otherDocumentId = await newDocument(studyId, { version: 2 });

      for (const assignment of [
        `id = '${randomUUID()}'`,
        `team_id = '${TEAM_B}'`,
        `study_id = '${otherStudyId}'`,
        `participant_id = '${otherParticipantId}'`,
        `consent_document_id = '${otherDocumentId}'`,
        `consent_content_hash = '${hash()}'`,
        `session_id = '${randomUUID()}'`,
        `method = 'signature'`,
        `granted_at = now()`,
        `created_at = now()`,
      ]) {
        await expect(
          pool.query(
            `UPDATE participant_consents SET ${assignment} WHERE id = $1`,
            [consentId],
          ),
        ).rejects.toThrow('participant consent grants are immutable');
      }

      expect(participantId).toBeTruthy();
    });

    it('makes withdrawal one-way', async () => {
      const { consentId } = await grantedConsent();

      // Withdrawing once is the write the trigger exists to admit.
      await expect(
        pool.query(
          `UPDATE participant_consents
           SET withdrawn_at = $2, withdrawn_by = 'participant'
           WHERE id = $1`,
          [consentId, new Date('2026-03-05T10:00:00Z')],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      for (const assignment of [
        `withdrawn_at = now()`,
        `withdrawn_at = NULL, withdrawn_by = NULL`,
      ]) {
        await expect(
          pool.query(
            `UPDATE participant_consents SET ${assignment} WHERE id = $1`,
            [consentId],
          ),
        ).rejects.toThrow('participant consent grants are immutable');
      }

      // The note about the withdrawal stays editable: it is commentary, not
      // the fact of the withdrawal.
      await expect(
        pool.query(
          `UPDATE participant_consents
           SET withdrawal_note = 'Withdrew by email' WHERE id = $1`,
          [consentId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      const row = await pool.query<Row>(
        `SELECT withdrawn_by, withdrawal_note FROM participant_consents
         WHERE id = $1`,
        [consentId],
      );
      expect(row.rows[0]).toEqual({
        withdrawn_by: 'participant',
        withdrawal_note: 'Withdrew by email',
      });
    });

    it('leaves the grant deletable for participant erasure', async () => {
      const { consentId } = await grantedConsent();

      await expect(
        pool.query(`DELETE FROM participant_consents WHERE id = $1`, [
          consentId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('participant_consent_item_responses', () => {
    it('rejects an item key that is not a machine key', async () => {
      const { consentId, itemId } = await grantedConsent();

      await expect(
        insert('participant_consent_item_responses', {
          team_id: TEAM_A,
          participant_consent_id: consentId,
          consent_item_id: itemId,
          item_key: 'Not A Key',
          affirmed: true,
        }),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_item_key_check',
      });
    });

    it('records one response per item and holds it immutable', async () => {
      const { consentId, itemId } = await grantedConsent();
      const response = {
        team_id: TEAM_A,
        participant_consent_id: consentId,
        consent_item_id: itemId,
        item_key: 'may_contact_again',
        affirmed: false,
      };
      await insert('participant_consent_item_responses', response);

      await expect(
        insert('participant_consent_item_responses', response),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_pkey',
      });

      await expect(
        pool.query(
          `UPDATE participant_consent_item_responses SET affirmed = true
           WHERE participant_consent_id = $1`,
          [consentId],
        ),
      ).rejects.toThrow('participant consent grants are immutable');

      // DELETE stays open: participant erasure removes these rows.
      await expect(
        pool.query(
          `DELETE FROM participant_consent_item_responses
           WHERE participant_consent_id = $1`,
          [consentId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('tenancy', () => {
    it('refuses a consent document written into another team', async () => {
      const studyId = await newStudy();
      await expect(
        tenantA.query(
          `INSERT INTO consent_documents
             (id, team_id, study_id, version, title, body, content_hash)
           VALUES ($1, $2, $3, 7, 'Sheet', '{}'::jsonb, $4)`,
          [randomUUID(), TEAM_B, studyId, hash()],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
