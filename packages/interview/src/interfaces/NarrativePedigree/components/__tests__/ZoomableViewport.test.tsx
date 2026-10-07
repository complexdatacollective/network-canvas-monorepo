import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ZoomableViewport from '../ZoomableViewport';

function renderViewport(
  overrides: Partial<Parameters<typeof ZoomableViewport>[0]> = {},
) {
  return render(
    <ZoomableViewport toolbarLabel="Zoom controls" {...overrides}>
      <div style={{ width: 400, height: 300 }}>pedigree content</div>
    </ZoomableViewport>,
  );
}

function zoomLevel(): string | null {
  return screen.getByTestId('np-zoom-content').getAttribute('data-zoom-level');
}

// Base UI's toolbar buttons stay focusable (roving tabindex) when disabled, so
// they signal disabled state via aria-disabled rather than the native
// attribute; toBeDisabled() only checks the latter.
function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

describe('ZoomableViewport', () => {
  it('renders zoom in, zoom out and reset controls at 100%', () => {
    renderViewport();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Zoom out' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset zoom' }),
    ).toBeInTheDocument();
    expect(zoomLevel()).toBe('1');
  });

  it('increases the zoom level when zooming in', async () => {
    const user = userEvent.setup();
    renderViewport();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(Number(zoomLevel())).toBeGreaterThan(1);
  });

  it('returns to 100% on reset', async () => {
    const user = userEvent.setup();
    renderViewport();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(zoomLevel()).toBe('1');
  });

  it('disables zoom out at the minimum', async () => {
    const user = userEvent.setup();
    renderViewport();
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    // 1 -> 0.8 -> 0.64 -> 0.5 (clamped); the fourth click reaches the floor.
    await user.click(zoomOut);
    await user.click(zoomOut);
    await user.click(zoomOut);
    await user.click(zoomOut);
    expect(isDisabled(zoomOut)).toBe(true);
  });

  it('does not clear the focal person when a toolbar button is clicked', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    renderViewport({ onBackgroundClick });
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});
