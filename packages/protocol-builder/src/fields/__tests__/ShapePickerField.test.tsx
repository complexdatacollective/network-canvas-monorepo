import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ShapePickerField from '../ShapePickerField.tsx';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

/**
 * The swatch picker Architect chose a node type's shape with, carried over
 * whole (`components/TypeEditor/ShapePicker.tsx` and its own test at
 * `74a07e626`): a radio group, one swatch per shape, each named for the shape
 * it draws.
 */
describe('ShapePickerField', () => {
  it('uses radio semantics and persists the selected shape', () => {
    let storeApi: StoreApi | null = null;
    const CaptureStore = () => {
      storeApi = useContext(FormStoreContext) ?? null;
      return null;
    };
    // Read through a call so control-flow analysis keeps the declared type:
    // the only write happens inside CaptureStore, which it cannot see.
    const getStoreApi = () => storeApi;

    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <Field<typeof ShapePickerField>
          name="shape"
          label="Node shape"
          component={ShapePickerField}
          initialValue="circle"
          required="Choose a default shape."
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
