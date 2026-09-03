import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from './schema.ts';

const { studies } = STUDY_TABLES;

// The study tier of the role model. Team roles need no table of their own:
// better-auth's `team_members.role` (owner/admin/member) already carries the
// team Admin/Member taxonomy, with `owner` as the founding admin.
//
// One live grant of a study role to a user, plus the orthogonal PII flag.
// History lives in the audit log, not here: changing someone's role is an
// UPDATE and removing them is a DELETE, so this table is always current state.
const studyRoleGrants = pgTable(
  'study_role_grants',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    // Orthogonal to the role: without it, contact details are masked in UI,
    // exports, and API alike.
    piiAccess: boolean('pii_access').notNull().default(false),
    grantedByUserId: text('granted_by_user_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // One live grant per user per study. Changing someone's role is an
    // UPDATE; removing them is a DELETE; the audit log is the history.
    unique().on(table.studyId, table.userId),
    foreignKey({
      name: 'study_role_grants_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    // The hot path: "which studies may this user see", asked on every
    // study list render under #1257's Member visibility rule.
    index('study_role_grants_team_id_user_id_idx').on(
      table.teamId,
      table.userId,
    ),
    index('study_role_grants_team_id_study_id_idx').on(
      table.teamId,
      table.studyId,
    ),
    check(
      'study_role_grants_role_check',
      sql`${table.role} IN ('manager', 'protocol_designer', 'coordinator', 'data_viewer')`,
    ),
    check(
      'study_role_grants_identifier_lengths_check',
      sql`char_length(${table.userId}) BETWEEN 1 AND 255
          AND char_length(${table.grantedByUserId}) BETWEEN 1 AND 255`,
    ),
    teamIsolationPolicy(),
  ],
);

export const STUDY_ROLE_TABLES = { studyRoleGrants };

// Hashed into the schema fingerprint — whitespace counts. No trigger: a grant
// is current state, not evidence, so nothing about it needs freezing.
export const STUDY_ROLE_SIDECAR_SQL = `
${tenantTablesSql(['study_role_grants'])}
`;
