import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { AUTH_TABLES } from '../db/auth-schema.ts';

// Completion is a permanent fact about this installation, independent of the
// lifecycle of its original owner and team. Their erasure leaves the singleton
// in place, so neither erasure nor a restart can reopen first-run setup.
const instance = pgTable(
  'studio_instance',
  {
    id: boolean('id').primaryKey().default(true),
    name: text('name').notNull(),
    initialOwnerUserId: text('initial_owner_user_id').references(
      () => AUTH_TABLES.user.id,
      { onDelete: 'set null' },
    ),
    initialTeamId: text('initial_team_id').references(
      () => AUTH_TABLES.teams.id,
      { onDelete: 'set null' },
    ),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('studio_instance_singleton_check', sql`${table.id}`),
    check(
      'studio_instance_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 120 AND ${table.name} ~ '[^[:space:]]'`,
    ),
  ],
);

export const INSTANCE_TABLES = { instance };

export const INSTANCE_SIDECAR_SQL = `
REVOKE UPDATE, DELETE, TRUNCATE ON studio_instance FROM studio_app, studio_maintenance;
CREATE OR REPLACE FUNCTION studio_instance_preserve_completion() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM studio_instance) THEN
    RAISE EXCEPTION 'First-run completion cannot be removed.' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS studio_instance_preserve_completion ON studio_instance;
CREATE TRIGGER studio_instance_preserve_completion
  BEFORE DELETE OR TRUNCATE ON studio_instance
  FOR EACH STATEMENT EXECUTE FUNCTION studio_instance_preserve_completion();
`;
