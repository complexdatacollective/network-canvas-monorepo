import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '../../Field/Field';
import type { FieldSlotController } from '../../Field/types';
import FormStoreProvider from '../../store/formStoreProvider';
import InputField from '../InputField';

const EMPTY_ERROR = 'Identifier cannot be empty';

function renderFieldWithGenerate() {
  const utils = render(
    <FormStoreProvider>
      <Field
        name="identifier"
        label="Identifier"
        component={InputField}
        required={EMPTY_ERROR}
        suffixComponent={(field: FieldSlotController) => (
          <button type="button" onClick={() => field.setValue('p-123')}>
            Generate
          </button>
        )}
      />
    </FormStoreProvider>,
  );

  const input = utils.container.querySelector('input[name="identifier"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('identifier input not rendered');
  }
  const generate = screen.getByRole('button', { name: 'Generate' });
  return { input, generate };
}

/** Type a character then clear it, leaving the field dirty and empty. */
function touchThenEmpty(input: HTMLInputElement) {
  fireEvent.change(input, { target: { value: 'x' } });
  fireEvent.change(input, { target: { value: '' } });
}

describe('Field container-scoped validation with an in-field control', () => {
  it('does not validate when focus moves from the input to a slot button', async () => {
    const { input, generate } = renderFieldWithGenerate();

    touchThenEmpty(input);
    // Focus moves to the in-field Generate button — the field is still active.
    fireEvent.blur(input, { relatedTarget: generate });

    // Give any (unexpected) async validation a chance to surface an error.
    await Promise.resolve();
    await Promise.resolve();

    expect(
      screen.queryByTestId('identifier-field-error'),
    ).not.toBeInTheDocument();
  });

  it('setValue from the slot populates the field without leaving a stale error', async () => {
    const { input, generate } = renderFieldWithGenerate();

    touchThenEmpty(input);
    fireEvent.blur(input, { relatedTarget: generate });
    fireEvent.click(generate);

    await waitFor(() => expect(input).toHaveValue('p-123'));
    expect(
      screen.queryByTestId('identifier-field-error'),
    ).not.toBeInTheDocument();
  });

  it('validates when focus leaves the whole field', async () => {
    const { input } = renderFieldWithGenerate();
    // An element outside the field container receives focus.
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    touchThenEmpty(input);
    fireEvent.blur(input, { relatedTarget: outside });

    const error = await screen.findByTestId('identifier-field-error');
    expect(error).toHaveTextContent(EMPTY_ERROR);

    outside.remove();
  });

  it('setValue clears a pre-existing error once the field has been blurred', async () => {
    const { input, generate } = renderFieldWithGenerate();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    // Blur out of the field with an empty value → error appears.
    touchThenEmpty(input);
    fireEvent.blur(input, { relatedTarget: outside });
    await screen.findByTestId('identifier-field-error');

    // Generating a valid value routes through the change handler, which
    // revalidates because the field was already blurred.
    fireEvent.click(generate);

    await waitFor(() =>
      expect(
        screen.queryByTestId('identifier-field-error'),
      ).not.toBeInTheDocument(),
    );
    expect(input).toHaveValue('p-123');

    outside.remove();
  });
});
