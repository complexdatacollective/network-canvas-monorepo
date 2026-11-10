import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ContextType, useContext } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
  STAGE_LABEL_MAX_LENGTH,
  validateProtocol,
} from '@codaco/protocol-validation';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';
import { BUNDLED_TEMPLATES } from '~/templates';

import TranslationTable from '../TranslationTable';

const template = BUNDLED_TEMPLATES.find(
  ({ id }) => id === 'eco-genetic-relationship-maps',
)?.protocol;

/**
 * A valid protocol in English and Spanish: a Narrative Pedigree with two
 * diseases, the first translated into Spanish as "Diabetes" and the second
 * not translated, and an attribute whose first two options are translated.
 */
const bilingual = (): CurrentProtocol => {
  if (!template) throw new Error('Missing the eco-genetic template');
  const protocol = structuredClone(template);
  protocol.localization = { defaultLocale: 'en', locales: ['en', 'es'] };
  const stage = protocol.stages.find(
    ({ type }) => type === 'NarrativePedigree',
  );
  if (stage?.type !== 'NarrativePedigree') throw new Error('No pedigree');
  const [condition] = stage.diseases;
  if (!condition) throw new Error('No disease');
  stage.diseases = [
    { ...condition, label: { en: 'Cancer', es: 'Diabetes' } },
    {
      ...condition,
      id: 'second',
      attribute: asEntityAttributeReference('had_testing'),
      color: 'node-color-seq-2',
      label: { en: 'Heart disease' },
    },
  ];
  const livingStatus = protocol.codebook.node?.person?.variables?.living_status;
  if (livingStatus?.type !== 'categorical') throw new Error('No options');
  livingStatus.options = [
    { value: 'living', label: { en: 'Living', es: 'Vivo' } },
    { value: 'deceased', label: { en: 'Deceased', es: 'Fallecido' } },
    { value: 'unknown', label: { en: 'Don’t know' } },
  ];
  return protocol;
};

type TableForm = NonNullable<ContextType<typeof FormStoreContext>>;

const renderTable = (protocol: CurrentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  const onSaved = vi.fn();
  const forms: TableForm[] = [];
  const FormProbe = () => {
    const form = useContext(FormStoreContext);
    if (form && !forms.includes(form)) forms.push(form);
    return null;
  };
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <FormProbe />
        <TranslationTable onSaved={onSaved} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  /** The table's form, which holds each edited cell's text. */
  const form = () => {
    const [only] = forms;
    if (!only) throw new Error('No form');
    return only;
  };
  return { store, onSaved, form, user: userEvent.setup() };
};

type Rendered = ReturnType<typeof renderTable>;

const disease = (position: number, language: string) =>
  screen.getByRole('textbox', {
    name: new RegExp(`Disease ${position} › Disease label ${language}$`),
  });

const optionLabelName = (position: number, language: string) =>
  new RegExp(`living_status › Option ${position} label ${language}$`);

/** An option label's cell, which holds formatted text, before it has focus. */
const optionLabel = (position: number, language: string) =>
  screen.getByRole('button', { name: optionLabelName(position, language) });

/** The editor the option label's cell opens when it is selected. */
const openOptionLabel = async (
  user: Rendered['user'],
  position: number,
  language: string,
) => {
  await user.click(optionLabel(position, language));
  const editor = await screen.findByRole('textbox', {
    name: optionLabelName(position, language),
  });
  await waitFor(() => expect(editor).toHaveFocus());
  return editor;
};

/** The table cell holding `control`, which shows why it is refused. */
const cellOf = (control: HTMLElement) => {
  const cell = control.closest('td');
  if (!cell) throw new Error('Not in a cell');
  return cell;
};

const retype = async (
  user: Rendered['user'],
  box: HTMLElement,
  text: string,
) => {
  await user.clear(box);
  await user.type(box, text);
};

/** Presses Save and waits for the save, and the check before it, to end. */
const save = async (user: Rendered['user']) => {
  const button = screen.getByRole('button', { name: 'Save' });
  await user.click(button);
  await waitFor(() => expect(button).toBeEnabled());
};

describe('TranslationTable: the rules a field shares with its neighbours', () => {
  it('starts from a protocol that is valid', async () => {
    expect((await validateProtocol(bilingual(), { draft: true })).success).toBe(
      true,
    );
  });

  it('refuses a disease name another disease has, and says so in its cell', async () => {
    const { store, onSaved, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());

    await retype(user, disease(2, 'English'), 'cancer');
    await user.tab();

    const refused = disease(2, 'English');
    await waitFor(() =>
      expect(refused).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      within(cellOf(refused)).getByText(
        'Another disease has the same name in English. Give each disease a name participants can tell apart.',
      ),
    ).toBeInTheDocument();

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('refuses a name that repeats another disease’s only where it is not translated, and shows the cell whatever hid it', async () => {
    const { store, onSaved, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());

    // The second disease has no Spanish name, so Spanish readers see its
    // English one: "Diabetes", the first disease's Spanish name. No cell the
    // researcher edited breaks a rule; the protocol the save would write does.
    await retype(user, disease(2, 'English'), 'Diabetes');
    await user.tab();
    expect(disease(2, 'English')).toHaveAttribute('aria-invalid', 'false');

    // The cell at fault is hidden twice over: by a search its row does not
    // match, and by hiding the Spanish column.
    await user.type(
      screen.getByRole('searchbox', { name: 'Search translations' }),
      'Heart',
    );
    await user.click(screen.getByRole('button', { name: /^Languages/ }));
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Spanish' }),
    );
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('textbox', { name: /Disease 1 › Disease label/ }),
    ).toBeNull();

    await save(user);

    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
    const atFault = await waitFor(() => disease(1, 'Spanish'));
    expect(atFault).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(cellOf(atFault)).getByText(
        'Another disease has the same name in Spanish. Give each disease a name participants can tell apart.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(atFault).toHaveFocus());
  });

  it('refuses an option label another option of the attribute has in a language other than the default', async () => {
    const { store, onSaved, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());

    await openOptionLabel(user, 2, 'Spanish');
    await user.keyboard('{Control>}a{/Control}vivo');
    await user.click(disease(1, 'English'));

    const refused = optionLabel(2, 'Spanish');
    await waitFor(() =>
      expect(
        within(cellOf(refused)).queryByText(/Another option/),
      ).not.toBeNull(),
    );
    expect(
      within(cellOf(refused)).getByText(
        'Another option of this attribute has the same label in Spanish. Give each option a label participants can tell apart.',
      ),
    ).toBeInTheDocument();

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('writes a save the rules allow once, which one undo takes back', async () => {
    const { store, onSaved, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());
    let writes = 0;
    let held = before;
    store.subscribe(() => {
      const current = getProtocol(store.getState());
      if (current !== held) writes += 1;
      held = current;
    });

    await user.type(disease(2, 'Spanish'), 'Cardiopatía');
    await openOptionLabel(user, 3, 'Spanish');
    await user.keyboard('No lo sé');
    await save(user);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(writes).toBe(1);
    const stage = getProtocol(store.getState())?.stages.find(
      ({ type }) => type === 'NarrativePedigree',
    );
    expect(
      stage?.type === 'NarrativePedigree' ? stage.diseases[1]?.label : null,
    ).toEqual({ en: 'Heart disease', es: 'Cardiopatía' });

    act(() => {
      store.dispatch(timelineActions.undo());
    });
    expect(getProtocol(store.getState())).toEqual(before);
  });
});

/** The second stage's name in `language`, a one-line field of plain text. */
const stageName = (language: string) =>
  screen.getByRole('textbox', {
    name: new RegExp(`^Stage 2 · .* Stage name ${language}$`),
  });

describe('TranslationTable: a stage’s name', () => {
  it(`refuses a name longer than ${STAGE_LABEL_MAX_LENGTH} characters in its cell, and saves one that long`, async () => {
    const { store, onSaved, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());
    const longest = 'x'.repeat(STAGE_LABEL_MAX_LENGTH);

    await user.click(stageName('Spanish'));
    await user.paste(`${longest}y`);
    await user.click(disease(1, 'English'));

    const refused = stageName('Spanish');
    await waitFor(() =>
      expect(refused).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      within(cellOf(refused)).getByText(
        `A stage name can be at most ${STAGE_LABEL_MAX_LENGTH} characters long. Shorten this one.`,
      ),
    ).toBeInTheDocument();
    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();

    await user.click(refused);
    await user.keyboard('{Backspace}');
    await user.click(disease(1, 'English'));
    await waitFor(() =>
      expect(refused).toHaveAttribute('aria-invalid', 'false'),
    );
    await save(user);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(getProtocol(store.getState())?.stages[1]?.label).toEqual({
      en: 'Welcome and consent',
      es: longest,
    });
  });

  // Typing or pasting one becomes a space, so this is the rule behind that:
  // the name's declaration, which is one line, refuses the text in the cell.
  it('refuses a line break the cell holds, saying so in the cell', async () => {
    const { store, onSaved, form, user } = renderTable(bilingual());
    const before = getProtocol(store.getState());

    await user.type(stageName('Spanish'), 'Bienvenida');
    const name = cellOf(stageName('Spanish')).dataset.fieldPath;
    if (name === undefined) throw new Error('The cell has no field');
    act(() => {
      const state = form().getState();
      state.setFieldValue(name, 'Bienvenida\ny consentimiento');
      state.setFieldBlurred(name);
      void state.validateField(name);
    });

    const refused = stageName('Spanish');
    await waitFor(() =>
      expect(refused).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      within(cellOf(refused)).getByText(
        'The protocol cannot hold this text as it is written. Details: Text cannot contain a line break.',
      ),
    ).toBeInTheDocument();
    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
