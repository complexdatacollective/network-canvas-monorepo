import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { buildRosterSortConfig } from './buildRosterSortConfig';

const nameVariableId = 'var-name';
const ageVariableId = 'var-age';
const lastNameVariableId = 'var-last';
const firstNameVariableId = 'var-first';
const levelVariableId = 'var-level';

const nodeVariables: Record<string, Variable> = {
  [nameVariableId]: { name: 'name', type: 'text' },
  [ageVariableId]: { name: 'age', type: 'number' },
  [lastNameVariableId]: { name: 'lastName', type: 'text' },
  [firstNameVariableId]: { name: 'firstName', type: 'text' },
  [levelVariableId]: {
    name: 'level',
    type: 'ordinal',
    options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ],
  },
};

const path = (uuid: string) => ['data', entityAttributesProperty, uuid];

describe('buildRosterSortConfig', () => {
  it('returns undefined config when sortOptions is undefined', () => {
    const result = buildRosterSortConfig(undefined, nodeVariables);
    expect(result.initialSortRules).toBeUndefined();
    expect(result.sortableProperties).toBeUndefined();
  });

  it('returns initialSortRules undefined (data-file order) when sortOrder is absent', () => {
    const result = buildRosterSortConfig(
      { sortableProperties: [{ label: 'Age', variable: 'age' }] },
      nodeVariables,
    );
    // No initial sort => data-file order preserved (NOT defaulted to name).
    expect(result.initialSortRules).toBeUndefined();
    // sortableProperties computed independently of sortOrder.
    expect(result.sortableProperties).toEqual([
      { property: path(ageVariableId), label: 'Age', type: 'number' },
    ]);
  });

  it('returns initialSortRules undefined when sortOrder is empty', () => {
    const result = buildRosterSortConfig({ sortOrder: [] }, nodeVariables);
    expect(result.initialSortRules).toBeUndefined();
  });

  it("passes a '*' sort property as a scalar property for insertion-order sorting", () => {
    const result = buildRosterSortConfig(
      { sortOrder: [{ property: '*', direction: 'desc' }] },
      nodeVariables,
    );
    expect(result.initialSortRules).toEqual([
      { property: '*', direction: 'desc', type: 'number' },
    ]);
  });

  it('maps the full multi-key sortOrder array, not just the first rule', () => {
    const result = buildRosterSortConfig(
      {
        sortOrder: [
          { property: 'lastName', direction: 'asc' },
          { property: 'firstName', direction: 'asc' },
        ],
      },
      nodeVariables,
    );
    expect(result.initialSortRules).toEqual([
      { property: path(lastNameVariableId), direction: 'asc', type: 'string' },
      { property: path(firstNameVariableId), direction: 'asc', type: 'string' },
    ]);
  });

  it('preserves ranked ordinal sorting with hierarchy instead of degrading to string', () => {
    const result = buildRosterSortConfig(
      { sortOrder: [{ property: 'level', direction: 'asc' }] },
      nodeVariables,
    );
    expect(result.initialSortRules).toEqual([
      {
        property: path(levelVariableId),
        direction: 'asc',
        type: 'hierarchy',
        hierarchy: ['low', 'medium', 'high'],
      },
    ]);
  });

  it('carries hierarchy through ordinal sortableProperties', () => {
    const result = buildRosterSortConfig(
      { sortableProperties: [{ label: 'Level', variable: 'level' }] },
      nodeVariables,
    );
    expect(result.sortableProperties).toEqual([
      {
        property: path(levelVariableId),
        label: 'Level',
        type: 'hierarchy',
        hierarchy: ['low', 'medium', 'high'],
      },
    ]);
  });
});
