import { describe, expect, it } from 'vitest';

import { buildStageAvailabilityMap } from '@codaco/network-query';
import {
  generateInterviews,
  type GenerateInterviewsOptions,
  type SyntheticInterviewResult,
  type SyntheticSessionAction,
} from '@codaco/protocol-utilities';
import {
  asEntityAttributeReference,
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type SessionPayload,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../src/contract/types';
import {
  addEdge,
  addNode,
  addNodeToPrompt,
  deleteEdge,
  deleteNode,
  removeNodeFromPrompt,
  toggleEdge,
  toggleNodeAttributes,
  transitionStage,
  updateEdge,
  updateEgo,
  updateNode,
  updatePrompt,
  updateStageMetadata,
} from '../src/store/modules/session';
import { store as createStore } from '../src/store/store';

/**
 * The replay-parity oracle (spec rule 7 / criterion C1): the engine's captured
 * write trace, dispatched through the REAL Redux session store, must produce a
 * session identical to the engine's own fold. Any thunk rejection, reducer
 * throw, or state divergence is a parity failure — which is what makes "exact
 * same structure as an interview in the Interviewer app" an executable
 * property rather than a review claim.
 *
 * Fixtures here are restricted to the stage types whose simulators have
 * landed; each simulator phase widens the matrix, and the corpus leg joins in
 * Phase 4 (plan, Phase 2).
 */

type ReplayStore = ReturnType<typeof createStore>;

const payloadFor = (
  protocol: CurrentProtocol,
  session: SessionPayload,
): InterviewPayload => {
  const { assetManifest: _assetManifest, ...rest } = protocol;
  return {
    protocol: {
      ...rest,
      id: 'replay-protocol',
      hash: 'replay-hash',
      importedAt: session.startTime,
      assets: [],
    },
    session: {
      id: session.id,
      startTime: session.startTime,
      finishTime: null,
      exportTime: null,
      lastUpdated: session.startTime,
      network: {
        ego: {
          [entityPrimaryKeyProperty]:
            session.network.ego[entityPrimaryKeyProperty],
          [entityAttributesProperty]: {},
        },
        nodes: [],
        edges: [],
      },
    },
  };
};

/**
 * Dispatch one engine action through the real store. The engine's payloads
 * are the runtime thunks' own argument shapes; ids replay through the
 * `modelData` channels so later references resolve.
 */
const dispatchAction = async (
  replayStore: ReplayStore,
  action: SyntheticSessionAction,
): Promise<void> => {
  switch (action.type) {
    case 'addNode': {
      const {
        nodeType,
        uid,
        attributeData,
        allowUnknownAttributes,
        currentStep,
      } = action.payload;
      const result = await replayStore.dispatch(
        addNode({
          type: nodeType,
          attributeData,
          modelData: { [entityPrimaryKeyProperty]: uid },
          ...(allowUnknownAttributes ? { allowUnknownAttributes } : {}),
          currentStep,
        }),
      );
      if (addNode.rejected.match(result)) {
        throw new Error(
          `addNode rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'addNodeToPrompt': {
      const result = await replayStore.dispatch(
        addNodeToPrompt(action.payload),
      );
      if (addNodeToPrompt.rejected.match(result)) {
        throw new Error(
          `addNodeToPrompt rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'removeNodeFromPrompt': {
      const result = await replayStore.dispatch(
        removeNodeFromPrompt(action.payload),
      );
      if (removeNodeFromPrompt.rejected.match(result)) {
        throw new Error(
          `removeNodeFromPrompt rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'addEdge': {
      const { edgeType, uid, from, to, attributeData, currentStep } =
        action.payload;
      const result = await replayStore.dispatch(
        addEdge({
          type: edgeType,
          from,
          to,
          ...(attributeData ? { attributeData } : {}),
          modelData: { [entityPrimaryKeyProperty]: uid },
          currentStep,
        }),
      );
      if (addEdge.rejected.match(result)) {
        throw new Error(
          `addEdge rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'toggleEdge': {
      const { edgeType, uid, from, to, currentStep } = action.payload;
      const result = await replayStore.dispatch(
        toggleEdge({
          type: edgeType,
          from,
          to,
          modelData: { [entityPrimaryKeyProperty]: uid },
          currentStep,
        }),
      );
      if (toggleEdge.rejected.match(result)) {
        throw new Error(
          `toggleEdge rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'updateNode': {
      const result = await replayStore.dispatch(updateNode(action.payload));
      if (updateNode.rejected.match(result)) {
        throw new Error(
          `updateNode rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'updateEdge': {
      const result = await replayStore.dispatch(updateEdge(action.payload));
      if (updateEdge.rejected.match(result)) {
        throw new Error(
          `updateEdge rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'updateEgo': {
      const result = await replayStore.dispatch(
        updateEgo(action.payload.attributePatch),
      );
      if (updateEgo.rejected.match(result)) {
        throw new Error(
          `updateEgo rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'toggleNodeAttributes': {
      const result = await replayStore.dispatch(
        toggleNodeAttributes(action.payload),
      );
      if (toggleNodeAttributes.rejected.match(result)) {
        throw new Error(
          `toggleNodeAttributes rejected: ${result.error.message ?? 'unknown'}`,
        );
      }
      return;
    }
    case 'deleteNode':
      replayStore.dispatch(deleteNode(action.payload.nodeId));
      return;
    case 'deleteEdge':
      replayStore.dispatch(deleteEdge(action.payload.edgeId));
      return;
    case 'updatePrompt':
      replayStore.dispatch(updatePrompt(action.payload.promptIndex));
      return;
    case 'transitionStage':
      replayStore.dispatch(transitionStage());
      return;
    case 'updateStageMetadata':
      replayStore.dispatch(updateStageMetadata(action.payload));
      return;
  }
};

/**
 * The persisted-shape normaliser: hosts JSON/structured-clone sessions, so a
 * key whose value is `undefined` (the reducer's `_secureAttributes` slot when
 * encryption is off) and an absent key are the same stored session.
 */
const persisted = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Replay a generated session's trace and assert full parity: identical
 * network/stageMetadata/promptIndex, and route parity — at every stage
 * transition the runtime's own availability map must agree that the walk's
 * next visited stage is the next available one.
 */
const assertReplayParity = async (
  protocol: CurrentProtocol,
  options: GenerateInterviewsOptions,
): Promise<SyntheticInterviewResult | undefined> => {
  const respectSkipLogic = options.respectSkipLogic ?? true;
  const [result] = generateInterviews(protocol, {
    ...options,
    count: 1,
    captureTrace: true,
  });
  expect(result).toBeDefined();
  if (!result) return undefined;
  const { session, trace, currentStep, droppedOut, visitedStages } = result;
  expect(trace).toBeDefined();
  if (!trace) return result;

  const replayStore = createStore(payloadFor(protocol, session), {
    onSync: async () => undefined,
  });

  // The runtime's own answer to "where does the walk go after `from`",
  // evaluated over the network as the REPLAYED store now holds it.
  const nextExpectedAfter = (from: number): number | undefined => {
    if (!respectSkipLogic) {
      // Routing off is the preview contract: strictly sequential.
      return from + 1 < protocol.stages.length ? from + 1 : undefined;
    }
    const network = replayStore.getState().session.network;
    const availability = buildStageAvailabilityMap(
      [...protocol.stages, { id: '__finish__' }],
      network,
    );
    for (let index = from + 1; index < protocol.stages.length; index += 1) {
      if (availability[index]?.kind === 'available') return index;
    }
    return undefined;
  };

  // Route parity: after each stage transition, the walk's next visited stage
  // must be exactly the next available one by the runtime's OWN availability
  // rules over the state the runtime now holds.
  let transitionsSeen = 0;
  const expectRouteParity = () => {
    const from = visitedStages[transitionsSeen];
    expect(from).toBeDefined();
    if (from === undefined) return;
    const expected = nextExpectedAfter(from);
    const actual = visitedStages[transitionsSeen + 1];
    // A transition with no following visit means the interview ended: the
    // resume position must agree that no authored stage remained.
    expect(actual ?? protocol.stages.length).toBe(
      expected ?? protocol.stages.length,
    );
    if (actual === undefined) expect(currentStep).toBe(protocol.stages.length);
  };

  for (const action of trace) {
    if (action.type === 'transitionStage') {
      expectRouteParity();
      transitionsSeen += 1;
    }
    await dispatchAction(replayStore, action);
  }

  const replayed = replayStore.getState().session;
  expect(persisted(replayed.network)).toEqual(persisted(session.network));
  expect(persisted(replayed.stageMetadata ?? {})).toEqual(
    persisted(session.stageMetadata ?? {}),
  );
  expect(replayed.promptIndex ?? 0).toBe(session.promptIndex ?? 0);
  expect(typeof session.lastUpdated).toBe('string');
  expect(droppedOut ? session.finishTime === null : true).toBe(true);

  if (droppedOut) {
    // C1's dropped leg: an abandoned walk ends without a transition, so the
    // boundary is never route-checked above — instead the recorded resume
    // position must be the runtime's own next stage after the one the
    // participant abandoned, evaluated over the replayed final network.
    const last = visitedStages[visitedStages.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return result;
    expect(currentStep).toBe(nextExpectedAfter(last) ?? protocol.stages.length);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Fixtures — content-stage coverage; each simulator phase widens this matrix.
// ---------------------------------------------------------------------------

const contentProtocol = (): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Replay parity: content stages',
    schemaVersion: 8,
    codebook: {
      ego: {
        variables: {
          consent: { name: 'consent', type: 'boolean', component: 'Toggle' },
        },
      },
    },
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'w', type: 'text', content: 'Welcome.' }],
      },
      {
        id: 'skipped-when-empty',
        type: 'Information',
        label: 'Skipped',
        title: 'Skipped',
        items: [{ id: 's', type: 'text', content: 'Hidden on an empty ego.' }],
        // SKIP when the (always-empty here) ego consent is unanswered: the
        // rule matches, the stage is bypassed toward the destination, and the
        // walk must route exactly as the runtime does.
        skipLogic: {
          action: 'SKIP',
          filter: {
            rules: [
              {
                id: 'no-consent',
                type: 'ego',
                options: {
                  attribute: asEntityAttributeReference('consent'),
                  operator: 'NOT_EXISTS',
                },
              },
            ],
          },
        },
      },
      {
        id: 'privacy',
        type: 'Anonymisation',
        label: 'Privacy',
        explanationText: { title: 'Privacy', body: 'Choose a passphrase.' },
      },
      {
        id: 'thanks',
        type: 'Information',
        label: 'Thanks',
        title: 'Thanks',
        items: [{ id: 't', type: 'text', content: 'Thank you.' }],
      },
    ],
  }) as CurrentProtocol;

const PINNED: Partial<GenerateInterviewsOptions> = {
  seed: 42,
  startWindow: '2026-08-20T12:00:00.000Z',
  simulateDropOut: false,
};

describe('replay parity (C1)', () => {
  it('replays a completed content-stage walk with skip logic', async () => {
    await assertReplayParity(contentProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: true,
    });
  });

  it('replays the same protocol with skip logic disabled', async () => {
    await assertReplayParity(contentProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: false,
    });
  });

  it('replays a stop-at prefix', async () => {
    await assertReplayParity(contentProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: true,
      stopAt: { stageIndex: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// Five-interface coverage: the first point where simulator-emitted traces
// meet the real store. Counts and coins are authored deterministic so the
// fixture exercises every write path on every seed.
// ---------------------------------------------------------------------------

const fiveInterfaceProtocol = (): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Replay parity: five interfaces',
    schemaVersion: 8,
    codebook: {
      ego: {
        variables: {
          egoName: {
            name: 'egoName',
            type: 'text',
            component: 'Text',
            validation: { required: true },
          },
          consent: { name: 'consent', type: 'boolean', component: 'Toggle' },
        },
      },
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: {
              name: 'name',
              type: 'text',
              component: 'Text',
              validation: { required: true, unique: true },
            },
            age: {
              name: 'age',
              type: 'number',
              component: 'Number',
              validation: { minValue: 18, maxValue: 90 },
            },
            contactFreq: {
              name: 'contactFreq',
              type: 'ordinal',
              options: [
                { label: 'Often', value: 3 },
                { label: 'Sometimes', value: 2 },
                { label: 'Rarely', value: 1 },
              ],
            },
            support: {
              name: 'support',
              type: 'categorical',
              options: [
                { label: 'Emotional', value: 'emotional' },
                { label: 'Practical', value: 'practical' },
                { label: 'Advice', value: 'advice' },
              ],
            },
            supportOther: {
              name: 'supportOther',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
    },
    stages: [
      {
        id: 'ego',
        type: 'EgoForm',
        label: 'About you',
        introductionPanel: { title: 'About you', text: 'A little about you.' },
        form: {
          fields: [
            {
              variable: asEntityAttributeReference('egoName'),
              prompt: 'Your name?',
            },
            {
              variable: asEntityAttributeReference('consent'),
              prompt: 'Happy to continue?',
            },
          ],
        },
      },
      {
        id: 'quickadd',
        type: 'NameGeneratorQuickAdd',
        label: 'Quick add',
        quickAdd: asEntityAttributeReference('name'),
        subject: { entity: 'node', type: 'person' },
        synthetic: { count: { distribution: 'constant', value: 3 } },
        prompts: [
          { id: 'qa-1', text: 'Who matters to you?' },
          { id: 'qa-2', text: 'Anyone else?' },
        ],
      },
      {
        id: 'ng-form',
        type: 'NameGenerator',
        label: 'With detail',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'Add a person',
          fields: [
            {
              variable: asEntityAttributeReference('name'),
              prompt: 'Their name?',
            },
            {
              variable: asEntityAttributeReference('age'),
              prompt: 'Their age?',
            },
          ],
        },
        panels: [
          {
            id: 'panel-existing',
            title: 'Already mentioned',
            dataSource: 'existing',
            synthetic: { nominationProbability: 1 },
          },
        ],
        synthetic: { count: { distribution: 'constant', value: 2 } },
        prompts: [{ id: 'ng-1', text: 'Family you are in contact with?' }],
      },
      {
        id: 'skipped-with-people',
        type: 'Information',
        label: 'Skipped when anyone exists',
        title: 'Skipped',
        items: [
          { id: 'sk', type: 'text', content: 'Hidden once people exist.' },
        ],
        skipLogic: {
          action: 'SKIP',
          filter: {
            rules: [
              {
                id: 'has-person',
                type: 'node',
                options: { type: 'person', operator: 'EXISTS' },
              },
            ],
          },
        },
      },
      {
        id: 'ordbin',
        type: 'OrdinalBin',
        label: 'Contact',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'ord-1',
            text: 'When did you last speak?',
            variable: asEntityAttributeReference('contactFreq'),
            color: 'ord-color-seq-1',
          },
        ],
      },
      {
        id: 'catbin',
        type: 'CategoricalBin',
        label: 'Support',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'cat-1',
            text: 'What support do they give?',
            variable: asEntityAttributeReference('support'),
            otherVariable: asEntityAttributeReference('supportOther'),
            otherVariablePrompt: 'What support instead?',
            otherOptionLabel: 'Something else',
            synthetic: { otherBinProbability: 0.5 },
          },
        ],
      },
    ],
  }) as CurrentProtocol;

describe('replay parity (C1) — five interfaces', () => {
  it('replays a completed five-interface walk', async () => {
    await assertReplayParity(fiveInterfaceProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: true,
    });
  });

  it.each([7, 99, 1234])('holds across seed %d', async (seed) => {
    await assertReplayParity(fiveInterfaceProtocol(), {
      ...PINNED,
      seed,
      count: 1,
      respectSkipLogic: true,
    });
  });

  it('replays a mid-stage stop (arrived, nothing done)', async () => {
    await assertReplayParity(fiveInterfaceProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: true,
      stopAt: { stageIndex: 2, promptIndex: 0 },
    });
  });

  it('holds with dropout enabled, whatever the die decides', async () => {
    await assertReplayParity(fiveInterfaceProtocol(), {
      seed: 42,
      startWindow: '2026-08-20T12:00:00.000Z',
      count: 1,
      respectSkipLogic: true,
      simulateDropOut: true,
    });
  });
});

describe('the five-interface fixture is not vacuous', () => {
  // Parity compares two folds — if neither wrote anything it would pass
  // trivially. This pins that the walk really generates substance, so the
  // ten green parity runs above are proving something.
  it('writes people, answers, and a skipped stage', () => {
    const [result] = generateInterviews(fiveInterfaceProtocol(), {
      ...PINNED,
      count: 1,
      respectSkipLogic: true,
    });
    expect(result).toBeDefined();
    if (!result) throw new Error('unreachable');

    expect(result.droppedOut).toBe(false);
    // Stage 3 is authored to skip once anyone exists; quick-add guarantees 3.
    expect(result.visitedStages).toEqual([0, 1, 2, 4, 5]);

    const network = result.session.network;
    expect(network).toBeDefined();
    const nodes = network?.nodes ?? [];
    expect(nodes.length).toBeGreaterThanOrEqual(4);

    const names = nodes.map((node) => node[entityAttributesProperty]['name']);
    expect(
      names.every((name) => typeof name === 'string' && name.length > 0),
    ).toBe(true);
    expect(new Set(names).size).toBe(names.length);

    const attrs = nodes.map((node) => node[entityAttributesProperty]);
    expect(
      attrs.some((a) => [1, 2, 3].includes(a['contactFreq'] as number)),
    ).toBe(true);
    expect(
      attrs.some((a) => Array.isArray(a['support']) && a['support'].length > 0),
    ).toBe(true);

    expect(
      typeof result.session.network?.ego?.[entityAttributesProperty]?.[
        'egoName'
      ],
    ).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Dropped sessions: the drop boundary ends the walk without a transition, so
// this is the one leg the transition-driven route checks can never reach.
// Burden here is authored punishingly high so the hazard actually fires —
// at responseBurden 3000 the first roll's drop probability is ~96%.
// ---------------------------------------------------------------------------

const exhaustingProtocol = (): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Replay parity: exhausting content',
    schemaVersion: 8,
    codebook: {
      ego: {
        variables: {
          consent: { name: 'consent', type: 'boolean', component: 'Toggle' },
        },
      },
    },
    stages: [0, 1, 2, 3].map((index) => ({
      id: `slog-${index}`,
      type: 'Information',
      label: `Slog ${index}`,
      title: `Slog ${index}`,
      items: [{ id: `s${index}`, type: 'text', content: 'On and on it goes.' }],
      synthetic: { generatesData: false, responseBurden: 3000 },
    })),
  }) as CurrentProtocol;

describe('replay parity (C1) — dropped sessions', () => {
  it('replays a dropped walk and lands on the runtime resume position', async () => {
    const result = await assertReplayParity(exhaustingProtocol(), {
      seed: 42,
      startWindow: '2026-08-20T12:00:00.000Z',
      count: 1,
      respectSkipLogic: true,
      simulateDropOut: true,
      minimumCompletedRatio: 0,
    });

    // Not vacuous: this seed must actually abandon mid-protocol, leaving a
    // resume position inside the stage list.
    expect(result?.droppedOut).toBe(true);
    expect(result?.visitedStages.length).toBeLessThan(4);
    expect(result?.currentStep).toBeLessThan(4);
    expect(result?.session.finishTime ?? null).toBeNull();
  });

  it('drops at seed-determined points across a small batch', async () => {
    const results = generateInterviews(exhaustingProtocol(), {
      seed: 7,
      startWindow: '2026-08-20T12:00:00.000Z',
      count: 4,
      simulateDropOut: true,
      minimumCompletedRatio: 0,
      captureTrace: true,
    });

    expect(results.some((r) => r.droppedOut)).toBe(true);
    for (const result of results.filter((r) => r.droppedOut)) {
      // Every dropped member individually satisfies the dropped-leg checks;
      // parity for batch members is covered by the seeded single runs above,
      // so here we pin the envelope: truncated visits, in-range resume.
      expect(result.visitedStages.length).toBeLessThan(4);
      expect(result.currentStep).toBeGreaterThan(
        result.visitedStages[result.visitedStages.length - 1] ?? -1,
      );
      expect(result.session.finishTime ?? null).toBeNull();
    }
  });
});
