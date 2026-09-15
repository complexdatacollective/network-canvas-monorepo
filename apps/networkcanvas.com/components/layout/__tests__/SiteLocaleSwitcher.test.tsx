import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { SiteLocaleSwitcher } from '../SiteLocaleSwitcher';

const { switchLocale, readLocalePreference } = vi.hoisted(() => ({
  switchLocale: vi.fn(),
  readLocalePreference: vi.fn<() => string | null>(),
}));

vi.mock('~/lib/i18n/navigation', () => ({
  usePathname: () => '/get-started',
}));

vi.mock('~/lib/i18n/clientLocale', () => ({
  switchLocale,
  readLocalePreference,
}));

const trigger = () => screen.getByRole('combobox');

const open = async () => {
  fireEvent.click(trigger());
  return screen.findByRole('dialog', {
    name: /^(Interface language|Idioma de la interfaz)$/,
  });
};

const choose = async (name: string) => {
  const popover = screen.getByRole('dialog');
  fireEvent.click(screen.getByRole('option', { name }));
  await waitFor(() => expect(popover).not.toBeInTheDocument());
};

describe('SiteLocaleSwitcher', () => {
  beforeEach(() => {
    switchLocale.mockClear();
    readLocalePreference.mockReturnValue(null);
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('preserves the pathname when changing locale', async () => {
    readLocalePreference.mockReturnValue('es');
    renderWithIntl(<SiteLocaleSwitcher />, 'es');

    await open();
    await choose('English (United Kingdom)');

    expect(switchLocale).toHaveBeenCalledWith('en-GB', '/get-started');
  });

  it('names the stored language on the trigger', async () => {
    readLocalePreference.mockReturnValue('es');
    renderWithIntl(<SiteLocaleSwitcher />, 'es');

    await waitFor(() =>
      expect(trigger()).toHaveAccessibleName('Idioma de la interfaz: Español'),
    );
    expect(trigger()).toHaveTextContent('Español');
  });

  it('reports the negotiated language when no preference is stored', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB', 'en']);
    renderWithIntl(<SiteLocaleSwitcher />, 'es');

    await waitFor(() =>
      expect(trigger()).toHaveAccessibleName(
        'Idioma de la interfaz: Automático (English (United Kingdom))',
      ),
    );
    expect(trigger()).toHaveTextContent('English (United Kingdom)');
  });

  it('stores no preference when the automatic entry is chosen', async () => {
    readLocalePreference.mockReturnValue('es');
    renderWithIntl(<SiteLocaleSwitcher />, 'es');

    await open();
    await choose('Automático (English (United States))');

    expect(switchLocale).toHaveBeenCalledWith(null, '/get-started');
  });

  it('offers every site locale under its own language tag', async () => {
    renderWithIntl(<SiteLocaleSwitcher />, 'en-US');

    await open();

    for (const name of [
      'English (United States)',
      'English (United Kingdom)',
      'Español',
    ]) {
      expect(screen.getByRole('option', { name })).toBeVisible();
    }
    expect(
      screen
        .getByRole('option', { name: 'Español' })
        .querySelector('[lang=es]'),
    ).toHaveTextContent('Español');
  });
});
