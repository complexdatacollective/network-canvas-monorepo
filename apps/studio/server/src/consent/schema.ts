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

import { ERASURE_GUC, STUDY_TABLES } from '../study/schema.ts';

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
    // The identity a response proves its item through: the document AND the
    // key. Without the key in the target, a response could name this item and
    // carry a sibling item's key, and both of its foreign keys would still be
    // satisfied — the copied key would then prove nothing about the terms.
    unique().on(table.id, table.consentDocumentId, table.key, table.teamId),
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
    // `participant_consents_document_published` proves the copy is the
    // document's own, so a well-formed digest cannot stand in for it.
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
    // The identity a response proves its consent through, document included.
    unique().on(table.id, table.consentDocumentId, table.teamId),
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
//
// The document and the item's key are both carried here so that both parents
// can be proven against them: a response pairs a consent with an item, and only
// a key both share can establish that the item belongs to the document version
// the participant actually accepted, and that the key exported beside the
// answer is that item's own. Without them, an immutable row could claim a
// participant affirmed or declined terms that were never in the version they
// signed, or file a real answer under another term's name.
const participantConsentItemResponses = pgTable(
  'participant_consent_item_responses',
  {
    teamId: text('team_id').notNull(),
    participantConsentId: uuid('participant_consent_id').notNull(),
    consentDocumentId: uuid('consent_document_id').notNull(),
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
      columns: [
        table.participantConsentId,
        table.consentDocumentId,
        table.teamId,
      ],
      foreignColumns: [
        participantConsents.id,
        participantConsents.consentDocumentId,
        participantConsents.teamId,
      ],
    }),
    // The copied key rides in the key, so the item's identity includes it: a
    // response that names a real item of the consented document but another
    // item's key is refused declaratively, before any trigger runs.
    foreignKey({
      name: 'participant_consent_item_responses_item_fk',
      columns: [
        table.consentItemId,
        table.consentDocumentId,
        table.itemKey,
        table.teamId,
      ],
      foreignColumns: [
        consentItems.id,
        consentItems.consentDocumentId,
        consentItems.key,
        consentItems.teamId,
      ],
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

-- A numbered document version is evidence of what participants were shown,
-- published or not once it has a number: deleting one would free
-- (study_id, version) for different words under the same number. Only the
-- maintenance purge, removing the whole study bottom-up, may delete it.
CREATE OR REPLACE FUNCTION consent_document_delete_is_purge() RETURNS trigger AS $$
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'consent documents are deleted only by the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_documents_delete_purge_only
  BEFORE DELETE ON consent_documents
  FOR EACH ROW EXECUTE FUNCTION consent_document_delete_is_purge();

-- Items belong to their document version. Once that version is published,
-- adding, removing, or rewording an item would change what an existing
-- consent record means. The one exception is the maintenance purge's DELETE:
-- a study is purged bottom-up, and the item key onto its document is NO
-- ACTION, so without this the document — and the study above it — could
-- never be removed once published.
CREATE OR REPLACE FUNCTION consent_items_are_frozen_after_publication() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  -- Both documents an UPDATE touches: the one the item leaves as much as
  -- the one it joins, or an item could be moved out of a published document
  -- into a draft and rewritten there.
  IF EXISTS (
    SELECT 1 FROM consent_documents d
    WHERE d.id IN (NEW.consent_document_id, OLD.consent_document_id)
      AND d.state <> 'draft'
  ) THEN
    RAISE EXCEPTION 'published consent documents are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON consent_items
  FOR EACH ROW EXECUTE FUNCTION consent_items_are_frozen_after_publication();

-- The grant is evidence; only the withdrawal columns move. DELETE is guarded
-- separately below, because participant erasure (#1270) legitimately removes
-- these rows and ordinary application code never may.
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

-- A consent captured inside a session was captured inside one of the
-- consenting participant's own sessions. The composite key proves the
-- session's study; only a lookup can prove its participant, and the grant
-- trigger above makes session_id immutable, so once at insert is enough.
-- AFTER the row, so the key reports a session of another study or team
-- first and this speaks only to a session the consent could otherwise cite.
CREATE OR REPLACE FUNCTION participant_consent_session_is_own() RETURNS trigger AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.id = NEW.session_id AND s.team_id = NEW.team_id
      AND s.study_id = NEW.study_id
      AND s.participant_id = NEW.participant_id
  ) THEN
    RAISE EXCEPTION 'a consent captured inside a session must name a session of the consenting participant';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_session_own
  AFTER INSERT ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_session_is_own();

-- A grant records what the participant was actually shown. The composite key
-- proves the document belongs to the consent's own study; only a lookup can
-- prove the two things that make the record evidence rather than an assertion:
-- that the document was published — a draft is still being edited, and its
-- items are still moving — and that the copied hash is that document's own.
-- Without the second, the column accepts any well-formed digest, and a record
-- that cannot be tied back to the words it was taken against says nothing.
--
-- Once at insert is enough, because participant_consent_grant_immutable makes
-- both columns immutable afterwards. AFTER the row, so the hash CHECK and the
-- three keys report first.
CREATE OR REPLACE FUNCTION participant_consent_document_is_published() RETURNS trigger AS $$
DECLARE
  document_state text;
  document_hash text;
BEGIN
  SELECT d.state, d.content_hash INTO document_state, document_hash
  FROM consent_documents d
  WHERE d.id = NEW.consent_document_id AND d.team_id = NEW.team_id;
  IF document_state IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'a participant may only consent to a published document (%)', document_state;
  END IF;
  IF document_hash IS DISTINCT FROM NEW.consent_content_hash THEN
    RAISE EXCEPTION 'a consent record must copy its own document''s content hash';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_document_published
  AFTER INSERT ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_document_is_published();

-- A grant with no affirmation of a required item is not consent, and a grant
-- that leaves any item unanswered is not the record of what the participant
-- saw: every item of the document — required affirmed, optional affirmed or
-- declined — has its response by the time the grant commits. The responses
-- are written after their consent inside the one transaction, so this can
-- only be asked at commit — hence a DEFERRABLE INITIALLY DEFERRED constraint
-- trigger, the only form that runs then. Completeness is also what fixes the
-- set: with every item answered, a response written later collides with the
-- primary key, so no later transaction can add an answer the participant
-- never gave. (Proving "the grant's own transaction" by the consent row's
-- \`xmin\` would not do it: a withdrawal updates that row, and the new tuple
-- looks freshly written.)
--
-- Deliberately not SECURITY DEFINER, for the reason network_rows_parent_is_writable
-- records: a definer function needs a pinned search_path, which breaks the
-- scratch-schema isolation the suites rely on. It therefore reads under the
-- committing transaction's own row visibility, which is the transaction that
-- wrote the grant everywhere except the seed — the one caller that re-stamps
-- the team GUC mid-transaction, and whose consents are written complete by
-- construction.
CREATE OR REPLACE FUNCTION participant_consent_required_items_are_affirmed() RETURNS trigger AS $$
DECLARE
  unanswered text;
  unaffirmed text;
BEGIN
  SELECT i.key INTO unanswered
  FROM consent_items i
  WHERE i.consent_document_id = NEW.consent_document_id
    AND i.team_id = NEW.team_id
    AND NOT EXISTS (
      SELECT 1 FROM participant_consent_item_responses r
      WHERE r.participant_consent_id = NEW.id AND r.consent_item_id = i.id
    )
  ORDER BY i.position
  LIMIT 1;
  IF unanswered IS NOT NULL THEN
    RAISE EXCEPTION 'a consent grant must answer every item of its document (%)', unanswered;
  END IF;
  SELECT i.key INTO unaffirmed
  FROM consent_items i
  WHERE i.consent_document_id = NEW.consent_document_id
    AND i.team_id = NEW.team_id
    AND i.required
    AND NOT EXISTS (
      SELECT 1 FROM participant_consent_item_responses r
      WHERE r.participant_consent_id = NEW.id
        AND r.consent_item_id = i.id
        AND r.affirmed
    )
  ORDER BY i.position
  LIMIT 1;
  IF unaffirmed IS NOT NULL THEN
    RAISE EXCEPTION 'a consent grant must affirm every required item of its document (%)', unaffirmed;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The one trigger here that cannot be CREATE OR REPLACEd: Postgres refuses
-- that form for a constraint trigger outright. DROP IF EXISTS first buys the
-- same idempotence, and a trigger cannot outlive the table it hangs off, so
-- there is nothing for the drop to leave behind either.
DROP TRIGGER IF EXISTS participant_consents_required_items_affirmed ON participant_consents;
CREATE CONSTRAINT TRIGGER participant_consents_required_items_affirmed
  AFTER INSERT ON participant_consents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION participant_consent_required_items_are_affirmed();

-- Deleting a consent record destroys the evidence that a participant agreed,
-- so the same two paths that may delete a session or a snapshot may delete
-- this, and nothing else may. The maintenance purge runs as
-- \`studio_maintenance\`; participant erasure runs as \`studio_app\`, the same role
-- as any buggy delete, and presents the transaction-scoped marker instead —
-- proven here against the row's own participant, so it authorizes erasing
-- exactly that participant's consent and no one else's.
CREATE OR REPLACE FUNCTION participant_consent_delete_is_audited() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF current_user = 'studio_maintenance'
     OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'participant consent grants are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_delete_audited
  BEFORE DELETE ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_delete_is_audited();

-- The same rule for the responses, whose participant is their consent's. The
-- erasure deletes them before the grant they hang off, so the lookup still
-- finds it.
CREATE OR REPLACE FUNCTION participant_consent_response_delete_is_audited() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM participant_consents c
    WHERE c.id = OLD.participant_consent_id AND c.team_id = OLD.team_id
      AND c.participant_id::text = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'participant consent responses are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consent_item_responses_delete_audited
  BEFORE DELETE ON participant_consent_item_responses
  FOR EACH ROW EXECUTE FUNCTION participant_consent_response_delete_is_audited();
${tenantTablesSql([
  'consent_documents',
  'consent_items',
  'participant_consents',
  'participant_consent_item_responses',
])}
`;
