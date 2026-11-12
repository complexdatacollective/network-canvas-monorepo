import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('saves a default-language edit that adds a value an untouched translation does not show', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [{ ...stage, title: { en: 'Welcome back', fr: 'Bon retour' } }],
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
      name: /first_name/,
    });
    if (option === undefined) throw new Error('No value offered');
    await user.click(option);
    await waitFor(() =>
      expect(editor.querySelector('[data-token="name"]')).not.toBeNull(),
    );
    await leaveCell(user);

    expect(titleCell('French')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(title(store)).toMatchObject({ fr: 'Bon retour' }),
    );
    expect(JSON.stringify(title(store))).toContain('{name');
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
