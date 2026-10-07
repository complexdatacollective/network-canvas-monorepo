import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { NcNetworkSchema } from '@codaco/shared-consts';

import {
  AnalyticsInput,
  FinishInput,
  FinishResult,
  InterviewNetwork,
  LinkUnavailable,
  NetworkEdge,
  NetworkEgo,
  NetworkNode,
  RedeemInput,
  MAX_ANALYTICS_EVENTS,
  MAX_ANALYTICS_PROPERTIES_LENGTH,
  RedeemResult,
  SessionEnded,
  SessionInput,
  SessionOutOfDate,
  SessionPayload,
  SessionTakenOver,
  SyncInput,
  SyncResult,
} from '../schema/participant.ts';

const network = {
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: 'Ada', closeness: 3 },
      stageId: 'stage-1',
      promptIDs: ['prompt-1'],
    },
  ],
  edges: [
    {
      _uid: 'edge-1',
      type: 'friend',
      from: 'node-1',
      to: 'node-1',
      attributes: {},
    },
  ],
  ego: {
    _uid: 'ego-1',
    attributes: { age: 41 },
    _secureAttributes: { age: { iv: [1, 2], salt: [3, 4] } },
  },
};

const sessionPayload = {
  studyId: '0b6f7d4e-3c2a-4f1e-9a8b-7c6d5e4f3a2b',
  holderEpoch: 2,
  revision: '7',
  stageIndex: 1,
  stageId: 'stage-1',
  session: {
    id: 'session-1',
    startTime: '2026-10-06T09:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-10-06T09:05:00.000Z',
    network,
    stageMetadata: { 'stage-1': { step: 1 } },
  },
  protocol: { schemaVersion: 8, stages: [], codebook: {} },
  analytics: true,
};

const roundTrips = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: unknown,
) => {
  const decoded = Schema.decodeUnknownSync(schema)(value);
  return Schema.encodeSync(schema)(decoded);
};

describe('the participant payloads', () => {
  it.each([
    ['RedeemInput', RedeemInput, { linkToken: 'team-1.secret-secret-secret' }],
    [
      'RedeemResult',
      RedeemResult,
      {
        sessionToken: 'team-1.secret-secret-secret',
        sessionId: 'session-1',
        anonymous: false,
      },
    ],
    ['SessionInput', SessionInput, { holderId: 'page-1' }],
    ['SessionPayload', SessionPayload, sessionPayload],
    [
      'SyncInput',
      SyncInput,
      {
        holderEpoch: 2,
        revision: '8',
        stageIndex: 1,
        stageId: null,
        network,
        stageMetadata: {},
      },
    ],
    ['SyncResult', SyncResult, { revision: '8', applied: true }],
    ['SyncResult', SyncResult, { revision: '8', applied: false }],
    ['FinishInput', FinishInput, { holderEpoch: 2, revision: '9' }],
    ['FinishResult', FinishResult, { state: 'completed' }],
    [
      'SessionPayload without analytics',
      SessionPayload,
      { ...sessionPayload, analytics: false },
    ],
    [
      'AnalyticsInput',
      AnalyticsInput,
      {
        events: [
          {
            event: 'stage_entered',
            properties: { stage_type: 'NameGenerator', stage_index: 1 },
            timestamp: '2026-10-07T09:00:00.000Z',
          },
        ],
      },
    ],
  ] as const)('%s round-trips', (_name, schema, value) => {
    expect(roundTrips(schema, value)).toEqual(value);
  });

  it('strips a key the contract does not declare, at every level', () => {
    const encoded = Schema.encodeSync(SessionPayload)({
      ...Schema.decodeUnknownSync(SessionPayload)(sessionPayload),
      sessionTokenHash: 'leaked',
      session: {
        ...Schema.decodeUnknownSync(SessionPayload)(sessionPayload).session,
        holderId: 'leaked',
        network: {
          ...network,
          nodes: [{ ...network.nodes[0], internalRowId: 'leaked' }],
        },
      },
    } as unknown as typeof SessionPayload.Type);

    expect(JSON.stringify(encoded)).not.toContain('leaked');
    expect(encoded).toEqual(sessionPayload);
  });

  it.each([
    ['a node id', { nodes: [{ ...network.nodes[0], _uid: 'n'.repeat(129) }] }],
    [
      'a node type',
      { nodes: [{ ...network.nodes[0], type: 't'.repeat(129) }] },
    ],
    [
      'an edge endpoint',
      { edges: [{ ...network.edges[0], to: 'n'.repeat(129) }] },
    ],
    ['the ego id', { ego: { ...network.ego, _uid: 'e'.repeat(129) } }],
  ])(
    'refuses %s past the 128 characters the database stores',
    (_label, change) => {
      expect(() =>
        Schema.decodeUnknownSync(SyncInput)({
          holderEpoch: 0,
          revision: '1',
          stageIndex: 0,
          stageId: null,
          network: { ...network, ...change },
          stageMetadata: {},
        }),
      ).toThrow();
    },
  );

  it.each([
    ['no events', []],
    [
      'more events than one call carries',
      Array.from({ length: MAX_ANALYTICS_EVENTS + 1 }, () => ({
        event: 'stage_entered',
        properties: {},
        timestamp: '2026-10-07T09:00:00.000Z',
      })),
    ],
    [
      'an event whose properties are too large',
      [
        {
          event: 'stage_entered',
          properties: { padding: 'x'.repeat(MAX_ANALYTICS_PROPERTIES_LENGTH) },
          timestamp: '2026-10-07T09:00:00.000Z',
        },
      ],
    ],
    [
      'an empty event name',
      [{ event: '', properties: {}, timestamp: '2026-10-07T09:00:00.000Z' }],
    ],
  ])('refuses an analytics call with %s', (_label, events) => {
    expect(() =>
      Schema.decodeUnknownSync(AnalyticsInput)({ events }),
    ).toThrow();
  });

  it('drops an over-long property name and keeps the rest', () => {
    const decoded = Schema.decodeUnknownSync(AnalyticsInput)({
      events: [
        {
          event: 'stage_entered',
          properties: { ['k'.repeat(201)]: 1, stage_index: 2 },
          timestamp: '2026-10-07T09:00:00.000Z',
        },
      ],
    });
    expect(decoded.events[0]?.properties).toEqual({ stage_index: 2 });
  });

  it('keeps the protocol document whole', () => {
    expect(roundTrips(SessionPayload, sessionPayload)).toHaveProperty(
      'protocol',
      sessionPayload.protocol,
    );
  });
});

describe('the participant errors', () => {
  it.each([
    ['SessionEnded', SessionEnded, new SessionEnded({ state: 'completed' })],
    [
      'SessionTakenOver',
      SessionTakenOver,
      new SessionTakenOver({ holderEpoch: 3 }),
    ],
    [
      'LinkUnavailable',
      LinkUnavailable,
      new LinkUnavailable({ state: 'finished' }),
    ],
    [
      'SessionOutOfDate',
      SessionOutOfDate,
      new SessionOutOfDate({ revision: '4' }),
    ],
  ] as const)('%s round-trips', (_name, schema, error) => {
    const decoded = Schema.decodeUnknownSync(schema)(
      Schema.encodeSync(schema)(error as never),
    );
    expect(decoded).toBeInstanceOf(schema);
    expect(decoded).toEqual(error);
  });
});

const zodKeys = (shape: object) => Object.keys(shape).toSorted();
const contractKeys = (schema: { fields: object }) =>
  Object.keys(schema.fields).toSorted();

describe('the network the contract declares', () => {
  const zod = NcNetworkSchema.shape;

  it('has exactly the network keys @codaco/shared-consts defines', () => {
    expect(contractKeys(InterviewNetwork)).toEqual(zodKeys(zod));
    expect(contractKeys(NetworkNode)).toEqual(zodKeys(zod.nodes.element.shape));
    expect(contractKeys(NetworkEdge)).toEqual(zodKeys(zod.edges.element.shape));
    expect(contractKeys(NetworkEgo)).toEqual(zodKeys(zod.ego.shape));
  });

  it('accepts what NcNetworkSchema accepts, unchanged', () => {
    const parsed = NcNetworkSchema.parse(network);
    expect(roundTrips(InterviewNetwork, parsed)).toEqual(parsed);
  });

  it('accepts the optional keys the interview runtime leaves undefined', () => {
    const unset = {
      nodes: [
        {
          ...network.nodes[0],
          stageId: undefined,
          promptIDs: undefined,
          _secureAttributes: undefined,
        },
      ],
      edges: [{ ...network.edges[0], _secureAttributes: undefined }],
      ego: { ...network.ego, _secureAttributes: undefined },
    };
    const parsed = NcNetworkSchema.parse(unset);

    expect(() => InterviewNetwork.make(parsed)).not.toThrow();
    expect(roundTrips(InterviewNetwork, parsed)).toEqual(parsed);
  });
});
