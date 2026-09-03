// The consent module's database-enforced promises: every CHECK, the composite
// foreign keys that prove a consent record's participant, document and item
// belong together, and the sidecar triggers that make a published document
// immutable, freeze its items, hold a grant to its evidence, complete that
// evidence at commit, make a withdrawal one-way, and admit a delete only from
// an audited erasure or the maintenance purge.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { ERASURE_GUC } from '../../study/schema.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

/** A well-formed sha256 hex digest; the checks only ever look at the shape. */
const hash = () => randomBytes(32).toString('hex');

describe.skipIf(!db)('consent schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One protocol line and one published version per team, for the pins. */
  const protocolOf: Record<string, string> = {};
  const versionOf: Record<string, string> = {};
  /** Each written document's content hash, keyed by document id. */
  const hashOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` pool instead.
  const insertOn = (
    client: pg.Pool | pg.PoolClient,
    table: string,
    row: Row,
  ) => {
    const columns = Object.keys(row);
    return client.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const insert = (table: string, row: Row) => insertOn(pool, table, row);

  /**
   * One transaction on the fixture pool. A grant and its responses have to
   * share one, because the responses may only be written beside their own
   * grant and the commit-time check reads them together.
   */
  async function inTransaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * A tenant transaction that also presents the erasure marker, the way the
   * audited erasure command will.
   */
  function erasing(participantId: string, sql: string, values: unknown[]) {
    return tenantA.transaction(async (client) => {
      await client.query(
        `SET LOCAL ${ERASURE_GUC} = ${pg.escapeLiteral(participantId)}`,
      );
      return client.query(sql, values);
    });
  }

  // The study names its team's protocol line and every wave below pins that
  // line's published version: `study_waves_version_own_line` refuses a pin
  // whose study has no line, and `interview_sessions_version_wave_pin` refuses
  // a session under a wave that pins nothing.
  async function newStudy(overrides: Row = {}): Promise<string> {
    const id = randomUUID();
    await insert('studies', {
      id,
      team_id: TEAM_A,
      name: 'A study',
      protocol_id: protocolOf[TEAM_A],
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
      protocol_version_id: versionOf[teamId],
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
    hashOf[row.id as string] = row.content_hash as string;
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

  /**
   * The consent hash defaults to the document's own, because
   * `participant_consents_document_published` refuses anything else — a case
   * that wants a mismatch overrides it.
   */
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
    consent_content_hash: hashOf[documentId] ?? hash(),
    granted_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  });

  const responseRow = (
    consentId: string,
    documentId: string,
    itemId: string,
    overrides: Row = {},
  ): Row => ({
    team_id: TEAM_A,
    participant_consent_id: consentId,
    consent_document_id: documentId,
    consent_item_id: itemId,
    item_key: 'may_contact_again',
    affirmed: true,
    ...overrides,
  });

  /** An affirmation of every item of `documentId`, required or not. */
  async function everyItemAffirmed(
    client: pg.PoolClient,
    consentId: string,
    documentId: string,
  ): Promise<Row[]> {
    const items = await client.query<{ id: string; key: string }>(
      `SELECT id, key FROM consent_items
       WHERE consent_document_id = $1 ORDER BY position`,
      [documentId],
    );
    return items.rows.map((item) =>
      responseRow(consentId, documentId, item.id, { item_key: item.key }),
    );
  }

  /**
   * A grant and its responses, in one transaction: the commit-time check
   * refuses a grant that leaves any item unanswered or a required item
   * unaffirmed. `responses` names exactly what the grant carries; by default
   * it affirms every item, which is the only shape most cases need.
   */
  async function newConsent(
    studyId: string,
    participantId: string,
    documentId: string,
    overrides: Row = {},
    responses?: (consentId: string) => Row[],
  ): Promise<string> {
    const row = consentRow(studyId, participantId, documentId, overrides);
    const consentId = row.id as string;
    await inTransaction(async (client) => {
      await insertOn(client, 'participant_consents', row);
      const rows = responses
        ? responses(consentId)
        : await everyItemAffirmed(client, consentId, documentId);
      for (const response of rows) {
        await insertOn(client, 'participant_consent_item_responses', response);
      }
    });
    return consentId;
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

  /** A published document with one required item, and a participant for it. */
  async function publishedDocument(): Promise<{
    studyId: string;
    participantId: string;
    documentId: string;
    itemId: string;
  }> {
    const studyId = await newStudy();
    const participantId = await newParticipant(studyId);
    const documentId = await newDocument(studyId);
    const itemId = await newItem(documentId);
    await publish(documentId);
    return { studyId, participantId, documentId, itemId };
  }

  /** That document, consented to, with its one required item affirmed. */
  async function grantedConsent(): Promise<{
    studyId: string;
    participantId: string;
    documentId: string;
    itemId: string;
    consentId: string;
  }> {
    const fixture = await publishedDocument();
    const consentId = await newConsent(
      fixture.studyId,
      fixture.participantId,
      fixture.documentId,
    );
    return { ...fixture, consentId };
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const protocolId = randomUUID();
      const versionId = randomUUID();
      protocolOf[teamId] = protocolId;
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
      await publish(documentId);
      await publish(laterDocumentId);
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
        newConsent(studyId, participantId, laterDocumentId),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a consent whose participant and document are in different studies', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const otherDocumentId = await newDocument(otherStudyId);
      await publish(otherDocumentId);

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
        newConsent(
          otherStudyId,
          await newParticipant(otherStudyId),
          otherDocumentId,
        ),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a session from another study', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      await publish(documentId);
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

      // The participant's own session in the consent's own study is accepted.
      await expect(
        newConsent(studyId, participantId, documentId, {
          session_id: await newSession(studyId, {
            participant_id: participantId,
          }),
        }),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a consent to a document that is not published', async () => {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const draftId = await newDocument(studyId);

      await expect(newConsent(studyId, participantId, draftId)).rejects.toThrow(
        'a participant may only consent to a published document (draft)',
      );

      // A retired version is superseded, not current: a new grant against it
      // would record agreement to terms the study has withdrawn.
      const retiredId = await newDocument(studyId, { version: 2 });
      await publish(retiredId);
      await pool.query(
        `UPDATE consent_documents SET state = 'retired', retired_at = now()
         WHERE id = $1`,
        [retiredId],
      );
      await expect(
        newConsent(studyId, participantId, retiredId),
      ).rejects.toThrow(
        'a participant may only consent to a published document (retired)',
      );

      await publish(draftId);
      await expect(
        newConsent(studyId, participantId, draftId),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it("refuses a content hash that is not the document's own", async () => {
      const { studyId, participantId, documentId } = await publishedDocument();

      // Well-formed and wrong: the CHECK admits any sha256 digest, so only
      // the trigger can tie the copy back to the words it was taken against.
      await expect(
        newConsent(studyId, participantId, documentId, {
          consent_content_hash: hash(),
        }),
      ).rejects.toThrow(
        "a consent record must copy its own document's content hash",
      );
      await expect(
        newConsent(studyId, participantId, documentId),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a session of another participant', async () => {
      const studyId = await newStudy();
      const documentId = await newDocument(studyId);
      await publish(documentId);
      // One wave, so two participants can each hold a session in it.
      const waveId = randomUUID();
      await insert('study_waves', {
        id: waveId,
        study_id: studyId,
        team_id: TEAM_A,
        wave_number: 1,
        protocol_version_id: versionOf[TEAM_A],
      });
      const sessionFor = async (participantId: string): Promise<string> => {
        const id = randomUUID();
        await insert('interview_sessions', {
          id,
          study_id: studyId,
          team_id: TEAM_A,
          wave_id: waveId,
          participant_id: participantId,
          protocol_version_id: versionOf[TEAM_A],
          ego_uid: `ego_${id.slice(0, 8)}`,
        });
        return id;
      };
      const bystanderId = await newParticipant(studyId);
      const consentingId = await newParticipant(studyId);
      const bystanderSession = await sessionFor(bystanderId);

      // Same study, so the composite key is satisfied; only the trigger can
      // tell whose session it is.
      await expect(
        newConsent(studyId, consentingId, documentId, {
          session_id: bystanderSession,
        }),
      ).rejects.toThrow(
        'a consent captured inside a session must name a session of the consenting participant',
      );
      await expect(
        newConsent(studyId, consentingId, documentId, {
          session_id: await sessionFor(consentingId),
        }),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
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

    it('refuses a grant that leaves a required item unaffirmed', async () => {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      const requiredId = await newItem(documentId, {
        position: 1,
        key: 'consent_to_take_part',
      });
      const optionalId = await newItem(documentId, {
        position: 2,
        key: 'may_contact_again',
        required: false,
      });
      await publish(documentId);

      // The grant row itself is accepted; the check runs at commit, which is
      // the only moment the responses beside it are all written.
      await expect(
        newConsent(studyId, participantId, documentId, {}, () => []),
      ).rejects.toThrow(
        'a consent grant must answer every item of its document (consent_to_take_part)',
      );

      // A recorded refusal of a required item is no better than no answer.
      await expect(
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, requiredId, {
            item_key: 'consent_to_take_part',
            affirmed: false,
          }),
          responseRow(consentId, documentId, optionalId),
        ]),
      ).rejects.toThrow(
        'a consent grant must affirm every required item of its document (consent_to_take_part)',
      );

      // The optional item must be answered too — declined is an answer, an
      // absent row is not: an unanswered item is exactly the response a later
      // transaction could otherwise add.
      await expect(
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, requiredId, {
            item_key: 'consent_to_take_part',
          }),
        ]),
      ).rejects.toThrow(
        'a consent grant must answer every item of its document (may_contact_again)',
      );
      await expect(
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, requiredId, {
            item_key: 'consent_to_take_part',
          }),
          responseRow(consentId, documentId, optionalId, { affirmed: false }),
        ]),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('deletes a grant only under the erasure marker or the purge', async () => {
      const { consentId, participantId } = await grantedConsent();
      const bystander = await grantedConsent();
      const remove = `DELETE FROM participant_consents WHERE id = $1`;
      const removeResponses = `DELETE FROM participant_consent_item_responses
                               WHERE participant_consent_id = $1`;

      // The responses go first: the grant is their parent and nothing
      // cascades.
      await erasing(participantId, removeResponses, [consentId]);

      await expect(tenantA.query(remove, [consentId])).rejects.toThrow(
        'participant consent grants are deleted only by an audited erasure or the maintenance purge',
      );
      // The marker authorizes exactly one participant's consent.
      await expect(
        erasing(bystander.participantId, remove, [consentId]),
      ).rejects.toThrow(
        'participant consent grants are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(participantId, remove, [consentId]),
      ).resolves.toMatchObject({ rowCount: 1 });

      // The purge deletes without a marker, as it does everywhere else.
      await maintenance.query(removeResponses, [bystander.consentId]);
      await expect(
        maintenance.query(remove, [bystander.consentId]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('participant_consent_item_responses', () => {
    /**
     * A document carrying one required and one optional item, published, with
     * a participant to consent to it. Two items, because the interesting
     * failures pit one item's key against another's.
     */
    async function twoItemDocument(): Promise<{
      studyId: string;
      participantId: string;
      documentId: string;
      requiredId: string;
      optionalId: string;
    }> {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);
      const documentId = await newDocument(studyId);
      const requiredId = await newItem(documentId, {
        position: 1,
        key: 'consent_to_take_part',
      });
      const optionalId = await newItem(documentId, {
        position: 2,
        key: 'may_contact_again',
        required: false,
      });
      await publish(documentId);
      return { studyId, participantId, documentId, requiredId, optionalId };
    }

    it('rejects an item key that is not a machine key', async () => {
      const { studyId, participantId, documentId, itemId } =
        await publishedDocument();

      await expect(
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, itemId, { item_key: 'Not A Key' }),
        ]),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_item_key_check',
      });
    });

    it('refuses an item from a document other than the one consented to', async () => {
      const { studyId, participantId, documentId, itemId } =
        await publishedDocument();
      const otherDocumentId = await newDocument(studyId, { version: 2 });
      const foreignItemId = await newItem(otherDocumentId);
      const respond = (consentItemId: string, consentDocumentId: string) =>
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, consentDocumentId, consentItemId),
        ]);

      // Named under the consent's document, the item is not that document's…
      await expect(respond(foreignItemId, documentId)).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consent_item_responses_item_fk',
      });
      // …and named under its own document, the consent is not for it.
      await expect(
        respond(foreignItemId, otherDocumentId),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consent_item_responses_consent_fk',
      });
      await expect(respond(itemId, documentId)).resolves.toMatch(
        /^[0-9a-f-]{36}$/,
      );
    });

    it("refuses an item key that is not the named item's own", async () => {
      const { studyId, participantId, documentId, requiredId, optionalId } =
        await twoItemDocument();
      const respond = (itemKey: string) =>
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, requiredId, {
            item_key: itemKey,
          }),
          responseRow(consentId, documentId, optionalId),
        ]);

      // Both keys are real keys of the consented document, and both are
      // syntactically valid, so only the item's own key can say which terms
      // the exported answer belongs to.
      await expect(respond('may_contact_again')).rejects.toMatchObject({
        code: '23503',
        constraint: 'participant_consent_item_responses_item_fk',
      });
      await expect(respond('consent_to_take_part')).resolves.toMatch(
        /^[0-9a-f-]{36}$/,
      );
    });

    it('records one response per item and holds it immutable', async () => {
      const { studyId, participantId, documentId, itemId } =
        await publishedDocument();

      await expect(
        newConsent(studyId, participantId, documentId, {}, (consentId) => [
          responseRow(consentId, documentId, itemId),
          responseRow(consentId, documentId, itemId, { affirmed: false }),
        ]),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_pkey',
      });

      const consentId = await newConsent(studyId, participantId, documentId);
      await expect(
        pool.query(
          `UPDATE participant_consent_item_responses SET affirmed = false
           WHERE participant_consent_id = $1`,
          [consentId],
        ),
      ).rejects.toThrow('participant consent grants are immutable');
    });

    it('leaves no item for a response written after the grant to answer', async () => {
      const { studyId, participantId, documentId, requiredId, optionalId } =
        await twoItemDocument();
      const consentId = await newConsent(studyId, participantId, documentId);

      // Every item was answered when the grant committed, so the only row a
      // later transaction could write — the one that would rewrite what the
      // participant agreed to — collides with the primary key. Proving "the
      // grant's own transaction" instead would not hold: a withdrawal updates
      // the consent row and makes it look freshly written.
      await expect(
        insert(
          'participant_consent_item_responses',
          responseRow(consentId, documentId, optionalId, { affirmed: false }),
        ),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_pkey',
      });
      await pool.query(
        `UPDATE participant_consents
         SET withdrawn_at = now(), withdrawn_by = 'participant' WHERE id = $1`,
        [consentId],
      );
      await expect(
        insert(
          'participant_consent_item_responses',
          responseRow(consentId, documentId, optionalId, { affirmed: false }),
        ),
      ).rejects.toMatchObject({
        constraint: 'participant_consent_item_responses_pkey',
      });

      // The same row, written beside its own grant, is what the guard admits.
      await expect(
        newConsent(
          studyId,
          await newParticipant(studyId),
          documentId,
          {},
          (id) => [
            responseRow(id, documentId, requiredId, {
              item_key: 'consent_to_take_part',
            }),
            responseRow(id, documentId, optionalId),
          ],
        ),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('deletes a response only under the erasure marker or the purge', async () => {
      const { consentId, participantId } = await grantedConsent();
      const bystander = await grantedConsent();
      const remove = `DELETE FROM participant_consent_item_responses
                      WHERE participant_consent_id = $1`;

      await expect(tenantA.query(remove, [consentId])).rejects.toThrow(
        'participant consent responses are deleted only by an audited erasure or the maintenance purge',
      );
      // The marker is proven through the response's own consent, so another
      // participant's erasure cannot reach these rows.
      await expect(
        erasing(bystander.participantId, remove, [consentId]),
      ).rejects.toThrow(
        'participant consent responses are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(participantId, remove, [consentId]),
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        maintenance.query(remove, [bystander.consentId]),
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
