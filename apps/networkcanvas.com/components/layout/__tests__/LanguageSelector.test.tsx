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
      name: 'Inglés (Reino Unido)',
    });
    fireEvent.mouseDown(englishOption);
    fireEvent.click(englishOption);

    expect(router.replace).toHaveBeenCalledWith('/get-started', {
      locale: 'en-GB',
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('shows only the active country flag in the trigger', () => {
    renderWithIntl(<LanguageSelector />, 'es');

    const trigger = screen.getByRole('combobox', { name: 'Idioma' });
    expect(trigger).toHaveTextContent('🇪🇸');
    expect(trigger).not.toHaveTextContent('Español');
  });

  it('uses distinct flags for US and UK English', async () => {
    renderWithIntl(<LanguageSelector />, 'en-US');

    const trigger = screen.getByRole('combobox', { name: 'Language' });
    expect(trigger).toHaveTextContent('🇺🇸');

    fireEvent.click(trigger);
    expect(
      await screen.findByRole('option', {
        name: 'English (United Kingdom)',
      }),
    ).toHaveTextContent('🇬🇧');
  });
});
