import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import CheckboxGroupField from '../fields/CheckboxGroup';
import FormStoreProvider from '../store/formStoreProvider';
import { useForm } from './useForm';
import useFormStore from './useFormStore';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('useField initialValue identity', () => {
  it('keeps a submit error and aria-invalid when the caller passes a fresh but equal initialValue array on every render', async () => {
    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({ success: true as const }),
      });
      return (
        <form onSubmit={formProps.onSubmit}>
          <Field
            name="parents"
            label="Parents"
            component={CheckboxGroupField}
            options={OPTIONS}
            initialValue={[]}
            required
          />
          <button type="submit">Submit</button>
        </form>
      );
    }

    render(
      <FormStoreProvider>
        <Harness />
      </FormStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /Parents/ })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    // The error must still be there after the re-renders that follow submit.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole('group', { name: /Parents/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getAllByText(/must answer|required/i).length).toBeGreaterThan(
      0,
    );
  });

  it('still re-registers the field when initialValue changes by value', async () => {
    function Probe() {
      const initial = useFormStore(
        (state) => state.getFieldState('parents')?.initialValue,
      );
      return <output data-testid="initial">{JSON.stringify(initial)}</output>;
    }

    function Harness({ initial }: { initial: string[] }) {
      return (
        <FormStoreProvider>
          <Field
            name="parents"
            label="Parents"
            component={CheckboxGroupField}
            options={OPTIONS}
            initialValue={initial}
          />
          <Probe />
        </FormStoreProvider>
      );
    }

    const { rerender } = render(<Harness initial={['a']} />);
    await waitFor(() => {
      expect(screen.getByTestId('initial')).toHaveTextContent('["a"]');
    });

    rerender(<Harness initial={['b']} />);
    await waitFor(() => {
      expect(screen.getByTestId('initial')).toHaveTextContent('["b"]');
    });
  });
});
