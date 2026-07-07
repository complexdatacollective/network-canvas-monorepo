import { describe, expect, it } from 'vitest';

import {
  EdgeVariablesSchema,
  EgoVariablesSchema,
  VariableSchema,
  VariablesSchema,
} from '../variables/variable';

/**
 * Schema-conformance tests for the variable SHAPE refinements surfaced by the
 * schema-8 audit (#667, #668, #671, #677):
 * - ego variables cannot declare validation.unique
 * - ordinal variables cannot declare minSelected/maxSelected (single-select)
 * - categorical/ordinal option values cannot be boolean
 * - categorical/ordinal options require at least 2 entries
 * - `encrypted` is only valid on the node text variable, not on other types
 *   nor on ego/edge variables
 */

describe('variable schema conformance', () => {
  describe('#667 ego variable unique validation', () => {
    it('rejects an ego variable declaring validation.unique', () => {
      const result = EgoVariablesSchema.safeParse({
        egoId: {
          name: 'ego_id',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts an ego variable without unique', () => {
      const result = EgoVariablesSchema.safeParse({
        egoId: {
          name: 'ego_id',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        },
      });
      expect(result.success).toBe(true);
    });

    it('still allows unique on a node variable', () => {
      const result = VariableSchema.safeParse({
        name: 'node_id',
        type: 'text',
        component: 'Text',
        validation: { unique: true },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('#667 ordinal minSelected/maxSelected', () => {
    it('rejects an ordinal variable declaring minSelected', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'a', value: 1 },
          { label: 'b', value: 2 },
        ],
        validation: { minSelected: 1 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects an ordinal variable declaring maxSelected', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'a', value: 1 },
          { label: 'b', value: 2 },
        ],
        validation: { maxSelected: 3 },
      });
      expect(result.success).toBe(false);
    });

    it('still allows minSelected/maxSelected on a categorical variable', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'a', value: 1 },
          { label: 'b', value: 2 },
        ],
        validation: { minSelected: 1, maxSelected: 2 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts an ordinal variable with required-only validation', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'a', value: 1 },
          { label: 'b', value: 2 },
        ],
        validation: { required: true },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('#668 boolean-valued options', () => {
    it('rejects a categorical option with a boolean value', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'True opt', value: true },
          { label: 'Strong', value: 'strong' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an ordinal option with a boolean value', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'True opt', value: true },
          { label: 'Strong', value: 'strong' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('accepts string- and number-valued options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'one', value: 1 },
          { label: 'two', value: 'two' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('#671 minimum option count', () => {
    it('rejects a categorical variable with one option', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [{ label: 'only', value: 'only' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a categorical variable with zero options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an ordinal variable with one option', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [{ label: 'only', value: 'only' }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts a categorical variable with two options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'a', value: 'a' },
          { label: 'b', value: 'b' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts an ordinal variable with two options', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'a', value: 'a' },
          { label: 'b', value: 'b' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('#677 encrypted only on node text variable', () => {
    it('accepts encrypted on a node text variable', () => {
      const result = VariablesSchema.safeParse({
        secret: {
          name: 'secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects encrypted on a node number variable', () => {
      const result = VariablesSchema.safeParse({
        count: {
          name: 'count',
          type: 'number',
          component: 'Number',
          encrypted: true,
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects encrypted on a node datetime variable', () => {
      const result = VariablesSchema.safeParse({
        when: {
          name: 'when',
          type: 'datetime',
          component: 'DatePicker',
          encrypted: true,
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects encrypted on an ego text variable', () => {
      const result = EgoVariablesSchema.safeParse({
        egoSecret: {
          name: 'ego_secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects encrypted on an edge text variable', () => {
      const result = EdgeVariablesSchema.safeParse({
        edgeSecret: {
          name: 'edge_secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts an edge text variable without encrypted', () => {
      const result = EdgeVariablesSchema.safeParse({
        edgeNote: {
          name: 'edge_note',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a node text variable without encrypted', () => {
      const result = VariableSchema.safeParse({
        name: 'note',
        type: 'text',
        component: 'Text',
      });
      expect(result.success).toBe(true);
    });

    it('accepts an ego text variable without encrypted', () => {
      const result = EgoVariablesSchema.safeParse({
        egoNote: {
          name: 'ego_note',
          type: 'text',
          component: 'Text',
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
