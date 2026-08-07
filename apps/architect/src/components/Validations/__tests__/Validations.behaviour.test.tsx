import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  change,
  formValueSelector,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

// The connected component (withStoreState around the presentational
// Validations.tsx) is rendered for real, inside a redux-form + Provider
// harness — the same idiom DialogArrayField.test.tsx and NativeSelect.test.tsx
// use — so these behaviours are exercised through the actual wiring (real
// checkDraft, real findDraftContradictions, real ToggleField/NativeSelectField),
// not a hand-rolled restatement of the logic.
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

  render(
    <Provider store={store}>
      <ReduxHarness
        initialValues={{ validation, component, parameters }}
        {...ownProps}
      />
    </Provider>,
  );

  const committedValidation = (): Record<string, unknown> =>
    (formValueSelector(FORM_NAME)(store.getState(), 'validation') ??
      {}) as Record<string, unknown>;

  return { store, committedValidation };
};

const toggle = (label: string) =>
  screen.getByRole('switch', { name: label, hidden: true });

const numberValue = (label: string) =>
  screen.getByRole('spinbutton', { name: label });

const stepper = (label: string) =>
  screen.getByRole('button', { name: label, hidden: true });

const targetSelect = (label: string) =>
  screen.getByRole('combobox', { name: label });

const typeValue = (label: string, value: string) => {
  const input = numberValue(label);
  fireEvent.change(input, { target: { value } });
  return input;
};

describe('Validations behaviour', () => {
  describe('the rule catalogue', () => {
    it('lists every applicable rule, grouped, whether or not it is set', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      expect(
        screen.getByRole('group', { name: 'Requirements' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Limits' })).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: 'Compare to another variable' }),
      ).toBeInTheDocument();

      expect(toggle('Minimum value')).not.toBeChecked();
      expect(toggle('Maximum value')).not.toBeChecked();
      expect(toggle('Required')).not.toBeChecked();
    });

    it('renders a set rule as switched on with its value', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {},
        existingVariables: {},
        validation: { required: true, minValue: 3 },
      });

      expect(toggle('Required')).toBeChecked();
      expect(toggle('Minimum value')).toBeChecked();
      expect(numberValue('Minimum value')).toHaveValue(3);
    });

    it('offers only the length limits for the anonymisation passphrase', () => {
      setup({
        variableType: 'passphrase',
        entity: 'ego',
        currentVariableId: '',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      expect(screen.getByRole('group', { name: 'Limits' })).toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Requirements' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Compare to another variable' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('committing', () => {
    it('commits a value-less rule the moment it is switched on', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Required'));

      expect(committedValidation()).toEqual({ required: true });
    });

    it('removes a rule when it is switched off', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: true, minLength: 2 },
      });

      fireEvent.click(toggle('Required'));

      expect(committedValidation()).toEqual({ minLength: 2 });
    });

    it('writes a number only on blur, not on every keystroke', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum length'));
      expect(committedValidation()).toEqual({});

      const input = typeValue('Minimum length', '1');
      fireEvent.change(input, { target: { value: '10' } });
      expect(committedValidation()).toEqual({});

      fireEvent.blur(input);
      expect(committedValidation()).toEqual({ minLength: 10 });
    });

    it('commits on Enter as well as blur', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum length'));
      const input = typeValue('Minimum length', '4');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(committedValidation()).toEqual({ minLength: 4 });
    });

    it('holds in-progress input without committing or rewriting it', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum value'));
      const input = typeValue('Minimum value', '-');

      expect(input).toHaveValue(null);
      expect(committedValidation()).toEqual({});

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);

      expect(committedValidation()).toEqual({ minValue: -5 });
    });

    it('drops a committed rule when its value is cleared', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { minLength: 5 },
      });

      const input = typeValue('Minimum length', '');
      fireEvent.blur(input);

      expect(committedValidation()).toEqual({});
      expect(toggle('Minimum length')).toBeChecked();
    });
  });

  describe('contradictions are never committed', () => {
    it('allows an optional zero maximum', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Maximum length'));
      const input = typeValue('Maximum length', '0');
      fireEvent.blur(input);

      expect(
        screen.queryByText(/maxLength must be at least/),
      ).not.toBeInTheDocument();
      expect(committedValidation()).toEqual({ maxLength: 0 });
    });

    it('still rejects a required variable with a zero maximum', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: true },
      });

      fireEvent.click(toggle('Maximum length'));
      const input = typeValue('Maximum length', '0');

      expect(
        screen.getByText(/required answers cannot satisfy maxLength \(0\)/),
      ).toBeInTheDocument();

      fireEvent.blur(input);
      expect(committedValidation()).toEqual({ required: true });
    });

    it.each([
      ['text', 'minLength', 'Minimum length'],
      ['text', 'maxLength', 'Maximum length'],
      ['number', 'minValue', 'Minimum value'],
      ['number', 'maxValue', 'Maximum value'],
      ['categorical', 'minSelected', 'Minimum selected'],
      ['categorical', 'maxSelected', 'Maximum selected'],
    ])(
      'gates a fractional %s %s draft',
      (variableType, validationRule, label) => {
        const { committedValidation } = setup({
          variableType,
          entity: 'node',
          currentVariableId: `${variableType}-var`,
          allVariables: {},
          existingVariables: {},
          validation: {},
        });

        fireEvent.click(toggle(label));
        const input = typeValue(label, '1.5');

        expect(
          screen.getByText(`${validationRule} must be a whole number`),
        ).toBeInTheDocument();

        fireEvent.blur(input);
        expect(committedValidation()).toEqual({});
      },
    );

    it('reports an inverted bound against the pending row and withholds it', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { maxValue: 6 },
      });

      fireEvent.click(toggle('Minimum value'));
      const input = typeValue('Minimum value', '10');

      expect(
        screen.getByText(/minValue \(10\) is greater than maxValue \(6\)/),
      ).toBeInTheDocument();

      fireEvent.blur(input);
      expect(committedValidation()).toEqual({ maxValue: 6 });

      fireEvent.change(input, { target: { value: '2' } });
      fireEvent.blur(input);
      expect(committedValidation()).toEqual({ maxValue: 6, minValue: 2 });
    });
  });

  describe('comparison rules', () => {
    it('filters a candidate that would form a strict comparator cycle out of the reference picker', () => {
      // a already requires a < b. On b's existing "less than c" rule, a
      // candidate of "a" would close a < b < a — an impossible strict cycle —
      // so it must not be offered, while the untouched candidate "c" must be.
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          a: {
            name: 'A',
            type: 'number',
            validation: { lessThanVariable: 'b' },
          },
          b: {
            name: 'B',
            type: 'number',
            validation: { lessThanVariable: 'c' },
          },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: {
          a: { name: 'A', type: 'number' },
          c: { name: 'C', type: 'number' },
        },
        validation: { lessThanVariable: 'c' },
      });

      const optionLabels = within(targetSelect('Less than'))
        .getAllByRole('option')
        .map((option) => option.textContent);

      expect(optionLabels).toContain('C');
      expect(optionLabels).not.toContain('A');
    });

    // Twenty-third-wave Finding 3: the currently selected target must stay
    // offered even when the live legality check would filter it out, so a set
    // rule always renders its committed value. Here `a` is ALREADY the saved
    // target, and it forms the same strict cycle as the test above — but as
    // the committed value, not a fresh candidate.
    it('keeps the currently selected target offered even once the live check would filter it out', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          a: {
            name: 'A',
            type: 'number',
            validation: { lessThanVariable: 'b' },
          },
          b: {
            name: 'B',
            type: 'number',
            validation: { lessThanVariable: 'a' },
          },
        },
        existingVariables: {
          a: { name: 'A', type: 'number' },
        },
        validation: { lessThanVariable: 'a' },
      });

      const optionLabels = within(targetSelect('Less than'))
        .getAllByRole('option')
        .map((option) => option.textContent);

      expect(optionLabels).toContain('A');
    });

    it('commits a comparison target as soon as it is chosen', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: { name: 'B', type: 'number', validation: {} },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: { c: { name: 'C', type: 'number' } },
        validation: {},
      });

      fireEvent.click(toggle('Less than'));
      expect(committedValidation()).toEqual({});

      fireEvent.change(targetSelect('Less than'), { target: { value: 'c' } });

      expect(committedValidation()).toEqual({ lessThanVariable: 'c' });
    });

    it('renders a rule with zero legal targets read-only, with a reason', () => {
      // The only candidate ("a") already requires a < b, so every value b could
      // pick for "less than" would close a cycle — the rule is unusable, and
      // says so rather than silently vanishing.
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          a: {
            name: 'A',
            type: 'number',
            validation: { lessThanVariable: 'b' },
          },
          b: { name: 'B', type: 'number', validation: {} },
        },
        existingVariables: {
          a: { name: 'A', type: 'number' },
        },
        validation: {},
      });

      expect(toggle('Less than')).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getAllByText(
          'Every comparable variable would make this rule impossible to satisfy.',
        ).length,
      ).toBeGreaterThan(0);
    });

    it('explains an empty codebook differently from an exhausted one', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: { b: { name: 'B', type: 'number', validation: {} } },
        existingVariables: {},
        validation: {},
      });

      expect(toggle('Same as')).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getAllByText(
          'No other variable of this type exists to compare against.',
        ).length,
      ).toBeGreaterThan(0);
    });

    // Twenty-seventh-wave Finding 1: the rule gating switched from one
    // `checkDraft` call per candidate per rule to `findLegalReferenceTargets`
    // (batched per rule, over every candidate at once). This must keep
    // deciding each reference rule INDEPENDENTLY of the others: the same
    // candidate ("a") is a legal target for "Greater than" (b > a is exactly
    // what a's own "a < b" already says) but an illegal one for "Less than"
    // (b < a would close a < b < a, an impossible cycle) — so the two rules
    // must land on opposite outcomes in the very same render.
    it('gates every reference rule independently in the same render', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          a: {
            name: 'A',
            type: 'number',
            validation: { lessThanVariable: 'b' },
          },
          b: { name: 'B', type: 'number', validation: {} },
        },
        existingVariables: {
          a: { name: 'A', type: 'number' },
        },
        validation: {},
      });

      expect(toggle('Less than')).toHaveAttribute('aria-disabled', 'true');
      expect(toggle('Greater than')).not.toHaveAttribute('aria-disabled');
    });
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

      expect(toggle('Same as')).not.toHaveAttribute('aria-disabled');
    });

    it('still withholds Same as when the draft window stays disjoint', () => {
      setup(singletonYearPickers('2022'));

      expect(toggle('Same as')).toHaveAttribute('aria-disabled', 'true');
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

      expect(toggle('Same as')).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('the unique-count advisory', () => {
    it('shows the unique-count hint on a boolean variable', () => {
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
      expect(
        screen.getByText(
          /Interview preview will refuse to generate synthetic data if more than 2 entities can hold a value/,
        ),
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

    it('omits the unique-count hint on a text variable', () => {
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
  });

  describe('the numeric steppers', () => {
    it('commits a stepped value without waiting for a blur', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Maximum length'));
      typeValue('Maximum length', '3');
      fireEvent.click(stepper('Increase Maximum length'));

      expect(numberValue('Maximum length')).toHaveValue(4);
      expect(committedValidation()).toEqual({ maxLength: 4 });
    });

    it('gates a stepped value through the contradiction check', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { maxValue: 6 },
      });

      fireEvent.click(toggle('Minimum value'));
      typeValue('Minimum value', '6');
      fireEvent.click(stepper('Increase Minimum value'));

      expect(
        screen.getByText(/minValue \(7\) is greater than maxValue \(6\)/),
      ).toBeInTheDocument();
      expect(committedValidation()).toEqual({ maxValue: 6 });
    });

    it('names each rule’s steppers after that rule', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 1, maxValue: 6 },
      });

      for (const label of ['Minimum value', 'Maximum value']) {
        expect(stepper(`Increase ${label}`)).toBeInTheDocument();
        expect(stepper(`Decrease ${label}`)).toBeInTheDocument();
      }

      expect(
        screen.queryByRole('button', { name: 'Increase value' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('rules held back by a contradiction', () => {
    it('commits a held rule once another row resolves the contradiction', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5 },
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '2'));
      expect(committedValidation()).toEqual({ minValue: 5 });

      fireEvent.blur(typeValue('Minimum value', '1'));

      expect(committedValidation()).toEqual({ minValue: 1, maxValue: 2 });
      expect(
        screen.queryByText(/is greater than maxValue/),
      ).not.toBeInTheDocument();
    });

    it('commits a held rule once the contradicting rule is switched off', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: true },
      });

      fireEvent.click(toggle('Maximum length'));
      fireEvent.blur(typeValue('Maximum length', '0'));
      expect(committedValidation()).toEqual({ required: true });

      fireEvent.click(toggle('Required'));

      expect(committedValidation()).toEqual({ maxLength: 0 });
    });

    // A rejected commit removes the rule from the committed map, so the row is
    // left pending with its typed value and nothing stale is left behind for
    // the settling loop to prefer over it.
    it('settles a rejected edit to an existing rule once another row makes room', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5, maxValue: 10 },
      });

      fireEvent.blur(typeValue('Minimum value', '20'));
      expect(committedValidation()).toEqual({ maxValue: 10 });
      expect(numberValue('Minimum value')).toHaveValue(20);

      fireEvent.blur(typeValue('Maximum value', '30'));

      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 30 });
      expect(numberValue('Minimum value')).toHaveValue(20);
    });

    // The row a researcher is typing in has not necessarily blurred when
    // another row commits: a stepper button settles its own row on click, and
    // Safari does not move focus to a button at all. The committed value is
    // then only the fallback the row would show if the edit were abandoned —
    // it must not be settled in place of the edit itself.
    it('settles an in-flight edit to an existing rule when another row commits', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5, maxValue: 10 },
      });

      typeValue('Minimum value', '20');
      fireEvent.blur(typeValue('Maximum value', '30'));

      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 30 });
      expect(numberValue('Minimum value')).toHaveValue(20);
    });

    it('settles an in-flight edit when another row is stepped', () => {
      const { committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5, maxValue: 10 },
      });

      typeValue('Minimum value', '9');
      fireEvent.click(stepper('Increase Maximum value'));

      expect(committedValidation()).toEqual({ minValue: 9, maxValue: 11 });
      expect(numberValue('Minimum value')).toHaveValue(9);
    });

    it('withholds a value-less rule that contradicts a committed bound', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { maxLength: 0 },
      });

      fireEvent.click(toggle('Required'));

      expect(
        screen.getByText(/required answers cannot satisfy maxLength \(0\)/),
      ).toBeInTheDocument();
      expect(committedValidation()).toEqual({ maxLength: 0 });
    });
  });

  describe('rolling the committed map back', () => {
    it('switches a rule back off when its commit is undone', () => {
      const { store, committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Maximum length'));
      fireEvent.blur(typeValue('Maximum length', '4'));
      expect(committedValidation()).toEqual({ maxLength: 4 });
      expect(toggle('Maximum length')).toBeChecked();

      act(() => {
        store.dispatch(change(FORM_NAME, 'validation', {}) as UnknownAction);
      });

      expect(committedValidation()).toEqual({});
      expect(toggle('Maximum length')).not.toBeChecked();
      expect(
        screen.queryByRole('spinbutton', { name: 'Maximum length' }),
      ).not.toBeInTheDocument();
    });

    it('does not write a rolled-back value out again on the next commit', () => {
      const { store, committedValidation } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum value'));
      fireEvent.blur(typeValue('Minimum value', '3'));

      act(() => {
        store.dispatch(change(FORM_NAME, 'validation', {}) as UnknownAction);
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '9'));

      expect(committedValidation()).toEqual({ maxValue: 9 });
    });
  });
});
