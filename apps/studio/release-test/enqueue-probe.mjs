// Prints the SQL that enqueues one `protocol-store-gc` job as the
// application role, rendered by the API's own insert statement so the row is
// exactly what `Jobs.enqueue` writes (#1901 S-6d). upgrade.sh pipes it into
// psql inside the postgres container right after `maintenance on`, and then
// follows that job across the upgrade: still `created` after `migrate`,
// `completed` once the worker is open again.
//
//   node apps/studio/release-test/enqueue-probe.mjs | psql …
//
// Run from a checkout: it imports the API's source (Node strips the types).

import process from 'node:process';

import { insertJobStatement } from '../api/src/jobs/insert.ts';
import { JOB_SCHEMA } from '../api/src/jobs/queues.ts';

const { text, values } = insertJobStatement({
  schema: JOB_SCHEMA,
  queue: 'protocol-store-gc',
  payload: {},
  singletonKey: null,
  now: null,
  startAfter: null,
});

// psql has no bind parameters for a piped statement, so each value becomes a
// literal. Every value here is the queue's own declaration — strings,
// numbers, booleans or null — never input from anywhere else.
const literal = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
};
const sql = text.replace(/\$(\d+)/g, (_, n) => literal(values[Number(n) - 1]));

process.stdout.write(`SET ROLE studio_app;\n${sql.trim()};\n`);
