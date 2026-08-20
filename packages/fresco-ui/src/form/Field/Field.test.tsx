import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '../fields/InputField';
import Form from '../Form';
import useFormStore from '../hooks/useFormStore';
import Field from './Field';
import type { FieldValue } from './types';

/** Records the exact `value` the field component receives from `useField`. */
function ProbeField({
  value,
}: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) {
  return (
    <div data-testid="received">
      {value === undefined ? 'UNDEFINED' : JSON.stringify(value)}
    </div>
  );
}

function Controls() {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const resetField = useFormStore((state) => state.resetField);
  const resetForm = useFormStore((state) => state.resetForm);
  return (
    <>
      <button type="button" onClick={() => setFieldValue('name', 'changed')}>
        change
      </button>
      <button type="button" onClick={() => setFieldValue('name', undefined)}>
        clear
      </button>
      <button type="button" onClick={() => resetField('name')}>
        resetField
      </button>
      <button type="button" onClick={() => resetForm()}>
        resetForm
      </button>
    </>
  );
}

function setup() {
  render(
    <Form onSubmit={() => ({ success: true })}>
      <Field
        name="name"
        label="Name"
        component={ProbeField}
        initialValue="init"
      />
      <Controls />
    </Form>,
  );
}

function received(): string | null {
  return screen.getByTestId('received').textContent;
}

describe('Field value reset / clear', () => {
  it('exposes the initialValue before any change', () => {
    setup();
    expect(received()).toBe('"init"');
  });

  it('clearing a field to undefined exposes undefined, not the initialValue', () => {
    setup();
    fireEvent.click(screen.getByText('change'));
    expect(received()).toBe('"changed"');

    // Regression: previously `value ?? initialValue` re-applied "init", so a
    // field with an initialValue could never be cleared.
    fireEvent.click(screen.getByText('clear'));
    expect(received()).toBe('UNDEFINED');
  });

  it('resetField restores the initialValue after a change', () => {
    setup();
    fireEvent.click(screen.getByText('change'));
    expect(received()).toBe('"changed"');

    fireEvent.click(screen.getByText('resetField'));
    expect(received()).toBe('"init"');
  });

  it('resetField restores the initialValue after the field was cleared', () => {
    setup();
    fireEvent.click(screen.getByText('clear'));
    expect(received()).toBe('UNDEFINED');

    fireEvent.click(screen.getByText('resetField'));
    expect(received()).toBe('"init"');
  });

  it('resetForm restores the field to its initialValue', () => {
    setup();
    fireEvent.click(screen.getByText('change'));
    expect(received()).toBe('"changed"');

    fireEvent.click(screen.getByText('resetForm'));
    expect(received()).toBe('"init"');
  });
});

/**
 * Issue #1385 (adjacent): `aria-describedby` listed `-required` and `-hint`
 * unconditionally, so every optional or hintless field shipped an IDREF
 * pointing at nothing.
 */
describe('Field aria-describedby', () => {
  function describedByIds(control: HTMLElement): string[] {
    return (control.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean);
  }

  function renderField(props: { required?: boolean; hint?: string }) {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <Field name="name" label="Name" component={InputField} {...props} />
      </Form>,
    );
    return screen.getByRole('textbox', { name: 'Name' });
  }

  it.each([
    { name: 'plain', props: {} },
    { name: 'required', props: { required: true } },
    { name: 'hinted', props: { hint: 'As it appears on your ID' } },
    {
      name: 'required and hinted',
      props: { required: true, hint: 'As it appears on your ID' },
    },
  ])('names only elements that exist ($name)', ({ props }) => {
    const control = renderField(props);
    const ids = describedByIds(control);

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('omits the required and hint references when neither is rendered', () => {
    const control = renderField({});

    expect(describedByIds(control)).toEqual([`${control.id}-error`]);
  });
});
