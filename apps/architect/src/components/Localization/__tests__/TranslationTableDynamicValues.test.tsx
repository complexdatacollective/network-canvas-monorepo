import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';

const WELCOME = 'Welcome back{name, select, missing {} other {, {name}}}';

const protocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: {
    node: {},
    edge: {},
    ego: { variables: { firstName: { name: 'first_name', type: 'text' } } },
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      title: { en: WELCOME },
      dynamicValues: { name: { path: 'ego.firstName' } },
      items: [],
    },
  ],
} as unknown as CurrentProtocol;

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
  return stage && 'title' in stage ? stage.title : undefined;
};

const cellName = (language: string) => new RegExp(`Page heading ${language}$`);

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
    expect(cell?.querySelector('[data-token="name"]')).not.toBeNull();
    expect(cell).not.toHaveTextContent('{name');
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

  it('says which value a translation leaves out, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(titleCell('French'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('French'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, 'Bon retour');
    await leaveCell(user);

    expect(
      await screen.findByText(/This translation must show "\{name\}"/),
    ).toBeInTheDocument();
    expect(titleCell('French')).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('checks a translation against the original text as the table holds it, saved or not', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [
        {
          ...stage,
          title: {
            en: WELCOME,
            fr: 'Bon retour{name, select, missing {} other {, {name}}}',
          },
        },
      ],
    } as CurrentProtocol);

    // The value goes from both languages before either is saved.
    for (const [language, text] of [
      ['French', 'Bon retour'],
      ['English', 'Welcome back'],
    ] as const) {
      await user.click(titleCell(language));
      const editor = await screen.findByRole('textbox', {
        name: cellName(language),
      });
      await waitFor(() => expect(editor).toHaveFocus());
      await user.clear(editor);
      await user.type(editor, text);
      await leaveCell(user);
    }
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(title(store)).toEqual({ en: 'Welcome back', fr: 'Bon retour' }),
    );
  });

  it('refuses a default-language edit that leaves an untouched translation without a value it now shows', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [{ ...stage, title: { en: 'Welcome back', fr: 'Bon retour' } }],
    } as CurrentProtocol);
    const before = getProtocol(store.getState());

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
      name: /first_name/,
    });
    if (option === undefined) throw new Error('No value offered');
    await user.click(option);
    await waitFor(() =>
      expect(editor.querySelector('[data-token="name"]')).not.toBeNull(),
    );
    await leaveCell(user);

    await waitFor(() =>
      expect(titleCell('French')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      await screen.findByText(/This translation must show "\{name\}"/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('refuses that edit when Save is pressed while the edited cell still has focus', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [{ ...stage, title: { en: 'Welcome back', fr: 'Bon retour' } }],
    } as CurrentProtocol);
    const before = getProtocol(store.getState());

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
      name: /first_name/,
    });
    if (option === undefined) throw new Error('No value offered');
    await user.click(option);
    await waitFor(() =>
      expect(editor.querySelector('[data-token="name"]')).not.toBeNull(),
    );
    await waitFor(() => expect(editor).toHaveFocus());

    // Saved before the cell's blur is handled: a click event alone moves no
    // focus, so the edited cell is never left.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(editor).toHaveFocus();

    await waitFor(() =>
      expect(titleCell('French')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('lets a translation insert a value whose binding records only some of its answers', async () => {
    const [stage] = protocol.stages;
    const { user } = renderTable({
      ...protocol,
      codebook: {
        ...protocol.codebook,
        ego: {
          variables: {
            ...protocol.codebook.ego?.variables,
            mood: {
              name: 'mood',
              type: 'categorical',
              options: [
                { value: 'happy', label: 'Happy' },
                { value: 'sad', label: 'Sad' },
              ],
            },
          },
        },
      },
      stages: [
        {
          ...stage,
          title: { en: '{mood, select, happy {Glad} other {Hello}}' },
          dynamicValues: {
            mood: { path: 'ego.mood', cases: { happy: 'happy' } },
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
  });
});
