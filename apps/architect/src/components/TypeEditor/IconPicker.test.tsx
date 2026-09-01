import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import IconPicker from './IconPicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

describe('IconPicker', () => {
  it('uses shared field semantics and persists a searchable selection', async () => {
    let storeApi: StoreApi | null = null;
    const CaptureStore = () => {
      storeApi = useContext(FormStoreContext) ?? null;
      return null;
    };

    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <Field
          name="icon"
          label="Node icon"
          component={IconPicker}
          initialValue="Circle"
        />
      </Form>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Node icon' });
    expect(trigger).toHaveTextContent('Circle');

    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Circle' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.change(screen.getByPlaceholderText('Search icons…'), {
      target: { value: 'add-a-person' },
    });
    fireEvent.click(screen.getByRole('option', { name: /add-a-person/ }));

    await waitFor(() => {
      expect(storeApi?.getState().getFormValues().icon).toBe('add-a-person');
    });
  });
});
