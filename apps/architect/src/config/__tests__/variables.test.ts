import { describe, expect, it } from 'vitest';

import { VARIABLE_TYPE_COMPONENTS } from '@codaco/protocol-validation';

import {
  formattedInputOptions,
  getComponentsForType,
  getTypeForComponent,
  VARIABLE_TYPES_WITH_COMPONENTS,
} from '../variables';

const renderableTypes = Object.entries(VARIABLE_TYPE_COMPONENTS).filter(
  ([, controls]) => controls.length > 0,
);

const allControls = renderableTypes.flatMap(([type, controls]) =>
  controls.map((control) => [control, type]),
);

describe('Variable input-control config', () => {
  // The input-control dropdown is built from the protocol schema's own per-type
  // `component` lists. Assert the two agree, so a control can never be offered
  // that would make the saved protocol fail validation.
  describe('agreement with the protocol schema', () => {
    it.each(renderableTypes)(
      'offers exactly the controls the schema accepts for %s, in the schema order',
      (variableType, acceptedControls) => {
        const offered = getComponentsForType(variableType).map(
          (component) => component.value,
        );

        expect(offered).toEqual([...acceptedControls]);
      },
    );

    it('reports exactly the schema types that have at least one control', () => {
      // Compared order-insensitively: Architect's display order is deliberately
      // its own (asserted separately below), while the schema record's key order
      // is different again.
      expect([...VARIABLE_TYPES_WITH_COMPONENTS].toSorted()).toEqual(
        renderableTypes.map(([type]) => type).toSorted(),
      );
    });

    it.each(allControls)(
      'maps the %s control back to the %s type',
      (control, variableType) => {
        expect(getTypeForComponent(control)).toBe(variableType);
      },
    );
  });

  // Deriving the lists from the schema must not adopt the schema record's key
  // order — these two assertions pin the dropdown exactly as it renders today.
  describe('Architect display order', () => {
    it('orders the type groups for display, not as the schema records them', () => {
      expect(VARIABLE_TYPES_WITH_COMPONENTS).toEqual([
        'number',
        'scalar',
        'datetime',
        'text',
        'boolean',
        'ordinal',
        'categorical',
      ]);
    });

    // Real groups, not a flat list punctuated by disabled value-less rows
    // standing in as headings. Those rows were seven duplicate React keys (all
    // the empty string) and seven more things a screen reader offered to pick.
    it('names each group without heading decoration', () => {
      expect(formattedInputOptions.map((group) => group.label)).toEqual([
        'Number Types',
        'Scalar Types',
        'Date Types',
        'Text Types',
        'Boolean Types',
        'Ordinal Types',
        'Categorical Types',
      ]);
    });

    it('holds every control inside its own group, and nothing value-less', () => {
      expect(
        formattedInputOptions.map((group) =>
          group.options.map((option) => option.value),
        ),
      ).toEqual([
        ['Number'],
        ['VisualAnalogScale'],
        ['DatePicker', 'RelativeDatePicker'],
        ['Text', 'TextArea'],
        ['Boolean', 'Toggle'],
        ['RadioGroup', 'LikertScale'],
        ['CheckboxGroup', 'ToggleButtonGroup'],
      ]);

      const values = formattedInputOptions.flatMap((group) =>
        group.options.map((option) => option.value),
      );
      expect(values.filter((value) => !value)).toEqual([]);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('fallbacks', () => {
    it.each(['nonsense', 'layout', 'location'])(
      'falls back to a text input for %s, which has no control list',
      (variableType) => {
        expect(getComponentsForType(variableType).map((c) => c.value)).toEqual([
          'Text',
        ]);
      },
    );

    it('returns null for a control no type can be rendered with', () => {
      expect(getTypeForComponent('NotAControl')).toBeNull();
    });

    it('returns null when no control is given', () => {
      expect(getTypeForComponent(undefined)).toBeNull();
    });
  });
});
