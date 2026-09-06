import { describe, expect, it } from 'vitest';

import {
  applyCommands,
  canonicalize,
  contentHash,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../../compound-edit/InMemoryCompoundHost.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type CompoundSectionEdit,
  type FinishRequest,
  type PendingCommandBatch,
  type StageFormDraft,
} from '../../session.ts';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourceResult,
} from '../gateway.ts';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';

/**
 * Editing, staging, finishing, cancelling and discarding composed against each
 * other over seeded orderings, with the host misbehaving in the ways a host
 * does.
 *
 * The single-scenario tests beside this one each hold one ordering still and
 * ask one question about it. The defects that keep being found here are not in
 * any one of those orderings: they are in what two of them do to each other —
 * a promotion whose answer was lost, and then the retry a researcher actually
 * makes; a finish whose apply committed, and then the next finish sending the
 * same batches again. This runs the compositions nobody wrote down.
 *
 * ## The invariants
 *
 * 1. **Nothing the host committed is ever deleted.** A promoted resource that
 *    leaves the manifest is a protocol referencing bytes that are gone.
 * 2. **No index-based command is ever applied twice.** `insertItem`,
 *    `removeItem` and `moveItem` are index-based, so a batch sent to the host
 *    a second time duplicates a prompt or reorders the wrong one — under a
 *    save that reports success. Checked two ways: the host's prompts never
 *    hold a duplicate id, and a finish that reported success has left nothing
 *    pending that it did not carry.
 * 3. **A finish that reported success means the stage the researcher was
 *    looking at is the stage the protocol holds.** This is the one that
 *    catches a silent divergence with nothing else to report it.
 * 4. **The session can always be left.** Some call always makes progress; a
 *    session that can neither finish nor cancel strands everything it staged.
 * 5. **A cancel leaves nothing behind that it did not name.** A staged
 *    resource the report does not mention is one nothing can ever reach.
 */

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const COMMITTED_ROSTER = 'committed-roster';

const ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({ nodes: [{ attributes: { name: 'Ada' } }], edges: [] }),
);

/** Mulberry32, so a violating seed replays on its own. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let drawn = state;
    drawn = Math.imul(drawn ^ (drawn >>> 15), drawn | 1);
    drawn ^= drawn + Math.imul(drawn ^ (drawn >>> 7), drawn | 61);
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Fault =
  | 'ok'
  | 'retryable'
  | 'final'
  | 'throw'
  | 'throw-sync'
  | 'slow'
  /** The host really did the work and then lost its answer. */
  | 'lost-answer';

const GATEWAY_FAULTS: readonly Fault[] = [
  'retryable',
  'final',
  'throw',
  'throw-sync',
  'throw-sync',
  'slow',
  'lost-answer',
  'lost-answer',
  'lost-answer',
];

/** What the composed runs actually reached, so a green fuzz means something. */
type FuzzCoverage = {
  finishes: number;
  finishFailures: number;
  promotions: number;
  cancels: number;
  keptUnreconciled: number;
  discards: number;
  syncThrows: number;
  lostAnswers: number;
  /** Finishes the host answered from its promotion cache, applying nothing. */
  replayedFinishes: number;
};

type Violation = Readonly<{ seed: number; step: string; detail: string }>;

const baseFields = (): StageFormDraft => ({
  label: 'Roster',
  subject: { entity: 'node', type: 'person' },
  dataSource: COMMITTED_ROSTER,
  prompts: [
    { id: 'prompt-a', text: 'Someone you know' },
    { id: 'prompt-b', text: 'Someone you have met once' },
    { id: 'prompt-c', text: 'Someone you would call' },
  ],
  behaviours: {},
});

/** A stage section as a draft: the same fields, without the session's own id. */
function stripIdentity(doc: SectionDoc): StageFormDraft {
  const { id: _id, type: _type, ...rest } = doc;
  return rest;
}

function promptIds(prompts: unknown): readonly string[] {
  if (!Array.isArray(prompts)) return [];
  return prompts.map((prompt) =>
    typeof prompt === 'object' && prompt !== null && 'id' in prompt
      ? String(prompt.id)
      : '?',
  );
}

// One case composes a dozen operations against a session, a host and a
// gateway, and every branch of that composition is the point; splitting it up
// would only move the same switch somewhere else.
// oxlint-disable-next-line max-lines-per-function
async function runCase(
  seed: number,
  coverage: FuzzCoverage,
): Promise<readonly Violation[]> {
  const random = randomFrom(seed);
  const pick = <T>(values: readonly T[]): T =>
    values[Math.floor(random() * values.length)] as T;
  const violations: Violation[] = [];
  const note = (step: string, detail: string): void => {
    violations.push({ seed, step, detail });
  };

  const protocolSections: Record<string, SectionDoc> = {
    [settingsSection]: { name: 'Composition fuzz', schemaVersion: 8 },
    [stageOrderSection]: { stages: ['stage-1'] },
    [stageSection]: {
      id: 'stage-1',
      type: 'NameGeneratorRoster',
      ...baseFields(),
    },
    [assetsSection]: {
      [COMMITTED_ROSTER]: {
        type: 'network',
        id: COMMITTED_ROSTER,
        name: 'Committed roster',
        source: 'committed-roster.json',
      },
    },
    [personSection]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  };
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [
      {
        sectionId: stageSection,
        leaseOwner: 'owner-primary',
        leaseEpoch: 4n,
        holder: {
          sessionId: 'tab-primary',
          userId: 'user-primary',
          displayName: 'Primary editor',
          sectionId: stageSection,
          mode: 'editing',
        },
      },
    ],
  });
  const gateway = new InMemoryResourceGateway({
    committed: [
      {
        kind: 'network',
        id: COMMITTED_ROSTER,
        name: 'Committed roster',
        source: 'committed-roster.json',
        contentType: 'application/json',
        bytes: ROSTER_BYTES,
      },
    ],
  });

  /** Every asset id the committed manifest has ever held. */
  const everCommitted = new Set<string>();
  const stagedIds: string[] = [];

  // A profile per case rather than a coin per call: a run where everything
  // answers is what reaches a second and a third finish at all, and a run
  // where one operation misbehaves is what composes a fault with the rest of
  // the machine instead of stopping it at the first step.
  const faultRate = pick([0, 0.08, 0.2, 0.45, 0.45]);
  const faultyOperations: readonly string[] = pick([
    ['promote'],
    ['promote'],
    ['stageUpload', 'stageSecret'],
    ['discardStaged', 'discardAllStaged'],
    ['inspect'],
    [
      'promote',
      'stageUpload',
      'stageSecret',
      'discardStaged',
      'discardAllStaged',
      'inspect',
      'list',
      'download',
    ],
  ]);
  // Some cases hold one fault steady, so the rarer compositions — a promotion
  // whose answer is lost, and then a retry or a cancel over the doubt it left
  // — are reached rather than merely possible.
  const preferredFault = pick([
    undefined,
    undefined,
    'lost-answer',
    'lost-answer',
    'retryable',
    'throw-sync',
    'final',
  ] as const);
  const faultFor = (operation: string): Fault => {
    if (!faultyOperations.includes(operation)) return 'ok';
    if (random() >= faultRate) return 'ok';
    return preferredFault ?? pick(GATEWAY_FAULTS);
  };

  /**
   * Not `async`: a synchronous throw has to leave this function before there
   * is a promise to attach anything to, which is the whole point of that
   * fault. Every other answer is a promise.
   */
  const withFault = <T>(
    operation: string,
    call: () => Promise<ResourceResult<T>>,
  ): Promise<ResourceResult<T>> => {
    const fault = faultFor(operation);
    if (fault === 'throw-sync') {
      coverage.syncThrows += 1;
      throw new Error(`the adapter threw from ${operation}`);
    }
    return (async (): Promise<ResourceResult<T>> => {
      if (fault === 'throw') {
        throw new Error(`the adapter threw from ${operation}`);
      }
      if (fault === 'retryable') {
        return resourceFailure('unavailable', 'the host is busy');
      }
      if (fault === 'final') {
        return resourceFailure('invalid-request', 'the host refused');
      }
      if (fault === 'slow') {
        for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
        return call();
      }
      if (fault === 'lost-answer') {
        const result = await call();
        if (result.status !== 'ok') return result;
        coverage.lostAnswers += 1;
        return resourceFailure('unavailable', 'the host did not answer');
      }
      return call();
    })();
  };

  const port: ProtocolBuilderResourceGateway = {
    secretStorage: gateway.secretStorage,
    list: (options) => withFault('list', () => gateway.list(options)),
    download: (id) => withFault('download', () => gateway.download(id)),
    resolvePreview: (id) =>
      withFault('resolvePreview', () => gateway.resolvePreview(id)),
    inspect: (id) => withFault('inspect', () => gateway.inspect(id)),
    stageUpload: (request) =>
      withFault('stageUpload', () => gateway.stageUpload(request)),
    stageSecret: (request) =>
      withFault('stageSecret', () => gateway.stageSecret(request)),
    discardStaged: (id) =>
      withFault('discardStaged', () => gateway.discardStaged(id)),
    discardAllStaged: () =>
      withFault('discardAllStaged', () => gateway.discardAllStaged()),
    promote: (request) =>
      withFault('promote', async () => {
        const result = await gateway.promote(request);
        if (result.status === 'ok') {
          coverage.promotions += 1;
          for (const descriptor of result.data.promoted) {
            everCommitted.add(descriptor.id);
          }
        }
        return result;
      }),
  };

  const liveQueue: PendingCommandBatch[] = [];
  let committedFields = baseFields();
  let submissions = 0;
  const carriedByFinish: number[][] = [];

  const submitToHost = (
    stageCommands: readonly Command[],
    manifestCommands: readonly Command[] | undefined,
  ): void => {
    const sections = host.getSnapshot().protocolSections;
    const edits: CompoundSectionEdit[] = [];
    if (stageCommands.length > 0) {
      edits.push({
        kind: 'update',
        sectionId: stageSection,
        expectedContentHash: contentHash(sections[stageSection] ?? {}),
        commands: [...stageCommands],
      });
    }
    if (manifestCommands !== undefined && manifestCommands.length > 0) {
      edits.push({
        kind: 'update',
        sectionId: assetsSection,
        expectedContentHash: contentHash(sections[assetsSection] ?? {}),
        commands: [...manifestCommands],
      });
    }
    if (edits.length === 0) return;
    const result = host.submit({
      id: `submission-${++submissions}`,
      description: 'edit',
      edits,
      authority: {
        sectionId: stageSection,
        leaseOwner: 'owner-primary',
        leaseEpoch: 4n,
      },
    });
    if (result.status !== 'applied') {
      throw new Error(
        result.status === 'failed' ? result.message : 'the sections are held',
      );
    }
  };

  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGeneratorRoster', () => 'stage-1'),
    fields: baseFields(),
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: { mode: 'editable', leaseOwner: 'owner-primary', leaseEpoch: 4n },
    resourceGateway: port,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onCommands: (batch) => liveQueue.push(batch),
    onFinish: async ({ pendingCommands, resourceManifest }: FinishRequest) => {
      carriedByFinish.push(pendingCommands.map((batch) => batch.id));
      submitToHost(
        pendingCommands.flatMap((batch) => [...batch.commands]),
        resourceManifest?.commands,
      );
      await Promise.resolve();
    },
  });

  const resources = session.getResourceGateway();
  if (resources === undefined) throw new Error('the session has no gateway');

  /** A well-behaved live host: commit the next batch and acknowledge it. */
  const flushLive = (): void => {
    const batch = liveQueue.shift();
    if (batch === undefined) return;
    submitToHost([...batch.commands], undefined);
    committedFields = applyCommands(committedFields, [...batch.commands]);
    session.acknowledge({
      fields: committedFields,
      throughBatchId: batch.id,
      manifestRevision: host.getSnapshot().manifestRevision,
    });
  };

  /** The acknowledgement a host sends for the apply a finish carried. */
  const acknowledgeFinish = (throughBatchId: number): void => {
    committedFields = stripIdentity(
      host.getSnapshot().protocolSections[stageSection] ?? {},
    );
    session.acknowledge({
      fields: committedFields,
      throughBatchId,
      manifestRevision: host.getSnapshot().manifestRevision,
    });
  };

  const promptCount = (): number => {
    const value = session.getSnapshot().editedSection.fields.prompts;
    return Array.isArray(value) ? value.length : 0;
  };

  let cancelled = false;
  let nextEdit = 0;
  const steps = 6 + Math.floor(random() * 8);

  // "Could not save" → "try again", with nothing changed in between. It is the
  // most ordinary reaction there is, and the only way to reach a finish the
  // host answers out of its promotion cache.
  let retryImmediately = false;
  // The other ordinary reaction to "could not save": give up on the stage.
  let cancelImmediately = false;
  const ordinaryOperations = [
    'set',
    'set',
    'insert',
    'remove',
    'move',
    'move',
    // What the picker actually does: import a file and put it in the field it
    // was imported for, in one gesture.
    'import',
    'import',
    'import',
    'import',
    'stage-upload',
    'stage-secret',
    'reference',
    'unreference',
    'discard',
    'discard-all',
    'finish',
    'finish',
    'finish',
    'cancel',
    'undo',
    'flush-live',
    'flush-live',
  ] as const;

  for (let step = 0; step < steps; step += 1) {
    const operation = retryImmediately
      ? ('finish' as const)
      : cancelImmediately
        ? ('cancel' as const)
        : pick(ordinaryOperations);
    retryImmediately = false;
    cancelImmediately = false;
    try {
      switch (operation) {
        case 'set':
          if (cancelled) break;
          session.dispatch([
            { op: 'set', key: 'label', value: `Label ${++nextEdit}` },
          ]);
          break;
        case 'insert':
          if (cancelled) break;
          session.dispatch([
            {
              op: 'insertItem',
              key: 'prompts',
              index: Math.floor(random() * (promptCount() + 1)),
              item: { id: `prompt-${seed}-${++nextEdit}`, text: 'Added' },
            },
          ]);
          break;
        case 'remove':
          if (cancelled || promptCount() <= 1) break;
          session.dispatch([
            {
              op: 'removeItem',
              key: 'prompts',
              index: Math.floor(random() * promptCount()),
            },
          ]);
          break;
        case 'move':
          if (cancelled || promptCount() <= 1) break;
          session.dispatch([
            {
              op: 'moveItem',
              key: 'prompts',
              from: Math.floor(random() * promptCount()),
              to: Math.floor(random() * promptCount()),
            },
          ]);
          break;
        case 'import': {
          if (cancelled) break;
          const result = await resources.stageUpload({
            requestId: `import-${seed}-${step}`,
            kind: 'network',
            name: `Roster ${step}`,
            source: `roster-${step}.json`,
            contentType: 'application/json',
            bytes: ROSTER_BYTES,
          });
          if (result.status !== 'ok') break;
          stagedIds.push(result.data.id);
          if (resources.referenceStaged(result.data.id).status === 'failed') {
            break;
          }
          session.dispatch([
            { op: 'set', key: 'dataSource', value: result.data.id },
          ]);
          break;
        }
        case 'stage-upload': {
          const result = await resources.stageUpload({
            requestId: `upload-${seed}-${step}`,
            kind: 'network',
            name: `Roster ${step}`,
            source: `roster-${step}.json`,
            contentType: 'application/json',
            bytes: ROSTER_BYTES,
          });
          if (result.status === 'ok') stagedIds.push(result.data.id);
          break;
        }
        case 'stage-secret': {
          const result = await resources.stageSecret({
            requestId: `secret-${seed}-${step}`,
            name: `Key ${step}`,
            value: `pk.fuzz-${seed}-${step}`,
          });
          if (result.status === 'ok') stagedIds.push(result.data.descriptor.id);
          break;
        }
        case 'reference': {
          if (cancelled) break;
          const listed = await resources.list({ kinds: ['network'] });
          if (listed.status !== 'ok' || listed.data.length === 0) break;
          // Biased towards this session's own staging: a reference to a
          // committed resource never reaches the promotion machinery at all.
          const staged = listed.data.filter(
            (descriptor) => descriptor.status === 'staged',
          );
          const chosen =
            staged.length > 0 && random() < 0.85
              ? pick(staged)
              : pick(listed.data);
          if (resources.referenceStaged(chosen.id).status === 'failed') break;
          session.dispatch([
            { op: 'set', key: 'dataSource', value: chosen.id },
          ]);
          break;
        }
        case 'unreference':
          if (cancelled) break;
          session.dispatch([
            { op: 'set', key: 'dataSource', value: COMMITTED_ROSTER },
          ]);
          break;
        case 'discard': {
          if (stagedIds.length === 0) break;
          const discarded = await resources.discardStaged(pick(stagedIds));
          if (discarded.status === 'ok') coverage.discards += 1;
          break;
        }
        case 'discard-all':
          await resources.discardAllStaged();
          break;
        case 'finish': {
          if (cancelled) break;
          // What the researcher was looking at when they pressed Save. The
          // host has to end up holding exactly this.
          const draftAtFinish = canonicalize(
            session.getSnapshot().editedSection.fields,
          );
          const applies = carriedByFinish.length;
          try {
            await session.finish();
          } catch (error: unknown) {
            coverage.finishFailures += 1;
            const reaction = random();
            retryImmediately = reaction < 0.45;
            cancelImmediately = reaction >= 0.45 && reaction < 0.75;
            throw error;
          }
          coverage.finishes += 1;
          const carried = carriedByFinish[applies];
          if (carried === undefined) coverage.replayedFinishes += 1;
          else if (carried.length > 0) acknowledgeFinish(carried.at(-1) ?? 0);
          // Invariant 2: a finish that reported success left nothing pending
          // that it did not carry. Nothing edits the draft while this driver
          // awaits the finish, so everything pending beforehand was the
          // finish's to carry.
          const stillPending = session
            .getSnapshot()
            .pendingCommands.map((batch) => batch.id);
          if (stillPending.length > 0) {
            note(
              'finish-pending',
              `a finish reported success with batches ${JSON.stringify(stillPending)} still pending; it carried ${JSON.stringify(carried ?? null)}`,
            );
            break;
          }
          // Invariant 3: with nothing left pending, the stage the researcher
          // is looking at is the stage the protocol holds. A command applied
          // twice — an index-based move replayed onto a document that has
          // already moved — is exactly what breaks this, and a save that
          // reported success is the only notice anyone gets.
          const hostStage = canonicalize(
            stripIdentity(
              host.getSnapshot().protocolSections[stageSection] ?? {},
            ),
          );
          if (hostStage !== draftAtFinish) {
            note(
              'finish-divergence',
              `after a finish with nothing pending the host holds ${hostStage} but the draft is ${draftAtFinish}`,
            );
          }
          break;
        }
        case 'cancel': {
          const result = await session.cancel();
          if (result.status !== 'ok') break;
          coverage.cancels += 1;
          coverage.keptUnreconciled += result.data.keptUnreconciled.length;
          cancelled = true;
          const keptIds = result.data.keptUnreconciled.map(
            (descriptor) => descriptor.id,
          );
          const staged = await gateway.list({ status: 'staged' });
          if (staged.status !== 'ok') break;
          // Invariant 5: a kept id the host no longer holds as staged is
          // legitimate — the doubted promotion turns out to have committed it
          // — but a staged id the report does not name is a resource nothing
          // can ever reach.
          const unnamed = staged.data
            .map((descriptor) => descriptor.id)
            .filter((id) => !keptIds.includes(id));
          if (unnamed.length > 0) {
            note(
              'cancel-report',
              `the host still holds ${JSON.stringify(unnamed)}, which the report did not name (kept ${JSON.stringify(keptIds)})`,
            );
          }
          break;
        }
        case 'undo':
          if (cancelled) break;
          session.undo();
          break;
        case 'flush-live':
          flushLive();
          break;
      }
    } catch (error: unknown) {
      // Every throw a session makes is part of its contract (an invalid draft,
      // a refused promotion, read-only access). An adapter's own exception
      // escaping a session call is not, and is what this catch looks for.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('the adapter threw from')) {
        note(operation, `an adapter exception escaped: ${message}`);
      }
    }

    // Invariant 1: nothing the host committed is ever deleted.
    const manifest = gateway.getCommittedManifest();
    for (const id of everCommitted) {
      if (!Object.hasOwn(manifest, id)) {
        note(operation, `committed resource ${id} left the manifest`);
        everCommitted.delete(id);
      }
    }
    // Invariant 2, the other half: a replayed insert is the only way one
    // prompt id appears in the host's list more than once.
    const ids = promptIds(
      host.getSnapshot().protocolSections[stageSection]?.prompts,
    );
    if (new Set(ids).size !== ids.length) {
      note(operation, `the host's prompts hold a duplicate: ${ids.join(',')}`);
    }
  }

  // Invariant 4: the session is never stranded.
  if (!cancelled) {
    let settled = false;
    for (let attempt = 0; attempt < 12 && !settled; attempt += 1) {
      const result = await session.cancel();
      settled = result.status === 'ok' || !result.failure.retryable;
    }
    if (!settled) note('final-cancel', 'the session could never be left');
  }
  return violations;
}

const CASES_PER_BATCH = 40;
const BATCHES = 10;

const TOTAL: FuzzCoverage = {
  finishes: 0,
  finishFailures: 0,
  promotions: 0,
  cancels: 0,
  keptUnreconciled: 0,
  discards: 0,
  syncThrows: 0,
  lostAnswers: 0,
  replayedFinishes: 0,
};

describe(`composing edits, staging, finish, cancel and discard over ${BATCHES * CASES_PER_BATCH} seeded orderings`, () => {
  for (let batch = 0; batch < BATCHES; batch += 1) {
    const from = batch * CASES_PER_BATCH;
    const to = from + CASES_PER_BATCH;
    it(`holds its invariants over seeds ${from}–${to - 1}`, async () => {
      const found: Violation[] = [];
      for (let seed = from; seed < to; seed += 1) {
        found.push(...(await runCase(seed, TOTAL)));
      }
      expect(found).toEqual([]);
    });
  }

  // Runs after the batches above, and reads what they accumulated: invariants
  // that hold because nothing ever reached the branch they are about would be
  // green for no reason at all.
  it('reached every branch the invariants are about', () => {
    expect(TOTAL.finishes).toBeGreaterThan(150);
    expect(TOTAL.finishFailures).toBeGreaterThan(20);
    expect(TOTAL.promotions).toBeGreaterThan(10);
    expect(TOTAL.cancels).toBeGreaterThan(20);
    expect(TOTAL.discards).toBeGreaterThan(10);
    expect(TOTAL.syncThrows).toBeGreaterThan(10);
    expect(TOTAL.lostAnswers).toBeGreaterThan(10);
    expect(TOTAL.keptUnreconciled).toBeGreaterThan(0);
    // The composition this whole file was written for: a finish the host
    // answers out of its promotion cache, applying nothing.
    expect(TOTAL.replayedFinishes).toBeGreaterThan(0);
  });
});
