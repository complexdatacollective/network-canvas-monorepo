import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getMockState } from '~/__tests__/helpers';
import type { RootState } from '~/ducks/modules/root';

import { getAllVariablesByUUID } from '../../../selectors/codebook';
import { getEntityProperties, getUsageAsStageMeta } from '../helpers';

/** A reference hit, as the protocol-validation collectors emit them. */
const at = (...path: (string | number)[]) => ({ path });

// Every validation rule that holds a reference to another variable. A variable
// referenced via any of these should be reported as "used as validation for X".
const variableReferenceValidations = [
  'sameAs',
  'differentFrom',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const;

const state = {
  protocol: {
    present: {
      codebook: {
        ego: {
          variables: {
            1: {
              name: 'name',
              type: 'text' as const,
            },
          },
        },
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1' as const,
            shape: { default: 'circle' as const },
            variables: {
              2: {
                name: 'name',
                type: 'text' as const,
              },
            },
          },
        },
        edge: {
          friend: {
            name: 'Friend',
            color: 'edge-color-seq-1' as const,
            variables: {
              3: {
                name: 'name',
                type: 'text' as const,
              },
            },
          },
        },
      },
      stages: [
        { label: 'foo', id: 'abcd', other: 'ignored' },
        { label: 'bar', id: 'efgh', other: 'ignored' },
        { label: 'bazz', id: 'ijkl', other: 'ignored' },
      ],
    },
  },
};

it('getUsageAsStageMeta() produces stage links for stage-scoped paths', () => {
  const usage = [
    at('stages', 0, 'foo', 'bar'),
    at('stages', 0, 'foo', 'bar', 'bazz'),
    at('stages', 1, 'foo', 'bar', 'bazz'),
  ];

  const mockStageMetaByIndex = [
    { label: 'foo', id: 'abcd' },
    { label: 'bar', id: 'efgh' },
    { label: 'bazz', id: 'ijkl' },
  ];

  const mockVariableMetaByIndex = getAllVariablesByUUID(
    state.protocol.present.codebook,
  );

  const expectedResult = [
    { label: 'foo', id: 'abcd' },
    { label: 'bar', id: 'efgh' },
  ];
  expect(
    getUsageAsStageMeta(mockStageMetaByIndex, mockVariableMetaByIndex, usage),
  ).toEqual(expectedResult);
});

it('getUsageAsStageMeta() describes type-reference hits (e.g. a composer edge type)', () => {
  // Node/edge type usage comes from collectEntityTypeReferences, whose hits
  // carry a path array of exactly the same shape as the attribute collector's.
  const usage = [
    at('stages', 1, 'edges', 0, 'subject', 'type'),
    at('stages', 2, 'subject', 'type'),
  ];

  const mockStageMetaByIndex = [
    { label: 'foo', id: 'abcd' },
    { label: 'bar', id: 'efgh' },
    { label: 'bazz', id: 'ijkl' },
  ];

  const mockVariableMetaByIndex = getAllVariablesByUUID(
    state.protocol.present.codebook,
  );

  expect(
    getUsageAsStageMeta(mockStageMetaByIndex, mockVariableMetaByIndex, usage),
  ).toEqual([
    { label: 'bar', id: 'efgh' },
    { label: 'bazz', id: 'ijkl' },
  ]);
});

describe('getUsageAsStageMeta() with codebook validation references', () => {
  it.each(variableReferenceValidations)(
    'labels a variable referenced via validation.%s',
    (validationKey) => {
      const mockVariableMetaByIndex = getAllVariablesByUUID(
        state.protocol.present.codebook,
      );
      const usage = [
        at(
          'codebook',
          'node',
          'person',
          'variables',
          '2',
          'validation',
          validationKey,
        ),
      ];

      expect(getUsageAsStageMeta([], mockVariableMetaByIndex, usage)).toEqual([
        { label: 'Used as validation for "name"' },
      ]);
    },
  );

  it('labels an ego variable referenced via validation, which has no type segment', () => {
    const mockVariableMetaByIndex = getAllVariablesByUUID(
      state.protocol.present.codebook,
    );

    expect(
      getUsageAsStageMeta([], mockVariableMetaByIndex, [
        at('codebook', 'ego', 'variables', '1', 'validation', 'sameAs'),
      ]),
    ).toEqual([{ label: 'Used as validation for "name"' }]);
  });
});

// A hit sitting somewhere this function has no wording for must still produce
// an entry. The same reference walk simultaneously drives `getIsUsed` — so a
// dropped hit is a row that says "In use — cannot be deleted" beside a blank
// "Used In" cell, which is the report in #1392.
describe('getUsageAsStageMeta() is total', () => {
  it.each([
    ['a hit rooted somewhere new', at('assetManifest', 'roster', 'columns', 0)],
    [
      'a codebook hit at an undescribed location',
      at('codebook', 'node', 'person', 'icon'),
    ],
    ['a stage index with no meta', at('stages', 99, 'prompts', 0, 'variable')],
  ])('returns an entry for %s', (_label, hit) => {
    const result = getUsageAsStageMeta(
      [{ label: 'foo', id: 'abcd' }],
      getAllVariablesByUUID(state.protocol.present.codebook),
      [hit],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBeTruthy();
  });

  it('does not add the fallback when the hits were described', () => {
    expect(
      getUsageAsStageMeta(
        [{ label: 'foo', id: 'abcd' }],
        getAllVariablesByUUID(state.protocol.present.codebook),
        [at('stages', 0, 'prompts', 0, 'variable')],
      ),
    ).toEqual([{ label: 'foo', id: 'abcd' }]);
  });
});

// The acceptance criterion "in-use status and Used In content cannot disagree",
// asserted end to end over real shipped content rather than a fixture written
// to suit it: `getEntityProperties` is what the Codebook table renders, and it
// derives `inUse` (which disables the delete button) and `usage` (the "Used In"
// cell) from the same index by two different routes.
//
// Not vacuous: on the pre-fix code the development protocol's person.last_name
// is in use via `binSortOrder`/`bucketSortOrder` alone, and this fails with an
// empty usage array for it.
describe('Codebook in-use status and Used In content agree', () => {
  const loadDevelopmentProtocolState = (): RootState => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const protocol: unknown = JSON.parse(
      readFileSync(
        join(
          thisDir,
          '../../../../../../packages/protocols/development/protocol.json',
        ),
        'utf-8',
      ),
    );
    return getMockState({
      activeProtocol: { present: protocol },
    }) as unknown as RootState;
  };

  it('gives every in-use variable in the development protocol somewhere to point at', () => {
    const testState = loadDevelopmentProtocolState();
    const protocol = testState.activeProtocol.present as unknown as {
      codebook: {
        node?: Record<string, unknown>;
        edge?: Record<string, unknown>;
        ego?: unknown;
      };
    };

    const subjects: { entity: 'node' | 'edge' | 'ego'; type?: string }[] = [
      ...Object.keys(protocol.codebook.node ?? {}).map((type) => ({
        entity: 'node' as const,
        type,
      })),
      ...Object.keys(protocol.codebook.edge ?? {}).map((type) => ({
        entity: 'edge' as const,
        type,
      })),
      ...(protocol.codebook.ego ? [{ entity: 'ego' as const }] : []),
    ];

    const disagreements: string[] = [];
    let inUseCount = 0;

    for (const subject of subjects) {
      const properties = getEntityProperties(testState, subject);
      if (!properties) continue;
      for (const [id, variable] of Object.entries(properties.variables)) {
        if (!variable.inUse) continue;
        inUseCount += 1;
        if (!variable.usage || variable.usage.length === 0) {
          disagreements.push(
            `${subject.entity}/${subject.type ?? 'ego'}/${id}`,
          );
        }
      }
    }

    // Guards the assertion against a protocol that happens to use nothing.
    expect(inUseCount).toBeGreaterThan(20);
    expect(disagreements).toEqual([]);
  });
});

// A codebook record key is constrained only by `/^[a-zA-Z0-9._:-]+$/`
// (`VariableNameSchema`, which keys the node/edge and variable records alike),
// so a dot inside one is legal protocol content. Joining a reference path into
// a dotted string and splitting it apart again cannot round-trip that: the
// display used to read the first fragment of the id and, finding no codebook
// entry for it, name the reference site "unknown". Reading the collector's own
// path array names it.
describe('Codebook usage labels survive a dot inside a codebook record key', () => {
  it('names the owning variable of a validation reference whose id contains a dot', () => {
    const testState = getMockState({
      activeProtocol: {
        present: {
          schemaVersion: 8,
          name: 'test',
          codebook: {
            node: {
              person: {
                name: 'Person',
                color: 'node-color-seq-1',
                shape: { default: 'circle' },
                variables: {
                  'owner.id': {
                    name: 'Owner',
                    type: 'number',
                    validation: { sameAs: 'target.id' },
                  },
                  'target.id': { name: 'Target', type: 'number' },
                },
              },
            },
          },
          stages: [],
        },
      },
    }) as unknown as RootState;

    const properties = getEntityProperties(testState, {
      entity: 'node',
      type: 'person',
    });

    expect(properties?.variables['target.id']?.inUse).toBe(true);
    expect(properties?.variables['target.id']?.usage).toEqual([
      { label: 'Used as validation for "Owner"' },
    ]);
  });

  it('names the node type of a shape-mapping reference whose type id contains a dot', () => {
    const testState = getMockState({
      activeProtocol: {
        present: {
          schemaVersion: 8,
          name: 'test',
          codebook: {
            node: {
              'person.v2': {
                name: 'Person',
                color: 'node-color-seq-1',
                shape: {
                  default: 'circle',
                  dynamic: {
                    variable: 'category',
                    type: 'discrete',
                    map: [{ value: 'a', shape: 'square' }],
                  },
                },
                variables: {
                  category: {
                    name: 'Category',
                    type: 'categorical',
                    options: [{ label: 'A', value: 'a' }],
                  },
                },
              },
            },
          },
          stages: [],
        },
      },
    }) as unknown as RootState;

    const properties = getEntityProperties(testState, {
      entity: 'node',
      type: 'person.v2',
    });

    expect(properties?.variables.category?.inUse).toBe(true);
    expect(properties?.variables.category?.usage).toEqual([
      { label: 'Used in shape settings for "Person"' },
    ]);
  });
});
