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

/**
 * A minimal interview row shaped exactly as `getInterviewById` returns it
 * (JSON columns already parsed by the Prisma result extension), parameterised
 * by the protocol's persisted schema version.
 */
function makeSource(schemaVersion: number): NonNullable<GetInterviewByIdQuery> {
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
    },
  };
}

describe('mapInterviewPayload', () => {
  it('stamps the payload with the protocol row’s own schema version', () => {
    const { payload, initialStep } = mapInterviewPayload(
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
    const { initialSyncRevision } = mapInterviewPayload(
      makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION),
    );

    expect(initialSyncRevision).toBe(7);
  });

  it('offers every declared locale, with its text direction', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapInterviewPayload({
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
    const { payload } = mapInterviewPayload({
      ...source,
      localePreference: 'fr',
      locale: 'en',
    });

    expect(payload.session.localePreference).toBe('fr');
    expect(payload.session.locale).toBe('en');
  });

  it('carries a finished interview’s finish stage into the session', () => {
    const source = makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    const { payload } = mapInterviewPayload({
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
    const { payload } = mapInterviewPayload({
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
    const { payload } = mapInterviewPayload({
      ...makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION),
      network: stored,
    });

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
  return {
    ...makeSource(COMPATIBLE_PROTOCOL_SCHEMA_VERSION),
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

const ANSWER_MARKERS = [
  'node-answer-1',
  'node-answer-2',
  'NODE_ANSWER',
  'edge-answer',
  'EDGE_ANSWER',
  'EGO_ANSWER',
  'dyad-stage',
  'stageMetadata',
];

describe('mapInterviewForViewer', () => {
  it.each([
    { researcher: false, freezeCompletedInterviews: true },
    { researcher: false, freezeCompletedInterviews: false },
    { researcher: true, freezeCompletedInterviews: true },
  ])(
    'sends a finished interview with no answers when researcher=$researcher and freezing=$freezeCompletedInterviews',
    (viewer) => {
      const result = mapInterviewForViewer(makeFinishedSource(), viewer);

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
    const result = mapInterviewForViewer(source, {
      researcher: true,
      freezeCompletedInterviews: false,
    });

    expect(result.view).toBe('editable-finished');
    expect(result.payload.session.network).toStrictEqual(source.network);
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
      const result = mapInterviewForViewer(source, viewer);

      expect(result.view).toBe('active');
      expect(result.payload.session.network).toStrictEqual(source.network);
      expect(result.payload.session.stageMetadata).toStrictEqual(
        source.stageMetadata,
      );
    },
  );
});
