import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';

import {
  InterviewerI18nProvider,
  useInterviewerLocale,
} from '../InterviewerI18nProvider';
import { LOCALE_PREFERENCE_KEY } from '../preference';

// Spanish loads only when the test releases it, so the switch can be observed
// while its catalog is still in flight.
const spanish = vi.hoisted(() => {
  let release = (_catalog: CatalogMessages) => {};
  const loaded = new Promise<{ default: CatalogMessages }>((resolve) => {
    release = (catalog) => resolve({ default: catalog });
  });
  return {
    load: () => loaded,
    release: (catalog: CatalogMessages) => release(catalog),
  };
});

vi.mock('../../locales/catalogs', async () => {
  const { createCatalogSource } = await import('@codaco/app-i18n/locales');
  return {
    interviewerCatalogSource: createCatalogSource({ es: spanish.load }),
  };
});

const label = {
  id: 'interviewer.language.label',
  defaultMessage: 'App language',
  description: 'Language label used to observe the provider during this test.',
};

function Probe() {
  const intl = useAppIntl();
  const { locale } = useAppLocale();
  const reported = useInterviewerLocale();
  return (
    <>
      <output aria-label="Rendered">{locale}</output>
      <output aria-label="Reported">{reported.locale}</output>
      <output aria-label="Preference">{reported.preference}</output>
      <p>{intl.formatMessage(label)}</p>
      <button onClick={() => reported.setPreference('es')}>Spanish</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

it('keeps the language on screen, and reports it, until a switch has loaded', async () => {
  const user = userEvent.setup();
  render(
    <InterviewerI18nProvider>
      <Probe />
    </InterviewerI18nProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Spanish' }));
  // The choice is saved at once; the interface waits for its words.
  expect(screen.getByLabelText('Preference')).toHaveTextContent('es');
  expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
  expect(screen.getByLabelText('Rendered')).toHaveTextContent('en');
  expect(screen.getByLabelText('Reported')).toHaveTextContent('en');
  expect(document.documentElement).toHaveAttribute('lang', 'en');
  expect(screen.getByText('App language')).toBeInTheDocument();

  await act(async () =>
    spanish.release({ [label.id]: 'Idioma de la aplicación' }),
  );
  expect(screen.getByLabelText('Rendered')).toHaveTextContent('es');
  expect(screen.getByLabelText('Reported')).toHaveTextContent('es');
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(screen.getByText('Idioma de la aplicación')).toBeInTheDocument();
});
