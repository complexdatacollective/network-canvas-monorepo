// Golden-transcript hash equality: the same command log replayed through the
// client engine (in-memory) and the server engine (through the full commit
// path, i.e. Postgres round-trips) must converge on identical content hashes.
// Content addressing turns apply-divergence into a failed equality check.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyCommands,
  canonicalize,
  type Command,
  contentHash,
  type SectionDoc,
} from '../apply.ts';
import type { SyncServer } from '../server.ts';
import { dbAvailable, makeDraft, makeServer } from './helpers.ts';

// A fixed transcript with its expected hashes. If the apply engine's
// semantics or the canonical serialization ever drift, these literals fail.
const GOLDEN_BASE: SectionDoc = {
  type: 'NameGenerator',
  label: 'People',
  prompts: [],
};
const GOLDEN_TRANSCRIPT: Command[][] = [
  [{ op: 'set', key: 'label', value: 'People you know' }],
  [
    {
      op: 'insertItem',
      key: 'prompts',
      index: 0,
      item: { id: 'p1', text: 'Who?' },
    },
    {
      op: 'insertItem',
      key: 'prompts',
      index: 1,
      item: { id: 'p2', text: 'Anyone else?' },
    },
  ],
  [{ op: 'moveItem', key: 'prompts', from: 1, to: 0 }],
  [{ op: 'set', key: 'quickAdd', value: true }],
  [{ op: 'removeItem', key: 'prompts', index: 1 }],
  [{ op: 'unset', key: 'quickAdd' }],
];
describe.skipIf(!dbAvailable)('golden transcripts', () => {
  let db: Pool;
  let server: SyncServer;

  beforeAll(async () => {
    ({ db, server } = await makeServer('sync_golden'));
  });

  afterAll(async () => {
    await db.end();
  });

  it('client and server engines produce hash-identical section state', async () => {
    const draft = await makeDraft(server, { 'stage-1': GOLDEN_BASE });
    const owner = randomUUID();
    const lease = await server.acquire(draft, 'stage-1', owner);

    // Server side: through the real commit path.
    let serverHash = '';
    for (const [i, batch] of GOLDEN_TRANSCRIPT.entries()) {
      const result = await server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner,
        epoch: lease!.epoch,
        clientSeq: BigInt(i + 1),
        commands: batch,
      });
      serverHash = result.sectionHash;
    }

    // Client side: pure in-memory replay of the same transcript.
    const clientDoc = GOLDEN_TRANSCRIPT.reduce(applyCommands, GOLDEN_BASE);
    expect(contentHash(clientDoc)).toBe(serverHash);

    // And the log stored in Postgres replays to the same hash — a third
    // engine (a future reconciler or migration) would read exactly this.
    const log = await db.query(
      `SELECT commands FROM command_log WHERE draft_id = $1 ORDER BY manifest_seq`,
      [draft],
    );
    const replayed = (log.rows as { commands: Command[] }[]).reduce(
      (doc, row) => applyCommands(doc, row.commands),
      GOLDEN_BASE,
    );
    expect(contentHash(replayed)).toBe(serverHash);
  });
});

describe('canonical serialization', () => {
  it('is key-order independent', () => {
    const a: SectionDoc = { x: 1, y: { b: 2, a: [1, 2, 3] }, z: null };
    const b: SectionDoc = { z: null, y: { a: [1, 2, 3], b: 2 }, x: 1 };
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('follows JSON array semantics for non-JSON elements', () => {
    // JSONB stores [undefined] as [null]; the hash must agree, and must not
    // collide with a genuinely empty array (which would let ON CONFLICT
    // DO NOTHING silently retain the wrong document).
    expect(contentHash({ list: [undefined] })).toBe(
      contentHash({ list: [null] }),
    );
    expect(contentHash({ list: [undefined] })).not.toBe(
      contentHash({ list: [] }),
    );
    expect(contentHash({ list: [1, undefined, 2] })).toBe(
      contentHash({ list: [1, null, 2] }),
    );
  });

  it('renders sparse array slots as null, like JSON', () => {
    // A hole is not an absent element: JSON.stringify(Array(1)) is "[null]",
    // and node-postgres stores the same. Hashing it as an empty array would
    // both disagree with the stored row and collide with a genuinely empty
    // list.
    // oxlint-disable-next-line no-sparse-arrays -- the case under test
    const sparse = [1, , 3];
    expect(contentHash({ list: sparse })).toBe(
      contentHash({ list: [1, null, 3] }),
    );
    expect(contentHash({ list: Array(2) })).toBe(
      contentHash({ list: [null, null] }),
    );
    expect(contentHash({ list: Array(1) })).not.toBe(contentHash({ list: [] }));
    expect(canonicalize({ list: sparse })).toBe(
      JSON.stringify({ list: sparse }),
    );
  });

  it('follows JSON object semantics for non-JSON values', () => {
    // JSON.stringify drops undefined-valued properties entirely.
    expect(contentHash({ a: 1, b: undefined })).toBe(contentHash({ a: 1 }));
  });
});
