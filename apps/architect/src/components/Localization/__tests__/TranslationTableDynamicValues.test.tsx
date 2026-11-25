import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  testId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';
import { dynamicValuesProtocol, FIRST_NAME } from './dynamicValuesProtocol';

const WELCOME = `Welcome back{${FIRST_NAME}, select, missing {} other {, {${FIRST_NAME}}}}`;

const protocol = dynamicValuesProtocol({ en: WELCOME });

const renderTable = (initial: CurrentProtocol = protocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(initial)));
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <TranslationTable onSaved={vi.fn()} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const title = (store: ReturnType<typeof renderTable>['store']): unknown => {
  const stage = getProtocol(store.getState())?.stages[0];
  return stage && 'content' in stage ? stage.content : undefined;
};

const cellName = (language: string) => new RegExp(`Content ${language}$`);

const titleCell = (language: string) =>
  screen.getByRole('button', { name: cellName(language) });

/** Leaves the cell for the stage name's English cell. */
const leaveCell = async (user: ReturnType<typeof renderTable>['user']) => {
  await user.click(
    screen.getByRole('textbox', { name: /Stage name English$/ }),
  );
};

describe('TranslationTable: text that shows values', () => {
  it('shows each value as the pill the stage editor draws, until the cell has focus', () => {
    renderTable();

    const cell = titleCell('English').closest('td');
    expect(cell?.querySelector(`[data-token="${FIRST_NAME}"]`)).not.toBeNull();
    expect(cell).toHaveTextContent('first_name');
    expect(cell).not.toHaveTextContent(FIRST_NAME);
  });

  it('keeps the values a translation shows when the table is saved', async () => {
    const { store, user } = renderTable();

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await leaveCell(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(title(store)).toEqual({ en: WELCOME });
  });

  it('saves a translation that leaves out a value the original text shows', async () => {
    const { store, user } = renderTable();

    await user.click(titleCell('French'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('French'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, 'Bon retour');
    await leaveCell(user);

    expect(titleCell('French')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(title(store)).toEqual({ en: WELCOME, fr: 'Bon retour' }),
    );
  });

  // The stage shows no value anywhere yet: its text still offers them, as
  // its editor on the stage does.
  it('saves a default-language edit that adds a value an untouched translation does not show', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [{ ...stage, content: { en: 'Welcome back', fr: 'Bon retour' } }],
    } as CurrentProtocol);

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.click(
      screen.getByRole('button', {
        name: 'Inject piped text from interview metadata or a network attribute',
      }),
    );
    const [option] = await screen.findAllByRole('option', {
      name: /Today’s date/,
    });
    if (option === undefined) throw new Error('No value offered');
    await user.click(option);
    await waitFor(() =>
      expect(editor.querySelector('[data-token="now"]')).not.toBeNull(),
    );
    await leaveCell(user);

    expect(titleCell('French')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(title(store)).toMatchObject({ fr: 'Bon retour' }),
    );
    expect(JSON.stringify(title(store))).toContain('{now');
  });

  it('lets a translation insert any value its place can show', async () => {
    const [stage] = protocol.stages;
    const mood = testVariableId('mood');
    const happy = testId('option/happy');
    const moodName = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: mood,
    });
    const { user } = renderTable({
      ...protocol,
      codebook: {
        ...protocol.codebook,
        ego: {
          variables: {
            ...protocol.codebook.ego?.variables,
            [mood]: {
              name: 'mood',
              type: 'categorical',
              options: [
                { id: happy, value: 'happy', label: { en: 'Happy' } },
                {
                  id: testId('option/sad'),
                  value: 'sad',
                  label: { en: 'Sad' },
                },
              ],
            },
          },
        },
      },
      stages: [
        {
          ...stage,
          content: {
            en: `{${moodName}, select, ${optionCaseKey(happy)} {Glad} other {Hello}}`,
          },
        },
      ],
    } as unknown as CurrentProtocol);

    await user.click(titleCell('French'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('French'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.click(
      screen.getByRole('button', {
        name: 'Inject piped text from interview metadata or a network attribute',
      }),
    );
    const offered = (await screen.findAllByRole('option')).map(
      (option) => option.textContent ?? '',
    );
    expect(offered.some((label) => label.includes('mood'))).toBe(true);
    expect(offered.some((label) => label.includes('first_name'))).toBe(true);
  });
});

/**
 * The pill of a value its place cannot offer says what the value was, and
 * shows the name that the text uses for it only when that name refers to no
 * kind of value at all.
 */
describe.each([
  ['a name that refers to no kind of value', 'ghost', 'ghost'],
  [
    'an attribute the codebook does not have',
    dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('deleted'),
    }),
    'Deleted attribute',
  ],
])('TranslationTable: text naming %s', (_, ghost, shown) => {
  const ghostTitle = {
    en: `{${ghost}} welcome`,
    fr: `{${ghost}} bienvenue`,
  };

  it('keeps the value as a pill when reading', () => {
    renderTable(dynamicValuesProtocol(ghostTitle));

    const cell = titleCell('English').closest('td');
    expect(cell?.querySelector(`[data-token="${ghost}"]`)).toHaveTextContent(
      shown,
    );
    expect(cell).toHaveTextContent(`${shown} welcome`);
  });

  it('keeps the value as a pill when editing', async () => {
    const { user } = renderTable(dynamicValuesProtocol(ghostTitle));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() =>
      expect(editor.querySelector(`[data-token="${ghost}"]`)).not.toBeNull(),
    );
    expect(editor).toHaveTextContent(`${shown} welcome`);
  });

  it('refuses the text at its cell once the cell is left', async () => {
    const { user } = renderTable(dynamicValuesProtocol(ghostTitle));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, ' there');
    await leaveCell(user);

    await waitFor(() =>
      expect(titleCell('English')).toHaveAttribute('aria-invalid', 'true'),
    );
  });
});
