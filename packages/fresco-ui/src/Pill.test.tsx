import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Pill from './Pill';

describe('Pill', () => {
  it('renders children with the monospace base class', () => {
    render(<Pill>v1.2.3</Pill>);
    const el = screen.getByText('v1.2.3');
    expect(el.className).toContain('font-monospace');
    expect(el.tagName).toBe('SPAN');
  });

  it('renders the icon before the label', () => {
    render(<Pill icon={<span data-testid="dot" />}>v1.2.3</Pill>);
    expect(screen.getByTestId('dot')).toBeInTheDocument();
  });

  it('renders as an accessible button when as="button"', async () => {
    const onClick = vi.fn();
    render(
      <Pill as="button" onClick={onClick} aria-label="update">
        v1.2.3
      </Pill>,
    );
    const button = screen.getByRole('button', { name: 'update' });
    expect(button).toHaveAttribute('type', 'button');
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
