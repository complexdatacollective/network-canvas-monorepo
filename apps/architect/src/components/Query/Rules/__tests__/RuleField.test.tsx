import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentType, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';

import RuleField from '../RuleField';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

// Consumers own the value; mirror that so a controlled fresco input reflects
// each change (otherwise React's change tracker suppresses a repeat value).
const StatefulRuleField = ({
  initialValue = '',
  validation,
}: {
  initialValue?: string;
  validation?: Record<string, unknown>;
}) => {
  const [value, setValue] = useState<string>(initialValue);
  return (
    <RuleField
      component={FrescoInputField}
      label="Threshold"
      name="value"
      value={value}
      validation={validation}
      onChange={(_event, nextValue) => setValue(String(nextValue))}
    />
  );
};

describe('RuleField', () => {
  it('shows no error before any interaction', () => {
    render(
      <RuleField
        component={FrescoInputField}
        label="Threshold"
        validation={{ required: true }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Threshold/ }),
    ).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('does not flag a valid value as invalid', () => {
    render(
      <RuleField
        component={FrescoInputField}
        label="Threshold"
        validation={{ required: true }}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: /Threshold/ });
    fireEvent.change(input, { target: { value: '5' } });

    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the validation message after an invalid change', () => {
    render(<StatefulRuleField validation={{ required: true }} />);

    const input = screen.getByRole('textbox', { name: /Threshold/ });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('passes the converted value, previous value, and field name to onChange', () => {
    const onChange = vi.fn();
    render(
      <RuleField
        component={FrescoInputField}
        label="Threshold"
        name="value"
        value="old"
        toValue={(value) => `converted:${String(value)}`}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /Threshold/ }), {
      target: { value: 'new' },
    });

    expect(onChange).toHaveBeenCalledWith(
      'converted:new',
      'converted:new',
      'old',
      'value',
    );
  });

  it('normalizes primitive options into value/label objects', () => {
    const onChange = vi.fn();
    render(
      <RuleField
        component={FrescoNativeSelectField}
        label="Operator"
        options={['contains', 'excludes']}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('combobox', { name: /Operator/ });
    expect(
      screen.getByRole('option', { name: 'contains' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'excludes' }),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'excludes' } });

    expect(onChange).toHaveBeenCalledWith(
      'excludes',
      'excludes',
      undefined,
      null,
    );
  });
});
