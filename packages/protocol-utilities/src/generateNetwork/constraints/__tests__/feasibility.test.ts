import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { resolveGenerationConfig } from '../../config';
import {
  analyseFeasibility,
  SyntheticDataConstraintError,
} from '../feasibility';

const config = resolveGenerationConfig({ today: '2026-07-27' });

const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { maxNodes: 8 },
} as unknown as Stage;

function codebookWith(variables: Record<string, unknown>): StructuralCodebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables,
      },
    },
  } as unknown as StructuralCodebook;
}

describe('analyseFeasibility', () => {
  it('reports nothing for a satisfiable codebook', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { required: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports minLength above maxLength', () => {
    const codebook = codebookWith({
      name: {
        name: 'Name',
        type: 'text',
        validation: { minLength: 24, maxLength: 10 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Name']);
    expect(conflicts[0]?.rules.toSorted()).toEqual(['maxLength', 'minLength']);
  });

  it('reports minValue above maxValue', () => {
    const codebook = codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 50, maxValue: 20 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports minSelected above the option count', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { minSelected: 3 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports sameAs and differentFrom naming the same target', () => {
    const codebook = codebookWith({
      a: { name: 'A', type: 'text' },
      b: {
        name: 'B',
        type: 'text',
        validation: { sameAs: 'a', differentFrom: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules.toSorted()).toEqual(['differentFrom', 'sameAs']);
  });

  it('reports a strict comparator cycle', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { greaterThanVariable: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('cycle');
  });

  it('reports disjoint bounds across a comparator', () => {
    const codebook = codebookWith({
      low: { name: 'Low', type: 'number', validation: { maxValue: 5 } },
      high: {
        name: 'High',
        type: 'number',
        validation: { minValue: 10, lessThanVariable: 'low' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports unique against a value space smaller than the worst-case count', () => {
    const codebook = codebookWith({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
        ],
        validation: { unique: true },
      },
    });

    // maxNodes 8 against a 3-value space.
    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
  });

  it('accepts unique when the value space is large enough', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { unique: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('analyses ego and edge variables too', () => {
    const codebook = {
      ego: {
        variables: {
          a: {
            name: 'A',
            type: 'text',
            validation: { minLength: 10, maxLength: 2 },
          },
        },
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
  });
});

describe('SyntheticDataConstraintError', () => {
  it('names every conflicting variable in its message', () => {
    const error = new SyntheticDataConstraintError([
      {
        entity: 'node',
        entityType: 'person',
        variableIds: ['name'],
        variableNames: ['Name'],
        rules: ['minLength', 'maxLength'],
        reason: 'minLength 24 exceeds maxLength 10',
      },
    ]);

    expect(error.message).toContain('person');
    expect(error.message).toContain('Name');
    expect(error.message).toContain('minLength 24 exceeds maxLength 10');
    expect(error.conflicts).toHaveLength(1);
    expect(error.name).toBe('SyntheticDataConstraintError');
  });
});
