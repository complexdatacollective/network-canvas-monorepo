import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';

import {
  InterviewerI18nProvider,
  useInterviewerLocale,
} from '../InterviewerI18nProvider';
import { LanguageSettings } from '../LanguageSettings';
import { ParticipantLanguageBoundary } from '../ParticipantLanguageBoundary';
import { LOCALE_PREFERENCE_KEY } from '../preference';

function Probe({ id }: { id: string }) {
  const intl = useAppIntl();
  const { locale, direction } = useAppLocale();
  const { setPreference } = useInterviewerLocale();
  return (
    <section aria-label={id}>
      <output aria-label="Locale">{locale}</output>
      <output aria-label="Direction">{direction}</output>
      <p>
        {intl.formatMessage({
          id: 'interviewer.language.label',
          defaultMessage: 'App language',
          description:
            'Language label used to observe the provider during this test.',
        })}
      </p>
      <button onClick={() => setPreference('unknown-tag')}>
        Invalid choice
      </button>
    </section>
  );
}

function Harness() {
  return (
    <InterviewerI18nProvider>
      <LanguageSettings />
      <Probe id="Administration" />
      <ParticipantLanguageBoundary>
        <Probe id="Participant" />
      </ParticipantLanguageBoundary>
    </InterviewerI18nProvider>
  );
}

function setBrowserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
}
const adminLocale = () =>
  within(screen.getByRole('region', { name: 'Administration' })).getByLabelText(
    'Locale',
  );

beforeEach(() => {
  localStorage.clear();
  setBrowserLanguages(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

describe('device administration language', () => {
  it.each([
    [null, ['es-MX'], 'es'],
    ['en-GB', ['es'], 'en-GB'],
    ['es-AR', ['en-US'], 'es'],
    ['bad_tag', ['es-ES'], 'es'],
    ['de', ['es'], 'es'],
    [null, ['fr-CA'], 'en'],
    [null, [], 'en'],
  ] as const)(
    'resolves stored %s with browser %j to %s',
    (stored, requested, expected) => {
      if (stored !== null) localStorage.setItem(LOCALE_PREFERENCE_KEY, stored);
      setBrowserLanguages([...requested]);
      render(<Harness />);
      expect(adminLocale()).toHaveTextContent(expected);
      expect(document.documentElement).toHaveAttribute('lang', expected);
      expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    },
  );

  it('switches immediately, persists after remount, and resets to automatic', async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'App language' });
    expect(
      within(select).getByRole('option', { name: 'Español' }),
    ).toHaveAttribute('lang', 'es');
    await user.selectOptions(select, 'es');
    expect(
      screen.getByRole('combobox', { name: 'Idioma de la aplicación' }),
    ).toHaveValue('es');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'Preferencia de idioma guardada en este dispositivo.',
    );
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
    first.unmount();
    render(<Harness />);
    expect(adminLocale()).toHaveTextContent('es');
    setBrowserLanguages(['en-GB']);
    await user.selectOptions(screen.getByRole('combobox'), '__automatic');
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBeNull();
    expect(adminLocale()).toHaveTextContent('en-GB');
  });

  it('follows browser changes only while automatic and synchronizes another tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    setBrowserLanguages(['es-CL']);
    act(() => {
      window.dispatchEvent(new Event('languagechange'));
    });
    expect(adminLocale()).toHaveTextContent('es');
    await user.selectOptions(screen.getByRole('combobox'), 'en-GB');
    act(() => {
      window.dispatchEvent(new Event('languagechange'));
    });
    expect(adminLocale()).toHaveTextContent('en-GB');
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
    await act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: LOCALE_PREFERENCE_KEY }),
      ),
    );
    expect(adminLocale()).toHaveTextContent('es');
  });

  it('keeps participant copy and language separate while preserving unrelated device data', async () => {
    const user = userEvent.setup();
    const vault = '{"version":5,"mode":"none"}';
    localStorage.setItem('interviewer:vault', vault);
    render(<Harness />);
    await user.selectOptions(screen.getByRole('combobox'), 'es');
    const participant = screen.getByRole('region', { name: 'Participant' });
    expect(within(participant).getByLabelText('Locale')).toHaveTextContent(
      'en',
    );
    expect(within(participant).getByText('App language')).toBeVisible();
    expect(screen.getByTestId('participant-language-boundary')).toHaveAttribute(
      'lang',
      'en',
    );
    expect(screen.getByTestId('participant-language-boundary')).toHaveAttribute(
      'dir',
      'ltr',
    );
    expect(document.documentElement).toHaveAttribute('lang', 'es');
    expect(localStorage.getItem('interviewer:vault')).toBe(vault);
    await user.click(
      within(screen.getByRole('region', { name: 'Administration' })).getByRole(
        'button',
      ),
    );
    expect(adminLocale()).toHaveTextContent('es');
  });

  it('applies the language and announces when storage cannot persist it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await user.selectOptions(screen.getByRole('combobox'), 'es');
    expect(adminLocale()).toHaveTextContent('es');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'no se pudo guardar la preferencia',
    );
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBeNull();
  });

  it('starts in the browser language when reading storage is blocked', () => {
    setBrowserLanguages(['es']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    render(<Harness />);
    expect(adminLocale()).toHaveTextContent('es');
  });

  it('does not persist the development pseudo locale over a real preference', async () => {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByRole('combobox'), 'en-XA');
    expect(adminLocale()).toHaveTextContent('en-XA');
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
  });
});
