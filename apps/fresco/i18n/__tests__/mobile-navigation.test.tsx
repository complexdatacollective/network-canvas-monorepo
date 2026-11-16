import { DirectionProvider } from '@base-ui/react/direction-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { MobileNavDrawer } from '~/app/dashboard/_components/MobileNavDrawer';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogSource } from '~/src/locales/catalogs';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('~/actions/auth', () => ({ logout: vi.fn() }));
vi.mock('~/i18n/FrescoLocaleSwitcher', () => ({
  default: () => <button type="button">Interface language</button>,
}));

// Loaded up front, so every render and formatter below has Spanish
// synchronously.
await frescoCatalogSource.load('es');

const view = (locale: string) => (
  <AppI18nProvider
    locale={locale}
    locales={frescoLocales}
    messages={frescoCatalogSource.peek(locale)}
  >
    <MobileNavDrawer />
  </AppI18nProvider>
);

describe('Fresco mobile navigation locale changes', () => {
  it('names the dialog and keeps focus on the same route link when labels change', async () => {
    const { rerender } = render(view('en'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Mobile navigation' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Interface language' }),
    ).toBeVisible();
    const participantLink = screen.getByRole('link', { name: 'Participants' });
    participantLink.focus();
    expect(participantLink).toHaveFocus();
    rerender(view('es'));
    expect(
      screen.getByRole('dialog', { name: 'Navegación móvil' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Participantes' })).toBe(
      participantLink,
    );
    expect(participantLink).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar menú de navegación' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the side Fresco’s mobile navigation slides in from', () => {
  // Motion writes where an element starts from into its style before the
  // first frame, which is where the menu is caught here.
  const openMenu = (direction: 'ltr' | 'rtl') => {
    render(
      <AppI18nProvider
        locale="en"
        locales={frescoLocales}
        messages={frescoCatalogSource.peek('en')}
      >
        {/* Nearer the menu than the language's own direction, which it
            stands in for: no language Fresco offers is right-to-left. */}
        <DirectionProvider direction={direction}>
          <MobileNavDrawer />
        </DirectionProvider>
      </AppI18nProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    return screen.getByRole('dialog', { name: 'Mobile navigation' });
  };

  it('is beyond the right edge the menu is drawn against', () => {
    expect(openMenu('ltr').style.transform).toContain('translateX(100%)');
  });

  it('is beyond the left edge in a right-to-left language', () => {
    expect(openMenu('rtl').style.transform).toContain('translateX(-100%)');
  });
});
