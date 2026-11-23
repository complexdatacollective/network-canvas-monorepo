import { describe, expect, it } from 'vitest';

import {
  parseIssues,
  unionBranchIssues,
} from '../../../__tests__/schemaIssues.ts';
import {
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import { localized } from '../../../utils/test-utils.ts';
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

// A variables record written with readable keys, keyed by `testVariableId`.
const withVariableIds = <T>(variables: T): T =>
  withTestCodebookIds({ codebook: { ego: { variables } } }).codebook.ego
    .variables;

describe('variable schema conformance', () => {
  describe('#667 ego variable unique validation', () => {
    it('rejects an ego variable declaring validation.unique', () => {
      const result = EgoVariablesSchema.safeParse(
        withVariableIds({
          egoId: {
            name: 'ego_id',
            type: 'text',
            component: 'Text',
            validation: { unique: true },
          },
        }),
      );
      expect(parseIssues(result)).toEqual([
        {
          path: `${testVariableId('egoId')}.validation.unique`,
          code: 'custom',
          message: 'Ego attributes cannot use the "unique" validation',
        },
      ]);
    });

    it('accepts an ego variable without unique', () => {
      const result = EgoVariablesSchema.safeParse(
        withVariableIds({
          egoId: {
            name: 'ego_id',
            type: 'text',
            component: 'Text',
            validation: { required: true },
          },
        }),
      );
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
          { label: localized('a'), value: 1 },
          { label: localized('b'), value: 2 },
        ],
        validation: { minSelected: 1 },
      });
      expect(parseIssues(result)).toEqual([
        {
          path: 'validation',
          code: 'unrecognized_keys',
          keys: ['minSelected'],
        },
      ]);
    });

    it('rejects an ordinal variable declaring maxSelected', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: localized('a'), value: 1 },
          { label: localized('b'), value: 2 },
        ],
        validation: { maxSelected: 3 },
      });
      expect(parseIssues(result)).toEqual([
        {
          path: 'validation',
          code: 'unrecognized_keys',
          keys: ['maxSelected'],
        },
      ]);
    });

    it('still allows minSelected/maxSelected on a categorical variable', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: localized('a'), value: 1 },
          { label: localized('b'), value: 2 },
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
          { label: localized('a'), value: 1 },
          { label: localized('b'), value: 2 },
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
          { label: localized('True opt'), value: true },
          { label: localized('Strong'), value: 'strong' },
        ],
      });
      expect(unionBranchIssues(result)).toContainEqual([
        { path: 'options.0.value', code: 'invalid_union' },
      ]);
    });

    it('rejects an ordinal option with a boolean value', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: localized('True opt'), value: true },
          { label: localized('Strong'), value: 'strong' },
        ],
      });
      expect(unionBranchIssues(result)).toContainEqual([
        { path: 'options.0.value', code: 'invalid_union' },
      ]);
    });

    it('accepts string- and number-valued options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: localized('one'), value: 1 },
          { label: localized('two'), value: 'two' },
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
        options: [{ label: localized('only'), value: 'only' }],
      });
      expect(parseIssues(result)).toEqual([
        { path: 'options', code: 'too_small' },
      ]);
    });

    it('rejects a categorical variable with zero options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [],
      });
      expect(parseIssues(result)).toEqual([
        { path: 'options', code: 'too_small' },
      ]);
    });

    it('rejects an ordinal variable with one option', () => {
      const result = VariableSchema.safeParse({
        name: 'ord',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [{ label: localized('only'), value: 'only' }],
      });
      expect(parseIssues(result)).toEqual([
        { path: 'options', code: 'too_small' },
      ]);
    });

    it('accepts a categorical variable with two options', () => {
      const result = VariableSchema.safeParse({
        name: 'cat',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: localized('a'), value: 'a' },
          { label: localized('b'), value: 'b' },
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
          { label: localized('a'), value: 'a' },
          { label: localized('b'), value: 'b' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  // Two options with one value store the same answer. The 8 to 9 migration
  // removes the later ones by the same comparison.
  describe('duplicate option values', () => {
    const variableWithValues = (
      type: 'categorical' | 'ordinal',
      values: (string | number)[],
    ) => ({
      name: type,
      type,
      options: values.map((value, index) => ({
        label: localized(`Option ${index + 1}`),
        value,
      })),
    });

    it.each([
      ['categorical', ['a', 'b', 'a'], 'a'],
      ['ordinal', [0, 1, 0], '0'],
      // Answers are stored by value and exported as text, so these are one.
      ['categorical', [1, 2, '1'], '1'],
      ['ordinal', ['2', 1, 2], '2'],
    ] as const)(
      'rejects a %s variable with values %j, at the later option',
      (type, values, duplicate) => {
        const result = VariableSchema.safeParse(
          variableWithValues(type, [...values]),
        );

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain(
          `Options contain duplicate value \\"${duplicate}\\"`,
        );
        expect(JSON.stringify(result.error?.issues)).toContain(
          JSON.stringify(['options', 2, 'value']).slice(1, -1),
        );
      },
    );

    it('rejects them within a codebook, on the options of the attribute', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
          colour: variableWithValues('categorical', ['red', 'blue', 'red']),
        }),
      );

      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(
        'Options contain duplicate value',
      );
    });

    // Matching the schema's rule for names: the editor folds case as a
    // researcher types, but the schema decides whether a protocol opens.
    it('does not fold case', () => {
      const result = VariableSchema.safeParse(
        variableWithValues('categorical', ['yes', 'Yes', 'YES']),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('#677 encrypted only on node text variable', () => {
    it('accepts encrypted on a node text variable', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
          secret: {
            name: 'secret',
            type: 'text',
            component: 'Text',
            encrypted: true,
          },
        }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects encrypted on a node number variable', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
          count: {
            name: 'count',
            type: 'number',
            component: 'Number',
            encrypted: true,
          },
        }),
      );
      expect(parseIssues(result)).toEqual([
        {
          path: `${testVariableId('count')}.encrypted`,
          code: 'custom',
          message: 'Only text attributes can be encrypted',
        },
      ]);
    });

    it('rejects encrypted on a node datetime variable', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
          when: {
            name: 'when',
            type: 'datetime',
            component: 'DatePicker',
            encrypted: true,
          },
        }),
      );
      expect(parseIssues(result)).toEqual([
        {
          path: `${testVariableId('when')}.encrypted`,
          code: 'custom',
          message: 'Only text attributes can be encrypted',
        },
      ]);
    });

    it('rejects encrypted on an ego text variable', () => {
      const result = EgoVariablesSchema.safeParse(
        withVariableIds({
          egoSecret: {
            name: 'ego_secret',
            type: 'text',
            component: 'Text',
            encrypted: true,
          },
        }),
      );
      expect(parseIssues(result)).toEqual([
        {
          path: `${testVariableId('egoSecret')}.encrypted`,
          code: 'custom',
          message: 'Ego attributes cannot be encrypted',
        },
      ]);
    });

    it('rejects encrypted on an edge text variable', () => {
      const result = EdgeVariablesSchema.safeParse(
        withVariableIds({
          edgeSecret: {
            name: 'edge_secret',
            type: 'text',
            component: 'Text',
            encrypted: true,
          },
        }),
      );
      expect(parseIssues(result)).toEqual([
        {
          path: `${testVariableId('edgeSecret')}.encrypted`,
          code: 'custom',
          message: 'Edge attributes cannot be encrypted',
        },
      ]);
    });

    it('accepts an edge text variable without encrypted', () => {
      const result = EdgeVariablesSchema.safeParse(
        withVariableIds({
          edgeNote: {
            name: 'edge_note',
            type: 'text',
            component: 'Text',
            validation: { unique: true },
          },
        }),
      );
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
      const result = EgoVariablesSchema.safeParse(
        withVariableIds({
          egoNote: {
            name: 'ego_note',
            type: 'text',
            component: 'Text',
          },
        }),
      );
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
        parseIssues(
          VariablesSchema.safeParse(
            withVariableIds(scalarVariables({ minValue: 10 })),
          ),
        ),
      ).toEqual([
        {
          path: `${testVariableId('closeness')}.validation`,
          code: 'unrecognized_keys',
          keys: ['minValue'],
        },
      ]);
    });

    it('rejects a maxValue', () => {
      expect(
        parseIssues(
          VariablesSchema.safeParse(
            withVariableIds(scalarVariables({ maxValue: 10 })),
          ),
        ),
      ).toEqual([
        {
          path: `${testVariableId('closeness')}.validation`,
          code: 'unrecognized_keys',
          keys: ['maxValue'],
        },
      ]);
    });

    it('rejects a complete pair', () => {
      expect(
        parseIssues(
          VariablesSchema.safeParse(
            withVariableIds(scalarVariables({ minValue: 2, maxValue: 10 })),
          ),
        ),
      ).toEqual([
        {
          path: `${testVariableId('closeness')}.validation`,
          code: 'unrecognized_keys',
          keys: ['minValue', 'maxValue'],
        },
      ]);
    });

    it('accepts requiredness and comparisons against another scalar', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
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
        }),
      );
      expect(result.success).toBe(true);
    });

    it('leaves number variable bounds untouched', () => {
      const result = VariablesSchema.safeParse(
        withVariableIds({
          age: {
            name: 'age',
            type: 'number',
            component: 'Number',
            validation: { minValue: 18 },
          },
        }),
      );
      expect(result.success).toBe(true);
    });

    it('applies to edge and ego variables too', () => {
      expect(
        parseIssues(
          EdgeVariablesSchema.safeParse(
            withVariableIds(scalarVariables({ minValue: 10 })),
          ),
        ),
      ).toEqual([
        {
          path: `${testVariableId('closeness')}.validation`,
          code: 'unrecognized_keys',
          keys: ['minValue'],
        },
      ]);
      expect(
        parseIssues(
          EgoVariablesSchema.safeParse(
            withVariableIds(scalarVariables({ minValue: 10 })),
          ),
        ),
      ).toEqual([
        {
          path: `${testVariableId('closeness')}.validation`,
          code: 'unrecognized_keys',
          keys: ['minValue'],
        },
      ]);
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
      const result = VariablesSchema.safeParse(
        withVariableIds(booleanVariable([])),
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        result.error.issues.some((issue) => issue.path.includes('options')),
      ).toBe(true);
    });

    it('accepts a boolean variable with no options at all', () => {
      expect(
        VariablesSchema.safeParse(withVariableIds(booleanVariable())).success,
      ).toBe(true);
    });

    it('accepts a single-option (singleton-domain) boolean', () => {
      expect(
        VariablesSchema.safeParse(
          withVariableIds(
            booleanVariable([{ label: localized('Yes'), value: true }]),
          ),
        ).success,
      ).toBe(true);
    });

    it('accepts a two-option boolean', () => {
      expect(
        VariablesSchema.safeParse(
          withVariableIds(
            booleanVariable([
              { label: localized('Yes'), value: true },
              { label: localized('No'), value: false },
            ]),
          ),
        ).success,
      ).toBe(true);
    });

    it('applies to edge and ego variables too', () => {
      expect(
        parseIssues(
          EdgeVariablesSchema.safeParse(withVariableIds(booleanVariable([]))),
        ),
      ).toEqual([
        {
          path: `${testVariableId('isClose')}.options`,
          code: 'custom',
          message:
            'Boolean options must offer at least one choice when component is "Boolean"',
        },
      ]);
      expect(
        parseIssues(
          EgoVariablesSchema.safeParse(withVariableIds(booleanVariable([]))),
        ),
      ).toEqual([
        {
          path: `${testVariableId('isClose')}.options`,
          code: 'custom',
          message:
            'Boolean options must offer at least one choice when component is "Boolean"',
        },
      ]);
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
        withVariableIds(componentlessBooleanVariable([])),
      );
      expect(
        result.success,
        JSON.stringify(!result.success && result.error.issues),
      ).toBe(true);
    });

    it('accepts a componentless empty-options boolean on edge and ego variables too', () => {
      expect(
        EdgeVariablesSchema.safeParse(
          withVariableIds(componentlessBooleanVariable([])),
        ).success,
      ).toBe(true);
      expect(
        EgoVariablesSchema.safeParse(
          withVariableIds(componentlessBooleanVariable([])),
        ).success,
      ).toBe(true);
    });
  });
});
