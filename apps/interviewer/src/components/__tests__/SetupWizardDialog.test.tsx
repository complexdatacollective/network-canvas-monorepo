import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { WizardDialog } from '@codaco/fresco-ui/dialogs/DialogProvider';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';
import { renderedMessage } from '~/testUtils/renderedMessage';

const {
  mockEnrolWithoutLock,
  mockGetSettings,
  mockOpenDialog,
  mockRefresh,
  mockRevoke,
  mockSetAnalyticsEnabled,
  mockStatus,
  mockToastAdd,
  mockUpdateSettings,
} = vi.hoisted(() => ({
  mockEnrolWithoutLock: vi.fn(),
  mockGetSettings: vi.fn(),
  mockOpenDialog: vi.fn(),
  mockRefresh: vi.fn(),
  mockRevoke: vi.fn(),
  mockSetAnalyticsEnabled: vi.fn(),
  mockStatus: vi.fn(),
  mockToastAdd: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mockOpenDialog }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: mockToastAdd }),
}));

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({
    enabled: false,
    setEnabled: mockSetAnalyticsEnabled,
  }),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ refresh: mockRefresh }),
}));

vi.mock('~/lib/auth/api', () => ({
  enrolWithoutLock: mockEnrolWithoutLock,
  revoke: mockRevoke,
  status: mockStatus,
}));

vi.mock('~/lib/db/api', () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));

import { useSetupWizard } from '../SetupWizardDialog';

function SetupLauncher() {
  const { openSetupWizard } = useSetupWizard({ preserveExistingData: true });
  return (
    <button type="button" onClick={() => void openSetupWizard()}>
      Launch setup
    </button>
  );
}

beforeEach(() => {
  mockGetSettings.mockResolvedValue({ analyticsEnabled: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings-launched setup wizard', () => {
  it('keeps a newly configured lock when the wizard is dismissed', async () => {
    mockOpenDialog.mockResolvedValue(null);
    mockStatus.mockResolvedValue({
      configured: true,
      locked: false,
      mode: 'pin',
    });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockEnrolWithoutLock).not.toHaveBeenCalled();
    expect(mockOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelLabel: renderedMessage('Exit setup'),
        confirmCancel: expect.objectContaining({
          primaryLabel: renderedMessage('Exit setup'),
        }),
      }),
    );
  });

  it('leaves the vault unconfigured when dismissed before enrolment', async () => {
    mockOpenDialog.mockResolvedValue(null);

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockStatus).not.toHaveBeenCalled();
    expect(mockEnrolWithoutLock).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('preserves an existing analytics opt-out when the toggle is untouched', async () => {
    mockGetSettings.mockResolvedValue({ analyticsEnabled: false });
    mockOpenDialog.mockResolvedValue({
      selectedMethod: 'pin',
      enrolmentCommitted: true,
    });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockSetAnalyticsEnabled).toHaveBeenCalledWith(false);
  });

  it('preserves stored analytics opt-in before the provider has loaded it', async () => {
    mockOpenDialog.mockResolvedValue({
      selectedMethod: 'pin',
      enrolmentCommitted: true,
    });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockGetSettings).toHaveBeenCalledOnce();
    expect(mockSetAnalyticsEnabled).toHaveBeenCalledWith(true);
  });

  it('refreshes auth when a post-enrolment settings write fails', async () => {
    mockOpenDialog.mockResolvedValue({
      selectedMethod: 'pin',
      enrolmentCommitted: true,
    });
    mockUpdateSettings.mockRejectedValue(new Error('settings unavailable'));

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: renderedMessage('Setup could not be completed'),
        description: renderedMessage(
          'Something went wrong while setting up this device. Please try again.',
        ),
      }),
    );
  });
});

it('keeps queued wizard copy reactive after opening', async () => {
  mockOpenDialog.mockImplementation(() => new Promise(() => {}));
  const launcher = render(<SetupLauncher />);
  await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));
  await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledOnce());
  const queued = mockOpenDialog.mock.calls[0]?.[0] as WizardDialog | undefined;
  if (!queued || queued.type !== 'wizard')
    throw new Error('The setup wizard was not queued');
  const step = queued.steps[0];
  if (!step) throw new Error('The setup introduction is missing');
  const Content = step.content;
  launcher.unmount();
  const queuedView = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={interviewerProductionLocales}
      messages={interviewerCatalogs[locale]}
    >
      <h1>{step.title}</h1>
      <Content />
      <button>{queued.cancelLabel}</button>
      <h2>{queued.confirmCancel?.title}</h2>
      <p>{queued.confirmCancel?.description}</p>
    </AppI18nProvider>
  );
  const view = render(queuedView('en'));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Setting up your device',
  );
  view.rerender(queuedView('es'));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Configuración de tu dispositivo',
  );
  expect(
    screen.getByText(/Configurar tu dispositivo es rápido y sencillo/),
  ).toBeVisible();
  expect(screen.getByRole('button')).toHaveTextContent(
    'Salir de la configuración',
  );
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    '¿Salir de la configuración?',
  );
});
