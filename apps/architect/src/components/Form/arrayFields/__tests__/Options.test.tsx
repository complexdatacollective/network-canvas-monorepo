import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectArrayField from '../../ArchitectArrayField';
import type { OptionValue } from '../Option';
import Options, { optionsValidation } from '../Options';

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

// A row is genuinely incomplete while it is being filled in — "Add new"
// commits `{}` — so the seed accepts partial options. `OptionValue` describes
// a FINISHED option, which is what the array is required to hold by the time
// it reaches a save; that gap is exactly what `optionsValidation` enforces.
const setup = (options: Partial<OptionValue>[] = TWO_VALID_OPTIONS) => {
  storeApi = null;
  // The whole bundle, as every call site passes it (see Options.tsx) — a
  // subset would let a rule these tests rely on go missing unnoticed.
  const onSubmit = vi.fn(() => ({ success: true as const }));

  const view = render(
    <Form onSubmit={onSubmit}>
      <CaptureStore />
      <ArchitectArrayField
        name="options"
        label="Options"
        component={Options}
        // The field's prop type describes finished options; seeding a
        // half-filled row is the point of several cases below.
        initialValue={options as OptionValue[]}
        validation={optionsValidation}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return { ...view, getOptions, onSubmit };
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

  // The row shows the same message, but it is display-only (see RowField), and
  // collapsing the row hides it while keeping the value — so the researcher
  // could ship an option value that Architect had already called invalid.
  it('refuses to submit an option value that is not an NMTOKEN', async () => {
    const { onSubmit } = setup([...TWO_VALID_OPTIONS, { label: 'Three' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option 3' }));
    const valueInput = await screen.findByRole('textbox', { name: 'Value' });
    fireEvent.change(valueInput, { target: { value: 'has space' } });
    await waitFor(() => expect(getOptions()[2]).toHaveProperty('value'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findAllByText(
        'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
      ),
    ).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps refusing after the row is collapsed and its message hidden', async () => {
    const { onSubmit } = setup([
      ...TWO_VALID_OPTIONS,
      { label: 'Three', value: 'has space' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits option values made of letters, numbers and ._-:', async () => {
    const { onSubmit } = setup([
      { label: 'One', value: 'a_valid-value.1' },
      { label: 'Two', value: 2 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('removes an option through its confirm dialog', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));

    await waitFor(() => expect(getOptions()).toEqual([TWO_VALID_OPTIONS[0]]));
  });
});
