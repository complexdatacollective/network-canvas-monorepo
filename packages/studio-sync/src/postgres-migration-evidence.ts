import type pg from 'pg';

import { validateRoleNames } from './role-bootstrap.ts';

export type PostgresMigrationEvidenceRelations = Readonly<{
  history: Readonly<{ schema: string; name: string }>;
  fingerprint: Readonly<{ schema: string; name: string }>;
}>;

export class UnsafePostgresMigrationEvidenceError extends Error {
  readonly reason: 'relations' | 'trigger' | 'rewrite';

  constructor(
    reason: UnsafePostgresMigrationEvidenceError['reason'] = 'relations',
  ) {
    super('POSTGRES_MIGRATION_EVIDENCE_UNSAFE');
    this.name = 'UnsafePostgresMigrationEvidenceError';
    this.reason = reason;
  }
}

function copyRelationIdentifier(
  candidate: unknown,
): { schema: string; name: string } | undefined {
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('schema' in candidate) ||
    !('name' in candidate)
  ) {
    return undefined;
  }
  const { schema, name } = candidate;
  if (
    typeof schema !== 'string' ||
    schema.length === 0 ||
    typeof name !== 'string' ||
    name.length === 0
  ) {
    return undefined;
  }
  return { schema, name };
}

/**
 * Verify the catalog shape that makes migration history and its fingerprint
 * trustworthy before either relation is read. Evidence is always authored as
 * a standalone ordinary table. Inheritance, partition routing, and referential
 * actions can otherwise mutate it through another relation's privileges.
 * Protected identities include their effective INHERIT and SET ROLE reachability;
 * NOINHERIT alone does not make an independently settable writer safe.
 *
 * The caller owns the connection and transaction. This verifier is read-only.
 */
export async function assertSafePostgresMigrationEvidence(
  client: pg.Pool | pg.PoolClient,
  relations: PostgresMigrationEvidenceRelations,
  protectedRoles: readonly string[],
): Promise<void> {
  let roles: string[];
  try {
    if (!Array.isArray(protectedRoles)) throw new Error();
    const copied: unknown[] = [...protectedRoles];
    if (!copied.every((role): role is string => typeof role === 'string'))
      throw new Error();
    // An empty set is only for the explicit unversioned development caller;
    // production callers provide their complete restricted identity inventory.
    if (copied.length) validateRoleNames(copied);
    roles = copied;
  } catch {
    throw new UnsafePostgresMigrationEvidenceError();
  }
  const history = copyRelationIdentifier(relations.history);
  const fingerprint = copyRelationIdentifier(relations.fingerprint);
  if (
    !history ||
    !fingerprint ||
    (history.schema === fingerprint.schema && history.name === fingerprint.name)
  ) {
    throw new UnsafePostgresMigrationEvidenceError();
  }
  const result = await client.query<{
    safe: boolean;
    definer_triggers: boolean;
    rewrite_rules: boolean;
  }>(
    `WITH RECURSIVE requested(schema_name, relation_name) AS (
      VALUES ($1::pg_catalog.text, $2::pg_catalog.text),
        ($3::pg_catalog.text, $4::pg_catalog.text)
    ), evidence(oid) AS MATERIALIZED (
      SELECT relation.oid
      FROM requested
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.nspname = requested.schema_name
      JOIN pg_catalog.pg_class relation
        ON relation.relnamespace = namespace.oid
        AND relation.relname = requested.relation_name
    ), protected AS MATERIALIZED (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ANY($5::pg_catalog.text[])
    ), reachable AS MATERIALIZED (
      SELECT identity.oid FROM pg_catalog.pg_roles identity WHERE EXISTS (
        SELECT 1 FROM protected WHERE
          pg_catalog.pg_has_role(protected.oid, identity.oid, 'USAGE')
          OR pg_catalog.pg_has_role(protected.oid, identity.oid, 'SET')
      )
    ), cascading_foreign_key_paths(parent, child, path) AS (
      SELECT fk.confrelid, fk.conrelid,
        ARRAY[fk.conrelid, fk.confrelid]::pg_catalog.oid[]
      FROM pg_catalog.pg_constraint fk
      JOIN evidence ON evidence.oid = fk.conrelid
      WHERE fk.contype = 'f'
        AND (fk.confupdtype IN ('c', 'n', 'd')
          OR fk.confdeltype IN ('c', 'n', 'd'))
      UNION ALL
      SELECT fk.confrelid, fk.conrelid, path.path || fk.confrelid
      FROM cascading_foreign_key_paths path
      JOIN pg_catalog.pg_constraint fk ON fk.conrelid = path.parent
      WHERE fk.contype = 'f'
        AND (fk.confupdtype IN ('c', 'n', 'd')
          OR fk.confdeltype IN ('c', 'n', 'd'))
        AND NOT fk.confrelid = ANY(path.path)
    ) SELECT NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class relation
      WHERE relation.oid IN (SELECT oid FROM evidence)
        AND (relation.relkind <> 'r' OR relation.relispartition OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_inherits inheritance
          WHERE inheritance.inhrelid = relation.oid
            OR inheritance.inhparent = relation.oid
        ))
    ) AND NOT EXISTS (SELECT 1 FROM cascading_foreign_key_paths)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles identity CROSS JOIN pg_catalog.pg_class relation
      WHERE identity.oid IN (SELECT oid FROM reachable)
        AND relation.oid IN (SELECT oid FROM evidence)
        AND CASE WHEN relation.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
          relation.relowner = identity.oid
          OR pg_catalog.has_table_privilege(identity.oid, relation.oid,
            'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
          OR pg_catalog.has_any_column_privilege(identity.oid, relation.oid,
            'INSERT,UPDATE,REFERENCES,SELECT WITH GRANT OPTION')
        ) ELSE false END
    ) AS safe, EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger trigger
      JOIN pg_catalog.pg_proc routine ON routine.oid = trigger.tgfoid
      JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE routine.prosecdef AND namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
    ) AS definer_triggers, EXISTS (
      SELECT 1 FROM pg_catalog.pg_rewrite rule
      JOIN pg_catalog.pg_class relation ON relation.oid = rule.ev_class
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE rule.ev_type <> '1' AND namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
    ) AS rewrite_rules`,
    [history.schema, history.name, fingerprint.schema, fingerprint.name, roles],
  );
  // A trigger does not require EXECUTE at firing time; non-SELECT rewrite
  // actions also use owner privileges. Preserve the migration policy for all
  // application relations, including disabled definitions and indirect paths.
  const evidence = result.rows[0];
  if (!evidence) throw new UnsafePostgresMigrationEvidenceError();
  if (evidence.definer_triggers)
    throw new UnsafePostgresMigrationEvidenceError('trigger');
  if (evidence.rewrite_rules)
    throw new UnsafePostgresMigrationEvidenceError('rewrite');
  if (!evidence.safe) {
    throw new UnsafePostgresMigrationEvidenceError();
  }
}
