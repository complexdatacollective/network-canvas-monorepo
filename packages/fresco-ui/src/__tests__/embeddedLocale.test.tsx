import { DirectionProvider } from '@base-ui/react/direction-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';

import {
  getKeyboardDragAnnouncement,
  useAccessibilityAnnouncements,
} from '../dnd/useAccessibilityAnnouncements';
import SegmentedCodeField from '../form/fields/SegmentedCodeField';
import { frescoUiCatalogs } from '../locales/catalogs';

describe('controls embedded in a separately localized region', () => {
  it('marks an out-of-tree live region with its own language without replacing it or changing the document', () => {
    document.documentElement.lang = 'en-GB';
    function Announce() {
      const intl = useAppIntl();
      const { announce } = useAccessibilityAnnouncements();
      return (
        <button
          onClick={() =>
            announce(getKeyboardDragAnnouncement('cancel', undefined, intl))
          }
        >
          Announce
        </button>
      );
    }
    const renderInLocale = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={frescoUiCatalogs[locale]}
        manageDocument={false}
      >
        <DirectionProvider direction="ltr">
          <Announce />
        </DirectionProvider>
      </AppI18nProvider>
    );
    const view = render(renderInLocale('es'));
    fireEvent.click(screen.getByRole('button', { name: 'Announce' }));
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Arrastre cancelado');
    expect(region).toHaveAttribute('lang', 'es');
    expect(region).toHaveAttribute('dir', 'ltr');
    expect(region.parentElement).toBe(document.body);
    view.rerender(renderInLocale('en'));
    fireEvent.click(screen.getByRole('button', { name: 'Announce' }));
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Drag cancelled');
    expect(region).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
    view.unmount();
    expect(region.isConnected).toBe(false);
  });

  it('fulfills deferred autofocus once and preserves later focus through locale and disabled changes', async () => {
    const control = (locale: string, disabled: boolean) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={frescoUiCatalogs[locale]}
        manageDocument={false}
      >
        <SegmentedCodeField
          segments={4}
          name="pin"
          autoFocus
          disabled={disabled}
        />
        <button>Another control</button>
      </AppI18nProvider>
    );
    const view = render(control('es', true));
    const first = screen.getByRole('textbox', { name: 'Dígito 1 de 4' });
    expect(first).toBeDisabled();
    view.rerender(control('es', false));
    await waitFor(() => expect(first).toHaveFocus());
    const other = screen.getByRole('button', { name: 'Another control' });
    other.focus();
    view.rerender(control('en', false));
    expect(screen.getByRole('textbox', { name: 'Digit 1 of 4' })).toBe(first);
    expect(other).toHaveFocus();
    view.rerender(control('en', true));
    view.rerender(control('en', false));
    expect(other).toHaveFocus();
  });
});
