import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from './Badge';

describe('Badge', () => {
  it('renders an inline span with a pinned line-height', () => {
    render(<Badge data-testid="badge">Draft</Badge>);

    const badge = screen.getByTestId('badge');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('leading-tight');
    expect(badge).toHaveClass('[--badge-color:var(--neutral)]');
    expect(badge).toHaveClass('bg-(--badge-color)');
  });

  it('renders the icon before the label', () => {
    render(<Badge icon={<span data-testid="icon" />}>v1.2.3</Badge>);

    const icon = screen.getByTestId('icon');
    expect(icon.nextSibling).toHaveTextContent('v1.2.3');
  });

  it('renders through the element given to render', () => {
    const onClick = vi.fn();
    render(
      <Badge
        render={<button type="button" onClick={onClick} aria-label="update" />}
      >
        v1.2.3
      </Badge>,
    );

    const button = screen.getByRole('button', { name: 'update' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('rounded-full');
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('paints a palette colour inline so it wins over the tone', () => {
    render(
      <Badge data-testid="badge" tone="success" color="mustard">
        Text
      </Badge>,
    );

    const badge = screen.getByTestId('badge');
    expect(badge.style.getPropertyValue('--badge-color')).toBe(
      'var(--color-mustard)',
    );
    expect(badge.style.getPropertyValue('--badge-contrast')).toBe(
      'contrast-color(var(--badge-color))',
    );
  });

  it('lets a className custom property replace the tone', () => {
    render(
      <Badge
        data-testid="badge"
        tone="neutral"
        className="[--badge-color:var(--selected)]"
      >
        Zone
      </Badge>,
    );

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveClass('[--badge-color:var(--selected)]');
    expect(badge).not.toHaveClass('[--badge-color:var(--neutral)]');
  });

  it('tracks capitals only when uppercase', () => {
    const { rerender } = render(
      <Badge data-testid="badge" uppercase>
        News
      </Badge>,
    );
    expect(screen.getByTestId('badge')).toHaveClass('uppercase');
    expect(screen.getByTestId('badge')).toHaveClass('tracking-widest');

    rerender(<Badge data-testid="badge">News</Badge>);
    expect(screen.getByTestId('badge')).not.toHaveClass('uppercase');
    expect(screen.getByTestId('badge')).not.toHaveClass('tracking-widest');
  });
});
