import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Filter,
  type SkipLogic,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import {
  buildStageAvailabilityMap,
  getLastAvailableAuthoredStageIndex,
  resolveRecoveryStep,
} from '../skip-logic';

const network: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego',
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
};

const alwaysSkipped = (destination?: SkipLogic['destination']): SkipLogic => ({
  action: 'SKIP',
  filter: { join: 'AND', rules: [] },
  ...(destination ? { destination } : {}),
});

const stage = (id: string, skipLogic?: SkipLogic) => ({
  id,
  ...(skipLogic ? { skipLogic } : {}),
});

const finishStage = () => ({ id: 'finish', type: 'FinishSession' });

describe('buildStageAvailabilityMap', () => {
  it('does not activate a destination while its owning stage remains visible', () => {
    const destination = { type: 'stage' as const, stageId: 's3' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', {
          action: 'SHOW',
          filter: { join: 'AND', rules: [] },
          destination,
        }),
        stage('s2'),
        stage('s3'),
        finishStage(),
      ],
      network,
    );

    expect(availability).toEqual({
      0: { kind: 'available' },
      1: { kind: 'available' },
      2: { kind: 'available' },
      3: { kind: 'available' },
      4: { kind: 'available' },
    });
  });

  it('preserves legacy one-screen skip behavior without a destination', () => {
    const availability = buildStageAvailabilityMap(
      [stage('s0'), stage('s1', alwaysSkipped()), stage('s2'), finishStage()],
      network,
    );

    expect(availability).toEqual({
      0: { kind: 'available' },
      1: { kind: 'local-skip' },
      2: { kind: 'available' },
      3: { kind: 'available' },
    });
  });

  it('marks the screens before a stage destination as bypassed', () => {
    const destination = { type: 'stage' as const, stageId: 's4' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', alwaysSkipped(destination)),
        stage('s2'),
        stage('s3'),
        stage('s4'),
        finishStage(),
      ],
      network,
    );

    expect(availability[1]).toEqual({
      kind: 'local-skip',
      destination,
    });
    expect(availability[2]).toEqual({
      kind: 'bypassed',
      by: { stageId: 's1', stageIndex: 1, destination },
    });
    expect(availability[3]).toEqual(availability[2]);
    expect(availability[4]).toEqual({ kind: 'available' });
  });

  it('maps a finish destination to the finish stage', () => {
    const destination = { type: 'finish' as const };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(destination)),
        stage('s1'),
        stage('s2'),
        finishStage(),
      ],
      network,
    );

    expect(availability[0]).toEqual({
      kind: 'local-skip',
      destination,
    });
    expect(availability[1]?.kind).toBe('bypassed');
    expect(availability[2]?.kind).toBe('bypassed');
    expect(availability[3]).toEqual({ kind: 'available' });
  });

  it('does not activate skip rules on screens bypassed by an earlier jump', () => {
    const firstDestination = { type: 'stage' as const, stageId: 's3' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(firstDestination)),
        stage('s1', alwaysSkipped({ type: 'finish' })),
        stage('s2'),
        stage('s3'),
        finishStage(),
      ],
      network,
    );

    expect(availability[1]).toEqual({
      kind: 'bypassed',
      by: {
        stageId: 's0',
        stageIndex: 0,
        destination: firstDestination,
      },
    });
    expect(availability[3]).toEqual({ kind: 'available' });
  });

  it('evaluates a hidden destination and continues along its route', () => {
    const firstDestination = { type: 'stage' as const, stageId: 's2' };
    const chainedDestination = { type: 'stage' as const, stageId: 's4' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(firstDestination)),
        stage('s1'),
        stage('s2', alwaysSkipped(chainedDestination)),
        stage('s3'),
        stage('s4'),
        finishStage(),
      ],
      network,
    );

    expect(availability[1]?.kind).toBe('bypassed');
    expect(availability[2]).toEqual({
      kind: 'local-skip',
      destination: chainedDestination,
    });
    expect(availability[3]).toEqual({
      kind: 'bypassed',
      by: {
        stageId: 's2',
        stageIndex: 2,
        destination: chainedDestination,
      },
    });
    expect(availability[4]).toEqual({ kind: 'available' });
  });

  it('ignores invalid non-forward destinations defensively', () => {
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', alwaysSkipped({ type: 'stage', stageId: 'missing-stage' })),
        finishStage(),
      ],
      network,
    );

    expect(availability[1]?.kind).toBe('local-skip');
    expect(availability[2]).toEqual({ kind: 'available' });
  });

  describe('stages with nothing to ask about', () => {
    const node = (id: string, type = 'person', attributes = {}) => ({
      [entityPrimaryKeyProperty]: id,
      type,
      [entityAttributesProperty]: attributes,
    });
    const edge = (id: string, from: string, to: string, type = 'friend') => ({
      [entityPrimaryKeyProperty]: id,
      type,
      from,
      to,
      [entityAttributesProperty]: {},
    });
    const withEntities = (
      nodes: NcNetwork['nodes'],
      edges: NcNetwork['edges'] = [],
    ): NcNetwork => ({ ...network, nodes, edges });
    const nodeStage = (id: string, type: string) => ({
      id,
      type,
      subject: { entity: 'node', type: 'person' },
    });
    const edgeForm = (id: string) => ({
      id,
      type: 'AlterEdgeForm',
      subject: { entity: 'edge', type: 'friend' },
    });
    const kinds = (
      stages: Parameters<typeof buildStageAvailabilityMap>[0],
      on: NcNetwork,
    ) =>
      Object.values(buildStageAvailabilityMap(stages, on)).map(
        (availability) => availability.kind,
      );

    it('takes a form with no one to ask about off the route', () => {
      const stages = [
        stage('s0'),
        nodeStage('form', 'AlterForm'),
        edgeForm('edge-form'),
        finishStage(),
      ];

      expect(kinds(stages, network)).toEqual([
        'available',
        'empty',
        'empty',
        'available',
      ]);
      expect(
        kinds(
          stages,
          withEntities([node('a'), node('b')], [edge('e', 'a', 'b')]),
        ),
      ).toEqual(['available', 'available', 'available', 'available']);
    });

    it('takes a census off the route until there is a pair to ask about', () => {
      const stages = [
        nodeStage('dyads', 'DyadCensus'),
        nodeStage('strength', 'TieStrengthCensus'),
        finishStage(),
      ];

      expect(kinds(stages, withEntities([node('a')]))).toEqual([
        'empty',
        'empty',
        'available',
      ]);
      expect(kinds(stages, withEntities([node('a'), node('b')]))).toEqual([
        'available',
        'available',
        'available',
      ]);
    });

    it.each([
      ['CategoricalBin', 1],
      ['OrdinalBin', 1],
      ['Geospatial', 1],
      ['Sociogram', 1],
      ['Narrative', 1],
      ['OneToManyDyadCensus', 2],
    ] as const)(
      'takes a %s off the route until it shows %i people',
      (type, needed) => {
        const stages = [nodeStage('stage', type), finishStage()];
        const people = [node('a'), node('b')].slice(0, needed);

        expect(kinds(stages, withEntities(people.slice(1)))).toEqual([
          'empty',
          'available',
        ]);
        expect(kinds(stages, withEntities(people))).toEqual([
          'available',
          'available',
        ]);
      },
    );

    it('keeps a Narrative the participant can draw on when it shows no one', () => {
      expect(
        kinds(
          [
            {
              ...nodeStage('story', 'Narrative'),
              behaviours: { freeDraw: true },
            },
            finishStage(),
          ],
          network,
        ),
      ).toEqual(['available', 'available']);
    });

    it.each([
      'NameGenerator',
      'NameGeneratorQuickAdd',
      'NameGeneratorRoster',
      'NetworkComposer',
    ])('keeps a %s, which adds people, when there is no one yet', (type) => {
      expect(kinds([nodeStage('stage', type), finishStage()], network)).toEqual(
        ['available', 'available'],
      );
    });

    it('counts only the subjects the stage shows', () => {
      const stages = [
        {
          ...nodeStage('form', 'AlterForm'),
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'close',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: asEntityAttributeReference('close'),
                  operator: 'EXACTLY',
                  value: true,
                },
              },
            ],
          } satisfies Filter,
        },
        finishStage(),
      ];

      expect(
        kinds(
          stages,
          withEntities([
            node('a', 'person', { close: false }),
            node('p', 'pet'),
          ]),
        ),
      ).toEqual(['empty', 'available']);
      expect(
        kinds(stages, withEntities([node('a', 'person', { close: true })])),
      ).toEqual(['available', 'available']);
    });

    it('leaves a stage its own skip logic hides as a local skip', () => {
      expect(
        kinds(
          [{ ...nodeStage('form', 'AlterForm'), skipLogic: alwaysSkipped() }],
          network,
        ),
      ).toEqual(['local-skip']);
    });
  });
});

describe('getLastAvailableAuthoredStageIndex', () => {
  it('returns the final authored stage on a route without skips', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [stage('s0'), stage('s1'), stage('s2'), finishStage()],
        network,
      ),
    ).toBe(2);
  });

  it('returns the last active stage before a targeted jump to finish', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [
          stage('s0'),
          stage('s1', alwaysSkipped({ type: 'finish' })),
          stage('s2'),
          stage('s3'),
          finishStage(),
        ],
        network,
      ),
    ).toBe(0);
  });

  it('returns undefined when the active route has no authored stage', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [
          stage('s0', alwaysSkipped({ type: 'finish' })),
          stage('s1'),
          stage('s2'),
          finishStage(),
        ],
        network,
      ),
    ).toBeUndefined();
  });
});

describe('resolveRecoveryStep', () => {
  it('advances when the entry screen is unavailable and there is no earlier available screen', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 0,
        currentAvailability: { kind: 'local-skip' },
        previousValidStageIndex: 0,
        nextValidStageIndex: 1,
      }),
    ).toBe(1);
  });

  it('returns to the earlier available screen when one exists', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 3,
        currentAvailability: { kind: 'local-skip' },
        previousValidStageIndex: 1,
        nextValidStageIndex: 4,
      }),
    ).toBe(1);
  });

  it('follows a local skip destination forward when an earlier stage exists', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 1,
        currentAvailability: {
          kind: 'local-skip',
          destination: { type: 'finish' },
        },
        previousValidStageIndex: 0,
        nextValidStageIndex: 4,
      }),
    ).toBe(4);
  });

  it('follows the active route forward from a bypassed stage', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 2,
        currentAvailability: {
          kind: 'bypassed',
          by: {
            stageId: 's1',
            stageIndex: 1,
            destination: { type: 'stage', stageId: 's4' },
          },
        },
        previousValidStageIndex: 0,
        nextValidStageIndex: 4,
      }),
    ).toBe(4);
  });
  it('moves forward from a stage with nothing to ask about', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 2,
        currentAvailability: { kind: 'empty' },
        previousValidStageIndex: 0,
        nextValidStageIndex: 3,
      }),
    ).toBe(3);
  });
});
