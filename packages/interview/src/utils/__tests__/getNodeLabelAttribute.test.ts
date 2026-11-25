import { describe, expect, it } from 'vitest';

import type { NodeDefinition } from '@codaco/protocol-validation';

import { testVariableId } from '../../__tests__/testIds';
import { getNodeLabelAttribute } from '../getNodeLabelAttribute';

const VAR_123 = testVariableId('var-123');
const VAR_456 = testVariableId('var-456');
const VAR_789 = testVariableId('var-789');
const VAR_AAA = testVariableId('var-aaa');
const VAR_BBB = testVariableId('var-bbb');

describe('getNodeLabelAttribute', () => {
  it('should return value from variable named "name" in codebook', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-6',
      shape: { default: 'circle' },
      variables: {
        [VAR_123]: { name: 'name', type: 'text' },
        [VAR_456]: { name: 'age', type: 'number' },
      },
    };

    const mockNodeAttributes = {
      [VAR_123]: 'John Doe',
      [VAR_456]: 30,
    };

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe(VAR_123);
  });

  it('should look for "name" in a case-insensitive way', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-5',
      shape: { default: 'circle' },
      variables: {
        [VAR_123]: { name: 'NAME', type: 'text' }, // Upper case
      },
    };

    const mockNodeAttributes = {
      [VAR_123]: 'Jane Doe',
    };

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe(VAR_123);
  });

  it('should return value from attribute named "name" if codebook lookup fails', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-4',
      shape: { default: 'circle' },
      variables: {
        [VAR_456]: { name: 'age', type: 'number' },
      },
    };

    const mockNodeAttributes = {
      name: 'John Smith', // Direct name attribute
      [VAR_456]: 30,
    };

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe('name');
  });

  it('should handle case-insensitive attribute names', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-3',
      shape: { default: 'circle' },
      variables: {
        [VAR_456]: { name: 'age', type: 'number' },
      },
    };

    const mockNodeAttributes = {
      NAME: 'John Smith', // Upper case name attribute
      [VAR_456]: 30,
    };

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe('NAME');
  });

  it('should return value from first text variable with a value if no name found', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'circle' },
      variables: {
        [VAR_123]: {
          name: 'firstName',
          type: 'text',
        },
        [VAR_456]: {
          name: 'lastName',
          type: 'text',
        },
        [VAR_789]: { name: 'age', type: 'number' },
      },
    };

    const mockNodeAttributes = {
      [VAR_123]: '', // Empty value
      [VAR_456]: 'Smith',
      [VAR_789]: 30,
    };

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe(VAR_456); // Should return the first text variable with a value
  });

  it('should prefer a variable whose NAME contains "name" over an earlier text variable', () => {
    // Step 2 of the labeling algorithm must test the variable's `name` property,
    // not the record key (a UUID in Architect protocols). Here `full_name`
    // should win over `description` even though `description` iterates first.
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'circle' },
      variables: {
        [VAR_AAA]: {
          name: 'description',
          type: 'text',
        },
        [VAR_BBB]: {
          name: 'full_name',
          type: 'text',
        },
      },
    };

    const mockNodeAttributes = {
      [VAR_AAA]: 'A person',
      [VAR_BBB]: 'Jane Doe',
    };

    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    expect(result).toBe(VAR_BBB);
  });

  it('should handle undefined codebook variables', () => {
    const mockCodebook: NodeDefinition['variables'] = undefined;
    const mockNodeAttributes = {
      name: 'John Smith',
    };

    // Execute
    const result = getNodeLabelAttribute(mockCodebook, mockNodeAttributes);

    // Verify
    expect(result).toBe('name');
  });

  it('should handle empty node attributes', () => {
    // Setup
    const mockCodebook: NodeDefinition = {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [VAR_123]: { name: 'name', type: 'text' },
      },
    };

    const mockNodeAttributes = {};

    // Execute
    const result = getNodeLabelAttribute(
      mockCodebook.variables,
      mockNodeAttributes,
    );

    // Verify
    expect(result).toBe(null);
  });
});
