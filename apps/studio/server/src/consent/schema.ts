import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studies, participants, interviewSessions } = STUDY_TABLES;

// E-consent binds to the STUDY, not the protocol: consent is an onboarding
// concern, and a study may re-consent its participants without republishing a
// protocol version.
//
// Declaration order is forced by drizzle evaluating `foreignColumns` eagerly:
//   consent_documents -> consent_items -> participant_consents
//   -> participant_consent_item_responses
// (`participant_consents` references documents, participants and sessions;
// the response rows reference consents and items, so there is no cycle.)

// One immutable, numbered version of a study's consent document: the
// information sheet plus the affirmation items attached to it. A participant's
// consent record names exactly one of these rows.
const consentDocuments = pgTable(
  'consent_documents',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    version: integer('version').notNull(),
    state: text('state').notNull().default('draft'),
    locale: text('locale').notNull().default('en'),
    title: text('title').notNull(),
    // The information sheet, as the same Zod-validated JSONB posture the
    // protocol store uses for section documents. Rich text, not markup.
    body: jsonb('body').notNull(),
    // sha256 hex of the canonical serialization of (title, body, items).
    // Two participants who consented to the same hash saw the same words.
    contentHash: text('content_hash').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.id, table.studyId, table.teamId),
    unique().on(table.studyId, table.version),
    foreignKey({
      name: 'consent_documents_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    index('consent_documents_team_id_study_id_idx').on(
      table.teamId,
      table.studyId,
    ),
    check('consent_documents_version_check', sql`${table.version} >= 1`),
    check(
      'consent_documents_state_check',
      sql`${table.state} IN ('draft', 'published', 'retired')`,
    ),
    // A published document is evidence: publication and retirement
    // timestamps must agree with the state, or the audit trail lies.
    check(
      'consent_documents_state_evidence_check',
      sql`(${table.state} = 'draft') = (${table.publishedAt} IS NULL)
          AND (${table.state} = 'retired') = (${table.retiredAt} IS NOT NULL)`,
    ),
    check(
      'consent_documents_content_hash_check',
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'consent_documents_body_object_check',
      sql`jsonb_typeof(${table.body}) = 'object'`,
    ),
    check(
      'consent_documents_lengths_check',
      sql`char_length(${table.title}) BETWEEN 1 AND 320
          AND ${table.title} ~ '[^[:space:]]'
          AND char_length(${table.locale}) BETWEEN 2 AND 35`,
    ),
    teamIsolationPolicy(),
  ],
);

// The affirmation items inside one document version: the tick-boxes a
// participant must (or may) agree to.
const consentItems = pgTable(
  'consent_items',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    consentDocumentId: uuid('consent_document_id').notNull(),
    position: integer('position').notNull(),
    // A stable machine key, so an export column keeps its meaning across
    // document versions that reorder or reword the item.
    key: text('key').notNull(),
    prompt: text('prompt').notNull(),
    required: boolean('required').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.consentDocumentId, table.position),
    unique().on(table.consentDocumentId, table.key),
    foreignKey({
      name: 'consent_items_document_fk',
      columns: [table.consentDocumentId, table.teamId],
      foreignColumns: [consentDocuments.id, consentDocuments.teamId],
    }),
    index('consent_items_team_id_consent_document_id_idx').on(
      table.teamId,
      table.consentDocumentId,
    ),
    check('consent_items_position_check', sql`${table.position} >= 1`),
    check(
      'consent_items_key_check',
      sql`${table.key} ~ '^[a-z][a-z0-9_]{0,63}$'`,
    ),
    check(
      'consent_items_prompt_check',
      sql`char_length(${table.prompt}) BETWEEN 1 AND 2000
          AND ${table.prompt} ~ '[^[:space:]]'`,
    ),
    teamIsolationPolicy(),
  ],
);

// The auditable record: who consented, to which document version, when, and
// whether they later withdrew.
const participantConsents = pgTable(
  'participant_consents',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    consentDocumentId: uuid('consent_document_id').notNull(),
    // Copied at grant time: the document may later be retired, and the
    // record must still say what was agreed to without a join.
    consentContentHash: text('consent_content_hash').notNull(),
    // Nullable: consent may be captured outside a session (researcher-led
    // onboarding) or inside one (fully remote onboarding).
    sessionId: uuid('session_id'),
    method: text('method').notNull().default('affirmation'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnBy: text('withdrawn_by'),
    withdrawalNote: text('withdrawal_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.id, table.studyId, table.teamId),
    // One record per participant per document version. Re-consent to a new
    // version is a new row, so the history is the row set.
    unique().on(table.participantId, table.consentDocumentId),
    foreignKey({
      name: 'participant_consents_participant_fk',
      columns: [table.participantId, table.studyId, table.teamId],
      foreignColumns: [
        participants.id,
        participants.studyId,
        participants.teamId,
      ],
    }),
    foreignKey({
      name: 'participant_consents_document_fk',
      columns: [table.consentDocumentId, table.studyId, table.teamId],
      foreignColumns: [
        consentDocuments.id,
        consentDocuments.studyId,
        consentDocuments.teamId,
      ],
    }),
    foreignKey({
      name: 'participant_consents_session_fk',
      columns: [table.sessionId, table.studyId, table.teamId],
      foreignColumns: [
        interviewSessions.id,
        interviewSessions.studyId,
        interviewSessions.teamId,
      ],
    }),
    index('participant_consents_team_id_study_id_participant_id_idx').on(
      table.teamId,
      table.studyId,
      table.participantId,
    ),
    // The withdrawal worklist: #1270 acts on these.
    index('participant_consents_team_id_withdrawn_at_idx')
      .on(table.teamId, table.withdrawnAt)
      .where(sql`withdrawn_at is not null`),
    check(
      'participant_consents_method_check',
      sql`${table.method} IN ('affirmation')`,
    ),
    check(
      'participant_consents_withdrawal_check',
      sql`(${table.withdrawnAt} IS NULL) = (${table.withdrawnBy} IS NULL)
          AND (${table.withdrawnAt} IS NULL OR ${table.withdrawnAt} >= ${table.grantedAt})
          AND (${table.withdrawalNote} IS NULL OR ${table.withdrawnAt} IS NOT NULL)`,
    ),
    check(
      'participant_consents_withdrawn_by_check',
      sql`${table.withdrawnBy} IS NULL
          OR ${table.withdrawnBy} IN ('participant', 'researcher')`,
    ),
    check(
      'participant_consents_content_hash_check',
      sql`${table.consentContentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'participant_consents_withdrawal_note_check',
      sql`${table.withdrawalNote} IS NULL
          OR char_length(${table.withdrawalNote}) BETWEEN 1 AND 1000`,
    ),
    teamIsolationPolicy(),
  ],
);

// Which affirmation items the participant actually agreed to. Without this, an
// optional item's answer is unrecoverable.
const participantConsentItemResponses = pgTable(
  'participant_consent_item_responses',
  {
    teamId: text('team_id').notNull(),
    participantConsentId: uuid('participant_consent_id').notNull(),
    consentItemId: uuid('consent_item_id').notNull(),
    // The item's key at grant time, so an export column survives the item
    // row being superseded by a later document version.
    itemKey: text('item_key').notNull(),
    affirmed: boolean('affirmed').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.participantConsentId, table.consentItemId],
    }),
    foreignKey({
      name: 'participant_consent_item_responses_consent_fk',
      columns: [table.participantConsentId, table.teamId],
      foreignColumns: [participantConsents.id, participantConsents.teamId],
    }),
    foreignKey({
      name: 'participant_consent_item_responses_item_fk',
      columns: [table.consentItemId, table.teamId],
      foreignColumns: [consentItems.id, consentItems.teamId],
    }),
    index('participant_consent_item_responses_team_id_item_key_idx').on(
      table.teamId,
      table.itemKey,
    ),
    check(
      'participant_consent_item_responses_item_key_check',
      sql`${table.itemKey} ~ '^[a-z][a-z0-9_]{0,63}$'`,
    ),
    teamIsolationPolicy(),
  ],
);

export const CONSENT_TABLES = {
  consentDocuments,
  consentItems,
  participantConsents,
  participantConsentItemResponses,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const CONSENT_SIDECAR_SQL = `
-- A published consent document is what participants agreed to. Its words,
-- its items, and its version number may never move afterwards; only
-- retirement may.
CREATE OR REPLACE FUNCTION consent_documents_publication_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published consent documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_documents_publication_immutable
  BEFORE UPDATE ON consent_documents
  FOR EACH ROW
  WHEN (
    OLD.state <> 'draft'
    AND (
      NEW.study_id IS DISTINCT FROM OLD.study_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.locale IS DISTINCT FROM OLD.locale
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
    )
  )
  EXECUTE FUNCTION consent_documents_publication_is_immutable();

-- Items belong to their document version. Once that version is published,
-- adding, removing, or rewording an item would change what an existing
-- consent record means.
CREATE OR REPLACE FUNCTION consent_items_are_frozen_after_publication() RETURNS trigger AS $$
DECLARE
  document_state text;
BEGIN
  SELECT state INTO document_state FROM consent_documents
  WHERE id = COALESCE(NEW.consent_document_id, OLD.consent_document_id);
  IF document_state IS NOT NULL AND document_state <> 'draft' THEN
    RAISE EXCEPTION 'published consent documents are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON consent_items
  FOR EACH ROW EXECUTE FUNCTION consent_items_are_frozen_after_publication();

-- The grant is evidence; only the withdrawal columns move. DELETE stays
-- open: participant erasure (#1270) removes these rows.
CREATE OR REPLACE FUNCTION participant_consent_grant_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'participant consent grants are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consent_grant_immutable
  BEFORE UPDATE ON participant_consents
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.consent_document_id IS DISTINCT FROM OLD.consent_document_id
    OR NEW.consent_content_hash IS DISTINCT FROM OLD.consent_content_hash
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
  )
  EXECUTE FUNCTION participant_consent_grant_is_immutable();

CREATE OR REPLACE TRIGGER participant_consent_item_responses_immutable
  BEFORE UPDATE ON participant_consent_item_responses
  FOR EACH ROW EXECUTE FUNCTION participant_consent_grant_is_immutable();
${tenantTablesSql([
  'consent_documents',
  'consent_items',
  'participant_consents',
  'participant_consent_item_responses',
])}
`;
