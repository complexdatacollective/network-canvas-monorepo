import { Effect, Exit, Schema } from 'effect';
import type { SqlClient } from 'effect/sql';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import { ERASURE_GUC } from '../study/schema.ts';
import { OwnerDatabase } from './client.ts';
import { deepestMessage, sqlState } from './errors.ts';
import {
  createHistoryTable,
  HISTORY_TABLE,
  historyVerdict,
  type ImageMigration,
  MigrationHistoryRefused,
  readHistory,
  recordApplied,
  refusalFor,
  revokeHistory,
} from './history.ts';
import {
  type DocumentMigration,
  MigrationsDocument,
  MigrationsDocumentRefused,
  type VerifiedMigrations,
  verifyMigrations,
} from './migrations-document.ts';
import {
  SCHEMA_LOCK_KEY,
  SCHEMA_TABLES,
  stampFingerprintEffect,
} from './schema.ts';
import { splitStatements } from './statements.ts';
import { OwnerScope, Transaction } from './tenant.ts';

// `studio-api migrate` (#1901): apply the numbered migrations this image
// carries that the database has not recorded, in one transaction, under the
// schema lock. drizzle's and Effect's migrators were both ruled out (#1901
// decision log, 2026-09-16): neither verifies hashes, refuses reordered or
// newer history, or holds a lock across the check and the transaction.

export type MigrateOutcome =
  | { readonly kind: 'current' }
  | { readonly kind: 'applied'; readonly versions: readonly string[] };

export type MigrateLogger = (line: string) => void;

export type MigrateOptions<E = never, R = never> = {
  readonly log?: MigrateLogger;
  /** Recorded in `studio_migrations.applied_by`: the image's `STUDIO_VERSION`. */
  readonly appliedBy?: string;
  /**
   * Runs inside the migration transaction, as the owner, after every pending
   * migration and the stamp and before the commit (and on a current database
   * too). A failure rolls the whole run back, so a check that refuses the
   * upgraded database — the keyring check — leaves it at its previous release
   * rather than one the operator can no longer roll back from.
   */
  readonly beforeCommit?: Effect.Effect<void, E, R>;
};

type Probe = {
  readonly history: boolean;
  readonly tables: boolean;
  readonly stamped: boolean;
};

const imageMigration = (migration: DocumentMigration): ImageMigration => ({
  version: migration.version,
  ordinal: migration.ordinal,
  combined: migration.manifest.combined,
  artefacts: migration.manifest.artefacts,
});

const probeDatabase = Effect.fn('db.migrate.probe')(function* (
  client: SqlClient.SqlClient,
) {
  const rows = yield* client.unsafe<Probe>(
    `select to_regclass('public.${HISTORY_TABLE}') is not null as history,
            to_regclass('"schemaFingerprint"') is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables`,
  );
  return rows[0] ?? { history: false, tables: false, stamped: false };
});

const readStamp = Effect.fn('db.migrate.readStamp')(function* (
  client: SqlClient.SqlClient,
) {
  const rows = yield* client.unsafe<{ fingerprint: string }>(
    'select "fingerprint" from "schemaFingerprint"',
  );
  return rows[0]?.fingerprint ?? null;
});

/**
 * What one file of a migration must leave as it found it. A backfill that
 * touches tenant tables runs as the maintenance role (`SET LOCAL ROLE
 * studio_maintenance` … `RESET ROLE`), because the policy on a FORCEd table
 * admits nobody else, and the owner login on managed Postgres is not a
 * superuser; one that forgot the `RESET` would run every later statement of
 * the upgrade as that role. A `search_path` left changed would install the
 * next sidecars, and their broad grants, in another schema. A team or erasure
 * setting left behind would silently narrow, or widen, what the next file's
 * statements can see. A guard trigger a file disabled, or switched to fire
 * only under replication (`ENABLE REPLICA`), must fire again, or every later
 * write escapes it. And the transaction id must not move: a file that ended
 * the runner's transaction has committed part of the upgrade.
 */
type SessionState = {
  readonly xid: string;
  readonly current: string;
  readonly session: string;
  readonly searchPath: string;
  readonly team: string;
  readonly erasing: string;
  /**
   * Every trigger that is not Postgres's own, one per line:
   * `<trigger> on <schema>.<table>`, a tab, and its firing mode.
   */
  readonly triggers: string;
  /**
   * Every table with row-level security on or forced, one per line:
   * `<schema>.<table>`, a tab, and its mode.
   */
  readonly security: string;
};

export const readSessionState = Effect.fn('db.migrate.readSessionState')(
  function* (client: SqlClient.SqlClient) {
    const rows = yield* client.unsafe<SessionState>(
      `select pg_current_xact_id()::text as xid,
            current_user as current, session_user as session,
            current_setting('search_path') as "searchPath",
            coalesce(current_setting('${TEAM_GUC}', true), '') as team,
            coalesce(current_setting('${ERASURE_GUC}', true), '') as erasing,
            (select coalesce(string_agg(
                      format('%I on %I.%I', t.tgname, n.nspname, c.relname) || chr(9) ||
                        case t.tgenabled
                          when 'O' then 'enabled'
                          when 'D' then 'disabled'
                          when 'R' then 'enabled replica'
                          when 'A' then 'enabled always'
                          else t.tgenabled::text
                        end,
                      chr(10) order by 1), '')
               from pg_trigger t
               join pg_class c on c.oid = t.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
              where not t.tgisinternal) as triggers,
            (select coalesce(string_agg(
                      format('%I.%I', n.nspname, c.relname) || chr(9) ||
                        case
                          when c.relforcerowsecurity and c.relrowsecurity then 'enabled and forced'
                          when c.relforcerowsecurity then 'forced, not enabled'
                          else 'enabled, not forced'
                        end,
                      chr(10) order by 1), '')
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where c.relrowsecurity or c.relforcerowsecurity) as security`,
    );
    const row = rows[0];
    if (row === undefined) {
      return yield* Effect.die(
        new Error('the session-state probe returned no row'),
      );
    }
    return row;
  },
);

const ENABLED = 'enabled';

type Change = {
  readonly subject: string;
  readonly before: string | undefined;
  readonly after: string | undefined;
};

/** Two of `SessionState`'s line lists, as what was added, removed or changed. */
const changesBetween = (before: string, after: string): readonly Change[] => {
  const entries = (list: string) =>
    new Map(
      list === ''
        ? []
        : list.split('\n').map((line) => {
            const tab = line.lastIndexOf('\t');
            return [line.slice(0, tab), line.slice(tab + 1)] as const;
          }),
    );
  const was = entries(before);
  const is = entries(after);
  return [...new Set([...was.keys(), ...is.keys()])]
    .toSorted()
    .map((subject) => ({
      subject,
      before: was.get(subject),
      after: is.get(subject),
    }))
    .filter((change) => change.before !== change.after);
};

const describeChanges = (changes: readonly Change[]): string =>
  changes
    .map(({ subject, before, after }) =>
      before === undefined
        ? `${subject} created (${after})`
        : after === undefined
          ? `${subject} dropped`
          : `${subject} ${before} → ${after}`,
    )
    .join('; ');

/**
 * What kind of file `assertSessionState` is checking. A `schema` file (the
 * delta and the sidecars) creates, drops and replaces triggers and turns on
 * row-level security as it must, so only a trigger it leaves not firing
 * normally is refused. A `data` file (a backfill, or the check before commit)
 * fills rows: it must leave every trigger, and every table's row-level
 * security, exactly as it found them.
 */
export type FileKind = 'schema' | 'data';

/**
 * Exported with `readSessionState` for its own test: transaction control is
 * refused before a run starts (`forbiddenStatement`), so the runner reaches
 * the transaction branch only if that refusal missed a statement. `baseline`
 * is the session at the start of the run; `before` is the session just before
 * the file ran.
 */
export const assertSessionState = Effect.fn('db.migrate.assertSessionState')(
  function* (
    client: SqlClient.SqlClient,
    baseline: SessionState,
    where: string,
    file: { readonly before: SessionState; readonly kind: FileKind } = {
      before: baseline,
      kind: 'data',
    },
  ) {
    const now = yield* readSessionState(client);
    if (now.xid !== baseline.xid) {
      return yield* new MigrationHistoryRefused({
        verdict: 'transaction',
        message: `${where} ended the migration's transaction (a COMMIT, ROLLBACK or other transaction control got past the checks), so the statements before it may already be committed and the database may be part-way between releases. Restore the backup taken before the upgrade.`,
      });
    }
    if (now.current !== now.session) {
      return yield* new MigrationHistoryRefused({
        verdict: 'role',
        message: `${where} left the session running as ${now.current} rather than ${now.session}: end a backfill's SET LOCAL ROLE with RESET ROLE.`,
      });
    }
    const triggers = changesBetween(file.before.triggers, now.triggers);
    if (file.kind === 'data' && triggers.length > 0) {
      return yield* new MigrationHistoryRefused({
        verdict: 'session',
        message: `${where} changed triggers: ${describeChanges(triggers)}. A backfill fills data, so it leaves every trigger as it found it: ENABLE a guard trigger it disabled around its write again before the file ends, and create, drop or change a trigger in delta.sql instead.`,
      });
    }
    const notFiring = triggers.filter(
      ({ after }) => after !== undefined && after !== ENABLED,
    );
    if (notFiring.length > 0) {
      return yield* new MigrationHistoryRefused({
        verdict: 'session',
        message: `${where} left triggers that no longer fire as they did: ${describeChanges(notFiring)}. ENABLE a trigger the file disabled, or switched to REPLICA or ALWAYS, again before the file ends.`,
      });
    }
    const security = changesBetween(file.before.security, now.security);
    if (file.kind === 'data' && security.length > 0) {
      return yield* new MigrationHistoryRefused({
        verdict: 'session',
        message: `${where} changed row-level security: ${describeChanges(security)}. A backfill that lifts FORCE ROW LEVEL SECURITY around its write must FORCE it again before the file ends.`,
      });
    }
    const changed = [
      ['search_path', baseline.searchPath, now.searchPath],
      [TEAM_GUC, baseline.team, now.team],
      [ERASURE_GUC, baseline.erasing, now.erasing],
    ].filter(([, before, after]) => before !== after);
    if (changed.length > 0) {
      return yield* new MigrationHistoryRefused({
        verdict: 'session',
        message: `${where} left ${changed.map(([name, before, after]) => `${name} set to ${JSON.stringify(after)} rather than ${JSON.stringify(before)}`).join(' and ')}: a setting a file changes lasts for the rest of the upgrade, so reset it before the file ends.`,
      });
    }
  },
);

const abbreviated = (statement: string): string => {
  const text = statement
    .replace(/^(?:\s*--[^\n\r]*[\n\r])+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
};

/**
 * SQLSTATE class 22, data exception: a cast, a range or a format that one
 * value failed. Postgres's message for it can quote that value — a stored row
 * of the operator's study data — so the code and the class are reported
 * instead (#1901 FX-6). Every other class names a constraint, a column or a
 * relation, never a value, and keeps Postgres's message.
 */
const DATA_EXCEPTION_CLASS = '22';

const DATA_EXCEPTION_REASON =
  "a data exception. Postgres's message is not shown, because it can quote the value that failed; run the statement against a copy of the database to see it";

/**
 * A statement of a migration that Postgres refused, named down to the
 * statement. `rolledBack` is read off the session after the failure: inside
 * the runner's transaction the session is aborted and the run rolls back
 * whole; a session that still answers had already left it.
 */
class MigrationStatementFailed extends Schema.TaggedError<MigrationStatementFailed>()(
  'MigrationStatementFailed',
  {
    version: Schema.String,
    artefact: Schema.String,
    position: Schema.String,
    statement: Schema.String,
    code: Schema.NullOr(Schema.String),
    reason: Schema.String,
    rolledBack: Schema.Boolean,
  },
) {
  override get message(): string {
    return [
      `Migration ${this.version} failed in ${this.artefact}, ${this.position}: ${this.statement}`,
      `Postgres refused it${this.code === null ? '' : ` (${this.code})`}: ${this.reason}`,
      this.rolledBack
        ? 'Nothing was applied: the transaction rolled back, and the database is as it was before migrate ran.'
        : 'A statement earlier in that file had already ended the transaction, so what ran before this one may be committed. Restore the backup taken before the upgrade.',
    ].join('\n');
  }
}

type StatementSite = {
  readonly version: string;
  readonly artefact: string;
  readonly position: string;
  readonly statement: string;
};

const runStatement = (
  client: SqlClient.SqlClient,
  statement: string,
  site: StatementSite,
) =>
  client.unsafe(statement).pipe(
    Effect.catchTag('SqlError', (cause) =>
      Effect.flatMap(Effect.exit(client.unsafe('select 1')), (probe) => {
        const code = sqlState(cause) ?? null;
        return Effect.fail(
          new MigrationStatementFailed({
            ...site,
            statement: abbreviated(site.statement),
            code,
            reason: code?.startsWith(DATA_EXCEPTION_CLASS)
              ? DATA_EXCEPTION_REASON
              : (deepestMessage(cause) ?? String(cause)),
            rolledBack: Exit.isFailure(probe),
          }),
        );
      }),
    ),
  );

type DeferrableName = {
  /** Schema-qualified and quoted, as `SET CONSTRAINTS` takes it. */
  readonly name: string;
  /** Every constraint of that name in its schema is INITIALLY DEFERRED. */
  readonly deferred: boolean;
  /** At least one is. */
  readonly someDeferred: boolean;
};

/**
 * A file's deferred checks fire at its end rather than at commit, so the next
 * file starts on settled data: a sidecar's `ALTER TABLE` refuses a table with
 * pending trigger events, and a dropped and recreated constraint trigger
 * would discard them. Every deferrable constraint is set IMMEDIATE by name,
 * which fires them, and the ones declared `INITIALLY DEFERRED` are deferred
 * again, so the next file may still write a row and its partner in two
 * statements.
 *
 * Never `SET CONSTRAINTS ALL` (#1901 FX-4): that sets the transaction's
 * default, which also governs every constraint a later file creates, so a
 * later file's own `INITIALLY DEFERRED` constraint would check each statement
 * — passing as the first file of a run and failing as a later one. A name
 * reaches every constraint of that name in its schema; a non-deferrable one is
 * passed over by IMMEDIATE, but DEFERRED would refuse it (or defer an
 * `INITIALLY IMMEDIATE` one), so a deferred constraint whose name another
 * constraint shares is refused rather than left immediate.
 */
const settleDeferredChecks = Effect.fn('db.migrate.settleDeferredChecks')(
  function* (
    client: SqlClient.SqlClient,
    site: Omit<StatementSite, 'statement'>,
  ) {
    const names = yield* client.unsafe<DeferrableName>(
      `select format('%I.%I', n.nspname, c.conname) as name,
              bool_and(c.condeferred) as deferred,
              bool_or(c.condeferred) as "someDeferred"
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        group by n.nspname, c.conname
       having bool_or(c.condeferrable)
        order by 1`,
    );
    if (names.length === 0) return;
    yield* runStatement(
      client,
      `SET CONSTRAINTS ${names.map(({ name }) => name).join(', ')} IMMEDIATE`,
      {
        ...site,
        statement:
          'SET CONSTRAINTS … IMMEDIATE, which runs the deferred checks of everything the file wrote',
      },
    );
    const shared = names.filter(
      ({ deferred, someDeferred }) => someDeferred && !deferred,
    );
    if (shared.length > 0) {
      return yield* new MigrationHistoryRefused({
        verdict: 'constraint',
        message: `After ${site.version}/${site.artefact}, the INITIALLY DEFERRED constraint ${shared.map(({ name }) => name).join(', ')} shares its name with another constraint in its schema that is not, and SET CONSTRAINTS cannot defer one without the other. Rename one of them.`,
      });
    }
    const initiallyDeferred = names.filter(({ deferred }) => deferred);
    if (initiallyDeferred.length > 0) {
      yield* runStatement(
        client,
        `SET CONSTRAINTS ${initiallyDeferred.map(({ name }) => name).join(', ')} DEFERRED`,
        {
          ...site,
          statement:
            'SET CONSTRAINTS … DEFERRED, which defers the INITIALLY DEFERRED constraints again',
        },
      );
    }
  },
);

/**
 * `pg_advisory_lock` is session-scoped, so it rides a reserved connection
 * whose scope releases it, and it is taken before the history is read: two
 * one-shots racing on one database serialise, and the second finds the
 * first's history and applies nothing. The transaction runs on the pool while
 * the reserved connection holds the lock (#1901, 2026-09-16).
 */
export const migrateDatabaseEffect = Effect.fn('db.migrate')(function* <
  E = never,
  R = never,
>(
  migrations: VerifiedMigrations,
  {
    log = () => undefined,
    appliedBy = 'unknown',
    beforeCommit,
  }: MigrateOptions<E, R> = {},
) {
  const owner = yield* OwnerDatabase;
  const image = migrations.migrations.map(imageMigration);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const lock = yield* owner.sql.reserve;
      yield* lock.executeUnprepared(
        `select pg_advisory_lock(${SCHEMA_LOCK_KEY})`,
        [],
        undefined,
      );
      yield* Effect.addFinalizer(() =>
        Effect.orDie(
          Effect.ignore(
            lock.executeUnprepared(
              `select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`,
              [],
              undefined,
            ),
          ),
        ),
      );

      const outcome: MigrateOutcome = yield* OwnerScope.open(
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          const baseline = yield* readSessionState(sql);
          const probe = yield* probeDatabase(sql);
          const recorded = probe.history ? yield* readHistory() : [];

          // No baseline (#1901 ruling, 2026-09-14): a database carrying Studio
          // tables and no history was built by apply-schema or by a
          // pre-release image, and nothing here can know what it holds.
          if (recorded.length === 0 && probe.tables) {
            return yield* new MigrationHistoryRefused({
              verdict: 'foreign',
              message:
                'This database carries Studio tables but no migration history: it was not created by migrate (an apply-schema or pre-release database), so what it holds is unknown. Recreate it and run migrate against the empty database.',
            });
          }

          const verdict = historyVerdict(recorded, image);
          if (verdict.kind !== 'pending') {
            return yield* refusalFor(verdict);
          }

          const newest = recorded.at(-1);
          if (newest !== undefined) {
            const stamp = probe.stamped ? yield* readStamp(sql) : null;
            const expected =
              migrations.migrations[newest.ordinal - 1]?.manifest.fingerprint;
            if (stamp !== expected) {
              return yield* new MigrationHistoryRefused({
                verdict: 'inconsistent',
                message: `This database records ${newest.version} as applied, but its schema fingerprint is ${stamp?.slice(0, 12) ?? 'missing'} rather than that migration's ${expected?.slice(0, 12)}: it was changed outside migrate. Restore the backup taken before the upgrade.`,
              });
            }
          }

          const checkBeforeCommit = Effect.gen(function* () {
            if (beforeCommit === undefined) return;
            const before = yield* readSessionState(sql);
            yield* beforeCommit;
            yield* assertSessionState(
              sql,
              baseline,
              'The check before commit',
              {
                before,
                kind: 'data',
              },
            );
          });

          if (verdict.pending.length === 0) {
            yield* checkBeforeCommit;
            return { kind: 'current' } satisfies MigrateOutcome;
          }

          // Inside the transaction, so a failed first run leaves an empty
          // database rather than a history table with no rows.
          if (!probe.history) yield* createHistoryTable();

          for (const pending of verdict.pending) {
            const migration = migrations.migrations[pending.ordinal - 1]!;
            const count = migration.artefacts.reduce(
              (total, artefact) => total + splitStatements(artefact.sql).length,
              0,
            );
            log(`Applying ${migration.version} (${count} statement(s)).`);
            for (const { name, sql: artefact } of migration.artefacts) {
              const before = yield* readSessionState(sql);
              const statements = splitStatements(artefact);
              for (const [index, statement] of statements.entries()) {
                yield* runStatement(sql, statement, {
                  version: migration.version,
                  artefact: name,
                  position: `statement ${index + 1} of ${statements.length}`,
                  statement,
                });
              }
              // Before the session checks (#1901 FX-5), so the file's
              // deferred checks fire under the role and settings it ended on.
              yield* settleDeferredChecks(sql, {
                version: migration.version,
                artefact: name,
                position: 'at the end of the file',
              });
              yield* assertSessionState(
                sql,
                baseline,
                `${migration.version}/${name}`,
                { before, kind: name === 'backfill.sql' ? 'data' : 'schema' },
              );
            }
            // After the artefacts, whose sidecars re-run the broad grant over
            // every table in `public`, and before the row it protects.
            yield* revokeHistory();
            yield* recordApplied(pending, appliedBy);
          }

          // Last, inside the transaction: a stamp that outlived a failed apply
          // would vouch for a database that is not this build's.
          yield* stampFingerprintEffect(sql, migrations.fingerprint);
          yield* checkBeforeCommit;

          const versions = verdict.pending.map(({ version }) => version);
          return { kind: 'applied', versions } satisfies MigrateOutcome;
        }),
      );
      // Only once COMMIT has returned (#1901 FX-8): a commit that fails — a
      // deferred check the last statements queued, or a connection lost —
      // applied nothing, and the log must not say otherwise.
      log(
        outcome.kind === 'applied'
          ? `Applied ${outcome.versions.join(', ')}.`
          : 'Schema current.',
      );
      return outcome;
    }),
  );
});

const decodeDocument = Schema.decodeUnknownEffect(
  Schema.fromJsonString(MigrationsDocument),
);

/**
 * `dist/migrations.json` to a document `migrateDatabaseEffect` accepts:
 * decoded, then verified against this build's fingerprint. A document another
 * build rendered, or one that does not re-hash to its manifests, is refused
 * here, before any connection is taken.
 */
export const readVerifiedMigrations = Effect.fn('db.readVerifiedMigrations')(
  function* (text: string, expectedFingerprint?: string) {
    const document = yield* decodeDocument(text).pipe(
      Effect.mapError(
        (error) =>
          new MigrationsDocumentRefused({
            message: `The migrations beside this bundle are not a migrations document (${error.message}). Rebuild the image.`,
          }),
      ),
    );
    return yield* Effect.try({
      try: () => verifyMigrations(document, expectedFingerprint),
      catch: (error) =>
        error instanceof MigrationsDocumentRefused
          ? error
          : new MigrationsDocumentRefused({ message: String(error) }),
    });
  },
);
