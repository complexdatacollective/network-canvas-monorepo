import SuperJSON from 'superjson';
import { describe, expect, it } from 'vitest';

import { createInitialNetwork } from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  networkWithEncryptionHeader,
  schema8EncryptedNetwork,
} from '~/lib/__tests__/encryptedNetworks';
import type { GetInterviewByIdQuery } from '~/queries/interviews';

import {
  mapInterviewForViewer,
  mapInterviewPayload,
} from '../mapInterviewPayload';

type Source = NonNullable<GetInterviewByIdQuery>;
type StoredProtocol = Partial<
  Pick<Source['protocol'], 'stages' | 'codebook' | 'experiments'>
>;

/**
 * A minimal interview row shaped exactly as `getInterviewById` returns it, with
 * every JSON column (the interview's and its protocol's) exactly as stored.
 */
function makeSource(
  schemaVersion: number,
  stored: Partial<Pick<Source, 'network' | 'stageMetadata'>> = {},
  storedProtocol: StoredProtocol = {},
): Source {
  return {
    id: 'interview-1',
    startTime: new Date('2026-01-01T00:00:00.000Z'),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date('2026-01-02T00:00:00.000Z'),
    network: {
      nodes: [],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
    participantId: 'participant-1',
    protocolId: 'protocol-1',
    currentStep: 3,
    stageMetadata: null,
    isSynthetic: false,
    syncRevision: 7,
    localePreference: null,
    locale: null,
    finishStageId: null,
    finishOutcome: null,
    protocol: {
      id: 'protocol-1',
      hash: 'abc123',
      name: 'Test Protocol',
      schemaVersion,
      description: null,
      importedAt: new Date('2026-01-01T00:00:00.000Z'),
      stages: [],
      codebook: { node: {}, edge: {} },
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: {},
      originalFileKey: null,
      originalFileUrl: null,
      assets: [],
      ...storedProtocol,
    },
    ...stored,
  };
}

function mapReady(source: Source) {
  const result = mapInterviewPayload(source);
  if (!result.success) throw new Error('Expected a readable interview');
  return result;
}

describe('mapInterviewPayload', () => {
  it('stamps the payload with the protocol row’s own schema version', () => {
    const { payload, initialStep } = mapReady(
      makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION),
    );

    expect(payload.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect(payload.protocol.hash).toBe('abc123');
    expect(initialStep).toBe(3);
  });

  it('carries the row’s stored sync revision through, so writes are numbered from it', () => {
    // Numbering from zero instead would make every write a reloaded tab makes
    // older than what is stored, and the endpoint would discard all of them.
    const { initialSyncRevision } = mapReady(
      makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION),
    );

    expect(initialSyncRevision).toBe(7);
  });

  it('offers every declared locale, with its text direction', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapReady({
      ...source,
      protocol: {
        ...source.protocol,
        localization: { defaultLocale: 'fr', locales: ['fr', 'en', 'ar'] },
      },
    });

    expect(payload.session.localeOptions).toEqual([
      expect.objectContaining({ locale: 'fr', direction: 'ltr' }),
      expect.objectContaining({ locale: 'en', direction: 'ltr' }),
      expect.objectContaining({ locale: 'ar', direction: 'rtl' }),
    ]);
    expect(payload.protocol.localization).toEqual({
      defaultLocale: 'fr',
      locales: ['fr', 'en', 'ar'],
    });
  });

  it('carries the stored locale fields into the session', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapReady({
      ...source,
      localePreference: 'fr',
      locale: 'en',
    });

    expect(payload.session.localePreference).toBe('fr');
    expect(payload.session.locale).toBe('en');
  });

  it('carries a finished interview’s finish stage into the session', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapReady({
      ...source,
      finishTime: new Date('2026-01-03T00:00:00.000Z'),
      finishStageId: 'finish-ineligible',
      finishOutcome: 'ineligible',
    });

    expect(payload.session.finishTime).toBe('2026-01-03T00:00:00.000Z');
    expect(payload.session.finishStageId).toBe('finish-ineligible');
  });

  it('leaves the finish stage null for an interview finished before one was recorded', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapReady({
      ...source,
      finishTime: new Date('2026-01-03T00:00:00.000Z'),
    });

    expect(payload.session.finishStageId).toBeNull();
  });

  it('refuses a protocol row stored below the compatible version rather than mislabelling it', () => {
    const staleVersion = COMPATIBLE_PROTOCOL_SCHEMA_VERSION - 1;

    expect(() => mapInterviewPayload(makeSource(staleVersion))).toThrow(
      new RegExp(
        `Test Protocol.+protocol-1.+${staleVersion}.+${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}`,
        's',
      ),
    );
  });

  it('refuses a protocol row stored above the compatible version', () => {
    expect(() =>
      mapInterviewPayload(makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION + 1)),
    ).toThrow(/must be migrated/);
  });

  describe('stored participant data', () => {
    // Still holds the participant's answers, but no longer parses: a node
    // attribute holding a nested object.
    const unreadableNetwork = {
      nodes: [
        {
          _uid: 'node-1',
          type: 'person',
          attributes: { name: 'Ada', invalid: { nested: 'value' } },
        },
      ],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    };

    it('refuses to start from a stored network it cannot read, rather than from an empty one', () => {
      const result = mapInterviewPayload(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
          network: unreadableNetwork,
        }),
      );

      expect(result).toMatchObject({ success: false, unreadable: 'session' });
      expect(result).not.toHaveProperty('payload');
    });

    it('refuses to start from stored stage metadata it cannot read', () => {
      const result = mapInterviewPayload(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
          stageMetadata: { 'stage-1': 'not a list of answers' },
        }),
      );

      expect(result).toMatchObject({ success: false, unreadable: 'session' });
      expect(result).not.toHaveProperty('payload');
    });

    it('refuses a stored network that is missing altogether', () => {
      const result = mapInterviewPayload(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, { network: null }),
      );

      expect(result).toMatchObject({ success: false, unreadable: 'session' });
    });

    it('hands the client the stored network and stage metadata it read', () => {
      const network = {
        nodes: [
          { _uid: 'node-1', type: 'person', attributes: { name: 'Ada' } },
        ],
        edges: [],
        ego: { _uid: 'ego-1', attributes: { age: 42 } },
      };
      const stageMetadata = { 'stage-1': [[0, 'node-1', 'node-2', false]] };

      const { payload } = mapReady(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
          network,
          stageMetadata,
        }),
      );

      expect(payload.session.network).toEqual(network);
      expect(payload.session.stageMetadata).toEqual(stageMetadata);
    });

    it('starts without stage metadata when none is stored', () => {
      const { payload } = mapReady(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, { stageMetadata: null }),
      );

      expect(payload.session.stageMetadata).toBeUndefined();
    });
  });

  describe('stored protocol', () => {
    // Each of these still holds the researcher's design, but no longer parses.
    // An interview run against an empty stand-in for it would collect nothing,
    // and the participant could finish it believing they had taken part.
    it.each<[string, StoredProtocol]>([
      ['stages', { stages: [{ id: 'stage-1', type: 'NotAnInterface' }] }],
      ['codebook', { codebook: { node: { person: 'not an entity type' } } }],
      ['experiments', { experiments: { notAnExperiment: true } }],
    ])(
      'refuses to start from %s it cannot read, rather than from an empty stand-in',
      (_field, storedProtocol) => {
        const result = mapInterviewPayload(
          makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {}, storedProtocol),
        );

        expect(result).toMatchObject({
          success: false,
          unreadable: 'protocol',
        });
        expect(result).not.toHaveProperty('payload');
      },
    );

    it('refuses a protocol whose stages are missing altogether', () => {
      const result = mapInterviewPayload(
        makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {}, { stages: null }),
      );

      expect(result).toMatchObject({ success: false, unreadable: 'protocol' });
    });

    it('hands the client the protocol it read', () => {
      const codebook = { node: {}, edge: {}, ego: { variables: {} } };
      // Schema 9 declares no experiments; the setting is kept, empty.
      const experiments = {};

      const { payload } = mapReady(
        makeSource(
          COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
          {},
          { stages: [], codebook, experiments },
        ),
      );

      expect(payload.protocol.stages).toEqual([]);
      expect(payload.protocol.codebook).toEqual(codebook);
      expect(payload.protocol.experiments).toEqual(experiments);
    });

    it('reads a protocol that stores no experiments as having none enabled', () => {
      const { payload } = mapReady(
        makeSource(
          COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
          {},
          { experiments: null },
        ),
      );

      expect(payload.protocol.experiments).toEqual({});
    });
  });

  it.each([
    {
      label: 'the encryption header and IV-only values',
      stored: networkWithEncryptionHeader,
    },
    {
      label: 'schema 8 values without a header',
      stored: schema8EncryptedNetwork,
    },
  ])('hands the interview a network with $label unchanged', ({ stored }) => {
    const { payload } = mapReady(
      makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, { network: stored }),
    );

    expect(payload.session.network).toStrictEqual(stored);
  });
});

/**
 * A finished interview holding answers in every place a payload could carry
 * them: a node, an edge, the ego, and stage metadata. Each value is a marker no
 * other part of the payload contains, so finding one in a serialised payload
 * means the answer was sent.
 */
function makeFinishedSource(): NonNullable<GetInterviewByIdQuery> {
  const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
  return {
    ...source,
    // Resources whose entries a completed view must not carry either: an API
    // key's value, and the URL that opens a file.
    protocol: {
      ...source.protocol,
      assets: [
        {
          key: 'asset-key-1',
          assetId: 'mapbox',
          name: 'Mapbox key',
          type: 'apikey',
          url: '',
          size: 0,
          value: 'APIKEY_SECRET',
        },
        {
          key: 'asset-key-2',
          assetId: 'roster',
          name: 'Roster',
          type: 'network',
          url: 'https://files.example/ASSET_URL_SECRET.csv',
          size: 10,
          value: null,
        },
      ],
    },
    finishTime: new Date('2026-01-03T00:00:00.000Z'),
    finishStageId: 'finish-completed',
    finishOutcome: 'completed',
    localePreference: 'fr',
    locale: 'fr',
    network: {
      nodes: [
        {
          _uid: 'node-answer-1',
          type: 'person',
          attributes: { name: 'NODE_ANSWER' },
        },
        {
          _uid: 'node-answer-2',
          type: 'person',
          attributes: { name: 'SECOND_NODE_ANSWER' },
        },
      ],
      edges: [
        {
          _uid: 'edge-answer',
          type: 'friend',
          from: 'node-answer-1',
          to: 'node-answer-2',
          attributes: { closeness: 'EDGE_ANSWER' },
        },
      ],
      ego: { _uid: 'ego-1', attributes: { age: 'EGO_ANSWER' } },
    },
    stageMetadata: {
      'dyad-stage': [[0, 'node-answer-1', 'node-answer-2', true]],
    },
  };
}

function viewReady(
  source: Source,
  viewer: Parameters<typeof mapInterviewForViewer>[1],
) {
  const result = mapInterviewForViewer(source, viewer);
  if (!result.success) throw new Error('Expected a readable interview');
  return result;
}

const ANSWER_MARKERS = [
  'node-answer-1',
  'node-answer-2',
  'NODE_ANSWER',
  'edge-answer',
  'EDGE_ANSWER',
  'EGO_ANSWER',
  'dyad-stage',
  'stageMetadata',
  'APIKEY_SECRET',
  'ASSET_URL_SECRET',
];

describe('mapInterviewForViewer', () => {
  it.each([
    { researcher: false, freezeCompletedInterviews: true },
    { researcher: false, freezeCompletedInterviews: false },
    { researcher: true, freezeCompletedInterviews: true },
  ])(
    'sends a finished interview with no answers when researcher=$researcher and freezing=$freezeCompletedInterviews',
    (viewer) => {
      const result = viewReady(makeFinishedSource(), viewer);

      // Serialised as the page hands it to the browser.
      const sent = JSON.stringify(SuperJSON.serialize(result));
      for (const marker of ANSWER_MARKERS) {
        expect(sent).not.toContain(marker);
      }
      // The empty network a new interview starts with, under an ego id of its
      // own.
      expect(result.payload.session.network).toStrictEqual({
        ...createInitialNetwork(),
        ego: { _uid: expect.any(String), attributes: {} },
      });
      expect(result.payload.session.network.ego._uid).not.toBe('ego-1');
      expect(result.payload.session).not.toHaveProperty('stageMetadata');
      expect(result.view).toBe('completed');
      expect(result.payload.protocol.assets).toEqual([]);
      expect(result.assetUrls).toEqual({});
      // What the completed view needs is still there.
      expect(result.payload.session).toMatchObject({
        finishTime: '2026-01-03T00:00:00.000Z',
        finishStageId: 'finish-completed',
        localePreference: 'fr',
        locale: 'fr',
      });
    },
  );

  it('sends a researcher the whole finished interview to change while freezing is off', () => {
    const source = makeFinishedSource();
    const result = viewReady(source, {
      researcher: true,
      freezeCompletedInterviews: false,
    });

    expect(result.view).toBe('editable-finished');
    expect(result.payload.session.network).toStrictEqual(source.network);
    // The interview runs, so its resources are there.
    expect(result.payload.protocol.assets).toHaveLength(2);
    expect(result.assetUrls).toEqual({
      roster: 'https://files.example/ASSET_URL_SECRET.csv',
    });
    expect(result.payload.session.stageMetadata).toStrictEqual(
      source.stageMetadata,
    );
  });

  it.each([
    { researcher: false, freezeCompletedInterviews: true },
    { researcher: false, freezeCompletedInterviews: false },
    { researcher: true, freezeCompletedInterviews: true },
    { researcher: true, freezeCompletedInterviews: false },
  ])(
    'sends an unfinished interview whole when researcher=$researcher and freezing=$freezeCompletedInterviews',
    (viewer) => {
      const source = { ...makeFinishedSource(), finishTime: null };
      const result = viewReady(source, viewer);

      expect(result.view).toBe('active');
      expect(result.payload.session.network).toStrictEqual(source.network);
      expect(result.payload.session.stageMetadata).toStrictEqual(
        source.stageMetadata,
      );
    },
  );

  it.each([
    { researcher: false, freezeCompletedInterviews: true },
    { researcher: true, freezeCompletedInterviews: false },
  ])(
    'opens no view of a finished interview whose answers cannot be read when researcher=$researcher and freezing=$freezeCompletedInterviews',
    (viewer) => {
      const result = mapInterviewForViewer(
        { ...makeFinishedSource(), network: { nodes: 'unreadable' } },
        viewer,
      );

      expect(result).toMatchObject({ success: false, unreadable: 'session' });
      expect(result).not.toHaveProperty('payload');
    },
  );
});
