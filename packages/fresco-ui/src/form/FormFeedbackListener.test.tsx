import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import BooleanField from './fields/Boolean';
import Checkbox from './fields/Checkbox';
import CheckboxGroupField from './fields/CheckboxGroup';
import ColorPickerField from './fields/ColorPicker';
import ComboboxField from './fields/Combobox/Combobox';
import LikertScaleField from './fields/LikertScale';
import OptionMappingField from './fields/OptionMappingField';
import RadioGroupField from './fields/RadioGroup';
import RadioMatrixField from './fields/RadioMatrixField';
import RichSelectGroupField from './fields/RichSelectGroup';
import NativeSelectField from './fields/Select/Native';
import StyledSelectField from './fields/Select/Styled';
import ToggleButtonGroupField from './fields/ToggleButtonGroup';
import ToggleField from './fields/ToggleField';
import { FormFeedbackListener } from './FormFeedbackListener';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

type ControlledProps<V> = {
  value: V | undefined;
  onChange: (value: V | undefined) => void;
};

/**
 * Renders `Field` controlled, as a form renders it, with a button that sets
 * its value the way a program does (a reset, or answers being restored).
 * Returns the record of what the listener was told.
 */
function renderControlled<V>(
  Field: ComponentType<ControlledProps<V>>,
  {
    initialValue,
    programmaticValue,
  }: { initialValue: V | undefined; programmaticValue: V | undefined },
) {
  const onOptionToggle = vi.fn<(selected: boolean) => void>();
  function Harness() {
    const [value, setValue] = useState<V | undefined>(initialValue);
    return (
      <>
        <Field value={value} onChange={setValue} />
        <button type="button" onClick={() => setValue(programmaticValue)}>
          Set by the program
        </button>
      </>
    );
  }
  render(
    <FormFeedbackListener onOptionToggle={onOptionToggle}>
      <Harness />
    </FormFeedbackListener>,
  );
  const setByProgram = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Set by the program' }));
  const reported = () =>
    onOptionToggle.mock.calls.map(([selected]) => selected);
  return { setByProgram, reported };
}

describe('FormFeedbackListener option feedback', () => {
  it('hears a radio group choice once, and nothing the program sets', () => {
    const { setByProgram, reported } = renderControlled<string | number>(
      (props) => (
        <RadioGroupField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: 'a', programmaticValue: 'c' },
    );
    expect(reported()).toEqual([]);

    fireEvent.click(screen.getByRole('radio', { name: 'Banana' }));
    expect(reported()).toEqual([true]);

    setByProgram();
    expect(screen.getByRole('radio', { name: 'Cherry' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(reported()).toEqual([true]);
  });

  it('hears a tick as selected and an untick as cleared in a checkbox group', () => {
    const { setByProgram, reported } = renderControlled<(string | number)[]>(
      (props) => (
        <CheckboxGroupField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: ['a'], programmaticValue: ['b', 'c'] },
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Banana' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(screen.getByRole('checkbox', { name: 'Cherry' })).toBeChecked();
    expect(reported()).toEqual([true, false]);
  });

  it('hears a single checkbox ticked and unticked', () => {
    const { setByProgram, reported } = renderControlled<boolean>(
      (props) => <Checkbox aria-label="Agree" {...props} />,
      { initialValue: false, programmaticValue: true },
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Agree' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Agree' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(screen.getByRole('checkbox', { name: 'Agree' })).toBeChecked();
    expect(reported()).toEqual([true, false]);
  });

  it('hears a switch turned on and off', () => {
    const { setByProgram, reported } = renderControlled<boolean>(
      (props) => <ToggleField aria-label="Close" {...props} />,
      { initialValue: false, programmaticValue: true },
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Close' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Close' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(screen.getByRole('switch', { name: 'Close' })).toBeChecked();
    expect(reported()).toEqual([true, false]);
  });

  it('hears a yes or no answer chosen, not the same answer chosen again, and its reset as cleared', () => {
    const { setByProgram, reported } = renderControlled<boolean>(
      (props) => (
        <BooleanField aria-label="Know them" noReset={false} {...props} />
      ),
      { initialValue: undefined, programmaticValue: false },
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect(reported()).toEqual([true, true]);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(reported()).toEqual([true, true, false]);

    setByProgram();
    expect(screen.getByRole('radio', { name: 'No' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(reported()).toEqual([true, true, false]);
  });

  it('hears toggle buttons pressed on and off', () => {
    const { setByProgram, reported } = renderControlled<(string | number)[]>(
      (props) => (
        <ToggleButtonGroupField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: [], programmaticValue: ['c'] },
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(screen.getByRole('checkbox', { name: 'Cherry' })).toBeChecked();
    expect(reported()).toEqual([true, false]);
  });

  it('hears a rich select card chosen, not chosen again', () => {
    const { setByProgram, reported } = renderControlled<
      string | number | (string | number)[]
    >(
      (props) => (
        <RichSelectGroupField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: undefined, programmaticValue: 'c' },
    );

    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));
    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }));
    expect(reported()).toEqual([true, true]);

    setByProgram();
    expect(reported()).toEqual([true, true]);
  });

  it('hears cards chosen and cleared in a rich select of several', () => {
    const { setByProgram, reported } = renderControlled<
      string | number | (string | number)[]
    >(
      (props) => (
        <RichSelectGroupField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          multiple
          {...props}
        />
      ),
      { initialValue: [], programmaticValue: ['c'] },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apple' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(reported()).toEqual([true, false]);
  });

  it('hears each option a Likert scale is moved to, and nothing the program sets', async () => {
    const user = userEvent.setup();
    const { setByProgram, reported } = renderControlled<string | number>(
      (props) => (
        <LikertScaleField aria-label="Agreement" options={OPTIONS} {...props} />
      ),
      { initialValue: 'a', programmaticValue: 'c' },
    );

    act(() => screen.getByRole('slider').focus());
    await user.keyboard('{ArrowRight}');
    expect(reported()).toEqual([true]);

    setByProgram();
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Cherry',
    );
    expect(reported()).toEqual([true]);
  });

  it('hears a choice in a row of a radio matrix', () => {
    const { setByProgram, reported } = renderControlled<
      { id: string; value: string }[]
    >(
      (props) => (
        <RadioMatrixField
          aria-label="Partners"
          name="partners"
          rows={[{ id: 'robert', label: 'Robert' }]}
          options={[
            { value: 'current', label: 'Current partner' },
            { value: 'former', label: 'Ex-partner' },
          ]}
          {...props}
        />
      ),
      {
        initialValue: [],
        programmaticValue: [{ id: 'robert', value: 'former' }],
      },
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Current partner' }));
    expect(reported()).toEqual([true]);

    setByProgram();
    expect(reported()).toEqual([true]);
  });

  it('hears a native select choice, and choosing the placeholder as cleared', () => {
    const { setByProgram, reported } = renderControlled<string | number>(
      (props) => (
        <NativeSelectField
          name="fruit"
          aria-label="Fruit"
          placeholder="Choose"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: undefined, programmaticValue: 'c' },
    );

    const select = screen.getByRole('combobox', { name: 'Fruit' });
    fireEvent.change(select, { target: { value: 'b' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(select).toHaveValue('c');
    expect(reported()).toEqual([true, false]);
  });

  it('hears a styled select choice', async () => {
    const user = userEvent.setup();
    const { setByProgram, reported } = renderControlled<string | number>(
      (props) => (
        <StyledSelectField
          name="fruit"
          aria-label="Fruit"
          placeholder="Choose"
          options={OPTIONS}
          {...props}
        />
      ),
      { initialValue: undefined, programmaticValue: 'c' },
    );

    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.click(await screen.findByRole('option', { name: 'Banana' }));
    expect(reported()).toEqual([true]);

    setByProgram();
    expect(reported()).toEqual([true]);
  });

  it('hears combobox options chosen and cleared', async () => {
    const user = userEvent.setup();
    const { setByProgram, reported } = renderControlled<(string | number)[]>(
      (props) => (
        <ComboboxField
          name="fruit"
          aria-label="Fruit"
          options={OPTIONS}
          showSelectAll={false}
          {...props}
          value={props.value ?? []}
        />
      ),
      { initialValue: [], programmaticValue: ['c'] },
    );

    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.click(await screen.findByRole('option', { name: 'Apple' }));
    await user.click(screen.getByRole('option', { name: 'Apple' }));
    expect(reported()).toEqual([true, false]);

    setByProgram();
    expect(reported()).toEqual([true, false]);
  });

  it('hears a colour swatch chosen', () => {
    const { setByProgram, reported } = renderControlled<string>(
      (props) => (
        <ColorPickerField
          name="colour"
          aria-label="Colour"
          options={[
            { value: '#ff0000', label: 'Red' },
            { value: '#0000ff', label: 'Blue' },
          ]}
          {...props}
        />
      ),
      { initialValue: '#ff0000', programmaticValue: '#0000ff' },
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(reported()).toEqual([true]);

    setByProgram();
    expect(reported()).toEqual([true]);
  });

  it('hears a choice in an option mapping row', () => {
    const onOptionToggle = vi.fn();
    render(
      <FormFeedbackListener onOptionToggle={onOptionToggle}>
        <OptionMappingField
          aria-label="Shapes"
          name="shapes"
          rows={[{ id: 'friend', label: 'Friend' }]}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'square', label: 'Square' },
          ]}
          renderOption={(option) => <span>{option.label}</span>}
          value={[{ id: 'friend', value: 'circle' }]}
          onRowChange={() => undefined}
        />
      </FormFeedbackListener>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Square' }));
    expect(onOptionToggle.mock.calls).toEqual([[true]]);
  });

  it('reports nothing, and fails nothing, outside a listener', () => {
    const onChange = vi.fn();
    render(
      <RadioGroupField
        name="fruit"
        aria-label="Fruit"
        options={OPTIONS}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Apple' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
