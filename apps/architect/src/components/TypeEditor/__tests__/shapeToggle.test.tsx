import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import type { ShapeMappingDraft } from '../shapeMappingTypes';
import ShapeVariableMapping from '../ShapeVariableMapping';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const MAPPING = {
  variable: 'v1',
  type: 'breakpoints',
  thresholds: [{ value: 1, shape: 'square' }],
} as ShapeMappingDraft;

const VARIABLES = { v1: { name: 'age', type: 'number' as const } };

const renderWithShape = (shape: {
  default: string;
  dynamic?: ShapeMappingDraft;
}) => {
  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

  // The real variable picker renders a connected variable pill.
  const store = configureStore({
    reducer: {
      activeProtocol: () => ({
        present: { codebook: { node: {}, edge: {} }, stages: [] },
      }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        {/* Stands in for TypeEditor's default-shape field, which shares the
            `shape` object with the mapping in the saved values. */}
        <Field
          name="shape.default"
          label="Shape"
          component={InputField}
          initialValue={shape.default}
        />
        <ShapeVariableMapping
          variables={VARIABLES}
          initialMapping={shape.dynamic}
        />
      </Form>
    </Provider>,
  );

  const getShape = () =>
    (storeApi?.getState().getFormValues().shape ?? {}) as Record<
      string,
      unknown
    >;

  return { getShape };
};

describe('ShapeVariableMapping toggle', () => {
  it('turns shape mapping on', () => {
    const { getShape } = renderWithShape({ default: 'circle' });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(getShape().dynamic).toEqual({});
  });

  // The mapping is one opaque field, so turning it off has to clear the value
  // explicitly: an unregistered field's last value is parked dormant, and
  // `getFormValues()` must stop reporting `shape.dynamic` entirely.
  it('turns off a mapping that was loaded from the protocol', () => {
    const { getShape } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(getShape().dynamic).toBeUndefined();
  });

  it('keeps the default shape when turning a mapping off', () => {
    const { getShape } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(getShape().default).toBe('diamond');
  });

  it('does not resurrect the cleared mapping when switched back on', () => {
    const { getShape } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    const toggle = screen.getByLabelText('Map variable to shape');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(getShape().dynamic).toBeUndefined();
  });
});
