import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { VariableSchema, type Variable } from '@codaco/protocol-validation';
import AppForm from '~/components/Form/AppForm';

import { makeFieldEditorValidate } from '../../Validations/contradictions';
import ValidationSection from '../ValidationSection';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
  // into view; jsdom implements no scrolling (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

// Eleventh-wave Finding 3: a variable that is only the TARGET of another
// variable's sameAs (it configures no rules of its own) still gets the
// dialog's contradiction error keyed at `validation` when the draft edit
// breaks the incoming relationship. With no rules the Validation section
// starts collapsed and the Validations field is unmounted — and
// `validateForm` only fails a submit over errors on REGISTERED fields, so
// without the forced expansion the contradictory save would go through with
// no error at all.

// `b` (the edited variable) has no rules of its own; `a` carries an incoming
// sameAs to it. Both are full-resolution DatePickers in the codebook.
const allVariables: Record<string, Variable> = {
  a: VariableSchema.parse({
    name: 'a',
    type: 'datetime',
    component: 'DatePicker',
    validation: { sameAs: 'b' },
  }),
  b: VariableSchema.parse({
    name: 'b',
    type: 'datetime',
    component: 'DatePicker',
    validation: {},
  }),
};

/** Registers its field without rendering any control of its own. */
const InertField = (_props: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) => null;

/** Registers `parameters` and exposes the one interaction the test drives. */
const ParametersSwitcher = ({
  onChange,
}: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) => (
  <button
    type="button"
    onClick={() => onChange?.({ type: 'year' } as unknown as FieldValue)}
  >
    Switch to year resolution
  </button>
);

/**
 * Stands in for the dialog's own Parameters editor, plus the sibling
 * `variable`/`component` fields the real field-editor dialog registers: the
 * form-level `validate` reads all of these off `getFormValues()`.
 */
const DialogSiblingFields = () => (
  <>
    <Field
      name="variable"
      label="Variable"
      labelHidden
      component={InertField}
      initialValue="b"
    />
    <Field
      name="component"
      label="Component"
      labelHidden
      component={InertField}
      initialValue="DatePicker"
    />
    <Field
      name="parameters"
      label="Parameters"
      labelHidden
      component={ParametersSwitcher}
      initialValue={{} as unknown as FieldValue}
    />
  </>
);

/**
 * `ValidationSection` reads `options`/`component`/`parameters` reactively off
 * the surrounding form itself — `DialogSiblingFields` registers them, so
 * rendering `ValidationSection` directly (no extra plumbing needed) exercises
 * that read exactly as `FieldFields.tsx` will.
 */

const editorValidate = makeFieldEditorValidate(allVariables);
const validate = (values: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(editorValidate(values))) {
    if (typeof value === 'string') errors[key] = value;
  }
  return errors;
};

describe('ValidationSection with a target-only contradiction', () => {
  it('blocks the save and expands to show the message once the failed save surfaces it', async () => {
    const onSubmit = vi.fn();

    render(
      <AppForm onSubmit={onSubmit} validate={validate}>
        <DialogSiblingFields />
        <ValidationSection
          entity="node"
          variableType="datetime"
          existingVariables={{}}
          allVariables={allVariables}
          currentVariableId="b"
          initialValue={{}}
        />
        <button type="submit">Save</button>
      </AppForm>,
    );

    // No rules of its own and no contradiction yet: the section starts
    // collapsed, so its children (the Validations field and its FieldErrors)
    // are unmounted.
    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();

    // The draft edit switches the picker to year resolution, breaking the
    // incoming full-resolution sameAs from `a`. fresco-ui's form-level
    // validate only runs at submit time (not on every value change), so the
    // section stays collapsed here — a documented, accepted behaviour.
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to year resolution' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();

    // The save is still blocked: the form-level validate runs inside
    // onSubmit, ahead of the caller's onSubmit, and its error forces the
    // section open (`forceExpanded`) so the message renders where the
    // now-registered `validation` field's error slot is.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // `useForm`'s submit handler is async (it awaits `validateForm()` before
    // running the form-level validate), so the error — and the section
    // opening in response to it — land after a microtask tick.
    expect(
      await screen.findByText(/different resolutions/),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
  });
});

// The forceExpanded gate itself: a sync error keyed at `validation` opens the
// section even before any draft change, and clears once the error does.
describe('ValidationSection forceExpanded on a store-level validation error', () => {
  const SetErrorsButton = () => {
    const setErrors = useFormStore((store) => store.setErrors);
    return (
      <button
        type="button"
        onClick={() =>
          setErrors({
            formErrors: [],
            fieldErrors: { validation: ['Contradictory rules'] },
          })
        }
      >
        Force a validation error
      </button>
    );
  };

  it('opens while a validation sync error stands', () => {
    render(
      <AppForm onSubmit={() => ({ success: true })}>
        <SetErrorsButton />
        <ValidationSection
          entity="node"
          variableType="datetime"
          existingVariables={{}}
          allVariables={allVariables}
          currentVariableId="b"
          initialValue={{}}
        />
      </AppForm>,
    );

    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Force a validation error' }),
    );

    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
  });
});
