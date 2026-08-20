import { describe, expect, it } from 'vitest';

import { buildStageAvailabilityMap } from '@codaco/network-query';
import {
  generateInterviews,
  type GenerateInterviewsOptions,
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
): Promise<void> => {
  const respectSkipLogic = options.respectSkipLogic ?? true;
  const [result] = generateInterviews(protocol, {
    ...options,
    count: 1,
    captureTrace: true,
  });
  expect(result).toBeDefined();
  if (!result) return;
  const { session, trace, currentStep, droppedOut, visitedStages } = result;
  expect(trace).toBeDefined();
  if (!trace) return;

  const replayStore = createStore(payloadFor(protocol, session), {
    onSync: async () => undefined,
  });

  // Route parity: after each stage transition, the walk's next visited stage
  // must be exactly the next available one by the runtime's OWN availability
  // rules over the state the runtime now holds.
  let transitionsSeen = 0;
  const expectRouteParity = () => {
    const network = replayStore.getState().session.network;
    const availability = buildStageAvailabilityMap(
      [...protocol.stages, { id: '__finish__' }],
      network,
    );
    const from = visitedStages[transitionsSeen];
    expect(from).toBeDefined();
    if (from === undefined) return;
    let expected: number | undefined;
    if (respectSkipLogic) {
      for (let index = from + 1; index < protocol.stages.length; index += 1) {
        if (availability[index]?.kind === 'available') {
          expected = index;
          break;
        }
      }
    } else {
      // Routing off is the preview contract: strictly sequential.
      expected = from + 1 < protocol.stages.length ? from + 1 : undefined;
    }
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
