import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ExternalLink from './ExternalLink';

describe('ExternalLink', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);

  beforeEach(() => {
    open.mockClear();
  });

  it('opens outside the app in a new tab without an opener', () => {
    render(
      <ExternalLink href="https://documentation.networkcanvas.com">
        Documentation
      </ExternalLink>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });
    const dispatched = fireEvent.click(link);

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
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

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Only the caller's classes: no prose-link styling of its own.
    expect(link).toHaveAttribute('class', 'bg-primary');
    expect(link.firstElementChild).toBeNull();
  });
});
