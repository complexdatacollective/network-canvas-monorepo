import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  dumpSchemaRows,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { testKeyring } from '../../__tests__/support/secrets.ts';
import { seed } from '../../db/seed.ts';

// The acceptance criterion of #1900, asked of the database rather than of the
// code that writes it: a dump of a seeded Studio contains no webhook signing
// secret, no protocol API key and no OAuth token.
//
// Written as a search over every row of every table — including the pg-boss
// job schema beside it — rather than over the columns the design named,
// because the failure worth catching is a secret somewhere nobody thought to
// look: copied into an audit event's payload, a queued job, a section
// document, a webhook delivery's body.

const db = await reachableDb();

/** A tiny seed and a full dump of it; both run once for the whole file. */
const SEEDING_TIMEOUT_MS = 360_000;

/**
 * Every rendering of a secret a dump could plausibly hold. A value written
 * straight into a column appears as itself; one that travelled through a JSON
 * payload, a bytea column or an encoded envelope appears as one of the
 * others. Searching only for the plaintext would pass over a secret that had
 * been base64'd on the way into a job payload.
 */
function encodings(secret: string): { label: string; needle: string }[] {
  const bytes = Buffer.from(secret, 'utf8');
  return [
    { label: 'plaintext', needle: secret },
    { label: 'base64', needle: bytes.toString('base64') },
    { label: 'base64url', needle: bytes.toString('base64url') },
    { label: 'hex', needle: bytes.toString('hex') },
  ];
}

describe.skipIf(!db)('a seeded database at rest', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>> | undefined;
  let plaintextSecrets: string[] = [];
  /** Every row of both schemas, as one string. */
  let dump = '';
  let participantEmail = '';

  beforeAll(async () => {
    if (!db) return;
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    ({ plaintextSecrets } = await seed(scratch.pool, {
      secrets: testKeyring(),
      scale: 'tiny',
    }));

    const studio = await dumpSchemaRows(scratch.pool);
    // pg-boss installs into a schema of its own, so a secret that reached a
    // job payload would not be in the first dump at all.
    const jobs = await dumpSchemaRows(scratch.pool, {
      schema: scratch.jobSchema,
    });
    dump = [...studio.values(), ...jobs.values()]
      .map((rows) => rows.join('\n'))
      .join('\n');

    const participant = await scratch.pool.query<{ email: string }>(
      `select email from participants where email is not null order by email limit 1`,
    );
    participantEmail = participant.rows[0]?.email ?? '';
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.dispose();
  }, 60_000);

  it('dumps something to search, and every secret the seed wrote', () => {
    expect(dump.length).toBeGreaterThan(100_000);
    // All three kinds, or the search below would pass while one of them was
    // not written at all: webhook secrets, the admin's three OAuth tokens,
    // and one API key per seeded team.
    const prefixes = ['whsec_', 'sk.seed-', 'ya29.', '1//', 'eyJ'];
    expect(
      prefixes.filter(
        (prefix) =>
          !plaintextSecrets.some((secret) => secret.startsWith(prefix)),
      ),
    ).toEqual([]);
  });

  it('holds a participant email in the clear', () => {
    // The positive control, and the reason the assertion below can fail: the
    // same search, over the same dump, finds a value that IS stored plainly.
    // Without it, a dump that came back empty — a broken query, a schema name
    // typo — would read as a clean result. It is also the ruling of
    // 2026-09-14 stated as a test: contact details are not encrypted.
    expect(participantEmail).toMatch(/@/);
    expect(dump).toContain(participantEmail);
  });

  it('holds no secret in any encoding', () => {
    const found: string[] = [];
    for (const secret of plaintextSecrets) {
      for (const { label, needle } of encodings(secret)) {
        // The needle, never the secret, in the failure message.
        if (dump.includes(needle)) found.push(`${label}:${needle.length}`);
      }
    }
    expect(found).toEqual([]);
  });
});
