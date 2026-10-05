import { describe, expect, it } from 'vitest';

import {
  EdgeVariablesSchema,
  EgoVariablesSchema,
  VariableSchema,
  VariablesSchema,
} from '../variables/variable.ts';

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

  describe('scalar value bounds', () => {
    const scalarVariables = (validation: Record<string, unknown>) => ({
      closeness: {
        name: 'closeness',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation,
      },
    });

    it('rejects a minValue', () => {
      expect(
        VariablesSchema.safeParse(scalarVariables({ minValue: 10 })).success,
      ).toBe(false);
    });

    it('rejects a maxValue', () => {
      expect(
        VariablesSchema.safeParse(scalarVariables({ maxValue: 10 })).success,
      ).toBe(false);
    });

    it('rejects a complete pair', () => {
      expect(
        VariablesSchema.safeParse(
          scalarVariables({ minValue: 2, maxValue: 10 }),
        ).success,
      ).toBe(false);
    });

    it('accepts requiredness and comparisons against another scalar', () => {
      const result = VariablesSchema.safeParse({
        closeness: {
          name: 'closeness',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { required: true, greaterThanVariable: 'trust' },
        },
        trust: {
          name: 'trust',
          type: 'scalar',
          component: 'VisualAnalogScale',
        },
      });
      expect(result.success).toBe(true);
    });

    it('leaves number variable bounds untouched', () => {
      const result = VariablesSchema.safeParse({
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 18 },
        },
      });
      expect(result.success).toBe(true);
    });

    it('applies to edge and ego variables too', () => {
      expect(
        EdgeVariablesSchema.safeParse(scalarVariables({ minValue: 10 }))
          .success,
      ).toBe(false);
      expect(
        EgoVariablesSchema.safeParse(scalarVariables({ minValue: 10 })).success,
      ).toBe(false);
    });
  });
  // Thirteenth-wave Finding 2: fresco-ui's BooleanField applies its Yes/No
  // default only when the `options` prop is `undefined` (a destructuring
  // default), so an explicitly empty array renders a control with no buttons
  // at all — unanswerable, and fatal on a required variable.
  describe('boolean options', () => {
    const booleanVariable = (options?: unknown) => ({
      isClose: {
        name: 'is_close',
        type: 'boolean',
        component: 'Boolean',
        validation: { required: true },
        ...(options !== undefined ? { options } : {}),
      },
    });

    it('rejects an explicitly empty options array', () => {
      const result = VariablesSchema.safeParse(booleanVariable([]));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        result.error.issues.some((issue) => issue.path.includes('options')),
      ).toBe(true);
    });

    it('accepts a boolean variable with no options at all', () => {
      expect(VariablesSchema.safeParse(booleanVariable()).success).toBe(true);
    });

    it('accepts a single-option (singleton-domain) boolean', () => {
      expect(
        VariablesSchema.safeParse(
          booleanVariable([{ label: 'Yes', value: true }]),
        ).success,
      ).toBe(true);
    });

    it('accepts a two-option boolean', () => {
      expect(
        VariablesSchema.safeParse(
          booleanVariable([
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ]),
        ).success,
      ).toBe(true);
    });

    it('applies to edge and ego variables too', () => {
      expect(EdgeVariablesSchema.safeParse(booleanVariable([])).success).toBe(
        false,
      );
      expect(EgoVariablesSchema.safeParse(booleanVariable([])).success).toBe(
        false,
      );
    });

    // Twenty-eighth-wave Finding 1: the empty-array rejection above only
    // fires when the variable's OWN declared `component` is `Boolean` — its
    // own rendering needs the options it can never fill. A componentless
    // boolean is renderable by a NetworkComposer field with EITHER `Boolean`
    // or `Toggle` (the field's own component, not the codebook default,
    // decides the rendering), so the shape rule — with no stage in scope —
    // can no longer assume `options: []` is unanswerable there.
    const componentlessBooleanVariable = (options?: unknown) => ({
      isClose: {
        name: 'is_close',
        type: 'boolean',
        ...(options !== undefined ? { options } : {}),
      },
    });

    it('accepts a componentless boolean variable with an explicitly empty options array', () => {
      const result = VariablesSchema.safeParse(
        componentlessBooleanVariable([]),
      );
      expect(
        result.success,
        JSON.stringify(!result.success && result.error.issues),
      ).toBe(true);
    });

    it('accepts a componentless empty-options boolean on edge and ego variables too', () => {
      expect(
        EdgeVariablesSchema.safeParse(componentlessBooleanVariable([])).success,
      ).toBe(true);
      expect(
        EgoVariablesSchema.safeParse(componentlessBooleanVariable([])).success,
      ).toBe(true);
    });
  });
});
