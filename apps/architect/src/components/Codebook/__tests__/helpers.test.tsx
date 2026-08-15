import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getMockState } from '~/__tests__/helpers';
import type { RootState } from '~/ducks/modules/root';

import { getAllVariablesByUUID } from '../../../selectors/codebook';
import { getEntityProperties, getUsage, getUsageAsStageMeta } from '../helpers';

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

const index = {
  'stages.0.foo.bar': 'fizz',
  'stages.0.foo.bar.bazz': 'fizz',
  'stages.1.foo.bar.bazz': 'fizz',
  'stages.1.foo.bar': 'pop',
  'stages.2.foo.bar': 'pop',
};

it('getUsage() ', () => {
  const value = 'fizz';
  const expectedResult = [
    'stages.0.foo.bar',
    'stages.0.foo.bar.bazz',
    'stages.1.foo.bar.bazz',
  ];
  expect(getUsage(index, value)).toEqual(expectedResult);
});

it('getUsageAsStageMeta() produces stage links for stage-scoped paths', () => {
  const usage = [
    'stages.0.foo.bar',
    'stages.0.foo.bar.bazz',
    'stages.1.foo.bar.bazz',
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

it('getUsageAsStageMeta() parses type-index paths (e.g. a composer edge type)', () => {
  // Node/edge type usage comes from collectEntityTypeReferences, which keys
  // with the same dotted-array notation as the variable index.
  const usage = ['stages.1.edges.0.subject.type', 'stages.2.subject.type'];

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
        `codebook.node.person.variables.2.validation.${validationKey}`,
      ];

      expect(getUsageAsStageMeta([], mockVariableMetaByIndex, usage)).toEqual([
        { label: 'Used as validation for "name"' },
      ]);
    },
  );
});

// A key shape this parser does not know about must still produce an entry.
// It is fed by `getVariableIndex`, whose values simultaneously drive
// `getIsUsed` — so a dropped key is a row that says "In use — cannot be
// deleted" beside a blank "Used In" cell, which is the report in #1392.
describe('getUsageAsStageMeta() is total', () => {
  it.each([
    // The exact shape the pre-#1392 sort-key entries arrived in: bracketed
    // indices from `collectPaths`, whose first dot-segment is `stages[0]`.
    [
      'a bracketed collectPaths key',
      'stages[0].prompts[0].binSortOrder[0].property',
    ],
    ['a key rooted somewhere new', 'assets.roster.columns.0'],
    ['a stage index with no meta', 'stages.99.prompts.0.variable'],
  ])('returns an entry for %s', (_label, key) => {
    const result = getUsageAsStageMeta(
      [{ label: 'foo', id: 'abcd' }],
      getAllVariablesByUUID(state.protocol.present.codebook),
      [key],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBeTruthy();
  });

  it('does not add the fallback when the keys were understood', () => {
    expect(
      getUsageAsStageMeta(
        [{ label: 'foo', id: 'abcd' }],
        getAllVariablesByUUID(state.protocol.present.codebook),
        ['stages.0.prompts.0.variable'],
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
