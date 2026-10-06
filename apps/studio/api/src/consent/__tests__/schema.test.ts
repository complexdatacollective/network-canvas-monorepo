import { randomBytes, randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
  erasing,
  maintenanceAffected,
  ownerInsert,
  tenantAffected,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

type CheckCase = readonly [label: string, overrides: Row, constraint: string];

const UUID = /^[0-9a-f-]{36}$/;

const hash = () => randomBytes(32).toString('hex');

const protocolOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const versionOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const hashOf: Record<string, string> = {};

const insertStatement = (table: string, row: Row) => {
  const columns = Object.keys(row);
  return [
    `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  ] as const;
};

const newStudy = Effect.fnUntraced(function* (overrides: Row = {}) {
  const id = randomUUID();
  yield* ownerInsert('studies', {
    id,
    team_id: TEAM_A,
    name: 'A study',
    protocol_id: protocolOf[TEAM_A],
    ...overrides,
  });
  return id;
});

const newParticipant = Effect.fnUntraced(function* (
  studyId: string,
  overrides: Row = {},
) {
  const id = randomUUID();
  yield* ownerInsert('participants', {
    id,
    study_id: studyId,
    team_id: TEAM_A,
    participant_code: `P-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  return id;
});

const newSession = Effect.fnUntraced(function* (
  studyId: string,
  overrides: Row = {},
) {
  const teamId = (overrides.team_id as string | undefined) ?? TEAM_A;
  const waveId = randomUUID();
  yield* ownerInsert('study_waves', {
    id: waveId,
    study_id: studyId,
    team_id: teamId,
    wave_number: 1,
    protocol_version_id: versionOf[teamId],
  });
  const id = randomUUID();
  yield* ownerInsert('interview_sessions', {
    id,
    study_id: studyId,
    team_id: teamId,
    wave_id: waveId,
    protocol_version_id: versionOf[teamId],
    ego_uid: `ego_${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  return id;
});

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

const newDocument = Effect.fnUntraced(function* (
  studyId: string,
  overrides: Row = {},
) {
  const row = documentRow(studyId, overrides);
  yield* ownerInsert('consent_documents', row);
  hashOf[row.id as string] = row.content_hash as string;
  return row.id as string;
});

const itemRow = (documentId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  consent_document_id: documentId,
  position: 1,
  key: 'may_contact_again',
  prompt: 'You may contact me again about this study.',
  ...overrides,
});

const newItem = Effect.fnUntraced(function* (
  documentId: string,
  overrides: Row = {},
) {
  const row = itemRow(documentId, overrides);
  yield* ownerInsert('consent_items', row);
  return row.id as string;
});

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

const newConsent = Effect.fnUntraced(function* (
  studyId: string,
  participantId: string,
  documentId: string,
  overrides: Row = {},
  responses?: (consentId: string) => Row[],
) {
  const harness = yield* TestDatabase;
  const { sql } = harness.owner;
  const row = consentRow(studyId, participantId, documentId, overrides);
  const consentId = row.id as string;
  yield* harness.onOwner(
    Effect.gen(function* () {
      yield* sql.unsafe(...insertStatement('participant_consents', row));
      const rows = responses
        ? responses(consentId)
        : (yield* sql.unsafe<{ id: string; key: string }>(
            `SELECT id, key FROM consent_items
             WHERE consent_document_id = $1 ORDER BY position`,
            [documentId],
          )).map((item) =>
            responseRow(consentId, documentId, item.id, {
              item_key: item.key,
            }),
          );
      for (const response of rows) {
        yield* sql.unsafe(
          ...insertStatement('participant_consent_item_responses', response),
        );
      }
    }),
  );
  return consentId;
});

const publish = (documentId: string) =>
  ownerAffected(
    `UPDATE consent_documents
     SET state = 'published', published_at = now()
     WHERE id = $1`,
    [documentId],
  );

const publishedDocument = Effect.fnUntraced(function* () {
  const studyId = yield* newStudy();
  const participantId = yield* newParticipant(studyId);
  const documentId = yield* newDocument(studyId);
  const itemId = yield* newItem(documentId);
  yield* publish(documentId);
  return { studyId, participantId, documentId, itemId };
});

const grantedConsent = Effect.fnUntraced(function* () {
  const fixture = yield* publishedDocument();
  const consentId = yield* newConsent(
    fixture.studyId,
    fixture.participantId,
    fixture.documentId,
  );
  return { ...fixture, consentId };
});

const twoItemDocument = Effect.fnUntraced(function* () {
  const studyId = yield* newStudy();
  const participantId = yield* newParticipant(studyId);
  const documentId = yield* newDocument(studyId);
  const requiredId = yield* newItem(documentId, {
    position: 1,
    key: 'consent_to_take_part',
  });
  const optionalId = yield* newItem(documentId, {
    position: 2,
    key: 'may_contact_again',
    required: false,
  });
  yield* publish(documentId);
  return { studyId, participantId, documentId, requiredId, optionalId };
});

const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.gen(function* () {
      yield* insertTeam(teamId);
      yield* ownerInsert('protocols', {
        id: protocolOf[teamId],
        team_id: teamId,
        name: `${teamId} protocol`,
      });
      yield* ownerInsert('protocol_versions', {
        id: versionOf[teamId],
        protocol_id: protocolOf[teamId],
        team_id: teamId,
        version_number: 1,
        version_hash: `hash-${teamId}`,
        manifest: JSON.stringify({ name: teamId }),
        schema_version: 8,
        source_manifest_hash: `source-${teamId}`,
      });
    }),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('consent schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('consent_documents', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);

          const rows = yield* ownerRows(
            `SELECT state, locale, published_at, retired_at
             FROM consent_documents WHERE id = $1`,
            [documentId],
          );
          expect(rows[0]).toEqual({
            state: 'draft',
            locale: 'en',
            published_at: null,
            retired_at: null,
          });
        }),
      );

      it.effect.each<CheckCase>([
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
        [
          'a blank title',
          { title: '  \t ' },
          'consent_documents_lengths_check',
        ],
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const refused = yield* refusalOf(
            ownerInsert('consent_documents', documentRow(studyId, overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('numbers versions densely from one, uniquely per study', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          yield* newDocument(studyId, { version: 1 });

          const refused = yield* refusalOf(
            ownerInsert(
              'consent_documents',
              documentRow(studyId, { version: 1 }),
            ),
          );
          expect(refused.constraint).toBe(
            'consent_documents_study_id_version_unique',
          );
          expect(
            yield* ownerInsert(
              'consent_documents',
              documentRow(studyId, { version: 2 }),
            ),
          ).toBe(1);

          const otherStudyId = yield* newStudy();
          expect(
            yield* ownerInsert(
              'consent_documents',
              documentRow(otherStudyId, { version: 1 }),
            ),
          ).toBe(1);

          expect(
            yield* ownerInsert(
              'consent_documents',
              documentRow(studyId, { version: 9 }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a document whose team disagrees with its study', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy({ team_id: TEAM_A });
          const refused = yield* refusalOf(
            ownerInsert(
              'consent_documents',
              documentRow(studyId, { team_id: TEAM_B }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'consent_documents_study_fk',
          });
        }),
      );

      it.effect('holds a published document immutable', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const otherStudyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);

          for (const assignment of [
            `title = 'Reworded'`,
            `body = '{"blocks":[1]}'::jsonb`,
            `content_hash = '${hash()}'`,
            `locale = 'cy'`,
            `version = 4`,
          ]) {
            expect(
              yield* ownerAffected(
                `UPDATE consent_documents SET ${assignment} WHERE id = $1`,
                [documentId],
              ),
            ).toBe(1);
          }

          yield* publish(documentId);

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
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE consent_documents SET ${assignment} WHERE id = $1`,
                [documentId],
              ),
            );
            expect(refused.message).toContain(
              'published consent documents are immutable',
            );
          }
        }),
      );

      it.effect('deletes a document only by the maintenance purge', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          const remove = `DELETE FROM consent_documents WHERE id = $1`;

          const asOwner = yield* refusalOf(ownerAffected(remove, [documentId]));
          expect(asOwner.message).toContain(
            'consent documents are deleted only by the maintenance purge',
          );
          const asTenant = yield* refusalOf(
            tenantAffected(TEAM_A, remove, [documentId]),
          );
          expect(asTenant.message).toContain(
            'consent documents are deleted only by the maintenance purge',
          );
          expect(yield* maintenanceAffected(remove, [documentId])).toBe(1);
        }),
      );

      it.effect('still lets a published document be retired', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          yield* publish(documentId);

          expect(
            yield* ownerAffected(
              `UPDATE consent_documents
               SET state = 'retired', retired_at = now(), updated_at = now()
               WHERE id = $1`,
              [documentId],
            ),
          ).toBe(1);

          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE consent_documents SET title = 'Reworded' WHERE id = $1`,
              [documentId],
            ),
          );
          expect(refused.message).toContain(
            'published consent documents are immutable',
          );
        }),
      );

      it.effect('never revives a retired document', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          yield* publish(documentId);
          yield* ownerAffected(
            `UPDATE consent_documents
             SET state = 'retired', retired_at = now(), updated_at = now()
             WHERE id = $1`,
            [documentId],
          );

          const revived = yield* refusalOf(
            ownerAffected(
              `UPDATE consent_documents
               SET state = 'published', retired_at = NULL, updated_at = now()
               WHERE id = $1`,
              [documentId],
            ),
          );
          expect(revived.message).toContain(
            'published consent documents are immutable',
          );
          const restamped = yield* refusalOf(
            ownerAffected(
              `UPDATE consent_documents SET retired_at = now() - interval '1 day'
               WHERE id = $1`,
              [documentId],
            ),
          );
          expect(restamped.message).toContain(
            'published consent documents are immutable',
          );
        }),
      );
    });

    describe('consent_items', () => {
      it.effect.each<CheckCase>([
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          const refused = yield* refusalOf(
            ownerInsert('consent_items', itemRow(documentId, overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('defaults an item to required', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          const itemId = yield* newItem(documentId);

          const rows = yield* ownerRows(
            `SELECT required FROM consent_items WHERE id = $1`,
            [itemId],
          );
          expect(rows[0]).toEqual({ required: true });
        }),
      );

      it.effect('refuses a repeated position or key within one document', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          yield* newItem(documentId, {
            position: 1,
            key: 'consent_to_take_part',
          });

          const position = yield* refusalOf(
            ownerInsert(
              'consent_items',
              itemRow(documentId, { position: 1, key: 'another_key' }),
            ),
          );
          expect(position.constraint).toBe(
            'consent_items_consent_document_id_position_unique',
          );
          const key = yield* refusalOf(
            ownerInsert(
              'consent_items',
              itemRow(documentId, { position: 2, key: 'consent_to_take_part' }),
            ),
          );
          expect(key.constraint).toBe(
            'consent_items_consent_document_id_key_unique',
          );
          expect(
            yield* ownerInsert(
              'consent_items',
              itemRow(documentId, { position: 2, key: 'another_key' }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('freezes items once their document is published', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          const itemId = yield* newItem(documentId);
          const frozen = 'published consent documents are immutable';

          const throwawayId = yield* newItem(documentId, {
            position: 2,
            key: 'throwaway',
          });
          expect(
            yield* ownerAffected(
              `UPDATE consent_items SET prompt = 'Edited' WHERE id = $1`,
              [itemId],
            ),
          ).toBe(1);
          expect(
            yield* ownerAffected(`DELETE FROM consent_items WHERE id = $1`, [
              throwawayId,
            ]),
          ).toBe(1);

          yield* publish(documentId);

          expect(
            (yield* refusalOf(
              ownerInsert(
                'consent_items',
                itemRow(documentId, { position: 3, key: 'late' }),
              ),
            )).message,
          ).toContain(frozen);
          expect(
            (yield* refusalOf(
              ownerAffected(
                `UPDATE consent_items SET prompt = 'Reworded' WHERE id = $1`,
                [itemId],
              ),
            )).message,
          ).toContain(frozen);
          expect(
            (yield* refusalOf(
              ownerAffected(`DELETE FROM consent_items WHERE id = $1`, [
                itemId,
              ]),
            )).message,
          ).toContain(frozen);

          const escapeDocumentId = yield* newDocument(studyId, { version: 9 });
          expect(
            (yield* refusalOf(
              ownerAffected(
                `UPDATE consent_items SET consent_document_id = $2 WHERE id = $1`,
                [itemId, escapeDocumentId],
              ),
            )).message,
          ).toContain(frozen);

          expect(
            (yield* refusalOf(
              maintenanceAffected(
                `UPDATE consent_items SET prompt = 'Reworded' WHERE id = $1`,
                [itemId],
              ),
            )).message,
          ).toContain(frozen);
          expect(
            yield* maintenanceAffected(
              `DELETE FROM consent_items WHERE id = $1`,
              [itemId],
            ),
          ).toBe(1);

          const draftDocumentId = yield* newDocument(studyId, { version: 2 });
          expect(
            yield* ownerInsert('consent_items', itemRow(draftDocumentId)),
          ).toBe(1);
        }),
      );

      it.effect('keeps the freeze in force for the application role', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          yield* publish(documentId);

          const refused = yield* refusalOf(
            tenantAffected(
              TEAM_A,
              `INSERT INTO consent_items
                 (id, team_id, consent_document_id, position, key, prompt)
               VALUES ($1, $2, $3, 1, 'late_item', 'Added after publication')`,
              [randomUUID(), TEAM_A, documentId],
            ),
          );
          expect(refused.message).toContain(
            'published consent documents are immutable',
          );
        }),
      );
    });

    describe('participant_consents', () => {
      it.effect.each<CheckCase>([
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const participantId = yield* newParticipant(studyId);
          const documentId = yield* newDocument(studyId);
          const refused = yield* refusalOf(
            ownerInsert(
              'participant_consents',
              consentRow(studyId, participantId, documentId, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'records one consent per participant per document version',
        () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const participantId = yield* newParticipant(studyId);
            const documentId = yield* newDocument(studyId);
            const laterDocumentId = yield* newDocument(studyId, { version: 2 });
            yield* publish(documentId);
            yield* publish(laterDocumentId);
            yield* newConsent(studyId, participantId, documentId);

            const refused = yield* refusalOf(
              ownerInsert(
                'participant_consents',
                consentRow(studyId, participantId, documentId),
              ),
            );
            expect(refused.constraint).toBe(
              'participant_consents_participant_id_consent_document_id_unique',
            );

            expect(
              yield* newConsent(studyId, participantId, laterDocumentId),
            ).toMatch(UUID);
          }),
      );

      it.effect(
        'refuses a consent whose participant and document are in different studies',
        () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const otherStudyId = yield* newStudy();
            const participantId = yield* newParticipant(studyId);
            const otherDocumentId = yield* newDocument(otherStudyId);
            yield* publish(otherDocumentId);

            expect(
              yield* refusalOf(
                ownerInsert(
                  'participant_consents',
                  consentRow(studyId, participantId, otherDocumentId),
                ),
              ),
            ).toMatchObject({
              state: '23503',
              constraint: 'participant_consents_document_fk',
            });
            expect(
              yield* refusalOf(
                ownerInsert(
                  'participant_consents',
                  consentRow(otherStudyId, participantId, otherDocumentId),
                ),
              ),
            ).toMatchObject({
              state: '23503',
              constraint: 'participant_consents_participant_fk',
            });

            expect(
              yield* newConsent(
                otherStudyId,
                yield* newParticipant(otherStudyId),
                otherDocumentId,
              ),
            ).toMatch(UUID);
          }),
      );

      it.effect('refuses a session from another study', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const otherStudyId = yield* newStudy();
          const participantId = yield* newParticipant(studyId);
          const documentId = yield* newDocument(studyId);
          yield* publish(documentId);
          const foreignSessionId = yield* newSession(otherStudyId);

          expect(
            yield* refusalOf(
              ownerInsert(
                'participant_consents',
                consentRow(studyId, participantId, documentId, {
                  session_id: foreignSessionId,
                }),
              ),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'participant_consents_session_fk',
          });

          expect(
            yield* newConsent(studyId, participantId, documentId, {
              session_id: yield* newSession(studyId, {
                participant_id: participantId,
              }),
            }),
          ).toMatch(UUID);
        }),
      );

      it.effect('refuses a consent to a document that is not published', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const participantId = yield* newParticipant(studyId);
          const draftId = yield* newDocument(studyId);

          const draft = yield* refusalOf(
            newConsent(studyId, participantId, draftId),
          );
          expect(draft.message).toContain(
            'a participant may only consent to a published document (draft)',
          );

          const retiredId = yield* newDocument(studyId, { version: 2 });
          yield* publish(retiredId);
          yield* ownerAffected(
            `UPDATE consent_documents SET state = 'retired', retired_at = now()
             WHERE id = $1`,
            [retiredId],
          );
          const retired = yield* refusalOf(
            newConsent(studyId, participantId, retiredId),
          );
          expect(retired.message).toContain(
            'a participant may only consent to a published document (retired)',
          );

          yield* publish(draftId);
          expect(yield* newConsent(studyId, participantId, draftId)).toMatch(
            UUID,
          );
        }),
      );

      it.effect("refuses a content hash that is not the document's own", () =>
        Effect.gen(function* () {
          const { studyId, participantId, documentId } =
            yield* publishedDocument();

          const refused = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {
              consent_content_hash: hash(),
            }),
          );
          expect(refused.message).toContain(
            "a consent record must copy its own document's content hash",
          );
          expect(yield* newConsent(studyId, participantId, documentId)).toMatch(
            UUID,
          );
        }),
      );

      it.effect('refuses a session of another participant', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const documentId = yield* newDocument(studyId);
          yield* publish(documentId);
          const waveId = randomUUID();
          yield* ownerInsert('study_waves', {
            id: waveId,
            study_id: studyId,
            team_id: TEAM_A,
            wave_number: 1,
            protocol_version_id: versionOf[TEAM_A],
          });
          const sessionFor = Effect.fnUntraced(function* (
            participantId: string,
          ) {
            const id = randomUUID();
            yield* ownerInsert('interview_sessions', {
              id,
              study_id: studyId,
              team_id: TEAM_A,
              wave_id: waveId,
              participant_id: participantId,
              protocol_version_id: versionOf[TEAM_A],
              ego_uid: `ego_${id.slice(0, 8)}`,
            });
            return id;
          });
          const bystanderId = yield* newParticipant(studyId);
          const consentingId = yield* newParticipant(studyId);
          const bystanderSession = yield* sessionFor(bystanderId);

          const refused = yield* refusalOf(
            newConsent(studyId, consentingId, documentId, {
              session_id: bystanderSession,
            }),
          );
          expect(refused.message).toContain(
            'a consent captured inside a session must name a session of the consenting participant',
          );
          expect(
            yield* newConsent(studyId, consentingId, documentId, {
              session_id: yield* sessionFor(consentingId),
            }),
          ).toMatch(UUID);
        }),
      );

      it.effect('holds the grant immutable', () =>
        Effect.gen(function* () {
          const { consentId, studyId, participantId } = yield* grantedConsent();
          const otherStudyId = yield* newStudy();
          const otherParticipantId = yield* newParticipant(studyId);
          const otherDocumentId = yield* newDocument(studyId, { version: 2 });

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
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE participant_consents SET ${assignment} WHERE id = $1`,
                [consentId],
              ),
            );
            expect(refused.message).toContain(
              'participant consent grants are immutable',
            );
          }

          expect(participantId).toBeTruthy();
        }),
      );

      it.effect('makes withdrawal one-way', () =>
        Effect.gen(function* () {
          const { consentId } = yield* grantedConsent();

          expect(
            yield* ownerAffected(
              `UPDATE participant_consents
               SET withdrawn_at = $2, withdrawn_by = 'participant'
               WHERE id = $1`,
              [consentId, new Date('2026-03-05T10:00:00Z')],
            ),
          ).toBe(1);

          for (const assignment of [
            `withdrawn_at = now()`,
            `withdrawn_at = NULL, withdrawn_by = NULL`,
          ]) {
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE participant_consents SET ${assignment} WHERE id = $1`,
                [consentId],
              ),
            );
            expect(refused.message).toContain(
              'participant consent grants are immutable',
            );
          }

          expect(
            yield* ownerAffected(
              `UPDATE participant_consents
               SET withdrawal_note = 'Withdrew by email' WHERE id = $1`,
              [consentId],
            ),
          ).toBe(1);

          const rows = yield* ownerRows(
            `SELECT withdrawn_by, withdrawal_note FROM participant_consents
             WHERE id = $1`,
            [consentId],
          );
          expect(rows[0]).toEqual({
            withdrawn_by: 'participant',
            withdrawal_note: 'Withdrew by email',
          });
        }),
      );

      it.effect('refuses a grant that leaves a required item unaffirmed', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const participantId = yield* newParticipant(studyId);
          const documentId = yield* newDocument(studyId);
          const requiredId = yield* newItem(documentId, {
            position: 1,
            key: 'consent_to_take_part',
          });
          const optionalId = yield* newItem(documentId, {
            position: 2,
            key: 'may_contact_again',
            required: false,
          });
          yield* publish(documentId);

          const unanswered = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {}, () => []),
          );
          expect(unanswered.message).toContain(
            'a consent grant must answer every item of its document (consent_to_take_part)',
          );

          const declined = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {}, (consentId) => [
              responseRow(consentId, documentId, requiredId, {
                item_key: 'consent_to_take_part',
                affirmed: false,
              }),
              responseRow(consentId, documentId, optionalId),
            ]),
          );
          expect(declined.message).toContain(
            'a consent grant must affirm every required item of its document (consent_to_take_part)',
          );

          const optionalUnanswered = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {}, (consentId) => [
              responseRow(consentId, documentId, requiredId, {
                item_key: 'consent_to_take_part',
              }),
            ]),
          );
          expect(optionalUnanswered.message).toContain(
            'a consent grant must answer every item of its document (may_contact_again)',
          );
          expect(
            yield* newConsent(
              studyId,
              participantId,
              documentId,
              {},
              (consentId) => [
                responseRow(consentId, documentId, requiredId, {
                  item_key: 'consent_to_take_part',
                }),
                responseRow(consentId, documentId, optionalId, {
                  affirmed: false,
                }),
              ],
            ),
          ).toMatch(UUID);
        }),
      );

      it.effect(
        'deletes a grant only under the erasure marker or the purge',
        () =>
          Effect.gen(function* () {
            const { consentId, participantId } = yield* grantedConsent();
            const bystander = yield* grantedConsent();
            const remove = `DELETE FROM participant_consents WHERE id = $1`;
            const removeResponses = `DELETE FROM participant_consent_item_responses
                                   WHERE participant_consent_id = $1`;
            const guarded =
              'participant consent grants are deleted only by an audited erasure or the maintenance purge';

            yield* erasing(TEAM_A, participantId, removeResponses, [consentId]);

            expect(
              (yield* refusalOf(tenantAffected(TEAM_A, remove, [consentId])))
                .message,
            ).toContain(guarded);
            expect(
              (yield* refusalOf(
                erasing(TEAM_A, bystander.participantId, remove, [consentId]),
              )).message,
            ).toContain(guarded);
            expect(
              yield* erasing(TEAM_A, participantId, remove, [consentId]),
            ).toBe(1);

            yield* maintenanceAffected(removeResponses, [bystander.consentId]);
            expect(
              yield* maintenanceAffected(remove, [bystander.consentId]),
            ).toBe(1);
          }),
      );
    });

    describe('participant_consent_item_responses', () => {
      it.effect('rejects an item key that is not a machine key', () =>
        Effect.gen(function* () {
          const { studyId, participantId, documentId, itemId } =
            yield* publishedDocument();

          const refused = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {}, (consentId) => [
              responseRow(consentId, documentId, itemId, {
                item_key: 'Not A Key',
              }),
            ]),
          );
          expect(refused.constraint).toBe(
            'participant_consent_item_responses_item_key_check',
          );
        }),
      );

      it.effect(
        'refuses an item from a document other than the one consented to',
        () =>
          Effect.gen(function* () {
            const { studyId, participantId, documentId, itemId } =
              yield* publishedDocument();
            const otherDocumentId = yield* newDocument(studyId, {
              version: 2,
            });
            const foreignItemId = yield* newItem(otherDocumentId);
            const respond = (
              consentItemId: string,
              consentDocumentId: string,
            ) =>
              newConsent(
                studyId,
                participantId,
                documentId,
                {},
                (consentId) => [
                  responseRow(consentId, consentDocumentId, consentItemId),
                ],
              );

            expect(
              yield* refusalOf(respond(foreignItemId, documentId)),
            ).toMatchObject({
              state: '23503',
              constraint: 'participant_consent_item_responses_item_fk',
            });
            expect(
              yield* refusalOf(respond(foreignItemId, otherDocumentId)),
            ).toMatchObject({
              state: '23503',
              constraint: 'participant_consent_item_responses_consent_fk',
            });
            expect(yield* respond(itemId, documentId)).toMatch(UUID);
          }),
      );

      it.effect("refuses an item key that is not the named item's own", () =>
        Effect.gen(function* () {
          const { studyId, participantId, documentId, requiredId, optionalId } =
            yield* twoItemDocument();
          const respond = (itemKey: string) =>
            newConsent(studyId, participantId, documentId, {}, (consentId) => [
              responseRow(consentId, documentId, requiredId, {
                item_key: itemKey,
              }),
              responseRow(consentId, documentId, optionalId),
            ]);

          expect(yield* refusalOf(respond('may_contact_again'))).toMatchObject({
            state: '23503',
            constraint: 'participant_consent_item_responses_item_fk',
          });
          expect(yield* respond('consent_to_take_part')).toMatch(UUID);
        }),
      );

      it.effect('records one response per item and holds it immutable', () =>
        Effect.gen(function* () {
          const { studyId, participantId, documentId, itemId } =
            yield* publishedDocument();

          const repeated = yield* refusalOf(
            newConsent(studyId, participantId, documentId, {}, (consentId) => [
              responseRow(consentId, documentId, itemId),
              responseRow(consentId, documentId, itemId, { affirmed: false }),
            ]),
          );
          expect(repeated.constraint).toBe(
            'participant_consent_item_responses_pkey',
          );

          const consentId = yield* newConsent(
            studyId,
            participantId,
            documentId,
          );
          const rewritten = yield* refusalOf(
            ownerAffected(
              `UPDATE participant_consent_item_responses SET affirmed = false
               WHERE participant_consent_id = $1`,
              [consentId],
            ),
          );
          expect(rewritten.message).toContain(
            'participant consent grants are immutable',
          );
        }),
      );

      it.effect(
        'leaves no item for a response written after the grant to answer',
        () =>
          Effect.gen(function* () {
            const {
              studyId,
              participantId,
              documentId,
              requiredId,
              optionalId,
            } = yield* twoItemDocument();
            const consentId = yield* newConsent(
              studyId,
              participantId,
              documentId,
            );

            const late = yield* refusalOf(
              ownerInsert(
                'participant_consent_item_responses',
                responseRow(consentId, documentId, optionalId, {
                  affirmed: false,
                }),
              ),
            );
            expect(late.constraint).toBe(
              'participant_consent_item_responses_pkey',
            );
            yield* ownerAffected(
              `UPDATE participant_consents
               SET withdrawn_at = now(), withdrawn_by = 'participant' WHERE id = $1`,
              [consentId],
            );
            const afterWithdrawal = yield* refusalOf(
              ownerInsert(
                'participant_consent_item_responses',
                responseRow(consentId, documentId, optionalId, {
                  affirmed: false,
                }),
              ),
            );
            expect(afterWithdrawal.constraint).toBe(
              'participant_consent_item_responses_pkey',
            );

            expect(
              yield* newConsent(
                studyId,
                yield* newParticipant(studyId),
                documentId,
                {},
                (id) => [
                  responseRow(id, documentId, requiredId, {
                    item_key: 'consent_to_take_part',
                  }),
                  responseRow(id, documentId, optionalId),
                ],
              ),
            ).toMatch(UUID);
          }),
      );

      it.effect(
        'deletes a response only under the erasure marker or the purge',
        () =>
          Effect.gen(function* () {
            const { consentId, participantId } = yield* grantedConsent();
            const bystander = yield* grantedConsent();
            const remove = `DELETE FROM participant_consent_item_responses
                            WHERE participant_consent_id = $1`;
            const guarded =
              'participant consent responses are deleted only by an audited erasure or the maintenance purge';

            expect(
              (yield* refusalOf(tenantAffected(TEAM_A, remove, [consentId])))
                .message,
            ).toContain(guarded);
            expect(
              (yield* refusalOf(
                erasing(TEAM_A, bystander.participantId, remove, [consentId]),
              )).message,
            ).toContain(guarded);
            expect(
              yield* erasing(TEAM_A, participantId, remove, [consentId]),
            ).toBe(1);

            expect(
              yield* maintenanceAffected(remove, [bystander.consentId]),
            ).toBe(1);
          }),
      );
    });

    describe('tenancy', () => {
      it.effect('refuses a consent document written into another team', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const refused = yield* refusalOf(
            tenantAffected(
              TEAM_A,
              `INSERT INTO consent_documents
                 (id, team_id, study_id, version, title, body, content_hash)
               VALUES ($1, $2, $3, 7, 'Sheet', '{}'::jsonb, $4)`,
              [randomUUID(), TEAM_B, studyId, hash()],
            ),
          );
          expect(refused.state).toBe('42501');
        }),
      );
    });
  });
});
