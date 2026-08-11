import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type * as SelectorsIndexes from '~/selectors/indexes';

import ArchitectArrayField from '../../ArchitectArrayField';

const codebook = vi.hoisted(() => ({
  variables: {
    close: { name: 'Close', type: 'boolean' },
    nearby: { name: 'Nearby', type: 'boolean' },
    age: { name: 'Age', type: 'number' },
  } as Record<string, unknown>,
}));

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubject: () => codebook.variables,
  getVariablesForSubjectSelector: () => codebook.variables,
  EMPTY_VARIABLES: {},
}));

// The cross-class gate reads the role map. `roleMap.map` is what a SAVED form
// outside this stage would have put there; tests that only care about the
// array behaviour leave it empty.
const roleMap = vi.hoisted(() => ({
  map: {} as Record<string, { validated: number; unvalidated: number }>,
}));

vi.mock('~/selectors/indexes', async (importOriginal) => {
  const actual = await importOriginal<typeof SelectorsIndexes>();
  return { ...actual, getVariableRoleMapOutsideStage: () => roleMap.map };
});

// The spotlight picker is a whole search UI; the row only needs a control that
// reports its value and can set one. `picker.emits` is what the control hands
// back on click — settable per test, and deliberately not bound to `options`,
// which is how a stale pool reaches the row in the first place (the case the
// save-time gate exists to backstop).
const picker = vi.hoisted(() => ({ emits: 'picked' }));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    options?: { value: string; disabled?: boolean }[];
  }) => (
    <button
      type="button"
      data-selected={value ?? ''}
      data-options={(options ?? [])
        .map(({ value: id, disabled }) => `${id}${disabled ? ':disabled' : ''}`)
        .join(',')}
      onClick={() => onChange?.(picker.emits)}
    >
      Select variable
    </button>
  ),
  default: () => null,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
} from '~/components/Validations/contradictions';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { roleMapKey } from '~/selectors/indexes';

import AssignAttributes, {
  committedAttributeVariableIds,
  completeAttributes,
  getAssignableVariableOptions,
  makeAssignAttributesValidation,
  type AttributeValue,
  type VariableOption,
} from '../AssignAttributes';

const NO_ATTRIBUTES: AttributeValue[] = [];

const VARIABLE_OPTIONS: VariableOption[] = [
  { label: 'Close', value: 'close', type: 'boolean' },
  { label: 'Nearby', value: 'nearby', type: 'boolean' },
  { label: 'Age', value: 'age', type: 'number' },
];

const NO_DRAFT_VARIABLES: ReadonlySet<string> = new Set();
const NO_COMMITTED_VARIABLES: ReadonlySet<string> = new Set();

const SUBJECT = { entity: 'node' as const, type: 'person' };

/** A SAVED form on another stage collecting `variableId`. */
const validatedElsewhere = (variableId: string) => {
  roleMap.map[roleMapKey(SUBJECT, variableId)] = {
    validated: 1,
    unvalidated: 0,
  };
};

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getAttributes = (): AttributeValue[] => {
  if (!storeApi) throw new Error('form store was not captured');
  return (storeApi.getState().getFormValues().additionalAttributes ??
    []) as AttributeValue[];
};

/**
 * Mirrors `PromptFields`' wiring: the row context and the array field's
 * validation object are handed the SAME committed-pick set and the same role
 * map, so the layer that DISPLAYS an error and the layer that BLOCKS the save
 * can never disagree about it.
 */
const setup = (
  initialAttributes: AttributeValue[] = NO_ATTRIBUTES,
  {
    committedVariableIds = NO_COMMITTED_VARIABLES,
    draftValidatedVariables = NO_DRAFT_VARIABLES,
  }: {
    committedVariableIds?: ReadonlySet<string>;
    draftValidatedVariables?: ReadonlySet<string>;
  } = {},
) => {
  storeApi = null;
  const store = configureStore({ reducer: (state = {}) => state });
  const onSubmit = vi.fn(() => ({ success: true }));

  const view = render(
    <Provider store={store}>
      <Form onSubmit={onSubmit}>
        <CaptureStore />
        <ArchitectArrayField
          name="additionalAttributes"
          label="Additional attributes"
          component={AssignAttributes}
          initialValue={initialAttributes}
          entity="node"
          type="person"
          variableOptions={VARIABLE_OPTIONS}
          draftValidatedVariables={draftValidatedVariables}
          committedVariableIds={committedVariableIds}
          // Mirrors the call site: the rows' own rules are display-only, so
          // completeness AND the cross-class gate live on the array field.
          validation={makeAssignAttributesValidation({
            allVariables: codebook.variables,
            committedVariableIds,
            draftValidatedVariables,
            hasValidatedUseElsewhere: (variableId) =>
              (roleMap.map[roleMapKey(SUBJECT, variableId)]?.validated ?? 0) >
              0,
          })}
        />
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );

  return { ...view, getAttributes, onSubmit };
};

const INCOMPLETE_MESSAGE =
  'Every additional variable needs both a variable and a value.';

beforeEach(() => {
  roleMap.map = {};
  picker.emits = 'picked';
});

describe('getAssignableVariableOptions', () => {
  it('keeps only boolean variables and disables the ones already used', () => {
    expect(getAssignableVariableOptions(VARIABLE_OPTIONS, ['close'])).toEqual([
      { label: 'Close', value: 'close', type: 'boolean', disabled: true },
      { label: 'Nearby', value: 'nearby', type: 'boolean', disabled: false },
    ]);
  });
});

describe('AssignAttributes', () => {
  it('adds a blank row immediately', async () => {
    setup();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add new variable to assign' }),
    );

    await waitFor(() => expect(getAttributes()).toEqual([{}]));
  });

  it('reveals the value control only once a variable is picked', async () => {
    setup();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add new variable to assign' }),
    );
    await waitFor(() => expect(getAttributes()).toHaveLength(1));
    expect(screen.queryByLabelText('Value to assign')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Value to assign')).toBeInTheDocument(),
    );
    expect(getAttributes()).toEqual([{ variable: 'picked' }]);
  });

  it('disables a variable another row already claims', async () => {
    setup([{ variable: 'close', value: true }, {}]);

    await waitFor(() => expect(getAttributes()).toHaveLength(2));
    const pickers = screen.getAllByRole('button', { name: 'Select variable' });
    expect(pickers[0]).toHaveAttribute('data-options', 'close:disabled,nearby');
  });

  it('keeps the indexed data-field-name paths E2E specs target', async () => {
    const { container } = setup([{ variable: 'close', value: true }]);

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-field-name="additionalAttributes[0].variable"]',
        ),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector(
        '[data-field-name="additionalAttributes[0].value"]',
      ),
    ).not.toBeNull();
  });

  it('deletes a row without a confirmation step', async () => {
    setup([{ variable: 'close', value: true }]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete attribute' }));

    await waitFor(() => expect(getAttributes()).toEqual([]));
  });

  it('never registers a per-row field in the parent form', async () => {
    setup([{ variable: 'close', value: true }]);

    await waitFor(() => expect(getAttributes()).toHaveLength(1));
    if (!storeApi) throw new Error('form store was not captured');
    expect([...storeApi.getState().fields.keys()]).toEqual([
      'additionalAttributes',
    ]);
  });
});

/**
 * A stamp the interview cannot apply — no variable, or a variable with no
 * boolean — is rejected by the protocol schema, but the rows' `required` rules
 * are display-only, so nothing stopped a half-finished row reaching the saved
 * protocol. The damage surfaced far from the cause: a permanently disabled
 * Preview button, and an export that failed validation on import.
 */
describe('completeAttributes', () => {
  it('accepts an empty list', () => {
    // `additionalAttributes` is optional and most prompts assign nothing.
    expect(completeAttributes([])).toBeUndefined();
    expect(completeAttributes(undefined)).toBeUndefined();
  });

  it('accepts a row that stamps False', () => {
    // `false` is an answer, not an absent value.
    expect(
      completeAttributes([{ variable: 'close', value: false }]),
    ).toBeUndefined();
  });

  it.each([
    ['a row with nothing in it', [{}]],
    ['a row with no value chosen', [{ variable: 'close' }]],
    ['a row whose variable was cleared', [{ variable: null, value: true }]],
    ['a row with an empty variable id', [{ variable: '', value: true }]],
    [
      'one incomplete row among complete ones',
      [{ variable: 'close', value: true }, {}],
    ],
  ])('rejects %s', (_label, rows) => {
    expect(completeAttributes(rows)).toBe(INCOMPLETE_MESSAGE);
  });
});

describe('AssignAttributes completeness gate', () => {
  const addRow = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Add new variable to assign' }),
    );

  const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('refuses to save a row that was added and never finished', async () => {
    const { onSubmit } = setup();

    addRow();
    await waitFor(() => expect(getAttributes()).toEqual([{}]));
    save();

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to save a row whose value was never chosen', async () => {
    const { onSubmit } = setup([{ variable: 'close' }]);

    save();

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says nothing about a prompt that assigns no variables', async () => {
    const { onSubmit } = setup();

    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull();
  });

  it('saves a row that stamps False', async () => {
    const { onSubmit } = setup([{ variable: 'close', value: false }]);

    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull();
  });

  // The rows are always open, so the refused save is the only moment that can
  // point at the offending one — but not before, or a row the researcher has
  // only just added would greet them with "Required".
  it('leaves a freshly added row unmarked until the save is refused', async () => {
    setup();

    addRow();
    await waitFor(() => expect(getAttributes()).toEqual([{}]));
    expect(screen.queryByText('Required')).toBeNull();

    save();

    expect(await screen.findByText('Required')).toBeInTheDocument();
  });
});

/**
 * Row positions renumber the moment a row is deleted, while the committed
 * value stays frozen at the position it was saved in — so a row's escape can
 * only ever be asked as a membership question.
 */
describe('committedAttributeVariableIds', () => {
  it('collects every row’s saved pick, whatever position it was saved in', () => {
    expect(
      committedAttributeVariableIds([
        { variable: 'close', value: true },
        { variable: 'nearby', value: false },
      ]),
    ).toEqual(new Set(['close', 'nearby']));
  });

  it('is empty for a prompt that assigns nothing', () => {
    expect(committedAttributeVariableIds([])).toEqual(new Set());
    expect(committedAttributeVariableIds(undefined)).toEqual(new Set());
  });

  it('ignores rows with no variable', () => {
    expect(
      committedAttributeVariableIds([
        {},
        { variable: null, value: true },
        { variable: '', value: true },
        { variable: 'close', value: true },
      ]),
    ).toEqual(new Set(['close']));
  });
});

/**
 * The BLOCKING half of the cross-class gate. A `RowField` error is
 * display-only, so before this rule existed the researcher read an explicit
 * "cannot be written by this stage" error, clicked Save, and the contradiction
 * went into the protocol anyway — the interview then stamps unvalidated
 * booleans onto a form-validated variable.
 */
describe('makeAssignAttributesValidation: crossClassPicks', () => {
  const crossClassPicks = (
    value: unknown,
    {
      committed = [] as string[],
      draftValidated = [] as string[],
      conflicting = [] as string[],
    } = {},
  ) =>
    makeAssignAttributesValidation({
      allVariables: codebook.variables,
      committedVariableIds: new Set(committed),
      draftValidatedVariables: new Set(draftValidated),
      hasValidatedUseElsewhere: (variableId) =>
        conflicting.includes(variableId),
    }).crossClassPicks(value);

  it.each([
    ['an absent list', undefined],
    ['a null list', null],
    ['an empty list', []],
    ['a row with no variable yet', [{}]],
  ])('says nothing about %s', (_label, value) => {
    // `additionalAttributes` is optional and most prompts assign nothing.
    expect(crossClassPicks(value, { conflicting: ['close'] })).toBeUndefined();
  });

  it('leaves a False stamp alone', () => {
    // `false` is an answer, and this rule only ever reads `variable`.
    expect(
      crossClassPicks([{ variable: 'close', value: false }]),
    ).toBeUndefined();
  });

  it('refuses a pick a form elsewhere already collects', () => {
    expect(
      crossClassPicks([{ variable: 'nearby', value: true }], {
        conflicting: ['nearby'],
      }),
    ).toBe(validatedElsewhereMessage('Nearby'));
  });

  it('refuses a pick this stage’s draft form already collects', () => {
    expect(
      crossClassPicks([{ variable: 'nearby', value: true }], {
        draftValidated: ['nearby'],
      }),
    ).toBe(draftValidatedElsewhereMessage('Nearby'));
  });

  it('finds the offending row wherever it sits in the list', () => {
    expect(
      crossClassPicks(
        [
          { variable: 'close', value: true },
          { variable: 'nearby', value: true },
        ],
        { conflicting: ['nearby'] },
      ),
    ).toBe(validatedElsewhereMessage('Nearby'));
  });

  /**
   * The escape, and the reason it is membership rather than position: a
   * contradiction the prompt already carries (an imported protocol, a stale
   * draft) must never block an edit that did not introduce it — including an
   * edit that only deleted a sibling row and renumbered this one.
   */
  it('lets a committed pick through however the rows have been renumbered', () => {
    expect(
      crossClassPicks([{ variable: 'nearby', value: true }], {
        committed: ['close', 'nearby'],
        conflicting: ['nearby'],
      }),
    ).toBeUndefined();
    expect(
      crossClassPicks([{ variable: 'nearby', value: true }], {
        committed: ['close', 'nearby'],
        draftValidated: ['nearby'],
      }),
    ).toBeUndefined();
  });

  it('still refuses a conflicting pick this prompt never saved', () => {
    expect(
      crossClassPicks(
        [
          { variable: 'close', value: true },
          { variable: 'nearby', value: true },
        ],
        { committed: ['close'], conflicting: ['nearby'] },
      ),
    ).toBe(validatedElsewhereMessage('Nearby'));
  });
});

describe('AssignAttributes cross-class gate', () => {
  const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('refuses the save the row is already showing an error for', async () => {
    validatedElsewhere('nearby');
    const { onSubmit } = setup([{ variable: 'nearby', value: true }]);

    save();

    // The array field's refusal and the row's own error are the same
    // sentence, because they are the same function.
    const errors = await screen.findAllByText(
      validatedElsewhereMessage('Nearby'),
    );
    expect(errors.length).toBeGreaterThan(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves a contradiction this prompt already carried', async () => {
    validatedElsewhere('nearby');
    const { onSubmit } = setup([{ variable: 'nearby', value: true }], {
      committedVariableIds: new Set(['nearby']),
    });

    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText(validatedElsewhereMessage('Nearby'))).toBeNull();
  });

  it('refuses a fresh pick of a variable a form elsewhere collects', async () => {
    validatedElsewhere('nearby');
    picker.emits = 'nearby';
    const { onSubmit } = setup([{ variable: 'close', value: true }], {
      committedVariableIds: new Set(['close']),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
    await waitFor(() =>
      expect(getAttributes()).toEqual([{ variable: 'nearby', value: true }]),
    );
    save();

    expect(
      await screen.findAllByText(validatedElsewhereMessage('Nearby')),
    ).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
