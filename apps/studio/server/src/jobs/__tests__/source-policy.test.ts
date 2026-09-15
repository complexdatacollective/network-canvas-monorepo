// Where pg-boss is allowed to appear, and where a job may be created.
//
// The rule both halves serve: a job is created by the transaction that caused
// it, through `enqueueJob`. An enqueue on its own connection reopens the two
// windows the transactional path closes — a committed change with no job, and
// a job for a change that rolled back — and pg-boss's own `send`/`insert` are
// the only way to reach one, so they stay in a single module.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  sourceTokens,
  tokenName,
} from '../../__tests__/support/source-tokens.ts';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..',
);

const SCANNED_ROOTS = [
  'apps/studio/server/src',
  'apps/studio/server/scripts',
  'packages/studio-sync/src',
];

const ENQUEUE_MODULE = 'apps/studio/server/src/jobs/enqueue.ts';

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

function scannedFiles(): { path: string; source: string }[] {
  return SCANNED_ROOTS.flatMap((root) =>
    typescriptFiles(resolve(REPO_ROOT, root)).map((path) => ({
      path: relative(REPO_ROOT, path),
      source: readFileSync(path, 'utf8'),
    })),
  );
}

/**
 * Every `receiver.member(` call for the named members, as `member` — the
 * tokenizer rather than a regular expression, so a mention in a comment or a
 * string cannot add to or hide from the inventory.
 */
function memberCalls(source: string, members: string[]): string[] {
  const tokens = sourceTokens(source);
  const calls: string[] = [];
  for (const [index, token] of tokens.entries()) {
    const name = tokenName(token);
    if (name === undefined || !members.includes(name)) continue;
    if (tokens[index - 1]?.raw !== '.') continue;
    if (tokens[index + 1]?.raw !== '(') continue;
    calls.push(name);
  }
  return calls;
}

function importsPgBoss(source: string): boolean {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].some(
    ([, specifier]) => specifier === 'pg-boss',
  );
}

describe('job source policy', () => {
  it('keeps pg-boss to the job module, schema application and test support', () => {
    const importers = scannedFiles()
      .filter(({ source }) => importsPgBoss(source))
      .map(({ path }) => path)
      .toSorted();

    // src/jobs/install.ts installs pg-boss's schema and reconciles the queues,
    // for both callers that apply a schema — scripts/apply.ts from a checkout
    // and src/db/migrate.ts in the image; support/postgres.ts does the same for
    // a scratch schema. Everything else reaches a queue through src/jobs, which
    // is what keeps `send` in one place — including the job suites themselves,
    // which drive pg-boss through the seams the server uses rather than
    // constructing their own.
    expect(importers).toEqual([
      'apps/studio/server/src/__tests__/support/postgres.ts',
      'apps/studio/server/src/jobs/client.ts',
      'apps/studio/server/src/jobs/database.ts',
      'apps/studio/server/src/jobs/enqueue.ts',
      'apps/studio/server/src/jobs/handlers/invitation-delivery.ts',
      'apps/studio/server/src/jobs/install.ts',
      'apps/studio/server/src/jobs/queues.ts',
      'apps/studio/server/src/jobs/register.ts',
      'apps/studio/server/src/jobs/worker.ts',
    ]);
  });

  it('creates a job in exactly one module', () => {
    const callers = scannedFiles()
      .map(({ path, source }) => ({
        path,
        calls: memberCalls(source, ['send', 'insert']),
      }))
      .filter(({ calls }) => calls.length > 0)
      .map(({ path, calls }) => `${path}: ${calls.toSorted().join(', ')}`)
      .toSorted();

    // The S3 calls are the AWS SDK's command dispatch, which has nothing to do
    // with a queue; they are listed rather than filtered so that a `send` on
    // something else has to be classified here before it can land.
    expect(callers).toEqual([
      'apps/studio/server/src/__tests__/assets.test.ts: send',
      'apps/studio/server/src/assets.ts: send, send, send, send',
      `${ENQUEUE_MODULE}: send`,
    ]);
  });

  it('creates that job inside the caller transaction', () => {
    const source = readFileSync(resolve(REPO_ROOT, ENQUEUE_MODULE), 'utf8');
    // The handle is what puts the INSERT in the command's own transaction; a
    // send without it runs on pg-boss's instance connection and commits alone.
    expect(source).toMatch(/\.send\([^;]*db:\s*jobDatabaseFor\(client\)/s);
  });
});
