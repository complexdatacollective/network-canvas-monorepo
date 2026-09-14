import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import Form from '../Form';
import { FormStoreContext } from '../store/formStoreProvider';
import IconPicker from './IconPicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;

const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

function renderPicker(initialValue: string) {
  storeApi = null;
  return render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <Field
        name="icon"
        label="Node icon"
        component={IconPicker}
        initialValue={initialValue}
      />
    </Form>,
  );
}

const search = (query: string) =>
  fireEvent.change(screen.getByPlaceholderText('Search icons…'), {
    target: { value: query },
  });

describe('IconPicker', () => {
  it('uses shared field semantics and persists a searchable selection', async () => {
    renderPicker('Circle');

    const trigger = screen.getByRole('combobox', { name: 'Node icon' });
    expect(trigger).toHaveTextContent('Circle');

    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Circle' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    search('add-a-person');
    fireEvent.click(screen.getByRole('option', { name: /add-a-person/ }));

    await waitFor(() => {
      expect(storeApi?.getState().getFormValues().icon).toBe('add-a-person');
    });
  });

  /**
   * The picker used to carry a two-name list of Network Canvas icons, so a
   * type legally holding any of the others opened onto the placeholder and
   * the researcher could not choose that icon again.
   */
  it('offers every Network Canvas icon, not just the two an add button uses', () => {
    renderPicker('add-a-relationship');

    const trigger = screen.getByRole('combobox', { name: 'Node icon' });
    expect(trigger).toHaveTextContent('add-a-relationship');

    fireEvent.click(trigger);
    search('menu-sociogram');
    expect(
      screen.getByRole('option', { name: /menu-sociogram/ }),
    ).toBeInTheDocument();
  });

  /**
   * The two icon sets are named by different conventions, and a researcher
   * types the words either way round.
   */
  it('matches a name across the hyphen and camel case conventions', () => {
    renderPicker('');

    fireEvent.click(screen.getByRole('combobox', { name: 'Node icon' }));

    search('user plus');
    expect(
      screen.getByRole('option', { name: /UserPlus/ }),
    ).toBeInTheDocument();

    search('addaperson');
    expect(
      screen.getByRole('option', { name: /add-a-person/ }),
    ).toBeInTheDocument();
  });

  it('says how many icons it is showing of how many match', () => {
    renderPicker('');

    fireEvent.click(screen.getByRole('combobox', { name: 'Node icon' }));

    search('a');
    expect(screen.getByText(/Showing 200 of [\d,]+ icons/)).toBeInTheDocument();

    search('menu-sociogram');
    expect(screen.queryByText(/Showing [\d,]+ of/)).not.toBeInTheDocument();
  });

  it('shows nothing to choose when the search matches no icon', () => {
    renderPicker('');

    fireEvent.click(screen.getByRole('combobox', { name: 'Node icon' }));
    search('not-a-rendered-icon');

    expect(screen.getByText('No icons found')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
