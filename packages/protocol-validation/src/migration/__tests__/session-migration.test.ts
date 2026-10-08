import { describe, expect, it } from 'vitest';

import { SessionMigrationError } from '../errors.ts';
import {
  createMigration,
  MigrationChain,
  type ProtocolDocument,
  type SessionMigrationStep,
} from '../index.ts';
import { migrateProtocolWithSessions } from '../migrate-protocol.ts';
import {
  createSessionMigrator,
  type PersistedSession,
  remapStageIndices,
  type SessionDocument,
  type StageIndexMap,
  stageIdsOf,
  stageMovement,
} from '../session.ts';

type Fields = Record<string, unknown>;

const stages = (...ids: string[]) => ({
  stages: ids.map((id) => ({ id, type: 'Information' })),
});

const emptyNetwork = () => ({
  ego: { _uid: 'ego', attributes: {} },
  nodes: [] as Fields[],
  edges: [] as Fields[],
});

const session = (overrides: Partial<PersistedSession> = {}) => ({
  network: emptyNetwork(),
  stageMetadata: {} as unknown,
  currentStep: 0,
  ...overrides,
});

/**
 * A chain of made-up steps 1 → 2 → 3 → 4 over a document of stage ids. Each
 * step's protocol transform appends a stage; its session step records, on the
 * ego, which step ran and how many stages it saw before and after.
 */
const chainOf = (
  sessionSteps: Partial<
    Record<1 | 2 | 3, SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4>>
  >,
) => {
  const chain = new MigrationChain();
  for (const from of [1, 2, 3] as const) {
    chain.register(
      createMigration({
        from,
        to: (from + 1) as 2 | 3 | 4,
        dependencies: {},
        migrate: (doc) => {
          const { stages: current } = doc as unknown as {
            stages: { id: string }[];
          };
          return {
            ...doc,
            schemaVersion: from + 1,
            stages: [...current, { id: `added-${from}` }],
          } as unknown as ProtocolDocument<2 | 3 | 4>;
        },
        migrateSession: sessionSteps[from],
      }),
    );
  }
  return chain;
};

const migratorFor = (
  chain: MigrationChain,
  document: Fields = { schemaVersion: 1, ...stages('a', 'b') },
) => {
  const { sessionSteps } = chain.migrateWithSessionSteps(
    document as unknown as ProtocolDocument<1>,
    4,
  );
  return createSessionMigrator(sessionSteps);
};

const stageCount = (protocol: unknown) =>
  ((protocol as { stages: unknown[] }).stages ?? []).length;

const recordStep =
  (name: string): SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4> =>
  (current, { before, after }) => {
    const ran = (current.network.ego.attributes as Fields).ran;
    current.network.ego.attributes = {
      ran: [
        ...(Array.isArray(ran) ? ran : []),
        `${name}:${stageCount(before)}->${stageCount(after)}`,
      ],
    };
    return current;
  };

describe('session migration', () => {
  it('runs each step in order, with the protocol before and after that step', () => {
    const migrateSession = migratorFor(
      chainOf({ 1: recordStep('one'), 3: recordStep('three') }),
    );
    const result = migrateSession(session());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.session.network.ego.attributes.ran).toEqual([
      'one:2->3',
      'three:4->5',
    ]);
    expect(result.changed).toBe(true);
  });

  it('passes a session through a migration without session steps unchanged', () => {
    const migrateSession = migratorFor(chainOf({}));
    const stored = session({
      stageMetadata: { 1: { automaticLayout: true } },
      currentStep: 1,
    });
    const result = migrateSession(stored);
    expect(result).toEqual({
      success: true,
      changed: false,
      session: {
        network: stored.network,
        stageMetadata: stored.stageMetadata,
        currentStep: 1,
      },
    });
  });

  it('passes a session through when the protocol is already current', () => {
    const { migrateSession } = migrateProtocolWithSessions({
      schemaVersion: 9,
      name: 'Current',
      codebook: {},
      stages: [],
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: {},
    });
    const stored = session({ stageMetadata: null });
    expect(migrateSession(stored)).toEqual({
      success: true,
      changed: false,
      session: {
        network: stored.network,
        stageMetadata: undefined,
        currentStep: 0,
      },
    });
  });

  describe('reports each failing session without throwing', () => {
    // Stage 1 (`b`) keeps its index: each step appends its stage at the end.
    const failOnStage1: SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4> = (
      current,
    ) => {
      if (current.currentStep === 1) throw new Error('stage one');
      return current;
    };
    const migrateSession = migratorFor(chainOf({ 2: failOnStage1 }));

    it('names the step that failed and keeps its error', () => {
      const result = migrateSession(session({ currentStep: 1 }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBeInstanceOf(SessionMigrationError);
      expect(result.error.reason).toBe('step-failed');
      expect(result.error.version).toBe(2);
      expect((result.error.cause as Error).message).toBe('stage one');
    });

    it('migrates the other sessions', () => {
      const results = [0, 1, 2].map((currentStep) =>
        migrateSession(session({ currentStep })),
      );
      expect(results.map((result) => result.success)).toEqual([
        true,
        false,
        true,
      ]);
    });

    it('rejects what is not a session', () => {
      for (const bad of [
        { network: null, currentStep: 0 },
        { network: { nodes: [], edges: [] }, currentStep: 0 },
        { network: emptyNetwork(), stageMetadata: [], currentStep: 0 },
        { network: emptyNetwork(), currentStep: 1.5 },
      ]) {
        const result = migrateSession(bad);
        expect(result.success).toBe(false);
        if (result.success) continue;
        expect(result.error.reason).toBe('invalid-session');
      }
    });

    it('rejects a migrated session the current schema does not accept', () => {
      const breakMetadata: SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4> = (
        current,
      ) => ({ ...current, stageMetadata: { 0: { notARecord: true } } });
      const result = migratorFor(chainOf({ 1: breakMetadata }))(session());
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.reason).toBe('invalid-result');
      expect(result.error.message).toContain('stageMetadata.0');
    });
  });

  describe('purity', () => {
    it('never changes the session it is given, and repeats its answer', () => {
      const migrateSession = migratorFor(
        chainOf({ 1: recordStep('one'), 2: recordStep('two') }),
      );
      const stored = session({ stageMetadata: { 0: { framing: 'gamete' } } });
      const copy = structuredClone(stored);
      const first = migrateSession(stored);
      expect(stored).toEqual(copy);
      expect(migrateSession(stored)).toEqual(first);
    });

    it('gives each step frozen protocols', () => {
      const mutateProtocol: SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4> = (
        current,
        { before },
      ) => {
        (before as unknown as { stages: unknown[] }).stages.push({ id: 'x' });
        return current;
      };
      const migrateSession = migratorFor(chainOf({ 1: mutateProtocol }));
      const first = migrateSession(session());
      expect(first.success).toBe(false);
      if (first.success) return;
      expect(first.error.reason).toBe('step-failed');
      // The failed attempt left nothing behind for the next session.
      expect(migrateSession(session()).success).toBe(false);
    });
  });
});

describe('migrationV7toV8 stage positions', () => {
  const information = (id: string) => ({
    id,
    type: 'Information',
    label: id,
    title: id,
    items: [{ id: `${id}-text`, type: 'text', content: id }],
  });

  it('follows the stages left after an empty form is dropped', () => {
    const { protocol, migrateSession } = migrateProtocolWithSessions(
      {
        schemaVersion: 7,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          information('first'),
          {
            id: 'empty',
            type: 'EgoForm',
            label: 'Empty',
            form: { fields: [] },
          },
          information('last'),
        ],
      },
      9,
      { name: 'Forms' },
    );
    expect(protocol.stages.map((stage) => stage.id)).toEqual(['first', 'last']);

    const result = migrateSession(
      session({
        stageMetadata: {
          1: { automaticLayout: true },
          2: [[0, 'a', 'b', true]],
        },
        currentStep: 2,
      }),
    );
    expect(result).toEqual({
      success: true,
      changed: true,
      session: {
        network: emptyNetwork(),
        // The dropped form's record goes with it.
        stageMetadata: { 1: [[0, 'a', 'b', true]] },
        currentStep: 1,
      },
    });
    const atDropped = migrateSession(session({ currentStep: 1 }));
    expect(atDropped.success && atDropped.session.currentStep).toBe(1);
  });
});

/**
 * A one-step chain 1 → 2 whose protocol transform rewrites the stage ids with
 * `transform`, and which declares no session step unless given one.
 */
const stageChain = (
  transform: (ids: (string | undefined)[]) => (string | undefined)[],
  migrateSession?: SessionMigrationStep<1, 2>,
) => {
  const chain = new MigrationChain();
  chain.register(
    createMigration({
      from: 1,
      to: 2,
      dependencies: {},
      migrate: (doc) =>
        ({
          ...doc,
          schemaVersion: 2,
          stages: transform(stageIdsOf(doc)).map((id) =>
            id === undefined
              ? { type: 'Information' }
              : { id, type: 'Information' },
          ),
        }) as unknown as ProtocolDocument<2>,
      migrateSession,
    }),
  );
  return chain;
};

const migratorOf = (chain: MigrationChain, ...ids: (string | undefined)[]) => {
  const { sessionSteps } = chain.migrateWithSessionSteps(
    {
      schemaVersion: 1,
      stages: ids.map((id) => (id === undefined ? {} : { id })),
    } as unknown as ProtocolDocument<1>,
    2,
  );
  return createSessionMigrator(sessionSteps);
};

const migratedSession = (
  migrateSession: ReturnType<typeof createSessionMigrator>,
  stored: Partial<PersistedSession>,
) => {
  const result = migrateSession(session(stored));
  if (!result.success) throw result.error;
  return result.session;
};

const automaticLayout = (value: boolean) => ({ automaticLayout: value });

describe('stage positions, moved by the framework for every step', () => {
  it('follows a stage inserted by a step that declares no session step', () => {
    const migrateSession = migratorOf(
      stageChain((ids) => ['intro', ...ids]),
      'a',
      'b',
    );
    expect(
      migratedSession(migrateSession, {
        stageMetadata: { 0: automaticLayout(true), 1: automaticLayout(false) },
        currentStep: 1,
      }),
    ).toEqual({
      network: emptyNetwork(),
      stageMetadata: { 1: automaticLayout(true), 2: automaticLayout(false) },
      currentStep: 2,
    });
  });

  it('follows a stage removed by a step that declares no session step', () => {
    const migrateSession = migratorOf(
      stageChain((ids) => ids.filter((id) => id !== 'b')),
      'a',
      'b',
      'c',
    );
    expect(
      migratedSession(migrateSession, {
        stageMetadata: {
          0: automaticLayout(true),
          1: automaticLayout(false),
          2: automaticLayout(true),
        },
        currentStep: 2,
      }),
    ).toEqual({
      network: emptyNetwork(),
      // The removed stage's record goes with it.
      stageMetadata: { 0: automaticLayout(true), 1: automaticLayout(true) },
      currentStep: 1,
    });
  });

  it('follows stages a step reorders', () => {
    const migrateSession = migratorOf(
      stageChain((ids) => [...ids].reverse()),
      'a',
      'b',
      'c',
    );
    expect(
      migratedSession(migrateSession, {
        stageMetadata: { 0: automaticLayout(true) },
        currentStep: 0,
      }),
    ).toMatchObject({
      stageMetadata: { 2: automaticLayout(true) },
      currentStep: 2,
    });
  });

  it('resumes at the next surviving stage when the current one was removed', () => {
    const migrateSession = migratorOf(
      stageChain((ids) => ids.filter((id) => id !== 'b')),
      'a',
      'b',
      'c',
    );
    expect(
      migratedSession(migrateSession, { currentStep: 1 }).currentStep,
    ).toBe(1);
    // With nothing after it, at the finish position.
    const lastRemoved = migratorOf(
      stageChain((ids) => ids.filter((id) => id !== 'c')),
      'a',
      'b',
      'c',
    );
    expect(migratedSession(lastRemoved, { currentStep: 2 }).currentStep).toBe(
      2,
    );
  });

  it('does not send a session back to a stage inserted before its own', () => {
    const migrateSession = migratorOf(
      stageChain(() => ['a', 'intro', 'b']),
      'a',
      'b',
    );
    // On `b`: still on `b`, not on its new introduction.
    expect(
      migratedSession(migrateSession, { currentStep: 1 }).currentStep,
    ).toBe(2);
    // On `a`: the introduction is still ahead of it.
    expect(
      migratedSession(migrateSession, { currentStep: 0 }).currentStep,
    ).toBe(0);
  });

  it('keeps the finish position the finish position', () => {
    const inserted = migratorOf(
      stageChain((ids) => ['intro', ...ids]),
      'a',
      'b',
    );
    expect(migratedSession(inserted, { currentStep: 2 }).currentStep).toBe(3);
    const removed = migratorOf(
      stageChain((ids) => ids.slice(1)),
      'a',
      'b',
    );
    expect(migratedSession(removed, { currentStep: 2 }).currentStep).toBe(1);
  });

  it('hands a session step the session already at the new stage positions', () => {
    const seen: SessionDocument[] = [];
    const migrateSession = migratorOf(
      stageChain(
        (ids) => ['intro', ...ids],
        (current) => {
          seen.push(structuredClone(current));
          return current;
        },
      ),
      'a',
      'b',
    );
    migratedSession(migrateSession, {
      stageMetadata: { 1: automaticLayout(true) },
      currentStep: 1,
    });
    expect(seen).toEqual([
      {
        network: emptyNetwork(),
        stageMetadata: { 2: automaticLayout(true) },
        currentStep: 2,
      },
    ]);
  });

  it('records nothing for a step that neither moves stages nor declares a session step', () => {
    const { sessionSteps } = stageChain((ids) => ids).migrateWithSessionSteps(
      {
        schemaVersion: 1,
        stages: [{ id: 'a' }, { id: 'b' }],
      } as unknown as ProtocolDocument<1>,
      2,
    );
    expect(sessionSteps).toEqual([]);
  });

  describe('a protocol without a unique id on every stage', () => {
    it('keeps every position when the step keeps the number of stages', () => {
      const migrateSession = migratorOf(
        stageChain((ids) => ids.map(() => undefined)),
        undefined,
        undefined,
      );
      expect(
        migratedSession(migrateSession, {
          stageMetadata: { 1: automaticLayout(true) },
          currentStep: 1,
        }),
      ).toMatchObject({
        stageMetadata: { 1: automaticLayout(true) },
        currentStep: 1,
      });
    });

    it('fails every session when the step changes the number of stages', () => {
      for (const ids of [
        [undefined, 'b'],
        ['a', 'a'],
      ]) {
        const migrateSession = migratorOf(
          stageChain((current) => ['intro', ...current]),
          ...ids,
        );
        const result = migrateSession(session());
        expect(result.success).toBe(false);
        if (result.success) continue;
        expect(result.error).toBeInstanceOf(SessionMigrationError);
        expect(result.error.reason).toBe('stages-unmatched');
        expect(result.error.version).toBe(1);
      }
    });
  });
});

describe('stageMovement', () => {
  const mapOf = (
    before: (string | undefined)[],
    after: (string | undefined)[],
  ): StageIndexMap => {
    const movement = stageMovement(before, after);
    if (movement.kind !== 'moved') throw new Error(movement.kind);
    return movement.map;
  };

  it('follows each stage by id, and the finish stage by its distance from the end', () => {
    const map = mapOf(['a', 'b', 'c'], ['a', 'new', 'b', 'c']);
    expect([0, 1, 2, 3, 4].map(map.stage)).toEqual([0, 2, 3, 4, 5]);
  });

  it('drops a removed stage and resumes at the stage after it', () => {
    const map = mapOf(['a', 'b', 'c'], ['new', 'a', 'c']);
    expect(map.stage(1)).toBeUndefined();
    expect(map.position(1)).toBe(2);
    // With nothing after it, at the finish stage.
    expect(mapOf(['a', 'b'], ['new', 'a']).position(1)).toBe(2);
  });

  it('reports no movement when the ids stay in order', () => {
    expect(stageMovement(['a', 'b'], ['a', 'b'])).toEqual({ kind: 'none' });
  });

  it('assumes nothing moved when stages cannot be matched but their number holds', () => {
    expect(stageMovement([undefined, undefined], ['x', 'y'])).toEqual({
      kind: 'none',
    });
  });

  it('refuses to guess when stages cannot be matched and their number changed', () => {
    expect(stageMovement(['a', 'a'], ['a', 'b', 'c'])).toEqual({
      kind: 'unmatched',
    });
  });
});

describe('remapStageIndices', () => {
  it('moves records and the resume position, dropping a removed stage’s record', () => {
    const result = remapStageIndices(
      {
        network: emptyNetwork(),
        stageMetadata: { 0: 'a', 1: 'b', 2: 'c', other: 'kept' },
        currentStep: 2,
      },
      (() => {
        const movement = stageMovement(['a', 'b', 'c'], ['new', 'a', 'c']);
        if (movement.kind !== 'moved') throw new Error(movement.kind);
        return movement.map;
      })(),
    );
    expect(result.stageMetadata).toEqual({ 1: 'a', 2: 'c', other: 'kept' });
    expect(result.currentStep).toBe(2);
  });
});
