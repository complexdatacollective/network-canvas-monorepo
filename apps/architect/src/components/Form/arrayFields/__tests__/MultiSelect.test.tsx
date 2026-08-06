import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectArrayField from '../../ArchitectArrayField';
import MultiSelect, {
  type ItemValue,
  type OptionGetter,
  type PropertyField,
} from '../MultiSelect';

const NO_ITEMS: ItemValue[] = [];

const DEFAULT_PROPERTIES: PropertyField[] = [
  { fieldName: 'first' },
  { fieldName: 'second' },
];

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
}: {
  initialItems?: ItemValue[];
  properties?: PropertyField[];
  options?: OptionGetter;
  maxItems?: number | null;
} = {}) => {
  storeApi = null;

  render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ArchitectArrayField
        name="items"
        label="Items"
        component={MultiSelect}
        initialValue={initialItems}
        properties={properties}
        options={options}
        maxItems={maxItems}
      />
    </Form>,
  );

  return { getItems, options };
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

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

    await waitFor(() => expect(getItems()).toEqual([{}]));
    expect(
      screen.queryByRole('button', { name: 'Add new' }),
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
});
