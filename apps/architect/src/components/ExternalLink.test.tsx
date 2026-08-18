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
      <div className="group/field">
        <ExternalLink href="https://documentation.networkcanvas.com">
          Documentation
        </ExternalLink>
      </div>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });
    const dispatched = fireEvent.click(link);

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass(
      'group/link',
      'focusable',
      'text-link',
      'font-semibold',
    );
    expect(link).not.toHaveClass('group');
    expect(link.firstElementChild).toHaveClass(
      'group-hover/link:bg-[length:100%_2px]',
      'group-focus-visible/link:bg-[length:100%_2px]',
    );
    expect(link.firstElementChild).not.toHaveClass(
      'group-hover:bg-[length:100%_2px]',
    );
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
    expect(link).toHaveClass('bg-primary');
    expect(link).not.toHaveClass('text-link');
    expect(link.firstElementChild).toBeNull();
  });
});
