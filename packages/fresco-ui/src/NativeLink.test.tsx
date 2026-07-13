import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NativeLink } from './NativeLink';

const RouterLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentPropsWithoutRef<'a'>, 'href'> & { to: string }
>(({ to, children, ...props }, ref) => (
  <a ref={ref} href={to} {...props}>
    {children}
  </a>
));

RouterLink.displayName = 'RouterLink';

describe('NativeLink', () => {
  it('renders an accessible native link with the animated label', () => {
    render(<NativeLink href="/docs">Documentation</NativeLink>);

    const link = screen.getByRole('link', { name: 'Documentation' });
    const label = link.firstElementChild;

    expect(link).toHaveAttribute('href', '/docs');
    expect(link).toHaveClass('focusable', 'text-link', 'font-semibold');
    expect(label).toHaveClass(
      'group-hover:bg-[length:100%_2px]',
      'group-focus-visible:bg-[length:100%_2px]',
    );
  });

  it('forwards refs, anchor props, and events', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    const onClick = vi.fn();

    render(
      <NativeLink
        ref={ref}
        href="https://example.com/file"
        target="_blank"
        rel="noreferrer"
        download
        data-testid="download"
        onClick={onClick}
      >
        Download
      </NativeLink>,
    );

    const link = screen.getByTestId('download');
    link.click();

    expect(ref.current).toBe(link);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAttribute('download');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('composes with router links without nesting anchors', () => {
    const ref = React.createRef<HTMLAnchorElement>();

    render(
      <NativeLink
        ref={ref}
        render={<RouterLink to="/docs" className="router-class" />}
        className="consumer-class"
      >
        Documentation
      </NativeLink>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).toHaveAttribute('href', '/docs');
    expect(link).toHaveClass('router-class', 'consumer-class', 'text-link');
    expect(ref.current).toBe(link);
  });
});
