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

  it('preserves the pathname when changing locale', () => {
    const onNavigate = vi.fn();
    renderWithIntl(<LanguageSelector onNavigate={onNavigate} />, 'es');

    fireEvent.click(screen.getByRole('button', { name: 'Inglés' }));

    expect(router.replace).toHaveBeenCalledWith('/get-started', {
      locale: 'en',
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('exposes a localized label and the active locale', () => {
    renderWithIntl(<LanguageSelector />, 'es');

    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Inglés' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
