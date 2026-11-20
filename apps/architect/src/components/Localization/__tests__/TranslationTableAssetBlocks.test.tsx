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

const BLOCK = '![A map of the area](asset:map?size=medium&align=end)';
const ENGLISH = `# Welcome\n\n${BLOCK}\n\nSome text`;
const FRENCH = `# Bienvenue\n\n${BLOCK}`;

const protocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {
    map: { id: 'map', type: 'image', name: 'map.png', source: 'map.png' },
  },
  codebook: {
    node: { person: { name: 'Person', color: 'node-color-seq-1' } },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      content: { en: ENGLISH, fr: FRENCH },
    },
    {
      id: 'names',
      type: 'NameGenerator',
      label: { en: 'Names', fr: 'Noms' },
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: { en: 'Name people ![x](asset:map)' } }],
    },
  ],
} as unknown as CurrentProtocol;

const renderTable = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <TranslationTable onSaved={vi.fn()} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const pageContentCell = (language: string) =>
  screen.getByRole('button', {
    name: new RegExp(`^Stage 1 .*Content ${language}$`),
  });

describe('TranslationTable: files placed in the text of an Information stage', () => {
  it('shows each file as one line naming it, in a cell that is read', () => {
    renderTable();

    for (const language of ['English', 'French']) {
      const blocks = pageContentCell(language)
        .closest('td')
        ?.querySelectorAll('[data-asset-block]');
      expect(blocks).toHaveLength(1);
      expect(blocks?.[0]).toHaveAttribute('data-asset-block', 'image');
      expect(blocks?.[0]).toHaveTextContent('A map of the area');
    }
  });

  it('shows no such line for text of another stage that holds the same markdown', () => {
    renderTable();

    const prompt = screen.getByRole('button', {
      name: /^Stage 2 .* English$/,
    });
    expect(
      prompt.closest('td')?.querySelector('[data-asset-block]'),
    ).toBeNull();
  });

  it('keeps the file, byte for byte, when a word of the text around it is changed and the table is saved', async () => {
    const { store, user } = renderTable();

    await user.click(pageContentCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: /^Stage 1 .*Content English$/,
    });
    await waitFor(() => expect(editor).toHaveFocus());
    // The file is still a block in the cell being edited, not its alt text.
    expect(editor.querySelector('[data-asset-block]')).not.toBeNull();

    await user.keyboard('!');
    await user.click(
      screen.getByRole('textbox', { name: /^Stage 1 .*Stage name French$/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const stage = getProtocol(store.getState())?.stages[0];
      const content =
        stage && 'content' in stage
          ? (stage.content as Record<string, string>)
          : {};
      expect(content.en).not.toBe(ENGLISH);
    });
    const stage = getProtocol(store.getState())?.stages[0];
    const content = (
      stage && 'content' in stage ? stage.content : {}
    ) as Record<string, string>;
    // One word changed, and the block is exactly as it was written.
    expect(content.en).toContain(`\n\n${BLOCK}\n\n`);
    expect(content.en).toBe(`${ENGLISH}!`);
    expect(content.fr).toBe(FRENCH);
  });
});
