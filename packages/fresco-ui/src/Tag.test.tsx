import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Tag from './Tag';

describe('Tag', () => {
  it('exposes pressed filter state as a pressed button', () => {
    const onPressedChange = vi.fn();
    render(
      <Tag pressed onPressedChange={onPressedChange} color="neon-coral">
        Display media
      </Tag>,
    );

    const filter = screen.getByRole('button', { name: 'Display media' });
    expect(filter).toHaveAttribute('type', 'button');
    expect(filter).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(filter);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(<Tag onPressedChange={onPressedChange}>Display media</Tag>);

    const filter = screen.getByRole('button', { name: 'Display media' });
    expect(filter).toHaveAttribute('aria-pressed', 'false');

    filter.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPressedChange).toHaveBeenCalledTimes(2);
    expect(onPressedChange).toHaveBeenLastCalledWith(true);
  });

  it('does not fire when disabled', () => {
    const onPressedChange = vi.fn();
    render(
      <Tag onPressedChange={onPressedChange} disabled>
        Display media
      </Tag>,
    );

    const filter = screen.getByRole('button', { name: 'Display media' });
    expect(filter).toBeDisabled();
    fireEvent.click(filter);
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('renders a plain label without a button when not interactive', () => {
    render(
      <Tag data-testid="tag" title="Capability">
        Display media
      </Tag>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    const tag = screen.getByTestId('tag');
    expect(tag.tagName).toBe('DIV');
    expect(tag).toHaveAttribute('title', 'Capability');
  });

  it('shows a palette dot only when a colour is given', () => {
    const { container, rerender } = render(<Tag color="mustard">Edges</Tag>);
    const dot = container.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot?.style.getPropertyValue('--tag-dot')).toBe(
      'var(--color-mustard)',
    );

    rerender(<Tag>Edges</Tag>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('lets the pressed tone win over the light tone', () => {
    render(
      <Tag light pressed onPressedChange={vi.fn()}>
        Edges
      </Tag>,
    );

    const filter = screen.getByRole('button', { name: 'Edges' });
    expect(filter).toHaveClass('bg-text');
    expect(filter).not.toHaveClass('bg-platinum');
  });
});
