import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { Schema } from 'effect';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
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
import ui, {
  setPassphrase,
  setPassphraseInvalid,
} from '../../store/modules/ui';
import { AnalyticsContext } from '../AnalyticsContext';
import {
  InterviewAnalyticsEnvelope,
  type InterviewAnalyticsEventName,
  InterviewAnalyticsEvents,
  InterviewExceptionProperties,
} from '../events';
import { computeSuperProperties } from '../superProperties';
import { createTracker, type Tracker } from '../tracker';
import { useStageNavigationAnalytics } from '../useStageNavigationAnalytics';

const STRICT = { onExcessProperty: 'error' } as const;

const superProperties = computeSuperProperties(
  { installationId: 'studio', hostApp: 'studio' },
  {
    session: { id: 'session-1' },
    protocol: { hash: 'protocol-digest' },
  } as InterviewPayload,
);

const isCatalogued = (name: string): name is InterviewAnalyticsEventName =>
  Object.hasOwn(InterviewAnalyticsEvents, name);

const decodeWire = (name: string, properties: unknown) => {
  if (!isCatalogued(name)) return { name, decoded: false };
  const schema = Schema.Struct({
    ...InterviewAnalyticsEnvelope.fields,
    ...InterviewAnalyticsEvents[name].fields,
  });
  const wire: unknown = JSON.parse(JSON.stringify(properties));
  return {
    name,
    decoded: Schema.decodeUnknownOption(schema, STRICT)(wire)._tag === 'Some',
  };
};

const recordingTracker = () => {
  const client = {
    capture: vi.fn(),
    captureException: vi.fn(),
    register: vi.fn(),
  };
  const tracker = createTracker({
    client,
    superProperties,
    distinctId: 'a7f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607',
    ownsInstance: false,
  });
  return { client, tracker };
};

const NODE_TYPE = 'Close_Friend';
const EDGE_TYPE = 'Shared_Secret';

const buildStore = (tracker: Tracker) =>
  configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session-1',
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        network: {
          ego: { _uid: 'ego' },
          nodes: [
            {
              _uid: 'n1',
              type: NODE_TYPE,
              [entityAttributesProperty]: {},
              promptIDs: [],
            },
          ],
          edges: [],
        },
        promptIndex: 0,
      } as never,
      protocol: {
        id: 'p1',
        hash: 'protocol-digest',
        schemaVersion: 8,
        codebook: {
          node: { [NODE_TYPE]: { name: NODE_TYPE, color: 'a', variables: {} } },
          edge: { [EDGE_TYPE]: { name: EDGE_TYPE, color: 'b', variables: {} } },
        },
        stages: [
          { id: 's0', type: 'Information' },
          { id: 's1', type: 'NameGenerator', prompts: [{ id: 'p1' }] },
        ],
      } as never,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(
        createAnalyticsListenerMiddleware({ tracker }).middleware,
      ),
  });

describe('the analytics event catalogue', () => {
  it('describes the properties every tracker event carries', () => {
    const wire: unknown = JSON.parse(
      JSON.stringify({ ...superProperties, distinct_id: 'session-pseudonym' }),
    );
    expect(
      Schema.decodeUnknownOption(InterviewAnalyticsEnvelope, STRICT)(wire)._tag,
    ).toBe('Some');
  });

  it('decodes every event the network listener emits, as it leaves the tracker', async () => {
    const { client, tracker } = recordingTracker();
    const store = buildStore(tracker);

    await store.dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: {},
        modelData: { stageId: 's1' },
        currentStep: 1,
        allowUnknownAttributes: true,
      } as never) as never,
    );
    await store.dispatch(
      addEdge({
        from: 'ego',
        to: 'n1',
        type: EDGE_TYPE,
        currentStep: 1,
      } as never) as never,
    );
    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'n1', currentStep: 1 } as never) as never,
    );
    await store.dispatch(
      addNodeToPrompt({
        nodeId: 'n1',
        promptAttributes: {},
        currentStep: 1,
      } as never) as never,
    );
    store.dispatch(deleteEdge('e1') as never);
    store.dispatch(deleteNode('n1') as never);
    store.dispatch(
      restoreNode({
        _uid: 'n2',
        type: NODE_TYPE,
        [entityAttributesProperty]: {},
      }),
    );
    await store.dispatch(
      addNodesAndEdges({
        nodes: [
          { type: NODE_TYPE, modelData: { _uid: 'n3' } },
          { type: NODE_TYPE, modelData: { _uid: 'n4' } },
        ],
        edges: [{ from: 'n3', to: 'n4', type: EDGE_TYPE }],
        currentStep: 1,
      }),
    );
    store.dispatch(setPassphrase('a passphrase'));
    store.dispatch(setPassphraseInvalid(true));

    const captured = client.capture.mock.calls.map(([name, properties]) =>
      decodeWire(String(name), properties),
    );
    expect(new Set(captured.map(({ name }) => name))).toEqual(
      new Set([
        'node_added',
        'edge_created',
        'node_removed_from_prompt',
        'node_added_to_prompt',
        'edge_removed',
        'node_removed',
        'passphrase_set',
        'passphrase_validation_failed',
      ]),
    );
    expect(captured.filter(({ decoded }) => !decoded)).toEqual([]);
  });

  it('decodes the stage navigation events, as they leave the tracker', () => {
    const { client, tracker } = recordingTracker();
    const store = buildStore(tracker);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <AnalyticsContext.Provider value={tracker}>
          {children}
        </AnalyticsContext.Provider>
      </Provider>
    );
    const { rerender } = renderHook(
      (props: Parameters<typeof useStageNavigationAnalytics>[0]) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'Information' },
      },
    );
    rerender({ stage_index: 1, stage_type: 'NameGenerator' });
    rerender({ stage_index: 2, stage_type: 'FinishSession' });

    const captured = client.capture.mock.calls.map(([name, properties]) =>
      decodeWire(String(name), properties),
    );
    expect(captured.map(({ name }) => name)).toEqual([
      'interview_started',
      'stage_entered',
      'stage_exited',
      'stage_entered',
      'stage_exited',
      'stage_entered',
    ]);
    expect(captured.filter(({ decoded }) => !decoded)).toEqual([]);
  });

  it('refuses an event property the catalogue does not declare', () => {
    const { client, tracker } = recordingTracker();
    tracker.track('interview_finished', {
      stage_count: 3,
      name: 'Jane Doe',
    } as never);
    const [name, properties] = client.capture.mock.calls[0] ?? [];
    expect(decodeWire(String(name), properties).decoded).toBe(false);
  });

  it('describes every exception the interview reports', () => {
    const decode = Schema.decodeUnknownOption(
      InterviewExceptionProperties,
      STRICT,
    );
    expect(
      [
        { feature: 'locale-load', locale: 'pt-BR' },
        { feature: 'locale-load' },
        { feature: 'information-media', media_kind: 'video' },
        {
          feature: 'stage-error-boundary',
          component_stack: '\n    at Stage',
          is_offline: false,
        },
        { feature: 'stage-error-boundary', is_offline: true },
        { feature: 'external-data' },
        { feature: 'geospatial-map-init' },
      ].map((properties) => decode(properties)._tag),
    ).toEqual(Array.from({ length: 7 }, () => 'Some'));
    expect(decode({ feature: 'locale-load', locale: 'Jane Doe' })._tag).toBe(
      'None',
    );
  });
});
