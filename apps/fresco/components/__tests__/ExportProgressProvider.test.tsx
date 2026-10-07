import { Toast } from '@base-ui/react/toast';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { Toaster } from '@codaco/fresco-ui/Toast';
import type { ExportWarning } from '@codaco/network-exporters/output';
import {
  ExportProgressProvider,
  useExportProgress,
} from '~/components/ExportProgressProvider';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

const { runBatchedExport } = vi.hoisted(() => ({ runBatchedExport: vi.fn() }));
vi.mock('~/lib/export/runBatchedExport', () => ({ runBatchedExport }));
vi.mock('~/actions/interviews', () => ({
  commitInterviewExport: vi.fn(() => Promise.resolve({ error: null })),
}));
vi.mock('~/hooks/useDownload', () => ({ useDownload: () => vi.fn() }));
vi.mock('~/lib/posthog-client', () => ({ captureClientException: vi.fn() }));

function StartExport() {
  const { startExport } = useExportProgress();
  return (
    <button
      type="button"
      onClick={() =>
        startExport(['interview-1'], {
          exportCSV: true,
          exportGraphML: true,
          globalOptions: {
            useScreenLayoutCoordinates: false,
            screenLayoutHeight: 800,
            screenLayoutWidth: 1200,
          },
        })
      }
    >
      Start test export
    </button>
  );
}

const view = (
  <AppI18nProvider
    locale="en"
    locales={frescoLocales}
    messages={frescoCatalogs.en}
  >
    <Toast.Provider>
      <ExportProgressProvider>
        <StartExport />
        <Toaster />
      </ExportProgressProvider>
    </Toast.Provider>
  </AppI18nProvider>
);

const finishedExport = (warnings: ExportWarning[]) => ({
  blob: new Blob(['zip'], { type: 'application/zip' }),
  exportedIds: ['interview-1'],
  failedIds: [],
  warnings,
});

beforeEach(() => {
  runBatchedExport.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
});

describe('the warning after an export that removed characters from GraphML', () => {
  it('names the affected interviews and variables, and says the CSV files are unchanged', async () => {
    runBatchedExport.mockResolvedValue(
      finishedExport([
        {
          kind: 'xml-illegal-characters',
          sessionId: 'session-1',
          caseId: 'P-7',
          variables: ['Nickname', 'ニックネーム'],
          caseIdChanged: false,
        },
        {
          kind: 'xml-illegal-characters',
          sessionId: 'session-2',
          caseId: 'P-9',
          variables: ['Notes'],
          caseIdChanged: true,
        },
      ]),
    );
    render(view);

    fireEvent.click(screen.getByRole('button', { name: 'Start test export' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Some characters were removed from the GraphML files',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/removed from the GraphML files only/),
    ).toBeVisible();
    expect(
      screen.getByText(/CSV files keep every answer unchanged/),
    ).toBeVisible();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      'Interview P-7: Nickname and ニックネーム',
      'Interview P-9: Case ID and Notes',
    ]);
  });

  it('is not raised for an export that lost nothing', async () => {
    runBatchedExport.mockResolvedValue(finishedExport([]));
    render(view);

    fireEvent.click(screen.getByRole('button', { name: 'Start test export' }));

    expect(
      await screen.findByRole('heading', { name: 'Export complete' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: 'Some characters were removed from the GraphML files',
      }),
    ).toBeNull();
  });
});

describe('the warnings after an export that renamed columns or changed protocol text', () => {
  it('raises one toast for each kind of warning, listing what each affected', async () => {
    runBatchedExport.mockResolvedValue(
      finishedExport([
        {
          kind: 'column-renamed',
          protocolName: 'Friendship study',
          format: 'csv',
          entity: 'node',
          entityTypeName: 'Person',
          variable: 'nodeID',
          column: 'nodeID',
          renamedTo: 'nodeID_2',
        },
        {
          kind: 'xml-illegal-characters-in-protocol',
          protocolName: 'Friendship study',
          text: 'node-type-name',
          name: 'Person',
          removed: ['U+0007'],
        },
        {
          kind: 'column-renamed',
          protocolName: 'Friendship study',
          format: 'graphml',
          entity: 'node',
          entityTypeName: 'Person',
          variable: 'Colour',
          column: 'Colour_red',
          renamedTo: 'Colour_red_2',
        },
      ]),
    );
    render(view);

    fireEvent.click(screen.getByRole('button', { name: 'Start test export' }));

    const renamedTitle = await screen.findByRole('heading', {
      name: 'Some columns were given new names',
    });
    const protocolTitle = screen.getByRole('heading', {
      name: 'Some characters were removed from protocol text in the GraphML files',
    });
    expect(renamedTitle).toBeVisible();
    expect(protocolTitle).toBeVisible();
    expect(screen.getByText(/so that no answers are lost/i)).toBeVisible();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(
      expect.arrayContaining([
        'The node type name “Person” in Friendship study, with U+0007 removed',
        'In the CSV files of Friendship study, the Person column “nodeID” was written as “nodeID_2”.',
        'In the GraphML files of Friendship study, the Person column “Colour_red”, from the variable Colour, was written as “Colour_red_2”.',
      ]),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
