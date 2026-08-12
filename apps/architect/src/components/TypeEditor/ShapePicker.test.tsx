import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { ShapePickerControl } from './ShapePicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

describe('ShapePicker', () => {
  it('uses radio semantics and persists the selected shape', () => {
    let storeApi: StoreApi | null = null;
    const CaptureStore = () => {
      storeApi = useContext(FormStoreContext) ?? null;
      return null;
    };
    // Read through a call so control-flow analysis keeps the declared type:
    // the only write happens inside CaptureStore, which CFA cannot see.
    const getStoreApi = () => storeApi;

    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <Field
          name="shape"
          label="Node shape"
          component={ShapePickerControl}
          initialValue="circle"
          required
        />
      </Form>,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Node shape' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Node shape' }),
    ).toHaveAttribute('aria-required', 'true');
    expect(
      screen.getByRole('radio', { name: 'Select shape Circle' }),
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(
      screen.getByRole('radio', { name: 'Select shape Diamond' }),
    );

    expect(getStoreApi()?.getState().getFormValues().shape).toBe('diamond');
  });
});
