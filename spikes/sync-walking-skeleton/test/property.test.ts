// Property tests. Pure properties run hundreds of cases; the DB-backed
// interleaving property runs fewer (each case is real Postgres traffic).
import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';

import {
  applyCommand,
  applyCommands,
  ApplyError,
  canonicalize,
  type Command,
  contentHash,
  type SectionDoc,
} from '../src/apply.ts';
import { forceExpire, LeaseRejectedError } from '../src/server.ts';
import { assertLinearChain, makeDraft, makeServer } from './helpers.ts';

const { db, server } = await makeServer('sync_property');

afterAll(async () => {
  await db.end();
});

const jsonValue = fc.jsonValue({ maxDepth: 3 });
const key = fc.constantFrom('label', 'note', 'prompts', 'items', 'meta');
const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ op: fc.constant('set' as const), key, value: jsonValue }),
  fc.record({ op: fc.constant('unset' as const), key }),
  fc.record({
    op: fc.constant('insertItem' as const),
    key: fc.constantFrom('prompts', 'items'),
    index: fc.nat({ max: 5 }),
    item: jsonValue,
  }),
  fc.record({
    op: fc.constant('removeItem' as const),
    key: fc.constantFrom('prompts', 'items'),
    index: fc.nat({ max: 5 }),
  }),
  fc.record({
    op: fc.constant('moveItem' as const),
    key: fc.constantFrom('prompts', 'items'),
    from: fc.nat({ max: 5 }),
    to: fc.nat({ max: 5 }),
  }),
);

const baseDoc: fc.Arbitrary<SectionDoc> = fc.record({
  label: fc.string(),
  prompts: fc.array(jsonValue, { maxLength: 4 }),
  items: fc.array(jsonValue, { maxLength: 4 }),
});

/** Apply a batch, treating out-of-range list ops as skipped (client would
 * never generate them against its own state; here we filter as we go). */
function applyLenient(doc: SectionDoc, commands: Command[]): { doc: SectionDoc; applied: Command[] } {
  const applied: Command[] = [];
  for (const c of commands) {
    try {
      doc = applyCommand(doc, c);
      applied.push(c);
    } catch (err) {
      if (!(err instanceof ApplyError)) throw err;
    }
  }
  return { doc, applied };
}

describe('apply engine properties (pure, 300 cases each)', () => {
  it('is deterministic: same commands, same hash', () => {
    fc.assert(
      fc.property(baseDoc, fc.array(command, { maxLength: 20 }), (doc, cmds) => {
        const { doc: a, applied } = applyLenient(doc, cmds);
        const b = applyCommands(doc, applied);
        expect(contentHash(a)).toBe(contentHash(b));
      }),
      { numRuns: 300 },
    );
  });

  it('never mutates its input document', () => {
    fc.assert(
      fc.property(baseDoc, fc.array(command, { maxLength: 10 }), (doc, cmds) => {
        const before = canonicalize(doc);
        applyLenient(doc, cmds);
        expect(canonicalize(doc)).toBe(before);
      }),
      { numRuns: 300 },
    );
  });

  it('hashes are insensitive to object key order', () => {
    fc.assert(
      fc.property(baseDoc, (doc) => {
        const reversed = Object.fromEntries(Object.entries(doc).reverse());
        expect(contentHash(reversed)).toBe(contentHash(doc));
      }),
      { numRuns: 300 },
    );
  });
});

describe('lease/commit interleaving property (DB-backed, 25 schedules)', () => {
  // Random schedules of two contenders (acquire, renew, commit, expire,
  // takeover) against one section, with a model tracking who SHOULD hold the
  // lease. Invariants: epochs never decrease; a commit under a stale
  // (owner, epoch) never succeeds; an expired-and-not-renewed lease never
  // accepts a commit; the manifest chain stays linear.
  const op = fc.constantFrom(
    'acquireA',
    'acquireB',
    'renewA',
    'renewB',
    'commitA',
    'commitB',
    'expire',
    'takeoverB',
  );

  it('holds every invariant on random schedules', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 5, maxLength: 25 }), async (ops) => {
        const draft = await makeDraft(server, { s: { label: 'x', prompts: [] } });
        type Holder = { who: 'A' | 'B'; epoch: bigint; expired: boolean } | null;
        let model: Holder = null;
        let lastEpoch = 0n;
        const leases = { A: null as bigint | null, B: null as bigint | null };
        const seqs = { A: 1n, B: 1n };

        for (const o of ops) {
          if (o === 'expire') {
            await forceExpire(db, draft, 's');
            if (model) model.expired = true;
          } else if (o === 'acquireA' || o === 'acquireB') {
            const who = o === 'acquireA' ? 'A' : 'B';
            const lease = await server.acquire(draft, 's', `tab-${who}`);
            const shouldSucceed = model === null || model.expired;
            expect(lease !== null).toBe(shouldSucceed);
            if (lease) {
              expect(lease.epoch > lastEpoch || (model === null && lease.epoch === 1n)).toBe(true);
              lastEpoch = lease.epoch;
              leases[who] = lease.epoch;
              model = { who, epoch: lease.epoch, expired: false };
            }
          } else if (o === 'takeoverB') {
            const lease = await server.takeover(draft, 's', 'tab-B');
            // takeover succeeds iff a lease row exists at all
            if (lease) {
              expect(lease.epoch).toBeGreaterThan(lastEpoch);
              lastEpoch = lease.epoch;
              leases.B = lease.epoch;
              model = { who: 'B', epoch: lease.epoch, expired: false };
            } else {
              expect(model).toBeNull();
            }
          } else if (o === 'renewA' || o === 'renewB') {
            const who = o === 'renewA' ? 'A' : 'B';
            const epoch = leases[who];
            if (epoch === null) continue;
            const renewed = await server.renew(draft, 's', `tab-${who}`, epoch);
            const shouldSucceed =
              model !== null && model.who === who && model.epoch === epoch && !model.expired;
            expect(renewed !== null).toBe(shouldSucceed);
          } else {
            const who = o === 'commitA' ? 'A' : 'B';
            const epoch = leases[who];
            if (epoch === null) continue;
            const shouldSucceed =
              model !== null && model.who === who && model.epoch === epoch && !model.expired;
            try {
              await server.commit({
                draftId: draft,
                sectionId: 's',
                owner: `tab-${who}`,
                epoch,
                clientSeq: seqs[who],
                commands: [{ op: 'set', key: 'label', value: `${who}-${seqs[who]}` }],
              });
              seqs[who] += 1n;
              expect(shouldSucceed).toBe(true);
            } catch (err) {
              expect(err).toBeInstanceOf(LeaseRejectedError);
              expect(shouldSucceed).toBe(false);
            }
          }
        }
        await assertLinearChain(server, draft);
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});
