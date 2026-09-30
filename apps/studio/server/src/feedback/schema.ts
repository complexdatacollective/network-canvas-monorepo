import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studies } = STUDY_TABLES;

// Team-scoped: a report may name a study and quote researcher-authored text,
// so it belongs inside the tenant boundary even though triage routes outward.
// A participant may type anything into `body`, and it is read under the same
// team-boundary rules as any other study data.
const feedbackReports = pgTable(
  'feedback_reports',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id'),
    reporterKind: text('reporter_kind').notNull(),
    reporterUserId: text('reporter_user_id'),
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    // Route, protocol/stage ids, app and schema versions — attached only
    // when the reporter agreed to send it.
    context: jsonb('context')
      .notNull()
      .default(sql`'{}'::jsonb`),
    contextConsent: boolean('context_consent').notNull().default(false),
    state: text('state').notNull().default('new'),
    // #1320 routes a report to the team's triage (e.g. GitHub); the link back
    // is the only thing this table needs to know about that.
    externalRef: text('external_ref'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    foreignKey({
      name: 'feedback_reports_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    index('feedback_reports_team_id_state_created_at_idx').on(
      table.teamId,
      table.state,
      table.createdAt.desc(),
    ),
    check(
      'feedback_reports_reporter_kind_check',
      sql`${table.reporterKind} IN ('user', 'participant', 'anonymous')
          AND (${table.reporterKind} = 'user') = (${table.reporterUserId} IS NOT NULL)`,
    ),
    check(
      'feedback_reports_kind_check',
      sql`${table.kind} IN ('bug', 'suggestion')`,
    ),
    check(
      'feedback_reports_state_check',
      sql`${table.state} IN ('new', 'triaged', 'forwarded', 'closed')
          AND (${table.state} = 'new') = (${table.triagedAt} IS NULL)`,
    ),
    // No context may be stored without consent: the checked box is the
    // gate, expressed in the database rather than only in the form.
    check(
      'feedback_reports_context_consent_check',
      sql`${table.contextConsent} OR ${table.context} = '{}'::jsonb`,
    ),
    check(
      'feedback_reports_context_object_check',
      sql`jsonb_typeof(${table.context}) = 'object'
          AND pg_column_size(${table.context}) <= 4096`,
    ),
    check(
      'feedback_reports_lengths_check',
      sql`char_length(${table.body}) BETWEEN 1 AND 5000
          AND ${table.body} ~ '[^[:space:]]'
          AND (${table.externalRef} IS NULL OR char_length(${table.externalRef}) BETWEEN 1 AND 500)
          AND (${table.reporterUserId} IS NULL OR char_length(${table.reporterUserId}) BETWEEN 1 AND 255)`,
    ),
    teamIsolationPolicy(),
  ],
);

export const FEEDBACK_TABLES = { feedbackReports };

// Hashed into the schema fingerprint — whitespace counts. No triggers: every
// column here is triage state a researcher may legitimately revise.
export const FEEDBACK_SIDECAR_SQL = `
${tenantTablesSql(['feedback_reports'])}
`;
