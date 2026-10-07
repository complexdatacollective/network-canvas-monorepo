import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import type { StageEditorActionContext } from '@codaco/protocol-builder/stage-editor-contract';
import StageEditor from '@codaco/protocol-builder/StageEditor';
import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import { ActionToolbarProvider } from '~/components/ProjectNav/ActionToolbar';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import type { ArchitectStore } from '~/protocolBuilder/architectStore';
import { useArchitectClient } from '~/protocolBuilder/useArchitectClient';
import { getProtocol } from '~/selectors/protocol';

import { architectStageEditors } from '../architectStageEditors';
import { readStageDraft } from '../stageDraftBeacon';
import StageEditorChrome, { StageEditorHeader } from '../StageEditorChrome';

/**
 * The language chooser's editor in Architect, over this tab's own store, as
 * the stage editor route mounts it. Every language change here is a change to
 * the whole protocol, made while a stage of it is open and possibly unsaved.
 */
const PROTOCOL_ID = 'library-row-1';
const STAGE_ID = 'choose-language';
const FORM_ID = 'language-chooser-form';

const LABEL = { en: 'Choose a language', fr: 'Choisissez une langue' };

// German has no translations, so the Languages page would offer to list them.
const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [{ id: STAGE_ID, type: 'LanguageChooser', label: LABEL }],
};

const target = { sectionId: sectionId({ kind: 'stage', stageId: STAGE_ID }) };

const renderHeader = () => <StageEditorHeader stageId={STAGE_ID} />;

const renderChrome = ({
  formId,
  readOnly,
  sections,
  problems,
}: StageEditorActionContext) => (
  <StageEditorChrome
    formId={formId}
    readOnly={readOnly}
    sections={sections}
    problems={problems}
    outlineHost={null}
    stageId={STAGE_ID}
    onCancel={() => undefined}
  />
);

function Editor({ store }: Readonly<{ store: ArchitectStore }>) {
  const { adapter } = useArchitectClient(store, 'Another tab');
  return (
    <ProtocolBuilder adapter={adapter} protocolId={PROTOCOL_ID}>
      <StageEditor
        target={target}
        formId={FORM_ID}
        actions={renderChrome}
        header={renderHeader}
        registry={architectStageEditors}
      />
    </ProtocolBuilder>
  );
}

const openEditor = async () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  store.dispatch(setActiveProtocol(protocol));
  render(
    <Provider store={store}>
      <ActionToolbarProvider>
        <Editor store={store} />
      </ActionToolbarProvider>
    </Provider>,
  );
  const name = await screen.findByRole('textbox', { name: 'Stage name' });
  await waitFor(() => expect(name).not.toHaveAttribute('readonly'));
  await waitFor(() => expect(readStageDraft().stage?.label).toEqual(LABEL));
  return { store, name };
};

const savedStage = (store: ArchitectStore) =>
  getProtocol(store.getState())?.stages.find((stage) => stage.id === STAGE_ID);

const rowOf = (language: string) => {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(language, { exact: true }));
  if (!row) throw new Error(`No row for ${language}`);
  return row;
};

const actionsTrigger = (language: string) =>
  within(rowOf(language)).getByRole('button', {
    name: `Actions for ${language}`,
  });

const openActions = async (language: string) => {
  await userEvent.click(actionsTrigger(language));
  return screen.findByRole('menu', { name: `Actions for ${language}` });
};

const closeActions = async (language: string) => {
  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(
      screen.queryByRole('menu', { name: `Actions for ${language}` }),
    ).not.toBeInTheDocument(),
  );
};

const chooseAction = async (language: string, action: string) => {
  const menu = await openActions(language);
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
};

const removeItem = async (language: string) => {
  const menu = await openActions(language);
  return within(menu).getByRole('menuitem', { name: 'Remove' });
};

const finishedEditing = () =>
  screen.queryByRole('button', { name: 'Finished Editing' });

describe('the language chooser’s languages in Architect', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('lists the protocol’s languages with the Languages page’s actions and links', async () => {
    await openEditor();

    expect(
      screen.getByRole('heading', { name: 'Languages' }),
    ).toBeInTheDocument();
    for (const language of ['English', 'French', 'German']) {
      expect(actionsTrigger(language)).toBeInTheDocument();
    }
    const menu = await openActions('French');
    for (const action of ['Make default', 'Relabel translations…', 'Remove']) {
      expect(
        within(menu).getByRole('menuitem', { name: action }),
      ).toBeInTheDocument();
    }
    await closeActions('French');
    expect(
      screen.getByRole('button', { name: 'Add languages' }),
    ).toBeInTheDocument();
    expect(
      within(rowOf('German')).getByRole('link', {
        name: 'Show 1 missing German translation',
      }),
    ).toHaveAttribute('href', '/protocol/localization?table=open&missing=de');
    expect(
      screen.getByRole('link', { name: 'Open translation table' }),
    ).toHaveAttribute('href', '/protocol/localization?table=open');
    // The sections the package's own editor has, besides its list.
    expect(
      screen.getByRole('heading', { name: 'Skip logic' }),
    ).toBeInTheDocument();
  });

  it('opens the translation table from an untouched stage without asking', async () => {
    await openEditor();

    await userEvent.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );

    expect(window.location.pathname + window.location.search).toBe(
      '/protocol/localization?table=open',
    );
    expect(globalThis.__architectDialogMocks.openDialog).not.toHaveBeenCalled();
  });

  it('asks before leaving unsaved changes to the stage for the translation table', async () => {
    const { name } = await openEditor();
    await userEvent.clear(name);
    await userEvent.type(name, 'Pick a language');
    await waitFor(() => expect(readStageDraft().dirty).toBe(true));
    const { openDialog } = globalThis.__architectDialogMocks;

    openDialog.mockResolvedValueOnce(false);
    await userEvent.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/');

    openDialog.mockResolvedValueOnce(true);
    await userEvent.click(
      within(rowOf('German')).getByRole('link', {
        name: 'Show 1 missing German translation',
      }),
    );
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        '/protocol/localization?table=open&missing=de',
      ),
    );
    expect(openDialog).toHaveBeenCalledTimes(2);
  });

  it('leaves nothing to save after removing a language from an untouched stage', async () => {
    const { store } = await openEditor();

    await chooseAction('French', 'Remove');

    await waitFor(() =>
      expect(getProtocol(store.getState())?.localization.locales).toEqual([
        'en',
        'de',
      ]),
    );
    expect(savedStage(store)?.label).toEqual({ en: LABEL.en });
    await waitFor(() =>
      expect(readStageDraft().stage?.label).toEqual({ en: LABEL.en }),
    );
    await waitFor(() => expect(readStageDraft().dirty).toBe(false));
    expect(finishedEditing()).not.toBeInTheDocument();
  });

  it('keeps the stage’s other unsaved changes, without the removed language', async () => {
    const { store, name } = await openEditor();

    await userEvent.clear(name);
    await userEvent.type(name, 'Pick a language');
    await waitFor(() => expect(readStageDraft().dirty).toBe(true));

    await chooseAction('French', 'Remove');

    await waitFor(() =>
      expect(readStageDraft().stage?.label).toEqual({
        en: 'Pick a language',
      }),
    );
    expect(readStageDraft().dirty).toBe(true);
    expect(name).toHaveValue('Pick a language');
    expect(savedStage(store)?.label).toEqual({ en: LABEL.en });
  });

  it('relabels a language’s translations in the open stage too', async () => {
    const { store } = await openEditor();
    globalThis.__architectDialogMocks.openDialog.mockResolvedValueOnce({
      language: 'fr-CA',
    });

    await chooseAction('French', 'Relabel translations…');

    const renamed = { 'en': LABEL.en, 'fr-CA': LABEL.fr };
    await waitFor(() => expect(savedStage(store)?.label).toEqual(renamed));
    await waitFor(() => expect(readStageDraft().stage?.label).toEqual(renamed));
    await waitFor(() => expect(readStageDraft().dirty).toBe(false));
  });

  it('saves a stage edited across a language’s removal as a valid protocol', async () => {
    const { store, name } = await openEditor();

    await userEvent.clear(name);
    await userEvent.type(name, 'Pick a language');
    await chooseAction('French', 'Remove');
    await waitFor(() =>
      expect(readStageDraft().stage?.label).toEqual({
        en: 'Pick a language',
      }),
    );

    const save = await screen.findByRole('button', {
      name: 'Finished Editing',
    });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(savedStage(store)?.label).toEqual({ en: 'Pick a language' }),
    );
    const saved = getProtocol(store.getState());
    if (saved === null) throw new Error('The protocol was not saved.');
    const result = await validateProtocol(saved);
    expect(result.success).toBe(true);
  });

  it('counts the open stage’s unsaved text when a language would be removed', async () => {
    const { name } = await openEditor();
    expect(await removeItem('French')).not.toHaveAttribute('aria-disabled');
    await closeActions('French');

    // The stage's name is now only in French, though the protocol still has
    // it in English as well.
    await userEvent.clear(name);
    await waitFor(() =>
      expect(readStageDraft().stage?.label).toEqual({ fr: LABEL.fr }),
    );

    const remove = await removeItem('French');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(
      '1 text exists only in French. Translate it into another language before removing French.',
    );
    await userEvent.click(remove);
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
  });
});
