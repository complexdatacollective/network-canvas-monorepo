import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectArrayField from '../../ArchitectArrayField';
import type { OptionValue } from '../Option';
import Options, { completeOptions, minTwoOptions } from '../Options';

const TWO_VALID_OPTIONS: OptionValue[] = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
];

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getOptions = (): OptionValue[] => {
  if (!storeApi) throw new Error('form store was not captured');
  return (storeApi.getState().getFormValues().options ?? []) as OptionValue[];
};

const setup = (options: OptionValue[] = TWO_VALID_OPTIONS) => {
  storeApi = null;

  const view = render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ArchitectArrayField
        name="options"
        label="Options"
        component={Options}
        initialValue={options}
        validation={{ minTwoOptions, completeOptions }}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return { ...view, getOptions };
};

const finishButton = () =>
  screen.queryByRole('button', { name: 'Finish editing option' });

describe('Options', () => {
  it('opens a freshly added blank option straight into its editor', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

    await waitFor(() => expect(finishButton()).toBeInTheDocument());
    // Opening the row must not write anything back: the rich-text editor's
    // mount-time change would otherwise dirty the stage on every add.
    expect(getOptions()).toEqual([...TWO_VALID_OPTIONS, {}]);
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('keeps the editor open when finishing an option with no label or value', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
    await waitFor(() => expect(finishButton()).toBeInTheDocument());

    fireEvent.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    expect(finishButton()).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('collapses an option that has both a label and a value', async () => {
    setup([...TWO_VALID_OPTIONS, { label: 'Three', value: 3 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option 3' }));
    await waitFor(() => expect(finishButton()).toBeInTheDocument());

    fireEvent.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    await waitFor(() => expect(finishButton()).not.toBeInTheDocument());
  });

  it('shows a whitespace-only label as untitled', () => {
    setup([...TWO_VALID_OPTIONS, { label: '   ', value: 3 }]);

    expect(screen.getByText('Untitled option')).toBeInTheDocument();
  });

  it('keeps the indexed data-field-name paths E2E specs target', async () => {
    const { container } = setup([
      ...TWO_VALID_OPTIONS,
      { label: 'Three', value: 3 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option 3' }));

    await waitFor(() =>
      expect(
        container.querySelector('[data-field-name="options[2].label"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-field-name="options[2].value"]'),
    ).not.toBeNull();
  });

  it('writes an edited value back into the whole array, parsing numbers', async () => {
    setup([...TWO_VALID_OPTIONS, { label: 'Three', value: '' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option 3' }));
    const valueInput = await screen.findByRole('textbox', { name: 'Value' });
    fireEvent.change(valueInput, { target: { value: '42' } });

    await waitFor(() => {
      expect(getOptions()[2]).toEqual({ label: 'Three', value: 42 });
    });
  });

  it('reports a duplicate value against the rest of the array', async () => {
    setup([...TWO_VALID_OPTIONS, { label: 'Three', value: '' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option 3' }));
    const valueInput = await screen.findByRole('textbox', { name: 'Value' });
    fireEvent.change(valueInput, { target: { value: '1' } });

    expect(
      await screen.findByText('Values must be unique'),
    ).toBeInTheDocument();
  });

  it('surfaces the array-level rules on the array field, not the rows', async () => {
    const { container } = setup([{ label: 'Only', value: 'only' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Requires a minimum of two options. If you need fewer options, consider using a boolean variable.',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-field-name="options"]'),
    ).not.toBeNull();
  });

  it('never registers a per-row field in the parent form', async () => {
    setup();

    await waitFor(() => expect(getOptions()).toHaveLength(2));
    if (!storeApi) throw new Error('form store was not captured');
    expect([...storeApi.getState().fields.keys()]).toEqual(['options']);
  });

  it('removes an option through its confirm dialog', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));

    await waitFor(() => expect(getOptions()).toEqual([TWO_VALID_OPTIONS[0]]));
  });
});
