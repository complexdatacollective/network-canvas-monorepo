import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';

import ShapeVariableMapping from '../ShapeVariableMapping';
import { SHAPE_MAPPING_FIELD } from '../validateEntityType';

// The exact copy the dialog's form-level validator reports; kept literal so a
// reworded message does not quietly turn these assertions vacuous.
const SHAPE_MAPPING_INCOMPLETE =
  'Select a variable to map to a shape, or turn off shape mapping.';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

/**
 * PINNING TEST — the issue reports this as broken; it is not, and it must not
 * become broken again.
 *
 * #1391 filed "Incomplete node-shape mapping inserts a plain paragraph with no
 * focus, alert, or live-region semantics". Two P0 fixes landed before this
 * issue was worked: #1385 gave `FieldErrors` a permanently mounted
 * `aria-live="polite"` region (it used to swap in a differently-keyed element
 * carrying the first message, which announces late or not at all) and made
 * `focusFirstError` synchronous and DOM-ordered; #1387 marked the variable
 * picker's button as the field's focus target. Nothing in #1391's own fix
 * touches this path, so these assertions are the only thing standing between
 * the filed description and becoming true again.
 */
const renderMapping = () => {
  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

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
        <ShapeVariableMapping
          variables={{ v1: { name: 'age', type: 'number' } }}
        />
      </Form>
    </Provider>,
  );

  // Turn the mapping on and leave the variable unchosen — the state the
  // dialog's form-level validator refuses to save.
  fireEvent.click(screen.getByLabelText('Map variable to shape'));

  const reportIncompleteMapping = () =>
    act(() => {
      storeApi?.getState().setErrors({
        formErrors: [],
        fieldErrors: { [SHAPE_MAPPING_FIELD]: [SHAPE_MAPPING_INCOMPLETE] },
      });
    });

  return { reportIncompleteMapping };
};

const mappingField = () => {
  const field = document.querySelector(
    `[data-field-name="${SHAPE_MAPPING_FIELD}"]`,
  );
  if (!field) throw new Error('the shape mapping field is not mounted');
  return field;
};

describe('an incomplete shape mapping', () => {
  it('renders its message inside a live region the control already describes', () => {
    const { reportIncompleteMapping } = renderMapping();

    const field = mappingField();
    // The region exists BEFORE the error does. A live region inserted at the
    // same moment as its content is not announced by most screen readers —
    // that was the defect, and an "is it in the DOM now?" assertion cannot
    // see it.
    const liveRegions = [...field.querySelectorAll('[aria-live]')];
    expect(liveRegions).not.toHaveLength(0);

    reportIncompleteMapping();

    const announced = liveRegions.filter((region) =>
      region.textContent?.includes(SHAPE_MAPPING_INCOMPLETE),
    );
    expect(announced).toHaveLength(1);
    expect(announced[0]?.getAttribute('aria-live')).toBe('polite');
    // Same element, not a replacement: `toBe`, not `toContainEqual`.
    expect(liveRegions).toContain(announced[0]);
  });

  it('renders no copy of the message outside a live region', () => {
    // The filed defect was "a plain paragraph": text that appears on screen
    // and is never announced. Asserting that SOME element announces it would
    // still pass if a silent duplicate were rendered alongside, so this walks
    // every element carrying the message.
    const { reportIncompleteMapping } = renderMapping();
    reportIncompleteMapping();

    const carriers = [...mappingField().querySelectorAll('*')].filter(
      (element) => element.textContent?.includes(SHAPE_MAPPING_INCOMPLETE),
    );
    expect(carriers).not.toHaveLength(0);
    expect(
      carriers.filter((element) => element.closest('[aria-live]') === null),
    ).toEqual([]);
  });

  it('sends focus to the picker that resolves it, not to nothing', () => {
    const { reportIncompleteMapping } = renderMapping();
    reportIncompleteMapping();

    act(() => {
      focusFirstError({
        formErrors: [],
        fieldErrors: { [SHAPE_MAPPING_FIELD]: [SHAPE_MAPPING_INCOMPLETE] },
      });
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(mappingField().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAccessibleName('Select variable');
  });
});
