import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import UnconnectedField from '../../Field/UnconnectedField';
import BooleanField from '../Boolean';
import CheckboxGroupField from '../CheckboxGroup';
import LikertScaleField from '../LikertScale';
import RadioGroupField from '../RadioGroup';
import RichSelectGroupField from '../RichSelectGroup';
import NativeSelectField from '../Select/Native';
import StyledSelectField from '../Select/Styled';
import ToggleButtonGroupField from '../ToggleButtonGroup';
import ToggleField from '../ToggleField';
import VisualAnalogScaleField from '../VisualAnalogScale';

const options = [
  { value: 1, label: 'One', disabled: true },
  { value: 2, label: 'Two' },
];

describe('Select migration contracts', () => {
  it('forwards disabled options and emits the original numeric value natively', () => {
    const onChange = vi.fn();
    render(
      <NativeSelectField
        name="choice"
        options={options}
        value={2}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(within(select).getByRole('option', { name: 'One' })).toBeDisabled();

    fireEvent.change(select, { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('does not style numeric zero as an empty placeholder', () => {
    render(
      <NativeSelectField
        name="choice"
        options={[{ value: 0, label: 'Zero' }]}
        placeholder="Choose a value"
        value={0}
        onChange={() => undefined}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('0');
    expect(select).not.toHaveClass('italic');
    expect(select).not.toHaveClass('text-current/50');
  });

  it.each([undefined, null, ''])(
    'keeps placeholder styling for an empty %s value',
    (value) => {
      render(
        <NativeSelectField
          name="choice"
          options={[{ value: 0, label: 'Zero' }]}
          placeholder="Choose a value"
          value={value as never}
          onChange={() => undefined}
        />,
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('');
      expect(select).toHaveClass('italic', 'text-current/50');
    },
  );

  it('keeps numeric values typed and forwards field ARIA to the styled trigger', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <span id="choice-label">Numeric choice</span>
        <span id="choice-hint">Choose a number</span>
        <StyledSelectField
          id="choice"
          name="choice"
          options={options}
          value={2}
          onChange={onChange}
          aria-labelledby="choice-label"
          aria-describedby="choice-hint"
          aria-invalid
        />
      </>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Numeric choice' });
    expect(trigger).toHaveTextContent('Two');
    expect(trigger).toHaveAccessibleDescription('Choose a number');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');

    await user.click(trigger);
    const disabledOption = await screen.findByRole('option', { name: 'One' });
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');
    const enabledOption = screen.getByRole('option', { name: 'Two' });
    await user.click(enabledOption);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it.each([NativeSelectField, StyledSelectField])(
    'prevents interaction and exposes readonly state for %s',
    (Component) => {
      render(
        <Component
          name="choice"
          options={options}
          value={2}
          onChange={() => undefined}
          readOnly
        />,
      );
      const control = screen.getByRole('combobox');
      expect(control).toHaveAttribute('aria-readonly', 'true');
    },
  );
});

describe('composite field semantics', () => {
  it('names checkbox, boolean, radio, toggle, and rich-select groups', () => {
    render(
      <>
        <UnconnectedField
          name="edges"
          label="Edge types"
          component={CheckboxGroupField}
          value={[]}
          onChange={() => undefined}
          options={[{ value: 'knows', label: 'Knows' }]}
        />
        <UnconnectedField
          name="answer"
          label="Allowed"
          component={BooleanField}
          value={undefined}
          onChange={() => undefined}
        />
        <UnconnectedField
          name="colour"
          label="Colour"
          component={RadioGroupField}
          value={undefined}
          onChange={() => undefined}
          options={[{ value: 'red', label: 'Red' }]}
        />
        <UnconnectedField
          name="tags"
          label="Tags"
          component={ToggleButtonGroupField}
          value={[]}
          onChange={() => undefined}
          options={[{ value: 'one', label: 'One' }]}
        />
        <UnconnectedField
          name="layout"
          label="Layout"
          component={RichSelectGroupField}
          value="one"
          onChange={() => undefined}
          options={[{ value: 'one', label: 'One' }]}
        />
      </>,
    );

    expect(screen.getByRole('group', { name: 'Edge types' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Knows' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Allowed' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeVisible();
    const radio = screen.getByRole('radio', { name: 'Red' });
    expect(radio).toHaveAccessibleName('Red');
    expect(radio).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('group', { name: 'Tags' })).toBeVisible();
    expect(screen.getByRole('listbox', { name: 'Layout' })).toBeVisible();
  });

  it('describes required fields without unsupported group ARIA', () => {
    render(
      <UnconnectedField
        name="colour"
        label="Colour"
        component={RadioGroupField}
        value={undefined}
        onChange={() => undefined}
        options={[{ value: 'red', label: 'Red' }]}
        required
      />,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Colour' }),
    ).toHaveAccessibleDescription('Required');
  });

  it('honours per-option disabled when the whole field is explicitly enabled', () => {
    render(
      <>
        <CheckboxGroupField
          disabled={false}
          value={[]}
          onChange={() => undefined}
          options={[
            { value: 'checkbox', label: 'Disabled checkbox', disabled: true },
          ]}
        />
        <ToggleButtonGroupField
          disabled={false}
          value={[]}
          onChange={() => undefined}
          options={[
            { value: 'toggle', label: 'Disabled toggle', disabled: true },
          ]}
        />
        <RichSelectGroupField
          disabled={false}
          value="enabled"
          onChange={() => undefined}
          options={[
            { value: 'enabled', label: 'Enabled rich option' },
            {
              value: 'disabled',
              label: 'Disabled rich option',
              disabled: true,
            },
          ]}
        />
      </>,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Disabled checkbox' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('checkbox', { name: 'Disabled toggle' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('option', { name: /Disabled rich option/ }),
    ).toBeDisabled();
  });

  it('keeps a single roving tab stop when the selected rich value is numeric zero', () => {
    render(
      <RichSelectGroupField
        value={0}
        onChange={() => undefined}
        options={[
          { value: 1, label: 'One' },
          { value: 0, label: 'Zero' },
        ]}
      />,
    );

    const optionsInList = screen.getAllByRole('option');
    expect(
      optionsInList.filter((option) => option.tabIndex === 0),
    ).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Zero/ })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it.each([null, '', 'missing'])(
    'falls back to the first enabled rich option for a %s value',
    (value) => {
      render(
        <RichSelectGroupField
          value={value ?? undefined}
          onChange={() => undefined}
          options={[
            { value: 'disabled', label: 'Disabled first', disabled: true },
            { value: 'enabled', label: 'First enabled' },
          ]}
        />,
      );

      expect(
        screen.getByRole('option', { name: /Disabled first/ }),
      ).toHaveAttribute('tabindex', '-1');
      expect(
        screen.getByRole('option', { name: /First enabled/ }),
      ).toHaveAttribute('tabindex', '0');
    },
  );

  it('associates slider labels and descriptions with the operative range inputs', () => {
    render(
      <>
        <UnconnectedField
          name="likert"
          label="Agreement"
          hint="Choose one point"
          component={LikertScaleField}
          value={2}
          onChange={() => undefined}
          options={[
            { value: 1, label: 'Disagree' },
            { value: 2, label: 'Agree' },
          ]}
        />
        <UnconnectedField
          name="vas"
          label="Intensity"
          hint="Move the slider"
          component={VisualAnalogScaleField}
          value={0.5}
          onChange={() => undefined}
        />
      </>,
    );

    const likert = screen.getByRole('slider', { name: 'Agreement' });
    expect(likert).toHaveAccessibleDescription('Choose one point');
    expect(likert).toHaveAttribute('aria-valuetext', 'Agree');

    const vas = screen.getByRole('slider', { name: 'Intensity' });
    expect(vas).toHaveAccessibleDescription('Move the slider');
    expect(vas).toHaveAttribute('aria-valuetext', '50%');
  });
});

describe('ToggleField DOM forwarding', () => {
  it('forwards button props and merges consumer styles', () => {
    const onFocus = vi.fn();
    render(
      <ToggleField
        value={false}
        onChange={() => undefined}
        title="Toggle feature"
        data-testid="feature-toggle"
        onFocus={onFocus}
        style={{ opacity: 0.5 }}
      />,
    );

    const toggle = screen.getByTestId('feature-toggle');
    expect(toggle).toHaveAttribute('title', 'Toggle feature');
    expect(toggle).toHaveStyle({ opacity: '0.5' });
    fireEvent.focus(toggle);
    expect(onFocus).toHaveBeenCalledOnce();
  });
});
