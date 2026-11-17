import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  parseIssues,
  unionBranchIssues,
} from '../../../__tests__/schemaIssues.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import { asEntityAttributeReference } from '../entity-attribute-reference.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

describe('Shape Mapping Validation', () => {
  it('accepts a node definition with only a default shape', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = { default: 'circle' };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(result.success).toBe(true);
  });

  it('accepts all valid shape values as defaults', () => {
    for (const shape of ['circle', 'square', 'diamond'] as const) {
      const protocol = createBaseProtocol();
      protocol.codebook.node.person.shape = { default: shape };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid default shape', () => {
    const protocol = createBaseProtocol();
    // Intentionally using an invalid shape to test rejection
    protocol.codebook.node.person.shape = { default: 'hexagon' as 'circle' };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      { path: 'codebook.node.person.shape.default', code: 'invalid_union' },
    ]);
  });

  it('accepts a discrete shape mapping', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('category'),
        type: 'discrete',
        map: [
          { value: 'friend', shape: 'circle' },
          { value: 'family', shape: 'square' },
        ],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(result.success).toBe(true);
  });

  it('accepts a discrete shape mapping for a boolean variable', () => {
    const protocol = createBaseProtocol();
    const variables = protocol.codebook.node.person.variables as Record<
      string,
      unknown
    >;
    variables.is_person = {
      name: 'Is_Person',
      type: 'boolean',
    };
    protocol.codebook.node.person.shape = {
      default: 'square',
      dynamic: {
        variable: asEntityAttributeReference('is_person'),
        type: 'discrete',
        map: [{ value: true, shape: 'circle' }],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(result.success).toBe(true);
  });

  it('accepts a breakpoint shape mapping with 1 threshold', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [{ value: 30, shape: 'square' }],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(result.success).toBe(true);
  });

  it('accepts a breakpoint shape mapping with 2 thresholds', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [
          { value: 20, shape: 'square' },
          { value: 40, shape: 'diamond' },
        ],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(result.success).toBe(true);
  });

  it('rejects a breakpoint shape mapping with 0 thresholds', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      {
        path: 'codebook.node.person.shape.dynamic.thresholds',
        code: 'too_small',
      },
    ]);
  });

  it('rejects a breakpoint shape mapping with 3 thresholds', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [
          { value: 10, shape: 'circle' },
          { value: 20, shape: 'square' },
          { value: 30, shape: 'diamond' },
        ],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      { path: 'codebook.node.person.shape.dynamic', code: 'invalid_union' },
    ]);
    expect(unionBranchIssues(result)).toContainEqual([
      { path: 'thresholds', code: 'too_big' },
    ]);
  });

  it('rejects a node definition without shape field', () => {
    const protocol = createBaseProtocol();
    const personDef = protocol.codebook.node.person as Record<string, unknown>;
    delete personDef.shape;

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      { path: 'codebook.node.person.shape', code: 'invalid_type' },
    ]);
  });

  it('rejects discrete mapping with duplicate values', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('category'),
        type: 'discrete',
        map: [
          { value: 'friend', shape: 'circle' },
          { value: 'friend', shape: 'square' },
        ],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      {
        path: 'codebook.node.person.shape.dynamic.map',
        code: 'custom',
        message: 'Discrete shape mapping values must be unique',
      },
    ]);
  });

  it('rejects breakpoint thresholds not in ascending order', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [
          { value: 40, shape: 'square' },
          { value: 20, shape: 'diamond' },
        ],
      },
    };

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(parseIssues(result)).toEqual([
      {
        path: 'codebook.node.person.shape.dynamic.thresholds',
        code: 'custom',
        message:
          'Breakpoint thresholds must be sorted ascending with no duplicates',
      },
    ]);
  });
});
