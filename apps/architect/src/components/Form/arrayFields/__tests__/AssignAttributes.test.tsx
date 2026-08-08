import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type * as SelectorsIndexes from '~/selectors/indexes';

import ArchitectArrayField from '../../ArchitectArrayField';

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubject: () => ({}),
  getVariablesForSubjectSelector: () => ({}),
  EMPTY_VARIABLES: {},
}));

// The cross-class gate reads the role map; a conflict-free stub keeps this
// file focused on the array behaviour (the gate itself is pinned in
// contradictions.test.ts).
vi.mock('~/selectors/indexes', async (importOriginal) => {
  const actual = await importOriginal<typeof SelectorsIndexes>();
  return { ...actual, getVariableRoleMapOutsideStage: () => ({}) };
});

// The spotlight picker is a whole search UI; the row only needs a control that
// reports its value and can set one.
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
      onClick={() => onChange?.('picked')}
    >
      Select variable
    </button>
  ),
  default: () => null,
}));

import AssignAttributes, {
  assignAttributesValidation,
  completeAttributes,
  getAssignableVariableOptions,
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

const setup = (initialAttributes: AttributeValue[] = NO_ATTRIBUTES) => {
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
          draftValidatedVariables={NO_DRAFT_VARIABLES}
          // Mirrors the call site: the rows' `required` rules are display-only,
          // so completeness lives on the array field.
          validation={assignAttributesValidation}
        />
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );

  return { ...view, getAttributes, onSubmit };
};

const INCOMPLETE_MESSAGE =
  'Every additional variable needs both a variable and a value.';

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
