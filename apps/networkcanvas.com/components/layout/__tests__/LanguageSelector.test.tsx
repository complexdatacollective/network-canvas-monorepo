import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { LanguageSelector } from '../LanguageSelector';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('~/lib/i18n/navigation', () => ({
  usePathname: () => '/get-started',
  useRouter: () => router,
}));

describe('LanguageSelector', () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  afterEach(cleanup);

  it('preserves the pathname when changing locale', async () => {
    const onNavigate = vi.fn();
    renderWithIntl(<LanguageSelector onNavigate={onNavigate} />, 'es');

    fireEvent.click(screen.getByRole('combobox', { name: 'Idioma' }));
    const englishOption = await screen.findByRole('option', {
      name: 'English (United Kingdom)',
    });
    fireEvent.mouseDown(englishOption);
    fireEvent.click(englishOption);

    expect(router.replace).toHaveBeenCalledWith('/get-started', {
      locale: 'en-GB',
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('shows the active language tag and exposes its name to assistive technology', () => {
    renderWithIntl(<LanguageSelector />, 'es');

    const trigger = screen.getByRole('combobox', { name: 'Idioma' });
    expect(trigger).toHaveTextContent('es');
    expect(trigger).toHaveTextContent('Español');
    expect(trigger.querySelector('.sr-only')).toHaveTextContent('Español');
  });

  it('uses distinct language tags for US and UK English', async () => {
    renderWithIntl(<LanguageSelector />, 'en-US');

    const trigger = screen.getByRole('combobox', { name: 'Language' });
    expect(trigger).toHaveTextContent('en-US');

    fireEvent.click(trigger);
    expect(
      await screen.findByRole('option', {
        name: 'English (United Kingdom)',
      }),
    ).toHaveTextContent('English (United Kingdom)');
  });

  it('finds a language by its English name or unaccented native name', async () => {
    renderWithIntl(<LanguageSelector />, 'en-US');

    fireEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    const search = await screen.findByPlaceholderText('Search languages...');

    fireEvent.change(search, { target: { value: 'Spanish' } });
    expect(
      await screen.findByRole('option', { name: 'Español' }),
    ).toBeVisible();

    fireEvent.change(search, { target: { value: 'Espanol' } });
    expect(
      await screen.findByRole('option', { name: 'Español' }),
    ).toBeVisible();
  });
});
