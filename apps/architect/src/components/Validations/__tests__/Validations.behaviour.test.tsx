import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

// The real component is rendered inside a real fresco-ui form — the same idiom
// DialogArrayField.test.tsx and NativeSelect.test.tsx use — so these behaviours
// are exercised through the actual wiring (real checkDraft, real
// findDraftContradictions, real ToggleField/InputField/NativeSelectField), not
// a hand-rolled restatement of the logic.
import Validations from '../Validations';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
  // into view; jsdom implements no scrolling (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `component`/`parameters` stand in for sibling fields in the surrounding
// field-editor dialog — the real `ValidationSection` reads them reactively off
// that form and forwards them as `draftComponent`/`draftParameters`; none of
// these scenarios change them mid-test, so passing them straight through as
// static props here is equivalent.
const setup = ({
  validation = {},
  component,
  parameters,
  ...ownProps
}: OwnProps & {
  validation?: Record<string, boolean | number | string | null>;
  component?: string;
  parameters?: Record<string, unknown>;
}) => {
  let captured: FormStoreApi | null = null;
  let submitCount = 0;

  const StoreProbe = () => {
    captured = useContext(FormStoreContext) ?? null;
    return null;
  };

  const { container } = render(
    <Form
      onSubmit={() => {
        submitCount += 1;
        return { success: true };
      }}
    >
      <StoreProbe />
      <Validations
        name="validation"
        initialValue={validation}
        draftComponent={component}
        draftParameters={parameters}
        {...ownProps}
      />
    </Form>,
  );

  const storeApi = (): FormStoreApi => {
    if (!captured) throw new Error('form store was not captured');
    return captured;
  };

  const committedValidation = (): Record<string, unknown> => {
    const { validation: value } = storeApi().getState().getFormValues();
    return isRecord(value) ? value : {};
  };

  /**
   * Stands in for the stage editor's Undo, or for a reinitialize: the
   * committed map is rewritten from outside the rule list entirely.
   */
  const rollBackTo = (next: Record<string, unknown>) => {
    act(() => {
      storeApi().getState().setFieldValue('validation', next);
    });
  };

  /**
   * Runs the real submit path — `useForm`'s handler, which runs
   * `validateForm` over every registered field and only then calls
   * `onSubmit`. That is the whole point of the rule map now carrying its own
   * invalid values: the `validation` field validates itself, so a save that
   * would persist them never reaches the handler. (The store's own
   * `submitForm` deliberately skips validation, so it cannot be used here.)
   *
   * The trailing macrotask drain is for the rule list's own focus handoff (see
   * `ValidationRule`). It is NOT for `onSubmitInvalid`, which no longer defers:
   * fresco-ui runs it from a layout effect keyed on the store's
   * `errorFocusRequest`, and `focusFirstError` is synchronous. Don't take this
   * drain as a pattern to copy around every invalid submit.
   */
  const submit = async (): Promise<{ reachedHandler: boolean }> => {
    const before = submitCount;
    const form = container.querySelector('form');
    if (!form) throw new Error('form element was not rendered');
    await act(async () => {
      fireEvent.submit(form);
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    return { reachedHandler: submitCount > before };
  };

  const validationFieldErrors = (): string[] =>
    storeApi().getState().getFieldErrors('validation') ?? [];

  /** Asserts the save was refused, and reports why. */
  const expectSaveBlocked = async (): Promise<string> => {
    const { reachedHandler } = await submit();
    expect(reachedHandler).toBe(false);
    const errors = validationFieldErrors();
    expect(errors.length).toBeGreaterThan(0);
    return errors.join(' ');
  };

  const expectSaveAllowed = async () => {
    const { reachedHandler } = await submit();
    expect(validationFieldErrors()).toEqual([]);
    expect(reachedHandler).toBe(true);
  };

  return {
    committedValidation,
    expectSaveAllowed,
    expectSaveBlocked,
    rollBackTo,
  };
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

      expect(screen.getByRole('group', { name: 'Requirements' })).toHaveClass(
        'w-full',
        'min-w-0',
      );
      expect(screen.getByRole('group', { name: 'Limits' })).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: 'Compare to another variable' }),
      ).toHaveClass('w-full', 'min-w-0');

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

  // `required`/`unique` are `z.boolean().optional()` in the protocol schema,
  // so an explicit `false` is a valid saved shape — and one the contradiction
  // analyser reads as OFF (it gates on `required === true`). Deciding the
  // switch from key presence alone rendered it on and then parsed the
  // displayed rule as `true`, inventing a contradiction the saved protocol
  // does not have.
  describe('value-less rules saved as false', () => {
    it('renders an explicit false as switched off, with no phantom contradiction', () => {
      setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: false, maxLength: 0 },
      });

      expect(toggle('Required')).not.toBeChecked();
      expect(toggle('Maximum length')).toBeChecked();
      expect(numberValue('Maximum length')).toHaveValue(0);
      expect(
        screen.queryByText(/required answers cannot satisfy maxLength/),
      ).not.toBeInTheDocument();
    });

    it('renders an explicit unique false as switched off', () => {
      setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { unique: false },
      });

      expect(toggle('Must be unique')).not.toBeChecked();
    });

    it('switches a false rule on rather than off on the first click', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: false },
      });

      fireEvent.click(toggle('Required'));

      expect(toggle('Required')).toBeChecked();
      expect(committedValidation()).toEqual({ required: true });
    });

    it('switches a held false rule on and blocks the save while it contradicts', async () => {
      const { committedValidation, expectSaveAllowed, expectSaveBlocked } =
        setup({
          variableType: 'text',
          entity: 'node',
          currentVariableId: 'text-var',
          allVariables: {},
          existingVariables: {},
          validation: { required: false, maxLength: 0 },
        });

      fireEvent.click(toggle('Required'));
      // Both rules are implicated, so both rows carry the reason.
      expect(
        screen.getAllByText(/required answers cannot satisfy maxLength \(0\)/),
      ).toHaveLength(2);
      expect(committedValidation()).toEqual({ required: true, maxLength: 0 });
      expect(await expectSaveBlocked()).toMatch(
        /required answers cannot satisfy maxLength \(0\)/,
      );

      fireEvent.blur(typeValue('Maximum length', '5'));

      expect(committedValidation()).toEqual({ required: true, maxLength: 5 });
      await expectSaveAllowed();
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

    // Switching a numeric rule on records a useful, valid starting value. An
    // edit is still only written on blur, so a half-typed number never lands
    // in the map.
    it('records a numeric rule with an initial value and writes edits on blur', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum length'));
      expect(committedValidation()).toEqual({ minLength: 1 });
      expect(numberValue('Minimum length')).toHaveValue(1);

      const input = typeValue('Minimum length', '1');
      fireEvent.change(input, { target: { value: '10' } });
      expect(committedValidation()).toEqual({ minLength: 1 });

      fireEvent.blur(input);
      expect(committedValidation()).toEqual({ minLength: 10 });
    });

    it.each([
      ['text', 'Minimum length', 'minLength', 1],
      ['text', 'Maximum length', 'maxLength', 1],
      ['number', 'Minimum value', 'minValue', 0],
      ['number', 'Maximum value', 'maxValue', 0],
      ['categorical', 'Minimum selected', 'minSelected', 1],
      ['categorical', 'Maximum selected', 'maxSelected', 1],
    ])(
      'starts %s %s valid before the value control is edited',
      async (variableType, label, ruleKey, initialValue) => {
        const { committedValidation, expectSaveAllowed } = setup({
          variableType,
          entity: 'node',
          currentVariableId: `${variableType}-var`,
          allVariables: {},
          existingVariables: {},
          validation: {},
        });

        fireEvent.click(toggle(label));

        expect(committedValidation()).toEqual({ [ruleKey]: initialValue });
        expect(numberValue(label)).toHaveValue(initialValue);
        await expectSaveAllowed();
      },
    );

    it('uses an existing opposite bound as the initial value', () => {
      const { committedValidation } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { maxLength: 7 },
      });

      fireEvent.click(toggle('Minimum length'));

      expect(committedValidation()).toEqual({
        maxLength: 7,
        minLength: 7,
      });
      expect(numberValue('Minimum length')).toHaveValue(7);
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
      expect(committedValidation()).toEqual({ minValue: 0 });

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);

      expect(committedValidation()).toEqual({ minValue: -5 });
    });

    // Clearing the box is not the same as switching the rule off. The rule
    // stays on and unanswered, which the save then refuses — before this, the
    // key was deleted outright and the save went through without it.
    it('keeps a cleared rule switched on, and refuses to save it', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { minLength: 5 },
      });

      const input = typeValue('Minimum length', '');
      fireEvent.blur(input);

      expect(committedValidation()).toEqual({ minLength: null });
      expect(toggle('Minimum length')).toBeChecked();
      expect(await expectSaveBlocked()).toBe(
        'Enter a value for "Minimum length", or switch the rule off.',
      );
    });
  });

  // Issue #1383. A contradictory or below-floor value used to be kept OUT of
  // the committed map — which blocked nothing, because a map with the
  // offending rule already deleted is trivially consistent. The dialog saved,
  // and the rule was silently gone. The contract now: the value is committed,
  // the `validation` field is invalid, and the save is refused.
  describe('invalid rule values are kept and block the save', () => {
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

    it('still rejects a required variable with a zero maximum', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
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
      expect(committedValidation()).toEqual({ required: true, maxLength: 0 });
      expect(await expectSaveBlocked()).toMatch(
        /required answers cannot satisfy maxLength \(0\)/,
      );
    });

    it.each([
      ['text', 'minLength', 'Minimum length'],
      ['text', 'maxLength', 'Maximum length'],
      ['number', 'minValue', 'Minimum value'],
      ['number', 'maxValue', 'Maximum value'],
      ['categorical', 'minSelected', 'Minimum selected'],
      ['categorical', 'maxSelected', 'Maximum selected'],
    ])(
      'keeps a fractional %s %s and blocks the save',
      async (variableType, validationRule, label) => {
        const { committedValidation, expectSaveBlocked } = setup({
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
        expect(committedValidation()).toEqual({ [validationRule]: 1.5 });
        expect(await expectSaveBlocked()).toBe(
          `${validationRule} must be a whole number`,
        );
      },
    );

    // Issue #1383's first finding, in miniature: the inverted bound is now
    // held for correction instead of being dropped on the way out.
    it.each([
      ['text', 'Minimum length', 'Maximum length', '10', '3', 'maxLength'],
      ['number', 'Minimum value', 'Maximum value', '100', '50', 'maxValue'],
      [
        'categorical',
        'Minimum selected',
        'Maximum selected',
        '2',
        '1',
        'maxSelected',
      ],
    ])(
      'holds an inverted %s bound pair and blocks the save',
      async (variableType, minLabel, maxLabel, minText, maxText, maxRule) => {
        const { committedValidation, expectSaveAllowed, expectSaveBlocked } =
          setup({
            variableType,
            entity: 'node',
            currentVariableId: `${variableType}-var`,
            allVariables: {},
            existingVariables: {},
            validation: {},
          });

        fireEvent.click(toggle(minLabel));
        fireEvent.blur(typeValue(minLabel, minText));
        fireEvent.click(toggle(maxLabel));
        const maxInput = typeValue(maxLabel, maxText);
        fireEvent.blur(maxInput);

        expect(committedValidation()[maxRule]).toBe(Number(maxText));
        expect(await expectSaveBlocked()).toMatch(/is greater than/);

        fireEvent.change(maxInput, { target: { value: '999' } });
        fireEvent.blur(maxInput);
        expect(committedValidation()[maxRule]).toBe(999);
        await expectSaveAllowed();
      },
    );

    it('reports an inverted bound against the row and keeps it for correction', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
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
      expect(committedValidation()).toEqual({ maxValue: 6, minValue: 10 });
      await expectSaveBlocked();

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
      expect(committedValidation()).toEqual({ lessThanVariable: null });

      fireEvent.change(targetSelect('Less than'), { target: { value: 'c' } });

      expect(committedValidation()).toEqual({ lessThanVariable: 'c' });
    });

    // Issue #1383: a comparison rule switched on and left without a target
    // used to save as if the rule had never been switched on at all.
    it('refuses to save a comparison rule with no target chosen', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
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

      expect(committedValidation()).toEqual({ lessThanVariable: null });
      expect(await expectSaveBlocked()).toBe(
        'Choose a comparison variable for "Less than", or switch the rule off.',
      );
    });

    // An unanswered rule now lives in the committed map as `null`. The
    // reference picker must never see it: the analyser would read the `null`
    // as a bound and could rule every candidate out.
    it('keeps offering legal comparison targets while another rule is unanswered', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: { name: 'B', type: 'number', validation: {} },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: { c: { name: 'C', type: 'number' } },
        validation: { minValue: null },
      });

      expect(toggle('Less than')).not.toHaveAttribute('aria-disabled');

      fireEvent.click(toggle('Less than'));
      const optionLabels = within(targetSelect('Less than'))
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(optionLabels).toContain('C');
    });

    // A contradiction resident in the map DOES empty the variable's domain,
    // so no comparison against it can be satisfied and the picker correctly
    // closes — but only for as long as the contradiction stands. It must come
    // back the moment the pair is fixed, rather than staying stuck.
    it('reopens the comparison picker once a resident contradiction is fixed', () => {
      setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'b',
        allVariables: {
          b: {
            name: 'B',
            type: 'number',
            validation: { minValue: 10, maxValue: 2 },
          },
          c: { name: 'C', type: 'number', validation: {} },
        },
        existingVariables: { c: { name: 'C', type: 'number' } },
        validation: { minValue: 10, maxValue: 2 },
      });

      expect(toggle('Less than')).toHaveAttribute('aria-disabled', 'true');

      fireEvent.blur(typeValue('Maximum value', '20'));

      expect(toggle('Less than')).not.toHaveAttribute('aria-disabled');
      fireEvent.click(toggle('Less than'));
      const optionLabels = within(targetSelect('Less than'))
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(optionLabels).toContain('C');
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

    it('reports a stepped value that contradicts, and keeps it', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
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
        screen.getAllByText(/minValue \(7\) is greater than maxValue \(6\)/),
      ).toHaveLength(2);
      expect(committedValidation()).toEqual({ maxValue: 6, minValue: 7 });
      await expectSaveBlocked();
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

  describe('rules that contradict each other', () => {
    it('clears the objection once another row resolves the contradiction', async () => {
      const { committedValidation, expectSaveAllowed, expectSaveBlocked } =
        setup({
          variableType: 'number',
          entity: 'node',
          currentVariableId: 'number-var',
          allVariables: {},
          existingVariables: {},
          validation: { minValue: 5 },
        });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '2'));
      expect(committedValidation()).toEqual({ minValue: 5, maxValue: 2 });
      await expectSaveBlocked();

      fireEvent.blur(typeValue('Minimum value', '1'));

      expect(committedValidation()).toEqual({ minValue: 1, maxValue: 2 });
      expect(
        screen.queryByText(/is greater than maxValue/),
      ).not.toBeInTheDocument();
      await expectSaveAllowed();
    });

    it('clears the objection once the contradicting rule is switched off', async () => {
      const { committedValidation, expectSaveAllowed } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { required: true },
      });

      fireEvent.click(toggle('Maximum length'));
      fireEvent.blur(typeValue('Maximum length', '0'));
      expect(committedValidation()).toEqual({ required: true, maxLength: 0 });

      fireEvent.click(toggle('Required'));

      expect(committedValidation()).toEqual({ maxLength: 0 });
      await expectSaveAllowed();
    });

    // Issue #1383's sharpest edge: editing a rule that ALREADY held a valid
    // value into a contradictory one used to delete the rule outright, so the
    // save both dropped the edit and destroyed the value being edited. Now the
    // edit is held, the other rule is untouched, and the save is refused — so
    // the committed protocol keeps whatever it had.
    it('keeps both the edit and the rule it contradicts, and blocks the save', async () => {
      const { committedValidation, expectSaveAllowed, expectSaveBlocked } =
        setup({
          variableType: 'number',
          entity: 'node',
          currentVariableId: 'number-var',
          allVariables: {},
          existingVariables: {},
          validation: { minValue: 5, maxValue: 10 },
        });

      fireEvent.blur(typeValue('Minimum value', '20'));
      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 10 });
      expect(numberValue('Minimum value')).toHaveValue(20);
      expect(numberValue('Maximum value')).toHaveValue(10);
      await expectSaveBlocked();

      fireEvent.blur(typeValue('Maximum value', '30'));

      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 30 });
      expect(numberValue('Minimum value')).toHaveValue(20);
      await expectSaveAllowed();
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

    // The same Safari path, but the in-flight edit still contradicts once the
    // other row lands. It is applied anyway — a typed value that vanishes
    // leaves the researcher nothing to correct — and the save is refused
    // until the pair agrees.
    it('applies an in-flight edit that still contradicts after another row commits', async () => {
      const { committedValidation, expectSaveAllowed, expectSaveBlocked } =
        setup({
          variableType: 'number',
          entity: 'node',
          currentVariableId: 'number-var',
          allVariables: {},
          existingVariables: {},
          validation: { minValue: 5, maxValue: 10 },
        });

      typeValue('Minimum value', '20');
      fireEvent.click(stepper('Increase Maximum value'));

      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 11 });
      expect(numberValue('Minimum value')).toHaveValue(20);
      expect(
        screen.getAllByText(/minValue \(20\) is greater than maxValue \(11\)/),
      ).toHaveLength(2);
      await expectSaveBlocked();

      fireEvent.blur(typeValue('Maximum value', '30'));

      expect(committedValidation()).toEqual({ minValue: 20, maxValue: 30 });
      expect(numberValue('Minimum value')).toHaveValue(20);
      await expectSaveAllowed();
    });

    it('switches on a value-less rule that contradicts a committed bound, and blocks the save', async () => {
      const { committedValidation, expectSaveBlocked } = setup({
        variableType: 'text',
        entity: 'node',
        currentVariableId: 'text-var',
        allVariables: {},
        existingVariables: {},
        validation: { maxLength: 0 },
      });

      fireEvent.click(toggle('Required'));

      expect(
        screen.getAllByText(/required answers cannot satisfy maxLength \(0\)/),
      ).toHaveLength(2);
      expect(committedValidation()).toEqual({ maxLength: 0, required: true });
      await expectSaveBlocked();
    });

    // A refused save reports at the FIELD, so fresco-ui's own
    // `focusFirstError` scrolls the rule list into view and focuses its first
    // control. Landing on the exact offending row would need to outrun that
    // handler, which is not something this component can do deterministically
    // — so the reason is carried by the announcement instead, and focus is
    // simply inside the rule list the researcher has to fix.
    it('moves focus into the rule list after a refused save', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5 },
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '2'));
      await expectSaveBlocked();

      const ruleList = toggle('Minimum value').closest(
        '[data-field-name="validation"]',
      );
      expect(ruleList).not.toBeNull();
      expect(ruleList?.contains(document.activeElement)).toBe(true);
    });

    // Both ends of the pair carry the reason, each in its own `aria-live`
    // region and each linked to its control by `aria-describedby`, so the
    // researcher hears why wherever focus lands.
    it('announces the reason against every rule it implicates', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5 },
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '2'));
      await expectSaveBlocked();

      for (const label of ['Minimum value', 'Maximum value']) {
        const input = numberValue(label);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const describedBy = input.getAttribute('aria-describedby');
        const description = describedBy
          ? document.getElementById(describedBy)
          : null;
        expect(description).toHaveAttribute('aria-live', 'polite');
        expect(description).toHaveTextContent(/is greater than maxValue/);
      }
    });

    // Adversarial review: the "have they been told yet" state is per RULE,
    // not one flag for the whole field. A standing complaint about one rule
    // must not scold a different rule the researcher has only just switched
    // on and not yet had a chance to answer.
    it('does not scold a rule switched on after an earlier refusal', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum value'));
      fireEvent.blur(typeValue('Minimum value', ''));
      await expectSaveBlocked();
      expect(
        screen.getAllByText(/Enter a value for "Minimum value"/).length,
      ).toBeGreaterThan(0);

      fireEvent.click(toggle('Maximum value'));

      expect(
        screen.queryByText(/Enter a value for "Maximum value"/),
      ).not.toBeInTheDocument();
    });

    it('starts silent again for a rule switched off and back on', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum value'));
      fireEvent.blur(typeValue('Minimum value', ''));
      await expectSaveBlocked();
      fireEvent.click(toggle('Minimum value'));
      fireEvent.click(toggle('Minimum value'));

      expect(
        screen.queryByText(/Enter a value for "Minimum value"/),
      ).not.toBeInTheDocument();
    });

    // Every rule row lives INSIDE this field, so editing one never blurs out
    // of it and nothing else would revalidate. A standing complaint would go
    // on naming a value that is no longer on screen.
    it('withdraws a standing objection as soon as the map stops contradicting', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 10 },
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '2'));
      await expectSaveBlocked();

      fireEvent.blur(typeValue('Maximum value', '20'));

      await waitFor(() => {
        expect(
          screen.queryByText(/is greater than maxValue/),
        ).not.toBeInTheDocument();
      });
    });

    it('names an unanswered rule only once a save has objected', async () => {
      const { expectSaveBlocked } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: { minValue: 5 },
      });

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', ''));
      expect(
        screen.queryByText(/Enter a value for "Maximum value"/),
      ).not.toBeInTheDocument();

      await expectSaveBlocked();

      // Once against the row, and once through the field's own error slot.
      expect(
        screen.getAllByText(
          'Enter a value for "Maximum value", or switch the rule off.',
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('rolling the committed map back', () => {
    it('switches a rule back off when its commit is undone', () => {
      const { committedValidation, rollBackTo } = setup({
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

      rollBackTo({});

      expect(committedValidation()).toEqual({});
      expect(toggle('Maximum length')).not.toBeChecked();
      expect(
        screen.queryByRole('spinbutton', { name: 'Maximum length' }),
      ).not.toBeInTheDocument();
    });

    it('does not write a rolled-back value out again on the next commit', () => {
      const { committedValidation, rollBackTo } = setup({
        variableType: 'number',
        entity: 'node',
        currentVariableId: 'number-var',
        allVariables: {},
        existingVariables: {},
        validation: {},
      });

      fireEvent.click(toggle('Minimum value'));
      fireEvent.blur(typeValue('Minimum value', '3'));

      rollBackTo({});

      fireEvent.click(toggle('Maximum value'));
      fireEvent.blur(typeValue('Maximum value', '9'));

      expect(committedValidation()).toEqual({ maxValue: 9 });
    });
  });
});
