import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';

import { ExportDialog } from '../ExportDialog';
import type { ExportFlow } from '../useSessionMutations';

const building: ExportFlow = {
  phase: 'building',
  sessionCount: 2,
  stage: 'generating',
  current: 2,
  total: 10,
};

const idle: ExportFlow = { phase: 'idle' };

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

describe('export dialog exit', () => {
  /**
   * The flow goes idle the instant the export is dismissed. Returning null on
   * that — which is what this dialog used to do — unmounts it in the same
   * tick, and the `AnimatePresence` running its exit goes with it: the dialog
   * vanishes rather than closing. What proves the fix is WHEN it leaves, so
   * the dialog is held by reference: a closing one is taken out of the
   * accessibility tree at once while the element stays for the exit.
   */
  it('stays mounted through its exit rather than going with the flow', async () => {
    const { rerender } = render(view(building));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Exporting 2 interviews');

    rerender(view(idle));

    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  /**
   * And it keeps drawing the phase it was in while it goes: recomputed from
   * the idle flow, the footer would relabel its own primary action as the
   * dialog faded.
   */
  it('still shows the phase it was in while it animates out', () => {
    const { rerender } = render(view(building));

    const dialog = screen.getByRole('dialog');
    rerender(view(idle));

    expect(dialog).toHaveTextContent('Exporting 2 interviews');
  });

  it('shows nothing at all for a flow that was never open', () => {
    render(view(idle));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
