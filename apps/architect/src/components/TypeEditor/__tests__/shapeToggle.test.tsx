import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { messageFields } from '~/test/messageText';

import type { ShapeMappingDraft } from '../shapeMappingTypes';
import ShapeVariableMapping from '../ShapeVariableMapping';
import validateEntityType from '../validateEntityType';

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

  const getValues = (): Record<string, unknown> =>
    storeApi?.getState().getFormValues() ?? {};

  const getShape = () => (getValues().shape ?? {}) as Record<string, unknown>;

  return { getShape, getValues };
};

describe('ShapeVariableMapping toggle', () => {
  it('turns shape mapping on', () => {
    const { getShape } = renderWithShape({ default: 'circle' });

    fireEvent.click(screen.getByLabelText('Map attribute to shape'));

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

    fireEvent.click(screen.getByLabelText('Map attribute to shape'));

    expect(getShape().dynamic).toBeUndefined();
  });

  it('keeps the default shape when turning a mapping off', () => {
    const { getShape } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    fireEvent.click(screen.getByLabelText('Map attribute to shape'));

    expect(getShape().default).toBe('diamond');
  });

  it('does not resurrect the cleared mapping when switched back on', () => {
    const { getShape } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    const toggle = screen.getByLabelText('Map attribute to shape');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    // Empty, not the mapping the author just deleted — and not absent either:
    // see the completeness test below.
    expect(getShape().dynamic).toEqual({});
  });

  // Off-then-on and a first-time enable are the same state on screen ("mapping
  // on, no variable chosen"), so they have to reach `validateEntityType` the
  // same way. Leaving the disable's cleared value parked dormant made the
  // re-enabled toggle report no `shape.dynamic` at all, which the validator
  // reads as the perfectly valid "this type has no mapping" — so the dialog
  // saved a type whose toggle still read ON, while the identical fresh enable
  // was refused.
  const INCOMPLETE_MAPPING_ERRORS = {
    'shape.dynamic':
      'Select an attribute to map to a shape, or turn off shape mapping.',
  };

  it('refuses to save a mapping enabled for the first time and left empty', () => {
    const { getValues } = renderWithShape({ default: 'circle' });

    fireEvent.click(screen.getByLabelText('Map attribute to shape'));

    expect(messageFields(validateEntityType(getValues()))).toEqual(
      INCOMPLETE_MAPPING_ERRORS,
    );
  });

  it('refuses to save a re-enabled mapping left empty, exactly as a fresh one', () => {
    const { getValues } = renderWithShape({
      default: 'diamond',
      dynamic: MAPPING,
    });

    const toggle = screen.getByLabelText('Map attribute to shape');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(messageFields(validateEntityType(getValues()))).toEqual(
      INCOMPLETE_MAPPING_ERRORS,
    );
  });
});
