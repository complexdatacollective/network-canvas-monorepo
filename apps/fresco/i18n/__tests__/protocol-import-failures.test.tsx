import { Toast } from '@base-ui/react/toast';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { createDefaultFinishSessionStage } from '@codaco/protocol-validation';
import { useProtocolImport } from '~/hooks/useProtocolImport';
import { frescoLocales } from '~/i18n/locales';
import {
  captureClientEvent,
  captureClientException,
} from '~/lib/posthog-client';
import { frescoCatalogSource } from '~/src/locales/catalogs';

const {
  getProtocolByHash,
  getNewAssetIds,
  insertProtocol,
  uploadAssets,
  cleanupUploadedFiles,
} = vi.hoisted(() => ({
  getProtocolByHash: vi.fn(),
  getNewAssetIds: vi.fn(),
  insertProtocol: vi.fn(),
  uploadAssets: vi.fn(),
  cleanupUploadedFiles: vi.fn(),
}));
vi.mock('~/actions/protocols', () => ({
  getProtocolByHash,
  getNewAssetIds,
  insertProtocol,
  cleanupUploadedFiles,
}));
vi.mock('~/hooks/useUploadAssets', () => ({
  useUploadAssets: () => ({ uploadAssets }),
}));
vi.mock('~/lib/posthog-client', () => ({
  captureClientEvent: vi.fn(),
  captureClientException: vi.fn(),
}));

function ImportButton({ files }: { files: File[] }) {
  const { importProtocols } = useProtocolImport();
  return <button onClick={() => importProtocols(files)}>Start import</button>;
}
// Loaded up front, so every render and formatter below has Spanish
// synchronously.
await frescoCatalogSource.load('es');

const view = (locale: string, file: File | File[]) => (
  <AppI18nProvider
    locale={locale}
    locales={frescoLocales}
    messages={frescoCatalogSource.peek(locale)}
  >
    <Toast.Provider>
      <DialogProvider>
        <ImportButton files={Array.isArray(file) ? file : [file]} />
      </DialogProvider>
      <Toaster />
    </Toast.Provider>
  </AppI18nProvider>
);

async function archiveFile(contents: string, fileName = 'fixture.netcanvas') {
  const zip = new JSZip();
  zip.file('protocol.json', contents);
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], fileName);
}

beforeEach(() => {
  vi.clearAllMocks();
  getProtocolByHash.mockResolvedValue(null);
  getNewAssetIds.mockResolvedValue([]);
  insertProtocol.mockResolvedValue({ error: null });
  uploadAssets.mockResolvedValue([
    {
      name: 'fixture.netcanvas',
      key: 'fixture-key',
      url: 'https://example.test/fixture.netcanvas',
    },
  ]);
});

describe('truthful protocol import failure messages', () => {
  it.each(['lookup', 'upload', 'save'])(
    'does not blame a valid protocol for a rejected %s request and permits retry',
    async (operation) => {
      const file = await archiveFile(
        JSON.stringify({
          schemaVersion: 9,
          name: 'Fixture',
          lastModified: '2026-09-05T00:00:00.000Z',
          // A schema-9 protocol ends at a finish stage.
          stages: [
            createDefaultFinishSessionStage({
              id: 'finish',
              localization: { defaultLocale: 'en', locales: ['en'] },
            }),
          ],
          codebook: { node: {}, edge: {}, ego: {} },
          localization: { defaultLocale: 'en', locales: ['en'] },
          assetManifest: {},
        }),
      );
      const failing =
        operation === 'lookup'
          ? getProtocolByHash
          : operation === 'upload'
            ? uploadAssets
            : insertProtocol;
      failing.mockRejectedValueOnce(new Error('Network request failed'));
      const { rerender } = render(view('en', file));
      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
      await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByText(
          'The protocol could not be imported. Check your connection and storage configuration, then try again.',
        ),
      ).toBeVisible();
      expect(
        screen.queryByText(
          'The uploaded file does not contain a valid protocol.',
        ),
      ).not.toBeInTheDocument();
      rerender(view('es', file));
      expect(
        screen.getByText(
          'No se pudo importar el protocolo. Comprueba tu conexión y la configuración del almacenamiento e inténtalo de nuevo.',
        ),
      ).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: 'Volver a intentarlo' }),
      );
      expect(
        await screen.findByText('Protocolo importado correctamente'),
      ).toBeVisible();
      await waitFor(() => expect(failing).toHaveBeenCalledTimes(2));
    },
  );

  it.each([
    [
      'non-archive',
      async () => new File(['not a zip archive'], 'fixture.netcanvas'),
      "This file isn't a Network Canvas protocol. Check that you chose the right file, and that it finished downloading.",
    ],
    [
      'damaged JSON',
      () => archiveFile('{broken json'),
      "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
    ],
  ])(
    'uses the owning-package explanation for %s before making server calls',
    async (_name, fileFactory, message) => {
      render(view('en', await fileFactory()));
      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(getProtocolByHash).not.toHaveBeenCalled();
      expect(uploadAssets).not.toHaveBeenCalled();
    },
  );

  // A schema 8 protocol that passes schema 8's checks, but whose filter counts
  // selected options against a fraction, which schema 9 refuses. The upgrade
  // returns an invalid document, which is a defect in a migration of ours.
  const unupgradableProtocol = () =>
    archiveFile(
      JSON.stringify({
        schemaVersion: 8,
        name: 'Fixture',
        lastModified: '2026-09-05T00:00:00.000Z',
        assetManifest: {},
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                context: {
                  name: 'context',
                  type: 'categorical',
                  options: [
                    { label: 'Work', value: 'work' },
                    { label: 'Family', value: 'family' },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage-info',
            type: 'Information',
            label: 'Information',
            title: 'Information',
            items: [{ id: 'item', type: 'text', content: 'Hello' }],
            skipLogic: {
              action: 'SHOW',
              filter: {
                join: 'AND',
                rules: [
                  {
                    id: 'rule',
                    type: 'node',
                    options: {
                      type: 'person',
                      attribute: 'context',
                      operator: 'OPTIONS_GREATER_THAN',
                      value: 1.5,
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    );

  it('reports a protocol it cannot upgrade as both a refusal and an application error', async () => {
    render(view('en', await unupgradableProtocol()));
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Upgrade to schema 9' }),
    );
    expect(
      await screen.findByText(
        'This protocol could not be upgraded to the current version. Nothing has been changed on this device.',
      ),
    ).toBeVisible();
    expect(captureClientEvent).toHaveBeenCalledWith('ProtocolImportFailed', {
      reason: 'upgradeStepFailed',
    });
    expect(captureClientException).toHaveBeenCalledTimes(1);
  });

  it('reports a damaged file as a refusal only', async () => {
    render(view('en', await archiveFile('{broken json')));
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
    expect(
      await screen.findByText(
        "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
      ),
    ).toBeVisible();
    expect(captureClientEvent).toHaveBeenCalledWith('ProtocolImportFailed', {
      reason: 'damagedJson',
    });
    expect(captureClientException).not.toHaveBeenCalled();
  });

  // A schema 8 protocol as schema 8's own validation accepts it.
  const schema8Protocol = (fileName?: string) =>
    archiveFile(
      JSON.stringify({
        schemaVersion: 8,
        name: 'Fixture',
        lastModified: '2026-09-05T00:00:00.000Z',
        assetManifest: {},
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {},
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage-info',
            type: 'Information',
            label: 'Information',
            title: 'Information',
            items: [{ id: 'item', type: 'text', content: 'Hello' }],
          },
        ],
      }),
      fileName,
    );

  it('imports a schema 8 protocol the researcher keeps, unchanged, at schema 8', async () => {
    render(view('en', await schema8Protocol()));
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

    expect(
      await screen.findByRole('dialog', {
        name: 'How do you want to import this protocol?',
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep schema 8' }));

    await waitFor(() => expect(insertProtocol).toHaveBeenCalledTimes(1));
    const [{ protocol }] = insertProtocol.mock.calls[0] as [
      { protocol: { schemaVersion: number; stages: { id: string }[] } },
    ];
    expect(protocol.schemaVersion).toBe(8);
    // Kept as it was: an upgrade would have added a finish stage.
    expect(protocol.stages.map((stage) => stage.id)).toEqual(['stage-info']);
    expect(captureClientException).not.toHaveBeenCalled();
  });

  it('asks about one file at a time, naming it, with its progress put away', async () => {
    uploadAssets.mockImplementation(async (files: File[]) =>
      files.map((file) => ({
        name: file.name,
        key: `${file.name}-key`,
        url: `https://example.test/${file.name}`,
      })),
    );
    render(
      view('en', [
        await schema8Protocol('first.netcanvas'),
        await schema8Protocol('second.netcanvas'),
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

    const question = { name: 'How do you want to import this protocol?' };
    const first = await screen.findByRole('dialog', question);
    expect(first).toHaveTextContent('first.netcanvas');
    expect(screen.getAllByRole('dialog', question)).toHaveLength(1);
    // The progress toast would cover the dialog's buttons.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'first.netcanvas' }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep schema 8' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', question)).toHaveTextContent(
        'second.netcanvas',
      ),
    );
    expect(screen.getAllByRole('dialog', question)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep schema 8' }));

    await waitFor(() => expect(insertProtocol).toHaveBeenCalledTimes(2));
  });

  it('imports nothing when the researcher cancels the choice', async () => {
    render(view('en', await unupgradableProtocol()));
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'How do you want to import this protocol?',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(getProtocolByHash).not.toHaveBeenCalled();
    expect(insertProtocol).not.toHaveBeenCalled();
  });

  it('asks nothing for a protocol already at the current schema', async () => {
    const file = await archiveFile(
      JSON.stringify({
        schemaVersion: 9,
        name: 'Fixture',
        lastModified: '2026-09-05T00:00:00.000Z',
        stages: [
          createDefaultFinishSessionStage({
            id: 'finish',
            localization: { defaultLocale: 'en', locales: ['en'] },
          }),
        ],
        codebook: { node: {}, edge: {}, ego: {} },
        localization: { defaultLocale: 'en', locales: ['en'] },
        assetManifest: {},
      }),
    );
    render(view('en', file));
    fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

    await waitFor(() => expect(insertProtocol).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', {
        name: 'How do you want to import this protocol?',
      }),
    ).not.toBeInTheDocument();
  });
});
