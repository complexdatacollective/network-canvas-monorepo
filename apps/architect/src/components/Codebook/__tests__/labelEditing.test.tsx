import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import MissingTranslations, {
  ALL_LANGUAGES,
} from '~/components/Localization/MissingTranslations';
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
          age: { name: 'age', type: 'number', label: { en: 'Age' } },
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
      <MissingTranslations
        filter={ALL_LANGUAGES}
        onFilterChange={() => {}}
        headingRef={createRef()}
      />
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
  it('writes an attribute label in the second language', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    expect(await openAgeLabel(user)).toHaveValue('Age');
    await chooseLanguage(user, /^français/);
    const input = screen.getByRole('textbox', { name: 'Attribute label' });
    expect(input).toHaveValue('');
    await user.type(input, 'Âge');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(ageLabel(store)).toEqual({ en: 'Age', fr: 'Âge' }),
    );
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

  it('refuses a label left empty in every language', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    await user.clear(await openAgeLabel(user));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(ageLabel(store)).toEqual({ en: 'Age' });
  });

  it('accepts a label that is missing only in the default language', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    await openAgeLabel(user);
    await chooseLanguage(user, /^français/);
    await user.type(
      screen.getByRole('textbox', { name: 'Attribute label' }),
      'Âge',
    );
    await chooseLanguage(user, /^English/);
    await user.clear(screen.getByRole('textbox', { name: 'Attribute label' }));

    expect(
      screen.getByText(
        'Not translated into English yet. Participants using English will see the français text.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ageLabel(store)).toEqual({ fr: 'Âge' }));
    expect(screen.queryByText('This field is required.')).toBeNull();
    const entry = screen.getByRole('link', { name: 'variables.age.label' });
    expect(entry.closest('li')).toHaveTextContent(/English: shows /);
  });

  it('clears the Missing translations entry once the translation is written', async () => {
    const store = makeStore();
    const user = userEvent.setup();
    renderAttributeTable(store);

    const entry = screen.getByRole('link', { name: 'variables.age.label' });
    expect(entry).toHaveAttribute('href', '/protocol/codebook?variable=age');

    await openAgeLabel(user);
    await chooseLanguage(user, /^français/);
    await user.type(
      screen.getByRole('textbox', { name: 'Attribute label' }),
      'Âge',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'variables.age.label' }),
      ).not.toBeInTheDocument(),
    );
  });
});
