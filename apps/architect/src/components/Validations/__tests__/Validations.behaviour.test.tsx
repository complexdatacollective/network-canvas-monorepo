import { configureStore } from '@reduxjs/toolkit';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

// The connected component (withStoreState + withAddNew + withUpdateHandlers
// around the presentational Validations.tsx) is rendered for real, inside a
// redux-form + Provider harness — the same idiom DialogArrayField.test.tsx and
// NativeSelect.test.tsx use — so these behaviours are exercised through the
// actual wiring (real checkDraft, real findDraftContradictions, real
// NativeSelectField), not a hand-rolled restatement of the logic.
import Validations from '../index';

type TestVariable = {
  name: string;
  type: 'number' | 'text' | 'boolean' | 'ordinal';
  validation?: Record<string, unknown>;
  options?: { label: string; value: boolean | number }[];
};

type OwnProps = {
  variableType: string;
  entity: string;
  existingVariables: Record<string, Pick<TestVariable, 'name' | 'type'>>;
  allVariables: Record<string, TestVariable>;
  currentVariableId: string;
};

type HarnessProps = InjectedFormProps<Record<string, unknown>, OwnProps> &
  OwnProps;

const FORM_NAME = 'validations-behaviour-test';

const Harness = ({
  variableType,
  entity,
  existingVariables,
  allVariables,
  currentVariableId,
}: HarnessProps) => (
  <Validations
    form={FORM_NAME}
    name="validation"
    variableType={variableType}
    entity={entity}
    existingVariables={existingVariables}
    allVariables={allVariables}
    currentVariableId={currentVariableId}
  />
);

const ReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: FORM_NAME,
})(Harness);

const setup = ({
  validation = {},
  ...ownProps
}: OwnProps & { validation?: Record<string, unknown> }) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <ReduxHarness initialValues={{ validation }} {...ownProps} />
    </Provider>,
  );
};

describe('Validations behaviour', () => {
  it('filters a candidate that would form a strict comparator cycle out of the reference picker', () => {
    // a already requires a < b. Editing b's existing "less than c" rule, a
    // candidate of "a" would close a < b < a — an impossible strict cycle —
    // so it must not be offered, while the untouched candidate "c" must be.
    setup({
      variableType: 'number',
      entity: 'node',
      currentVariableId: 'b',
      allVariables: {
        a: { name: 'A', type: 'number', validation: { lessThanVariable: 'b' } },
        b: { name: 'B', type: 'number', validation: { lessThanVariable: 'c' } },
        c: { name: 'C', type: 'number', validation: {} },
      },
      existingVariables: {
        a: { name: 'A', type: 'number' },
        c: { name: 'C', type: 'number' },
      },
      validation: { lessThanVariable: 'c' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Less than validation rule' }),
    );

    const selects = screen.getAllByRole('combobox');
    const targetSelect = selects[1];
    if (!targetSelect) throw new Error('Expected a reference-target select');
    const optionLabels = within(targetSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(optionLabels).toContain('C');
    expect(optionLabels).not.toContain('A');
  });

  it('disables a reference rule in the rule-type dropdown once it has zero legal targets', () => {
    // The only candidate ("a") already requires a < b, so every value b could
    // pick for "less than" would close a cycle — the rule itself is unusable
    // and its dropdown entry must be disabled rather than merely filtered.
    setup({
      variableType: 'number',
      entity: 'node',
      currentVariableId: 'b',
      allVariables: {
        a: { name: 'A', type: 'number', validation: { lessThanVariable: 'b' } },
        b: { name: 'B', type: 'number', validation: {} },
      },
      existingVariables: {
        a: { name: 'A', type: 'number' },
      },
      validation: {},
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

    const ruleSelect = screen.getByRole('combobox');
    const lessThanOption = within(ruleSelect).getByRole('option', {
      name: 'Less than',
    });

    expect(lessThanOption).toBeDisabled();
  });

  it('shows the unique-count hint on a boolean variable’s unique row', () => {
    setup({
      variableType: 'boolean',
      entity: 'node',
      currentVariableId: 'bool-var',
      allVariables: {},
      existingVariables: {},
      validation: { unique: true },
    });

    expect(
      screen.getByText(/This variable has only 2 possible values/),
    ).toBeInTheDocument();
  });

  // Fifteenth-wave Finding 2: a boolean restricted to one option really does
  // offer one value, so the hint must count the configured options rather
  // than assume the Yes/No default.
  it('counts a single-option boolean variable as one available value', () => {
    setup({
      variableType: 'boolean',
      entity: 'node',
      currentVariableId: 'bool-var',
      allVariables: {
        'bool-var': {
          name: 'Consented',
          type: 'boolean',
          options: [{ label: 'Yes', value: true }],
        },
      },
      existingVariables: {},
      validation: { unique: true },
    });

    expect(
      screen.getByText(/This variable has only 1 possible values/),
    ).toBeInTheDocument();
  });

  it('counts a two-option boolean variable as two available values', () => {
    setup({
      variableType: 'boolean',
      entity: 'node',
      currentVariableId: 'bool-var',
      allVariables: {
        'bool-var': {
          name: 'Consented',
          type: 'boolean',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      existingVariables: {},
      validation: { unique: true },
    });

    expect(
      screen.getByText(/This variable has only 2 possible values/),
    ).toBeInTheDocument();
  });

  // Sixteenth-wave Finding 2: two ordinal options may carry the same stored
  // value, and only one of them is reachable as an answer — counting option
  // entries overstated the domain the `unique` hint reports.
  it('counts an ordinal variable’s distinct option values, not its option entries', () => {
    setup({
      variableType: 'ordinal',
      entity: 'node',
      currentVariableId: 'ordinal-var',
      allVariables: {
        'ordinal-var': {
          name: 'Closeness',
          type: 'ordinal',
          options: [
            { label: 'Not close', value: 1 },
            { label: 'Distant', value: 1 },
            { label: 'Very close', value: 2 },
          ],
        },
      },
      existingVariables: {},
      validation: { unique: true },
    });

    expect(
      screen.getByText(/This variable has only 2 possible values/),
    ).toBeInTheDocument();
  });

  it('counts every option of an all-distinct ordinal variable', () => {
    setup({
      variableType: 'ordinal',
      entity: 'node',
      currentVariableId: 'ordinal-var',
      allVariables: {
        'ordinal-var': {
          name: 'Closeness',
          type: 'ordinal',
          options: [
            { label: 'Not close', value: 1 },
            { label: 'Somewhat close', value: 2 },
            { label: 'Very close', value: 3 },
          ],
        },
      },
      existingVariables: {},
      validation: { unique: true },
    });

    expect(
      screen.getByText(/This variable has only 3 possible values/),
    ).toBeInTheDocument();
  });

  it('omits the unique-count hint on a text variable’s unique row', () => {
    setup({
      variableType: 'text',
      entity: 'node',
      currentVariableId: 'text-var',
      allVariables: {},
      existingVariables: {},
      validation: { unique: true },
    });

    expect(screen.queryByText(/possible values/)).not.toBeInTheDocument();
  });

  it('gates a below-floor draft: disables the tick and shows the floor message', () => {
    setup({
      variableType: 'text',
      entity: 'node',
      currentVariableId: 'text-var',
      allVariables: {},
      existingVariables: {},
      validation: {},
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'maxLength' },
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '0' },
    });

    expect(
      screen.getByText('maxLength must be at least 1'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add validation rule' }),
    ).toBeDisabled();
  });
});
