import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Tag from './Tag';

describe('Tag', () => {
  it('exposes selected filter state as a pressed button', () => {
    const onClick = vi.fn();
    render(
      <Tag id="media" selected onClick={onClick} color="neon-coral">
        Display media
      </Tag>,
    );

    const filter = screen.getByRole('button', { name: 'Display media' });
    expect(filter).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(filter);
    expect(onClick).toHaveBeenCalledWith('media');
  });
});
