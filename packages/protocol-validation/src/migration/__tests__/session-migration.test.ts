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
  stageIndexMap,
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
    const failOnStep7: SessionMigrationStep<1 | 2 | 3, 2 | 3 | 4> = (
      current,
    ) => {
      if (current.currentStep === 7) throw new Error('step seven');
      return current;
    };
    const migrateSession = migratorFor(chainOf({ 2: failOnStep7 }));

    it('names the step that failed and keeps its error', () => {
      const result = migrateSession(session({ currentStep: 7 }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBeInstanceOf(SessionMigrationError);
      expect(result.error.reason).toBe('step-failed');
      expect(result.error.version).toBe(2);
      expect((result.error.cause as Error).message).toBe('step seven');
    });

    it('migrates the other sessions', () => {
      const results = [6, 7, 8].map((currentStep) =>
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

describe('stageIndexMap', () => {
  it('follows each stage by id, and the finish stage by its distance from the end', () => {
    const map = stageIndexMap(
      stages('a', 'b', 'c'),
      stages('a', 'new', 'b', 'c'),
    );
    expect([0, 1, 2, 3, 4].map(map.stage)).toEqual([0, 2, 3, 4, 5]);
  });

  it('drops a removed stage and resumes at the stage after it', () => {
    const map = stageIndexMap(stages('a', 'b', 'c'), stages('new', 'a', 'c'));
    expect(map.stage(1)).toBeUndefined();
    expect(map.position(1)).toBe(2);
    // With nothing after it, at the finish stage.
    const lastRemoved = stageIndexMap(stages('a', 'b'), stages('new', 'a'));
    expect(lastRemoved.position(1)).toBe(2);
  });

  it('keeps every index when stages cannot be matched but their number holds', () => {
    const map = stageIndexMap(
      { stages: [{}, {}] },
      { stages: [{ id: 'x' }, { id: 'y' }] },
    );
    expect(map.stage(1)).toBe(1);
  });

  it('refuses to guess when stages cannot be matched and their number changed', () => {
    expect(() =>
      stageIndexMap(
        { stages: [{ id: 'a' }, { id: 'a' }] },
        stages('a', 'b', 'c'),
      ),
    ).toThrow(/unique id/);
  });
});

describe('remapStageIndices', () => {
  const remap = (
    current: Partial<SessionDocument>,
    before: unknown,
    after: unknown,
  ) =>
    remapStageIndices(
      {
        network: emptyNetwork(),
        stageMetadata: {},
        currentStep: 0,
        ...current,
      },
      before,
      after,
    );

  it('moves records and the resume position, dropping a removed stage’s record', () => {
    const result = remap(
      {
        stageMetadata: { 0: 'a', 1: 'b', 2: 'c', other: 'kept' },
        currentStep: 2,
      },
      stages('a', 'b', 'c'),
      stages('new', 'a', 'c'),
    );
    expect(result.stageMetadata).toEqual({ 1: 'a', 2: 'c', other: 'kept' });
    expect(result.currentStep).toBe(2);
  });
});
