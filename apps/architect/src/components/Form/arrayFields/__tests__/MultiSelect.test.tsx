import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectArrayField from '../../ArchitectArrayField';
import type { ArchitectValidation } from '../../toZodValidation';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type OptionGetter,
  type PropertyField,
} from '../MultiSelect';

const NO_ITEMS: ItemValue[] = [];

const DEFAULT_PROPERTIES: PropertyField[] = [
  { fieldName: 'first' },
  { fieldName: 'second' },
];

const DEFAULT_VALIDATION: ArchitectValidation = {
  completeRows: completeRows(DEFAULT_PROPERTIES),
};

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getItems = (): ItemValue[] => {
  if (!storeApi) throw new Error('form store was not captured');
  return (storeApi.getState().getFormValues().items ?? []) as ItemValue[];
};

const setup = ({
  initialItems = NO_ITEMS,
  properties = DEFAULT_PROPERTIES,
  options = vi.fn(() => []) as OptionGetter,
  maxItems,
  validation = DEFAULT_VALIDATION,
  onSubmit = vi.fn(() => ({ success: true as const })),
}: {
  initialItems?: ItemValue[];
  properties?: PropertyField[];
  options?: OptionGetter;
  maxItems?: number | null;
  validation?: ArchitectValidation;
  onSubmit?: () => { success: true };
} = {}) => {
  storeApi = null;

  render(
    <Form onSubmit={onSubmit}>
      <CaptureStore />
      <ArchitectArrayField
        name="items"
        label="Items"
        component={MultiSelect}
        addButtonLabel="Add new item"
        initialValue={initialItems}
        properties={properties}
        options={options}
        maxItems={maxItems}
        validation={validation}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return { getItems, options, onSubmit };
};

describe('MultiSelect', () => {
  it('calculates options from row and array values and resets dependent properties', async () => {
    const initialItems = [{ first: 'a', second: 'b' }];
    const options = vi.fn(() => [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]) as unknown as OptionGetter;
    setup({ initialItems, options });

    expect(options).toHaveBeenCalledWith(
      'first',
      initialItems[0],
      initialItems,
    );
    expect(options).toHaveBeenCalledWith(
      'second',
      initialItems[0],
      initialItems,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'First' }), {
      target: { value: 'b' },
    });

    await waitFor(() => {
      expect(getItems()).toEqual([{ first: 'b', second: null }]);
    });
  });

  it('uses semantic labels and an input control for free-text properties', () => {
    setup({
      initialItems: [{ first: 'a', label: 'Visible label' }],
      properties: [
        { fieldName: 'first' },
        { fieldName: 'label', control: 'input', label: 'Label' },
      ],
    });

    expect(screen.getByRole('combobox', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue(
      'Visible label',
    );
  });

  it('keeps the indexed data-field-name paths E2E specs target', () => {
    const { container } = render(
      <Form onSubmit={() => ({ success: true })}>
        <ArchitectArrayField
          name="sortOptions.sortOrder"
          label="Sort order"
          component={MultiSelect}
          addButtonLabel="Add new item"
          initialValue={[{ property: 'name', direction: 'asc' }]}
          properties={DEFAULT_PROPERTIES}
          options={(() => []) as OptionGetter}
        />
      </Form>,
    );

    expect(
      container.querySelector(
        '[data-field-name="sortOptions.sortOrder[0].first"]',
      ),
    ).not.toBeNull();
  });

  it('reorders the array with the keyboard drag handle', async () => {
    setup({
      initialItems: [
        { first: 'a', second: '1' },
        { first: 'b', second: '2' },
      ],
    });

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 1 of 2' }),
      { key: 'ArrowDown' },
    );

    await waitFor(() => {
      expect(getItems()).toEqual([
        { first: 'b', second: '2' },
        { first: 'a', second: '1' },
      ]);
    });
  });

  it('adds immediately and enforces maxItems', async () => {
    setup({ maxItems: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Add new item' }));

    await waitFor(() => expect(getItems()).toEqual([{}]));
    expect(
      screen.queryByRole('button', { name: 'Add new item' }),
    ).not.toBeInTheDocument();
  });

  it('removes a row through its confirm dialog', async () => {
    setup({ initialItems: [{ first: 'a', second: 'b' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }));

    await waitFor(() => expect(getItems()).toEqual([]));
  });

  it('never registers a per-row field in the parent form', async () => {
    setup({ initialItems: [{ first: 'a', second: 'b' }] });

    await waitFor(() => expect(getItems()).toHaveLength(1));
    if (!storeApi) throw new Error('form store was not captured');
    expect([...storeApi.getState().fields.keys()]).toEqual(['items']);
  });

  // The rows' own `required` errors are display-only (see RowField), so this
  // array-level rule is the only thing that can refuse a half-finished row —
  // which would otherwise reach the protocol as e.g. `{ property: 'name' }`
  // and fail whole-protocol validation from a modal that names no field.
  it('refuses to submit a half-finished row', async () => {
    const options = (() => [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]) as OptionGetter;
    const { onSubmit } = setup({ options });

    fireEvent.click(screen.getByRole('button', { name: 'Add new item' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'First' }), {
      target: { value: 'a' },
    });
    await waitFor(() =>
      expect(getItems()).toEqual([{ first: 'a', second: null }]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Every row needs a value in each column.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a fully filled row', async () => {
    const { onSubmit } = setup({ initialItems: [{ first: 'a', second: 'b' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      screen.queryByText('Every row needs a value in each column.'),
    ).not.toBeInTheDocument();
  });

  describe('completeRows', () => {
    const validate = completeRows(DEFAULT_PROPERTIES);

    it('accepts the unconfigured states a toggleable section sits in', () => {
      // These sections unregister the field when collapsed and register an
      // empty array when expanded but unused; erroring here would put
      // "Finished Editing" out of reach for a stage that never sorts.
      expect(validate(undefined)).toBeUndefined();
      expect(validate(null)).toBeUndefined();
      expect(validate([])).toBeUndefined();
    });

    it('accepts a row with a value in every column', () => {
      expect(
        validate([
          { first: 'a', second: 'b' },
          { first: 'c', second: 0 },
        ]),
      ).toBeUndefined();
    });

    it('rejects a row that is missing any column', () => {
      // MultiSelect nulls the later columns when an earlier one changes, so a
      // half-finished row reads `{ first: 'a', second: null }` — and `prune`
      // strips the null rather than the row.
      expect(validate([{ first: 'a', second: null }])).toMatch(/each column/i);
      expect(validate([{ first: 'a' }])).toMatch(/each column/i);
      expect(validate([{ second: 'b' }])).toMatch(/each column/i);
      expect(validate([{}])).toMatch(/each column/i);
      expect(validate([{ first: 'a', second: 'b' }, { first: 'c' }])).toMatch(
        /each column/i,
      );
    });

    it('treats a blank free-text column as missing, as its own cell does', () => {
      // fresco-ui's `required` — the rule the cell displays — trims, so the
      // array has to as well or the two disagree about the same row.
      expect(validate([{ first: 'a', second: '' }])).toMatch(/each column/i);
      expect(validate([{ first: 'a', second: '   ' }])).toMatch(/each column/i);
    });

    it('only inspects the declared columns', () => {
      // Rows carry no keys beyond their properties, but a stale key from an
      // earlier configuration must not be able to fail a complete row.
      expect(
        validate([{ first: 'a', second: 'b', legacy: null }]),
      ).toBeUndefined();
    });
  });
});
