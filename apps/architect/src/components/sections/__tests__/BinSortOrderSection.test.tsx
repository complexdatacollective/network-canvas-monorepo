import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { OptionGetter } from '~/components/Form/arrayFields/MultiSelect';

import BinSortOrderSection from '../BinSortOrderSection';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getFieldValue = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi.getState().getFieldState('binSortOrder')?.value;
};

const getterSpy: OptionGetter = () => [
  { value: 'name', label: 'Name' },
  { value: 'id', label: 'ID' },
];

describe('BinSortOrderSection', () => {
  it('starts collapsed when the caller has no initial value (a new dialog row)', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <BinSortOrderSection optionGetter={getterSpy} />
      </Form>,
    );

    // `layout="vertical"` renders no collapsed placeholder — the mounted
    // MultiSelect's own "Add new" affordance is the observable signal that
    // the row field is (not) registered.
    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();
    expect(getFieldValue()).toBeUndefined();
  });

  it('starts expanded and registers the row value when the caller supplies one', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <BinSortOrderSection
          optionGetter={getterSpy}
          initialValue={[{ property: 'name', direction: 'asc' }]}
        />
      </Form>,
    );

    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
    expect(getFieldValue()).toEqual([{ property: 'name', direction: 'asc' }]);
  });

  it('clears binSortOrder on the nearest form store when toggled off', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <BinSortOrderSection
          optionGetter={getterSpy}
          initialValue={[{ property: 'name', direction: 'asc' }]}
        />
      </Form>,
    );

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Add new' }),
      ).not.toBeInTheDocument();
    });
    expect(getFieldValue()).toBeUndefined();
  });
});
