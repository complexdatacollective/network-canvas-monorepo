import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { createAnalyticsListenerMiddleware } from '../../store/middleware/analyticsListener';
import protocol from '../../store/modules/protocol';
import session, {
  addEdge,
  addNode,
  addNodesAndEdges,
  addNodeToPrompt,
  deleteEdge,
  deleteNode,
  removeNodeFromPrompt,
  restoreNode,
} from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { makeVariableUUIDReplacer } from '../../utils/loadExternalData';
import { createTracker, type Tracker } from '../tracker';

const SENTINELS = [
  'CODEBOOK_LABEL_TRIGGER',
  'PROMPT_TEXT_TRIGGER',
  'NODE_LABEL_TRIGGER',
  'PARTICIPANT_INPUT_TRIGGER',
  'PASSPHRASE_TRIGGER',
  'SESSION_ID_TRIGGER',
  'Close_Friend_TYPE_KEY_TRIGGER',
  'Shared_Secret_TYPE_KEY_TRIGGER',
];

const NODE_TYPE_KEY = 'Close_Friend_TYPE_KEY_TRIGGER';
const EDGE_TYPE_KEY = 'Shared_Secret_TYPE_KEY_TRIGGER';

function containsSentinel(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string')
    return SENTINELS.some((s) => value.includes(s));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      containsSentinel,
    );
  }
  return false;
}

function buildStore(tracker: Tracker) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'SESSION_ID_TRIGGER',
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        network: {
          ego: { _uid: 'ego', PARTICIPANT_INPUT_TRIGGER: 'value' },
          nodes: [
            {
              _uid: 'n1',
              type: NODE_TYPE_KEY,
              [entityAttributesProperty]: { label: 'NODE_LABEL_TRIGGER' },
              promptIDs: [],
            },
          ],
          edges: [],
        },
        promptIndex: 0,
      } as never,
      protocol: {
        id: 'p1',
        hash: 'h1',
        schemaVersion: 9,
        name: 'PROMPT_TEXT_TRIGGER',
        description: 'PROMPT_TEXT_TRIGGER',
        codebook: {
          node: {
            [NODE_TYPE_KEY]: {
              name: 'CODEBOOK_LABEL_TRIGGER',
              color: 'blue',
              variables: {},
            },
          },
          edge: {
            [EDGE_TYPE_KEY]: {
              name: 'CODEBOOK_LABEL_TRIGGER',
              color: 'red',
              variables: {},
            },
          },
        },
        stages: [{ id: 's0', type: 'Information' }],
      } as never,
    },
    middleware: (g) =>
      g({ serializableCheck: false }).concat(
        createAnalyticsListenerMiddleware({ tracker }).middleware,
      ),
  });
}

describe('PII guard — global listener events never leak sentinels', () => {
  it('emits no event whose name or properties contain author-authored or participant-input strings', async () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const store = buildStore(tracker);

    // Exercise actions that trigger listeners
    await store.dispatch(
      addNode({
        type: NODE_TYPE_KEY,
        attributeData: { label: 'NODE_LABEL_TRIGGER' },
        modelData: { stageId: 's0' },
        currentStep: 0,
        allowUnknownAttributes: true,
      } as never) as never,
    );
    store.dispatch(deleteNode('n1') as never);
    await store.dispatch(
      addEdge({
        from: 'ego',
        to: 'n1',
        type: EDGE_TYPE_KEY,
        currentStep: 0,
      } as never) as never,
    );
    store.dispatch(deleteEdge('e1') as never);
    store.dispatch(
      restoreNode({
        _uid: 'n2',
        type: NODE_TYPE_KEY,
        [entityAttributesProperty]: {},
      }),
    );
    await store.dispatch(
      addNodesAndEdges({
        nodes: [
          { type: NODE_TYPE_KEY, modelData: { _uid: 'n3' } },
          { type: NODE_TYPE_KEY, modelData: { _uid: 'n4' } },
        ],
        edges: [{ from: 'n3', to: 'n4', type: EDGE_TYPE_KEY }],
        currentStep: 0,
      }),
    );

    const typed = tracker.track.mock.calls.filter(
      ([eventName]) =>
        eventName === 'node_added' || eventName === 'edge_created',
    );
    expect(typed.map(([eventName]) => eventName)).toEqual([
      'node_added',
      'edge_created',
      'node_added',
      'node_added',
      'node_added',
      'edge_created',
    ]);

    for (const call of tracker.track.mock.calls) {
      const [eventName, props] = call;
      expect(
        containsSentinel(eventName),
        `event name leaked: ${eventName}`,
      ).toBe(false);
      expect(
        containsSentinel(props),
        `event props leaked sentinel: ${JSON.stringify(props)}`,
      ).toBe(false);
    }
  });
});

// A roster node's `_uid` is a deterministic, unkeyed digest of the row's own
// content, so it is recomputable by anyone holding the roster and identical in
// every interview that offers that row. These tests drive the real listener
// through the real tracker — the boundary that pseudonymises — because that is
// the only place the emitted identifier can be observed.
const rosterCodebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  },
};

const rosterRow: Partial<NcNode> = {
  [entityAttributesProperty]: { name: 'Enumerable Person', age: '31' },
};

const rosterUid = makeVariableUUIDReplacer(rosterCodebook, 'person')(
  rosterRow,
  0,
)[entityPrimaryKeyProperty];

const trackerSuperProps = {
  app: 'Interviewer',
  $app_name: 'Interviewer',
  installation_id: 'install-1',
  package_version: '1',
  protocol_hash: 'h1',
} as const;

function buildRosterStore(tracker: Tracker) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'interview-1',
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        network: { ego: { _uid: 'ego' }, nodes: [], edges: [] },
        promptIndex: 0,
      } as never,
      protocol: {
        id: 'p1',
        hash: 'h1',
        schemaVersion: 9,
        codebook: rosterCodebook,
        stages: [
          { id: 's0', type: 'Information' },
          {
            id: 's1',
            type: 'NameGeneratorRoster',
            externalDataError: { en: 'External data could not be loaded.' },
            allAddedNotice: {
              en: 'There is nothing left to add from this list.',
            },
            prompts: [{ id: 'p1' }],
          },
        ],
      } as never,
    },
    middleware: (g) =>
      g({ serializableCheck: false }).concat(
        createAnalyticsListenerMiddleware({ tracker }).middleware,
      ),
  });
}

/** Nominate the roster row, then move it in and out of the prompt. */
async function runRosterSession(distinctId: string) {
  const client = { capture: vi.fn(), captureException: vi.fn() };
  const tracker = createTracker({
    client: client as never,
    superProperties: trackerSuperProps,
    distinctId,
    ownsInstance: false,
  });
  const store = buildRosterStore(tracker);

  await store.dispatch(
    addNode({
      type: 'person',
      modelData: { [entityPrimaryKeyProperty]: rosterUid },
      attributeData: rosterRow[entityAttributesProperty],
      currentStep: 1,
      allowUnknownAttributes: true,
    } as never) as never,
  );
  await store.dispatch(
    removeNodeFromPrompt({
      nodeId: rosterUid,
      currentStep: 1,
    } as never) as never,
  );
  await store.dispatch(
    addNodeToPrompt({
      nodeId: rosterUid,
      promptAttributes: {},
      currentStep: 1,
    } as never) as never,
  );
  store.dispatch(deleteNode(rosterUid) as never);

  return client.capture.mock.calls.map(
    ([event, props]) =>
      [event, props as Record<string, unknown>] as [
        string,
        Record<string, unknown>,
      ],
  );
}

describe('PII guard — roster node identifiers never reach analytics', () => {
  it('reports a node_id on every entity event that is not the roster _uid', async () => {
    const captured = await runRosterSession('interview-1');

    const nodeEvents = captured.filter(([, props]) => 'node_id' in props);
    // Guards against a vacuous pass if the property were simply dropped.
    expect(nodeEvents.map(([event]) => event)).toEqual([
      'node_added',
      'node_removed_from_prompt',
      'node_added_to_prompt',
      'node_removed',
    ]);

    for (const [event, props] of nodeEvents) {
      expect(props.node_id, `${event} carried no node_id`).toEqual(
        expect.any(String),
      );
      expect(props.node_id, `${event} leaked the roster _uid`).not.toBe(
        rosterUid,
      );
    }

    expect(JSON.stringify(captured)).not.toContain(rosterUid);
  });

  it('reports one pseudonym for the roster row within a session', async () => {
    const captured = await runRosterSession('interview-1');
    const reported = new Set(
      captured
        .filter(([, props]) => 'node_id' in props)
        .map(([, props]) => props.node_id),
    );
    expect(reported.size).toBe(1);
  });

  it('reports unlinkable pseudonyms for the same roster row in two sessions', async () => {
    const first = await runRosterSession('interview-1');
    const second = await runRosterSession('interview-2');
    const nodeIdOf = (calls: [string, Record<string, unknown>][]) =>
      calls.find(([event]) => event === 'node_added')?.[1].node_id;
    expect(nodeIdOf(first)).toEqual(expect.any(String));
    expect(nodeIdOf(first)).not.toBe(nodeIdOf(second));
  });
});
