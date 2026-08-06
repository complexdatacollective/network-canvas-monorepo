import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectField from '../ArchitectField';
import ColorPicker from './ColorPicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const renderInForm = (children: ReactNode) => {
  storeApi = null;

  return render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      {children}
    </Form>,
  );
};

const getColor = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi.getState().getFormValues().color as string | undefined;
};

describe('ColorPicker', () => {
  it('uses radio-group semantics and writes the selection to the form store', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Node color"
        component={ColorPicker}
        initialValue="node-color-seq-1"
        validation={{ required: true }}
        options={[
          { label: 'Red', value: 'node-color-seq-1' },
          { label: 'Blue', value: 'node-color-seq-2' },
        ]}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Node color' });
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    expect(getColor()).toBe('node-color-seq-2');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('renders every generated palette color, including the final index', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Palette"
        component={ColorPicker}
        palette="node-color-seq"
        paletteRange={3}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'node-color-seq-3' }),
    ).toBeInTheDocument();
  });
});
