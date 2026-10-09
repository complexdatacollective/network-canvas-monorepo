import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { importAssetAsync } from '~/ducks/modules/protocol/assetManifest';
import { rootReducer } from '~/ducks/modules/root';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';
import { getAssetManifest } from '~/selectors/protocol';

const MISSING = 'missing_network';

vi.mock('~/utils/assetUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/assetUtils')>()),
  getAssetBlobUrl: vi.fn(async () => null),
  getUnresolvedAssetIds: vi.fn(async () => [MISSING]),
}));

// Stands in for the import itself, which reads and validates the file: what is
// asked here is whether an import is requested at all.
vi.mock('~/ducks/modules/protocol/assetManifest', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/ducks/modules/protocol/assetManifest')
  >()),
  importAssetAsync: vi.fn(() => () => ({
    unwrap: () => Promise.reject(new Error('import stubbed')),
  })),
}));

import AssetBrowser from './AssetBrowser';

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    setActiveProtocol(
      CurrentProtocolSchema.parse({
        name: 'Resources test',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        // Schema 9 requires the finish stage that ends the interview.
        stages: [
          {
            id: 'finish',
            type: 'FinishSession',
            label: { en: 'Finish' },
            title: { en: 'All done' },
            content: { en: 'Thank you.' },
            finishLabel: { en: 'Finish' },
            finishConfirmation: { en: 'Finish this interview?' },
            finishedNotice: { en: 'This interview is finished.' },
            finishFailed: { en: 'The interview could not be finished.' },
            outcome: 'completed',
          },
        ],
        codebook: {},
        assetManifest: {
          [MISSING]: {
            type: 'network',
            name: 'participants.csv',
            source: 'participants.csv',
          },
          present_audio: {
            type: 'audio',
            name: 'chime.mp3',
            source: 'chime.mp3',
          },
          mapbox_key: { type: 'apikey', name: 'Mapbox key', value: 'pk.test' },
        },
      }),
    ),
  );
  return store;
};

const renderBrowser = (readOnly: boolean) => {
  const store = makeStore();
  const tree = (isReadOnly: boolean) => (
    <Provider store={store}>
      <ProtocolReadOnlyContext value={isReadOnly}>
        <AssetBrowser />
      </ProtocolReadOnlyContext>
    </Provider>
  );
  const view = render(tree(readOnly));
  return {
    store,
    setReadOnly: (isReadOnly: boolean) => view.rerender(tree(isReadOnly)),
  };
};

const getCard = async (name: string) => {
  const heading = await screen.findByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error(`no card for ${name}`);
  return card;
};

const { confirm, openDialog } = globalThis.__architectDialogMocks;

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(importAssetAsync).mockClear();
});

describe('AssetBrowser while another tab owns the protocol', () => {
  it('offers import, replace and delete when the protocol is editable', async () => {
    renderBrowser(false);

    expect(
      screen.getByRole('button', { name: 'Upload file' }),
    ).not.toHaveAttribute('aria-disabled');
    await screen.findByRole('button', {
      name: 'Add the file for participants.csv',
    });
    expect(
      screen.getByLabelText('Choose the missing file for this resource'),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete chime.mp3' }),
    ).toBeEnabled();
  });

  it('disables the import drop zone', () => {
    const openPicker = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderBrowser(true);

    const dropzone = screen.getByRole('button', { name: 'Upload file' });
    expect(dropzone).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(dropzone);
    fireEvent.keyDown(dropzone, { key: 'Enter', code: 'Enter' });
    expect(openPicker).not.toHaveBeenCalled();
  });

  it('disables replace and delete on every card, and the replace file picker', async () => {
    renderBrowser(true);

    expect(
      await screen.findByRole('button', {
        name: 'Add the file for participants.csv',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete chime.mp3' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete participants.csv' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete Mapbox key' }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText('Choose the missing file for this resource'),
    ).toBeDisabled();
  });

  it('never reaches the delete confirmation', async () => {
    const { store } = renderBrowser(true);
    const remove = await screen.findByRole('button', {
      name: 'Delete chime.mp3',
    });

    fireEvent.click(remove);

    expect(confirm).not.toHaveBeenCalled();
    expect(openDialog).not.toHaveBeenCalled();
    expect(getAssetManifest(store.getState())).toHaveProperty('present_audio');
  });

  it('deletes through the confirmation when the protocol is editable', async () => {
    const { store } = renderBrowser(false);
    const remove = await screen.findByRole('button', {
      name: 'Delete chime.mp3',
    });

    fireEvent.click(remove);

    await waitFor(() =>
      expect(getAssetManifest(store.getState())).not.toHaveProperty(
        'present_audio',
      ),
    );
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not open the file picker when a missing resource is activated', async () => {
    const openPicker = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderBrowser(true);
    const card = await getCard('participants.csv');
    await within(card).findByText('File missing');

    fireEvent.click(card);
    await Promise.resolve();

    expect(openPicker).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the file picker when a missing resource is activated while editable', async () => {
    const openPicker = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderBrowser(false);
    const card = await getCard('participants.csv');
    await within(card).findByText('File missing');

    fireEvent.click(card);

    await waitFor(() => expect(openPicker).toHaveBeenCalledOnce());
  });

  it('requests the replacement import for a file chosen while editable', async () => {
    renderBrowser(false);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add the file for participants.csv',
      }),
    );
    const file = new File(['id\n1'], 'participants.csv', { type: 'text/csv' });

    fireEvent.change(
      screen.getByLabelText('Choose the missing file for this resource'),
      { target: { files: [file] } },
    );

    await waitFor(() =>
      expect(importAssetAsync).toHaveBeenCalledExactlyOnceWith({
        file,
        name: 'participants.csv',
        replaceAssetId: MISSING,
        expectedType: 'network',
      }),
    );
  });

  it('drops a file chosen from a picker that was open when the protocol became read-only', async () => {
    const { setReadOnly } = renderBrowser(false);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add the file for participants.csv',
      }),
    );
    setReadOnly(true);

    fireEvent.change(
      screen.getByLabelText('Choose the missing file for this resource'),
      {
        target: {
          files: [
            new File(['id\n1'], 'participants.csv', { type: 'text/csv' }),
          ],
        },
      },
    );
    await Promise.resolve();

    expect(importAssetAsync).not.toHaveBeenCalled();
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('still previews a resource and keeps download and the type filter', async () => {
    renderBrowser(true);

    expect(
      await screen.findByRole('button', { name: 'Download chime.mp3' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Preview chime.mp3' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Mapbox key' }));

    expect(
      await screen.findByRole('button', { name: 'Copy API Key' }),
    ).toBeEnabled();
  });

  it('filters the library by type', async () => {
    renderBrowser(true);
    await screen.findByRole('heading', { name: 'chime.mp3' });

    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'participants.csv' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'chime.mp3' }),
    ).toBeInTheDocument();
  });
});
