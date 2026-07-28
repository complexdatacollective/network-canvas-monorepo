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
  type: 'number' | 'text' | 'boolean' | 'ordinal' | 'datetime';
  validation?: Record<string, unknown>;
  options?: { label: string; value: boolean | number }[];
  component?: string;
  parameters?: Record<string, unknown>;
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

// `component`/`parameters` are seeded as ordinary form values, exactly as the
// field editor's own controls write them — the connected Validations reads
// them off the same form through `formValueSelector`.
const setup = ({
  validation = {},
  component,
  parameters,
  ...ownProps
}: OwnProps & {
  validation?: Record<string, unknown>;
  component?: string;
  parameters?: Record<string, unknown>;
}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <ReduxHarness
        initialValues={{ validation, component, parameters }}
        {...ownProps}
      />
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

  // Twenty-third-wave Finding 3: the currently selected target must stay
  // offered even when the live legality check would filter it out, so an
  // existing row always renders its committed value. Here `a` is ALREADY the
  // saved target of the row being edited, and it forms the same strict cycle
  // as the test above — but as the committed value, not a fresh candidate.
  it('keeps the currently selected target offered even once the live check would filter it out', () => {
    setup({
      variableType: 'number',
      entity: 'node',
      currentVariableId: 'b',
      allVariables: {
        a: { name: 'A', type: 'number', validation: { lessThanVariable: 'b' } },
        b: { name: 'B', type: 'number', validation: { lessThanVariable: 'a' } },
      },
      existingVariables: {
        a: { name: 'A', type: 'number' },
      },
      validation: { lessThanVariable: 'a' },
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

    expect(optionLabels).toContain('A');
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

  // Twenty-seventh-wave Finding 1: the rule-type gating switched from one
  // `checkDraft` call per candidate per rule to `findLegalReferenceTargets`
  // (batched per rule, over every candidate at once). This must keep
  // deciding each reference rule INDEPENDENTLY of the others: the same
  // candidate ("a") is a legal target for "Greater than" (b > a is exactly
  // what a's own "a < b" already says) but an illegal one for "Less than"
  // (b < a would close a < b < a, an impossible cycle) — so the two options
  // must land on opposite enabled/disabled outcomes in the very same render.
  it('gates every reference rule independently in the same render', () => {
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
    expect(
      within(ruleSelect).getByRole('option', { name: 'Less than' }),
    ).toBeDisabled();
    expect(
      within(ruleSelect).getByRole('option', { name: 'Greater than' }),
    ).not.toBeDisabled();
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

  // Nineteenth-wave Finding 4: the row check forwarded only the draft
  // `validation` and `options`, so it judged a reference rule against the
  // COMMITTED component and parameters. Widening A's singleton DatePicker
  // window to match B and adding `A sameAs B` in one dialog session was
  // therefore rejected on the old window, even though the form-level
  // validator (which does see the draft) accepts it and the saved protocol is
  // valid — the researcher had to close and reopen the dialog to make a legal
  // edit.
  describe('reference rules judged against the draft parameters', () => {
    const singletonYearPickers = (draftYear: string) => ({
      variableType: 'datetime',
      entity: 'node',
      currentVariableId: 'a',
      allVariables: {
        a: {
          name: 'A',
          type: 'datetime' as const,
          component: 'DatePicker',
          parameters: { type: 'year', min: '2020', max: '2020' },
          validation: {},
        },
        b: {
          name: 'B',
          type: 'datetime' as const,
          component: 'DatePicker',
          parameters: { type: 'year', min: '2021', max: '2021' },
          validation: {},
        },
      },
      existingVariables: { b: { name: 'B', type: 'datetime' as const } },
      validation: {},
      component: 'DatePicker',
      parameters: { type: 'year', min: draftYear, max: draftYear },
    });

    it('offers Same as once the draft window matches the only candidate', () => {
      setup(singletonYearPickers('2021'));

      fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

      expect(
        within(screen.getByRole('combobox')).getByRole('option', {
          name: 'Same as',
        }),
      ).not.toBeDisabled();
    });

    it('still withholds Same as when the draft window stays disjoint', () => {
      setup(singletonYearPickers('2022'));

      fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

      expect(
        within(screen.getByRole('combobox')).getByRole('option', {
          name: 'Same as',
        }),
      ).toBeDisabled();
    });

    // The draft `component` matters on its own: while A is still committed as
    // a RelativeDatePicker the row check reads it at full resolution (and as
    // an interview-date window), which mismatches B's year picker however the
    // draft parameters are written.
    it('offers Same as once the draft switches the picker to match', () => {
      setup({
        variableType: 'datetime',
        entity: 'node',
        currentVariableId: 'a',
        allVariables: {
          a: {
            name: 'A',
            type: 'datetime' as const,
            component: 'RelativeDatePicker',
            parameters: { anchor: '2021-06-01' },
            validation: {},
          },
          b: {
            name: 'B',
            type: 'datetime' as const,
            component: 'DatePicker',
            parameters: { type: 'year', min: '2021', max: '2021' },
            validation: {},
          },
        },
        existingVariables: { b: { name: 'B', type: 'datetime' as const } },
        validation: {},
        component: 'DatePicker',
        parameters: { type: 'year', min: '2021', max: '2021' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

      expect(
        within(screen.getByRole('combobox')).getByRole('option', {
          name: 'Same as',
        }),
      ).not.toBeDisabled();
    });
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

  // Twenty-first-wave Finding 5: when all unused validation rules are
  // reference rules with no legal target, the options map disables every
  // remaining option, but isFull counted only used vs total options, leaving
  // the Add button enabled. The user clicks Add, gets a row with no selectable
  // options, and must delete it. isFull should count only enabled unused options.
  describe('Add affordance when unused rules are disabled', () => {
    it('hides Add when all remaining unused rules are disabled', () => {
      // All non-reference rules (required, minValue, maxValue, unique) are used.
      // Only reference rules remain, and they're all disabled because b cycles
      // with itself (no legal targets). Add button should not be rendered.
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: {
            name: 'B',
            type: 'number',
            validation: { lessThanVariable: 'b' },
          },
        },
        existingVariables: {},
        validation: {
          required: true,
          minValue: 0,
          maxValue: 100,
          unique: true,
        },
      });

      expect(
        screen.queryByRole('button', { name: 'Add new' }),
      ).not.toBeInTheDocument();
    });

    it('keeps Add enabled when at least one unused rule is enabled', () => {
      // No rules are used yet. Reference rules have a legal target (c), so they
      // remain enabled. Add should be enabled.
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: { name: 'B', type: 'number', validation: {} },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: {
          c: { name: 'C', type: 'number' },
        },
        validation: {},
      });

      const addButton = screen.getByRole('button', { name: 'Add new' });
      expect(addButton).not.toBeDisabled();
    });

    it('hides Add when all rules are already used (no regression)', () => {
      // All available rules are used. Add button should not be rendered.
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: { name: 'B', type: 'number', validation: {} },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: {
          c: { name: 'C', type: 'number' },
        },
        validation: {
          required: true,
          minValue: 0,
          maxValue: 100,
          unique: true,
          lessThanVariable: 'c',
          greaterThanVariable: 'c',
          differentFrom: 'c',
          sameAs: 'c',
          lessThanOrEqualToVariable: 'c',
          greaterThanOrEqualToVariable: 'c',
        },
      });

      expect(
        screen.queryByRole('button', { name: 'Add new' }),
      ).not.toBeInTheDocument();
    });
  });
});
