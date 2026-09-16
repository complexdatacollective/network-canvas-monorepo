// The statement core on its own: no driver, no database. What reaches Postgres
// is proved by install-statements.test.ts, which records a real client; this
// covers the decisions and the shapes that file cannot vary — a plan pg-boss
// stopped wrapping, an unreadable version, a policy change.
import { describe, expect, it } from 'vitest';

import { jobGrantsSql } from '@codaco/studio-sync/jobs';

import { splitStatements } from '../../db/statements.ts';
import {
  JOB_SCHEMA_VERSION,
  jobQueueDefinitions,
  QUEUE_OPTION_DEFAULTS,
  renderJobStatements,
} from '../queues.ts';
import {
  constructionPlan,
  dropSchemaStatement,
  grantScript,
  type InstalledJobQueue,
  installDecision,
  installScripts,
  reconcileQueue,
  stripTransactionControl,
} from '../statements.ts';

const SCHEMA = 'pgboss_scratch';

describe('pg-boss’s construction plan', () => {
  it('refuses a plan that no longer carries its own transaction', () => {
    expect(() => stripTransactionControl('CREATE SCHEMA x;')).toThrow(
      /no longer a BEGIN…COMMIT script/,
    );
    expect(() => stripTransactionControl('BEGIN; CREATE SCHEMA x;')).toThrow(
      /no longer a BEGIN…COMMIT script/,
    );
    expect(() => stripTransactionControl('CREATE SCHEMA x; COMMIT;')).toThrow(
      /no longer a BEGIN…COMMIT script/,
    );
  });

  it('keeps everything between the wrapper it strips', () => {
    expect(stripTransactionControl('  BEGIN; CREATE SCHEMA x; COMMIT;  ')).toBe(
      ' CREATE SCHEMA x; ',
    );
  });

  it('loses exactly the two wrapper commands when split', () => {
    const plan = renderJobStatements()[0]!;
    const whole = splitStatements(plan);
    expect(whole[0]).toBe('BEGIN');
    expect(whole.at(-1)).toBe('COMMIT');

    const nested = constructionPlan();
    expect(nested.script).toBe(stripTransactionControl(plan));
    expect(nested.statements).toEqual(whole.slice(1, -1));
    expect(nested.statements).toHaveLength(whole.length - 2);
  });
});

describe('the grants', () => {
  it('are offered whole and one statement at a time', () => {
    const grants = grantScript(SCHEMA);
    expect(grants.script).toBe(jobGrantsSql(SCHEMA));
    expect(grants.statements).toEqual(splitStatements(jobGrantsSql(SCHEMA)));
    expect(grants.statements[0]).toBe(
      `GRANT USAGE ON SCHEMA ${SCHEMA} TO studio_app, studio_maintenance`,
    );
  });
});

describe('what an observed schema decides', () => {
  it('installs when nothing is there', () => {
    expect(installDecision({ present: false, version: null })).toBe('install');
  });

  it('is current only at this build’s version', () => {
    expect(
      installDecision({ present: true, version: JOB_SCHEMA_VERSION }),
    ).toBe('current');
    expect(
      installDecision({ present: true, version: JOB_SCHEMA_VERSION - 1 }),
    ).toBe('replace');
  });

  it('replaces a schema that cannot say what version it is', () => {
    expect(installDecision({ present: true, version: null })).toBe('replace');
  });
});

describe('the scripts a decision runs', () => {
  const scriptsOf = (decision: 'current' | 'install' | 'replace') =>
    installScripts(SCHEMA, decision).map(({ script }) => script);

  it('re-grants and nothing else when the schema is current', () => {
    expect(scriptsOf('current')).toEqual([jobGrantsSql(SCHEMA)]);
  });

  it('builds then grants when there is nothing to replace', () => {
    expect(scriptsOf('install')).toEqual([
      constructionPlan().script,
      jobGrantsSql(SCHEMA),
    ]);
  });

  it('drops, builds, then grants when replacing', () => {
    expect(scriptsOf('replace')).toEqual([
      dropSchemaStatement(SCHEMA),
      constructionPlan().script,
      jobGrantsSql(SCHEMA),
    ]);
  });
});

describe('reconciling one queue', () => {
  const declaration = jobQueueDefinitions()[0]!;
  const installed: InstalledJobQueue = {
    name: declaration.name,
    ...declaration.options,
  };

  it('creates the queue when none is installed', () => {
    expect(reconcileQueue(declaration.name, declaration.options, null)).toEqual(
      { kind: 'create', options: declaration.options },
    );
  });

  it('refuses a policy a queue cannot be moved to', () => {
    const reconciliation = reconcileQueue(
      declaration.name,
      { ...declaration.options, policy: 'singleton' },
      installed,
    );
    expect(reconciliation).toEqual({
      kind: 'refuse',
      message: `queue ${declaration.name} is installed with policy standard and is now declared singleton; a policy cannot be changed after creation. Recreate the database: pnpm --filter @codaco/studio-server db:reset`,
    });
  });

  it('sends every option, with the declaration over the defaults', () => {
    const reconciliation = reconcileQueue(
      declaration.name,
      { ...declaration.options, partition: true },
      installed,
    );
    if (reconciliation.kind !== 'update') {
      throw new Error(`expected an update, got ${reconciliation.kind}`);
    }

    const { policy: _policy, ...declared } = declaration.options;
    expect(reconciliation.options).toEqual({
      ...QUEUE_OPTION_DEFAULTS,
      ...declared,
    });
    // The two options `updateQueue` refuses never reach it: `policy` was
    // compared rather than sent, and `partition` is dropped whatever a
    // declaration says. `toEqual` above would fail on either, but only if the
    // defaults keep saying nothing about them — these two say so directly.
    expect('partition' in reconciliation.options).toBe(false);
    expect('policy' in reconciliation.options).toBe(false);
    // Every option the declaration leaves out still arrives, at pg-boss's own
    // default, so a dropped option cannot keep the last value applied.
    expect(declared.expireInSeconds).toBeUndefined();
    expect(reconciliation.options.expireInSeconds).toBe(
      QUEUE_OPTION_DEFAULTS.expireInSeconds,
    );
  });
});
