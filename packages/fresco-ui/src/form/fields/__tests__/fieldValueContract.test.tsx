import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, test } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import type { ValidFieldComponent } from '../../Field/types';
import ArrayField, { type ArrayFieldItemProps } from '../ArrayField/ArrayField';
import BooleanField from '../Boolean';
import Checkbox from '../Checkbox';
import CheckboxGroupField from '../CheckboxGroup';
import ComboboxField from '../Combobox/Combobox';
import DatePickerField from '../DatePicker';
import InputField from '../InputField';
import LikertScaleField from '../LikertScale';
import PasswordField from '../PasswordField';
import RadioGroupField from '../RadioGroup';
import RadioMatrixField from '../RadioMatrixField';
import RelativeDatePickerField from '../RelativeDatePicker';
import RichSelectGroupField from '../RichSelectGroup';
import RichTextEditorField from '../RichTextEditor';
import SegmentedCodeField from '../SegmentedCodeField';
import NativeSelectField from '../Select/Native';
import StyledSelectField from '../Select/Styled';
import TextAreaField from '../TextArea';
import ToggleButtonGroupField from '../ToggleButtonGroup';
import ToggleField from '../ToggleField';
import VisualAnalogScaleField from '../VisualAnalogScale';

/**
 * The render-tolerance contract stated on `useField`'s `fieldProps.value`:
 * a control connected through `Field`/`useField` renders whatever the store
 * holds, and a cascade that replaces a foreign-typed value can only run after
 * the render commits — so every control must survive one render of any
 * `FieldValue` shape without throwing.
 *
 * A throw is not a cosmetic failure: the render never commits, so the effect
 * that would have replaced the value never runs and the value stays foreign
 * forever (#1433, where `CheckboxGroup` reached `true.includes(...)`).
 */

type FieldControl = {
  name: string;
  Component: ValidFieldComponent;
  /** The minimum props the control needs to mount. */
  props: Record<string, unknown>;
};

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

function ArrayItem({ item }: ArrayFieldItemProps<{ label: string }>) {
  return <span>{item.label}</span>;
}

/**
 * Every value-bearing control under `src/form/fields/**`.
 *
 * ADD A ROW when you add a control, and a row per branch when a prop selects a
 * wholly different rendering (DatePicker's resolutions, RichSelectGroup's
 * multiple mode). An unlisted control is simply untested against the contract
 * above — which is how the CheckboxGroup crash reached a release.
 *
 * Deliberately absent: `ToggleFieldSkeleton` (a loading placeholder with no
 * value or onChange), and the helpers that live beside these files —
 * `Combobox/shared`, `Select/shared`, `getPasswordStrength`,
 * `useArrayFieldItems`, `ArrayFieldDragHandle`, `sliderTestHelpers` and
 * `scale/*`. None of them is a control the form store can hand a value to.
 */
const FIELD_CONTROLS: FieldControl[] = [
  {
    name: 'ArrayField',
    Component: ArrayField,
    props: { itemComponent: ArrayItem, itemTemplate: () => ({ label: '' }) },
  },
  { name: 'Boolean', Component: BooleanField, props: {} },
  { name: 'Checkbox', Component: Checkbox, props: {} },
  { name: 'CheckboxGroup', Component: CheckboxGroupField, props: { options } },
  { name: 'Combobox', Component: ComboboxField, props: { options } },
  {
    name: 'DatePicker (full)',
    Component: DatePickerField,
    props: { type: 'full' },
  },
  {
    name: 'DatePicker (month)',
    Component: DatePickerField,
    props: { type: 'month' },
  },
  {
    name: 'DatePicker (year)',
    Component: DatePickerField,
    props: { type: 'year' },
  },
  { name: 'InputField', Component: InputField, props: {} },
  { name: 'LikertScale', Component: LikertScaleField, props: { options } },
  {
    name: 'PasswordField',
    Component: PasswordField,
    props: { showStrengthMeter: true },
  },
  { name: 'RadioGroup', Component: RadioGroupField, props: { options } },
  {
    name: 'RadioMatrixField',
    Component: RadioMatrixField,
    props: { rows: [{ id: 'row-1', label: 'Row one' }], options },
  },
  {
    name: 'RelativeDatePicker',
    Component: RelativeDatePickerField,
    props: {},
  },
  {
    name: 'RichSelectGroup (single)',
    Component: RichSelectGroupField,
    props: { options },
  },
  {
    name: 'RichSelectGroup (multiple)',
    Component: RichSelectGroupField,
    props: { options, multiple: true },
  },
  {
    name: 'RichTextEditor',
    Component: RichTextEditorField,
    props: {
      'id': 'editor',
      'name': 'editor',
      'aria-describedby': 'editor-hint',
    },
  },
  {
    name: 'SegmentedCodeField',
    Component: SegmentedCodeField,
    props: { segments: 4 },
  },
  { name: 'Select (native)', Component: NativeSelectField, props: { options } },
  { name: 'Select (styled)', Component: StyledSelectField, props: { options } },
  { name: 'TextArea', Component: TextAreaField, props: {} },
  {
    name: 'ToggleButtonGroup',
    Component: ToggleButtonGroupField,
    props: { options },
  },
  { name: 'ToggleField', Component: ToggleField, props: {} },
  {
    name: 'VisualAnalogScale',
    Component: VisualAnalogScaleField,
    props: {},
  },
];

/** One representative of every shape a `FieldValue` can take, plus `null` —
 * which the union does not name but stored protocol data can still hold. */
const FIELD_VALUE_SHAPES: [name: string, value: unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['a string', 'string'],
  ['a number', 42],
  ['a boolean', true],
  ['an array', ['a']],
  ['an object', { k: 1 }],
];

const cases = FIELD_CONTROLS.flatMap((control) =>
  FIELD_VALUE_SHAPES.map(
    ([shape, value]) => [control.name, shape, control, value] as const,
  ),
);

describe('field controls tolerate any stored value shape', () => {
  test.each(cases)('%s renders %s', (_name, _shape, control, value) => {
    expect(() =>
      render(
        <DialogProvider>
          {createElement(control.Component, {
            ...control.props,
            value,
            onChange: () => undefined,
          })}
        </DialogProvider>,
      ),
    ).not.toThrow();
  });
});
