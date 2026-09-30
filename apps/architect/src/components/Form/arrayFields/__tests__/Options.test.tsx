import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';

import ArchitectArrayField from '../../ArchitectArrayField';
import type { OptionValue } from '../Option';
import Options, { minimumOptionsMessage, optionsValidation } from '../Options';

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

// A row is genuinely incomplete while it is being filled in — "Create new option"
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
        addButtonLabel="Create new option"
        // The field's prop type describes finished options; seeding a
        // half-filled row is the point of several cases below.
        initialValue={options as OptionValue[]}
        validation={optionsValidation()}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return { ...view, getOptions, onSubmit };
};

const finishButton = () =>
  screen.queryByRole('button', { name: 'Finish editing option' });

const MINIMUM_OPTIONS_MESSAGE = createAppIntl({ locale: 'en' }).formatMessage(
  minimumOptionsMessage,
);
describe('Options', () => {
  it('presents the option list as required', () => {
    setup();

    const options = screen.getByRole('list', { name: 'Options' });
    // `role="list"` does not support `aria-required` — axe reports it as a
    // critical `aria-allowed-attr` failure — so the list must NOT carry it.
    // The requirement reaches assistive technology through the visually hidden
    // "Required" marker the field names in `aria-describedby` instead.
    expect(options).not.toHaveAttribute('aria-required');
    expect(options).toHaveAccessibleDescription(/Required/);
  });

  it('rejects an empty option list once with the existing minimum copy', async () => {
    const { onSubmit } = setup([]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findAllByText(MINIMUM_OPTIONS_MESSAGE)).toHaveLength(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('opens a freshly added blank option straight into its editor', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new option' }));

    await waitFor(() => expect(finishButton()).toBeInTheDocument());
    // Opening the row must not write anything back: the rich-text editor's
    // mount-time change would otherwise dirty the stage on every add.
    expect(getOptions()).toEqual([...TWO_VALID_OPTIONS, {}]);
    expect(screen.queryByTestId(/-field-error$/)).not.toBeInTheDocument();
  });

  it('keeps the editor open when finishing an option with no label or value', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new option' }));
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
      await screen.findByText(
        'This value is already in use. Enter a different value.',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces the array-level rules on the array field, not the rows', async () => {
    const { container } = setup([{ label: 'Only', value: 'only' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Requires a minimum of two options. If you need fewer options, consider using a boolean attribute.',
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

/**
 * The words on one answer, which the interview renders as markdown wherever it
 * shows them — so they are authored as markdown here, through the one field
 * every surface in the builder authors an option label with
 * (`@codaco/protocol-builder`'s `OptionLabelField`).
 */
describe('an option label', () => {
  /** Punctuation chosen so that markdown would READ every character of it. */
  const PUNCTUATION = '# 5 * a day `tick` and _ this';
  /**
   * The same characters in the form markdown actually READS — a pair around a
   * word — and a hyphen mid-word.
   *
   * Space-flanked, as they are above, `*` and `_` are literal to CommonMark
   * whether they are escaped or not, so a fixture of those alone leaves the
   * escaping unasserted. The pair cannot be typed in (the input rule turns it
   * into the emphasis the researcher asked for) or pasted (a paste is read as
   * markdown), so this stands for a label that arrived from somewhere else,
   * and what is at stake is the round trip an edit puts it through.
   */
  const PAIRED_SOURCE = '\\*stars\\* and \\_lines\\_ and 18-24';
  const EMPHASISED = '**Very** close';
  const DECOMPOSED = 'Tre\u0301s proche';
  const COMPOSED = 'Tr\u00e9s proche';

  const openRow = async (position: number) => {
    fireEvent.click(
      screen.getByRole('button', { name: `Edit option ${position}` }),
    );
    return await screen.findByRole('textbox', { name: 'Label' });
  };

  const labelOf = (position: number): unknown =>
    (getOptions()[position] as Record<string, unknown> | undefined)?.label;

  it('offers bold and italic, and nothing a single line cannot hold', async () => {
    const { container } = setup();

    await openRow(1);
    const cell = within(
      container.querySelector<HTMLElement>(
        '[data-field-name="options[0].label"]',
      )!,
    );

    expect(cell.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(cell.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(cell.queryByRole('button', { name: 'Heading 1' })).toBeNull();
    expect(cell.queryByRole('button', { name: 'Bullet list' })).toBeNull();
    expect(cell.queryByRole('button', { name: 'Numbered list' })).toBeNull();
    expect(cell.queryByRole('button', { name: 'Thematic break' })).toBeNull();
    expect(cell.queryByRole('button', { name: 'Add link' })).toBeNull();
    expect(cell.getByRole('textbox')).toHaveAttribute(
      'aria-multiline',
      'false',
    );
  });

  it('leaves punctuation the researcher typed as punctuation', async () => {
    const user = userEvent.setup();
    setup();

    const box = await openRow(1);
    await user.clear(box);
    await user.type(box, PUNCTUATION);

    // Read as the interview reads it — `RenderMarkdown`'s own label dialect —
    // rather than as bytes, so a label that lost a character on the way
    // through markdown fails here.
    await waitFor(() =>
      expect(getMarkdownLabelText(String(labelOf(0)))).toBe(PUNCTUATION),
    );
  });

  it('carries a markdown pair, and a hyphen, through an edit unchanged', async () => {
    const user = userEvent.setup();
    setup([
      { label: PAIRED_SOURCE, value: 'starred' },
      { label: 'Distant', value: 'distant' },
    ]);

    const box = await openRow(1);
    // The characters, not emphasis.
    expect(box).toHaveTextContent('*stars* and _lines_ and 18-24');

    await user.click(box);
    await user.type(box, '65+');

    await waitFor(() => expect(String(labelOf(0))).toContain('65+'));
    const stored = String(labelOf(0));
    // The escape that holds the pair apart from emphasis nobody asked for
    // survives the round trip; the hyphen markdown reads as nothing is stored
    // as itself, rather than as `18\\-24` for every read-only list to show.
    expect(stored).toContain('\\*stars\\*');
    expect(stored).toContain('\\_lines\\_');
    expect(stored).toContain('18-24');
    expect(stored).not.toContain('18\\-24');
  });

  it('stores a label in canonical form however it was typed', async () => {
    const user = userEvent.setup();
    setup();

    const box = await openRow(1);
    await user.clear(box);
    await user.type(box, DECOMPOSED);

    await waitFor(() => expect(labelOf(0)).toBe(COMPOSED));
    expect(labelOf(0)).not.toBe(DECOMPOSED);
  });

  it('keeps an authored label when a row is only opened and closed', async () => {
    setup([
      { label: EMPHASISED, value: 'very' },
      { label: 'Distant', value: 'distant' },
    ]);

    const box = await openRow(1);
    // Shown as the participant will read it, not as its source.
    expect(box).toHaveTextContent('Very close');
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    await waitFor(() => expect(finishButton()).not.toBeInTheDocument());
    expect(getOptions()).toEqual([
      { label: EMPHASISED, value: 'very' },
      { label: 'Distant', value: 'distant' },
    ]);
  });

  /**
   * The row's own cell says what is wrong with the row's own label.
   *
   * The array-level rule refuses the SAVE and says so above the list, which is
   * the right place for "this list cannot be saved" and the wrong one for
   * "this box is the problem": the researcher has to be told which of a dozen
   * rows to fix, beside the box they fix it in. Both rules run, and this is
   * the half no other test here reaches.
   */
  it('says under the label box that it is empty, and that it repeats another', async () => {
    const user = userEvent.setup();
    setup();

    const empty = await openRow(1);
    await user.clear(empty);

    const labelField = () =>
      document.querySelector<HTMLElement>(
        '[data-field-name="options[0].label"]',
      )!;
    await waitFor(() => expect(labelField()).toHaveTextContent('Required'));

    await user.type(empty, 'Two');

    await waitFor(() =>
      expect(labelField()).toHaveTextContent(
        'This value is already in use. Enter a different value.',
      ),
    );
  });

  it('refuses to submit two labels a participant could not tell apart', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    const box = await openRow(2);
    await user.clear(box);
    await user.type(box, 'one');
    await waitFor(() => expect(labelOf(1)).toBe('one'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Every option needs a unique label.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
