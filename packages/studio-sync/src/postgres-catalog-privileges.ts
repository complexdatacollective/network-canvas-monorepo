import type pg from 'pg';

import { validateRoleNames } from './role-bootstrap.ts';

// PostgreSQL 18 information_schema.sql grants these reads during initdb but
// does not record them in pg_init_privs. This is a source baseline, never the
// current ACL. Both name/kind and initdb/no-extension provenance must match.
// https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/catalog/information_schema.sql
// Reviewed source SHA256: 3c8aa2a9d43bfe1fe8880ade54a0a3a93cc3dbb8ee68c98a4c7189173df948e6
const INFORMATION_SCHEMA_PUBLIC_READS = [
  { name: 'administrable_role_authorizations', kind: 'v' },
  { name: 'applicable_roles', kind: 'v' },
  { name: 'attributes', kind: 'v' },
  { name: 'character_sets', kind: 'v' },
  { name: 'check_constraint_routine_usage', kind: 'v' },
  { name: 'check_constraints', kind: 'v' },
  { name: 'collation_character_set_applicability', kind: 'v' },
  { name: 'collations', kind: 'v' },
  { name: 'column_column_usage', kind: 'v' },
  { name: 'column_domain_usage', kind: 'v' },
  { name: 'column_options', kind: 'v' },
  { name: 'column_privileges', kind: 'v' },
  { name: 'column_udt_usage', kind: 'v' },
  { name: 'columns', kind: 'v' },
  { name: 'constraint_column_usage', kind: 'v' },
  { name: 'constraint_table_usage', kind: 'v' },
  { name: 'data_type_privileges', kind: 'v' },
  { name: 'domain_constraints', kind: 'v' },
  { name: 'domain_udt_usage', kind: 'v' },
  { name: 'domains', kind: 'v' },
  { name: 'element_types', kind: 'v' },
  { name: 'enabled_roles', kind: 'v' },
  { name: 'foreign_data_wrapper_options', kind: 'v' },
  { name: 'foreign_data_wrappers', kind: 'v' },
  { name: 'foreign_server_options', kind: 'v' },
  { name: 'foreign_servers', kind: 'v' },
  { name: 'foreign_table_options', kind: 'v' },
  { name: 'foreign_tables', kind: 'v' },
  { name: 'information_schema_catalog_name', kind: 'v' },
  { name: 'key_column_usage', kind: 'v' },
  { name: 'parameters', kind: 'v' },
  { name: 'referential_constraints', kind: 'v' },
  { name: 'role_column_grants', kind: 'v' },
  { name: 'role_routine_grants', kind: 'v' },
  { name: 'role_table_grants', kind: 'v' },
  { name: 'role_udt_grants', kind: 'v' },
  { name: 'role_usage_grants', kind: 'v' },
  { name: 'routine_column_usage', kind: 'v' },
  { name: 'routine_privileges', kind: 'v' },
  { name: 'routine_routine_usage', kind: 'v' },
  { name: 'routine_sequence_usage', kind: 'v' },
  { name: 'routine_table_usage', kind: 'v' },
  { name: 'routines', kind: 'v' },
  { name: 'schemata', kind: 'v' },
  { name: 'sequences', kind: 'v' },
  { name: 'sql_features', kind: 'r' },
  { name: 'sql_implementation_info', kind: 'r' },
  { name: 'sql_sizing', kind: 'r' },
  { name: 'table_constraints', kind: 'v' },
  { name: 'table_privileges', kind: 'v' },
  { name: 'tables', kind: 'v' },
  { name: 'triggered_update_columns', kind: 'v' },
  { name: 'triggers', kind: 'v' },
  { name: 'udt_privileges', kind: 'v' },
  { name: 'usage_privileges', kind: 'v' },
  { name: 'user_defined_types', kind: 'v' },
  { name: 'user_mapping_options', kind: 'v' },
  { name: 'user_mappings', kind: 'v' },
  { name: 'view_column_usage', kind: 'v' },
  { name: 'view_routine_usage', kind: 'v' },
  { name: 'view_table_usage', kind: 'v' },
  { name: 'views', kind: 'v' },
];

/** Refuse system-catalog capabilities beyond PostgreSQL 18's stock PUBLIC
 * baseline. The caller owns the transaction and supplies every restricted
 * session/runtime/backup identity; this does not discover or authorize roles.
 * Failures contain only fixed codes, including database/query failures.
 * Reserved pg_* namespaces include temporary relations; these have no stock baseline.
 * Object definitions and catalog integrity remain an administrator boundary.
 * Stock pg_settings UPDATE is the documented session SET interface, so callers
 * must retain their forbidden-parameter checks and explicit large-object denylist.
 * https://www.postgresql.org/docs/18/view-pg-settings.html */
export async function assertSafePostgresCatalogPrivileges(
  client: pg.PoolClient,
  restrictedIdentities: readonly string[],
): Promise<void> {
  let identities: string[];
  try {
    if (!Array.isArray(restrictedIdentities)) throw new Error();
    const copied: unknown[] = [...restrictedIdentities];
    if (
      !copied.every(
        (identity): identity is string => typeof identity === 'string',
      )
    ) {
      throw new Error();
    }
    validateRoleNames(copied);
    identities = copied;
  } catch {
    throw new Error('POSTGRES_CATALOG_PRIVILEGES_INVALID');
  }

  // Normal object OIDs start at 16384. Missing initprivs is a default only
  // for a genuine stock initdb object; extension/unknown ACLs are not baseline.
  // https://www.postgresql.org/docs/18/system-catalog-initial-data.html#SYSTEM-CATALOG-OID-ASSIGNMENT
  // https://www.postgresql.org/docs/18/catalog-pg-init-privs.html
  // The only extension exception is initdb's three exact plpgsql handlers:
  // https://github.com/postgres/postgres/blob/REL_18_STABLE/src/pl/plpgsql/src/plpgsql--1.0.sql
  try {
    const result = await client.query<{ safe: boolean }>(
      `WITH identities AS MATERIALIZED (
        SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])
      ), namespaces AS MATERIALIZED (
        SELECT oid, nspname, nspowner FROM pg_catalog.pg_namespace
        WHERE nspname ~ '^pg_' OR nspname = 'information_schema'
      ), extension_objects AS MATERIALIZED (
        SELECT dependency.classid, dependency.objid, extension.extname
        FROM pg_catalog.pg_depend dependency
        JOIN pg_catalog.pg_extension extension ON extension.oid = dependency.refobjid
        WHERE dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
          AND dependency.deptype = 'e'
      ), routines AS MATERIALIZED (
        SELECT routine.oid, routine.prosecdef,
          CASE WHEN routine.oid < 16384 AND (
            extension.objid IS NULL OR (
              extension.extname = 'plpgsql' AND namespace.nspname = 'pg_catalog'
              AND routine.prokind = 'f' AND (
                (routine.proname = 'plpgsql_call_handler' AND routine.pronargs = 0
                  AND routine.prorettype = 'pg_catalog.language_handler'::pg_catalog.regtype)
                OR (routine.proname = 'plpgsql_inline_handler'
                  AND routine.proargtypes = ARRAY['pg_catalog.internal'::pg_catalog.regtype]::pg_catalog.oidvector
                  AND routine.prorettype = 'pg_catalog.void'::pg_catalog.regtype)
                OR (routine.proname = 'plpgsql_validator'
                  AND routine.proargtypes = ARRAY['pg_catalog.oid'::pg_catalog.regtype]::pg_catalog.oidvector
                  AND routine.prorettype = 'pg_catalog.void'::pg_catalog.regtype)
              )
            )
          ) THEN CASE
            WHEN initial.privtype = 'i' THEN initial.initprivs
            WHEN initial.objoid IS NULL THEN pg_catalog.acldefault('f', routine.proowner)
            ELSE NULL::pg_catalog.aclitem[] END
          ELSE NULL::pg_catalog.aclitem[] END AS baseline
        FROM pg_catalog.pg_proc routine
        JOIN namespaces namespace ON namespace.oid = routine.pronamespace
        LEFT JOIN extension_objects extension ON extension.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND extension.objid = routine.oid
        LEFT JOIN pg_catalog.pg_init_privs initial ON initial.classoid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND initial.objoid = routine.oid AND initial.objsubid = 0
      ), routine_reads AS MATERIALIZED (
        SELECT routine.oid, routine.prosecdef, EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(routine.baseline) privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_execute FROM routines routine
      ), stock_information_schema AS MATERIALIZED (
        SELECT * FROM pg_catalog.jsonb_to_recordset($2::pg_catalog.jsonb) AS stock(name pg_catalog.text, kind pg_catalog.text)
      ), relations AS MATERIALIZED (
        SELECT relation.oid, relation.relkind,
          relation.oid < 16384 AND extension.objid IS NULL AS stock,
          relation.oid < 16384 AND extension.objid IS NULL
            AND namespace.nspname = 'pg_catalog' AND relation.relname = 'pg_settings'
            AND relation.relkind = 'v' AND initial.privtype = 'i'
            AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(initial.initprivs) privilege
              WHERE privilege.grantee = 0 AND privilege.privilege_type = 'UPDATE')
            AS settings_update,
          relation.oid < 16384 AND extension.objid IS NULL
            AND initial.objoid IS NULL AND namespace.nspname = 'information_schema'
            AND EXISTS (SELECT 1 FROM stock_information_schema stock
              WHERE stock.name = relation.relname AND stock.kind = relation.relkind)
            AS information_schema_read,
          CASE WHEN relation.oid < 16384 AND extension.objid IS NULL THEN CASE
            WHEN initial.privtype = 'i' THEN initial.initprivs
            WHEN initial.objoid IS NULL THEN pg_catalog.acldefault(
              CASE WHEN relation.relkind = 'S' THEN 's'::pg_catalog."char" ELSE 'r'::pg_catalog."char" END, relation.relowner)
            ELSE NULL::pg_catalog.aclitem[] END
          ELSE NULL::pg_catalog.aclitem[] END AS baseline
        FROM pg_catalog.pg_class relation
        JOIN namespaces namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN extension_objects extension ON extension.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND extension.objid = relation.oid
        LEFT JOIN pg_catalog.pg_init_privs initial ON initial.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND initial.objoid = relation.oid AND initial.objsubid = 0
        WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 't', 'S')
      ), relation_reads AS MATERIALIZED (
        SELECT relation.oid, relation.relkind, relation.stock, relation.settings_update,
          relation.information_schema_read OR EXISTS (
            SELECT 1 FROM pg_catalog.aclexplode(relation.baseline) privilege
            WHERE privilege.grantee = 0 AND privilege.privilege_type = 'SELECT'
          ) AS public_select FROM relations relation
      ), column_reads AS MATERIALIZED (
        SELECT relation.oid, attribute.attnum, relation.settings_update,
          relation.public_select OR (relation.stock AND initial.privtype = 'i' AND EXISTS (
            SELECT 1 FROM pg_catalog.aclexplode(initial.initprivs) privilege
            WHERE privilege.grantee = 0 AND privilege.privilege_type = 'SELECT'
          )) AS public_select
        FROM relation_reads relation
        JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
          AND attribute.attnum <> 0 AND NOT attribute.attisdropped
        LEFT JOIN pg_catalog.pg_init_privs initial ON initial.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND initial.objoid = relation.oid AND initial.objsubid = attribute.attnum
        WHERE relation.relkind <> 'S'
      ) SELECT pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 = 18
        AND (SELECT count(*) FROM identities) = pg_catalog.cardinality($1::pg_catalog.text[])
        AND NOT EXISTS (
          SELECT 1 FROM identities identity CROSS JOIN namespaces namespace
          WHERE namespace.nspowner = identity.oid
            OR pg_catalog.has_schema_privilege(identity.oid, namespace.oid,
              'CREATE,USAGE WITH GRANT OPTION')
        )
        AND NOT EXISTS (SELECT 1 FROM routine_reads routine WHERE routine.prosecdef)
        AND NOT EXISTS (
          SELECT 1 FROM identities identity CROSS JOIN routine_reads routine
          WHERE pg_catalog.has_function_privilege(identity.oid, routine.oid, 'EXECUTE WITH GRANT OPTION')
            OR (NOT routine.public_execute
              AND pg_catalog.has_function_privilege(identity.oid, routine.oid, 'EXECUTE'))
        ) AND NOT EXISTS (
          SELECT 1 FROM identities identity CROSS JOIN relation_reads relation
          WHERE CASE WHEN relation.relkind = 'S' THEN
            pg_catalog.has_sequence_privilege(identity.oid, relation.oid,
              'USAGE,UPDATE,SELECT WITH GRANT OPTION,USAGE WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            OR (NOT relation.public_select
              AND pg_catalog.has_sequence_privilege(identity.oid, relation.oid, 'SELECT'))
          ELSE
            pg_catalog.has_table_privilege(identity.oid, relation.oid,
              'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            OR (NOT COALESCE(relation.settings_update, false)
              AND pg_catalog.has_table_privilege(identity.oid, relation.oid, 'UPDATE'))
            OR (NOT relation.public_select
              AND pg_catalog.has_table_privilege(identity.oid, relation.oid, 'SELECT'))
          END
        ) AND NOT EXISTS (
          SELECT 1 FROM identities identity CROSS JOIN column_reads attribute
          WHERE pg_catalog.has_column_privilege(identity.oid, attribute.oid, attribute.attnum,
            'INSERT,REFERENCES,SELECT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            OR (NOT COALESCE(attribute.settings_update, false)
              AND pg_catalog.has_column_privilege(identity.oid, attribute.oid, attribute.attnum, 'UPDATE'))
            OR (NOT COALESCE(attribute.public_select, false)
              AND pg_catalog.has_column_privilege(identity.oid, attribute.oid, attribute.attnum, 'SELECT'))
        ) AS safe`,
      [identities, JSON.stringify(INFORMATION_SCHEMA_PUBLIC_READS)],
    );
    if (result.rows[0]?.safe !== true) throw new Error();
  } catch {
    throw new Error('POSTGRES_CATALOG_PRIVILEGES_UNSAFE');
  }
}
