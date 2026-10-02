import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { ExportWarning } from '@codaco/network-exporters/output';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';

import { ExportDialog } from '../ExportDialog';
import type { ExportFlow } from '../useSessionMutations';

const readyFlow = (warnings: ExportWarning[]): ExportFlow => ({
  phase: 'ready',
  blob: new Blob(['zip'], { type: 'application/zip' }),
  fileName: 'networkCanvasExport.zip',
  sessionIds: ['s1', 's2'],
  exportGraphML: true,
  exportCSV: true,
  failedCount: 0,
  warnings,
});

const view = (flow: ExportFlow) => (
  <AppI18nProvider
    locale="en"
    locales={interviewerProductionLocales}
    messages={interviewerCatalogs.en}
  >
    <ExportDialog
      flow={flow}
      onCancelBuild={vi.fn()}
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />
  </AppI18nProvider>
);

describe('the warning in the export dialog about characters removed from GraphML', () => {
  it('names the affected interviews and variables, and says the CSV files are unchanged', () => {
    render(
      view(
        readyFlow([
          {
            kind: 'xml-illegal-characters',
            sessionId: 's1',
            caseId: 'P-7',
            variables: ['Nickname', 'ニックネーム'],
            caseIdChanged: false,
          },
          {
            kind: 'xml-illegal-characters',
            sessionId: 's2',
            caseId: 'P-9',
            variables: ['Notes'],
            caseIdChanged: true,
          },
        ]),
      ),
    );

    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent(
      'Some characters were removed from the GraphML files',
    );
    expect(warning).toHaveTextContent(/removed from the GraphML files only/);
    expect(warning).toHaveTextContent(/CSV files keep every answer unchanged/);
    expect(
      within(warning)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Interview P-7: Nickname and ニックネーム',
      'Interview P-9: Case ID and Notes',
    ]);
  });

  it('is not shown when the archive lost nothing', () => {
    render(view(readyFlow([])));

    expect(screen.getByRole('dialog')).toHaveTextContent('Archive ready');
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.queryByText('Some characters were removed from the GraphML files'),
    ).toBeNull();
  });
});
