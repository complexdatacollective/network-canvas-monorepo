import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import TranslationTable from '~/components/Localization/TranslationTable';
import CodebookPage from '~/components/pages/CodebookPage';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import Variables from '../Variables';

// The type editor's pickers are irrelevant to its label and drag in
// canvas/motion work jsdom cannot do.
vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('@codaco/fresco-ui/form/fields/IconPicker', () => ({
  default: () => null,
}));
vi.mock('~/components/TypeEditor/ShapePicker', () => ({
  ShapePickerControl: () => null,
}));
vi.mock('~/components/TypeEditor/ShapeVariableMapping', () => ({
  default: () => null,
}));

const bilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          age: { name: 'age', type: 'number', label: 'Age' },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  },
  stages: [],
};

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });
  store.dispatch(setActiveProtocol(structuredClone(bilingual)));
  return store;
};

type Store = ReturnType<typeof makeStore>;

const personType = (store: Store) =>
  getProtocol(store.getState())?.codebook.node?.person;

const ageLabel = (store: Store) => personType(store)?.variables?.age?.label;

const ageRow = {
  id: 'age',
  name: 'age',
  component: 'Number',
  inUse: false,
  usage: [],
};

const renderAttributeTable = (store: Store) =>
  render(
    <Provider store={store}>
      <TranslationTable />
      <Variables entity="node" type="person" variables={[ageRow]} />
    </Provider>,
  );

const chooseLanguage = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) => {
  await user.click(screen.getByRole('button', { name: /Editing language/ }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
};

const openAgeLabel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('button', { name: 'Edit attribute label: age' }),
  );
  return screen.findByRole('textbox', { name: 'Attribute label' });
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('Editing labels from the Codebook', () => {
  it('writes an attribute label as plain text, in no particular language', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    const input = await openAgeLabel(user);
    expect(input).toHaveValue('Age');
    expect(
      screen.queryByRole('button', { name: /Editing language/ }),
    ).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'Age in years');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ageLabel(store)).toBe('Age in years'));
  });

  it('writes a type label in the second language from a codebook link', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      '',
      '/protocol/codebook?entity=node&type=person',
    );
    render(
      <Provider store={store}>
        <CodebookPage />
      </Provider>,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Node type label' }),
    ).toHaveValue('Person');
    await chooseLanguage(user, /^français/);
    await user.type(
      screen.getByRole('textbox', { name: 'Node type label' }),
      'Personne',
    );
    await user.click(screen.getByRole('button', { name: 'Save and Close' }));

    await waitFor(() =>
      expect(personType(store)?.label).toEqual({
        en: 'Person',
        fr: 'Personne',
      }),
    );
    expect(window.location.search).toBe('');
  });

  it('refuses an attribute label left empty', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    await user.clear(await openAgeLabel(user));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(ageLabel(store)).toBe('Age');
  });

  it('lists the type label in the translation table, and no attribute label', () => {
    const store = makeStore();
    renderAttributeTable(store);

    expect(screen.getByRole('link', { name: 'Person' })).toHaveAttribute(
      'href',
      '/protocol/codebook?entity=node&type=person',
    );
    const table = screen.getByRole('table', {
      name: /^Every text participants see/,
    });
    // Each group's heading is a row header too, of its group of rows.
    const texts = within(table)
      .getAllByRole('rowheader')
      .filter((header) => header.getAttribute('scope') === 'row');
    expect(texts.map((header) => header.textContent)).toEqual([
      'Node type label',
    ]);
  });
});
