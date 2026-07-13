import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ExternalLink from './ExternalLink';

describe('ExternalLink', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);

  beforeEach(() => {
    open.mockClear();
  });

  it('uses the shared prose-link treatment and opens outside the app', () => {
    render(
      <ExternalLink href="https://documentation.networkcanvas.com">
        Documentation
      </ExternalLink>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });
    const dispatched = fireEvent.click(link);

    expect(link).toHaveClass('focusable', 'text-link', 'font-semibold');
    expect(dispatched).toBe(false);
    expect(open).toHaveBeenCalledWith(
      'https://documentation.networkcanvas.com',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('can leave presentation to a button-styled anchor', () => {
    render(
      <ExternalLink
        href="https://documentation.networkcanvas.com"
        className="bg-primary"
        unstyled
      >
        View documentation
      </ExternalLink>,
    );

    const link = screen.getByRole('link', { name: 'View documentation' });

    expect(link).toHaveClass('bg-primary');
    expect(link).not.toHaveClass('text-link');
    expect(link.firstElementChild).toBeNull();
  });
});
