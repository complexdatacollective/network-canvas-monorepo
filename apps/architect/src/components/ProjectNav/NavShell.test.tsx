import { DirectionProvider } from '@base-ui/react/direction-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';
import { NAV_HEIGHT_VARIABLE } from '~/utils/navHeight';

import NavShell from './NavShell';

const publishedHeight = () =>
  document.documentElement.style.getPropertyValue(NAV_HEIGHT_VARIABLE);

afterEach(() => {
  document.documentElement.style.removeProperty(NAV_HEIGHT_VARIABLE);
});

/**
 * The bar is sticky and paints above the page, so anything else that sticks to
 * the top — the stage editor's section list — has to start below it, and
 * anything scrolled into view has to land below it. Neither can be written as
 * a number: the bar's pill wraps at narrow widths, what it holds changes from
 * screen to screen, and the type scale is responsive. So the bar measures
 * itself and says how tall it is.
 */
describe('the height Architect’s navigation bar publishes', () => {
  it('is the measured height of the header, on the document root', async () => {
    render(
      <ArchitectI18nProvider>
        <NavShell />
      </ArchitectI18nProvider>,
    );

    // 600px is the height the test environment's `ResizeObserver` reports for
    // every element it is asked about; what matters is that the published
    // value is the OBSERVED one and carries a unit, not a constant written
    // into the component.
    await waitFor(() => {
      expect(publishedHeight()).toBe('600px');
    });
  });

  it('never publishes a bar of no height', () => {
    render(
      <ArchitectI18nProvider>
        <NavShell />
      </ArchitectI18nProvider>,
    );

    // Read synchronously, before anything has been laid out: the header
    // measures zero here, and a zero published would put everything anchored
    // to the bar back underneath it — which is the fault this exists to fix —
    // for as long as the zero stood. The stylesheet's starting value holds
    // instead, so the variable still resolves.
    expect(publishedHeight()).not.toBe('0px');
  });

  it('takes the value away again when the bar goes', async () => {
    const { unmount } = render(
      <ArchitectI18nProvider>
        <NavShell />
      </ArchitectI18nProvider>,
    );

    await waitFor(() => {
      expect(publishedHeight()).toBe('600px');
    });

    // A screen with no bar on it must fall back to the stylesheet's value
    // rather than keep reserving room for a bar that is not there.
    unmount();

    expect(publishedHeight()).toBe('');
  });
});

describe('the menu Architect’s navigation bar opens on a narrow screen', () => {
  // Motion writes where an element starts from into its style before the
  // first frame, which is where the menu is caught here.
  const openMenu = (direction: 'ltr' | 'rtl') => {
    render(
      <ArchitectI18nProvider>
        {/* Nearer the bar than the language's own direction, which it
            stands in for: no language Architect offers is right-to-left. */}
        <DirectionProvider direction={direction}>
          <NavShell />
        </DirectionProvider>
      </ArchitectI18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    return screen.getByRole('dialog');
  };

  it('slides in from beyond the right edge it is drawn against', () => {
    expect(openMenu('ltr').style.transform).toContain('translateX(100%)');
  });

  it('slides in from beyond the left edge in a right-to-left language', () => {
    expect(openMenu('rtl').style.transform).toContain('translateX(-100%)');
  });
});
