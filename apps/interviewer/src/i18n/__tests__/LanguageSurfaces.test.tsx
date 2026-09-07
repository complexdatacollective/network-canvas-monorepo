import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  OnboardingScreen,
  OnboardingScreenView,
} from '~/components/OnboardingScreen';
import { StatusRowView } from '~/components/StatusRow';

import { InterviewerI18nProvider } from '../InterviewerI18nProvider';
import { LOCALE_PREFERENCE_KEY } from '../preference';

const { enrolWithPin, refresh } = vi.hoisted(() => ({
  enrolWithPin: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ refresh }),
}));
vi.mock('~/lib/auth/api', () => ({
  status: vi.fn(async () => ({ configured: false })),
  enrolWithPin,
  enrolWithoutLock: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('~/lib/auth/useBiometric', () => ({
  useBiometric: () => ({ status: 'unavailable', reason: 'Test device' }),
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ enabled: false, setEnabled: vi.fn() }),
}));
vi.mock('~/lib/db/api', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  enrolWithPin.mockResolvedValue({ ok: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('offers the device language before starting setup and retains the choice on remount', async () => {
  const user = userEvent.setup();
  const onBegin = vi.fn();
  const view = () => (
    <InterviewerI18nProvider>
      <OnboardingScreenView onBegin={onBegin} />
    </InterviewerI18nProvider>
  );
  const first = render(view());
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'App language' }),
    'es',
  );
  await user.click(screen.getByRole('button', { name: 'Empezar' }));
  expect(onBegin).toHaveBeenCalledOnce();
  expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
  first.unmount();
  render(view());
  expect(
    screen.getByRole('combobox', { name: 'Idioma de la aplicación' }),
  ).toHaveValue('es');
  expect(
    screen.getByRole('heading', {
      name: 'Te damos la bienvenida a Network Canvas Interviewer',
    }),
  ).toBeVisible();
});

it('exposes a keyboard-operated language picker from the home footer', async () => {
  const user = userEvent.setup();
  render(
    <InterviewerI18nProvider>
      <StatusRowView
        protocolCount={1}
        interviewCount={0}
        mode="none"
        durability={null}
        installed={false}
      />
    </InterviewerI18nProvider>,
  );
  const opener = screen.getByRole('button', { name: 'App language' });
  opener.focus();
  await user.keyboard('{Enter}');
  const picker = await screen.findByRole('combobox', { name: 'App language' });
  await user.selectOptions(picker, 'es');
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(picker).toHaveFocus();
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Idioma de la aplicación' }),
    ).toHaveFocus(),
  );
  expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
});

it('changes language inside an open setup step without losing PIN values, refusal, or retry', async () => {
  const user = userEvent.setup();
  const vault = '{"version":5,"mode":"none"}';
  localStorage.setItem('interviewer:vault', vault);
  render(
    <InterviewerI18nProvider>
      <DialogProvider>
        <OnboardingScreen />
      </DialogProvider>
    </InterviewerI18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Setting up your device',
  });
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: 'App language' }),
    'es',
  );
  expect(dialog).toHaveAccessibleName('Configuración de tu dispositivo');
  await user.click(within(dialog).getByTestId('wizard-next'));
  await user.click(within(dialog).getByTestId('wizard-next'));
  await user.click(within(dialog).getByRole('option', { name: /Código PIN/ }));
  await user.click(within(dialog).getByTestId('wizard-next'));
  const pinFields = within(dialog).getByTestId('segmented-code-pin');
  const confirmFields = within(dialog).getByTestId(
    'segmented-code-pin-confirm',
  );
  for (const field of [pinFields, confirmFields]) {
    const inputs = within(field).getAllByLabelText(/oculto/);
    expect(inputs).toHaveLength(8);
    for (const input of inputs) await user.type(input, '1');
  }
  await user.click(
    within(dialog).getByRole('checkbox', {
      name: 'Entiendo que no hay posibilidad de recuperación',
    }),
  );
  await user.click(within(dialog).getByTestId('wizard-next'));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'No se pudo configurar el PIN.',
  );
  expect(enrolWithPin).toHaveBeenCalledExactlyOnceWith('11111111');
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: 'Idioma de la aplicación' }),
    'en',
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'PIN setup failed.',
  );
  expect(
    within(dialog).getByRole('checkbox', {
      name: 'I understand there is no recovery',
    }),
  ).toBeChecked();
  for (const field of [pinFields, confirmFields]) {
    const inputs = within(field).getAllByLabelText(/hidden/);
    expect(inputs).toHaveLength(8);
    for (const input of inputs) expect(input).toHaveValue('1');
  }
  expect(enrolWithPin).toHaveBeenCalledOnce();
  expect(localStorage.getItem('interviewer:vault')).toBe(vault);
  enrolWithPin.mockResolvedValue({ ok: true });
  await user.click(within(dialog).getByTestId('wizard-next'));
  await waitFor(() => expect(dialog).toHaveAccessibleName('Lock behavior'));
  expect(enrolWithPin).toHaveBeenCalledTimes(2);
  expect(
    within(dialog).getByRole('combobox', { name: 'App language' }),
  ).toHaveValue('en');
  expect(refresh).not.toHaveBeenCalled();
});
