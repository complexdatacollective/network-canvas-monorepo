import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';

import { ExportDialog } from '../ExportDialog';
import type { ExportFlow } from '../useSessionMutations';

const flow: ExportFlow = {
  phase: 'building',
  sessionCount: 2,
  stage: 'generating',
  current: 2,
  total: 10,
};

describe('export progress localization', () => {
  it('reformats the stable stage and controls when the active locale changes during a build', async () => {
    const cancel = vi.fn();
    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={interviewerProductionLocales}
        messages={interviewerCatalogs[locale]}
      >
        <ExportDialog
          flow={flow}
          onCancelBuild={cancel}
          onSave={vi.fn()}
          onDismiss={vi.fn()}
        />
      </AppI18nProvider>
    );
    const result = render(view('en'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Exporting 2 interviews',
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Generating files...');
    result.rerender(view('es'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Exportando 2 entrevistas',
    );
    expect(screen.getByText('2 de 10 archivos')).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveTextContent('Generando archivos…');
    expect(screen.queryByText('Generating files...')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
