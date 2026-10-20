import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppLocale } from '@codaco/app-i18n/react';

import { interviewerCatalogSource } from '../../locales/catalogs';
import { InterviewerI18nProvider } from '../InterviewerI18nProvider';
import { LanguageSettings } from '../LanguageSettings';
import { LOCALE_PREFERENCE_KEY } from '../preference';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) starts in the language
// Interviewer 9 keeps under the shared key, and a language chosen there
// applies to that page only: nothing passes from Interviewer 8 to
// Interviewer 9, so the key is never written.

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  IS_SUBPATH_BUILD: true,
}));

await Promise.all(
  ['es', 'fr'].map((locale) => interviewerCatalogSource.load(locale)),
);

function Probe() {
  const { locale } = useAppLocale();
  return <output aria-label="Locale">{locale}</output>;
}

function Harness() {
  return (
    <InterviewerI18nProvider>
      <LanguageSettings />
      <Probe />
    </InterviewerI18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
});
afterEach(() => vi.restoreAllMocks());

describe('the language in a /v8/ build', () => {
  it("starts in Interviewer 9's language", () => {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'fr');
    render(<Harness />);

    expect(screen.getByLabelText('Locale')).toHaveTextContent('fr');
  });

  it('switches for this page without writing the shared preference', async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'fr');
    render(<Harness />);

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    expect(screen.getByLabelText('Locale')).toHaveTextContent('es');
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('fr');
    // Nothing claims the choice was saved on this device.
    expect(
      within(screen.getByRole('status', { name: '' })).queryByText(/guardada/i),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), '__automatic');

    expect(screen.getByLabelText('Locale')).toHaveTextContent('en');
    expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('fr');
  });
});
