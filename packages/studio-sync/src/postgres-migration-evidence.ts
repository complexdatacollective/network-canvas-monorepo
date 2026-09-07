import type pg from 'pg';

export type PostgresMigrationEvidenceRelations = Readonly<{
  history: Readonly<{ schema: string; name: string }>;
  fingerprint: Readonly<{ schema: string; name: string }>;
}>;

export class UnsafePostgresMigrationEvidenceError extends Error {
  constructor() {
    super('POSTGRES_MIGRATION_EVIDENCE_UNSAFE');
    this.name = 'UnsafePostgresMigrationEvidenceError';
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
 *
 * The caller owns the connection and transaction. This verifier is read-only.
 */
export async function assertSafePostgresMigrationEvidence(
  client: pg.Pool | pg.PoolClient,
  relations: PostgresMigrationEvidenceRelations,
): Promise<void> {
  const history = copyRelationIdentifier(relations.history);
  const fingerprint = copyRelationIdentifier(relations.fingerprint);
  if (
    !history ||
    !fingerprint ||
    (history.schema === fingerprint.schema && history.name === fingerprint.name)
  ) {
    throw new UnsafePostgresMigrationEvidenceError();
  }
  const result = await client.query<{ safe: boolean }>(
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
    ) AND NOT EXISTS (SELECT 1 FROM cascading_foreign_key_paths) AS safe`,
    [history.schema, history.name, fingerprint.schema, fingerprint.name],
  );
  if (result.rows[0]?.safe !== true) {
    throw new UnsafePostgresMigrationEvidenceError();
  }
}
