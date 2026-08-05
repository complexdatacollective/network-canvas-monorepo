import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import { VariableSchema, type Variable } from '@codaco/protocol-validation';

import { makeFieldEditorValidate } from '../../Validations/contradictions';
import ValidationSection from '../ValidationSection';

// Eleventh-wave Finding 3: a variable that is only the TARGET of another
// variable's sameAs (it configures no rules of its own) still gets the
// dialog's contradiction error keyed at `validation` when the draft edit
// breaks the incoming relationship. With no rules the Validation section
// starts collapsed and the Validations field is unmounted — and redux-form
// only fails a submit over errors on REGISTERED fields, so without the forced
// expansion the contradictory save would go through with no error at all.

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

type OwnProps = {
  onSubmit: (values: Record<string, unknown>) => void;
};

type HarnessProps = InjectedFormProps<Record<string, unknown>, OwnProps> &
  OwnProps;

const FORM_NAME = 'validation-section-behaviour-test';

const Harness = ({ handleSubmit, onSubmit, change }: HarnessProps) => (
  <form onSubmit={handleSubmit(onSubmit)}>
    <ValidationSection
      form={FORM_NAME}
      entity="node"
      variableType="datetime"
      existingVariables={{}}
      allVariables={allVariables}
      currentVariableId="b"
    />
    {/* Stands in for the dialog's Parameters editor: switches the draft to a
        year-resolution picker, breaking the incoming full-resolution sameAs. */}
    <button
      type="button"
      onClick={() => change('parameters', { type: 'year' })}
    >
      Switch to year resolution
    </button>
    <button type="submit">Save</button>
  </form>
);

const editorValidate = makeFieldEditorValidate(allVariables);
const validate = (values: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(editorValidate(values))) {
    if (typeof value === 'string') errors[key] = value;
  }
  return errors;
};

const ReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: FORM_NAME,
  touchOnBlur: false,
  touchOnChange: true,
  validate,
})(Harness);

describe('ValidationSection with a target-only contradiction', () => {
  it('expands for the contradiction, blocks the save, and shows the message on the failed save', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    const onSubmit = vi.fn();

    render(
      <Provider store={store}>
        <ReduxHarness
          onSubmit={onSubmit}
          initialValues={{
            variable: 'b',
            component: 'DatePicker',
            parameters: {},
          }}
        />
      </Provider>,
    );

    // No rules of its own and no contradiction yet: the section starts
    // collapsed, so its children (the Validations field and its FieldErrors)
    // are unmounted.
    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();

    // The draft edit switches the picker to year resolution, breaking the
    // incoming full-resolution sameAs from `a` — the section must open so
    // the `validation` field registers and can block the save.
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to year resolution' }),
    );
    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();
    // The message itself waits for a failed save (FieldErrors shows on
    // submitFailed).
    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/different resolutions/)).toBeInTheDocument();
  });
});

const ClearableHarness = ({ handleSubmit, onSubmit, change }: HarnessProps) => (
  <form onSubmit={handleSubmit(onSubmit)}>
    <ValidationSection
      form={FORM_NAME}
      entity="node"
      variableType="number"
      existingVariables={{}}
      allVariables={{}}
      currentVariableId="c"
    />
    <button type="button" onClick={() => change('validation', {})}>
      Clear the last rule
    </button>
  </form>
);

const ClearableReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: FORM_NAME,
  touchOnBlur: false,
  touchOnChange: true,
})(ClearableHarness);

describe('ValidationSection expansion latch', () => {
  it('stays open when the last rule is cleared', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <ClearableReduxHarness
          onSubmit={vi.fn()}
          initialValues={{ variable: 'c', validation: { minValue: 3 } }}
        />
      </Provider>,
    );

    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear the last rule' }),
    );

    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();
  });
});
